"""
미장 시가 박스 전략 - AI 필터링 모듈
OpenAI GPT-4o-mini를 사용해 신호 품질 판단 + 실적/뉴스 위험 감지
"""
import json
import logging
from datetime import datetime, timedelta
from typing import Optional
from openai import OpenAI

logger = logging.getLogger(__name__)

VERDICT_PASS = "PASS"
VERDICT_CAUTION = "CAUTION"
VERDICT_SKIP = "SKIP"


class AISignalFilter:
    """GPT-4o-mini 기반 신호 품질 필터"""

    def __init__(self, api_key: str, model: str = "gpt-4o-mini"):
        self.client = OpenAI(api_key=api_key)
        self.model = model

    # ── 실적 발표 체크 ──────────────────────────────────────────────────
    def _check_earnings(self, ticker: str, date: str) -> Optional[str]:
        try:
            import yfinance as yf
            t = yf.Ticker(ticker)
            cal = t.calendar
            if cal is None:
                return None

            if hasattr(cal, "columns"):
                if "Earnings Date" in cal.columns:
                    ed = cal["Earnings Date"].iloc[0]
                else:
                    return None
            elif isinstance(cal, dict) and "Earnings Date" in cal:
                ed = cal["Earnings Date"]
                if isinstance(ed, list):
                    ed = ed[0]
            else:
                return None

            trade_date = datetime.strptime(date, "%Y-%m-%d")
            if hasattr(ed, "date"):
                ed = ed.date()
            diff = abs((ed - trade_date.date()).days)
            if diff <= 3:
                return f"실적 발표 {diff}일 내 ({ed.strftime('%m/%d')})"
        except Exception as e:
            logger.debug(f"실적 조회 실패 [{ticker}]: {e}")
        return None

    # ── 최근 뉴스 헤드라인 수집 ─────────────────────────────────────────
    def _get_news(self, ticker: str) -> list[str]:
        try:
            import yfinance as yf
            news = yf.Ticker(ticker).news or []
            headlines = []
            for item in news[:3]:
                title = item.get("title") or (item.get("content", {}) or {}).get("title", "")
                if title:
                    headlines.append(title)
            return headlines
        except Exception as e:
            logger.debug(f"뉴스 조회 실패 [{ticker}]: {e}")
            return []

    # ── OpenAI 평가 프롬프트 ─────────────────────────────────────────────
    def _build_prompt(self, sig: dict, date: str, earnings_warning: Optional[str], headlines: list[str]) -> str:
        news_section = ""
        if headlines:
            news_section = "\n최근 뉴스:\n" + "\n".join(f"- {h}" for h in headlines)
        if earnings_warning:
            news_section += f"\n⚠ 실적 경고: {earnings_warning}"

        direction = "LONG" if any(k in sig["signal"] for k in ["LONG", "BREAKOUT"]) else "SHORT"

        return f"""당신은 미국 주식 Opening Range Box 전략 전문 트레이딩 분석가입니다.
다음 신호를 평가하고 JSON으로만 응답하세요.

종목: {sig['symbol']} ({sig.get('name', '')} / {sig.get('sector', '')})
날짜: {date}
방향: {direction}
신호: {sig['signal']}
기술점수: {sig['score']}/100

박스: High ${sig['boxHigh']} / Mid ${sig['boxMid']} / Low ${sig['boxLow']}
박스범위: {sig['boxRangePct']}%
현재가: ${sig['current']}
진입: ${sig['entry']} | 손절: ${sig['stop']} | 목표1: ${sig['target1']} | 목표2: ${sig['target2']}
손익비: {sig['rr']} | RVOL: {sig['rvol']}x{news_section}

평가 기준:
- 박스 범위 0.3~3%: 적정 (너무 좁거나 넓으면 감점)
- RVOL ≥ 1.0: 거래량 양호
- 손익비 ≥ 1.5: 우수
- 실적 발표 3일 이내: 위험
- 기술점수 ≥ 70: PASS 고려

JSON 형식으로만 응답 (다른 텍스트 금지):
{{
  "verdict": "PASS 또는 CAUTION 또는 SKIP",
  "ai_score": 0~100,
  "reasons": ["긍정 근거 1", "긍정 근거 2"],
  "risk_factors": ["리스크 요인 (없으면 빈 배열)"]
}}"""

    # ── 메인 평가 메서드 ─────────────────────────────────────────────────
    def evaluate(self, sig: dict, date: str) -> dict:
        earnings_warning = self._check_earnings(sig["symbol"], date)
        headlines = self._get_news(sig["symbol"])
        prompt = self._build_prompt(sig, date, earnings_warning, headlines)

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                max_tokens=300,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": "You are a trading signal analyst. Respond only in JSON."},
                    {"role": "user", "content": prompt},
                ],
            )
            result = json.loads(response.choices[0].message.content)
        except Exception as e:
            logger.error(f"AI 평가 실패 [{sig['symbol']}]: {e}")
            result = {
                "verdict": VERDICT_CAUTION,
                "ai_score": 50,
                "reasons": ["AI 평가 불가"],
                "risk_factors": [],
            }

        result["earnings_warning"] = earnings_warning
        result["news"] = headlines
        return result

    # ── 배치 평가 ───────────────────────────────────────────────────────
    def evaluate_batch(self, signals: list[dict], date: str) -> list[dict]:
        for sig in signals:
            try:
                sig["ai"] = self.evaluate(sig, date)
                logger.info(
                    f"[AI] {sig['symbol']:6} → {sig['ai']['verdict']:8} "
                    f"ai_score={sig['ai']['ai_score']}"
                )
            except Exception as e:
                logger.error(f"배치 평가 실패 [{sig['symbol']}]: {e}")
                sig["ai"] = None
        return signals
