/**
 * ============================================================================
 * 미장 시가 박스 전략 - Google Sheets 자동 스캐너
 * ============================================================================
 * 
 * 설정 방법:
 * 1. Google Sheets 열기
 * 2. 확장 프로그램 > Apps Script 클릭
 * 3. 이 코드를 Code.gs에 붙여넣기
 * 4. API_KEY 변수에 API 키 입력 (Polygon.io 또는 Twelve Data)
 * 5. 시트 구조 생성: onOpen() 메뉴에서 "시트 초기화" 실행
 * 6. 트리거 설정: 평일 10:31 ET에 scanOpeningRange() 자동 실행
 * 
 * API 추천:
 * - Polygon.io (무료 티어: 5 API calls/min)
 * - Twelve Data (무료 티어: 800 API calls/day)
 * - Alpha Vantage (무료 티어: 25 API calls/day)
 */

// ============================================================================
// 설정
// ============================================================================

const CONFIG = {
  // API 설정 (택 1)
  API_PROVIDER: "polygon",  // "polygon" | "twelvedata" | "alphavantage"
  API_KEY: "YOUR_API_KEY_HERE",
  
  // 시간 설정 (ET 기준)
  BOX_START: "09:30",
  BOX_END: "10:30",
  TRADE_START: "10:30",
  TRADE_END: "12:30",
  
  // 전략 설정
  MIN_SCORE: 70,
  TOLERANCE_PCT: 0.15,
  TARGET1_MULT: 1.0,
  TARGET2_MULT: 2.0,
  MIN_RR: 1.2,
  
  // 스캔 간격
  SCAN_INTERVAL_MIN: 5,
  
  // 알림
  SEND_EMAIL: true,
  EMAIL_RECIPIENTS: "",  // 콤마로 구분
};

// 종목 유니버스
const UNIVERSE = [
  "AAPL", "MSFT", "AMZN", "NVDA", "GOOGL", "META", "TSLA", "AVGO",
  "COST", "NFLX", "AMD", "ADBE", "CRM", "QCOM", "INTC",
  "SPY", "QQQ", "IWM",
];


// ============================================================================
// 메뉴 및 초기화
// ============================================================================

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu("📦 박스 전략")
    .addItem("시트 초기화", "initializeSheets")
    .addItem("스캔 실행", "scanOpeningRange")
    .addItem("대시보드 갱신", "updateDashboard")
    .addItem("트리거 설정", "setupTriggers")
    .addItem("트리거 제거", "removeTriggers")
    .addToUi();
}


function initializeSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 시트 1: Universe
  let sheet = getOrCreateSheet(ss, "Universe");
  sheet.getRange("A1:E1").setValues([["Ticker", "Sector", "Market Cap", "Avg Volume", "Active"]]);
  sheet.getRange("A1:E1").setFontWeight("bold").setBackground("#1a1a2e");
  sheet.getRange("A1:E1").setFontColor("white");
  
  UNIVERSE.forEach((ticker, i) => {
    sheet.getRange(i + 2, 1).setValue(ticker);
    sheet.getRange(i + 2, 5).setValue(true);
  });
  
  // 시트 2: RawData
  sheet = getOrCreateSheet(ss, "RawData");
  sheet.getRange("A1:G1").setValues([["Ticker", "Timestamp", "Open", "High", "Low", "Close", "Volume"]]);
  sheet.getRange("A1:G1").setFontWeight("bold").setBackground("#16213e");
  sheet.getRange("A1:G1").setFontColor("white");
  
  // 시트 3: BoxCalc
  sheet = getOrCreateSheet(ss, "BoxCalc");
  sheet.getRange("A1:I1").setValues([[
    "Ticker", "Box High", "Box Low", "Mid", "Range", 
    "Current Price", "Dist to High", "Dist to Low", "Bias"
  ]]);
  sheet.getRange("A1:I1").setFontWeight("bold").setBackground("#0f3460");
  sheet.getRange("A1:I1").setFontColor("white");
  
  // 시트 4: Signals
  sheet = getOrCreateSheet(ss, "Signals");
  sheet.getRange("A1:J1").setValues([[
    "Ticker", "Signal Type", "Entry Zone", "Stop Loss", 
    "Target 1", "Target 2", "R:R", "Score", "Time", "Status"
  ]]);
  sheet.getRange("A1:J1").setFontWeight("bold").setBackground("#533483");
  sheet.getRange("A1:J1").setFontColor("white");
  
  // 시트 5: Dashboard
  sheet = getOrCreateSheet(ss, "Dashboard");
  sheet.getRange("A1").setValue("📦 미장 시가 박스 전략 대시보드");
  sheet.getRange("A1").setFontSize(16).setFontWeight("bold");
  sheet.getRange("A3").setValue("🟢 LONG 후보");
  sheet.getRange("A3").setFontSize(12).setFontWeight("bold").setFontColor("#00b894");
  sheet.getRange("F3").setValue("🔴 SHORT 후보");
  sheet.getRange("F3").setFontSize(12).setFontWeight("bold").setFontColor("#d63031");
  
  SpreadsheetApp.getActiveSpreadsheet().toast("시트 초기화 완료!", "📦 박스 전략");
}


