/**
 * Re-score every existing transaction through the ML service.
 *
 *   npm run backfill        (from the backend/ folder — ML service must be running)
 *
 * Seeded history is written straight to the database and never passes through
 * the fraud check, so without this the dashboard opens with zero alerts. This
 * also lets you re-score everything after tuning the model.
 */
import dotenv from 'dotenv';
import pool, { query } from '../config/db.js';
import { scoreTransaction, waitForMl, trainOnHistory } from './mlClient.js';
import { PUMP_TIMEZONE } from './time.js';

dotenv.config();

async function main() {
  // A free-tier ML host sleeps when idle; give it time to wake rather than
  // failing on the first slow response.
  const health = await waitForMl();
  if (!health.reachable) {
    console.error('✗ ML service is not reachable at', process.env.ML_SERVICE_URL);
    console.error('  Start it first:  cd ml-service && source venv/bin/activate && uvicorn main:app --port 8000');
    await pool.end();
    process.exit(1);
  }
  console.log(`› ML service up (model v${health.model_version})`);

  // Pull each transaction together with the rolling context the model needs:
  // the vehicle's tank, and its average/last-fill AS OF that moment in time.
  const { rows } = await query(`
    SELECT t.txn_id,
           t.volume_liters,
           t.total_cost,
           EXTRACT(HOUR FROM t.txn_timestamp AT TIME ZONE $1)::int AS hour_of_day,
           v.tank_capacity,
           COALESCE((
             SELECT AVG(p.volume_liters) FROM transactions p
             WHERE p.vehicle_id = t.vehicle_id
               AND p.txn_timestamp <  t.txn_timestamp
               AND p.txn_timestamp >= t.txn_timestamp - INTERVAL '30 days'
           ), 0) AS avg_volume_30d,
           COALESCE((
             SELECT COUNT(*) FROM transactions p
             WHERE p.vehicle_id = t.vehicle_id
               AND p.txn_timestamp <  t.txn_timestamp
               AND p.txn_timestamp >= t.txn_timestamp - INTERVAL '30 days'
           ), 0) AS txn_count_30d,
           COALESCE((
             SELECT EXTRACT(EPOCH FROM (t.txn_timestamp - MAX(p.txn_timestamp))) / 3600.0
             FROM transactions p
             WHERE p.vehicle_id = t.vehicle_id AND p.txn_timestamp < t.txn_timestamp
           ), 999) AS hours_since_last
    FROM transactions t
    JOIN vehicles v ON v.vehicle_id = t.vehicle_id
    ORDER BY t.txn_timestamp
  `, [PUMP_TIMEZONE]);

  // --- Step 1: teach the model what THIS pump's normal traffic looks like ---
  const samples = rows.map((r) => ({
    volume_liters: Number(r.volume_liters),
    tank_capacity: Number(r.tank_capacity),
    total_cost: Number(r.total_cost),
    hour_of_day: r.hour_of_day,
    hours_since_last_fill: Number(Number(r.hours_since_last).toFixed(2)),
    avg_volume_30d: Number(Number(r.avg_volume_30d).toFixed(2)),
    txn_count_30d: Number(r.txn_count_30d),
  }));

  console.log(`› Training the model on ${samples.length} real transactions…`);
  const trained = await trainOnHistory(samples);
  console.log(`  model v${trained.version} fitted on ${trained.source}`);

  // --- Step 2: score every transaction with the freshly fitted model ---
  console.log(`› Scoring ${rows.length} transactions…`);

  // Scoring one transaction at a time means one HTTP round trip to the ML
  // service plus one database round trip per row. Locally that is fine; against
  // hosted services on another continent, 650 rows becomes several minutes.
  // Score in parallel batches, then write the results in bulk.
  const CONCURRENCY = 10;
  const CHUNK = 250;

  let flagged = 0;
  const verdicts = [];

  for (let i = 0; i < samples.length; i += CONCURRENCY) {
    const batch = samples.slice(i, i + CONCURRENCY);
    const scored = await Promise.all(batch.map((sample) => scoreTransaction(sample)));

    scored.forEach((v, j) => {
      verdicts.push([rows[i + j].txn_id, v.is_flagged, v.fraud_score, v.reason]);
      if (v.is_flagged) flagged++;
    });

    process.stdout.write(`\r  scored ${Math.min(i + CONCURRENCY, samples.length)}/${samples.length}…`);
  }
  process.stdout.write('\n› Writing results…\n');

  // One UPDATE per chunk, joining against an inline VALUES list.
  for (let i = 0; i < verdicts.length; i += CHUNK) {
    const chunk = verdicts.slice(i, i + CHUNK);
    const values = chunk
      .map((_, r) => `($${r * 4 + 1}::int, $${r * 4 + 2}::bool, $${r * 4 + 3}::numeric, $${r * 4 + 4}::text)`)
      .join(',');

    await query(
      `UPDATE transactions t
       SET is_flagged  = v.is_flagged,
           fraud_score = v.fraud_score,
           flag_reason = v.flag_reason
       FROM (VALUES ${values}) AS v(txn_id, is_flagged, fraud_score, flag_reason)
       WHERE t.txn_id = v.txn_id`,
      chunk.flat()
    );
  }

  const pct = rows.length ? ((flagged / rows.length) * 100).toFixed(1) : '0.0';
  console.log(`\n  Backfill complete`);
  console.log(`  ────────────────────────────────────────`);
  console.log(`  scored     ${rows.length}`);
  console.log(`  flagged    ${flagged}  (${pct}% of traffic)\n`);

  await pool.end();
}

main().catch(async (err) => {
  console.error('Backfill failed:', err);
  await pool.end();
  process.exit(1);
});
