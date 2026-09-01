/**
 * Apply database/schema.sql to whatever database DATABASE_URL points at.
 *
 *   DATABASE_URL="postgresql://..." node backend/src/utils/migrate.js
 *
 * Used to build the schema on hosted Postgres (Neon), where you cannot just
 * pipe a file into psql as easily as you can locally.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pool, { query } from '../config/db.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA = path.resolve(__dirname, '../../../database/schema.sql');

async function main() {
  const target = process.env.DATABASE_URL
    ? new URL(process.env.DATABASE_URL).host
    : `${process.env.PGHOST}/${process.env.PGDATABASE}`;

  console.log(`› Applying schema to ${target}`);

  if (!fs.existsSync(SCHEMA)) {
    console.error(`✗ Schema file not found at ${SCHEMA}`);
    process.exit(1);
  }

  // The schema drops and recreates every table, so refuse to run it against
  // something that already holds data unless explicitly forced.
  try {
    const { rows } = await query(
      `SELECT COUNT(*)::int AS n FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'transactions'`
    );
    if (rows[0].n > 0 && !process.argv.includes('--force')) {
      const { rows: c } = await query('SELECT COUNT(*)::int AS n FROM transactions');
      if (c[0].n > 0) {
        console.error(`✗ Refusing to run: ${c[0].n} transactions already exist.`);
        console.error('  This schema DROPs every table. Re-run with --force if that is intended.');
        await pool.end();
        process.exit(1);
      }
    }
  } catch { /* tables do not exist yet — that is the normal first run */ }

  await query(fs.readFileSync(SCHEMA, 'utf8'));

  const { rows } = await query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' ORDER BY table_name`
  );

  console.log(`✓ Schema applied. Tables: ${rows.map((r) => r.table_name).join(', ')}`);
  await pool.end();
}

main().catch(async (err) => {
  console.error('✗ Migration failed:', err.message);
  await pool.end();
  process.exit(1);
});
