# server.py
import time
from typing import Dict, Any, List, Optional

import numpy as np
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

# prefer httpx; fallback to urllib for environments without it
try:
    import httpx
    HAS_HTTPX = True
except Exception:
    import json, urllib.request, urllib.parse
    HAS_HTTPX = False

# statsmodels optional
try:
    from statsmodels.tsa.arima.model import ARIMA
    HAS_ARIMA = True
except Exception:
    HAS_ARIMA = False

COINGECKO_BASE = "https://api.coingecko.com/api/v3"

app = FastAPI(title="Crypto AI Predictor", version="2.2")

# ---------- Static & templates ----------
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# ---------- CORS (dev-friendly) ----------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- Pages ----------
@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/about", response_class=HTMLResponse)
def about(request: Request):
    return templates.TemplateResponse("about.html", {"request": request})

@app.get("/top-coins", response_class=HTMLResponse)
def top_coins(request: Request):
    return templates.TemplateResponse("top_coins.html", {"request": request})

@app.get("/news", response_class=HTMLResponse)
def news_page(request: Request):
    return templates.TemplateResponse("news.html", {"request": request})

@app.get("/portfolio", response_class=HTMLResponse)
def portfolio_page(request: Request):
    return templates.TemplateResponse("portfolio.html", {"request": request})

# ---------- Simple TTL cache ----------
_cache: Dict[str, tuple[float, Any]] = {}

def _now() -> float:
    return time.time()

def _get_ttl(key: str, ttl: float) -> Optional[Any]:
    item = _cache.get(key)
    if not item:
        return None
    ts, val = item
    if _now() - ts > ttl:
        return None
    return val

def _set_ttl(key: str, value: Any):
    _cache[key] = (_now(), value)

# ---------- HTTP helper ----------
async def _aget_json(url: str, params: Optional[Dict[str, Any]] = None, timeout: float = 30.0):
    if HAS_HTTPX:
        async with httpx.AsyncClient(timeout=timeout) as client:  # type: ignore
            r = await client.get(url, params=params)
            if r.status_code != 200:
                raise HTTPException(r.status_code, r.text)
            return r.json()
    # urllib fallback (blocking)
    q = f"{url}?{urllib.parse.urlencode(params or {})}"  # type: ignore
    with urllib.request.urlopen(q, timeout=timeout) as resp:  # type: ignore
        if resp.status != 200:
            raise HTTPException(resp.status, resp.read().decode())
        return json.loads(resp.read().decode())

# ---------- API proxies ----------
@app.get("/api/simple_price")
async def simple_price(ids: str, vs_currency: str = "inr"):
    key = f"sp:{ids}:{vs_currency}"
    cached = _get_ttl(key, 20)
    if cached is not None:
        return cached
    url = f"{COINGECKO_BASE}/simple/price"
    params = {"ids": ids, "vs_currencies": vs_currency}
    data = await _aget_json(url, params)
    _set_ttl(key, data)
    return data

@app.get("/api/history/{coin_id}")
async def history(coin_id: str, vs_currency: str = "inr", days: int = 365):
    key = f"hist:{coin_id}:{vs_currency}:{days}"
    cached = _get_ttl(key, 120)
    if cached is not None:
        return cached
    url = f"{COINGECKO_BASE}/coins/{coin_id}/market_chart"
    params = {"vs_currency": vs_currency, "days": days, "interval": "daily"}
    data = await _aget_json(url, params)
    _set_ttl(key, data)
    return data

@app.get("/api/markets")
async def markets(ids: str, vs_currency: str = "inr"):
    key = f"mkt:{ids}:{vs_currency}"
    cached = _get_ttl(key, 40)
    if cached is not None:
        return cached
    url = f"{COINGECKO_BASE}/coins/markets"
    params = {
        "vs_currency": vs_currency,
        "ids": ids,
        "order": "market_cap_desc",
        "per_page": 250,
        "page": 1,
        "sparkline": "false",
        "price_change_percentage": "24h",
    }
    data = await _aget_json(url, params)
    _set_ttl(key, data)
    return data

