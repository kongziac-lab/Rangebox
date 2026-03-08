# 📦 RangeBox — 미장 시가 박스 전략 시스템

미국 주식시장 첫 1시간(09:30~10:30 ET) 고가/저가로 박스를 설정하고,
박스 상단·하단 반응 및 돌파/이탈 신호를 감지해 매매하는 자동화 전략 시스템입니다.

---

## 구성 파일

| 파일 | 설명 |
|------|------|
| `opening_range_box_dashboard.jsx` | React 인터랙티브 대시보드 |
| `pinescript_opening_range_box.pine` | TradingView Pine Script v5 인디케이터 |
| `opening_range_scanner/` | Python 자동 스캐너 패키지 |

---

## 1. React 대시보드

종목 클릭 시 미니차트·박스 레벨·진입/손절/목표가를 한눈에 확인하는 컨트롤 타워입니다.

**탭 구성**
- **스캐너** — 신호 목록, 종목 상세, 박스 레벨
- **아키텍처** — 시스템 구조 다이어그램
- **로드맵** — MVP 1~5 개발 단계
- **규칙** — 실전 매매 규칙 8가지

### 실행

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # 프로덕션 빌드 → dist/
```

---

## 2. TradingView Pine Script

`pinescript_opening_range_box.pine` 전체를 복사해 TradingView에 붙여넣기하면 바로 동작합니다.

**기능**
- 첫 1시간 박스 자동 계산 및 시각화 (상단/중간선/하단)
- 돌파·이탈 감지 (확인 봉 수 설정 가능)
- 반전 캔들 신호 (상단 숏 / 하단 롱 / 눌림목 롱 / 되돌림 숏)
- 1·2차 목표가 라인
- 우측 상단 정보 테이블 (박스값, 범위%, 현재 상태)
- 알림 조건 6종

**설정 항목**

| 그룹 | 항목 | 기본값 |
|------|------|--------|
| 박스 | 형성 구간 | 09:30–10:30 ET |
| 박스 | 전략 유효 구간 | 10:30–12:30 ET |
| 박스 | 상/하단 허용오차 | 0.15% |
| 신호 | 돌파 확인 봉 수 | 2 |
| 리스크 | 1차 목표 배수 | 1.0× |
| 리스크 | 2차 목표 배수 | 2.0× |
| 리스크 | 최소 손익비 | 1.2 |

---

## 3. Python 스캐너

나스닥 100 대상 종목을 자동 스캔해 조건 충족 신호를 콘솔 출력 및 텔레그램으로 전송합니다.

### 설치

```bash
cd opening_range_scanner
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 환경변수 설정

```bash
cp .env.example .env
```

`.env` 파일에서 사용할 데이터 소스와 알림 설정:

```
# 데이터 소스 (택 1 — 없으면 Yahoo Finance 자동 사용)
POLYGON_API_KEY=your_key
ALPACA_API_KEY=your_key
ALPACA_SECRET_KEY=your_secret

# 텔레그램 알림 (선택)
TELEGRAM_BOT_TOKEN=your_token
TELEGRAM_CHAT_ID=your_chat_id
```

### 실행

```bash
python main.py                        # 오늘 1회 스캔
python main.py --loop                 # 5분 간격 반복 (10:30~12:30 ET)
python main.py --date 2026-03-05      # 특정일 스캔
python main.py --backtest             # 백테스트 (기본: 2024 Q1)
python main.py --backtest --bt-start 2025-01-01 --bt-end 2025-03-31
```

### 신호 유형

| 신호 | 설명 |
|------|------|
| `LONG_SETUP` | 돌파 후 눌림목 롱 진입 |
| `SHORT_SETUP` | 이탈 후 되돌림 숏 진입 |
| `RANGE_LONG` | 박스 하단 지지 롱 |
| `RANGE_SHORT` | 박스 상단 저항 숏 |
| `BREAKOUT_WATCH` | 상단 돌파 감시 |
| `BREAKDOWN_WATCH` | 하단 이탈 감시 |
| `LONG_BIAS` | 중간선 위 롱 우위 |
| `SHORT_BIAS` | 중간선 아래 숏 우위 |

### 점수화 기준 (100점)

| 항목 | 배점 |
|------|------|
| 중간선 정렬 | 20 |
| 박스 상/하단 반응 명확성 | 20 |
| 반전 캔들 확인 | 15 |
| 거래량 급증 | 15 |
| 전일 고점/저점 정렬 | 10 |
| 갭 방향 일치 | 10 |
| 손익비 | 10 |

**채택 기준: 점수 ≥ 70 & 손익비 ≥ 1.2**

### 패키지 구조

```
opening_range_scanner/
├── main.py                  # 진입점 (CLI)
├── requirements.txt
├── .env.example
├── config/
│   └── settings.py          # 전략·API·리스크 설정
├── data/
│   └── market_data.py       # Polygon / Alpaca / Yahoo 데이터 수집
├── strategy/
│   └── opening_range.py     # 박스 계산, 신호 분류, 점수화
└── reporting/
    └── notifier.py          # 콘솔 출력 + 텔레그램 알림
```

---

## 실전 규칙

1. 첫 1시간 관망 → 박스 형성 확인
2. 상단 = 숏 진입 또는 돌파 후 눌림목 롱
3. 하단 = 롱 진입 또는 이탈 후 되돌림 숏
4. 추격매매 절대 금지
5. 되돌림에서만 진입
6. 손절은 반드시 박스 기준
7. 손익비 1:1.2 미만 → 패스
8. 연속 3패 → 강제 휴식

---

## 개발 로드맵

| 단계 | 내용 | 상태 |
|------|------|------|
| MVP 1 | TradingView 인디케이터 | ✅ 완료 |
| MVP 2 | Python 스캐너 + 텔레그램 | ✅ 완료 |
| MVP 3 | Google Sheets 대시보드 | ✅ 완료 |
| MVP 4 | AI 필터링 (신호 품질 판단) | 🔜 예정 |
| MVP 5 | 소액 실전 자동매매 | 🔜 예정 |

---

## 데이터 소스 비교

| 소스 | 비용 | 속도 | 권장 용도 |
|------|------|------|-----------|
| Yahoo Finance | 무료 | 보통 | 개발·테스트 |
| Polygon.io | 유료 | 빠름 | 실전 스캔 |
| Alpaca | 무료/유료 | 빠름 | 실전 + 자동매매 |
