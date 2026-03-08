"""
미장 시가 박스 전략 - 핵심 전략 엔진
박스 계산, 신호 분류, 점수화
"""
import pandas as pd
import numpy as np
from dataclasses import dataclass, field
from typing import Optional, List, Tuple, Dict
from enum import Enum
import logging

logger = logging.getLogger(__name__)


# ============================================================================
# 데이터 구조
# ============================================================================

class SignalType(Enum):
    """신호 유형"""
    LONG_SETUP = "LONG_SETUP"           # 롱 셋업
    SHORT_SETUP = "SHORT_SETUP"         # 숏 셋업
    RANGE_LONG = "RANGE_LONG"           # 박스 내 롱
    RANGE_SHORT = "RANGE_SHORT"         # 박스 내 숏
    BREAKOUT_WATCH = "BREAKOUT_WATCH"   # 돌파 감시
    BREAKDOWN_WATCH = "BREAKDOWN_WATCH" # 이탈 감시
    LONG_BIAS = "LONG_BIAS"             # 롱 우위
    SHORT_BIAS = "SHORT_BIAS"           # 숏 우위
    NEUTRAL = "NEUTRAL"                 # 중립


@dataclass
class OpeningBox:
    """첫 1시간 박스"""
    high: float
    low: float
    mid: float
    range: float
    range_pct: float            # 박스 범위 비율 (%)
    open_price: float           # 시가
    first_bar_direction: str    # 첫 봉 방향
    volume_total: float         # 박스 구간 총 거래량
    
    @property
    def is_valid(self) -> bool:
        return self.range > 0 and self.range_pct > 0.1  # 최소 0.1% 범위


@dataclass
class TradeSignal:
    """매매 신호"""
    ticker: str
    signal_type: SignalType
    current_price: float
    box: OpeningBox
    entry_zone: float
    stop_loss: float
    target1: float
    target2: float
    reward_risk: float
    score: int
    reasons: List[str] = field(default_factory=list)
    timestamp: str = ""
    
    @property
    def is_tradeable(self) -> bool:
        return self.score >= 70 and self.reward_risk >= 1.2


# ============================================================================
# 박스 계산 엔진
# ============================================================================

class OpeningRangeCalculator:
    """첫 1시간 박스 계산기"""
    
    def __init__(self, box_start: str = "09:30", box_end: str = "10:30"):
        self.box_start = box_start
        self.box_end = box_end
    
    def calculate(self, df: pd.DataFrame) -> Optional[OpeningBox]:
        """1분봉 데이터에서 박스 계산"""
        try:
            first_hour = df.between_time(self.box_start, "10:29")
            
            if first_hour.empty or len(first_hour) < 10:
                return None
            
            box_high = first_hour["high"].max()
            box_low = first_hour["low"].min()
            box_mid = (box_high + box_low) / 2
            box_range = box_high - box_low
            range_pct = (box_range / box_mid) * 100
            
            open_price = first_hour.iloc[0]["open"]
            first_close = first_hour.iloc[0]["close"]
            first_dir = "UP" if first_close >= open_price else "DOWN"
            vol_total = first_hour["volume"].sum()
            
            return OpeningBox(
                high=round(box_high, 4),
                low=round(box_low, 4),
                mid=round(box_mid, 4),
                range=round(box_range, 4),
                range_pct=round(range_pct, 4),
                open_price=round(open_price, 4),
                first_bar_direction=first_dir,
                volume_total=vol_total,
            )
        except Exception as e:
            logger.error(f"박스 계산 실패: {e}")
            return None


# ============================================================================
# 신호 분류 엔진
# ============================================================================

