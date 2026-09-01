/**
 * Transactions — the heart of the system.
 *
 * Logging a fuelling does four things atomically:
 *   1. validates the vehicle and the client's remaining credit
 *   2. asks the Python ML service whether this looks fraudulent
 *   3. inserts the transaction row (with the fraud verdict)
 *   4. increases what the client owes
 *
 * Steps 3 and 4 run inside a single SQL transaction: it is never possible to
 * record fuel without also billing for it, even if the server crashes midway.
 */
import { query, withTransaction } from '../config/db.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { scoreTransaction } from '../utils/mlClient.js';

export const listTransactions = asyncHandler(async (req, res) => {
  const { client_id, vehicle_id, flagged, limit = 100 } = req.query;
  const isManager = req.user.role === 'manager';

  const { rows } = await query(
    `SELECT t.txn_id, t.volume_liters, t.price_per_liter, t.total_cost,
            t.odometer_km, t.is_flagged, t.fraud_score, t.flag_reason,
            t.txn_timestamp,
            v.vehicle_id, v.license_plate, v.fuel,
            c.client_id, c.company_name,
            u.full_name AS attendant_name
     FROM transactions t
     JOIN vehicles v      ON v.vehicle_id = t.vehicle_id
     JOIN clients  c      ON c.client_id  = v.client_id
     LEFT JOIN users u    ON u.user_id    = t.attendant_id
     WHERE ($1::int  IS NULL OR c.client_id  = $1)
       AND ($2::int  IS NULL OR v.vehicle_id = $2)
       AND ($3::bool IS NULL OR t.is_flagged = $3)
       AND ($4::int  IS NULL OR c.manager_user_id = $4)
     ORDER BY t.txn_timestamp DESC
     LIMIT $5`,
    [
      client_id ? Number(client_id) : null,
      vehicle_id ? Number(vehicle_id) : null,
      flagged === undefined ? null : flagged === 'true',
      isManager ? req.user.userId : null,
      Math.min(Number(limit) || 100, 500),
    ]
  );
  res.json(rows);
});

export const createTransaction = asyncHandler(async (req, res) => {
  const { vehicle_id, volume_liters, price_per_liter, odometer_km } = req.body;

  const litres = Number(volume_liters);
  const price = Number(price_per_liter || process.env.DEFAULT_PRICE_PER_LITER || 104.5);

  if (!vehicle_id || !litres || litres <= 0) {
    return res.status(400).json({ error: 'vehicle_id and a positive volume_liters are required.' });
  }
  if (litres > 2000) {
    return res.status(400).json({ error: 'Volume exceeds the maximum single dispense (2000 L).' });
  }

  // --- 1. Load the vehicle, its client, and that client's credit position ---
  const { rows: vrows } = await query(
    `SELECT v.vehicle_id, v.license_plate, v.tank_capacity, v.fuel,
            c.client_id, c.company_name, c.credit_limit, c.current_balance
     FROM vehicles v
     JOIN clients c ON c.client_id = v.client_id
     WHERE v.vehicle_id = $1 AND v.is_active = TRUE AND c.is_active = TRUE`,
    [vehicle_id]
  );
  const vehicle = vrows[0];
  if (!vehicle) return res.status(404).json({ error: 'Vehicle not found or inactive.' });

  const total_cost = Number((litres * price).toFixed(2));
  const available = Number(vehicle.credit_limit) - Number(vehicle.current_balance);

  // --- 2. Hard business rule: never dispense beyond the credit limit ---
  if (total_cost > available) {
    return res.status(402).json({
      error: 'Credit limit exceeded.',
      detail: `${vehicle.company_name} has only ₹${available.toFixed(2)} of credit left, but this fill costs ₹${total_cost.toFixed(2)}.`,
      available_credit: available,
      attempted_cost: total_cost,
    });
  }

  // --- 3. Build the feature vector the ML model expects ---
  const { rows: hist } = await query(
    `SELECT
       COUNT(*)                                                        AS txn_count_30d,
       COALESCE(AVG(volume_liters), 0)                                 AS avg_volume,
       COALESCE(
         EXTRACT(EPOCH FROM (NOW() - MAX(txn_timestamp))) / 3600.0,
         999
       )                                                               AS hours_since_last
     FROM transactions
     WHERE vehicle_id = $1 AND txn_timestamp > NOW() - INTERVAL '30 days'`,
    [vehicle_id]
  );
  const h = hist[0];

  const features = {
    volume_liters: litres,
    tank_capacity: Number(vehicle.tank_capacity),
    fill_ratio: Number((litres / Number(vehicle.tank_capacity)).toFixed(4)),
    total_cost,
    hour_of_day: new Date().getHours(),
    hours_since_last_fill: Number(Number(h.hours_since_last).toFixed(2)),
    avg_volume_30d: Number(Number(h.avg_volume).toFixed(2)),
    txn_count_30d: Number(h.txn_count_30d),
  };

  // --- 4. Ask Python. Never let this block the sale. ---
  const verdict = await scoreTransaction(features);

  // --- 5. Insert + bill, atomically ---
  const saved = await withTransaction(async (client) => {
    const ins = await client.query(
      `INSERT INTO transactions
         (vehicle_id, attendant_id, volume_liters, price_per_liter, total_cost,
          odometer_km, is_flagged, fraud_score, flag_reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [vehicle_id, req.user.userId, litres, price, total_cost,
       odometer_km || null, verdict.is_flagged, verdict.fraud_score, verdict.reason]
    );

    await client.query(
      'UPDATE clients SET current_balance = current_balance + $1 WHERE client_id = $2',
      [total_cost, vehicle.client_id]
    );

    return ins.rows[0];
  });

  res.status(201).json({
    transaction: saved,
    vehicle: { license_plate: vehicle.license_plate, company_name: vehicle.company_name },
    credit_remaining: Number((available - total_cost).toFixed(2)),
    ml: {
      available: verdict.ml_available,
      is_flagged: verdict.is_flagged,
      fraud_score: verdict.fraud_score,
      reason: verdict.reason,
    },
  });
});

/** An admin can clear a false positive raised by the model. */
export const resolveFlag = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `UPDATE transactions
     SET is_flagged = FALSE,
         flag_reason = COALESCE(flag_reason, '') || ' [reviewed & cleared]'
     WHERE txn_id = $1 RETURNING txn_id, is_flagged`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Transaction not found.' });
  res.json({ message: 'Flag cleared.', transaction: rows[0] });
});
