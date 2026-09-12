/**
 * Payments received from corporate clients.
 *
 * Two rules shape this file:
 *
 * 1. Recording a payment and reducing the client's balance happen in ONE SQL
 *    transaction. Either the money is both recorded and credited, or neither.
 *    A payment that reduced a balance without leaving a record is precisely
 *    the hole this table exists to close.
 *
 * 2. A payment is never deleted. A mis-keyed amount is REVERSED, which credits
 *    the balance back and leaves both entries visible. "This was a mistake" is
 *    itself part of the financial record, and silently deleting it would make
 *    the ledger disagree with the bank statement it is reconciled against.
 */
import { query, withTransaction } from '../config/db.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const METHODS = ['cash', 'cheque', 'neft', 'rtgs', 'upi', 'other'];

const SELECT_COLUMNS = `
  p.payment_id, p.client_id, p.amount, p.method, p.reference,
  p.received_on, p.note, p.created_at,
  p.reversed_at, p.reversal_reason,
  u.full_name  AS recorded_by,
  r.full_name  AS reversed_by,
  c.company_name`;

const FROM_JOINS = `
  FROM payments p
  JOIN clients c    ON c.client_id = p.client_id
  LEFT JOIN users u ON u.user_id   = p.recorded_by
  LEFT JOIN users r ON r.user_id   = p.reversed_by`;

/** A manager may only touch their own company's payments. */
const managerOwns = async (userId, clientId) => {
  const { rows } = await query(
    'SELECT 1 FROM clients WHERE client_id = $1 AND manager_user_id = $2',
    [clientId, userId]
  );
  return rows.length > 0;
};

/* ------------------------------------------------------------------ read -- */

export const listPayments = asyncHandler(async (req, res) => {
  const { client_id, method, from, to } = req.query;
  const limit = Math.min(Number(req.query.limit) || 100, 300);

  // This handler serves both /payments?client_id=N and /clients/:id/payments.
  // The path parameter wins — a route that names a client in its URL must not
  // quietly return every client's payments.
  let scopedClient = req.params.id
    ? Number(req.params.id)
    : (client_id ? Number(client_id) : null);

  if (req.user.role === 'manager') {
    const { rows } = await query(
      'SELECT client_id FROM clients WHERE manager_user_id = $1', [req.user.userId]
    );
    if (!rows.length) {
      return res.json({ payments: [], totals: { count: 0, amount: 0, reversed: 0 }, methods: METHODS });
    }
    const own = rows[0].client_id;

    // Asking for someone else's payments is refused outright, the same as every
    // other /clients/:id route. Quietly substituting their own data would be
    // safe but misleading — the caller would believe they were reading the
    // client they named.
    if (scopedClient && scopedClient !== own) {
      return res.status(403).json({ error: 'You do not manage this client.' });
    }
    scopedClient = own;
  }

  const { rows } = await query(
    `SELECT ${SELECT_COLUMNS} ${FROM_JOINS}
     WHERE ($1::int  IS NULL OR p.client_id   = $1)
       AND ($2::text IS NULL OR p.method      = $2)
       AND ($3::date IS NULL OR p.received_on >= $3)
       AND ($4::date IS NULL OR p.received_on <= $4)
     ORDER BY p.received_on DESC, p.payment_id DESC
     LIMIT $5`,
    [scopedClient, method || null, from || null, to || null, limit]
  );

  // Reversed entries are shown but excluded from the total, so the figure
  // always matches the money actually received.
  const active = rows.filter((p) => !p.reversed_at);
  res.json({
    payments: rows,
    totals: {
      count: active.length,
      amount: Number(active.reduce((s, p) => s + Number(p.amount), 0).toFixed(2)),
      reversed: rows.length - active.length,
    },
    methods: METHODS,
  });
});

/* ----------------------------------------------------------------- write -- */