// ============================================================================
// 핵심 스캔 로직
// ============================================================================

function scanOpeningRange() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tickers = getActiveTickers(ss);
  
  Logger.log(`스캔 시작: ${tickers.length}개 종목`);
  
  const results = [];
  
  for (const ticker of tickers) {
    try {
      Utilities.sleep(200); // API 제한 대응
      
      const bars = fetchIntradayBars(ticker);
      if (!bars || bars.length === 0) continue;
      
      const box = calcOpeningRange(bars);
      if (!box) continue;
      
      const currentBar = bars[bars.length - 1];
      const signal = classifySignal(currentBar.close, box);
      const levels = calcLevels(signal, currentBar.close, box);
      const score = calcScore(signal, currentBar, box, bars);
      
      results.push({
        ticker,
        box,
        signal,
        levels,
        score,
        currentPrice: currentBar.close,
        time: new Date().toLocaleTimeString("en-US", {timeZone: "America/New_York"}),
      });
      
    } catch (e) {
      Logger.log(`${ticker} 실패: ${e.message}`);
    }
  }
  
  // 결과 기록
  writeBoxCalc(ss, results);
  writeSignals(ss, results);
  updateDashboard_(ss, results);
  
  // 알림
  const tradeableSignals = results.filter(r => r.score >= CONFIG.MIN_SCORE);
  if (tradeableSignals.length > 0 && CONFIG.SEND_EMAIL && CONFIG.EMAIL_RECIPIENTS) {
    sendEmailAlert(tradeableSignals);
  }
  
  ss.toast(`스캔 완료: ${results.length}개 분석, ${tradeableSignals.length}개 신호`, "📦");
}


// ============================================================================
// 데이터 수집
// ============================================================================

function fetchIntradayBars(ticker) {
  switch (CONFIG.API_PROVIDER) {
    case "polygon":
      return fetchFromPolygon(ticker);
    case "twelvedata":
      return fetchFromTwelveData(ticker);
    default:
      throw new Error(`지원하지 않는 API: ${CONFIG.API_PROVIDER}`);
  }
}


function fetchFromPolygon(ticker) {
  const today = Utilities.formatDate(new Date(), "America/New_York", "yyyy-MM-dd");
  const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/minute/${today}/${today}?adjusted=true&sort=asc&limit=50000&apiKey=${CONFIG.API_KEY}`;
  
  const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const data = JSON.parse(response.getContentText());
  
  if (!data.results || data.results.length === 0) return null;
  
  return data.results.map(r => ({
    timestamp: new Date(r.t),
    open: r.o,
    high: r.h,
    low: r.l,
    close: r.c,
    volume: r.v,
  }));
}


function fetchFromTwelveData(ticker) {
  const url = `https://api.twelvedata.com/time_series?symbol=${ticker}&interval=1min&outputsize=390&timezone=America/New_York&apikey=${CONFIG.API_KEY}`;
  
  const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const data = JSON.parse(response.getContentText());
  
  if (!data.values || data.values.length === 0) return null;
  
  return data.values.reverse().map(v => ({
    timestamp: new Date(v.datetime),
    open: parseFloat(v.open),
    high: parseFloat(v.high),
    low: parseFloat(v.low),
    close: parseFloat(v.close),
    volume: parseInt(v.volume),
  }));
}


// ============================================================================
// 전략 계산
// ============================================================================

function calcOpeningRange(bars) {
  // 09:30 ~ 10:29 구간 필터
  const firstHour = bars.filter(b => {
    const h = b.timestamp.getHours();
    const m = b.timestamp.getMinutes();
    const totalMin = h * 60 + m;
    return totalMin >= 570 && totalMin < 630; // 9:30=570, 10:30=630
  });
  
  if (firstHour.length < 10) return null;
  
  const boxHigh = Math.max(...firstHour.map(b => b.high));
  const boxLow = Math.min(...firstHour.map(b => b.low));
  const boxMid = (boxHigh + boxLow) / 2;
  const boxRange = boxHigh - boxLow;
  
  if (boxRange <= 0) return null;
  
  return {
    high: boxHigh,
    low: boxLow,
    mid: boxMid,
    range: boxRange,
    rangePct: (boxRange / boxMid) * 100,
  };
}


