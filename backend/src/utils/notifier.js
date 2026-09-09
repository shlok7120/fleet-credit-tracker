/**
 * Notification dispatch.
 *
 * Design rules:
 *
 * 1. EVERY message is written to the notifications table before any provider
 *    is called. So there is always an auditable record of what the system
 *    decided to send, even when nothing is configured — those rows land as
 *    'skipped' rather than vanishing.
 *
 * 2. Sending NEVER blocks the thing that triggered it. An attendant logging a
 *    fill must not wait on an email API, and must not see an error if that API
 *    is down. Failures are recorded, not thrown.
 *
 * 3. Providers are chosen from environment variables and talked to over plain
 *    fetch. No SDKs, so nothing is added to the serverless bundle and swapping
 *    provider is an env change rather than a rewrite.
 */
import { query } from '../config/db.js';

/* ------------------------------------------------------------ providers -- */

const emailProvider = () => {
  if (process.env.RESEND_API_KEY) return 'resend';
  if (process.env.BREVO_API_KEY) return 'brevo';
  return null;
};

const smsProvider = () => {
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) return 'twilio';
  if (process.env.MSG91_AUTH_KEY) return 'msg91';
  return null;
};

/** What the admin UI shows about delivery configuration. */
export const providerStatus = () => ({
  email: { provider: emailProvider(), configured: Boolean(emailProvider()),
           from: process.env.NOTIFY_FROM_EMAIL || null },
  sms:   { provider: smsProvider(),   configured: Boolean(smsProvider()),
           from: process.env.NOTIFY_FROM_SMS || null },
});

async function sendEmail({ to, subject, body }) {
  const provider = emailProvider();
  const from = process.env.NOTIFY_FROM_EMAIL;
  if (!provider) throw new Error('No email provider configured');
  if (!from) throw new Error('NOTIFY_FROM_EMAIL is not set');

  if (provider === 'resend') {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: [to], subject, text: body }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return;
  }

  // Brevo (formerly Sendinblue) — widely used in India, 300 free emails/day.
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'Content-Type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { email: from, name: process.env.NOTIFY_FROM_NAME || 'FleetCredit' },
      to: [{ email: to }],
      subject,
      textContent: body,
    }),
  });
  if (!res.ok) throw new Error(`Brevo ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

async function sendSms({ to, body }) {
  const provider = smsProvider();
  if (!provider) throw new Error('No SMS provider configured');

  if (provider === 'twilio') {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: process.env.NOTIFY_FROM_SMS, Body: body }),
    });
    if (!res.ok) throw new Error(`Twilio ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return;
  }

  // MSG91 — India-focused, handles the DLT template registration that TRAI
  // requires for any commercial SMS to an Indian number.
  const res = await fetch('https://control.msg91.com/api/v5/flow/', {
    method: 'POST',
    headers: {
      authkey: process.env.MSG91_AUTH_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      template_id: process.env.MSG91_TEMPLATE_ID,
      recipients: [{ mobiles: to.replace(/\D/g, ''), MESSAGE: body }],
    }),
  });
  if (!res.ok) throw new Error(`MSG91 ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

/* --------------------------------------------------------------- events -- */

const trim = (s, n) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Deliver one message to one already-resolved user. */
async function deliverTo(user, event, { subject, body, sms }) {
  const jobs = [];
  if (user.notify_email && user.email) {
    jobs.push({ channel: 'email', to: user.email, text: body });
  }
  if (user.notify_sms && user.phone) {
    jobs.push({ channel: 'sms', to: user.phone, text: sms || trim(body, 300) });
  }

  let queued = 0;

  for (const job of jobs) {
    // Record first, deliver second — a crash mid-send still leaves a trail.
    let id;
    try {
      const { rows } = await query(
        `INSERT INTO notifications (user_id, channel, event, recipient, subject, body, status)
         VALUES ($1,$2,$3,$4,$5,$6,'queued') RETURNING notification_id`,
        [user.user_id, job.channel, event, job.to, subject, job.text]
      );
      id = rows[0].notification_id;
      queued += 1;
    } catch (err) {
      console.warn('[notify] could not record notification:', err.message);
      continue;
    }

    const configured = job.channel === 'email' ? emailProvider() : smsProvider();
    if (!configured) {
      await query(
        `UPDATE notifications SET status = 'skipped',
           error = 'No provider configured for this channel'
         WHERE notification_id = $1`, [id]
      ).catch(() => {});
      continue;
    }

    try {
      if (job.channel === 'email') await sendEmail({ to: job.to, subject, body: job.text });
      else await sendSms({ to: job.to, body: job.text });

      await query(
        `UPDATE notifications SET status = 'sent', sent_at = NOW() WHERE notification_id = $1`,
        [id]
      );
    } catch (err) {
      await query(
        `UPDATE notifications SET status = 'failed', error = $2 WHERE notification_id = $1`,
        [id, String(err.message).slice(0, 500)]
      ).catch(() => {});
      console.warn(`[notify] ${job.channel} failed:`, err.message);
    }
  }

  return queued;
}

/**
 * Fan a single event out to every user who has opted into it.
 *
 * @param {string} event         key inside users.notify_events
 * @param {object} msg           { subject, body, sms }
 * @param {string[]} roles       which roles should receive it
 */
export const notify = async (event, msg, roles = ['admin']) => {
  let recipients = [];
  try {
    const { rows } = await query(
      `SELECT user_id, full_name, email, phone, notify_email, notify_sms
       FROM users
       WHERE is_active
         AND role = ANY($1::user_role[])
         AND COALESCE((notify_events ->> $2)::boolean, FALSE)`,
      [roles, event]
    );
    recipients = rows;
  } catch (err) {
    console.warn('[notify] could not resolve recipients:', err.message);
    return { queued: 0 };
  }

  let queued = 0;
  for (const user of recipients) queued += await deliverTo(user, event, msg);
  return { queued };
};

/**
 * Deliver to one specific user, ignoring their per-event preferences.
 *
 * Used for the "send test" button: a test that silently respected an
 * unchecked preference would be indistinguishable from a broken provider,
 * which is exactly the confusion the button exists to resolve.
 */
export const notifyUser = async (userId, event, msg) => {
  const { rows } = await query(
    `SELECT user_id, full_name, email, phone, notify_email, notify_sms
     FROM users WHERE user_id = $1 AND is_active`, [userId]
  );
  if (!rows[0]) return { queued: 0 };
  return { queued: await deliverTo(rows[0], event, msg) };
};

/**
 * Fire and forget. The caller is a request handler that must return promptly;
 * a slow or broken provider is not the attendant's problem.
 */
export const notifyAsync = (...args) => {
  notify(...args).catch((err) => console.warn('[notify] unhandled:', err.message));
};