export const recordPayment = asyncHandler(async (req, res) => {
  const clientId = Number(req.params.id);
  const { amount, method = 'cash', reference, received_on, note } = req.body;

  const value = Number(amount);
  if (!value || value <= 0) {
    return res.status(400).json({ error: 'Enter a payment amount greater than zero.' });
  }
  if (!METHODS.includes(method)) {
    return res.status(400).json({ error: `Method must be one of: ${METHODS.join(', ')}` });
  }
  if (received_on && Number.isNaN(Date.parse(received_on))) {
    return res.status(400).json({ error: 'That is not a valid date.' });
  }
  // A payment dated in the future is almost always a typo in the year.
  if (received_on && new Date(received_on) > new Date(Date.now() + 86400000)) {
    return res.status(400).json({ error: 'A payment cannot be dated in the future.' });
  }

  const { rows: found } = await query(
    'SELECT company_name, current_balance FROM clients WHERE client_id = $1 AND is_active',
    [clientId]
  );
  if (!found[0]) return res.status(404).json({ error: 'Client not found.' });

  const owed = Number(found[0].current_balance);

  const result = await withTransaction(async (db) => {
    const { rows } = await db.query(
      `INSERT INTO payments
         (client_id, amount, method, reference, received_on, note, recorded_by)
       VALUES ($1,$2,$3,$4,COALESCE($5::date, CURRENT_DATE),$6,$7)
       RETURNING payment_id, amount, method, reference, received_on, created_at`,
      [clientId, value, method, reference || null, received_on || null,
       note || null, req.user.userId]
    );

    const { rows: updated } = await db.query(
      `UPDATE clients SET current_balance = GREATEST(current_balance - $2, 0)
       WHERE client_id = $1 RETURNING current_balance, credit_limit`,
      [clientId, value]
    );

    return { payment: rows[0], client: updated[0] };
  });

  // An overpayment is allowed — clients do pay in round numbers — but it is
  // worth saying so rather than silently clamping the balance to zero.
  const overpaid = value > owed ? Number((value - owed).toFixed(2)) : 0;

  res.status(201).json({
    ...result,
    message: overpaid > 0
      ? `Payment recorded. That is ₹${overpaid.toFixed(2)} more than was outstanding — the balance is now zero.`
      : 'Payment recorded.',
    overpaid,
  });
});

export const reversePayment = asyncHandler(async (req, res) => {
  const paymentId = Number(req.params.id);
  const { reason } = req.body;

  if (!reason || !String(reason).trim()) {
    return res.status(400).json({ error: 'Give a reason for the reversal.' });
  }

  const { rows: found } = await query(
    'SELECT client_id, amount, reversed_at FROM payments WHERE payment_id = $1',
    [paymentId]
  );
  const payment = found[0];
  if (!payment) return res.status(404).json({ error: 'Payment not found.' });
  if (payment.reversed_at) {
    return res.status(409).json({ error: 'That payment has already been reversed.' });
  }

  const result = await withTransaction(async (db) => {
    await db.query(
      `UPDATE payments SET reversed_at = NOW(), reversed_by = $2, reversal_reason = $3
       WHERE payment_id = $1`,
      [paymentId, req.user.userId, String(reason).trim()]
    );
    // Reversing puts the debt back.
    const { rows } = await db.query(
      `UPDATE clients SET current_balance = current_balance + $2
       WHERE client_id = $1 RETURNING company_name, current_balance`,
      [payment.client_id, payment.amount]
    );
    return rows[0];
  });

  res.json({
    message: `Payment of ₹${Number(payment.amount).toFixed(2)} reversed. `
           + `${result.company_name} now owes ₹${Number(result.current_balance).toFixed(2)}.`,
    client: result,
  });
});

/* ------------------------------------------------------------- statement -- */

/**
 * A statement of account for one client over a date range: what they were
 * billed, what they paid, and where that leaves them.
 */
export const clientStatement = asyncHandler(async (req, res) => {
  const clientId = Number(req.params.id);

  if (req.user.role === 'manager' && !(await managerOwns(req.user.userId, clientId))) {
    return res.status(403).json({ error: 'You do not manage this client.' });
  }

  const to = req.query.to || new Date().toISOString().slice(0, 10);
  const from = req.query.from
    || new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);

  const [client, fuelled, paid, recent] = await Promise.all([
    query('SELECT * FROM clients WHERE client_id = $1', [clientId]),
    query(
      `SELECT COALESCE(SUM(t.total_cost), 0)    AS billed,
              COALESCE(SUM(t.volume_liters), 0) AS liters,
              COUNT(t.txn_id)                   AS fills
       FROM transactions t
       JOIN vehicles v ON v.vehicle_id = t.vehicle_id
       WHERE v.client_id = $1
         AND (t.txn_timestamp AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $2 AND $3`,
      [clientId, from, to]
    ),
    query(
      `SELECT COALESCE(SUM(amount), 0) AS received, COUNT(*) AS count
       FROM payments
       WHERE client_id = $1 AND reversed_at IS NULL
         AND received_on BETWEEN $2 AND $3`,
      [clientId, from, to]
    ),
    query(
      `SELECT ${SELECT_COLUMNS} ${FROM_JOINS}
       WHERE p.client_id = $1
       ORDER BY p.received_on DESC, p.payment_id DESC LIMIT 20`,
      [clientId]
    ),
  ]);

  if (!client.rows[0]) return res.status(404).json({ error: 'Client not found.' });

  const billed = Number(fuelled.rows[0].billed);
  const received = Number(paid.rows[0].received);

  res.json({
    client: client.rows[0],
    from,
    to,
    billed,
    liters: Number(fuelled.rows[0].liters),
    fills: Number(fuelled.rows[0].fills),
    received,
    net: Number((billed - received).toFixed(2)),
    current_balance: Number(client.rows[0].current_balance),
    available_credit: Number(client.rows[0].credit_limit) - Number(client.rows[0].current_balance),
    payments: recent.rows,
  });
});
