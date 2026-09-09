/**
 * The signed-in user's own profile: identity, contact details, avatar,
 * password, and which notifications they want.
 *
 * Every handler works on req.user.userId — never on an id from the request
 * body — so there is no way to edit somebody else's profile by guessing.
 */
import bcrypt from 'bcryptjs';
import { query } from '../config/db.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { notifyUser, providerStatus } from '../utils/notifier.js';

const PROFILE_COLUMNS = `
  user_id, username, full_name, designation, role, email, phone, avatar,
  notify_email, notify_sms, notify_events, is_active, created_at`;

/** Avatars arrive as data URLs. Anything else is refused. */
const MAX_AVATAR_BYTES = 400 * 1024;
const AVATAR_PATTERN = /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/;

const validateAvatar = (avatar) => {
  if (avatar === null || avatar === undefined || avatar === '') return null;
  if (typeof avatar !== 'string' || !AVATAR_PATTERN.test(avatar)) {
    throw Object.assign(new Error('Avatar must be a PNG, JPEG or WebP data URL.'),
      { status: 400, expose: true });
  }
  // base64 inflates by ~4/3; compare against the decoded size.
  const bytes = Math.floor((avatar.length - avatar.indexOf(',') - 1) * 0.75);
  if (bytes > MAX_AVATAR_BYTES) {
    throw Object.assign(new Error('Image is too large. Please use one under 400 KB.'),
      { status: 413, expose: true });
  }
  return avatar;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Indian mobile numbers, with or without +91 / spaces / dashes.
const PHONE_PATTERN = /^\+?[0-9][0-9\s-]{7,17}$/;

export const getProfile = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT ${PROFILE_COLUMNS} FROM users WHERE user_id = $1`, [req.user.userId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Profile not found.' });
  res.json({ profile: rows[0], delivery: providerStatus() });
});

export const updateProfile = asyncHandler(async (req, res) => {
  const {
    full_name, designation, email, phone, avatar,
    notify_email, notify_sms, notify_events,
  } = req.body;

  if (full_name !== undefined && !String(full_name).trim()) {
    return res.status(400).json({ error: 'Name cannot be empty.' });
  }
  if (email) {
    if (!EMAIL_PATTERN.test(String(email).trim())) {
      return res.status(400).json({ error: 'That does not look like a valid email address.' });
    }
  }
  if (phone && !PHONE_PATTERN.test(String(phone).trim())) {
    return res.status(400).json({ error: 'That does not look like a valid phone number.' });
  }

  const cleanAvatar = avatar === undefined ? undefined : validateAvatar(avatar);

  const { rows } = await query(
    `UPDATE users SET
       full_name     = COALESCE($2, full_name),
       designation   = COALESCE($3, designation),
       email         = COALESCE($4, email),
       phone         = COALESCE($5, phone),
       avatar        = CASE WHEN $6::boolean THEN $7 ELSE avatar END,
       notify_email  = COALESCE($8, notify_email),
       notify_sms    = COALESCE($9, notify_sms),
       notify_events = COALESCE($10, notify_events),
       updated_at    = NOW()
     WHERE user_id = $1
     RETURNING ${PROFILE_COLUMNS}`,
    [
      req.user.userId,
      full_name === undefined ? null : String(full_name).trim(),
      designation === undefined ? null : String(designation).trim() || null,
      email === undefined ? null : String(email).trim().toLowerCase() || null,
      phone === undefined ? null : String(phone).trim() || null,
      cleanAvatar !== undefined,           // was avatar part of this request?
      cleanAvatar ?? null,                 // …and what should it become
      notify_email === undefined ? null : Boolean(notify_email),
      notify_sms === undefined ? null : Boolean(notify_sms),
      notify_events === undefined ? null : JSON.stringify(notify_events),
    ]
  );

  if (!rows[0]) return res.status(404).json({ error: 'Profile not found.' });
  res.json({ profile: rows[0] });
});

export const changePassword = asyncHandler(async (req, res) => {
  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Both the current and new password are required.' });
  }
  if (String(new_password).length < 8) {
    return res.status(400).json({ error: 'The new password must be at least 8 characters.' });
  }

  const { rows } = await query('SELECT password_hash FROM users WHERE user_id = $1',
    [req.user.userId]);
  if (!rows[0]) return res.status(404).json({ error: 'Profile not found.' });

  // Proving knowledge of the current password is what stops a borrowed,
  // still-signed-in browser from being turned into a permanent takeover.
  const ok = await bcrypt.compare(current_password, rows[0].password_hash);
  if (!ok) return res.status(401).json({ error: 'Your current password is incorrect.' });

  await query('UPDATE users SET password_hash = $2, updated_at = NOW() WHERE user_id = $1',
    [req.user.userId, await bcrypt.hash(new_password, 10)]);

  res.json({ message: 'Password updated.' });
});

/** The delivery log, so the admin can see what actually went out. */
export const listNotifications = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT notification_id, channel, event, recipient, subject,
            status, error, created_at, sent_at
     FROM notifications
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 40`, [req.user.userId]
  );
  res.json({ notifications: rows, delivery: providerStatus() });
});

/** Sends a real message through the configured providers, to yourself. */
export const sendTestNotification = asyncHandler(async (req, res) => {
  const { rows } = await query(
    'SELECT full_name, email, phone, notify_email, notify_sms FROM users WHERE user_id = $1',
    [req.user.userId]
  );
  const me = rows[0];
  if (!me) return res.status(404).json({ error: 'Profile not found.' });

  if (!(me.notify_email && me.email) && !(me.notify_sms && me.phone)) {
    return res.status(400).json({
      error: 'Add an email address or phone number and enable a channel first.',
    });
  }

  const { rows: s } = await query('SELECT pump_name FROM pump_settings WHERE id = 1');
  const pump = s[0]?.pump_name || 'your pump';

  // Deliberately bypasses the per-event preference filter: a test that stayed
  // silent because a checkbox was off would be indistinguishable from a broken
  // provider, which is the confusion this button exists to settle.
  const result = await notifyUser(req.user.userId, 'test', {
    subject: `Test notification — ${pump}`,
    body: `Hello ${me.full_name},\n\nThis is a test from the ${pump} fleet credit tracker. `
        + `If you are reading this, notifications are working.\n\n— FleetCredit`,
    sms: `${pump}: test notification. Alerts are working.`,
  });

  res.json({
    message: `Test queued to ${result.queued} destination(s). Check the delivery log below.`,
    ...result,
  });
});