class SignalClassifier:
    """신호 분류기"""
    
    def __init__(self, tolerance_pct: float = 0.15):
        self.tolerance_pct = tolerance_pct
    
    def classify(
        self, 
        current_price: float, 
        box: OpeningBox,
        recent_bars: pd.DataFrame = None,
    ) -> SignalType:
        """현재가 위치 기반 신호 분류"""
        
        tolerance = box.range * self.tolerance_pct / 100
        
        # 돌파/이탈 감지
        if current_price > box.high + tolerance:
            return SignalType.BREAKOUT_WATCH
        if current_price < box.low - tolerance:
            return SignalType.BREAKDOWN_WATCH
        
        # 상단/하단 근처
        at_high = abs(current_price - box.high) <= box.range * 0.05
        at_low = abs(current_price - box.low) <= box.range * 0.05
        
        if at_high:
            return SignalType.RANGE_SHORT
        if at_low:
            return SignalType.RANGE_LONG
        
        # 중간선 기준
        if current_price > box.mid:
            return SignalType.LONG_BIAS
        if current_price < box.mid:
            return SignalType.SHORT_BIAS
        
        return SignalType.NEUTRAL
    
    def detect_retest(
        self,
        signal_type: SignalType,
        recent_bars: pd.DataFrame,
        box: OpeningBox,
    ) -> Optional[SignalType]:
        """되돌림(리테스트) 감지"""
        if recent_bars is None or len(recent_bars) < 3:
            return None
        
        last = recent_bars.iloc[-1]
        prev = recent_bars.iloc[-2]
        
        # 상단 돌파 후 눌림목 롱
        if signal_type == SignalType.BREAKOUT_WATCH:
            if last["low"] <= box.high * 1.002 and last["close"] > box.high:
                return SignalType.LONG_SETUP
        
        # 하단 이탈 후 되돌림 숏
        if signal_type == SignalType.BREAKDOWN_WATCH:
            if last["high"] >= box.low * 0.998 and last["close"] < box.low:
                return SignalType.SHORT_SETUP
        
        return None


# ============================================================================
# 캔들 분석
# ============================================================================

class CandleAnalyzer:
    """캔들 패턴 분석"""
    
    @staticmethod
    def is_bullish_reversal(bar: pd.Series) -> bool:
        """불리시 반전 캔들"""
        body = abs(bar["close"] - bar["open"])
        lower_wick = bar["open"] - bar["low"] if bar["close"] >= bar["open"] else bar["close"] - bar["low"]
        lower_wick = max(lower_wick, 0)
        
        return lower_wick > body * 1.5 and bar["close"] >= bar["open"]
    
    @staticmethod
    def is_bearish_reversal(bar: pd.Series) -> bool:
        """베어리시 반전 캔들"""
        body = abs(bar["close"] - bar["open"])
        upper_wick = bar["high"] - bar["open"] if bar["close"] <= bar["open"] else bar["high"] - bar["close"]
        upper_wick = max(upper_wick, 0)
        
        return upper_wick > body * 1.5 and bar["close"] <= bar["open"]
    
    @staticmethod
    def is_engulfing_bullish(prev: pd.Series, curr: pd.Series) -> bool:
        """불리시 엔걸핑"""
        return (prev["close"] < prev["open"] and 
                curr["close"] > curr["open"] and
                curr["close"] > prev["open"] and
                curr["open"] < prev["close"])
    
    @staticmethod
    def is_engulfing_bearish(prev: pd.Series, curr: pd.Series) -> bool:
        """베어리시 엔걸핑"""
        return (prev["close"] > prev["open"] and
                curr["close"] < curr["open"] and
                curr["close"] < prev["open"] and
                curr["open"] > prev["close"])


# ============================================================================
# 점수화 엔진
# ============================================================================

