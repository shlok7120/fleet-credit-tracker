/**
 * PostgreSQL connection pool.
 *
 * A "pool" keeps a small set of open connections and hands them out as
 * requests arrive, instead of opening a fresh (slow) connection every time.
 */
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// pg returns NUMERIC as a string by default (to avoid float precision loss).
// For this app the values are small enough that JS numbers are safe, and the
// frontend is far easier to write if money arrives as a number.
pg.types.setTypeParser(1700, (val) => (val === null ? null : parseFloat(val)));

const pool = new pg.Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD || undefined,
  database: process.env.PGDATABASE,
  max: 10,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  console.error('[db] unexpected idle client error:', err.message);
});

/** Run a single SQL statement. */
export const query = (text, params) => pool.query(text, params);

/**
 * Run several statements as one atomic transaction.
 * If the callback throws, everything is rolled back.
 */
export const withTransaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export default pool;