# ---------- Prediction helpers ----------
def _pad_sparse(total_len: int, last_idx: int, future_vals: List[float], horizon: int) -> List[Optional[float]]:
    """
    Build a sparse array of length total_len. We write the last historical point
    at last_idx, and a sub-sampled set of future points up to 'horizon' days ahead.
    """
    out: List[Optional[float]] = [None] * total_len
    # last historical price is set by caller if needed
    step_mod = max(1, horizon // 30)  # ~30 plotted points
    for s in range(1, horizon + 1):
        k = last_idx + s
        if k >= total_len:
            break
        if s % step_mod == 0 or s == horizon:
            out[k] = float(future_vals[s - 1])
    return out

def _loglin_forecast_sparse(prices: List[float], horizon: int, total_len: int):
    """
    Log-linear trend on ln(price) vs time, scaled to match last close.
    Returns (last_point_forecast, sparse_series)
    """
    arr = np.asarray(prices, dtype=float)
    n = len(arr)
    if n < 10:
        return None, None
    arr = np.maximum(arr, 1e-9)

    xs = np.arange(n, dtype=float)
    ys = np.log(arr)
    xbar = xs.mean()
    ybar = ys.mean()
    num = np.sum((xs - xbar) * (ys - ybar))
    den = np.sum((xs - xbar) ** 2)
    b1 = 0.0 if den == 0 else float(num / den)
    b0 = float(ybar - b1 * xbar)

    def f(k: int) -> float:
        return float(np.exp(b0 + b1 * k))

    last_idx = n - 1
    model_last = f(last_idx)
    adjust = float(arr[-1] / model_last) if model_last > 0 else 1.0

    future_vals = [f(last_idx + s) * adjust for s in range(1, horizon + 1)]
    series = _pad_sparse(total_len, last_idx, future_vals, horizon)
    # also set the last historical point so lines connect
    series[last_idx] = float(arr[-1])
    return float(future_vals[-1]), series

def _arima_with_drift_sparse(prices: List[float], horizon: int, total_len: int):
    """
    ARIMA(0,1,0) with drift (random walk with drift). If unavailable or fails, returns (None, None).
    """
    if not HAS_ARIMA or len(prices) < 30:
        return None, None
    arr = np.maximum(np.asarray(prices, dtype=float), 1e-9)
    last_idx = len(arr) - 1
    try:
        # ARIMA with constant when d=1 => drift in levels
        model = ARIMA(arr, order=(0, 1, 0), trend="c")
        fit = model.fit(method_kwargs={"warn_convergence": False})
        fc = fit.forecast(steps=horizon)  # ndarray length=horizon
        series = _pad_sparse(total_len, last_idx, list(map(float, fc)), horizon)
        series[last_idx] = float(arr[-1])
        return float(fc[-1]), series
    except Exception:
        return None, None

def _predict_all(closes: List[float]):
    """
    Produce 3M/6M/1Y predictions + sparse series padded to len(closes)+365.
    Uses ARIMA(0,1,0)+drift; if flat/failed, falls back to log-linear trend.
    """
    n = len(closes)
    last = float(closes[-1])
    last_idx = n - 1
    total_len = last_idx + 365 + 1  # pad all series to 1y horizon for chart alignment

    results = {}
    for tag, horizon in (("3m", 90), ("6m", 180), ("1y", 365)):
        p_arima, s_arima = _arima_with_drift_sparse(closes, horizon, total_len)

        use_arima = False
        if p_arima is not None:
            # treat as "too flat" if within 0.1% of last
            if abs(p_arima - last) / max(1e-9, last) > 0.001:
                use_arima = True

        if use_arima:
            pred, series = p_arima, s_arima
        else:
            # fallback produces directional forecast even when random-walk is flat
            pred, series = _loglin_forecast_sparse(closes, horizon, total_len)

        results[tag] = (pred, series)

    return {
        "pred_3m": results["3m"][0],
        "pred_6m": results["6m"][0],
        "pred_1y": results["1y"][0],
        "series3m": results["3m"][1],
        "series6m": results["6m"][1],
        "series1y": results["1y"][1],
        "total_len": total_len,
    }

# ---------- Predictions endpoint ----------
@app.get("/api/predict/{coin_id}")
async def predict(coin_id: str, symbol: str, vs_currency: str = "inr"):
    hist = await history(coin_id, vs_currency=vs_currency, days=365)
    pts = hist.get("prices", [])
    if not pts:
        raise HTTPException(404, "No history")
    closes = [p[1] for p in pts]
    current = float(closes[-1])

    out = _predict_all(closes)

    return {
        "symbol": symbol,
        "id": coin_id,
        "currency": vs_currency,
        "current_price": current,
        "pred_3m": out["pred_3m"],
        "pred_6m": out["pred_6m"],
        "pred_1y": out["pred_1y"],
        "series3m": out["series3m"],
        "series6m": out["series6m"],
        "series1y": out["series1y"],
    }

# ---------- News placeholder ----------
@app.get("/api/news")
def fake_news():
    articles = []
    for i in range(1, 11):
        articles.append({
            "id": i,
            "title": f"Crypto Market Insight #{i}: Signals, On-chain, and Macro",
            "image": "/static/images/news_placeholder.png",
            "content": ("This is a placeholder article to demonstrate the layout without needing a paid API. "
                        "Replace /api/news in server.py with your own provider. ") * 40
        })
    return {"articles": articles}

# ---------- Health ----------
@app.get("/api/health")
def health():
    return {"ok": True, "time": _now()}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=True)
