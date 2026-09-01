"""
Train the fraud-detection model and save it to models/.

    python train.py

Run this once before starting the API (main.py also trains automatically on
first boot if no saved model is found, so the service is never broken).
"""
from __future__ import annotations

import os

import joblib
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

from features import FEATURE_COLUMNS, synthetic_normal

MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")
MODEL_PATH = os.path.join(MODEL_DIR, "fraud_model.pkl")

# Below this many real transactions, real data is too thin to learn from
# and we fall back to the synthetic bootstrap.
MIN_REAL_SAMPLES = 200


def train(verbose: bool = True, real_samples: list[dict] | None = None):
    """
    Fit the anomaly detector.

    real_samples: actual historical transactions from the database. When these
    are supplied the model learns THIS pump's real rhythm — how often these
    trucks actually fuel, at what hours, at what fill ratios. Synthetic data is
    only a cold-start bootstrap for a brand-new install with no history yet.
    Training on synthetic data and then scoring real traffic is what produces
    a wall of false positives.
    """
    os.makedirs(MODEL_DIR, exist_ok=True)

    import pandas as pd
    from features import build_features

    if real_samples and len(real_samples) >= MIN_REAL_SAMPLES:
        X = pd.concat([build_features(s) for s in real_samples], ignore_index=True)
        source = f"real:{len(X)}"
        # Real history already contains a little fraud. contamination tells the
        # forest what share of the training set to treat as outliers.
        contamination = 0.03
    else:
        X = synthetic_normal(n=4000)
        source = f"synthetic:{len(X)}"
        contamination = 0.02

    # Isolation Forest is distance-agnostic, but scaling keeps every feature on
    # a comparable footing so "hours_since_last = 400" cannot drown out
    # "fill_ratio = 1.3" purely because its numbers are bigger.
    scaler = StandardScaler().fit(X)

    model = IsolationForest(
        n_estimators=200,
        # contamination = the share of traffic to treat as anomalous.
        # A realistic fraud rate for a fuel forecourt is a few percent.
        contamination=contamination,
        max_samples="auto",
        random_state=42,
        n_jobs=-1,
    ).fit(scaler.transform(X))

    bundle = {
        "model": model,
        "scaler": scaler,
        "columns": FEATURE_COLUMNS,
        "version": "1.1.0",
        "trained_on": int(len(X)),
        "source": source,
    }
    joblib.dump(bundle, MODEL_PATH)

    if verbose:
        print(f"✓ Isolation Forest trained on {len(X)} samples ({source})")
        print(f"✓ Saved to {MODEL_PATH}")

        # Sanity check: a physically impossible 130%-of-tank fill at 2 a.m.
        # must score as an anomaly, and an ordinary fill must not.
        probe = pd.DataFrame([
            {"fill_ratio": 0.70, "hour_of_day": 10, "hours_since_last": 72,
             "volume_vs_average": 1.02, "txn_count_30d": 9},
            {"fill_ratio": 1.30, "hour_of_day": 2,  "hours_since_last": 3,
             "volume_vs_average": 1.85, "txn_count_30d": 9},
        ], columns=FEATURE_COLUMNS)
        preds = model.predict(scaler.transform(probe))
        print(f"  normal fill  → {'ANOMALY' if preds[0] == -1 else 'ok'}")
        print(f"  suspect fill → {'ANOMALY' if preds[1] == -1 else 'ok'}")

    return bundle


if __name__ == "__main__":
    train()
