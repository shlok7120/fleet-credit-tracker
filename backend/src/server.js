/**
 * Corporate Fleet Credit Tracker — Express API server.
 * Start with:  npm run dev   (from the backend/ folder)
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
const PORT = process.env.PORT || 5001;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

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
    timestamp: new Date().toISOString(),
  });
});

app.use('/api', apiRoutes);

app.use((req, res) => res.status(404).json({ error: `No route for ${req.method} ${req.originalUrl}` }));
app.use(errorHandler);

const server = app.listen(PORT, () => {
  console.log(`\n  Fleet Credit Tracker API`);
  console.log(`  ────────────────────────────────────────`);
  console.log(`  Listening   http://localhost:${PORT}`);
  console.log(`  Health      http://localhost:${PORT}/api/health`);
  console.log(`  ML service  ${process.env.ML_SERVICE_URL}\n`);
});

// Close database connections cleanly on Ctrl+C.
const shutdown = () => {
  console.log('\n[server] shutting down…');
  server.close(() => pool.end().then(() => process.exit(0)));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
