"""
미장 시가 박스 전략 - 설정 파일
"""
import os
from dataclasses import dataclass, field
from typing import List

@dataclass
class MarketConfig:
    """시장 기본 설정"""
    timezone: str = "America/New_York"
    box_start: str = "09:30"
    box_end: str = "10:30"
    trade_start: str = "10:30"
    trade_end: str = "12:30"
    market_close: str = "16:00"

@dataclass
class ScanConfig:
    """스캐너 설정"""
    scan_times_et: List[str] = field(default_factory=lambda: [
        "10:31", "10:35", "11:00", "11:30", "12:00"
    ])
    min_score: int = 70
    max_results: int = 20
    bar_interval: str = "1Min"  # 1분봉

@dataclass
class RiskConfig:
    """리스크 설정"""
    account_risk_pct: float = 0.01      # 1회 거래당 1%
    max_daily_loss_pct: float = 0.03    # 일일 최대 3%
    max_consecutive_losses: int = 3
    min_reward_risk: float = 1.2
    target1_multiplier: float = 1.0
    target2_multiplier: float = 2.0

@dataclass 
class ScoringWeights:
    """점수 가중치"""
    mid_alignment: int = 20           # 중간선 위/아래 정렬
    box_reaction: int = 20            # 박스 상단/하단 반응 명확성
    volume_surge: int = 15            # 거래량 증가
    prev_day_alignment: int = 10      # 전일 고점/저점 정렬
    gap_alignment: int = 10           # 갭 방향 일치
    reversal_candle: int = 15         # 반전 캔들 확인
    reward_risk: int = 10             # 손익비

@dataclass
class FilterConfig:
    """고급 필터"""
    min_market_cap: float = 1e9       # 시가총액 10억달러 이상
    min_avg_volume: int = 500_000     # 평균 거래량 50만주 이상
    min_avg_dollar_volume: float = 5e6  # 평균 거래대금 500만달러
    max_spread_pct: float = 0.05      # 스프레드 0.05% 이하
    min_rvol: float = 0.8             # 상대 거래량 0.8 이상
    exclude_earnings_window_min: int = 30  # 실적 발표 전후 30분

@dataclass
class APIConfig:
    """API 설정"""
    # Polygon.io (우선순위 1)
    polygon_api_key: str = os.getenv("POLYGON_API_KEY", "")
    
    # Alpaca (우선순위 2)
    alpaca_api_key: str = os.getenv("ALPACA_API_KEY", "")
    alpaca_secret_key: str = os.getenv("ALPACA_SECRET_KEY", "")
    alpaca_base_url: str = os.getenv("ALPACA_BASE_URL", "https://paper-api.alpaca.markets")
    
    # Telegram 알림
    telegram_bot_token: str = os.getenv("TELEGRAM_BOT_TOKEN", "")
    telegram_chat_id: str = os.getenv("TELEGRAM_CHAT_ID", "")

    # AI 필터링 (OpenAI)
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")

@dataclass
class Config:
    """통합 설정"""
    market: MarketConfig = field(default_factory=MarketConfig)
    scan: ScanConfig = field(default_factory=ScanConfig)
    risk: RiskConfig = field(default_factory=RiskConfig)
    scoring: ScoringWeights = field(default_factory=ScoringWeights)
    filters: FilterConfig = field(default_factory=FilterConfig)
    api: APIConfig = field(default_factory=APIConfig)
    
    # 종목 유니버스
    universe: List[str] = field(default_factory=lambda: [
        # NASDAQ 100 주요 종목
        "AAPL", "MSFT", "AMZN", "NVDA", "GOOGL", "META", "TSLA", "AVGO",
        "COST", "NFLX", "AMD", "ADBE", "CRM", "QCOM", "INTC", "INTU",
        "AMAT", "ISRG", "BKNG", "TXN", "LRCX", "MU", "PANW", "SNPS",
        "KLAC", "MELI", "REGN", "MDLZ", "ABNB", "CRWD",
        # ETF
        "SPY", "QQQ", "IWM", "DIA",
    ])

# 전역 설정 인스턴스
config = Config()
