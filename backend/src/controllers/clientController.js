/** Corporate fleet clients: CRUD + credit exposure. */
import { query } from '../config/db.js';
import { asyncHandler } from '../middleware/errorHandler.js';

/**
 * Admins see every client. A manager sees only the client they own.
 * The scoping happens in SQL, not in the UI — a manager cannot simply
 * call the API directly to read another company's data.
 */
export const listClients = asyncHandler(async (req, res) => {
  const isManager = req.user.role === 'manager';

  const { rows } = await query(
    `SELECT c.client_id,
            c.company_name,
            c.contact_person,
            c.contact_phone,
            c.credit_limit,
            c.current_balance,
            c.credit_limit - c.current_balance          AS available_credit,
            CASE WHEN c.credit_limit > 0
                 THEN ROUND((c.current_balance / c.credit_limit) * 100, 1)
                 ELSE 0 END                              AS utilisation_pct,
            c.manager_user_id,
            u.full_name                                  AS manager_name,
            COUNT(DISTINCT v.vehicle_id)                 AS vehicle_count
     FROM clients c
     LEFT JOIN users    u ON u.user_id   = c.manager_user_id
     LEFT JOIN vehicles v ON v.client_id = c.client_id
     WHERE c.is_active = TRUE
       AND ($1::int IS NULL OR c.manager_user_id = $1)
     GROUP BY c.client_id, u.full_name
     ORDER BY c.current_balance DESC`,
    [isManager ? req.user.userId : null]
  );
  res.json(rows);
});

export const getClient = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT c.*, u.full_name AS manager_name
     FROM clients c LEFT JOIN users u ON u.user_id = c.manager_user_id
     WHERE c.client_id = $1`,
    [req.params.id]
  );
  const client = rows[0];
  if (!client) return res.status(404).json({ error: 'Client not found.' });

  if (req.user.role === 'manager' && client.manager_user_id !== req.user.userId) {
    return res.status(403).json({ error: 'You do not manage this client.' });
  }
  res.json(client);
});

export const createClient = asyncHandler(async (req, res) => {
  const { company_name, contact_person, contact_phone, credit_limit, manager_user_id } = req.body;

  if (!company_name || credit_limit == null) {
    return res.status(400).json({ error: 'company_name and credit_limit are required.' });
  }

  const { rows } = await query(
    `INSERT INTO clients (company_name, contact_person, contact_phone, credit_limit, manager_user_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [company_name.trim(), contact_person || null, contact_phone || null,
     Number(credit_limit), manager_user_id || null]
  );
  res.status(201).json(rows[0]);
});

export const updateClient = asyncHandler(async (req, res) => {
  const { company_name, contact_person, contact_phone, credit_limit, manager_user_id } = req.body;

  const { rows } = await query(
    `UPDATE clients SET
       company_name    = COALESCE($2, company_name),
       contact_person  = COALESCE($3, contact_person),
       contact_phone   = COALESCE($4, contact_phone),
       credit_limit    = COALESCE($5, credit_limit),
       manager_user_id = COALESCE($6, manager_user_id)
     WHERE client_id = $1 RETURNING *`,
    [req.params.id, company_name ?? null, contact_person ?? null, contact_phone ?? null,
     credit_limit ?? null, manager_user_id ?? null]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Client not found.' });
  res.json(rows[0]);
});

/** Record a payment from the client, reducing what they owe. */
export const recordPayment = asyncHandler(async (req, res) => {
  const amount = Number(req.body.amount);
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'A positive payment amount is required.' });
  }

  const { rows } = await query(
    `UPDATE clients
     SET current_balance = GREATEST(current_balance - $2, 0)
     WHERE client_id = $1 RETURNING *`,
    [req.params.id, amount]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Client not found.' });
  res.json({ message: `Payment of ${amount} recorded.`, client: rows[0] });
});

export const deactivateClient = asyncHandler(async (req, res) => {
  const { rows } = await query(
    'UPDATE clients SET is_active = FALSE WHERE client_id = $1 RETURNING client_id',
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Client not found.' });
  res.json({ message: 'Client deactivated.' });
});
