/** Corporate fleet clients: CRUD + credit exposure. */
import bcrypt from 'bcryptjs';
import { query, withTransaction } from '../config/db.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const USERNAME_PATTERN = /^[a-z0-9_]{3,50}$/;

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

/**
 * Create a client, optionally creating its fleet manager's login at the same
 * time.
 *
 * A new corporate account almost always needs a new sign-in for that company's
 * manager. Making that a separate, easily-forgotten step leaves fleets that
 * nobody can actually see. Both rows are written in one transaction, so a
 * client is never created with a half-made manager account attached.
 */
export const createClient = asyncHandler(async (req, res) => {
  const {
    company_name, contact_person, contact_phone, credit_limit,
    manager_user_id, new_manager,
  } = req.body;

  if (!company_name || credit_limit == null) {
    return res.status(400).json({ error: 'Company name and credit limit are required.' });
  }
  if (Number(credit_limit) < 0) {
    return res.status(400).json({ error: 'Credit limit cannot be negative.' });
  }

  if (new_manager) {
    const { username, password, full_name } = new_manager;
    if (!username || !password || !full_name) {
      return res.status(400).json({
        error: 'A new manager needs a username, password and full name.',
      });
    }
    if (!USERNAME_PATTERN.test(String(username).toLowerCase().trim())) {
      return res.status(400).json({
        error: 'Username must be 3–50 characters: lowercase letters, numbers or underscore.',
      });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ error: 'Manager password must be at least 8 characters.' });
    }
  }

  const created = await withTransaction(async (db) => {
    let managerId = manager_user_id || null;

    if (new_manager) {
      const { rows } = await db.query(
        `INSERT INTO users (username, full_name, password_hash, role, designation, email, phone)
         VALUES ($1,$2,$3,'manager',$4,$5,$6) RETURNING user_id`,
        [
          String(new_manager.username).toLowerCase().trim(),
          String(new_manager.full_name).trim(),
          await bcrypt.hash(new_manager.password, 10),
          'Fleet manager',
          new_manager.email ? String(new_manager.email).trim().toLowerCase() : null,
          new_manager.phone ? String(new_manager.phone).trim() : null,
        ]
      );
      managerId = rows[0].user_id;
    }

    const { rows } = await db.query(
      `INSERT INTO clients (company_name, contact_person, contact_phone, credit_limit, manager_user_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [company_name.trim(), contact_person || null, contact_phone || null,
       Number(credit_limit), managerId]
    );
    return rows[0];
  });

  res.status(201).json(created);
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

/**
 * Remove a client from circulation.
 *
 * Deactivation, not deletion: the client's transactions are the pump's own
 * sales history and its outstanding balance may still be owed. Dropping the
 * row would take the ledger with it. This hides them from every screen and
 * stops further fuelling, while the money and the history remain.
 */
export const deactivateClient = asyncHandler(async (req, res) => {
  const { rows: found } = await query(
    `SELECT c.client_id, c.company_name, c.current_balance,
            COUNT(v.vehicle_id)::int AS vehicles
     FROM clients c
     LEFT JOIN vehicles v ON v.client_id = c.client_id AND v.is_active
     WHERE c.client_id = $1
     GROUP BY c.client_id`,
    [req.params.id]
  );
  if (!found[0]) return res.status(404).json({ error: 'Client not found.' });

  await query('UPDATE clients SET is_active = FALSE WHERE client_id = $1', [req.params.id]);

  res.json({
    message: `${found[0].company_name} removed.`,
    company_name: found[0].company_name,
    outstanding: Number(found[0].current_balance),
    vehicles: found[0].vehicles,
  });
});
