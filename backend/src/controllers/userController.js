/**
 * Staff account management — admin only.
 *
 * Creating and removing the people who can sign in: attendants at the pump,
 * fleet managers for each corporate client, and other admins.
 *
 * Accounts are deactivated, never deleted. A user is referenced by every
 * transaction they logged; deleting the row would either destroy that history
 * or leave transactions with no attendant. `is_active = FALSE` blocks sign-in
 * while keeping the ledger intact.
 */
import bcrypt from 'bcryptjs';
import { query, withTransaction } from '../config/db.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const ROLES = ['admin', 'manager', 'attendant'];
const USERNAME_PATTERN = /^[a-z0-9_]{3,50}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_PATTERN = /^\+?[0-9][0-9\s-]{7,17}$/;

const LIST_COLUMNS = `
  u.user_id, u.username, u.full_name, u.designation, u.role, u.email,
  u.phone, u.avatar, u.is_active, u.created_at`;

const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });

/** How many admins could still sign in if this one were removed or demoted? */
const otherActiveAdmins = async (excludingUserId) => {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS n FROM users
     WHERE role = 'admin' AND is_active AND user_id <> $1`, [excludingUserId]
  );
  return rows[0].n;
};

export const listUsers = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT ${LIST_COLUMNS},
            c.client_id,
            c.company_name,
            COUNT(t.txn_id)::int AS txn_count
     FROM users u
     LEFT JOIN clients c      ON c.manager_user_id = u.user_id AND c.is_active
     LEFT JOIN transactions t ON t.attendant_id    = u.user_id
     GROUP BY u.user_id, c.client_id, c.company_name
     ORDER BY u.is_active DESC,
              CASE u.role WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 ELSE 3 END,
              u.full_name`
  );
  res.json(rows);
});

export const createUser = asyncHandler(async (req, res) => {
  const { username, password, full_name, role, designation, email, phone, client_id } = req.body;

  if (!username || !password || !full_name || !role) {
    return bad(res, 'Username, password, full name and role are all required.');
  }
  const uname = String(username).toLowerCase().trim();
  if (!USERNAME_PATTERN.test(uname)) {
    return bad(res, 'Username must be 3–50 characters: lowercase letters, numbers or underscore.');
  }
  if (!ROLES.includes(role)) return bad(res, `Role must be one of: ${ROLES.join(', ')}`);
  if (String(password).length < 8) return bad(res, 'Password must be at least 8 characters.');
  if (email && !EMAIL_PATTERN.test(String(email).trim())) {
    return bad(res, 'That does not look like a valid email address.');
  }
  if (phone && !PHONE_PATTERN.test(String(phone).trim())) {
    return bad(res, 'That does not look like a valid phone number.');
  }

  const created = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO users (username, full_name, password_hash, role, designation, email, phone)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING user_id, username, full_name, designation, role, email, phone, is_active, created_at`,
      [
        uname, String(full_name).trim(), await bcrypt.hash(password, 10), role,
        designation ? String(designation).trim() : null,
        email ? String(email).trim().toLowerCase() : null,
        phone ? String(phone).trim() : null,
      ]
    );
    const user = rows[0];

    // A manager is only useful once they own a fleet, so allow the link to be
    // made in the same breath rather than as a separate forgettable step.
    if (role === 'manager' && client_id) {
      await client.query(
        'UPDATE clients SET manager_user_id = $1 WHERE client_id = $2', [user.user_id, client_id]
      );
    }
    return user;
  });

  res.status(201).json(created);
});

export const updateUser = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { full_name, designation, email, phone, role, is_active } = req.body;

  const { rows: existing } = await query(
    'SELECT user_id, role, is_active FROM users WHERE user_id = $1', [id]
  );
  if (!existing[0]) return bad(res, 'User not found.', 404);

  // Two ways to lock everyone out of the admin panel, both blocked here.
  const losingAdmin =
    (existing[0].role === 'admin' && role && role !== 'admin') ||
    (existing[0].role === 'admin' && is_active === false);

  if (losingAdmin && (await otherActiveAdmins(id)) === 0) {
    return bad(res, 'This is the only active admin. Promote another admin first.', 409);
  }
  if (id === req.user.userId && is_active === false) {
    return bad(res, 'You cannot deactivate your own account.', 409);
  }
  if (id === req.user.userId && role && role !== 'admin') {
    return bad(res, 'You cannot change your own role.', 409);
  }
  if (role && !ROLES.includes(role)) return bad(res, `Role must be one of: ${ROLES.join(', ')}`);
  if (email && !EMAIL_PATTERN.test(String(email).trim())) {
    return bad(res, 'That does not look like a valid email address.');
  }

  const { rows } = await query(
    `UPDATE users SET
       full_name   = COALESCE($2, full_name),
       designation = COALESCE($3, designation),
       email       = COALESCE($4, email),
       phone       = COALESCE($5, phone),
       role        = COALESCE($6, role),
       is_active   = COALESCE($7, is_active),
       updated_at  = NOW()
     WHERE user_id = $1
     RETURNING ${LIST_COLUMNS.replaceAll('u.', '')}`,
    [
      id,
      full_name === undefined ? null : String(full_name).trim(),
      designation === undefined ? null : String(designation).trim() || null,
      email === undefined ? null : String(email).trim().toLowerCase() || null,
      phone === undefined ? null : String(phone).trim() || null,
      role ?? null,
      is_active === undefined ? null : Boolean(is_active),
    ]
  );
  res.json(rows[0]);
});

/** Admin password reset — deliberately does not require the old password. */
export const resetPassword = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { new_password } = req.body;

  if (!new_password || String(new_password).length < 8) {
    return bad(res, 'The new password must be at least 8 characters.');
  }

  const { rows } = await query(
    `UPDATE users SET password_hash = $2, updated_at = NOW()
     WHERE user_id = $1 RETURNING username`,
    [id, await bcrypt.hash(new_password, 10)]
  );
  if (!rows[0]) return bad(res, 'User not found.', 404);

  res.json({ message: `Password reset for ${rows[0].username}.` });
});

export const deactivateUser = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);

  if (id === req.user.userId) {
    return bad(res, 'You cannot deactivate your own account.', 409);
  }

  const { rows: existing } = await query(
    'SELECT role, is_active FROM users WHERE user_id = $1', [id]
  );
  if (!existing[0]) return bad(res, 'User not found.', 404);

  if (existing[0].role === 'admin' && (await otherActiveAdmins(id)) === 0) {
    return bad(res, 'This is the only active admin. Promote another admin first.', 409);
  }

  const { rows } = await query(
    `UPDATE users SET is_active = FALSE, updated_at = NOW()
     WHERE user_id = $1 RETURNING user_id, username, full_name`, [id]
  );

  // A fleet with no manager is invisible to its own company, so say so rather
  // than letting the admin discover it later.
  const { rows: orphaned } = await query(
    'SELECT company_name FROM clients WHERE manager_user_id = $1 AND is_active', [id]
  );

  res.json({
    message: `${rows[0].full_name} can no longer sign in.`,
    user: rows[0],
    orphaned_clients: orphaned.map((c) => c.company_name),
  });
});
