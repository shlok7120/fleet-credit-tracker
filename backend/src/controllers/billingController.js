/**
 * Fortnightly invoicing.
 *
 * Builds the invoice for one client and one cycle, and emails it to them.
 * Cycle boundaries are always resolved in the pump's timezone — see
 * utils/billing.js for why that is not optional.
 */
import { query } from '../config/db.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { PUMP_TIMEZONE } from '../utils/time.js';
import { sendEmailDirect, emailConfigured } from '../utils/notifier.js';
import {
  PERIOD_PATTERN, currentPeriod, previousPeriod, periodBounds,
  periodLabel, recentPeriods, closedPeriodIfToday,
} from '../utils/billing.js';

const rupees = (n) =>
  '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Gather everything an invoice needs for one client and one cycle. */
export const buildInvoice = async (clientId, period) => {
  const bounds = periodBounds(period);

  const [clientRes, lineRes, pumpRes] = await Promise.all([
    query(
      `SELECT c.*, u.full_name AS manager_name, u.email AS manager_email
       FROM clients c
       LEFT JOIN users u ON u.user_id = c.manager_user_id
       WHERE c.client_id = $1`, [clientId]
    ),
    query(
      // Bounds are half-open [start, end) and built as local midnight in the
      // pump's timezone, so a fill at 00:30 on the 16th bills in H2 — not in
      // H1, which is what a naive UTC comparison would do.
      `SELECT v.license_plate, v.fuel,
              COUNT(t.txn_id)                   AS fills,
              COALESCE(SUM(t.volume_liters), 0) AS liters,
              COALESCE(SUM(t.total_cost), 0)    AS amount
       FROM vehicles v
       LEFT JOIN transactions t
         ON t.vehicle_id = v.vehicle_id
        AND t.txn_timestamp >= ($2::date)::timestamp AT TIME ZONE $4
        AND t.txn_timestamp <  ($3::date)::timestamp AT TIME ZONE $4
       WHERE v.client_id = $1
       GROUP BY v.vehicle_id, v.license_plate, v.fuel
       HAVING COUNT(t.txn_id) > 0
       ORDER BY amount DESC`,
      [clientId, bounds.start, bounds.end, PUMP_TIMEZONE]
    ),
    query('SELECT * FROM pump_settings WHERE id = 1'),
  ]);

  const client = clientRes.rows[0];
  if (!client) return null;

  const lines = lineRes.rows;
  const subtotal = lines.reduce((s, l) => s + Number(l.amount), 0);
  const totalLiters = lines.reduce((s, l) => s + Number(l.liters), 0);

  return {
    client,
    pump: pumpRes.rows[0] || {},
    period,
    period_label: periodLabel(period),
    period_start: bounds.start,
    period_end: bounds.end,          // exclusive
    lines,
    subtotal: Number(subtotal.toFixed(2)),
    total_liters: Number(totalLiters.toFixed(2)),
    total_fills: lines.reduce((s, l) => s + Number(l.fills), 0),
    // Where it would be emailed: the billing address if set, otherwise the
    // fleet manager's own login email.
    billing_email: client.billing_email || client.manager_email || null,
    generated_at: new Date().toISOString(),
  };
};

/* ------------------------------------------------------------------ read -- */

export const getInvoice = asyncHandler(async (req, res) => {
  const clientId = Number(req.params.id);
  const period = req.query.period || currentPeriod();

  if (!PERIOD_PATTERN.test(period)) {
    return res.status(400).json({ error: 'Period must look like 2026-09-H1.' });
  }
  if (req.user.role === 'manager') {
    const { rows } = await query(
      'SELECT 1 FROM clients WHERE client_id = $1 AND manager_user_id = $2',
      [clientId, req.user.userId]
    );
    if (!rows.length) return res.status(403).json({ error: 'You do not manage this client.' });
  }

  const invoice = await buildInvoice(clientId, period);
  if (!invoice) return res.status(404).json({ error: 'Client not found.' });

  const { rows: sent } = await query(
    `SELECT status, recipient, created_at FROM invoice_dispatches
     WHERE client_id = $1 AND period = $2`, [clientId, period]
  );

  res.json({
    ...invoice,
    periods: recentPeriods(8),
    dispatch: sent[0] || null,
    email_configured: emailConfigured(),
  });
});

/* ------------------------------------------------------------------ send -- */

export const renderEmail = (inv) => {
  const pumpName = inv.pump.pump_name || 'the pump';
  const rows = inv.lines.map((l) =>
    `  ${l.license_plate.padEnd(12)} ${String(l.fills).padStart(3)} fills  ` +
    `${Number(l.liters).toFixed(1).padStart(9)} L  ${rupees(l.amount).padStart(14)}`
  ).join('\n');

  return {
    subject: `Fuel invoice · ${inv.period_label} · ${inv.client.company_name}`,
    body:
`${inv.client.company_name}
Statement of account for ${inv.period_label}

${'-'.repeat(56)}
${rows}
${'-'.repeat(56)}

  Total volume       ${inv.total_liters.toFixed(1)} L across ${inv.total_fills} fills
  AMOUNT DUE         ${rupees(inv.subtotal)}

Account balance outstanding: ${rupees(inv.client.current_balance)}
Sanctioned credit limit:     ${rupees(inv.client.credit_limit)}

This statement is generated automatically from dispenser records for the
period ${inv.period_label}. Please raise any discrepancy within 7 days.

${pumpName}${inv.pump.oil_company ? `\nAuthorised dealer · ${inv.pump.oil_company}` : ''}${inv.pump.gstin ? `\nGSTIN ${inv.pump.gstin}` : ''}`,
  };
};