class SignalScorer:
    """신호 품질 점수화"""
    
    def __init__(self, weights=None):
        self.weights = weights or {
            "mid_alignment": 20,
            "box_reaction": 20,
            "volume_surge": 15,
            "prev_day_alignment": 10,
            "gap_alignment": 10,
            "reversal_candle": 15,
            "reward_risk": 10,
        }
    
    def score(
        self,
        signal_type: SignalType,
        current_price: float,
        box: OpeningBox,
        recent_bars: pd.DataFrame,
        prev_day_high: float = None,
        prev_day_low: float = None,
        avg_volume: float = None,
    ) -> Tuple[int, List[str]]:
        """종합 점수 계산 (100점 만점)"""
        
        total = 0
        reasons = []
        candle = CandleAnalyzer()
        
        # 1. 중간선 정렬 (20점)
        is_long = signal_type in [
            SignalType.LONG_SETUP, SignalType.LONG_BIAS, 
            SignalType.RANGE_LONG, SignalType.BREAKOUT_WATCH
        ]
        is_short = signal_type in [
            SignalType.SHORT_SETUP, SignalType.SHORT_BIAS,
            SignalType.RANGE_SHORT, SignalType.BREAKDOWN_WATCH
        ]
        
        if (is_long and current_price > box.mid) or (is_short and current_price < box.mid):
            total += self.weights["mid_alignment"]
            reasons.append("✅ 중간선 정렬")
        elif (is_long and current_price <= box.mid) or (is_short and current_price >= box.mid):
            total += self.weights["mid_alignment"] // 2
            reasons.append("⚠️ 중간선 역방향")
        
        # 2. 박스 반응 명확성 (20점)
        if recent_bars is not None and len(recent_bars) >= 2:
            last = recent_bars.iloc[-1]
            
            if is_long and abs(last["low"] - box.low) <= box.range * 0.03:
                total += self.weights["box_reaction"]
                reasons.append("✅ 박스 하단 정확 반응")
            elif is_short and abs(last["high"] - box.high) <= box.range * 0.03:
                total += self.weights["box_reaction"]
                reasons.append("✅ 박스 상단 정확 반응")
            elif signal_type in [SignalType.BREAKOUT_WATCH, SignalType.BREAKDOWN_WATCH]:
                total += self.weights["box_reaction"]
                reasons.append("✅ 돌파/이탈 확인")
            else:
                total += self.weights["box_reaction"] // 2
                reasons.append("⚠️ 반응 불명확")
        
        # 3. 거래량 (15점)
        if recent_bars is not None and avg_volume and avg_volume > 0:
            current_vol = recent_bars.iloc[-1]["volume"]
            rvol = current_vol / avg_volume
            
            if rvol >= 1.5:
                total += self.weights["volume_surge"]
                reasons.append(f"✅ 거래량 급증 (RVOL: {rvol:.1f})")
            elif rvol >= 1.0:
                total += self.weights["volume_surge"] * 2 // 3
                reasons.append(f"⚠️ 거래량 보통 (RVOL: {rvol:.1f})")
            else:
                reasons.append(f"❌ 거래량 부족 (RVOL: {rvol:.1f})")
        
        # 4. 전일 고점/저점 정렬 (10점)
        if prev_day_high and prev_day_low:
            if is_long and current_price > prev_day_high:
                total += self.weights["prev_day_alignment"]
                reasons.append("✅ 전일 고점 돌파 정렬")
            elif is_short and current_price < prev_day_low:
                total += self.weights["prev_day_alignment"]
                reasons.append("✅ 전일 저점 이탈 정렬")
            else:
                total += self.weights["prev_day_alignment"] // 2
        
        # 5. 갭 방향 일치 (10점)
        if box.open_price:
            gap_up = box.open_price > (prev_day_high or box.open_price)
            gap_down = box.open_price < (prev_day_low or box.open_price)
            
            if (is_long and gap_up) or (is_short and gap_down):
                total += self.weights["gap_alignment"]
                reasons.append("✅ 갭 방향 일치")
            elif (is_long and gap_down) or (is_short and gap_up):
                reasons.append("❌ 갭 역방향")
            else:
                total += self.weights["gap_alignment"] // 2
        
        # 6. 반전 캔들 (15점)
        if recent_bars is not None and len(recent_bars) >= 2:
            last = recent_bars.iloc[-1]
            prev = recent_bars.iloc[-2]
            
            if is_long:
                if candle.is_bullish_reversal(last) or candle.is_engulfing_bullish(prev, last):
                    total += self.weights["reversal_candle"]
                    reasons.append("✅ 불리시 반전 캔들")
            elif is_short:
                if candle.is_bearish_reversal(last) or candle.is_engulfing_bearish(prev, last):
                    total += self.weights["reversal_candle"]
                    reasons.append("✅ 베어리시 반전 캔들")
        
        # 7. 손익비 (10점) - 별도 계산 필요
        # reward_risk는 TradeSignal 생성 시 계산
        
        return min(total, 100), reasons


# ============================================================================
# 목표가/손절가 계산
# ============================================================================

