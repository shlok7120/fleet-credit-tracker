"""
Fleet Credit Tracker — Machine Learning microservice (FastAPI).

Start with:
    source venv/bin/activate
    uvicorn main:app --reload --port 8000

Interactive API docs are then at http://localhost:8000/docs
"""
from __future__ import annotations

import os
from datetime import datetime

import joblib
import numpy as np
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from features import build_features
from forecasting import forecast_series
from train import MODEL_PATH, train

app = FastAPI(
    title="Fleet Credit Tracker — ML Service",
    description="Fraud detection (Isolation Forest) and demand forecasting (ARIMA).",
    version="1.0.0",
)

# Only the Node backend calls this service, never a browser directly, so CORS
# is permissive on methods but the origin list stays explicit. ALLOWED_ORIGINS
# lets the deployed Vercel URL be added without a code change.
_origins = [
    "http://localhost:5173",
    "http://localhost:5001",
    "http://127.0.0.1:5001",
]
if os.getenv("ALLOWED_ORIGINS"):
    _origins += [o.strip() for o in os.getenv("ALLOWED_ORIGINS").split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

BUNDLE: dict | None = None


@app.on_event("startup")
def load_model():
    """Load the saved model, training a fresh one if none exists yet."""
    global BUNDLE
    if os.path.exists(MODEL_PATH):
        BUNDLE = joblib.load(MODEL_PATH)
        print(f"[ml] loaded fraud model v{BUNDLE['version']}")
    else:
        print("[ml] no saved model found — training one now…")
        BUNDLE = train(verbose=False)

    # Warm the forecaster: fit one throwaway ARIMA so the first REAL request
    # does not pay scipy/statsmodels' one-off initialisation cost.
    try:
        from datetime import timedelta
        base = datetime.utcnow().date()
        warm = [
            {"date": str(base - timedelta(days=30 - i)), "value": 100.0 + (i % 7) * 12}
            for i in range(30)
        ]
        forecast_series(warm, periods=3)
        print("[ml] forecaster warmed up")
    except Exception as exc:  # never block startup on the warm-up
        print(f"[ml] forecaster warm-up skipped: {exc}")


# ---------------------------------------------------------------- schemas
class TransactionFeatures(BaseModel):
    volume_liters: float = Field(..., gt=0)
    tank_capacity: float = Field(..., gt=0)
    total_cost: float = 0.0
    fill_ratio: float | None = None
    hour_of_day: int = 12
    hours_since_last_fill: float = 999.0
    avg_volume_30d: float = 0.0
    txn_count_30d: int = 0


class HistoryPoint(BaseModel):
    date: str
    value: float


class ForecastRequest(BaseModel):
    history: list[HistoryPoint]
    periods: int = Field(14, ge=1, le=90)


class TrainRequest(BaseModel):
    """Real historical transactions to fit the anomaly detector on."""
    samples: list[TransactionFeatures] = []


# ------------------------------------------------------------ rule engine
def rule_checks(t: TransactionFeatures) -> tuple[list[str], list[str]]:
    """
    Deterministic red flags, split into two tiers.

    HARD  = physically impossible or provably wrong. One hit is enough to flag;
            no model opinion required.
    SOFT  = suspicious but innocently explainable. A pump that runs late has
            legitimate 11 p.m. fills. One soft hit alone must NOT raise an
            alert, or the admin drowns in false positives and stops reading
            them — which is worse than having no fraud detection at all.
            Two soft hits, or one soft hit that the model also dislikes,
            is what earns a flag.

    Returns (hard_reasons, soft_reasons).
    """
    hard: list[str] = []
    soft: list[str] = []
    ratio = t.volume_liters / t.tank_capacity

    # --- HARD: the fuel could not have fitted in the tank -------------------
    if ratio > 1.05:
        hard.append(
            f"Dispensed {t.volume_liters:.1f} L into a {t.tank_capacity:.0f} L tank "
            f"({ratio * 100:.0f}% of capacity) — physically impossible without a second container."
        )

    # --- HARD: a large refill hours after the last one ----------------------
    if t.hours_since_last_fill < 4 and ratio > 0.5:
        hard.append(
            f"Refilled to {ratio * 100:.0f}% of capacity only "
            f"{t.hours_since_last_fill:.1f} h after the previous fill — "
            "the tank could not have emptied that fast."
        )

    # --- SOFT: outside normal hours ----------------------------------------
    # Deliberately narrow: 00:00–04:59, not "after 11 p.m.". Fleet vehicles
    # genuinely refuel late in the evening.
    if 0 <= t.hour_of_day < 5:
        soft.append(f"Logged at {t.hour_of_day:02d}:00, when the forecourt is normally closed.")

    # --- SOFT: far above this vehicle's own habit ---------------------------
    if t.avg_volume_30d > 0 and t.volume_liters > t.avg_volume_30d * 2.2:
        soft.append(
            f"{t.volume_liters:.1f} L is {t.volume_liters / t.avg_volume_30d:.1f}× this "
            f"vehicle's 30-day average of {t.avg_volume_30d:.1f} L."
        )

    # --- SOFT: token dispense on a large tank -------------------------------
    if t.volume_liters < 5 and t.tank_capacity > 50:
        soft.append(
            f"Only {t.volume_liters:.1f} L dispensed into a {t.tank_capacity:.0f} L tank — "
            "possible card probe or mis-keyed entry."
        )

    return hard, soft


# ---------------------------------------------------------------- routes
@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "fleet-ml",
        "model_loaded": BUNDLE is not None,
        "model_version": BUNDLE["version"] if BUNDLE else None,
        "trained_on": BUNDLE.get("source") if BUNDLE else None,
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.post("/predict/fraud")
def predict_fraud(txn: TransactionFeatures):
    """
    Score one transaction.

    Returns a 0–1 fraud_score (higher = more suspicious), a boolean verdict,
    and a human-readable reason the pump admin can actually act on.
    """
    features = build_features(txn.model_dump())

    ml_anomaly = False
    score = 0.0
    if BUNDLE is not None:
        X = BUNDLE["scaler"].transform(features[BUNDLE["columns"]])
        ml_anomaly = bool(BUNDLE["model"].predict(X)[0] == -1)

        # decision_function: positive = normal, negative = anomalous.
        # Map it onto an intuitive 0–1 scale where 1 means "very suspicious".
        raw = float(BUNDLE["model"].decision_function(X)[0])
        score = float(np.clip(0.5 - raw, 0.0, 1.0))

    hard, soft = rule_checks(txn)

    # --- Verdict ---------------------------------------------------------
    # A hard breach is decisive. A single soft signal is not: it needs either
    # a second soft signal or the model agreeing that the fill looks odd.
    if hard:
        is_flagged = True
        score = max(score, 0.95)
    elif len(soft) >= 2 or (soft and ml_anomaly):
        is_flagged = True
        score = max(score, 0.75)
    elif ml_anomaly:
        is_flagged = True
        score = max(score, 0.60)
    else:
        is_flagged = False

    reasons = hard + soft
    if not is_flagged:
        reason_text = None
    elif reasons:
        reason_text = " ".join(reasons)
    else:
        reason_text = (
            "Statistical anomaly: this fill's combination of volume, timing and "
            "frequency does not match normal fuelling patterns."
        )

    return {
        "is_flagged": is_flagged,
        "fraud_score": round(score, 4),
        "reason": reason_text,
        "severity": "high" if hard else "medium" if is_flagged else "none",
        "rule_hits": reasons,
        "hard_hits": hard,
        "soft_hits": soft,
        "model_anomaly": ml_anomaly,
        "model_version": BUNDLE["version"] if BUNDLE else None,
    }


@app.post("/predict/forecast")
def predict_forecast(req: ForecastRequest):
    """Project future daily fuel consumption from a history series."""
    return forecast_series([h.model_dump() for h in req.history], periods=req.periods)


@app.post("/train")
def retrain(req: TrainRequest | None = None):
    """
    Retrain and hot-reload the fraud model without restarting the service.

    POST with {"samples": [...]} to fit on real transaction history — this is
    what the backend's `npm run backfill` does. POST with no body to fall back
    to the synthetic bootstrap.
    """
    global BUNDLE
    real = [s.model_dump() for s in req.samples] if req and req.samples else None
    BUNDLE = train(verbose=False, real_samples=real)
    return {
        "status": "retrained",
        "version": BUNDLE["version"],
        "samples": BUNDLE["trained_on"],
        "source": BUNDLE.get("source"),
    }


@app.get("/")
def root():
    return {
        "service": "Fleet Credit Tracker ML",
        "docs": "/docs",
        "endpoints": ["/health", "/predict/fraud", "/predict/forecast", "/train"],
    }
