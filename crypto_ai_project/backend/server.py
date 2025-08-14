# server.py
import math
import time
import asyncio
from functools import lru_cache
from typing import List, Dict, Any

import httpx
import numpy as np
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from statsmodels.tsa.arima.model import ARIMA  # lightweight baseline
import uvicorn

COINGECKO_BASE = "https://api.coingecko.com/api/v3"

app = FastAPI(title="CryptoAI Backend", version="1.0")

# CORS: allow your static site to call the API during dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- Utilities ---------------------------------------------------------------

class PredictResponse(BaseModel):
    symbol: str
    id: str
    currency: str = "inr"
    current_price: float | None = None
    pred_3m: float | None = None
    pred_6m: float | None = None
    pred_1y: float | None = None

def _now() -> float:
    return time.time()

@lru_cache(maxsize=256)
def _cache_key(url: str) -> str:
    return url

async def _get_json(url: str, params: Dict[str, Any] | None = None) -> Any:
    # Simple client with a short timeout
    async with httpx.AsyncClient(timeout=20.0) as client:
        r = await client.get(url, params=params)
        if r.status_code != 200:
            raise HTTPException(status_code=r.status_code, detail=r.text)
        return r.json()

# Cheap TTL cache wrapper to ease API quotas
_cache: Dict[str, tuple[float, Any]] = {}
def _get_ttl(key: str, ttl: float) -> Any | None:
    item = _cache.get(key)
    if not item:
        return None
    ts, val = item
    if _now() - ts > ttl:
        return None
    return val

def _set_ttl(key: str, value: Any):
    _cache[key] = (_now(), value)

# ---- Endpoints ---------------------------------------------------------------

@app.get("/api/prices")
async def prices(ids: str, vs_currency: str = "inr"):
    """
    Proxy for simple prices.
    Example: /api/prices?ids=bitcoin,ethereum&vs_currency=inr
    """
    url = f"{COINGECKO_BASE}/simple/price"
    key = f"simple:{ids}:{vs_currency}"
    cached = _get_ttl(key, ttl=30)  # 30s cache
    if cached is not None:
        return cached
    data = await _get_json(url, {"ids": ids, "vs_currencies": vs_currency})
    _set_ttl(key, data)
    return data

@app.get("/api/markets")
async def markets(
    ids: str,
    vs_currency: str = "inr",
    order: str = "market_cap_desc",
    per_page: int = 250,
    page: int = 1,
    sparkline: bool = False,
    price_change_percentage: str = "24h",
):
    """
    Proxy for coins/markets (used on Top Coins page).
    """
    url = f"{COINGECKO_BASE}/coins/markets"
    key = f"markets:{ids}:{vs_currency}:{order}:{per_page}:{page}:{sparkline}:{price_change_percentage}"
    cached = _get_ttl(key, ttl=45)
    if cached is not None:
        return cached
    data = await _get_json(url, {
        "vs_currency": vs_currency,
        "ids": ids,
        "order": order,
        "per_page": per_page,
        "page": page,
        "sparkline": str(sparkline).lower(),
        "price_change_percentage": price_change_percentage
    })
    _set_ttl(key, data)
    return data

@app.get("/api/history/{coin_id}")
async def history(
    coin_id: str,
    vs_currency: str = "inr",
    days: int = 365*2  # 2 years history default
):
    """
    OHLC-like history via market_chart (prices only).
    Returns [[ts_ms, price], ...]
    """
    url = f"{COINGECKO_BASE}/coins/{coin_id}/market_chart"
    key = f"history:{coin_id}:{vs_currency}:{days}"
    cached = _get_ttl(key, ttl=300)
    if cached is not None:
        return cached
    data = await _get_json(url, {"vs_currency": vs_currency, "days": days, "interval": "daily"})
    prices = data.get("prices", [])
    _set_ttl(key, prices)
    return prices

def _arima_forecast(prices: List[float], steps: int) -> float | None:
    """
    Fit a tiny ARIMA(1,1,1) as a baseline and forecast N steps ahead.
    Returns the final step forecast (not path mean).
    """
    try:
        series = np.asarray(prices, dtype=float)
        if len(series) < 30:  # not enough data
            return None
        # Guard against non-positive values for log transform (INR should be fine)
        series = np.maximum(series, 1e-8)
        # Build simple ARIMA
        model = ARIMA(series, order=(1,1,1))
        fit = model.fit(method_kwargs={"warn_convergence": False})
        forecast = fit.forecast(steps=steps)  # array of length `steps`
        return float(forecast[-1])
    except Exception:
        return None

@app.get("/api/predict/{coin_id}", response_model=PredictResponse)
async def predict(
    coin_id: str,
    symbol: str = Query(..., description="Ticker symbol for display, e.g., BTC"),
    vs_currency: str = "inr"
):
    """
    Produce 3M/6M/1Y point predictions using a simple ARIMA baseline on daily closes.
    Horizons are approximated as 90/180/365 trading days ahead.
    """
    hist = await history(coin_id, vs_currency=vs_currency, days=365*3)  # reuse endpoint/caching
    if not hist:
        raise HTTPException(status_code=404, detail="No price history")

    # hist is [[ts_ms, price], ...]
    closes = [p[1] for p in hist]

    # naive "current" from last close
    current = closes[-1] if closes else None

    # Map months to steps (daily series)
    steps_3m = 90
    steps_6m = 180
    steps_1y = 365

    p3 = _arima_forecast(closes, steps_3m)
    p6 = _arima_forecast(closes, steps_6m)
    p12 = _arima_forecast(closes, steps_1y)

    return PredictResponse(
        symbol=symbol,
        id=coin_id,
        currency=vs_currency,
        current_price=current,
        pred_3m=p3,
        pred_6m=p6,
        pred_1y=p12
    )

# Simple health check
@app.get("/api/health")
def health():
    return {"ok": True, "time": _now()}

if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
