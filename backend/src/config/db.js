/**
 * PostgreSQL connection pool.
 *
 * Works in two very different environments:
 *   - locally: a long-lived server, one pool, many connections
 *   - on Vercel: short-lived serverless functions, each with its own pool
 *
 * Hence the small pool size in serverless — dozens of concurrent function
 * instances each holding ten connections would exhaust the database's
 * connection limit almost immediately.
 */
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// pg returns NUMERIC as a string by default (to avoid float precision loss).
// For this app the values are small enough that JS numbers are safe, and the
// frontend is far easier to write if money arrives as a number.
pg.types.setTypeParser(1700, (val) => (val === null ? null : parseFloat(val)));

const isServerless = Boolean(process.env.VERCEL);

/**
 * Hosted providers (Neon, Supabase, Railway) hand you one DATABASE_URL.
 * A local Homebrew install has no password and is configured piecemeal.
 * Support both rather than forcing one style.
 */
const connectionConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      // Managed Postgres requires TLS. The provider's certificate is not in
      // Node's trust store, so verification is relaxed while the transport
      // itself stays encrypted.
      ssl: { rejectUnauthorized: false },
    }
  : {
      host: process.env.PGHOST,
      port: Number(process.env.PGPORT),
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD || undefined,
      database: process.env.PGDATABASE,
    };

const pool = new pg.Pool({
  ...connectionConfig,
  max: isServerless ? 1 : 10,
  idleTimeoutMillis: isServerless ? 10000 : 30000,
  connectionTimeoutMillis: 10000,
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