function classifySignal(currentPrice, box) {
  const tolerance = box.range * CONFIG.TOLERANCE_PCT / 100;
  
  if (currentPrice > box.high + tolerance) return "BREAKOUT_WATCH";
  if (currentPrice < box.low - tolerance) return "BREAKDOWN_WATCH";
  
  if (Math.abs(currentPrice - box.high) <= box.range * 0.03) return "RANGE_SHORT";
  if (Math.abs(currentPrice - box.low) <= box.range * 0.03) return "RANGE_LONG";
  
  if (currentPrice > box.mid) return "LONG_BIAS";
  if (currentPrice < box.mid) return "SHORT_BIAS";
  
  return "NEUTRAL";
}


function calcLevels(signal, entry, box) {
  const isLong = ["LONG_BIAS", "RANGE_LONG", "BREAKOUT_WATCH", "LONG_SETUP"].includes(signal);
  
  let stop, target1, target2;
  
  if (isLong) {
    stop = box.low - box.range * 0.05;
    target1 = entry + box.range * CONFIG.TARGET1_MULT;
    target2 = entry + box.range * CONFIG.TARGET2_MULT;
  } else {
    stop = box.high + box.range * 0.05;
    target1 = entry - box.range * CONFIG.TARGET1_MULT;
    target2 = entry - box.range * CONFIG.TARGET2_MULT;
  }
  
  const risk = Math.abs(entry - stop);
  const reward = Math.abs(target1 - entry);
  const rr = risk > 0 ? reward / risk : 0;
  
  return {
    entry: Math.round(entry * 100) / 100,
    stop: Math.round(stop * 100) / 100,
    target1: Math.round(target1 * 100) / 100,
    target2: Math.round(target2 * 100) / 100,
    rr: Math.round(rr * 100) / 100,
  };
}


function calcScore(signal, currentBar, box, bars) {
  let score = 0;
  
  // 중간선 정렬 (20점)
  const isLong = ["LONG_BIAS", "RANGE_LONG", "BREAKOUT_WATCH"].includes(signal);
  if ((isLong && currentBar.close > box.mid) || (!isLong && currentBar.close < box.mid)) {
    score += 20;
  }
  
  // 박스 반응 (20점)
  if (signal === "BREAKOUT_WATCH" || signal === "BREAKDOWN_WATCH") {
    score += 20;
  } else if (
    (isLong && Math.abs(currentBar.low - box.low) <= box.range * 0.05) ||
    (!isLong && Math.abs(currentBar.high - box.high) <= box.range * 0.05)
  ) {
    score += 20;
  } else {
    score += 10;
  }
  
  // 거래량 (15점)
  if (bars.length > 20) {
    const avgVol = bars.slice(-20).reduce((s, b) => s + b.volume, 0) / 20;
    const rvol = currentBar.volume / avgVol;
    if (rvol >= 1.5) score += 15;
    else if (rvol >= 1.0) score += 10;
  }
  
  // 반전 캔들 (15점)
  const body = Math.abs(currentBar.close - currentBar.open);
  const lowerWick = Math.min(currentBar.open, currentBar.close) - currentBar.low;
  const upperWick = currentBar.high - Math.max(currentBar.open, currentBar.close);
  
  if (isLong && lowerWick > body * 1.5 && currentBar.close >= currentBar.open) {
    score += 15;
  } else if (!isLong && upperWick > body * 1.5 && currentBar.close <= currentBar.open) {
    score += 15;
  }
  
  // 손익비 보너스 (10점)
  const levels = calcLevels(signal, currentBar.close, box);
  if (levels.rr >= 1.5) score += 10;
  else if (levels.rr >= 1.2) score += 5;
  
  return Math.min(score, 100);
}


// ============================================================================
// 시트 기록
// ============================================================================

function writeBoxCalc(ss, results) {
  const sheet = ss.getSheetByName("BoxCalc");
  if (!sheet) return;
  
  // 기존 데이터 삭제 (헤더 제외)
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, 9).clearContent();
  }
  
  results.forEach((r, i) => {
    const row = i + 2;
    sheet.getRange(row, 1, 1, 9).setValues([[
      r.ticker,
      r.box.high,
      r.box.low,
      r.box.mid,
      r.box.range,
      r.currentPrice,
      ((r.currentPrice - r.box.high) / r.box.high * 100).toFixed(2) + "%",
      ((r.currentPrice - r.box.low) / r.box.low * 100).toFixed(2) + "%",
      r.signal,
    ]]);
    
    // 바이어스 색상
    const biasCell = sheet.getRange(row, 9);
    if (r.signal.includes("LONG") || r.signal.includes("BREAKOUT")) {
      biasCell.setBackground("#d4edda").setFontColor("#155724");
    } else if (r.signal.includes("SHORT") || r.signal.includes("BREAKDOWN")) {
      biasCell.setBackground("#f8d7da").setFontColor("#721c24");
    } else {
      biasCell.setBackground("#fff3cd").setFontColor("#856404");
    }
  });
}


