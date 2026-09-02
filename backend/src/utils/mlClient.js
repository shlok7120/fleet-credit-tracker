/**
 * Thin HTTP client for the Python FastAPI microservice.
 *
 * Design rule: the ML service is an ADVISOR, never a gatekeeper. If Python is
 * down or slow, fuelling must still be recordable — the pump cannot stop
 * serving trucks because a model crashed. So every call has a short timeout
 * and a safe fallback.
 */
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Fraud scoring sits directly in the attendant's path: every second here is a
 * second they stand waiting at the pump. Locally the service answers in
 * milliseconds, so 4s is generous.
 *
 * On a free hosting tier the service sleeps when idle and takes ~30s to wake,
 * which would silently skip detection on the first fill after a quiet spell.
 * ML_TIMEOUT_MS lets deployment trade attendant waiting time against that;
 * set it to 15000 or more in production if you would rather wait than miss.
 */
const FRAUD_TIMEOUT_MS = Number(process.env.ML_TIMEOUT_MS) || 4000;

const ml = axios.create({
  baseURL: process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000',
  timeout: FRAUD_TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Score one transaction for fraud.
 * @returns {{is_flagged:boolean, fraud_score:number|null, reason:string|null, ml_available:boolean}}
 */
export const scoreTransaction = async (features) => {
  try {
    const { data } = await ml.post('/predict/fraud', features);
    return {
      is_flagged: Boolean(data.is_flagged),
      fraud_score: data.fraud_score ?? null,
      reason: data.reason || null,
      ml_available: true,
    };
  } catch (err) {
    console.warn('[ml] fraud scoring unavailable:', err.message);
    return { is_flagged: false, fraud_score: null, reason: null, ml_available: false };
  }
};

/** Forecast future fuel demand from a history series. */
export const forecastConsumption = async (payload) => {
  try {
    const { data } = await ml.post('/predict/forecast', payload, { timeout: 20000 });
    return { ...data, ml_available: true };
  } catch (err) {
    console.warn('[ml] forecast unavailable:', err.message);
    return { forecast: [], model: 'unavailable', ml_available: false };
  }
};

/** Retrain the fraud model on this pump's real transaction history. */
export const trainOnHistory = async (samples) => {
  const { data } = await ml.post('/train', { samples }, { timeout: 120000 });
  return data;
};

/**
 * Health probe.
 *
 * The default 2s suits a dashboard, where a slow answer should not hold up the
 * page. A free-tier host sleeps when idle and can take 30s or more to wake, so
 * callers that genuinely need the service — like the backfill script — pass a
 * longer budget rather than concluding it is dead.
 */
export const mlHealth = async ({ timeout = 2000 } = {}) => {
  try {
    const { data } = await ml.get('/health', { timeout });
    return { ...data, reachable: true };
  } catch {
    return { reachable: false };
  }
};

/** Poll until the ML service answers, to wake a sleeping free-tier host. */
export const waitForMl = async ({ attempts = 6, timeout = 20000 } = {}) => {
  for (let i = 1; i <= attempts; i++) {
    const health = await mlHealth({ timeout });
    if (health.reachable) return health;
    if (i < attempts) {
      process.stdout.write(`\r  waking ML service… attempt ${i}/${attempts}`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  process.stdout.write('\n');
  return { reachable: false };
};
