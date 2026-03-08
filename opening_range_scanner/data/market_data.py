"""
미장 시가 박스 전략 - 데이터 수집 모듈
다중 데이터 소스 지원 (Polygon, Alpaca, Yahoo Finance)
"""
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Optional, List, Dict
import pytz
import logging

logger = logging.getLogger(__name__)

ET = pytz.timezone("America/New_York")


class MarketDataProvider:
    """데이터 제공자 기본 클래스"""
    
    def get_intraday_bars(self, ticker: str, date: str, interval: str = "1Min") -> pd.DataFrame:
        raise NotImplementedError


class PolygonProvider(MarketDataProvider):
    """Polygon.io 데이터 제공자"""
    
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.polygon.io"
    
    def get_intraday_bars(self, ticker: str, date: str, interval: str = "1Min") -> pd.DataFrame:
        import requests
        
        multiplier = 1
        timespan = "minute"
        if interval == "5Min":
            multiplier = 5
        
        url = (
            f"{self.base_url}/v2/aggs/ticker/{ticker}/range/"
            f"{multiplier}/{timespan}/{date}/{date}"
            f"?adjusted=true&sort=asc&limit=50000&apiKey={self.api_key}"
        )
        
        resp = requests.get(url)
        data = resp.json()
        
        if data.get("resultsCount", 0) == 0:
            return pd.DataFrame()
        
        df = pd.DataFrame(data["results"])
        df["timestamp"] = pd.to_datetime(df["t"], unit="ms", utc=True)
        df["timestamp"] = df["timestamp"].dt.tz_convert(ET)
        df = df.rename(columns={
            "o": "open", "h": "high", "l": "low", 
            "c": "close", "v": "volume"
        })
        df = df.set_index("timestamp")
        df = df[["open", "high", "low", "close", "volume"]]
        
        return df


class AlpacaProvider(MarketDataProvider):
    """Alpaca 데이터 제공자"""
    
    def __init__(self, api_key: str, secret_key: str, base_url: str = "https://paper-api.alpaca.markets"):
        self.api_key = api_key
        self.secret_key = secret_key
        self.base_url = base_url
    
    def get_intraday_bars(self, ticker: str, date: str, interval: str = "1Min") -> pd.DataFrame:
        from alpaca.data.historical import StockHistoricalDataClient
        from alpaca.data.requests import StockBarsRequest
        from alpaca.data.timeframe import TimeFrame
        
        client = StockHistoricalDataClient(self.api_key, self.secret_key)
        
        tf = TimeFrame.Minute if interval == "1Min" else TimeFrame(5, "Min")
        
        request = StockBarsRequest(
            symbol_or_symbols=ticker,
            timeframe=tf,
            start=datetime.strptime(date, "%Y-%m-%d").replace(hour=9, minute=30, tzinfo=ET),
            end=datetime.strptime(date, "%Y-%m-%d").replace(hour=16, minute=0, tzinfo=ET),
        )
        
        bars = client.get_stock_bars(request)
        df = bars.df
        
        if ticker in df.index.get_level_values(0):
            df = df.loc[ticker]
        
        return df[["open", "high", "low", "close", "volume"]]


class YahooProvider(MarketDataProvider):
    """Yahoo Finance 데이터 제공자 (개발/테스트용)"""
    
    def get_intraday_bars(self, ticker: str, date: str, interval: str = "1Min") -> pd.DataFrame:
        import yfinance as yf
        
        yf_interval = "1m" if interval == "1Min" else "5m"
        dt = datetime.strptime(date, "%Y-%m-%d")
        
        stock = yf.Ticker(ticker)
        df = stock.history(
            start=dt.strftime("%Y-%m-%d"),
            end=(dt + timedelta(days=1)).strftime("%Y-%m-%d"),
            interval=yf_interval
        )
        
        if df.empty:
            return df
        
        df.index = df.index.tz_convert(ET) if df.index.tz else df.index.tz_localize(ET)
        df.columns = [c.lower() for c in df.columns]
        
        return df[["open", "high", "low", "close", "volume"]]


class MarketDataEngine:
    """통합 데이터 엔진"""
    
    def __init__(self, provider: MarketDataProvider):
        self.provider = provider
        self._cache: Dict[str, pd.DataFrame] = {}
    
    def get_bars(self, ticker: str, date: str = None, interval: str = "1Min") -> pd.DataFrame:
        if date is None:
            date = datetime.now(ET).strftime("%Y-%m-%d")
        
        cache_key = f"{ticker}_{date}_{interval}"
        if cache_key in self._cache:
            return self._cache[cache_key]
        
        try:
            df = self.provider.get_intraday_bars(ticker, date, interval)
            if not df.empty:
                self._cache[cache_key] = df
            return df
        except Exception as e:
            logger.error(f"데이터 조회 실패 [{ticker}]: {e}")
            return pd.DataFrame()
    
    def get_multiple(self, tickers: List[str], date: str = None, interval: str = "1Min") -> Dict[str, pd.DataFrame]:
        results = {}
        for ticker in tickers:
            df = self.get_bars(ticker, date, interval)
            if not df.empty:
                results[ticker] = df
        return results
    
    def clear_cache(self):
        self._cache.clear()


def create_data_engine(config) -> MarketDataEngine:
    """설정에 따라 적절한 데이터 엔진 생성"""
    if config.api.polygon_api_key:
        provider = PolygonProvider(config.api.polygon_api_key)
        logger.info("Polygon.io 데이터 제공자 사용")
    elif config.api.alpaca_api_key:
        provider = AlpacaProvider(
            config.api.alpaca_api_key,
            config.api.alpaca_secret_key,
            config.api.alpaca_base_url
        )
        logger.info("Alpaca 데이터 제공자 사용")
    else:
        provider = YahooProvider()
        logger.info("Yahoo Finance 데이터 제공자 사용 (개발용)")
    
    return MarketDataEngine(provider)
