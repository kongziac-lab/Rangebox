"""
미장 시가 박스 전략 - API 서버
실행: python server.py  →  http://localhost:8000
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import pytz
from datetime import datetime, timedelta, time
import logging

from config.settings import config
from data.market_data import create_data_engine
from strategy.opening_range import OpeningRangeScanner

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

ET = pytz.timezone("America/New_York")

app = FastAPI(title="Opening Range Box API", version="2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TICKER_INFO = {
    "AAPL": {"name": "Apple", "sector": "Tech"},
    "MSFT": {"name": "Microsoft", "sector": "Tech"},
    "AMZN": {"name": "Amazon", "sector": "Retail"},
    "NVDA": {"name": "NVIDIA", "sector": "Semi"},
    "GOOGL": {"name": "Alphabet", "sector": "Tech"},
    "META": {"name": "Meta", "sector": "Tech"},
    "TSLA": {"name": "Tesla", "sector": "Auto"},
    "AVGO": {"name": "Broadcom", "sector": "Semi"},
    "COST": {"name": "Costco", "sector": "Retail"},
    "NFLX": {"name": "Netflix", "sector": "Media"},
    "AMD": {"name": "AMD", "sector": "Semi"},
    "ADBE": {"name": "Adobe", "sector": "SaaS"},
    "CRM": {"name": "Salesforce", "sector": "SaaS"},
    "QCOM": {"name": "Qualcomm", "sector": "Semi"},
    "INTC": {"name": "Intel", "sector": "Semi"},
    "INTU": {"name": "Intuit", "sector": "SaaS"},
    "AMAT": {"name": "Applied Materials", "sector": "Semi"},
    "ISRG": {"name": "Intuitive Surgical", "sector": "Health"},
    "BKNG": {"name": "Booking Holdings", "sector": "Travel"},
    "TXN": {"name": "Texas Instruments", "sector": "Semi"},
    "LRCX": {"name": "Lam Research", "sector": "Semi"},
    "MU": {"name": "Micron", "sector": "Semi"},
    "PANW": {"name": "Palo Alto Networks", "sector": "Cyber"},
    "SNPS": {"name": "Synopsys", "sector": "EDA"},
    "KLAC": {"name": "KLA Corp", "sector": "Semi"},
    "MELI": {"name": "MercadoLibre", "sector": "LatAm"},
    "REGN": {"name": "Regeneron", "sector": "Biotech"},
    "MDLZ": {"name": "Mondelez", "sector": "Consumer"},
    "ABNB": {"name": "Airbnb", "sector": "Travel"},
    "CRWD": {"name": "CrowdStrike", "sector": "Cyber"},
    "SPY": {"name": "S&P 500 ETF", "sector": "ETF"},
    "QQQ": {"name": "Nasdaq 100 ETF", "sector": "ETF"},
    "IWM": {"name": "Russell 2000 ETF", "sector": "ETF"},
    "DIA": {"name": "Dow Jones ETF", "sector": "ETF"},
}

BOX_END = time(10, 30)


def get_last_trading_date() -> str:
    """마지막 거래일 자동 계산 (주말·장 전 제외)"""
    now = datetime.now(ET)
    date = now.date()
    if now.hour < 10 or (now.hour == 10 and now.minute < 30):
        date -= timedelta(days=1)
    while date.weekday() >= 5:
        date -= timedelta(days=1)
    return date.strftime("%Y-%m-%d")


def signal_to_dict(sig, avg_vol=None, current_vol=None) -> dict:
    rvol = round(current_vol / avg_vol, 1) if avg_vol and current_vol and avg_vol > 0 else 1.0
    info = TICKER_INFO.get(sig.ticker, {"name": sig.ticker, "sector": "—"})
    cp = sig.current_price
    return {
        "symbol": sig.ticker,
        "name": info["name"],
        "sector": info["sector"],
        "boxHigh": sig.box.high,
        "boxLow": sig.box.low,
        "boxMid": sig.box.mid,
        "boxRange": sig.box.range,
        "boxRangePct": sig.box.range_pct,
        "current": cp,
        "signal": sig.signal_type.value,
        "score": sig.score,
        "entry": sig.entry_zone,
        "stop": sig.stop_loss,
        "target1": sig.target1,
        "target2": sig.target2,
        "rr": sig.reward_risk,
        "rvol": rvol,
        "distHigh": round((cp - sig.box.high) / sig.box.high * 100, 2),
        "distLow": round((cp - sig.box.low) / sig.box.low * 100, 2),
    }


@app.get("/api/status")
def status():
    return {
        "ok": True,
        "last_trading_date": get_last_trading_date(),
        "universe_count": len(config.universe),
    }


@app.get("/api/scan")
def scan(date: str = Query(None, description="YYYY-MM-DD (생략 시 마지막 거래일)")):
    if date is None:
        date = get_last_trading_date()

    logger.info(f"스캔 요청: {date}")
    engine = create_data_engine(config)
    data_dict = engine.get_multiple(config.universe, date, config.scan.bar_interval)
    logger.info(f"데이터 수신: {len(data_dict)}개 종목")

    scanner = OpeningRangeScanner(config)
    results = []

    for ticker, df in data_dict.items():
        try:
            sig = scanner.scan_ticker(ticker, df)
            if sig is None:
                continue
            avg_vol = float(df["volume"].mean()) if not df.empty else None
            trade_bars = df.between_time("10:30", "12:29")
            current_vol = float(trade_bars.iloc[-1]["volume"]) if not trade_bars.empty else None
            results.append(signal_to_dict(sig, avg_vol, current_vol))
        except Exception as e:
            logger.error(f"[{ticker}] 처리 실패: {e}")

    results.sort(key=lambda x: x["score"], reverse=True)
    logger.info(f"신호 {len(results)}개 반환")
    return {"date": date, "count": len(results), "signals": results}


@app.get("/api/candles/{symbol}")
def candles(
    symbol: str,
    date: str = Query(None, description="YYYY-MM-DD (생략 시 마지막 거래일)"),
):
    if date is None:
        date = get_last_trading_date()

    engine = create_data_engine(config)
    df = engine.get_bars(symbol, date, config.scan.bar_interval)

    if df.empty:
        return []

    bars = df.between_time("09:30", "12:30")
    result = []
    for i, (ts, row) in enumerate(bars.iterrows()):
        result.append({
            "i": i,
            "open": round(float(row["open"]), 4),
            "high": round(float(row["high"]), 4),
            "low": round(float(row["low"]), 4),
            "close": round(float(row["close"]), 4),
            "isBoxPeriod": ts.time() < BOX_END,
            "time": ts.strftime("%H:%M"),
        })
    return result


if __name__ == "__main__":
    print("""
╔══════════════════════════════════════════════════╗
║  📦 Opening Range Box  API Server v2.0           ║
║  http://localhost:8000                           ║
╚══════════════════════════════════════════════════╝
    """)
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=False)