function writeSignals(ss, results) {
  const sheet = ss.getSheetByName("Signals");
  if (!sheet) return;
  
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, 10).clearContent();
  }
  
  const tradeable = results
    .filter(r => r.score >= CONFIG.MIN_SCORE)
    .sort((a, b) => b.score - a.score);
  
  tradeable.forEach((r, i) => {
    const row = i + 2;
    sheet.getRange(row, 1, 1, 10).setValues([[
      r.ticker,
      r.signal,
      r.levels.entry,
      r.levels.stop,
      r.levels.target1,
      r.levels.target2,
      r.levels.rr,
      r.score,
      r.time,
      r.score >= 80 ? "🔥 HIGH" : "⚡ ACTIVE",
    ]]);
    
    // 점수 색상
    const scoreCell = sheet.getRange(row, 8);
    if (r.score >= 80) {
      scoreCell.setBackground("#00b894").setFontColor("white");
    } else {
      scoreCell.setBackground("#fdcb6e").setFontColor("#2d3436");
    }
  });
}


function updateDashboard_(ss, results) {
  const sheet = ss.getSheetByName("Dashboard");
  if (!sheet) return;
  
  // 시간 갱신
  const now = new Date();
  sheet.getRange("A2").setValue(
    `마지막 갱신: ${Utilities.formatDate(now, "America/New_York", "HH:mm:ss")} ET`
  );
  
  // 롱/숏 분리
  const longs = results
    .filter(r => r.score >= CONFIG.MIN_SCORE && 
      (r.signal.includes("LONG") || r.signal.includes("BREAKOUT")))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  
  const shorts = results
    .filter(r => r.score >= CONFIG.MIN_SCORE && 
      (r.signal.includes("SHORT") || r.signal.includes("BREAKDOWN")))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  
  // 롱 후보 (A열)
  sheet.getRange("A4:D14").clearContent();
  sheet.getRange("A4:D4").setValues([["Ticker", "Score", "Price", "Signal"]]);
  sheet.getRange("A4:D4").setFontWeight("bold");
  
  longs.forEach((r, i) => {
    sheet.getRange(5 + i, 1, 1, 4).setValues([
      [r.ticker, r.score, r.currentPrice, r.signal]
    ]);
  });
  
  // 숏 후보 (F열)
  sheet.getRange("F4:I14").clearContent();
  sheet.getRange("F4:I4").setValues([["Ticker", "Score", "Price", "Signal"]]);
  sheet.getRange("F4:I4").setFontWeight("bold");
  
  shorts.forEach((r, i) => {
    sheet.getRange(5 + i, 6, 1, 4).setValues([
      [r.ticker, r.score, r.currentPrice, r.signal]
    ]);
  });
}


// ============================================================================
// 알림
// ============================================================================

function sendEmailAlert(signals) {
  const subject = `📦 박스 전략 신호: ${signals.length}개 발견`;
  
  let body = "미장 시가 박스 전략 스캔 결과\n\n";
  
  signals.forEach(r => {
    const dir = r.signal.includes("LONG") || r.signal.includes("BREAKOUT") ? "🟢 LONG" : "🔴 SHORT";
    body += `${dir} ${r.ticker} [${r.signal}] 점수: ${r.score}\n`;
    body += `  현재가: $${r.currentPrice}  진입: $${r.levels.entry}\n`;
    body += `  손절: $${r.levels.stop}  목표: $${r.levels.target1}\n`;
    body += `  손익비: ${r.levels.rr}\n\n`;
  });
  
  if (CONFIG.EMAIL_RECIPIENTS) {
    MailApp.sendEmail(CONFIG.EMAIL_RECIPIENTS, subject, body);
  }
}


// ============================================================================
// 유틸리티
// ============================================================================

function getOrCreateSheet(ss, name) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  return sheet;
}

function getActiveTickers(ss) {
  const sheet = ss.getSheetByName("Universe");
  if (!sheet) return UNIVERSE;
  
  const data = sheet.getDataRange().getValues();
  return data.slice(1)
    .filter(row => row[4] === true || row[4] === "TRUE")
    .map(row => row[0])
    .filter(t => t);
}


// ============================================================================
// 트리거 관리
// ============================================================================

function setupTriggers() {
  removeTriggers(); // 기존 제거
  
  // 평일 10:31 ET에 첫 스캔
  ScriptApp.newTrigger("scanOpeningRange")
    .timeBased()
    .everyMinutes(CONFIG.SCAN_INTERVAL_MIN)
    .create();
  
  SpreadsheetApp.getActiveSpreadsheet().toast(
    `${CONFIG.SCAN_INTERVAL_MIN}분 간격 트리거 설정 완료`, "📦"
  );
}

function removeTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  SpreadsheetApp.getActiveSpreadsheet().toast("트리거 제거 완료", "📦");
}
