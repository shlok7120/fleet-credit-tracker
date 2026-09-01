/**
 * The Express application, with no server attached.
 *
 * Kept separate from server.js so the same app can be either:
 *   - listened on a port locally (server.js), or
 *   - exported as a serverless handler on Vercel (/api/index.js)
 *
 * An app that calls .listen() itself cannot do the second one.
 */
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';

import apiRoutes from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import pool from './config/db.js';
import { mlHealth } from './utils/mlClient.js';

dotenv.config();

const app = express();

// In production the frontend is served from the same origin as the API, so
// CORS is not needed at all. It stays permissive in development, where Vite
// runs on :5173 and Express on :5001.
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

app.get('/api/health', async (req, res) => {
  let db = 'down';
  try {
    await pool.query('SELECT 1');
    db = 'up';
  } catch { /* leave as down */ }

  const ml = await mlHealth();
  res.json({
    status: 'ok',
    service: 'fleet-credit-tracker-api',
    database: db,
    ml_service: ml.reachable ? 'up' : 'down',
    environment: process.env.VERCEL ? 'vercel' : 'local',
    timestamp: new Date().toISOString(),
  });
});

app.use('/api', apiRoutes);

app.use((req, res) => res.status(404).json({ error: `No route for ${req.method} ${req.originalUrl}` }));
app.use(errorHandler);

export default app;
