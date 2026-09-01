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

const ml = axios.create({
  baseURL: process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000',
  timeout: 4000,
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

export const mlHealth = async () => {
  try {
    const { data } = await ml.get('/health', { timeout: 2000 });
    return { ...data, reachable: true };
  } catch {
    return { reachable: false };
  }
};
