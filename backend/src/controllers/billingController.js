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

  const { rows: issued } = await query(
    `SELECT dispatch_id, invoice_no, status, recipient, issued_at, created_at, snapshot
     FROM invoice_dispatches WHERE client_id = $1 AND period = $2`, [clientId, period]
  );
  const record = issued[0];

  // Once an invoice has been issued, THAT document is the answer — not a fresh
  // calculation. Recomputing would let the figures drift away from what the
  // client was actually sent.
  if (record && record.snapshot && !record.snapshot.legacy) {
    const snap = record.snapshot;
    return res.json({
      issued: true,
      invoice_no: record.invoice_no,
      client: {
        client_id: clientId,
        company_name: snap.company_name,
        contact_person: snap.contact_person,
        credit_limit: snap.credit_limit_at_issue,
        current_balance: snap.balance_at_issue,
      },
      pump: snap.pump || {},
      period, period_label: snap.period_label,
      period_start: snap.period_start, period_end: snap.period_end,
      lines: snap.lines,
      subtotal: snap.subtotal,
      total_liters: snap.total_liters,
      total_fills: snap.total_fills,
      generated_at: snap.issued_at,
      periods: recentPeriods(8),
      dispatch: {
        status: record.status, recipient: record.recipient,
        created_at: record.created_at, invoice_no: record.invoice_no,
      },
      email_configured: emailConfigured(),
    });
  }

  // Not issued yet: a live preview of what this cycle currently totals.
  const invoice = await buildInvoice(clientId, period);
  if (!invoice) return res.status(404).json({ error: 'Client not found.' });

  res.json({
    ...invoice,
    issued: false,
    invoice_no: record?.invoice_no || null,
    periods: recentPeriods(8),
    dispatch: record
      ? { status: record.status, recipient: record.recipient, created_at: record.created_at }
      : null,
    email_configured: emailConfigured(),
  });
});

/* --------------------------------------------------------------- archive -- */

/**
 * Every invoice ever issued, across every client — admin only.
 * Filterable by client and by cycle.
 */
export const listInvoices = asyncHandler(async (req, res) => {
  const { client_id, period, status } = req.query;
  const limit = Math.min(Number(req.query.limit) || 100, 300);

  const { rows } = await query(
    `SELECT d.dispatch_id, d.invoice_no, d.client_id, d.period, d.recipient,
            d.line_count, d.total_liters, d.subtotal, d.status, d.error,
            d.issued_at, d.created_at,
            (d.snapshot ->> 'legacy') IS NOT NULL AS legacy,
            c.company_name,
            u.full_name AS issued_by
     FROM invoice_dispatches d
     JOIN clients c    ON c.client_id = d.client_id
     LEFT JOIN users u ON u.user_id   = d.sent_by
     WHERE ($1::int  IS NULL OR d.client_id = $1)
       AND ($2::text IS NULL OR d.period    = $2)
       AND ($3::text IS NULL OR d.status    = $3)
     ORDER BY d.created_at DESC
     LIMIT $4`,
    [client_id ? Number(client_id) : null, period || null, status || null, limit]
  );

  const totals = rows.reduce(
    (acc, r) => {
      acc.count += 1;
      acc.liters += Number(r.total_liters);
      acc.value += Number(r.subtotal);
      return acc;
    },
    { count: 0, liters: 0, value: 0 }
  );

  res.json({
    invoices: rows,
    totals: {
      count: totals.count,
      liters: Number(totals.liters.toFixed(2)),
      value: Number(totals.value.toFixed(2)),
    },
    periods: recentPeriods(12),
    current_period: currentPeriod(),
  });
});

