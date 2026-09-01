/**
 * Authentication: register, login, and "who am I".
 *
 * Passwords are hashed with bcrypt. bcrypt is deliberately SLOW, which is what
 * makes brute-forcing a stolen database impractical. The plain password never
 * touches the database or the logs.
 */
import bcrypt from 'bcryptjs';
import { query } from '../config/db.js';
import { signToken } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const SALT_ROUNDS = 10;
const VALID_ROLES = ['admin', 'manager', 'attendant'];

export const register = asyncHandler(async (req, res) => {
  const { username, password, full_name, role } = req.body;

  if (!username || !password || !full_name || !role) {
    return res.status(400).json({ error: 'username, password, full_name and role are required.' });
  }
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

  const { rows } = await query(
    `INSERT INTO users (username, full_name, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING user_id, username, full_name, role, created_at`,
    [username.toLowerCase().trim(), full_name.trim(), password_hash, role]
  );

  res.status(201).json({ user: rows[0] });
});

export const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const { rows } = await query(
    `SELECT user_id, username, full_name, password_hash, role, is_active
     FROM users WHERE username = $1`,
    [username.toLowerCase().trim()]
  );
  const user = rows[0];

  // Same generic message whether the user is missing or the password is wrong,
  // so an attacker cannot use the API to discover which usernames exist.
  const ok = user && (await bcrypt.compare(password, user.password_hash));
  if (!ok) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }
  if (!user.is_active) {
    return res.status(403).json({ error: 'This account has been deactivated.' });
  }

  // For a fleet manager, attach the client they manage so the UI can scope itself.
  let clientId = null;
  if (user.role === 'manager') {
    const c = await query('SELECT client_id FROM clients WHERE manager_user_id = $1 LIMIT 1', [user.user_id]);
    clientId = c.rows[0]?.client_id ?? null;
  }

  res.json({
    token: signToken(user),
    user: {
      user_id: user.user_id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
      client_id: clientId,
    },
  });
});

export const me = asyncHandler(async (req, res) => {
  const { rows } = await query(
    'SELECT user_id, username, full_name, role, created_at FROM users WHERE user_id = $1',
    [req.user.userId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'User not found.' });

  let clientId = null;
  if (rows[0].role === 'manager') {
    const c = await query('SELECT client_id FROM clients WHERE manager_user_id = $1 LIMIT 1', [rows[0].user_id]);
    clientId = c.rows[0]?.client_id ?? null;
  }
  res.json({ user: { ...rows[0], client_id: clientId } });
});

export const listUsers = asyncHandler(async (req, res) => {
  const { rows } = await query(
    `SELECT user_id, username, full_name, role, is_active, created_at
     FROM users ORDER BY role, username`
  );
  res.json(rows);
});
