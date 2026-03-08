"""
미장 시가 박스 전략 - 메인 실행
====================================
사용법:
  1. 환경변수 설정:
     export POLYGON_API_KEY="your_key"      # 또는
     export ALPACA_API_KEY="your_key"
     export ALPACA_SECRET_KEY="your_secret"
     
  2. 실행:
     python main.py                # 1회 스캔
     python main.py --loop         # 반복 스캔 (5분 간격)
     python main.py --backtest     # 백테스트 모드
     python main.py --date 2024-01-15  # 특정일 스캔
"""
import sys
import os
import time
import argparse
import logging
from datetime import datetime
import pytz

# 프로젝트 루트를 경로에 추가
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config.settings import config
from data.market_data import create_data_engine
from strategy.opening_range import OpeningRangeScanner
from reporting.notifier import NotificationManager

ET = pytz.timezone("America/New_York")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("main")


def run_scan(date: str = None, verbose: bool = True):
    """1회 스캔 실행"""
    
    if date is None:
        date = datetime.now(ET).strftime("%Y-%m-%d")
    
    logger.info(f"🚀 스캔 시작: {date}")
    logger.info(f"📋 대상 종목: {len(config.universe)}개")
    
    # 1. 데이터 엔진 초기화
    engine = create_data_engine(config)
    
    # 2. 데이터 수집
    logger.info("📡 데이터 수집 중...")
    data_dict = engine.get_multiple(config.universe, date, config.scan.bar_interval)
    logger.info(f"📊 데이터 수신: {len(data_dict)}개 종목")
    
    if not data_dict:
        logger.warning("데이터 없음. API 키를 확인하세요.")
        return []
    
    # 3. 스캔 실행
    scanner = OpeningRangeScanner(config)
    signals = scanner.scan_universe(data_dict)
    logger.info(f"🎯 발견 신호: {len(signals)}개")
    
    # 4. 알림 전송
    notifier = NotificationManager(config)
    notifier.notify(signals)
    
    return signals


def run_loop(interval_sec: int = 300):
    """반복 스캔 (기본 5분 간격)"""
    
    logger.info("🔄 반복 스캔 모드 시작")
    logger.info(f"⏱️  간격: {interval_sec}초")
    
    while True:
        now = datetime.now(ET)
        
        # 거래 시간 확인 (10:30 ~ 12:30 ET)
        if now.hour < 10 or (now.hour == 10 and now.minute < 30):
            wait = (10 - now.hour) * 3600 + (31 - now.minute) * 60
            logger.info(f"⏳ 박스 형성 대기 중... {wait // 60}분 후 시작")
            time.sleep(min(wait, 60))
            continue
        
        if now.hour > 12 or (now.hour == 12 and now.minute > 30):
            logger.info("🏁 전략 유효 시간 종료")
            break
        
        # 스캔 실행
        try:
            run_scan()
        except Exception as e:
            logger.error(f"스캔 실패: {e}")
        
        logger.info(f"⏳ 다음 스캔까지 {interval_sec}초 대기...")
        time.sleep(interval_sec)


def run_backtest(start_date: str, end_date: str):
    """백테스트 실행"""
    from datetime import timedelta
    
    logger.info(f"📈 백테스트: {start_date} ~ {end_date}")
    
    engine = create_data_engine(config)
    scanner = OpeningRangeScanner(config)
    
    current = datetime.strptime(start_date, "%Y-%m-%d")
    end = datetime.strptime(end_date, "%Y-%m-%d")
    
    all_signals = []
    
    while current <= end:
        # 주말 건너뛰기
        if current.weekday() >= 5:
            current += timedelta(days=1)
            continue
        
        date_str = current.strftime("%Y-%m-%d")
        
        try:
            data_dict = engine.get_multiple(
                config.universe[:10],  # 백테스트 시 종목 수 제한
                date_str,
                config.scan.bar_interval,
            )
            
            if data_dict:
                signals = scanner.scan_universe(data_dict)
                for sig in signals:
                    all_signals.append({
                        "date": date_str,
                        "ticker": sig.ticker,
                        "signal": sig.signal_type.value,
                        "score": sig.score,
                        "entry": sig.entry_zone,
                        "stop": sig.stop_loss,
                        "target1": sig.target1,
                        "rr": sig.reward_risk,
                    })
                logger.info(f"  {date_str}: {len(signals)}개 신호")
        except Exception as e:
            logger.error(f"  {date_str}: 실패 - {e}")
        
        current += timedelta(days=1)
        time.sleep(0.5)  # API 제한 대응
    
    # 결과 저장
    if all_signals:
        import json
        with open("backtest_results.json", "w") as f:
            json.dump(all_signals, f, indent=2, ensure_ascii=False)
        logger.info(f"📊 백테스트 완료: {len(all_signals)}개 신호 → backtest_results.json")
    
    return all_signals


def main():
    parser = argparse.ArgumentParser(description="미장 시가 박스 전략 스캐너")
    parser.add_argument("--loop", action="store_true", help="반복 스캔 모드")
    parser.add_argument("--interval", type=int, default=300, help="스캔 간격(초)")
    parser.add_argument("--date", type=str, default=None, help="특정일 스캔 (YYYY-MM-DD)")
    parser.add_argument("--backtest", action="store_true", help="백테스트 모드")
    parser.add_argument("--bt-start", type=str, default="2024-01-01", help="백테스트 시작일")
    parser.add_argument("--bt-end", type=str, default="2024-03-31", help="백테스트 종료일")
    
    args = parser.parse_args()
    
    print("""
╔══════════════════════════════════════════════════╗
║  📦 미장 시가 박스 전략 스캐너 v2.0              ║
║  US Market Opening Range Box Scanner             ║
╚══════════════════════════════════════════════════╝
    """)
    
    if args.backtest:
        run_backtest(args.bt_start, args.bt_end)
    elif args.loop:
        run_loop(args.interval)
    else:
        run_scan(args.date)


if __name__ == "__main__":
    main()