/** One archived invoice, exactly as it was issued. */
export const getArchivedInvoice = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT d.*, c.company_name, u.full_name AS issued_by
     FROM invoice_dispatches d
     JOIN clients c    ON c.client_id = d.client_id
     LEFT JOIN users u ON u.user_id   = d.sent_by
     WHERE d.dispatch_id = $1`, [Number(req.params.id)]
  );
  const rec = rows[0];
  if (!rec) return res.status(404).json({ error: 'Invoice not found.' });

  // A manager may only open their own company's invoices.
  if (req.user.role === 'manager') {
    const { rows: own } = await query(
      'SELECT 1 FROM clients WHERE client_id = $1 AND manager_user_id = $2',
      [rec.client_id, req.user.userId]
    );
    if (!own.length) return res.status(403).json({ error: 'You do not manage this client.' });
  }

  res.json({
    invoice_no: rec.invoice_no,
    company_name: rec.company_name,
    period: rec.period,
    period_label: periodLabel(rec.period),
    status: rec.status,
    recipient: rec.recipient,
    error: rec.error,
    issued_at: rec.issued_at,
    issued_by: rec.issued_by,
    line_count: rec.line_count,
    total_liters: Number(rec.total_liters),
    subtotal: Number(rec.subtotal),
    snapshot: rec.snapshot,
    legacy: Boolean(rec.snapshot?.legacy),
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
Statement of account for ${inv.period_label}${inv.invoice_no ? `\nInvoice ${inv.invoice_no}` : ''}

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
/**
 * Issue one client's invoice for one cycle, archive it, and try to deliver it.
 *
 * Issuing and delivering are separate concerns. The invoice is written to the
 * archive with a full snapshot of its line items the moment it is issued —
 * whether or not email is configured, and whether or not delivery later
 * succeeds. An accounting record must exist regardless of whether the postman
 * turned up.
 *
 * The snapshot is what makes the record permanent. Recomputing an old invoice
 * from the transactions table would let it drift: deactivate a vehicle, correct
 * a fill, and last fortnight's figures quietly change into something the client
 * never received.
 */
export const dispatchInvoice = async (clientId, period, sentBy = null) => {
  const inv = await buildInvoice(clientId, period);
  if (!inv) return { status: 'failed', error: 'Client not found.' };

  // Nothing fuelled means there is no invoice to issue. Sending a zero invoice
  // only teaches clients to ignore the emails.
  if (inv.lines.length === 0) {
    return { status: 'skipped', error: 'No fuelling in this period.', company: inv.client.company_name };
  }

  const snapshot = {
    company_name: inv.client.company_name,
    contact_person: inv.client.contact_person,
    period: inv.period,
    period_label: inv.period_label,
    period_start: inv.period_start,
    period_end: inv.period_end,
    lines: inv.lines.map((l) => ({
      license_plate: l.license_plate,
      fuel: l.fuel,
      fills: Number(l.fills),
      liters: Number(l.liters),
      amount: Number(l.amount),
    })),
    total_liters: inv.total_liters,
    total_fills: inv.total_fills,
    subtotal: inv.subtotal,
    // The credit position as it stood at issue, not as it stands today.
    credit_limit_at_issue: Number(inv.client.credit_limit),
    balance_at_issue: Number(inv.client.current_balance),
    pump: {
      pump_name: inv.pump.pump_name,
      oil_company: inv.pump.oil_company,
      address: inv.pump.address,
      city: inv.pump.city,
      gstin: inv.pump.gstin,
    },
    issued_at: new Date().toISOString(),
  };

  // Claim the (client, period) slot. The UNIQUE constraint makes a repeated
  // run fail here rather than issue a second invoice for the same fortnight.
  let dispatchId;
  let invoiceNo;
  try {
    const { rows } = await query(
      `INSERT INTO invoice_dispatches
         (client_id, period, recipient, line_count, total_liters, subtotal,
          status, sent_by, snapshot, invoice_no)
       VALUES ($1,$2,$3,$4,$5,$6,'queued',$7,$8,
               'INV-' || LPAD(NEXTVAL('invoice_no_seq')::text, 6, '0'))
       RETURNING dispatch_id, invoice_no`,
      [clientId, period, inv.billing_email, inv.lines.length,
       inv.total_liters, inv.subtotal, sentBy, JSON.stringify(snapshot)]
    );
    dispatchId = rows[0].dispatch_id;
    invoiceNo = rows[0].invoice_no;
  } catch (err) {
    if (err.code === '23505') {
      return { status: 'skipped', error: 'Already issued for this period.',
               company: inv.client.company_name };
    }
    throw err;
  }

  const base = { company: inv.client.company_name, invoice_no: invoiceNo,
                 subtotal: inv.subtotal, dispatch_id: dispatchId };

  // From here the invoice exists and is archived. Only delivery can still fail.
  if (!inv.billing_email) {
    await query(
      `UPDATE invoice_dispatches SET status = 'skipped',
         error = 'No billing email for this client' WHERE dispatch_id = $1`, [dispatchId]
    );
    return { ...base, status: 'skipped', error: 'Issued, but no billing email to send it to.' };
  }

  if (!emailConfigured()) {
    await query(
      `UPDATE invoice_dispatches SET status = 'skipped',
         error = 'No email provider configured' WHERE dispatch_id = $1`, [dispatchId]
    );
    return { ...base, status: 'skipped', error: 'Issued, but no email provider configured.' };
  }

  const { subject, body } = renderEmail(inv);
  try {
    await sendEmailDirect({ to: inv.billing_email, subject, body });
    await query(`UPDATE invoice_dispatches SET status = 'sent' WHERE dispatch_id = $1`, [dispatchId]);
    return { ...base, status: 'sent', recipient: inv.billing_email };
  } catch (err) {
    await query(
      `UPDATE invoice_dispatches SET status = 'failed', error = $2 WHERE dispatch_id = $1`,
      [dispatchId, String(err.message).slice(0, 500)]
    );
    return { ...base, status: 'failed', error: err.message };
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
  // Fail CLOSED. An earlier version skipped the check whenever CRON_SECRET was
  // unset, which meant a missing or misspelled variable in production silently
  // published an endpoint that emails every client. A security control whose
  // absence disables the control is not a control.
  //
  // Deployed and unconfigured  -> refuse outright (503)
  // Deployed and configured    -> require the bearer token
  // Local development          -> open, so the run can be exercised by hand
  const secret = process.env.CRON_SECRET;
  const deployed = Boolean(process.env.VERCEL) || process.env.NODE_ENV === 'production';

  if (deployed) {
    if (!secret) {
      return res.status(503).json({
        error: 'Scheduled billing is not configured. Set CRON_SECRET on this project and redeploy.',
      });
    }
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
