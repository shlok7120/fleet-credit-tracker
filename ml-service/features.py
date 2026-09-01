"""
Feature engineering shared by training and inference.

Keeping this in ONE place is what stops the classic ML bug called
training/serving skew: the model is trained on columns in one order and
scaled one way, then served slightly differently, and the predictions
quietly become nonsense. Both sides import this module.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

# Stand-in for "we don't know the gap" (a vehicle's first ever fill).
NEUTRAL_GAP_HOURS = 72.0

# Order matters — the model expects exactly these columns, in this sequence.
FEATURE_COLUMNS = [
    "fill_ratio",           # litres dispensed ÷ tank capacity
    "hour_of_day",          # 0–23
    "hours_since_last",     # gap since this vehicle's previous fill
    "volume_vs_average",    # litres ÷ this vehicle's 30-day average
    "txn_count_30d",        # how often this vehicle fuels
]


def build_features(raw: dict) -> pd.DataFrame:
    """Turn one raw transaction payload into a single-row feature frame."""
    tank = float(raw.get("tank_capacity") or 1.0) or 1.0
    volume = float(raw.get("volume_liters") or 0.0)
    avg = float(raw.get("avg_volume_30d") or 0.0)

    # A brand-new vehicle has no average yet; fall back to the current fill so
    # the ratio is a neutral 1.0 rather than a divide-by-zero.
    if avg <= 0:
        avg = volume if volume > 0 else 1.0

    # A vehicle's first-ever fill has no previous fill to measure from. The
    # backend sends 999 to mean "unknown". Feeding 999 to the model makes every
    # first transaction look like a wild outlier, so map unknown to a neutral
    # typical gap instead of an extreme one.
    hours_since = float(raw.get("hours_since_last_fill", 999.0))
    hours_since = NEUTRAL_GAP_HOURS if hours_since >= 900 else min(hours_since, 720.0)

    row = {
        "fill_ratio": round(volume / tank, 4),
        "hour_of_day": float(raw.get("hour_of_day", 12)),
        "hours_since_last": hours_since,
        "volume_vs_average": round(volume / avg, 4),
        "txn_count_30d": float(raw.get("txn_count_30d", 0)),
    }
    return pd.DataFrame([row], columns=FEATURE_COLUMNS)


def synthetic_normal(n: int = 4000, seed: int = 42) -> pd.DataFrame:
    """
    Generate believable NORMAL fuelling behaviour.

    Isolation Forest is an UNSUPERVISED model: we do not hand it labelled
    fraud. We show it what ordinary looks like, and it learns to isolate
    anything that sits far away from that mass of ordinary points.
    """
    rng = np.random.default_rng(seed)

    return pd.DataFrame({
        # Drivers usually fill 45–90% of the tank; the beta shape keeps it
        # realistic rather than uniformly random.
        "fill_ratio": np.clip(rng.beta(5, 3, n) * 0.95 + 0.08, 0.05, 1.0),
        # Pump traffic clusters around morning and evening shifts.
        "hour_of_day": np.clip(
            np.concatenate([
                rng.normal(9.5, 2.0, n // 2),
                rng.normal(17.5, 2.5, n - n // 2),
            ]), 5, 22),
        # Typical gap between fills: about 2–4 days.
        "hours_since_last": np.clip(rng.gamma(shape=4.0, scale=18.0, size=n), 4, 500),
        # Most fills land near the vehicle's own average.
        "volume_vs_average": np.clip(rng.normal(1.0, 0.16, n), 0.35, 1.9),
        "txn_count_30d": np.clip(rng.normal(9, 3.5, n), 1, 30),
    })[FEATURE_COLUMNS]
