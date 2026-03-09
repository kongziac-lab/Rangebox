import { useState, useEffect, useCallback } from "react";

const API = "http://localhost:8000";

// ── Mock Data Generator ──
const generateMockData = () => {
  const tickers = [
    { symbol: "NVDA", name: "NVIDIA", sector: "Tech" },
    { symbol: "TSLA", name: "Tesla", sector: "Auto" },
    { symbol: "AMD", name: "AMD", sector: "Semi" },
    { symbol: "AAPL", name: "Apple", sector: "Tech" },
    { symbol: "META", name: "Meta", sector: "Tech" },
    { symbol: "AMZN", name: "Amazon", sector: "Retail" },
    { symbol: "MSFT", name: "Microsoft", sector: "Tech" },
    { symbol: "GOOGL", name: "Alphabet", sector: "Tech" },
    { symbol: "AVGO", name: "Broadcom", sector: "Semi" },
    { symbol: "CRM", name: "Salesforce", sector: "SaaS" },
  ];

  const signals = ["BREAKOUT_WATCH", "LONG_SETUP", "SHORT_SETUP", "RANGE_LONG", "RANGE_SHORT", "BREAKDOWN_WATCH", "LONG_BIAS", "SHORT_BIAS"];

  return tickers.map((t) => {
    const basePrice = 100 + Math.random() * 900;
    const boxRange = basePrice * (0.005 + Math.random() * 0.02);
    const boxLow = basePrice - boxRange / 2;
    const boxHigh = boxLow + boxRange;
    const boxMid = (boxHigh + boxLow) / 2;
    const current = boxLow + Math.random() * boxRange * 1.4 - boxRange * 0.2;
    const signal = signals[Math.floor(Math.random() * signals.length)];
    const score = 50 + Math.floor(Math.random() * 50);
    const isLong = signal.includes("LONG") || signal.includes("BREAKOUT");
    const stop = isLong ? boxLow - boxRange * 0.05 : boxHigh + boxRange * 0.05;
    const target1 = isLong ? current + boxRange : current - boxRange;
    const target2 = isLong ? current + boxRange * 2 : current - boxRange * 2;
    const risk = Math.abs(current - stop);
    const rr = risk > 0 ? Math.abs(target1 - current) / risk : 0;

    return {
      ...t,
      boxHigh: +boxHigh.toFixed(2),
      boxLow: +boxLow.toFixed(2),
      boxMid: +boxMid.toFixed(2),
      boxRange: +boxRange.toFixed(2),
      boxRangePct: +((boxRange / boxMid) * 100).toFixed(2),
      current: +current.toFixed(2),
      signal,
      score,
      entry: +current.toFixed(2),
      stop: +stop.toFixed(2),
      target1: +target1.toFixed(2),
      target2: +target2.toFixed(2),
      rr: +rr.toFixed(2),
      rvol: +(0.5 + Math.random() * 2.5).toFixed(1),
      distHigh: +(((current - boxHigh) / boxHigh) * 100).toFixed(2),
      distLow: +(((current - boxLow) / boxLow) * 100).toFixed(2),
    };
  });
};

const generateCandleData = (box) => {
  const candles = [];
  let price = box.boxLow + box.boxRange * 0.3;
  for (let i = 0; i < 60; i++) {
    const change = (Math.random() - 0.48) * box.boxRange * 0.08;
    const open = price;
    price = price + change;
    const close = price;
    const high = Math.max(open, close) + Math.random() * box.boxRange * 0.03;
    const low = Math.min(open, close) - Math.random() * box.boxRange * 0.03;
    candles.push({ i, open, high, low, close, isBoxPeriod: i < 12, time: `${9 + Math.floor((30 + i) / 60)}:${String((30 + i) % 60).padStart(2, "0")}` });
  }
  return candles;
};

