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
import { scoreTransaction, mlHealth, trainOnHistory } from './mlClient.js';

dotenv.config();

async function main() {
  const health = await mlHealth();
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
           EXTRACT(HOUR FROM t.txn_timestamp)::int AS hour_of_day,
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
  `);

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

  let flagged = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const verdict = await scoreTransaction(samples[i]);

    await query(
      'UPDATE transactions SET is_flagged = $2, fraud_score = $3, flag_reason = $4 WHERE txn_id = $1',
      [r.txn_id, verdict.is_flagged, verdict.fraud_score, verdict.reason]
    );
    if (verdict.is_flagged) flagged++;
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
