"""
Fuel-demand forecasting with ARIMA.

ARIMA (AutoRegressive Integrated Moving Average) reads a time series and
projects it forward. For a fleet, "how many litres will this client draw
next fortnight?" tells the pump how much stock to hold and tells the client
whether their credit line will last the month.
"""
from __future__ import annotations

import warnings
from datetime import datetime, timedelta

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")  # statsmodels is very chatty about convergence

# Import ARIMA at MODULE level, not inside the request handler.
# statsmodels pulls in scipy and takes several seconds to import the first
# time. Doing that lazily meant the first user's forecast request paid the
# whole cost and timed out. Paying it once at startup keeps every request fast.
try:
    from statsmodels.tsa.arima.model import ARIMA
    ARIMA_AVAILABLE = True
except ImportError:  # pragma: no cover - statsmodels is in requirements.txt
    ARIMA = None
    ARIMA_AVAILABLE = False

MIN_POINTS_FOR_ARIMA = 21


def _moving_average_forecast(series: pd.Series, periods: int):
    """Fallback when there is too little history for ARIMA to be meaningful."""
    window = min(7, max(1, len(series)))
    baseline = float(series.tail(window).mean()) if len(series) else 0.0
    return [max(0.0, baseline)] * periods, "moving_average_fallback", None


def forecast_series(history: list[dict], periods: int = 14) -> dict:
    """
    history: [{"date": "2026-08-01", "value": 412.5}, ...]
    returns: forecast points, the model actually used, and fit diagnostics.
    """
    if not history:
        return {
            "forecast": [], "model": "no_data", "periods": periods,
            "total_predicted": 0.0, "daily_average": 0.0, "aic": None,
        }

    df = pd.DataFrame(history)
    df["date"] = pd.to_datetime(df["date"])
    df = df.sort_values("date").set_index("date")
    series = df["value"].astype(float).asfreq("D").fillna(0.0)

    aic = None
    if ARIMA_AVAILABLE and len(series) >= MIN_POINTS_FOR_ARIMA and series.sum() > 0:
        try:
            # order=(p,d,q): 2 autoregressive lags, 1 difference to remove
            # trend, 2 moving-average terms. A solid general-purpose default
            # for daily demand that has drift but no strong seasonality.
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                fitted = ARIMA(series, order=(2, 1, 2)).fit()
                raw = fitted.forecast(steps=periods)
            values = [max(0.0, float(v)) for v in raw]
            model_name = "ARIMA(2,1,2)"
            aic = round(float(fitted.aic), 2)
        except Exception:
            values, model_name, aic = _moving_average_forecast(series, periods)
    else:
        values, model_name, aic = _moving_average_forecast(series, periods)

    last_date = series.index[-1]
    points = [
        {
            "date": (last_date + timedelta(days=i + 1)).strftime("%Y-%m-%d"),
            "predicted": round(v, 2),
        }
        for i, v in enumerate(values)
    ]

    return {
        "forecast": points,
        "model": model_name,
        "periods": periods,
        "aic": aic,
        "total_predicted": round(float(np.sum(values)), 2),
        "daily_average": round(float(np.mean(values)) if len(values) else 0.0, 2),
        "history_points": int(len(series)),
        "historical_daily_average": round(float(series.mean()), 2),
    }
