/**
 * Authentication + authorisation middleware.
 *
 *   requireAuth  -> proves WHO you are   (valid JWT?)
 *   requireRole  -> proves WHAT you may do (correct role?)
 */
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

export const signToken = (user) =>
  jwt.sign(
    { userId: user.user_id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );

export const requireAuth = (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired or token invalid.' });
  }
};

/** Usage: router.get('/x', requireAuth, requireRole('admin'), handler) */
export const requireRole = (...allowed) => (req, res, next) => {
  if (!req.user || !allowed.includes(req.user.role)) {
    return res.status(403).json({ error: 'You do not have access to this resource.' });
  }
  next();
};