class RiskCalculator:
    """리스크 관리 계산기"""
    
    def __init__(self, target1_mult: float = 1.0, target2_mult: float = 2.0):
        self.target1_mult = target1_mult
        self.target2_mult = target2_mult
    
    def calculate_levels(
        self,
        signal_type: SignalType,
        entry: float,
        box: OpeningBox,
    ) -> Dict[str, float]:
        """진입/손절/목표가 계산"""
        
        is_long = signal_type in [
            SignalType.LONG_SETUP, SignalType.LONG_BIAS,
            SignalType.RANGE_LONG, SignalType.BREAKOUT_WATCH
        ]
        
        if is_long:
            stop = box.low - box.range * 0.05
            target1 = entry + box.range * self.target1_mult
            target2 = entry + box.range * self.target2_mult
        else:
            stop = box.high + box.range * 0.05
            target1 = entry - box.range * self.target1_mult
            target2 = entry - box.range * self.target2_mult
        
        risk = abs(entry - stop)
        reward = abs(target1 - entry)
        rr = reward / risk if risk > 0 else 0
        
        return {
            "entry": round(entry, 4),
            "stop_loss": round(stop, 4),
            "target1": round(target1, 4),
            "target2": round(target2, 4),
            "risk": round(risk, 4),
            "reward": round(reward, 4),
            "reward_risk": round(rr, 2),
        }
    
    def calculate_position_size(
        self,
        account_size: float,
        risk_pct: float,
        entry: float,
        stop_loss: float,
    ) -> int:
        """포지션 사이즈 계산"""
        risk_amount = account_size * risk_pct
        per_share_risk = abs(entry - stop_loss)
        
        if per_share_risk <= 0:
            return 0
        
        shares = int(risk_amount / per_share_risk)
        return max(shares, 0)


# ============================================================================
# 통합 스캐너
# ============================================================================

class OpeningRangeScanner:
    """통합 스캐너"""
    
    def __init__(self, config=None):
        from config.settings import Config
        self.config = config or Config()
        self.box_calc = OpeningRangeCalculator()
        self.classifier = SignalClassifier()
        self.scorer = SignalScorer()
        self.risk_calc = RiskCalculator(
            self.config.risk.target1_multiplier,
            self.config.risk.target2_multiplier,
        )
    
    def scan_ticker(
        self,
        ticker: str,
        df: pd.DataFrame,
        prev_day_high: float = None,
        prev_day_low: float = None,
    ) -> Optional[TradeSignal]:
        """개별 종목 스캔"""
        
        # 1. 박스 계산
        box = self.box_calc.calculate(df)
        if box is None or not box.is_valid:
            return None
        
        # 2. 현재가 가져오기
        trade_bars = df.between_time(self.config.market.trade_start, "12:29")
        if trade_bars.empty:
            return None
        
        current_price = trade_bars.iloc[-1]["close"]
        recent = trade_bars.tail(5)
        
        # 3. 신호 분류
        signal_type = self.classifier.classify(current_price, box, recent)
        
        # 되돌림 감지
        retest = self.classifier.detect_retest(signal_type, recent, box)
        if retest:
            signal_type = retest
        
        # 4. 목표가/손절가 계산
        levels = self.risk_calc.calculate_levels(signal_type, current_price, box)
        
        # 5. 점수화
        avg_vol = df["volume"].mean() if not df.empty else None
        score, reasons = self.scorer.score(
            signal_type, current_price, box, recent,
            prev_day_high, prev_day_low, avg_vol,
        )
        
        # 손익비 점수 추가
        if levels["reward_risk"] >= 1.5:
            score = min(score + 10, 100)
            reasons.append(f"✅ 손익비 {levels['reward_risk']:.1f}")
        elif levels["reward_risk"] >= 1.2:
            score = min(score + 5, 100)
            reasons.append(f"⚠️ 손익비 {levels['reward_risk']:.1f}")
        else:
            reasons.append(f"❌ 손익비 부족 ({levels['reward_risk']:.1f})")
        
        return TradeSignal(
            ticker=ticker,
            signal_type=signal_type,
            current_price=current_price,
            box=box,
            entry_zone=levels["entry"],
            stop_loss=levels["stop_loss"],
            target1=levels["target1"],
            target2=levels["target2"],
            reward_risk=levels["reward_risk"],
            score=score,
            reasons=reasons,
            timestamp=str(trade_bars.index[-1]),
        )
    
    def scan_universe(
        self,
        data_dict: Dict[str, pd.DataFrame],
    ) -> List[TradeSignal]:
        """전체 유니버스 스캔"""
        
        signals = []
        for ticker, df in data_dict.items():
            try:
                signal = self.scan_ticker(ticker, df)
                if signal and signal.score >= self.config.scan.min_score:
                    signals.append(signal)
            except Exception as e:
                logger.error(f"스캔 실패 [{ticker}]: {e}")
        
        # 점수 내림차순 정렬
        signals.sort(key=lambda s: s.score, reverse=True)
        
        return signals[:self.config.scan.max_results]