// ── AI Verdict Badge ──
const AIBadge = ({ ai }) => {
  if (!ai) return null;
  const cfg = {
    PASS:    { bg: "rgba(34,197,94,0.15)",  border: "rgba(34,197,94,0.4)",   color: "#22c55e", icon: "✅" },
    CAUTION: { bg: "rgba(234,179,8,0.12)",  border: "rgba(234,179,8,0.35)",  color: "#eab308", icon: "⚠️" },
    SKIP:    { bg: "rgba(239,68,68,0.12)",  border: "rgba(239,68,68,0.35)",  color: "#ef4444", icon: "🚫" },
  };
  const c = cfg[ai.verdict] || cfg.CAUTION;
  return (
    <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, background: c.bg, border: `1px solid ${c.border}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: ai.reasons?.length ? 6 : 0 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: c.color }}>{c.icon} AI {ai.verdict}</span>
        <span style={{ fontSize: 11, color: "#64748b" }}>점수 {ai.ai_score}/100</span>
        {ai.earnings_warning && <span style={{ fontSize: 10, color: "#f87171", background: "rgba(239,68,68,0.1)", padding: "1px 6px", borderRadius: 4 }}>📅 {ai.earnings_warning}</span>}
      </div>
      {ai.reasons?.length > 0 && <div style={{ fontSize: 10, color: "#94a3b8", lineHeight: 1.6 }}>{ai.reasons.join(" · ")}</div>}
      {ai.risk_factors?.length > 0 && <div style={{ fontSize: 10, color: "#f87171", marginTop: 2 }}>{ai.risk_factors.join(" · ")}</div>}
    </div>
  );
};

// ── Signal Badge ──
const SignalBadge = ({ signal, score }) => {
  const colors = {
    BREAKOUT_WATCH: { bg: "#0d9488", text: "#f0fdfa" },
    LONG_SETUP: { bg: "#059669", text: "#ecfdf5" },
    LONG_BIAS: { bg: "#22c55e", text: "#f0fdf4" },
    RANGE_LONG: { bg: "#4ade80", text: "#14532d" },
    SHORT_SETUP: { bg: "#dc2626", text: "#fef2f2" },
    SHORT_BIAS: { bg: "#ef4444", text: "#fff1f2" },
    RANGE_SHORT: { bg: "#f87171", text: "#450a0a" },
    BREAKDOWN_WATCH: { bg: "#991b1b", text: "#fef2f2" },
  };
  const c = colors[signal] || { bg: "#64748b", text: "#f1f5f9" };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, letterSpacing: 0.5, background: c.bg, color: c.text }}>
      {signal.replace("_", " ")}
      <span style={{ background: "rgba(0,0,0,0.25)", borderRadius: 4, padding: "1px 5px", fontSize: 10 }}>{score}</span>
    </span>
  );
};

// ── Mini Chart ──
const MiniChart = ({ data, box, width = 320, height = 140 }) => {
  if (!data || data.length === 0) return null;
  const pad = { t: 10, b: 20, l: 5, r: 5 };
  const cw = (width - pad.l - pad.r) / data.length;
  const allPrices = data.flatMap((c) => [c.high, c.low]);
  const minP = Math.min(...allPrices, box.boxLow) * 0.999;
  const maxP = Math.max(...allPrices, box.boxHigh) * 1.001;
  const scaleY = (p) => pad.t + ((maxP - p) / (maxP - minP)) * (height - pad.t - pad.b);

  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <rect x={pad.l} y={scaleY(box.boxHigh)} width={width - pad.l - pad.r} height={scaleY(box.boxLow) - scaleY(box.boxHigh)} fill="rgba(99,102,241,0.08)" stroke="rgba(99,102,241,0.2)" strokeDasharray="3" />
      <line x1={pad.l} y1={scaleY(box.boxHigh)} x2={width - pad.r} y2={scaleY(box.boxHigh)} stroke="#ef4444" strokeWidth={1} strokeDasharray="4,3" opacity={0.7} />
      <line x1={pad.l} y1={scaleY(box.boxLow)} x2={width - pad.r} y2={scaleY(box.boxLow)} stroke="#22c55e" strokeWidth={1} strokeDasharray="4,3" opacity={0.7} />
      <line x1={pad.l} y1={scaleY(box.boxMid)} x2={width - pad.r} y2={scaleY(box.boxMid)} stroke="#eab308" strokeWidth={0.8} strokeDasharray="2,4" opacity={0.5} />
      {data.map((c, i) => {
        const x = pad.l + i * cw + cw / 2;
        const bull = c.close >= c.open;
        const bodyTop = scaleY(Math.max(c.open, c.close));
        const bodyBot = scaleY(Math.min(c.open, c.close));
        const bodyH = Math.max(bodyBot - bodyTop, 1);
        const fill = c.isBoxPeriod ? (bull ? "#6366f1" : "#818cf8") : bull ? "#22c55e" : "#ef4444";
        return (
          <g key={i}>
            <line x1={x} y1={scaleY(c.high)} x2={x} y2={scaleY(c.low)} stroke={fill} strokeWidth={0.8} />
            <rect x={x - cw * 0.35} y={bodyTop} width={cw * 0.7} height={bodyH} fill={fill} rx={0.5} />
          </g>
        );
      })}
      <text x={width - pad.r - 2} y={scaleY(box.boxHigh) - 3} fill="#ef4444" fontSize={8} textAnchor="end" fontFamily="monospace">H {box.boxHigh}</text>
      <text x={width - pad.r - 2} y={scaleY(box.boxLow) + 10} fill="#22c55e" fontSize={8} textAnchor="end" fontFamily="monospace">L {box.boxLow}</text>
    </svg>
  );
};

// ── Strategy Rules Card ──
const RulesCard = () => (
  <div style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", border: "1px solid rgba(148,163,184,0.12)", borderRadius: 14, padding: 20, marginBottom: 20 }}>
    <h3 style={{ margin: "0 0 14px", fontSize: 14, color: "#94a3b8", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>실전 규칙</h3>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      {[
        "첫 1시간 관망 → 박스 형성",
        "상단 = 숏 or 돌파후 눌림 롱",
        "하단 = 롱 or 이탈후 되돌림 숏",
        "추격매매 절대 금지",
        "되돌림에서만 진입",
        "손절은 반드시 박스 기준",
        "손익비 1:1.2 미만 → 패스",
        "연속 3패 → 강제 휴식",
      ].map((rule, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 8, background: "rgba(99,102,241,0.06)", fontSize: 12, color: "#cbd5e1" }}>
          <span style={{ color: "#818cf8", fontWeight: 700, fontSize: 10 }}>0{i + 1}</span>
          {rule}
        </div>
      ))}
    </div>
  </div>
);

// ── Signal Detail ──
const SignalDetail = ({ item, candles }) => (
  <div style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", border: "1px solid rgba(148,163,184,0.12)", borderRadius: 14, padding: 20, marginBottom: 20 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
      <div>
        <span style={{ fontSize: 22, fontWeight: 800, color: "#f1f5f9", letterSpacing: -0.5 }}>{item.symbol}</span>
        <span style={{ fontSize: 13, color: "#64748b", marginLeft: 10 }}>{item.name} · {item.sector}</span>
      </div>
      <SignalBadge signal={item.signal} score={item.score} />
    </div>
    <MiniChart data={candles} box={item} width={580} height={180} />
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 16 }}>
      {[
        { label: "현재가", value: `$${item.current}`, color: "#f1f5f9" },
        { label: "박스 범위", value: `${item.boxRangePct}%`, color: "#818cf8" },
        { label: "손익비", value: `${item.rr}`, color: item.rr >= 1.5 ? "#22c55e" : item.rr >= 1.2 ? "#eab308" : "#ef4444" },
        { label: "RVOL", value: `${item.rvol}x`, color: item.rvol >= 1.5 ? "#22c55e" : "#94a3b8" },
      ].map((m, i) => (
        <div key={i} style={{ textAlign: "center", padding: "10px 0", borderRadius: 10, background: "rgba(99,102,241,0.06)" }}>
          <div style={{ fontSize: 10, color: "#64748b", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8 }}>{m.label}</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: m.color, fontFamily: "'JetBrains Mono', monospace" }}>{m.value}</div>
        </div>
      ))}
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginTop: 12, fontSize: 11 }}>
      {[
        { label: "진입", val: item.entry, c: "#f1f5f9" },
        { label: "손절", val: item.stop, c: "#ef4444" },
        { label: "목표1", val: item.target1, c: "#22c55e" },
        { label: "목표2", val: item.target2, c: "#0d9488" },
        { label: "박스폭", val: item.boxRange, c: "#818cf8" },
      ].map((p, i) => (
        <div key={i} style={{ textAlign: "center", padding: 6, borderRadius: 6, background: "rgba(15,23,42,0.6)" }}>
          <div style={{ color: "#475569", fontSize: 9, marginBottom: 2 }}>{p.label}</div>
          <div style={{ color: p.c, fontWeight: 600, fontFamily: "monospace" }}>${p.val}</div>
        </div>
      ))}
    </div>
    {item.ai && <AIBadge ai={item.ai} />}
  </div>
);

// ── Architecture Diagram ──
const ArchDiagram = () => {
  const modules = [
    { label: "데이터 수집", sub: "Polygon / Alpaca / Yahoo", icon: "📡", x: 30, y: 20 },
    { label: "박스 계산", sub: "High / Low / Mid", icon: "📦", x: 30, y: 100 },
    { label: "신호 분류", sub: "LONG / SHORT / BREAKOUT", icon: "🎯", x: 30, y: 180 },
    { label: "점수화", sub: "Score ≥ 70 채택", icon: "📊", x: 250, y: 100 },
    { label: "AI 필터", sub: "품질 판단 / 뉴스 체크", icon: "🤖", x: 250, y: 180 },
    { label: "알림 / 실행", sub: "Telegram / 자동매매", icon: "🔔", x: 470, y: 140 },
  ];
  const arrows = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]];
  return (
    <div style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", border: "1px solid rgba(148,163,184,0.12)", borderRadius: 14, padding: 20, marginBottom: 20 }}>
      <h3 style={{ margin: "0 0 14px", fontSize: 14, color: "#94a3b8", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>시스템 아키텍처</h3>
      <svg width="100%" viewBox="0 0 620 260" style={{ maxWidth: 620 }}>
        {arrows.map(([from, to], i) => (
          <line key={i} x1={modules[from].x + 80} y1={modules[from].y + 25} x2={modules[to].x + 20} y2={modules[to].y + 25} stroke="#334155" strokeWidth={1.5} markerEnd="url(#ah)" />
        ))}
        <defs>
          <marker id="ah" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="#475569" /></marker>
        </defs>
        {modules.map((m, i) => (
          <g key={i}>
            <rect x={m.x} y={m.y} width={160} height={52} rx={10} fill="rgba(30,41,59,0.9)" stroke="rgba(99,102,241,0.2)" strokeWidth={1} />
            <text x={m.x + 26} y={m.y + 22} fill="#f1f5f9" fontSize={12} fontWeight="600">{m.icon} {m.label}</text>
            <text x={m.x + 26} y={m.y + 40} fill="#64748b" fontSize={9}>{m.sub}</text>
          </g>
        ))}
      </svg>
    </div>
  );
};

// ── MVP Roadmap ──
const Roadmap = () => {
  const steps = [
    { phase: "MVP 1", title: "TradingView 인디케이터", items: ["자동 박스 표시", "중간선 + 돌파 알림", "Pine Script 완성"], status: "ready" },
    { phase: "MVP 2", title: "Python 스캐너", items: ["나스닥100 대상 스캔", "5분 간격 자동 실행", "텔레그램 알림"], status: "ready" },
    { phase: "MVP 3", title: "Sheets 대시보드", items: ["롱/숏 후보 실시간", "점수표 자동 갱신", "팀 공유 가능"], status: "ready" },
    { phase: "MVP 4", title: "AI 필터링", items: ["신호 품질 판단", "뉴스/실적 제외", "거짓 신호 제거"], status: "next" },
    { phase: "MVP 5", title: "자동매매", items: ["소액 실전 테스트", "손절/익절 자동화", "포지션 사이징"], status: "next" },
  ];
  return (
    <div style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", border: "1px solid rgba(148,163,184,0.12)", borderRadius: 14, padding: 20, marginBottom: 20 }}>
      <h3 style={{ margin: "0 0 14px", fontSize: 14, color: "#94a3b8", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>개발 로드맵</h3>
      <div style={{ display: "flex", gap: 10, overflowX: "auto" }}>
        {steps.map((s, i) => (
          <div key={i} style={{ minWidth: 150, flex: 1, padding: 14, borderRadius: 10, background: s.status === "ready" ? "rgba(34,197,94,0.06)" : "rgba(99,102,241,0.04)", border: `1px solid ${s.status === "ready" ? "rgba(34,197,94,0.15)" : "rgba(99,102,241,0.1)"}` }}>
            <div style={{ fontSize: 10, color: s.status === "ready" ? "#22c55e" : "#818cf8", fontWeight: 700, marginBottom: 6 }}>
              {s.phase} {s.status === "ready" ? "✅" : "🔜"}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0", marginBottom: 8 }}>{s.title}</div>
            {s.items.map((item, j) => (
              <div key={j} style={{ fontSize: 11, color: "#94a3b8", padding: "2px 0" }}>· {item}</div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Main App ──
export default function App() {
  const [data, setData] = useState([]);
  const [selected, setSelected] = useState(null);
  const [candles, setCandles] = useState([]);
  const [tab, setTab] = useState("scanner");
  const [filter, setFilter] = useState("all");
  const [lastUpdate, setLastUpdate] = useState("");
  const [loading, setLoading] = useState(false);
  const [isMock, setIsMock] = useState(false);
  const [aiMode, setAiMode] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/status`).then(r => r.json()).then(d => setAiAvailable(d.ai_available)).catch(() => {});
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const url = aiMode ? `${API}/api/scan?ai=true` : `${API}/api/scan`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const json = await res.json();
      const d = json.signals;
      setData(d);
      setLastUpdate(json.date + (json.ai_applied ? " AI" : " 실시간"));
      setIsMock(false);
      if (d.length > 0) {
        setSelected(d[0]);
        const cr = await fetch(`${API}/api/candles/${d[0].symbol}`);
        setCandles(await cr.json());
      }
    } catch {
      const d = generateMockData().sort((a, b) => b.score - a.score);
      setData(d);
      setLastUpdate(new Date().toLocaleTimeString() + " (목업)");
      setIsMock(true);
      if (d.length > 0) {
        setSelected(d[0]);
        setCandles(generateCandleData(d[0]));
      }
    } finally {
      setLoading(false);
    }
  }, [aiMode]);

  useEffect(() => { refresh(); }, [refresh]);

  const selectItem = async (item) => {
    setSelected(item);
    try {
      const res = await fetch(`${API}/api/candles/${item.symbol}`);
      setCandles(await res.json());
    } catch {
      setCandles(generateCandleData(item));
    }
  };

  const filtered = data.filter((d) => {
    if (filter === "long") return d.signal.includes("LONG") || d.signal.includes("BREAKOUT");
    if (filter === "short") return d.signal.includes("SHORT") || d.signal.includes("BREAKDOWN");
    if (filter === "high") return d.score >= 75;
    return true;
  });

  const longCount = data.filter((d) => d.signal.includes("LONG") || d.signal.includes("BREAKOUT")).length;
  const shortCount = data.filter((d) => d.signal.includes("SHORT") || d.signal.includes("BREAKDOWN")).length;
  const highCount = data.filter((d) => d.score >= 75).length;

  return (
    <div style={{ minHeight: "100vh", background: "#030712", color: "#e2e8f0", fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)", borderBottom: "1px solid rgba(99,102,241,0.15)", padding: "16px 24px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: "linear-gradient(135deg, #6366f1, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>📦</div>
            <div>
              <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: -0.5, background: "linear-gradient(135deg, #e2e8f0, #818cf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                Opening Range Box
              </h1>
              <div style={{ fontSize: 11, color: "#64748b" }}>미장 시가 박스 전략 시스템</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 11, color: isMock ? "#eab308" : "#22c55e" }}>
              {isMock ? "⚠ 목업" : "● 실시간"} {lastUpdate}
            </span>
            {aiAvailable && (
              <button onClick={() => setAiMode(v => !v)} style={{ padding: "6px 14px", borderRadius: 8, border: `1px solid ${aiMode ? "rgba(168,85,247,0.5)" : "rgba(148,163,184,0.15)"}`, background: aiMode ? "rgba(168,85,247,0.15)" : "transparent", color: aiMode ? "#c084fc" : "#64748b", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                🤖 AI {aiMode ? "ON" : "OFF"}
              </button>
            )}
            <button onClick={refresh} disabled={loading} style={{ padding: "6px 16px", borderRadius: 8, border: "1px solid rgba(99,102,241,0.3)", background: "rgba(99,102,241,0.1)", color: "#818cf8", fontSize: 12, fontWeight: 600, cursor: loading ? "wait" : "pointer", opacity: loading ? 0.6 : 1 }}>
              {loading ? "⏳ 로딩..." : "↻ 스캔"}
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "16px 24px" }}>
        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 16, background: "rgba(15,23,42,0.6)", borderRadius: 10, padding: 4, width: "fit-content" }}>
          {[
            { id: "scanner", label: "스캐너" },
            { id: "architecture", label: "아키텍처" },
            { id: "roadmap", label: "로드맵" },
            { id: "rules", label: "규칙" },
          ].map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: tab === t.id ? "rgba(99,102,241,0.2)" : "transparent", color: tab === t.id ? "#818cf8" : "#64748b", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === "architecture" && <ArchDiagram />}
        {tab === "roadmap" && <Roadmap />}
        {tab === "rules" && <RulesCard />}

        {tab === "scanner" && (
          <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 16 }}>
            {/* Left: Signal List */}
            <div>
              {/* Summary */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                {[
                  { label: "LONG", count: longCount, c: "#22c55e", f: "long" },
                  { label: "SHORT", count: shortCount, c: "#ef4444", f: "short" },
                  { label: "HIGH", count: highCount, c: "#818cf8", f: "high" },
                ].map((s) => (
                  <button key={s.f} onClick={() => setFilter(filter === s.f ? "all" : s.f)} style={{ textAlign: "center", padding: "10px 0", borderRadius: 10, border: filter === s.f ? `1px solid ${s.c}40` : "1px solid rgba(148,163,184,0.08)", background: filter === s.f ? `${s.c}10` : "rgba(15,23,42,0.6)", cursor: "pointer" }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: s.c, fontFamily: "'JetBrains Mono', monospace" }}>{s.count}</div>
                    <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, letterSpacing: 1 }}>{s.label}</div>
                  </button>
                ))}
              </div>

              {/* List */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 540, overflowY: "auto" }}>
                {filtered.map((item) => (
                  <div key={item.symbol} onClick={() => selectItem(item)} style={{ padding: "12px 14px", borderRadius: 10, border: selected?.symbol === item.symbol ? "1px solid rgba(99,102,241,0.4)" : "1px solid rgba(148,163,184,0.06)", background: selected?.symbol === item.symbol ? "rgba(99,102,241,0.08)" : "rgba(15,23,42,0.5)", cursor: "pointer", transition: "all 0.15s" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <div>
                        <span style={{ fontWeight: 700, fontSize: 14, color: "#f1f5f9" }}>{item.symbol}</span>
                        <span style={{ fontSize: 11, color: "#475569", marginLeft: 6 }}>${item.current}</span>
                      </div>
                      <SignalBadge signal={item.signal} score={item.score} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#64748b" }}>
                      <span>박스: ${item.boxLow}–${item.boxHigh}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        R:R {item.rr} · RVOL {item.rvol}x
                        {item.ai && <span style={{ fontWeight: 700, color: item.ai.verdict === "PASS" ? "#22c55e" : item.ai.verdict === "SKIP" ? "#ef4444" : "#eab308" }}>· AI {item.ai.verdict}</span>}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Detail */}
            <div>
              {selected ? (
                <SignalDetail item={selected} candles={candles} />
              ) : (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300, color: "#475569" }}>종목을 선택하세요</div>
              )}

              {/* Files Info */}
              <div style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", border: "1px solid rgba(148,163,184,0.12)", borderRadius: 14, padding: 20 }}>
                <h3 style={{ margin: "0 0 14px", fontSize: 14, color: "#94a3b8", fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>제공 파일</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {[
                    { icon: "📈", name: "Pine Script", desc: "TradingView 인디케이터", file: ".pine" },
                    { icon: "🐍", name: "Python Scanner", desc: "종목 자동 스캔 시스템", file: ".py" },
                    { icon: "📊", name: "Apps Script", desc: "Google Sheets 대시보드", file: ".js" },
                    { icon: "⚙️", name: "Config", desc: "전략 설정 및 유니버스", file: ".py" },
                  ].map((f, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, padding: "10px 12px", borderRadius: 8, background: "rgba(99,102,241,0.04)", border: "1px solid rgba(99,102,241,0.08)" }}>
                      <span style={{ fontSize: 20 }}>{f.icon}</span>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0" }}>{f.name}</div>
                        <div style={{ fontSize: 10, color: "#64748b" }}>{f.desc} <span style={{ color: "#818cf8" }}>{f.file}</span></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