/**
 * Build, record and email one client's invoice for one cycle.
 * Shared by the manual "send now" button and the scheduled run.
 */
export const dispatchInvoice = async (clientId, period, sentBy = null) => {
  const inv = await buildInvoice(clientId, period);
  if (!inv) return { status: 'failed', error: 'Client not found.' };

  // Nothing fuelled in the fortnight means nothing to bill. Sending a zero
  // invoice trains clients to ignore the emails.
  if (inv.lines.length === 0) {
    return { status: 'skipped', error: 'No fuelling in this period.', company: inv.client.company_name };
  }
  if (!inv.billing_email) {
    return { status: 'skipped', error: 'No billing email for this client.', company: inv.client.company_name };
  }

  const { subject, body } = renderEmail(inv);

  // Claim the (client, period) slot first. The UNIQUE constraint makes a
  // second attempt fail here rather than send a duplicate invoice.
  let dispatchId;
  try {
    const { rows } = await query(
      `INSERT INTO invoice_dispatches
         (client_id, period, recipient, line_count, total_liters, subtotal, status, sent_by)
       VALUES ($1,$2,$3,$4,$5,$6,'queued',$7)
       RETURNING dispatch_id`,
      [clientId, period, inv.billing_email, inv.lines.length,
       inv.total_liters, inv.subtotal, sentBy]
    );
    dispatchId = rows[0].dispatch_id;
  } catch (err) {
    if (err.code === '23505') {
      return { status: 'skipped', error: 'Already sent for this period.', company: inv.client.company_name };
    }
    throw err;
  }

  if (!emailConfigured()) {
    await query(
      `UPDATE invoice_dispatches SET status = 'skipped',
         error = 'No email provider configured' WHERE dispatch_id = $1`, [dispatchId]
    );
    return { status: 'skipped', error: 'No email provider configured.',
             company: inv.client.company_name, subtotal: inv.subtotal };
  }

  try {
    await sendEmailDirect({ to: inv.billing_email, subject, body });
    await query(
      `UPDATE invoice_dispatches SET status = 'sent' WHERE dispatch_id = $1`, [dispatchId]
    );
    return { status: 'sent', company: inv.client.company_name,
             recipient: inv.billing_email, subtotal: inv.subtotal };
  } catch (err) {
    await query(
      `UPDATE invoice_dispatches SET status = 'failed', error = $2 WHERE dispatch_id = $1`,
      [dispatchId, String(err.message).slice(0, 500)]
    );
    return { status: 'failed', error: err.message, company: inv.client.company_name };
  }
};

export const sendInvoice = asyncHandler(async (req, res) => {
  const clientId = Number(req.params.id);
  const period = req.body?.period || req.query.period || currentPeriod();

  if (!PERIOD_PATTERN.test(period)) {
    return res.status(400).json({ error: 'Period must look like 2026-09-H1.' });
  }

  const result = await dispatchInvoice(clientId, period, req.user.userId);
  const code = result.status === 'sent' ? 200 : result.status === 'failed' ? 502 : 409;

  res.status(code).json({
    ...result,
    period,
    period_label: periodLabel(period),
    message:
      result.status === 'sent'   ? `Invoice for ${periodLabel(period)} emailed to ${result.recipient}.`
    : result.status === 'skipped' ? `Not sent — ${result.error}`
    : `Sending failed — ${result.error}`,
  });
});

/* ------------------------------------------------------------- scheduled -- */

/**
 * Run on the 1st and the 16th: email every client the fortnight that just
 * closed. Triggered by Vercel Cron once a day; on any other day it does
 * nothing and says so.
 *
 * Protected by CRON_SECRET — Vercel sends it as a bearer token. Without the
 * check, anyone who found the URL could fire invoices at your clients.
 */
export const runScheduledBilling = asyncHandler(async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const supplied = (req.headers.authorization || '').replace(/^Bearer /, '');
    if (supplied !== secret) return res.status(401).json({ error: 'Unauthorized.' });
  }

  // `force` lets an admin trigger the run manually from the UI on any day.
  const forced = req.query.period && PERIOD_PATTERN.test(req.query.period)
    ? req.query.period
    : null;
  const period = forced || closedPeriodIfToday();

  if (!period) {
    return res.json({
      ran: false,
      reason: 'Not a billing day. Invoices go out on the 1st and the 16th.',
      next_period: previousPeriod(currentPeriod()),
    });
  }

  const { rows: clients } = await query(
    'SELECT client_id FROM clients WHERE is_active ORDER BY client_id'
  );

  const results = [];
  for (const c of clients) {
    results.push(await dispatchInvoice(c.client_id, period, null));
  }

  const tally = results.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  console.log(`[billing] ${period}:`, JSON.stringify(tally));

  res.json({
    ran: true,
    period,
    period_label: periodLabel(period),
    clients: clients.length,
    tally,
    results,
  });
});

/** Recent dispatch history, for the admin billing screen. */
export const listDispatches = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT d.*, c.company_name
     FROM invoice_dispatches d
     JOIN clients c ON c.client_id = d.client_id
     ORDER BY d.created_at DESC LIMIT 60`
  );
  res.json({
    dispatches: rows,
    periods: recentPeriods(8),
    current_period: currentPeriod(),
    email_configured: emailConfigured(),
  });
});
