"""
미장 시가 박스 전략 - 알림 시스템
텔레그램, 콘솔 출력 지원
"""
import logging
from typing import List
from strategy.opening_range import TradeSignal

logger = logging.getLogger(__name__)


class ConsoleNotifier:
    """콘솔 출력"""
    
    def send(self, signals: List[TradeSignal]):
        if not signals:
            print("\n📭 조건 충족 신호 없음\n")
            return
        
        print("\n" + "=" * 80)
        print("📊 미장 시가 박스 스캐너 결과")
        print("=" * 80)
        
        for i, sig in enumerate(signals, 1):
            direction = "🟢 LONG" if "LONG" in sig.signal_type.value or "BREAKOUT" in sig.signal_type.value else "🔴 SHORT"
            
            print(f"\n{'─' * 60}")
            print(f"  #{i} {sig.ticker}  {direction}  [{sig.signal_type.value}]  점수: {sig.score}/100")
            print(f"  현재가: ${sig.current_price:.2f}")
            print(f"  📦 박스: ${sig.box.high:.2f} / ${sig.box.mid:.2f} / ${sig.box.low:.2f}  (범위: {sig.box.range_pct:.2f}%)")
            print(f"  🎯 진입: ${sig.entry_zone:.2f}  손절: ${sig.stop_loss:.2f}")
            print(f"  🏁 목표1: ${sig.target1:.2f}  목표2: ${sig.target2:.2f}")
            print(f"  ⚖️  손익비: {sig.reward_risk:.1f}")
            
            if sig.reasons:
                print(f"  📝 근거:")
                for reason in sig.reasons:
                    print(f"     {reason}")
        
        print(f"\n{'=' * 80}\n")


class TelegramNotifier:
    """텔레그램 알림"""
    
    def __init__(self, bot_token: str, chat_id: str):
        self.bot_token = bot_token
        self.chat_id = chat_id
    
    def send(self, signals: List[TradeSignal]):
        if not signals:
            return
        
        import requests
        
        for sig in signals:
            direction = "🟢 LONG" if "LONG" in sig.signal_type.value or "BREAKOUT" in sig.signal_type.value else "🔴 SHORT"
            
            msg = (
                f"{direction} {sig.ticker}\n"
                f"Signal: {sig.signal_type.value}\n"
                f"Score: {sig.score}/100\n"
                f"Price: ${sig.current_price:.2f}\n"
                f"Box: ${sig.box.high:.2f} / ${sig.box.mid:.2f} / ${sig.box.low:.2f}\n"
                f"Entry: ${sig.entry_zone:.2f}\n"
                f"Stop: ${sig.stop_loss:.2f}\n"
                f"T1: ${sig.target1:.2f} | T2: ${sig.target2:.2f}\n"
                f"R:R = {sig.reward_risk:.1f}\n"
            )
            
            try:
                url = f"https://api.telegram.org/bot{self.bot_token}/sendMessage"
                requests.post(url, json={
                    "chat_id": self.chat_id,
                    "text": msg,
                    "parse_mode": "HTML",
                })
            except Exception as e:
                logger.error(f"텔레그램 전송 실패: {e}")


class NotificationManager:
    """알림 관리자"""
    
    def __init__(self, config):
        self.notifiers = [ConsoleNotifier()]
        
        if config.api.telegram_bot_token and config.api.telegram_chat_id:
            self.notifiers.append(
                TelegramNotifier(config.api.telegram_bot_token, config.api.telegram_chat_id)
            )
            logger.info("텔레그램 알림 활성화")
    
    def notify(self, signals: List[TradeSignal]):
        for notifier in self.notifiers:
            try:
                notifier.send(signals)
            except Exception as e:
                logger.error(f"알림 실패: {e}")
