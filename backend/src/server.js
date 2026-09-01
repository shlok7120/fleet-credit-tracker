/**
 * Local development server. Vercel does not use this file — it imports
 * app.js directly through /api/index.js.
 *
 * Start with:  npm run dev   (from the backend/ folder)
 */
import dotenv from 'dotenv';
import app from './app.js';
import pool from './config/db.js';

dotenv.config();

const PORT = process.env.PORT || 5001;

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
