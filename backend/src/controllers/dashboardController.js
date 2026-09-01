/** Aggregated views that power the three role dashboards. */
import { query } from '../config/db.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { forecastConsumption, mlHealth } from '../utils/mlClient.js';

/** Admin: pump-wide KPIs, credit exposure and open fraud alerts. */
export const adminDashboard = asyncHandler(async (req, res) => {
  const [totals, today, topClients, alerts, trend, ml] = await Promise.all([
    query(`SELECT
             (SELECT COUNT(*) FROM clients  WHERE is_active)                  AS total_clients,
             (SELECT COUNT(*) FROM vehicles WHERE is_active)                  AS total_vehicles,
             (SELECT COALESCE(SUM(current_balance),0) FROM clients)           AS total_outstanding,
             (SELECT COALESCE(SUM(credit_limit),0)    FROM clients)           AS total_credit_extended,
             (SELECT COUNT(*) FROM transactions WHERE is_flagged)             AS open_alerts`),
    query(`SELECT COALESCE(SUM(total_cost),0)    AS revenue_today,
                  COALESCE(SUM(volume_liters),0) AS liters_today,
                  COUNT(*)                       AS txns_today
           FROM transactions WHERE txn_timestamp::date = CURRENT_DATE`),
    query(`SELECT client_id, company_name, credit_limit, current_balance,
                  credit_limit - current_balance AS available_credit,
                  CASE WHEN credit_limit > 0
                       THEN ROUND((current_balance/credit_limit)*100, 1) ELSE 0 END AS utilisation_pct
           FROM clients WHERE is_active
           ORDER BY current_balance DESC LIMIT 8`),
    query(`SELECT t.txn_id, t.volume_liters, t.total_cost, t.fraud_score,
                  t.flag_reason, t.txn_timestamp,
                  v.license_plate, c.company_name, u.full_name AS attendant_name
           FROM transactions t
           JOIN vehicles v   ON v.vehicle_id = t.vehicle_id
           JOIN clients  c   ON c.client_id  = v.client_id
           LEFT JOIN users u ON u.user_id    = t.attendant_id
           WHERE t.is_flagged
           ORDER BY t.txn_timestamp DESC LIMIT 15`),
    query(`SELECT d::date AS day,
                  COALESCE(SUM(t.total_cost), 0)    AS revenue,
                  COALESCE(SUM(t.volume_liters), 0) AS liters
           FROM generate_series(CURRENT_DATE - INTERVAL '29 days', CURRENT_DATE, '1 day') d
           LEFT JOIN transactions t ON t.txn_timestamp::date = d::date
           GROUP BY d ORDER BY d`),
    mlHealth(),
  ]);

  res.json({
    kpis: { ...totals.rows[0], ...today.rows[0] },
    top_clients: topClients.rows,
    fraud_alerts: alerts.rows,
    revenue_trend: trend.rows,
    ml_service: ml,
  });
});

/** Manager: only their own company's fleet. */
export const managerDashboard = asyncHandler(async (req, res) => {
  const { rows: crows } = await query(
    'SELECT * FROM clients WHERE manager_user_id = $1 AND is_active LIMIT 1',
    [req.user.userId]
  );
  const client = crows[0];
  if (!client) {
    return res.status(404).json({ error: 'No fleet is assigned to your account yet. Contact the pump admin.' });
  }

  const [summary, byVehicle, monthly, recent] = await Promise.all([
    query(`SELECT COUNT(DISTINCT v.vehicle_id)          AS vehicles,
                  COUNT(t.txn_id)                       AS txns_30d,
                  COALESCE(SUM(t.volume_liters), 0)     AS liters_30d,
                  COALESCE(SUM(t.total_cost), 0)        AS spend_30d
           FROM vehicles v
           LEFT JOIN transactions t
             ON t.vehicle_id = v.vehicle_id
            AND t.txn_timestamp > NOW() - INTERVAL '30 days'
           WHERE v.client_id = $1 AND v.is_active`, [client.client_id]),
    query(`SELECT v.vehicle_id, v.license_plate, v.fuel, v.tank_capacity,
                  COALESCE(SUM(t.volume_liters), 0) AS liters,
                  COALESCE(SUM(t.total_cost), 0)    AS spend,
                  COUNT(t.txn_id)                   AS fills
           FROM vehicles v
           LEFT JOIN transactions t ON t.vehicle_id = v.vehicle_id
           WHERE v.client_id = $1 AND v.is_active
           GROUP BY v.vehicle_id ORDER BY spend DESC`, [client.client_id]),
    query(`SELECT TO_CHAR(m, 'Mon YYYY') AS month,
                  m::date                AS month_start,
                  COALESCE(SUM(t.total_cost), 0)    AS spend,
                  COALESCE(SUM(t.volume_liters), 0) AS liters
           FROM generate_series(date_trunc('month', CURRENT_DATE - INTERVAL '5 months'),
                                date_trunc('month', CURRENT_DATE), '1 month') m
           LEFT JOIN transactions t
             ON date_trunc('month', t.txn_timestamp) = m
            AND t.vehicle_id IN (SELECT vehicle_id FROM vehicles WHERE client_id = $1)
           GROUP BY m ORDER BY m`, [client.client_id]),
    query(`SELECT t.txn_id, t.volume_liters, t.total_cost, t.txn_timestamp,
                  t.is_flagged, v.license_plate, u.full_name AS attendant_name
           FROM transactions t
           JOIN vehicles v   ON v.vehicle_id = t.vehicle_id
           LEFT JOIN users u ON u.user_id    = t.attendant_id
           WHERE v.client_id = $1
           ORDER BY t.txn_timestamp DESC LIMIT 20`, [client.client_id]),
  ]);

  res.json({
    client: {
      ...client,
      available_credit: Number(client.credit_limit) - Number(client.current_balance),
      utilisation_pct: client.credit_limit > 0
        ? Number(((client.current_balance / client.credit_limit) * 100).toFixed(1)) : 0,
    },
    summary: summary.rows[0],
    by_vehicle: byVehicle.rows,
    monthly: monthly.rows,
    recent_transactions: recent.rows,
  });
});

