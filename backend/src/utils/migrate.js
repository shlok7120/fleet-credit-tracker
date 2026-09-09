/**
 * Database migrator.
 *
 *   npm run migrate                    (uses .env)
 *   DATABASE_URL="postgres://…" npm run migrate
 *
 * Applies database/schema.sql once as the baseline, then every file in
 * database/migrations/ that has not run yet, in filename order. Each applied
 * file is recorded in schema_migrations, so running this against a database
 * that already holds live transactions is safe and repeatable.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pool, { query } from '../config/db.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR = path.resolve(__dirname, '../../../database');
const SCHEMA = path.join(DB_DIR, 'schema.sql');
const MIGRATIONS = path.join(DB_DIR, 'migrations');

const ensureLedger = () => query(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name       TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

const applied = async () => {
  const { rows } = await query('SELECT name FROM schema_migrations');
  return new Set(rows.map((r) => r.name));
};

const record = (name) =>
  query('INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [name]);

const tableExists = async (name) => {
  const { rows } = await query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`, [name]
  );
  return rows.length > 0;
};

async function main() {
  const target = process.env.DATABASE_URL
    ? new URL(process.env.DATABASE_URL).host
    : `${process.env.PGHOST}/${process.env.PGDATABASE}`;
  console.log(`› Target: ${target}\n`);

  await ensureLedger();
  const done = await applied();

  // ---- Baseline -----------------------------------------------------------
  // schema.sql DROPs every table, so it may only run on a database that has
  // none. An existing installation is simply marked as already baselined.
  if (!done.has('000_baseline')) {
    if (await tableExists('transactions')) {
      await record('000_baseline');
      console.log('  000_baseline               already present, recorded');
    } else {
      await query(fs.readFileSync(SCHEMA, 'utf8'));
      await record('000_baseline');
      console.log('  000_baseline               applied');
    }
  } else {
    console.log('  000_baseline               skipped');
  }

  // ---- Incremental migrations --------------------------------------------
  const files = fs.existsSync(MIGRATIONS)
    ? fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()
    : [];

  let ran = 0;
  for (const file of files) {
    const name = file.replace(/\.sql$/, '');
    if (done.has(name)) {
      console.log(`  ${name.padEnd(42)} skipped`);
      continue;
    }
    await query(fs.readFileSync(path.join(MIGRATIONS, file), 'utf8'));
    await record(name);
    ran += 1;
    console.log(`  ${name.padEnd(42)} applied`);
  }

  const { rows } = await query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' ORDER BY table_name`
  );
  console.log(`\n✓ Up to date (${ran} newly applied)`);
  console.log(`  tables: ${rows.map((r) => r.table_name).join(', ')}`);

  await pool.end();
}

main().catch(async (err) => {
  console.error('\n✗ Migration failed:', err.message);
  await pool.end();
  process.exit(1);
});
