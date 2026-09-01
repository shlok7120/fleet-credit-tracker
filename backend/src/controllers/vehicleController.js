/** Fleet vehicles belonging to a client. */
import { query } from '../config/db.js';
import { asyncHandler } from '../middleware/errorHandler.js';

/** Confirms a manager owns the client that owns this vehicle. */
const managerOwnsClient = async (userId, clientId) => {
  const { rows } = await query(
    'SELECT 1 FROM clients WHERE client_id = $1 AND manager_user_id = $2',
    [clientId, userId]
  );
  return rows.length > 0;
};

export const listVehicles = asyncHandler(async (req, res) => {
  const { client_id } = req.query;
  const isManager = req.user.role === 'manager';

  const { rows } = await query(
    `SELECT v.vehicle_id, v.license_plate, v.make_model, v.fuel, v.tank_capacity,
            v.client_id, c.company_name,
            COUNT(t.txn_id)                     AS txn_count,
            COALESCE(SUM(t.volume_liters), 0)   AS total_liters,
            COALESCE(SUM(t.total_cost), 0)      AS total_spend,
            MAX(t.txn_timestamp)                AS last_fuelled
     FROM vehicles v
     JOIN clients c       ON c.client_id  = v.client_id
     LEFT JOIN transactions t ON t.vehicle_id = v.vehicle_id
     WHERE v.is_active = TRUE
       AND ($1::int IS NULL OR v.client_id = $1)
       AND ($2::int IS NULL OR c.manager_user_id = $2)
     GROUP BY v.vehicle_id, c.company_name
     ORDER BY v.license_plate`,
    [client_id ? Number(client_id) : null, isManager ? req.user.userId : null]
  );
  res.json(rows);
});

/** Lightweight list used by the attendant's fast-entry screen. */
export const lookupVehicles = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT v.vehicle_id, v.license_plate, v.make_model, v.fuel, v.tank_capacity,
            c.client_id, c.company_name,
            c.credit_limit - c.current_balance AS available_credit
     FROM vehicles v
     JOIN clients c ON c.client_id = v.client_id
     WHERE v.is_active = TRUE AND c.is_active = TRUE
     ORDER BY v.license_plate`
  );
  res.json(rows);
});

export const createVehicle = asyncHandler(async (req, res) => {
  const { client_id, license_plate, make_model, fuel, tank_capacity } = req.body;

  if (!client_id || !license_plate || !fuel || !tank_capacity) {
    return res.status(400).json({
      error: 'client_id, license_plate, fuel and tank_capacity are required.',
    });
  }
  if (!['petrol', 'diesel', 'cng'].includes(fuel)) {
    return res.status(400).json({ error: 'fuel must be petrol, diesel or cng.' });
  }
  if (req.user.role === 'manager' && !(await managerOwnsClient(req.user.userId, client_id))) {
    return res.status(403).json({ error: 'You do not manage this client.' });
  }

  const { rows } = await query(
    `INSERT INTO vehicles (client_id, license_plate, make_model, fuel, tank_capacity)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [client_id, license_plate.toUpperCase().replace(/\s+/g, ''), make_model || null,
     fuel, Number(tank_capacity)]
  );
  res.status(201).json(rows[0]);
});

export const deactivateVehicle = asyncHandler(async (req, res) => {
  const { rows } = await query(
    'UPDATE vehicles SET is_active = FALSE WHERE vehicle_id = $1 RETURNING vehicle_id',
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Vehicle not found.' });
  res.json({ message: 'Vehicle deactivated.' });
});