/** Attendant: their own shift totals. */
export const attendantDashboard = asyncHandler(async (req, res) => {
  const [today, recent] = await Promise.all([
    query(`SELECT COUNT(*)                          AS txns_today,
                  COALESCE(SUM(volume_liters), 0)   AS liters_today,
                  COALESCE(SUM(total_cost), 0)      AS value_today
           FROM transactions
           WHERE attendant_id = $1 AND txn_timestamp::date = CURRENT_DATE`,
      [req.user.userId]),
    query(`SELECT t.txn_id, t.volume_liters, t.total_cost, t.txn_timestamp, t.is_flagged,
                  v.license_plate, c.company_name
           FROM transactions t
           JOIN vehicles v ON v.vehicle_id = t.vehicle_id
           JOIN clients  c ON c.client_id  = v.client_id
           WHERE t.attendant_id = $1
           ORDER BY t.txn_timestamp DESC LIMIT 15`, [req.user.userId]),
  ]);

  res.json({ today: today.rows[0], recent: recent.rows });
});

/** Daily litres for a client, passed to the Python ARIMA forecaster. */
export const clientForecast = asyncHandler(async (req, res) => {
  const clientId = Number(req.params.id);

  if (req.user.role === 'manager') {
    const { rows } = await query(
      'SELECT 1 FROM clients WHERE client_id = $1 AND manager_user_id = $2',
      [clientId, req.user.userId]
    );
    if (!rows.length) return res.status(403).json({ error: 'You do not manage this client.' });
  }

  const { rows } = await query(
    `SELECT d::date AS day, COALESCE(SUM(t.volume_liters), 0) AS liters
     FROM generate_series(CURRENT_DATE - INTERVAL '89 days', CURRENT_DATE, '1 day') d
     LEFT JOIN transactions t
       ON t.txn_timestamp::date = d::date
      AND t.vehicle_id IN (SELECT vehicle_id FROM vehicles WHERE client_id = $1)
     GROUP BY d ORDER BY d`,
    [clientId]
  );

  const result = await forecastConsumption({
    history: rows.map((r) => ({ date: r.day.toISOString().slice(0, 10), value: Number(r.liters) })),
    periods: Number(req.query.periods) || 14,
  });

  res.json({ history: rows, ...result });
});

/** A month's billing statement for one client. */
export const clientInvoice = asyncHandler(async (req, res) => {
  const clientId = Number(req.params.id);
  const month = req.query.month || new Date().toISOString().slice(0, 7); // YYYY-MM

  if (req.user.role === 'manager') {
    const { rows } = await query(
      'SELECT 1 FROM clients WHERE client_id = $1 AND manager_user_id = $2',
      [clientId, req.user.userId]
    );
    if (!rows.length) return res.status(403).json({ error: 'You do not manage this client.' });
  }

  const [client, lines] = await Promise.all([
    query('SELECT * FROM clients WHERE client_id = $1', [clientId]),
    query(
      `SELECT v.license_plate, v.fuel,
              COUNT(t.txn_id)                   AS fills,
              COALESCE(SUM(t.volume_liters), 0) AS liters,
              COALESCE(SUM(t.total_cost), 0)    AS amount
       FROM vehicles v
       LEFT JOIN transactions t
         ON t.vehicle_id = v.vehicle_id
        AND TO_CHAR(t.txn_timestamp, 'YYYY-MM') = $2
       WHERE v.client_id = $1
       GROUP BY v.vehicle_id, v.license_plate, v.fuel
       HAVING COUNT(t.txn_id) > 0
       ORDER BY amount DESC`,
      [clientId, month]
    ),
  ]);

  if (!client.rows[0]) return res.status(404).json({ error: 'Client not found.' });

  const subtotal = lines.rows.reduce((s, l) => s + Number(l.amount), 0);

  res.json({
    client: client.rows[0],
    month,
    lines: lines.rows,
    subtotal: Number(subtotal.toFixed(2)),
    total_liters: Number(lines.rows.reduce((s, l) => s + Number(l.liters), 0).toFixed(2)),
    generated_at: new Date().toISOString(),
  });
});
