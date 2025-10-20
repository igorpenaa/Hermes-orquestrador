/* OPX • Hermes – v6.7
   - Loader de estratégias sem usar blob: (evita CSP do site)
   - Import direto via chrome.runtime.getURL('strategies/index.mjs')
   - Logs detalhados de diagnóstico
   - Fallback interno (emaCrossFallback) se strategies falhar
*/

if (window.__opxBooted) {
  console.debug("[OPX] Already booted");
} else {
  window.__opxBooted = true;
}

/* ================== Persist helpers ================== */
const LS = {
  get(k, d){ try{ const v=localStorage.getItem(k); return v?JSON.parse(v):d; }catch(_){return d;} },
  set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(_){ } },
};

/* ================== Config (default + presets) ================== */
const STRATEGY_TUNING_DEFAULTS = {
  retestBreakoutBuy: {
    emaFast: 20,
    emaSlow: 50,
    slopeMin: 0.0010,
    atrMin: 0.0040,
    atrMax: 0.0200,
    distMax: 1.0
  },
  retestBreakdownSell: {
    emaFast: 20,
    emaSlow: 50,
    slopeMin: 0.0010,
    atrMin: 0.0040,
    atrMax: 0.0200,
    distMax: 1.0
  },
  doubleTopBottom: {
    emaFast: 20,
    emaSlow: 50,
    atrMin: 0.0040,
    atrMax: 0.0150,
    slopeNeutralMax: 0.0007
  },
  symTriangle: {
    slopePeriod: 20,
    atrMin: 0.0040,
    atrMax: 0.0120,
    slopeAbsMax: 0.0020
  },
  rangeBreakout: {
    slopePeriod: 20,
    atrMin: 0.0040,
    atrMax: 0.0150,
    slopeAbsMin: 0.0005
  },
  gapRejection: {},
  tripleLevel: {
    emaPeriod: 20,
    atrMin: 0.0040,
    atrMax: 0.0150,
    distMax: 1.0
  },
  trendlineRejection: {
    emaPeriod: 20,
    atrMin: 0.0035,
    distMax: 1.0
  },
  secondEntry: {
    emaPeriod: 20,
    slopePeriod: 20,
    slopeAbsMin: 0.0010,
    distMax: 1.0
  },
  microChannels: {
    emaPeriod: 20,
    slopePeriod: 20,
    slopeAbsMin: 0.0010,
    distMax: 1.0
  },
  reversalBar: {
    emaPeriod: 20,
    atrMin: 0.0035,
    distMax: 1.0
  },
  emaCross: {
    emaFast: 20,
    emaSlow: 50,
    slopeMin: 0.0010
  }
};

const DEFAULT_CFG = {
  // janela JIT
  armMinSec: 8, armMaxSec: 7,
  clickMinSec: 12, clickMaxSec: 7,
  lockAbortSec: 5.0,
  clickDelayMs: 80,

  // TFs
  tfExecUi: "M1",
  tfExec: "1m", tfRegA: "5m", tfRegB: "15m",
  seedCandles: 180,

  // Filtros
  minThermoEdge: 0.015,
  emaGapFloorPct: 0.0005,
  coefAtrInGap: 0.30,
  wick_ratio_max: 0.35,
  atr_mult_max: 1.8,
  vol_min_mult: 0.6,
  vol_max_mult: 9.0,
  payout_min: 0.80,
  payout_soft: 0.90,

  subtick_cancel_pct: 0.0004,

  // --- Relax mode (anti-silêncio) ---
  relaxAuto: true,
  relaxAfterMin: 12,
  slopeLoose: 0.0007,
  distE20RelaxAdd: 0.10,

  // fluxos
  hist_max_lines: 2000,
  metr_summary_ms: 10 * 60 * 1000,

  // gerais
  allowBuy: true,
  allowSell: true,

  symbolMap: {
    "BTC/USDT":"BTCUSDT","ETH/USDT":"ETHUSDT","BNB/USDT":"BNBUSDT","XRP/USDT":"XRPUSDT",
    "ADA/USDT":"ADAUSDT","SOL/USDT":"SOLUSDT","MEMX/USDT":"MEMEUSDT","IDX/USDT":"IDEXUSDT",
    "BTC/USD":"BTCUSDC","TRUMP/USDT":"TRUMPUSDT"
  },

  // estratégias carregadas dinamicamente (preenche no boot)
  strategies: {},

  // EMA Gate direcional
  emaGate: {
    enabled: false,
    divisor: 200,
    directional: 20,
    minDistATR: 0.30,
    slopeMin: 0.0008
  },

  strategyTunings: cloneTunings(STRATEGY_TUNING_DEFAULTS)
};

const PRESETS = {
  padrao: { ...DEFAULT_CFG },
  conservador: {
    ...DEFAULT_CFG,
    emaGapFloorPct: 0.0008, coefAtrInGap: 0.50,
    minThermoEdge: 0.020, payout_min: 0.85, payout_soft: 0.92,
    vol_min_mult: 0.7, vol_max_mult: 6.0, wick_ratio_max: 0.30, atr_mult_max: 1.6
  },
  moderado: {
    ...DEFAULT_CFG,
    emaGapFloorPct: 0.0006, coefAtrInGap: 0.40,
    minThermoEdge: 0.018, payout_min: 0.83, payout_soft: 0.90,
    vol_min_mult: 0.65, vol_max_mult: 7.0, wick_ratio_max: 0.33, atr_mult_max: 1.7
  },
  agressivo: {
    ...DEFAULT_CFG,
    emaGapFloorPct: 0.0004, coefAtrInGap: 0.30,
    minThermoEdge: 0.015, payout_min: 0.80, payout_soft: 0.88,
    vol_min_mult: 0.6, vol_max_mult: 9.0, wick_ratio_max: 0.38, atr_mult_max: 1.9
  },
  ultra: {
    ...DEFAULT_CFG,
    emaGapFloorPct: 0.0002, coefAtrInGap: 0.20,
    minThermoEdge: 0.010, payout_min: 0.78, payout_soft: 0.85,
    vol_min_mult: 0.5, vol_max_mult: 12.0, wick_ratio_max: 0.45, atr_mult_max: 2.2
  }
};

function cloneTunings(src){
  const out = {};
  Object.entries(src || {}).forEach(([id, conf]) => {
    out[id] = { ...(conf || {}) };
  });
  return out;
}

function mergeTunings(base, saved){
  const out = {};
  const keys = new Set([
    ...Object.keys(base || {}),
    ...Object.keys(saved || {})
  ]);
  keys.forEach((id)=>{
    out[id] = { ...(base?.[id] || {}), ...(saved?.[id] || {}) };
  });
  return out;
}

const STRATEGY_TUNING_SCHEMA = {
  retestBreakoutBuy: {
    title: "Retest Breakout (Buy)",
    description: "Define a força mínima da tendência e a volatilidade aceitável para compras após retestes.",
    fields: [
      { key: "emaFast", label: "EMA ref1", step: 1, min: 1 },
      { key: "emaSlow", label: "EMA ref2", step: 1, min: 1 },
      { key: "slopeMin", label: "Slope min", step: 0.0001 },
      { key: "atrMin", label: "ATRₙ min", step: 0.0001 },
      { key: "atrMax", label: "ATRₙ máx", step: 0.0001 },
      { key: "distMax", label: "Dist. EMA ref1 (×ATR)", step: 0.01 }
    ]
  },
  retestBreakdownSell: {
    title: "Retest Breakdown (Sell)",
    description: "Ajusta os limites para vendas após perda de suporte.",
    fields: [
      { key: "emaFast", label: "EMA ref1", step: 1, min: 1 },
      { key: "emaSlow", label: "EMA ref2", step: 1, min: 1 },
      { key: "slopeMin", label: "Slope min", step: 0.0001 },
      { key: "atrMin", label: "ATRₙ min", step: 0.0001 },
      { key: "atrMax", label: "ATRₙ máx", step: 0.0001 },
      { key: "distMax", label: "Dist. EMA ref1 (×ATR)", step: 0.01 }
    ]
  },
  rangeBreakout: {
    title: "Range Breakout",
    description: "Controle da volatilidade e inclinação exigidas para rompimentos de consolidação.",
    fields: [
      { key: "slopePeriod", label: "Período slope", step: 1, min: 1 },
      { key: "slopeAbsMin", label: "|Slope| min", step: 0.0001 },
      { key: "atrMin", label: "ATRₙ min", step: 0.0001 },
      { key: "atrMax", label: "ATRₙ máx", step: 0.0001 }
    ]
  },
  gapRejection: {
    title: "Gap Rejection",
    description: "Esta estratégia não possui requisitos adicionais configuráveis.",
    fields: []
  },
  doubleTopBottom: {
    title: "Double Top / Bottom",
    description: "Faixa de volatilidade e neutralidade de tendência para estruturas duplas.",
    fields: [
      { key: "emaFast", label: "EMA ref1", step: 1, min: 1 },
      { key: "emaSlow", label: "EMA ref2", step: 1, min: 1 },
      { key: "atrMin", label: "ATRₙ min", step: 0.0001 },
      { key: "atrMax", label: "ATRₙ máx", step: 0.0001 },
      { key: "slopeNeutralMax", label: "|Slope| neutro máx", step: 0.0001 }
    ]
  },
  symTriangle: {
    title: "Symmetrical Triangle",
    description: "Inclinação máxima e faixa de ATR para triângulos simétricos.",
    fields: [
      { key: "slopePeriod", label: "Período slope", step: 1, min: 1 },
      { key: "atrMin", label: "ATRₙ min", step: 0.0001 },
      { key: "atrMax", label: "ATRₙ máx", step: 0.0001 },
      { key: "slopeAbsMax", label: "|Slope| máx", step: 0.0001 }
    ]
  },
  tripleLevel: {
    title: "Triple Level",
    description: "Limites para consolidação tripla.",
    fields: [
      { key: "emaPeriod", label: "EMA ref", step: 1, min: 1 },
      { key: "distMax", label: "Dist. EMA (×ATR)", step: 0.01 },
      { key: "atrMin", label: "ATRₙ min", step: 0.0001 },
      { key: "atrMax", label: "ATRₙ máx", step: 0.0001 }
    ]
  },
  trendlineRejection: {
    title: "Trendline Rejection",
    description: "Ajuste de distância e volatilidade para rejeições em LTA/LTB.",
    fields: [
      { key: "emaPeriod", label: "EMA ref", step: 1, min: 1 },
      { key: "distMax", label: "Dist. EMA (×ATR)", step: 0.01 },
      { key: "atrMin", label: "ATRₙ min", step: 0.0001 }
    ]
  },
  secondEntry: {
    title: "Second Entry",
    description: "Inclinação e distância para segundos gatilhos.",
    fields: [
      { key: "slopePeriod", label: "Período slope", step: 1, min: 1 },
      { key: "emaPeriod", label: "EMA ref", step: 1, min: 1 },
      { key: "slopeAbsMin", label: "|Slope| min", step: 0.0001 },
      { key: "distMax", label: "Dist. EMA (×ATR)", step: 0.01 }
    ]
  },
  microChannels: {
    title: "Micro Channels",
    description: "Controle de inclinação e distância para micro canais.",
    fields: [
      { key: "slopePeriod", label: "Período slope", step: 1, min: 1 },
      { key: "emaPeriod", label: "EMA ref", step: 1, min: 1 },
      { key: "slopeAbsMin", label: "|Slope| min", step: 0.0001 },
      { key: "distMax", label: "Dist. EMA (×ATR)", step: 0.01 }
    ]
  },
  reversalBar: {
    title: "Reversal Bar",
    description: "Distância e volatilidade mínima para barras de reversão.",
    fields: [
      { key: "emaPeriod", label: "EMA ref", step: 1, min: 1 },
      { key: "distMax", label: "Dist. EMA (×ATR)", step: 0.01 },
      { key: "atrMin", label: "ATRₙ min", step: 0.0001 }
    ]
  },
  emaCross: {
    title: "EMA Cross",
    description: "Configurações do cruzamento de EMAs.",
    fields: [
      { key: "emaFast", label: "EMA rápida", step: 1, min: 1 },
      { key: "emaSlow", label: "EMA lenta", step: 1, min: 1 },
      { key: "slopeMin", label: "Slope min", step: 0.0001 }
    ]
  }
};

const CFG = { ...DEFAULT_CFG, ...(LS.get("opx.cfg", {})) };
CFG.strategies = CFG.strategies || {};
CFG.emaGate = { ...DEFAULT_CFG.emaGate, ...(CFG.emaGate || {}) };
CFG.strategyTunings = mergeTunings(STRATEGY_TUNING_DEFAULTS, CFG.strategyTunings || {});

/* ================== Estado ================== */
const S = {
  armed: true,
  pending: null,
  streams: {}, candles: {}, emas: {}, atr: {}, vma: {},
  seeded: false,
  lastUiSym: null, activeBinSym: null,
  cooldown: {}, stats: {}, lastOrderSym: null,
  history: [],
  live: {}, wsCloseTs: {},
  metr: {
    closes: 0, raw_signal: 0, pending: 0, executed: 0, canceled: 0,
    block: { gap:0, edge:0, volume:0, wick:0, atrSpike:0, regimeMixOpp:0, payout:0, cooldown:0, seed:0, timer:0 }
  },
  metr_last_summary: Date.now(),
  lastLateLogSec: null, clickedThisMinute: null,
  currentPresetName: LS.get("opx.preset", "padrão"),

  strategiesLoaded: {},
  activeStrats: [],
  relaxMode: false,
  analysisLog: [],
  onAnalysis: null
};

/* ================== Utils ================== */
const qs  = (s, r=document)=>r.querySelector(s);
const qsa = (s, r=document)=>[...r.querySelectorAll(s)];
const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const nowStr = ()=> new Date().toLocaleTimeString();
const toPct = x => (x*100).toFixed(2)+"%";
const asset = p => chrome.runtime.getURL(p);
const getPath = (obj, path) => path.split('.').reduce((a,k)=> (a?a[k]:undefined), obj);
const setPath = (obj, path, val) => { const parts = path.split('.'); const last = parts.pop(); let cur = obj; for (const p of parts){ if(!(p in cur) || typeof cur[p]!=='object') cur[p]={}; cur=cur[p]; } cur[last] = val; };
function humanizeId(id){ if(!id) return "Estratégia"; return String(id).replace(/[-_]+/g," ").replace(/\s+/g," ").trim().replace(/\b\w/g, m => m.toUpperCase()); }
function escapeHtml(str){
  return String(str ?? "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));
}
function formatNumber(num, digits=4){
  if (num == null || Number.isNaN(num) || !Number.isFinite(num)) return "—";
  const abs = Math.abs(num);
  if (abs >= 1000) return num.toFixed(2);
  if (abs >= 100)  return num.toFixed(2);
  if (abs >= 10)   return num.toFixed(Math.min(2, digits));
  if (abs >= 1)    return num.toFixed(Math.min(3, digits));
  if (abs >= 0.1)  return num.toFixed(Math.min(4, digits+1));
  if (abs >= 0.01) return num.toFixed(Math.min(5, digits+2));
  return num.toFixed(Math.min(6, digits+3));
}

/* ===== CSS extra ===== */
(function ensureCss(){
  if (!document.getElementById("opx-style-link")) {
    const link = document.createElement("link");
    link.id = "opx-style-link";
    link.rel = "stylesheet";
    link.href = asset("styles.css");
    document.head.appendChild(link);
  }
})();
(function addExtraStyles(){
  const st = document.createElement("style");
  st.textContent = `
    #opx-log .ok{ color:#e6edf3; }
    #opx-log .warn{ color:#ffd54f; }
    #opx-log .err{ color:#ff6b6b; }
    #opx-log .order{ color:#4caf50; }
    #opx-log .funil { color:#60a5fa; }
    #opx-log .blocks{ color:#ff6b6b; }
    #opx-log { white-space:pre-wrap; }

    #opx-history .opx-h-list{
      max-height: 70vh; overflow:auto; padding:14px;
      background:#101826; border-top:1px solid #233040;
    }
    #opx-history .line{
      white-space:pre-wrap; font-family: ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;
      font-size:12px; margin:2px 0;
    }
    #opx-history .ok{ color:#e6edf3; }
    #opx-history .warn{ color:#ffd54f; }
    #opx-history .err{ color:#ff6b6b; }
    #opx-history .order{ color:#4caf50; }
    #opx-history .funil{ color:#60a5fa; }
    #opx-history .blocks{ color:#ff6b6b; }
  `;
  document.head.appendChild(st);
})();

/* ===== Sons ===== */
const sounds = {
  possivel_compra:   new Audio(asset('audios/possivel_compra.mp3')),
  possivel_venda:    new Audio(asset('audios/possivel_venda.mp3')),
  compra_cancelada:  new Audio(asset('audios/compra_cancelada.mp3')),
  venda_cancelada:   new Audio(asset('audios/venda_cancelada.mp3')),
  compra_confirmada: new Audio(asset('audios/compra_confirmada.mp3')),
  venda_confirmada:  new Audio(asset('audios/venda_confirmada.mp3')),
  vitoria:           new Audio(asset('audios/vitoria.mp3')),
  perdemos:          new Audio(asset('audios/perdemos.mp3')),
};
Object.values(sounds).forEach(a=>{a.preload='auto';a.volume=0.9;});
const play = key => { const a=sounds[key]; if(!a) return; a.currentTime=0; a.play().catch(()=>{}); };

/* ===== Log / histórico ===== */
function wrapText(str, width=65){
  if (!str) return "";
  const out = []; let i = 0;
  while (i < str.length){ out.push(str.slice(i, i+width)); i += width; }
  return out.join("\n");
}
function pushHistory(line, cls) {
  S.history.push({t: Date.now(), text: line, cls});
  if (S.history.length > CFG.hist_max_lines) S.history.shift();
  LS.set("opx.history", S.history);
}
function restoreHistory() {
  const arr = LS.get("opx.history", []); if (!Array.isArray(arr)) return;
  S.history = arr;
  const el = qs("#opx-log"); if(!el) return;
  el.innerHTML="";
  for (const it of arr) {
    const d = document.createElement("div");
    d.className = it.cls || "ok";
    d.textContent = `[${new Date(it.t).toLocaleTimeString()}] ${wrapText(it.text)}`;
    el.appendChild(d);
  }
  el.scrollTop = el.scrollHeight;
}
function classifyAuto(line, cls){
  if (cls && cls!=="ok") return cls;
  if (/^ORDEM:/i.test(line)) return "order";
  return "ok";
}
function log(line, cls="ok"){
  cls = classifyAuto(line, cls);
  pushHistory(line, cls);
  const el = qs("#opx-log"); if(!el) return;
  const p = document.createElement("div"); p.className = cls;
  p.textContent = `[${nowStr()}] ${wrapText(line)}`;
  el.prepend(p);
}

function renderConditionItem(cond){
  if (!cond) return "";
  const cls = cond.pass ? "pass" : "fail";
  const label = cond.label ? `<span class="cond-label">${escapeHtml(cond.label)}</span>` : "";
  const details = [];
  if (cond.actual != null && cond.expected != null && cond.comparator){
    details.push(`Atual ${formatNumber(cond.actual, cond.digits)} ${cond.comparator} ${formatNumber(cond.expected, cond.digits)}`);
  } else if (cond.actual != null){
    details.push(`Atual ${formatNumber(cond.actual, cond.digits)}`);
  }
  if (cond.extra) details.push(String(cond.extra));
  if (cond.note) details.push(String(cond.note));
  const detailStr = details.length
    ? `<span class="cond-detail">${details.map(part => escapeHtml(part)).join(" • ")}</span>`
    : "";
  return `<li class="${cls}">${label}${detailStr}</li>`;
}

function renderStrategyBlock(strat){
  if (!strat) return "";
  const classes = ["analysis-strategy"];
  let status = "Requisitos não atendidos";
  if (strat.enabled === false){
    classes.push("disabled");
    status = "Desativada na central";
  } else if (strat.gateBlocked){
    classes.push("blocked");
    status = "Bloqueada pelo EMA Gate";
  } else if (strat.activeFinal){
    classes.push("active");
    status = "Ativa (cenário + central)";
  } else if (strat.activeByScene){
    classes.push("waiting");
    status = "Liberada pelo cenário";
  } else {
    classes.push("inactive");
  }

  const badges = [];
  if (strat.chosen) badges.push('<span class="pill pill-chosen">Escolhida</span>');
  if (strat.relaxApplied) badges.push('<span class="pill pill-relax">Relax</span>');
  if (strat.gateBlocked) badges.push('<span class="pill pill-block">Gate</span>');

  const infoParts = [];
  infoParts.push(`Cenário: ${strat.activeByScene ? "Sim" : "Não"}`);
  infoParts.push(`Central: ${strat.enabled === false ? "Off" : strat.activeFinal ? "Sim" : "Não"}`);
  if (strat.lastSignal){
    const gateNote = strat.gateBlocked ? " (gate)" : "";
    infoParts.push(`Último sinal: ${strat.lastSignal}${gateNote}`);
  }
  if (strat.gateOk === true && !strat.gateBlocked){
    infoParts.push("EMA Gate liberou");
  } else if (strat.gateOk === false){
    infoParts.push("EMA Gate negou");
  }

  const conditions = strat.guard && Array.isArray(strat.guard.conditions) ? strat.guard.conditions : [];
  const condHtml = conditions.length
    ? `<ul class="conditions">${conditions.map(renderConditionItem).join("")}</ul>`
    : '<div class="strategy-no-conditions">Sem requisitos adicionais.</div>';

  const name = escapeHtml(strat.name || humanizeId(strat.id));
  const badgesHtml = badges.join("");
  const statusHtml = `<div class="strategy-status">${escapeHtml(status)}</div>`;
  const metaHtml = `<div class="strategy-meta">${escapeHtml(infoParts.join(" • "))}</div>`;

  return `<div class="${classes.join(' ')}">
    <div class="strategy-head">
      <span class="strategy-name">${name}</span>${badgesHtml}
    </div>
    ${metaHtml}
    ${statusHtml}
    ${condHtml}
  </div>`;
}

function renderAnalysisMetricsSection(entry){
  if (!entry || !entry.metrics) return "";
  const m = entry.metrics;
  const thr = entry.thresholds || {};
  const fastPeriod = m.emaFastPeriod || m.distPeriod || 20;
  const slowPeriod = m.emaSlowPeriod || 50;
  const slopePeriod = m.slopeFastPeriod || fastPeriod;
  const distLabel = `Dist. EMA${fastPeriod} (×ATR)`;
  const rows = [
    { label: `EMA${fastPeriod}`, value: formatNumber(m.emaFast ?? m.ema20, 4) },
    { label: `EMA${slowPeriod}`, value: formatNumber(m.emaSlow ?? m.ema50, 4) },
    { label: `Slope${slopePeriod}`, value: formatNumber(m.slopeFast ?? m.slope20, 5) },
    { label: `|Slope${slopePeriod}|`, value: formatNumber(Math.abs(m.slopeFast ?? m.slope20 ?? 0), 5) },
    { label: "ATRₙ", value: formatNumber(m.atrN, 4) },
    { label: distLabel, value: formatNumber(m.distFast ?? m.distE20, 3) },
    { label: "Volume", value: formatNumber(m.volume, 2) },
    { label: "VMA20", value: formatNumber(m.vAvg20, 2) },
  ];
  const limitRows = [];
  const retest = thr.retest || {};
  if (retest.slopeMin != null) limitRows.push({ label: "Slope min", value: formatNumber(retest.slopeMin, 4) });
  if (thr.slopeLoose != null) limitRows.push({ label: "Slope relax", value: formatNumber(thr.slopeLoose, 4) });
  if (retest.distMax != null){
    const distRelax = retest.distMax + (entry.relaxActive ? (thr.distRelaxAdd ?? 0) : 0);
    limitRows.push({ label: "Dist. máx (×ATR)", value: formatNumber(distRelax, 3) });
  }
  if (retest.atrMin != null && retest.atrMax != null){
    limitRows.push({ label: "ATR faixa retest", value: `${formatNumber(retest.atrMin,4)} – ${formatNumber(retest.atrMax,4)}` });
  } else if (thr.atrMedMin != null && thr.atrMedMax != null){
    limitRows.push({ label: "ATR faixa", value: `${formatNumber(thr.atrMedMin,4)} – ${formatNumber(thr.atrMedMax,4)}` });
  }
  if (thr.atrLowCut != null) limitRows.push({ label: "ATR low cut", value: formatNumber(thr.atrLowCut, 4) });
  if (thr.atrHiMax != null) limitRows.push({ label: "ATR máx", value: formatNumber(thr.atrHiMax, 4) });
  if (thr.distRelaxAdd != null) limitRows.push({ label: "+Dist relax", value: formatNumber(thr.distRelaxAdd, 2) });

  const itemsHtml = rows.map(it => `<div class="metric"><span class="label">${escapeHtml(it.label)}</span><span class="value">${escapeHtml(it.value)}</span></div>`).join("");
  const limitsHtml = limitRows.length
    ? `<div class="analysis-inline">${limitRows.map(it => `<div class="metric"><span class="label">${escapeHtml(it.label)}</span><span class="value">${escapeHtml(it.value)}</span></div>`).join("")}</div>`
    : "";

  const relaxInfo = entry.relaxActive ? '<div class="analysis-note">Relax ativo (+dist)</div>' : '';
  const regime = entry.regime && entry.regime.state ? `<div class="analysis-note">Regime: ${escapeHtml(entry.regime.state)}${entry.regime.bias5 ? ` • 5m: ${escapeHtml(entry.regime.bias5)}` : ''}</div>` : '';

  return `<div class="analysis-section">
    <div class="analysis-subtitle">Contexto</div>
    <div class="analysis-metrics">${itemsHtml}</div>
    ${limitsHtml}
    ${relaxInfo}${regime}
  </div>`;
}

function renderAnalysisGateSection(gate){
  if (!gate) return "";
  const buyLabel = gate.allowBuy == null ? "—" : (gate.allowBuy ? "OK" : "Bloq");
  const sellLabel = gate.allowSell == null ? "—" : (gate.allowSell ? "OK" : "Bloq");
  const rows = [
    { label: "Ativo", value: gate.enabled ? "Sim" : "Não" },
    { label: "Divisor", value: gate.divisor != null ? gate.divisor : "—" },
    { label: "Direcional", value: gate.directional != null ? gate.directional : "—" },
    { label: "Dist. min (×ATR)", value: gate.minDistATR != null ? formatNumber(gate.minDistATR, 3) : "—" },
    { label: "Slope min", value: gate.slopeMin != null ? formatNumber(gate.slopeMin, 4) : "—" },
    { label: "BUY", value: buyLabel },
    { label: "SELL", value: sellLabel },
  ];
  if (gate.lastDecision){
    rows.push({ label: "Último", value: gate.lastDecision });
  }
  if (gate.blocked && gate.blocked.length){
    rows.push({ label: "Bloqueadas", value: gate.blocked.join(", ") });
  }
  const itemsHtml = rows.map(it => `<div class="metric"><span class="label">${escapeHtml(it.label)}</span><span class="value">${escapeHtml(String(it.value))}</span></div>`).join("");
  return `<div class="analysis-section">
    <div class="analysis-subtitle">EMA Gate</div>
    <div class="analysis-inline">${itemsHtml}</div>
  </div>`;
}

function renderAnalysisStrategiesSection(strats){
  if (!Array.isArray(strats) || !strats.length){
    return '<div class="analysis-section"><div class="analysis-empty">Sem dados de estratégias para este momento.</div></div>';
  }
  return `<div class="analysis-section">
    <div class="analysis-subtitle">Estratégias avaliadas</div>
    ${strats.map(renderStrategyBlock).join("")}
  </div>`;
}

function analysisSummary(entry){
  const ts = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : nowStr();
  const parts = [`[${ts}] ${entry.symbol || "—"}`];
  parts.push(`Relax: ${entry.relaxActive ? "Sim" : "Não"}`);
  if (entry.activeByScene) parts.push(`Cenário: ${(entry.activeByScene || []).length}`);
  if (entry.finalActives) parts.push(`Liberadas: ${(entry.finalActives || []).length}`);
  if (entry.chosen && entry.chosen.strategyName){
    parts.push(`Escolhida: ${entry.chosen.strategyName} (${entry.chosen.side || ""})`);
  } else {
    parts.push("Sem execução");
    if (entry.emaGate && entry.emaGate.lastDecision){
      parts.push(`EMA Gate: ${entry.emaGate.lastDecision}`);
    }
  }
  if (entry.reason) parts.push(entry.reason);
  if (entry.error) parts.push(`Erro: ${entry.error}`);
  return parts.filter(Boolean).join(" • ");
}

function renderAnalysisEntry(entry, idx){
  if (!entry) return "";
  const summary = escapeHtml(analysisSummary(entry));
  const metrics = renderAnalysisMetricsSection(entry);
  const gate = renderAnalysisGateSection(entry.emaGate);
  const strategies = renderAnalysisStrategiesSection(entry.strategies);
  return `<details class="analysis-entry" ${idx===0 ? "open" : ""}>
    <summary>${summary}</summary>
    <div class="analysis-content">
      ${metrics}
      ${gate}
      ${strategies}
    </div>
  </details>`;
}

function renderAnalysisList(entries, limit=15){
  if (!Array.isArray(entries) || !entries.length){
    return '<div class="analysis-empty">Nenhuma análise registrada ainda.</div>';
  }
  const slice = entries.slice(-limit).reverse();
  return slice.map((entry, idx) => renderAnalysisEntry(entry, idx)).join("");
}

/* ================== Leitura de UI ================== */
function readSymbolUi(){
  const candidates = [
    ...qsa("p.MuiTypography-body1"),
    ...qsa("h6.MuiTypography-subtitle1"),
    ...qsa("[data-testid*='symbol'], [class*='symbol'], [class*='pair']"),
    ...qsa("header *, .header *, [role='heading'] *")
  ];
  const el = candidates.find(p=>/\/USDT$|\/USD$/.test((p.textContent||"").trim()));
  return el ? el.textContent.trim() : null;
}
function readTfUi(){
  const el = qsa("p.MuiTypography-body1, h6.MuiTypography-subtitle1, [data-testid*='interval'], header *, .header *")
    .find(p=>/^M\d+$/.test((p.textContent||"").trim()));
  return el ? el.textContent.trim() : "M1";
}
function mapUiTfToBinance(tfUi){ const n=(tfUi.match(/M(\d+)/)||[])[1]||"1"; return `${n}m`; }
function normalizeSymbol(uiSym){ return CFG.symbolMap[uiSym] || uiSym.replace("/",""); }
function readPayout(){
  const el = qsa("span.MuiTypography-caption, [data-testid*='payout'], [class*='payout'], header *, .header *")
    .find(s=>(s.textContent||"").trim().includes("%"));
  if(!el) return null;
  const num = parseFloat(el.textContent.replace("+","").replace("%","").replace(",", ".")) / 100;
  return isNaN(num)? null : num;
}
function readThermoEdge(){
  const spans = qsa("span, [data-testid*='edge'], header *, .header *");
  const buyEl  = spans.find(s=>/comprar|compra/i.test(s.textContent||"") && (s.textContent||"").includes("%"));
  const sellEl = spans.find(s=>/vender|venda/i.test(s.textContent||"")  && (s.textContent||"").includes("%"));
  const pct = el => el? parseFloat(el.textContent.replace("%","").replace(",","."))/100 : null;
  const b = pct(buyEl), s = pct(sellEl);
  if(b==null || s==null || isNaN(b) || isNaN(s)) return null;
  return Math.abs(b - s);
}

/* ================== Timer ================== */
function secondsToCloseWS(symbol){
  const T = S.wsCloseTs[symbol];
  if (!T) return null;
  return (T - Date.now()) / 1000;
}
function secondsToCloseUI(){
  const node = qsa('span,div').find(n => /^\d{2}:\d{2}$/.test((n.textContent||'').trim()));
  if (!node) return null;
  const m = (node.textContent||'').trim().match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  return (+m[1])*60 + (+m[2]);
}
function getT(symbol){
  let t = secondsToCloseWS(symbol);
  if (t==null || t<0 || t>70){
    const ui = secondsToCloseUI();
    if (ui!=null) t = ui;
  }
  if (t==null) return null;
  if (t<0) t = 0;
  if (t>70) t = 70;
  return t;
}

/* ================== Execução (cliques) ================== */
function clickBuy(){ if (CFG.allowBuy) qsa('button,[role="button"]').find(b=>/comprar|compra/i.test(b.textContent||""))?.click(); }
function clickSell(){ if (CFG.allowSell) qsa('button,[role="button"]').find(b=>/vender|venda/i.test(b.textContent||""))?.click(); }

/* ================== Matemática ================== */
function ema(prev, price, period){ const k=2/(period+1); return prev==null?price:(price*k + prev*(1-k)); }
function updEma(store, key, price, period){ store[key]=ema(store[key],price,period); return store[key]; }
function trueRange(prevCandle, c){
  const prevClose = prevCandle ? prevCandle.c : c.c;
  return Math.max(c.h-c.l, Math.abs(c.h-prevClose), Math.abs(c.l-prevClose));
}
function updAtr(keyBase){
  const arr = S.candles[keyBase]; if(!arr || arr.length<2) return;
  const last = arr[arr.length-1], prev = arr[arr.length-2];
  const tr = trueRange(prev, last);
  const k = 2/(14+1);
  const key = keyBase+"_atr14";
  S.atr[key] = S.atr[key]==null ? tr : (tr*k + S.atr[key]*(1-k));
  return S.atr[key];
}

/* ================== Streams/Seed ================== */
function streamKey(symbol, tf){ return `${symbol.toLowerCase()}@kline_${tf}`; }
function closeAllStreams(){ for (const k in S.streams){ try{ S.streams[k].onmessage=null; S.streams[k].close(); }catch(e){} } S.streams={}; }
function ensureStream(symbol, tf){
  const key = streamKey(symbol, tf);
  if (S.streams[key]) return;
  const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${key}`);
  S.streams[key]=ws;
  ws.onopen  = ()=> log(`WS aberto ${key}`);
  ws.onerror = ()=> log(`WS erro ${key}`,"err");
  ws.onclose = ()=> { log(`WS fechado ${key}`,"warn"); delete S.streams[key]; };
  ws.onmessage = ev=>{
    const d = JSON.parse(ev.data); const k = d.k;
    const base = `${symbol}_${tf}`;
    const c = {t:k.t, T:k.T, o:+k.o, h:+k.h, l:+k.l, c:+k.c, v:+k.v, x:k.x};
    S.live[symbol] = c.c;
    if (tf==="1m") S.wsCloseTs[symbol] = c.T;

    const a = (S.candles[base] ||= []);
    if(a.length && a[a.length-1].t===c.t) a[a.length-1]=c; else { a.push(c); if(a.length>900) a.shift(); }

    // EMAs/base
    updEma(S.emas, `${base}_ema20`, c.c, 20);
    updEma(S.emas, `${base}_ema50`, c.c, 50);

    if (tf==="1m"){
      updAtr(base);
      const vkey=`${base}_vma20`; S.vma[vkey] = ema(S.vma[vkey], c.v, 20);
    }

    // libera disparo após 1º tick
    if (tf==="1m" && S.pending && S.pending.symbol===symbol && S.pending.requireNextTick && !k.x){
      S.pending.tickOk = true;
    }

    if (k.x && tf==="1m") { onMinuteClose(symbol); }
  };
}
async function seedHistory(symbol, tf){
  const base = `${symbol}_${tf}`;
  try{
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${tf}&limit=${CFG.seedCandles}`;
    const res = await fetch(url); if(!res.ok) throw new Error(res.status);
    const data = await res.json();
    S.candles[base] = data.map(k=>({t:+k[0], T:+k[6], o:+k[1], h:+k[2], l:+k[3], c:+k[4], v:+k[5], x:true}));
    // EMAs base
    S.emas[`${base}_ema20`]=null; S.emas[`${base}_ema50`]=null;
    for (const c of S.candles[base]){ updEma(S.emas,`${base}_ema20`,c.c,20); updEma(S.emas,`${base}_ema50`,c.c,50); }
    if (tf==="1m"){
      S.atr[`${base}_atr14`]=null; for(let i=1;i<S.candles[base].length;i++){ updAtr(base); }
      const vkey=`${base}_vma20`; S.vma[vkey]=null; for (const kc of S.candles[base]){ S.vma[vkey]=ema(S.vma[vkey],kc.v,20); }
      const last = S.candles[base][S.candles[base].length-1]; if(last){ S.live[symbol]=last.c; S.wsCloseTs[symbol]=last.T; }
    }
  }catch(e){ log(`Seed falhou ${symbol} ${tf}: ${e.message}`,"err"); }
}
async function seedAll(symbol){
  await Promise.all([ seedHistory(symbol, CFG.tfExec), seedHistory(symbol, CFG.tfRegA), seedHistory(symbol, CFG.tfRegB) ]);
  S.seeded = true; log("Seed concluído.");
}

/* ================== Filtros/contexto ================== */
function regimeAgreeDetailed(symbol){
  const b5 = `${symbol}_${CFG.tfRegA}`, b15 = `${symbol}_${CFG.tfRegB}`;
  const e5_20 = S.emas[`${b5}_ema20`],  e5_50 = S.emas[`${b5}_ema50`];
  const e15_20 = S.emas[`${b15}_ema20`], e15_50 = S.emas[`${b15}_ema50`];
  if([e5_20,e5_50,e15_20,e15_50].some(v=>v==null)) return null;

  const bull5=(e5_20>e5_50), bear5=(e5_20<e5_50);
  const bull15=(e15_20>e15_50), bear15=(e15_20<e15_50);

  let state="MIX";
  if (bull5 && bull15) state="BULL";
  else if (bear5 && bear15) state="BEAR";
  else if ((bull5 && bear15) || (bear5 && bull15)) state="OPPOSED";

  const bias5 = bull5 ? "BULL" : bear5 ? "BEAR" : "MIX";
  return { state, bias5 };
}
function dynamicThresholds(symbol){
  let edgeMin = CFG.minThermoEdge;
  let gapMin  = CFG.emaGapFloorPct;
  let payoutMin = CFG.payout_min;

  const payout = readPayout();
  if (payout != null && payout >= CFG.payout_soft) edgeMin = Math.min(edgeMin, 0.05);

  const b1 = `${symbol}_${CFG.tfExec}`;
  const last = S.candles[b1]?.[S.candles[b1].length-1];
  const atr  = S.atr[`${b1}_atr14`];

  if (last && atr!=null && CFG.coefAtrInGap>0){
    const floorAtr = CFG.coefAtrInGap * (atr / last.c);
    gapMin = Math.max(gapMin, floorAtr);
  }

  return { edgeMin, gapMin, payoutMin };
}
function contextFilters(symbol){
  const b1 = `${symbol}_${CFG.tfExec}`;
  const arr = S.candles[b1]; if(!arr || arr.length<2){ S.metr.block.seed++; return { ok:false, why:"seed incompleto" }; }
  const last = arr[arr.length-1];

  const until = S.cooldown[symbol] || 0;
  if (Date.now() < until){ S.metr.block.cooldown++; return { ok:false, why:"cooldown" }; }

  const atr = S.atr[`${b1}_atr14`];
  const e20 = S.emas[`${b1}_ema20`], e50 = S.emas[`${b1}_ema50`];
  if (atr==null || e20==null || e50==null){ S.metr.block.seed++; return { ok:false, why:"seed incompleto" }; }

  const { edgeMin, gapMin, payoutMin } = dynamicThresholds(symbol);

  if (!(gapMin===0 && CFG.coefAtrInGap===0)){
    const gapPct = Math.abs(e20 - e50) / last.c;
    if (gapPct < gapMin){ S.metr.block.gap++; return { ok:false, why:`gap<${toPct(gapMin)}` }; }
  }

  if (CFG.wick_ratio_max < 0.99){
    const range = last.h - last.l;
    const topW  = last.h - Math.max(last.c, last.o);
    const botW  = Math.min(last.c, last.o) - last.l;
    const wick  = Math.max(topW, botW);
    const wickRatio = range > 0 ? (wick / range) : 0;
    if (wickRatio > CFG.wick_ratio_max){ S.metr.block.wick++; return { ok:false, why:"pavio>limite" }; }
    if (atr && CFG.atr_mult_max < 99 && range > CFG.atr_mult_max * atr){ S.metr.block.atrSpike++; return { ok:false, why:`range>ATR*${CFG.atr_mult_max}` }; }
  }

  const vma = S.vma[`${b1}_vma20`];
  if (vma != null && !(CFG.vol_min_mult===0 && CFG.vol_max_mult>=99)){
    const okVol = last.v >= (CFG.vol_min_mult*vma) && last.v <= (CFG.vol_max_mult*vma);
    if (!okVol){ S.metr.block.volume++; return { ok:false, why:"volume fora da faixa" }; }
  }

  const payout = readPayout();
  if (payoutMin>0 && (payout == null || payout < payoutMin)){ S.metr.block.payout++; /* segue sinal, sem clique */ }

  const edge = readThermoEdge();
  if (edgeMin>0 && (edge == null || edge < edgeMin)){ S.metr.block.edge++; return { ok:false, why:"edge baixo" }; }

  return { ok:true, why:"ok" };
}

/* ========= Estratégias externas (sem blob, via URL da extensão) ========= */
function normalizeList(any){
  if (Array.isArray(any)) return any;
  if (any && Array.isArray(any.default)) return any.default;
  if (any && Array.isArray(any.STRATS)) return any.STRATS;
  return null;
}
// Fallback simples
const emaCrossFallback = {
  id: "emaCrossFallback",
  name: "EMA Cross (fallback)",
  detect({symbol, S, CFG}){
    const b = `${symbol}_${CFG.tfExec}`;
    const e20 = S.emas[`${b}_ema20`], e50 = S.emas[`${b}_ema50`];
    if (e20==null || e50==null) return null;
    if (e20 > e50) return { side:"BUY" };
    if (e20 < e50) return { side:"SELL" };
    return null;
  }
};

async function loadStrategies(){
  const extUrl = asset("strategies/index.mjs"); // chrome-extension://…/strategies/index.mjs
  try{
    let mod = null;
    try {
      // Import direto do recurso da extensão (não usa blob:)
      mod = await import(`${extUrl}?v=${Date.now()}`);
    } catch (e) {
      // Se falhar aqui, o mais comum é: arquivo não listado como web_accessible_resources
      throw new Error(`import(${extUrl}) falhou: ${e && e.message ? e.message : e}`);
    }

    let list = null;
    if (mod && typeof mod.loadAll === "function"){
      list = await mod.loadAll({asset, S, CFG});
    } else {
      const arr = normalizeList(mod);
      if (arr) list = arr;
    }

    if (!Array.isArray(list)) {
      throw new Error("strategies/index.mjs não exporta loadAll() nem uma lista de estratégias");
    }

    S.strategiesLoaded = {};
    const nameFrom = s => (s?.name || s?.label || s?.title || humanizeId(s?.id));

    for (const s of list){
      if (!s || !s.id) continue;
      const nm = nameFrom(s);
      S.strategiesLoaded[s.id] = { ...s, name: nm };
      if (!CFG.strategies[s.id]) {
        CFG.strategies[s.id] = { enabled: true, name: nm, orders: 0 };
      } else {
        CFG.strategies[s.id].name = nm;
      }
    }
    LS.set("opx.cfg", CFG);

    const namesSet = new Set(Object.keys(S.strategiesLoaded).map(id => CFG.strategies[id]?.name || S.strategiesLoaded[id]?.name || humanizeId(id)));
    log(`Estratégias carregadas (${Object.keys(S.strategiesLoaded).length}): ${[...namesSet].join(", ") || "(nenhuma)"}`);
  }catch(e){
    // Fallback: registra ao menos 1 estratégia básica para o sistema continuar
    S.strategiesLoaded = { [emaCrossFallback.id]: emaCrossFallback };
    if (!CFG.strategies[emaCrossFallback.id]) {
      CFG.strategies[emaCrossFallback.id] = { enabled:true, name: emaCrossFallback.name, orders:0 };
      LS.set("opx.cfg", CFG);
    }
    log(`Falha ao carregar estratégias: ${e && e.message ? e.message : e}.
Diagnóstico:
• Confirme que "strategies/index.mjs" existe, é JS válido e está listado em "web_accessible_resources" do manifest.
• Nada de blob:, data:, inline — apenas import(chrome-extension://…/strategies/index.mjs).
• Se usa bundler/roteador, certifique-se de que NÃO devolve HTML para esse path.
Ativado fallback interno: ${emaCrossFallback.name}`, "err");
  }
}

function isStratActive(id){
  const act = Array.isArray(S.activeStrats) ? S.activeStrats : [];
  if (act.length === 0) return true;
  return act.includes(id);
}
function pickStrategySignal(symbol){
  const enabledIds = Object.keys(CFG.strategies || {})
    .filter(id => CFG.strategies[id]?.enabled)
    .filter(id => isStratActive(id));

  if (enabledIds.length === 0){
    const loaders = S.strategiesLoaded || {};
    const first = Object.values(loaders)[0];
    if (first && typeof first.detect === "function"){
      try { first.detect({ symbol }); } catch (_err) { /* silencioso */ }
    }
    return null;
  }

  for (const id of enabledIds){
    const st = S.strategiesLoaded[id];
    if (!st || typeof st.detect!=="function") continue;
    try{
      const got = st.detect({ symbol, S, CFG, utils:{ regimeAgreeDetailed, dynamicThresholds } });
      const sig = got instanceof Promise ? null : got; // detect deve ser síncrono
      if (sig && sig.side && ((sig.side==="BUY"&&CFG.allowBuy)||(sig.side==="SELL"&&CFG.allowSell))){
        return { ...sig, strategyId:id, strategyName: CFG.strategies[id]?.name || st.name || id, relax: !!sig.relax };
      }
    }catch(e){
      console.debug("[OPX] detect erro", id, e?.message || e);
    }
  }
  return null;
}

/* ================== Fechamento do minuto ================== */
function onMinuteClose(symbol){
  if(!S.armed || !S.seeded) return;
  const ui = readSymbolUi(); const uiBin = ui ? normalizeSymbol(ui) : null;
  if (!uiBin || uiBin !== symbol) return;

  S.metr.closes++;

  const ctx = contextFilters(symbol);
  if (!ctx.ok){ log(`Filtro bloqueou: ${ctx.why}`, "err"); return; }

  const sig = pickStrategySignal(symbol);
  if(!sig){
    log("Sem sinal no fechamento");
    return;
  }
  S.metr.raw_signal++;

  const ref = S.live[symbol] ?? null;
  const armedAtMs = Date.now();
  const baseClose = S.wsCloseTs[symbol] || armedAtMs;
  const closeTsMs = baseClose + 60*1000;

  const forMinuteUnix = Math.floor(armedAtMs/60000)*60;
  S.pending = {
    side: sig.side, symbol, forMinuteUnix, refPrice: ref,
    armedAtMs, closeTsMs,
    requireNextTick: true, tickOk: false,
    strategyId: sig.strategyId,
    strategyName: sig.strategyName,
    relax: !!sig.relax
  };
  S.clickedThisMinute = null;

  const tagR = sig.relax ? " (relax)" : "";
  const human = `${sig.strategyName || "Estratégia"}${tagR}`;
  if (sig.side==="BUY"){ play("possivel_compra"); log(`Pendente BUY ${symbol} | ${human} — armando janela`, "warn"); }
  else { play("possivel_venda"); log(`Pendente SELL ${symbol} | ${human} — armando janela`, "warn"); }
}

/* ================== Loop do early-click (JIT/Confirmação) ================== */
async function earlyClickLoop(){
  while(true){
    try{
      const p = S.pending;
      if (p && S.armed){
        const nowMs = Date.now();
        const closeMs = p.closeTsMs || ((S.wsCloseTs[p.symbol]||nowMs) + 60*1000);
        let t = (closeMs - nowMs) / 1000;
        if (t<0) t = 0;

        const sInt = Math.floor(Math.max(0,t));
        if (t <= CFG.lockAbortSec){
          if (S.lastLateLogSec !== sInt){
            S.lastLateLogSec = sInt;
            log(`Timer ${sInt}s — muito tarde para armar`, "warn");
          }
        }

        const inClick = (t <= CFG.clickMinSec && t >= CFG.clickMaxSec);
        const safe = (t > CFG.lockAbortSec);
        const tickReady = (!p.requireNextTick) || p.tickOk;

        if (inClick && safe && tickReady && S.clickedThisMinute !== p.forMinuteUnix){
          const { edgeMin, payoutMin } = dynamicThresholds(p.symbol);
          const payout = readPayout(), edge = readThermoEdge();

          if (payoutMin>0 && (payout==null || payout < payoutMin)){
            log("Payout abaixo do mínimo — sinal mantido, sem execução.","err");
            S.pending=null; S.metr.canceled++;
          } else {
            const b1 = `${p.symbol}_${CFG.tfExec}`;
            const arr = S.candles[b1];
            const cur = arr?.[arr.length-1];
            const vma = S.vma[`${b1}_vma20`];

            let volOk = true, wickOk = true;
            if (cur && vma!=null){
              volOk  = (CFG.vol_min_mult===0) || (cur.v >= CFG.vol_min_mult * vma);
              const range = Math.max(1e-12, cur.h - cur.l);
              const topW  = cur.h - Math.max(cur.c, cur.o);
              const botW  = Math.min(cur.c, cur.o) - cur.l;
              const wick  = Math.max(topW, botW);
              const wickRatio = wick / range;
              wickOk = (CFG.wick_ratio_max >= 0.99) || (wickRatio <= CFG.wick_ratio_max);
            }

            if (!volOk){ log("Cancelado: volume abaixo do mínimo × VMA","err"); S.pending=null; S.metr.canceled++; }
            else if (!wickOk){ log("Cancelado: pavio excedeu limite na vela atual","err"); S.pending=null; S.metr.canceled++; }
            else if (edgeMin>0 && (edge==null || edge < edgeMin)){
              log("Condições mudaram — edge baixo no JIT, cancelado.","err"); S.pending=null; S.metr.canceled++;
            } else {
              await sleep(CFG.clickDelayMs);
              (p.side==="BUY") ? (CFG.allowBuy && clickBuy()) : (CFG.allowSell && clickSell());
              S.lastOrderSym = p.symbol;
              S.clickedThisMinute = p.forMinuteUnix;
              S.pending = null; S.metr.executed++;

              if (p.strategyId && CFG.strategies[p.strategyId]) {
                CFG.strategies[p.strategyId].orders = (CFG.strategies[p.strategyId].orders||0)+1;
                LS.set("opx.cfg", CFG);
              }

              const tagRelax = p.relax ? " (relax)" : "";
              const human = p.strategyName ? ` | ${p.strategyName}${tagRelax}` : (p.relax ? " | (relax)" : "");
              log(`ORDEM: ${p.side} (${CFG.tfExec})${human} — enviado em ~T-${Math.round(t)}s`,"order");
              if (p.side==="BUY") play("compra_confirmada"); else play("venda_confirmada");
            }
          }
        }
      }

      if (Date.now() - S.metr_last_summary >= CFG.metr_summary_ms){
        const b = S.metr.block;
        log("Resumo das Atividades","warn");
        log(`funil: closes=${S.metr.closes} | sinal_cru=${S.metr.raw_signal}`,"funil");
        log(`pendentes=${S.metr.pending} | exec=${S.metr.executed} | canc=${S.metr.canceled}`,"funil");
        log(`blocks: gap=${b.gap} | edge=${b.edge} | vol=${b.volume}`,"blocks");
        log(`wick=${b.wick} | atr=${b.atrSpike} | regimeOpp=${b.regimeMixOpp}`,"blocks");
        log(`payout=${b.payout} | cooldown=${b.cooldown} | seed/timer=${b.seed+b.timer}`,"blocks");
        S.metr_last_summary = Date.now();
      }
    }catch(e){ console.error(e); log(`EarlyClick erro: ${e.message}`,"err"); }
    await sleep(180);
  }
}

/* ================== UI ================== */
function mountUI(){
  if(qs("#opx-root")) return;

  const root = document.createElement("div");
  root.id = "opx-root";
  root.innerHTML = `
  <div id="opx-panel" class="opx-card" style="position:fixed; right:24px; top:72px; z-index:2147483000;">
    <div id="opx-header" class="opx-header">
      <img src="${asset('icons/icon_hermes.png')}" width="16" height="16" />
      <h3 class="opx-title">OPX • Hermes</h3>
      <span class="pill" id="opx-pill">ARMADO</span>
      <span id="opx-preset" class="pill pill-preset">Padrão</span>
      <button id="opx-collapse" class="opx-btn icon" title="Expandir/Contrair">▾</button>
      <button id="opx-menu" class="opx-btn icon" title="Configurações">⚙</button>
      <button id="opx-tuning-btn" class="opx-btn icon" title="Ajustes de estratégias">🛠</button>
    </div>

    <div id="opx-body" class="opx-body">
      <div class="row"><span>Ativo</span><strong id="opx-sym">—</strong></div>
      <div class="row"><span>Payout</span><strong id="opx-pay">—</strong></div>
      <div class="row"><span>Timer</span><strong id="opx-tmr">—</strong></div>
      <div class="row"><span>Pendente</span><strong id="opx-pend">—</strong></div>
      <div class="row"><span>Stats</span><strong id="opx-stats">—</strong></div>
      <div class="row"><span>Ativas</span><strong id="opx-active">—</strong></div>
      <div id="opx-log" class="opx-log"></div>
    </div>

    <div id="opx-foot" class="opx-foot">
      <button id="opx-armed"  class="opx-btn">Armar</button>
      <button id="opx-disarm" class="opx-btn">Pausar</button>
      <button id="opx-reset-pos" class="opx-btn">Reset pos</button>
      <button id="opx-analysis-btn" class="opx-btn">Análise</button>
      <button id="opx-history-btn" class="opx-btn">Histórico</button>
      <button id="opx-clear"  class="opx-btn">Limpar</button>
      <button id="opx-export" class="opx-btn">Export CSV</button>
    </div>
  </div>

  <!-- Modal Configurações -->
  <div id="opx-cfg-wrap" class="opx-modal">
    <div class="box box-wide">
      <div class="top top-dark">
        <h3 class="opx-title">Central de Configurações</h3>
        <div class="gap"></div>
        <button data-preset="conservador" class="opx-btn sm">Conservador</button>
        <button data-preset="moderado"   class="opx-btn sm">Moderado</button>
        <button data-preset="agressivo"  class="opx-btn sm">Agressivo</button>
        <button data-preset="ultra"      class="opx-btn sm">Ultra</button>
        <button data-preset="padrao"     class="opx-btn sm">Padrão</button>
        <button id="opx-open-all"        class="opx-btn sm warn" title="Destravar 100%">Abrir 100%</button>
        <button id="opx-cfg-close"       class="opx-btn sm">Fechar</button>
      </div>

      <div id="opx-cfg-panels" class="cfg-dashboard">
        <section class="cfg-section">
          <header class="cfg-section-head">
            <h4>Operações</h4>
            <p>Habilite os lados das ordens e ajuste os parâmetros de relaxamento.</p>
          </header>
          <div class="cfg-grid cols-3">
            <label class="cfg-item cfg-checkbox"><span>Habilitar COMPRAR</span><input type="checkbox" id="cfg-allowBuy"></label>
            <label class="cfg-item cfg-checkbox"><span>Habilitar VENDER</span><input type="checkbox" id="cfg-allowSell"></label>
            <label class="cfg-item cfg-checkbox"><span>Relax automático</span><input type="checkbox" data-cfg="relaxAuto"></label>
          </div>
          <div class="cfg-grid cols-4">
            ${cfgInput("Relax após (min)","relaxAfterMin",12,0)}
            ${cfgInput("Slope relax (min)","slopeLoose",0.0007,4)}
            ${cfgInput("+dist EMA ref (×ATR)","distE20RelaxAdd",0.10,2)}
            ${cfgInput("Resumo (min)","metr_summary_min",10,0)}
          </div>
        </section>

        <section class="cfg-section">
          <header class="cfg-section-head">
            <h4>Timers & Execução</h4>
            <p>Controle a janela JIT e os bloqueios automáticos.</p>
          </header>
          <div class="cfg-grid cols-4">
            ${cfgInput("Armar após (s)","armMinSec",8,0)}
            ${cfgInput("Travar após (s)","armMaxSec",7,0)}
            ${cfgInput("Clique mínimo (s)","clickMinSec",12,0)}
            ${cfgInput("Clique máximo (s)","clickMaxSec",7,0)}
            ${cfgInput("Delay de clique (ms)","clickDelayMs",80,0)}
            ${cfgInput("Bloqueio pós ordem (s)","lockAbortSec",5.0,1)}
          </div>
        </section>

        <section class="cfg-section">
          <header class="cfg-section-head">
            <h4>Filtros de Entrada</h4>
            <p>Ajuste os critérios mínimos de payout, volume e range.</p>
          </header>
          <div class="cfg-grid cols-4">
            ${cfgInput("EMA gap floor (%)","emaGapFloorPct",0.0005,4)}
            ${cfgInput("Coef ATR no gap","coefAtrInGap",0.30,2)}
            ${cfgInput("Edge mínimo","minThermoEdge",0.0150,4)}
            ${cfgInput("Payout mínimo","payout_min",0.80,2)}
            ${cfgInput("Payout alvo","payout_soft",0.90,2)}
            ${cfgInput("Vol. min×VMA","vol_min_mult",0.60,2)}
            ${cfgInput("Vol. máx×VMA","vol_max_mult",9.00,2)}
            ${cfgInput("Pavio máximo","wick_ratio_max",0.35,2)}
            ${cfgInput("Range máx×ATR","atr_mult_max",1.8,1)}
            ${cfgInput("Subtick cancel (%)","subtick_cancel_pct",0.0004,4)}
          </div>
        </section>

        <section class="cfg-section">
          <header class="cfg-section-head">
            <h4>EMA Gate Direcional</h4>
            <p>Parâmetros do filtro direcional por EMAs.</p>
          </header>
          <div class="cfg-grid cols-3">
            <label class="cfg-item cfg-checkbox"><span>EMA Gate habilitado</span><input type="checkbox" data-cfg="emaGate.enabled"></label>
            ${cfgInput("EMA divisor","emaGate.divisor",200,0)}
            ${cfgInput("EMA direcional","emaGate.directional",20,0)}
            ${cfgInput("Dist. mínima (×ATR)","emaGate.minDistATR",0.30,2)}
            ${cfgInput("Slope direcional min","emaGate.slopeMin",0.0008,4)}
          </div>
        </section>

        <section class="cfg-section">
          <header class="cfg-section-head">
            <h4>Estratégias habilitadas</h4>
            <p>Selecione rapidamente quais estratégias podem executar ordens.</p>
          </header>
          <div id="opx-strats" class="cfg-strategy-grid"></div>
        </section>
      </div>

      <div class="bot">
        <button id="opx-cfg-save"  class="opx-btn">Salvar</button>
        <button id="opx-cfg-reset" class="opx-btn">Restaurar padrão</button>
      </div>
    </div>
  </div>

  <!-- Modal Ajustes Estratégicos -->
  <div id="opx-tuning" class="opx-modal">
    <div class="box box-wide">
      <div class="top">
        <h3 class="opx-title">Ajustes de estratégias</h3>
        <div class="gap"></div>
        <button class="close" id="opx-tuning-reset-all">Restaurar tudo</button>
        <button class="close" id="opx-tuning-close">Fechar</button>
      </div>
      <div id="opx-tuning-body" class="tuning-body"></div>
      <div class="bot">
        <button id="opx-tuning-save" class="opx-btn">Salvar ajustes</button>
      </div>
    </div>
  </div>

  <!-- Modal Análise -->
  <div id="opx-analysis" class="opx-modal">
    <div class="box">
      <div class="top">
        <h3 class="opx-title">Diagnóstico de estratégias</h3>
        <div class="gap"></div>
        <button class="close" id="opx-analysis-refresh">Atualizar</button>
        <button class="close warn" id="opx-analysis-clear">Limpar análises</button>
        <button class="close" id="opx-analysis-close">Fechar</button>
      </div>
      <div id="opx-analysis-body" class="analysis-list"></div>
    </div>
  </div>

  <!-- Modal Histórico -->
  <div id="opx-history" class="opx-modal">
    <div class="box">
      <div class="top">
        <input id="opx-h-filter" placeholder="Filtrar..." />
        <div class="gap"></div>
        <button class="close" id="opx-h-clear">Limpar histórico</button>
        <button class="close" id="opx-h-close">Fechar</button>
      </div>
      <div id="opx-h-pre" class="opx-h-list"></div>
    </div>
  </div>
  `;
  document.body.appendChild(root);

  function cfgInput(label, key, placeholder=0, stepDigits=2){
    const step = stepDigits>0 ? String(1/Math.pow(10,stepDigits)) : "1";
    return `
    <label class="cfg-item">
      <span>${label}</span>
      <input data-cfg="${key}" type="number" inputmode="decimal" step="${step}" placeholder="${placeholder}" />
    </label>`;
  }

  // drag + reset pos
  (function(){
    try{
      const panel = document.getElementById('opx-panel');
      const header = document.getElementById('opx-header');
      if (!panel.style.position) { panel.style.position='fixed'; panel.style.right='24px'; panel.style.top='72px'; }
      panel.style.zIndex = '2147483000';
      header.style.cursor = 'move';

      const saved = LS.get('opx.panel.pos', null);
      if(saved){ panel.style.left=saved.x+'px'; panel.style.top=saved.y+'px'; panel.style.right='auto'; }

      let drag=false,sx=0,sy=0,bx=0,by=0;
      const start = (ev)=>{ drag=true; sx=ev.clientX; sy=ev.clientY; const r=panel.getBoundingClientRect(); bx=r.left; by=r.top; panel.style.right='auto'; document.body.style.userSelect='none'; };
      header.addEventListener('mousedown', start);
      header.addEventListener('touchstart', (e)=>{const t=e.touches[0]; start({clientX:t.clientX, clientY:t.clientY});});
      window.addEventListener('mousemove', ev=>{ if(!drag) return; panel.style.left=(bx+ev.clientX-sx)+'px'; panel.style.top=(by+ev.clientY-sy)+'px'; });
      window.addEventListener('touchmove', ev=>{ if(!drag) return; const t=ev.touches[0]; panel.style.left=(bx+t.clientX-sx)+'px'; panel.style.top=(by+t.clientY-sy)+'px'; }, {passive:true});
      const end = ()=>{ if(!drag) return; drag=false; document.body.style.userSelect=''; const r=panel.getBoundingClientRect(); LS.set('opx.panel.pos',{x:r.left,y:r.top}); };
      window.addEventListener('mouseup', end); window.addEventListener('touchend', end);
      qs('#opx-reset-pos').onclick=()=>{ localStorage.removeItem('opx.panel.pos'); panel.style.left=''; panel.style.top=''; panel.style.right='24px'; panel.style.top='72px'; };
    }catch(e){}
  })();

  // painel buttons
  const collapseBtn = qs("#opx-collapse");
  const bodyEl = qs("#opx-body");
  const footEl = qs("#opx-foot");
  function applyCollapsed(v){
    if(v){ bodyEl.style.display="none"; footEl.style.display="none"; collapseBtn.textContent="▸"; }
    else { bodyEl.style.display="block"; footEl.style.display="flex"; collapseBtn.textContent="▾"; }
    LS.set("opx.collapsed", !!v);
  }
  collapseBtn.onclick = ()=> applyCollapsed(!(LS.get("opx.collapsed", false)));
  applyCollapsed(LS.get("opx.collapsed", false));

  qs("#opx-armed").onclick  = ()=>{ S.armed=true; log("ARMADO"); qs("#opx-pill").textContent="ARMADO"; };
  qs("#opx-disarm").onclick = ()=>{ S.armed=false; S.pending=null; log("PAUSADO","warn"); qs("#opx-pill").textContent="PAUSA"; };

  // limpar só o painel
  qs("#opx-clear").onclick  = ()=>{ const l=qs("#opx-log"); l.innerHTML=""; };

  qs("#opx-export").onclick = ()=>{
    const rows = [...qs("#opx-log").children].reverse().map(n=>n.textContent);
    const csv = "data:text/csv;charset=utf-8," + rows.map(r=>`"${r.replace(/"/g,'""')}"`).join("\n");
    const a = document.createElement("a"); a.href = encodeURI(csv); a.download="opx-log.csv"; a.click();
  };

  // histórico modal
  const H = { wrap:qs("#opx-history"), pre:qs("#opx-h-pre"), filter:qs("#opx-h-filter"),
    open(){ this.sync(); this.wrap.style.display="flex"; this.filter.focus(); },
    close(){ this.wrap.style.display="none"; },
    sync(){
      const f=(this.filter.value||"").trim().toLowerCase();
      const rows = [...S.history]
        .sort((a,b)=>b.t-a.t)
        .map(it=>({t:`[${new Date(it.t).toLocaleTimeString()}]`, text:it.text, cls:it.cls||'ok'}))
        .filter(it=>!f || (it.t.toLowerCase()+it.text.toLowerCase()).includes(f));
      this.pre.innerHTML = rows.map(it=>`<div class="line ${it.cls}">${it.t} ${wrapText(it.text)}</div>`).join("");
      this.pre.scrollTop = 0;
    }
  };
  qs("#opx-history-btn").onclick=()=>H.open();
  qs("#opx-h-close").onclick    =()=>H.close();
  H.filter?.addEventListener('input', ()=>H.sync());
  qs("#opx-h-clear").onclick = ()=>{
    S.history = [];
    localStorage.removeItem("opx.history");
    H.sync();
  };

  const Analysis = {
    wrap: qs("#opx-analysis"),
    body: qs("#opx-analysis-body"),
    open(){ if(this.wrap){ this.wrap.style.display="flex"; this.sync(); } },
    close(){ if(this.wrap){ this.wrap.style.display="none"; } },
    sync(){ if(this.body){ this.body.innerHTML = renderAnalysisList(S.analysisLog); this.body.scrollTop = 0; } },
    isOpen(){ return !!(this.wrap && this.wrap.style.display === "flex"); }
  };
  qs("#opx-analysis-btn").onclick = ()=>Analysis.open();
  qs("#opx-analysis-close").onclick = ()=>Analysis.close();
  qs("#opx-analysis-refresh").onclick = ()=>Analysis.sync();
  const analysisClear = qs("#opx-analysis-clear");
  if (analysisClear){
    analysisClear.onclick = ()=>{
      S.analysisLog = [];
      Analysis.sync();
      log("Histórico de análises limpo.");
    };
  }
  S.onAnalysis = ()=>{ if (Analysis.isOpen()) Analysis.sync(); };

  // config modal
  const Cfg = {
    wrap: qs("#opx-cfg-wrap"),
    open(){ hydrateCfgForm(); renderStrats(); this.wrap.style.display="flex"; },
    close(){ this.wrap.style.display="none"; }
  };
  qs("#opx-menu").onclick = ()=> Cfg.open();
  qs("#opx-cfg-close").onclick = ()=> Cfg.close();
  const tuningBtn = qs("#opx-tuning-btn");
  if (tuningBtn) tuningBtn.onclick = ()=>Tuning.open();
  qs("#opx-tuning-close").onclick = ()=>Tuning.close();
  qs("#opx-tuning-save").onclick = ()=>Tuning.save();
  qs("#opx-tuning-reset-all").onclick = ()=>Tuning.resetAll();

  // presets
  qsa('[data-preset]').forEach(b=>{
    b.onclick = ()=>{
      const name = b.getAttribute('data-preset');
      applyPreset(name);
      setPresetPill(name);
      log(`Preset aplicado: ${name}`);
      hydrateCfgForm(); renderStrats();
    };
  });

  // abrir 100%
  qs("#opx-open-all").onclick = ()=>{
    const openAll = {
      emaGapFloorPct: 0, coefAtrInGap: 0, minThermoEdge: 0, payout_min: 0,
      vol_min_mult: 0, vol_max_mult: 99, wick_ratio_max: 0.99, atr_mult_max: 99
    };
    Object.assign(CFG, openAll);
    LS.set("opx.cfg", CFG);
    LS.set("opx.preset", "personalizado");
    setPresetPill("personalizado");
    hydrateCfgForm();
    log("Entradas liberadas 100% (filtros destravados).", "warn");
  };

  // salvar/reset
  qs("#opx-cfg-save").onclick = ()=>{
    const obj = readCfgForm();
    Object.keys(obj).forEach(k=>{ setPath(CFG, k, obj[k]); });
    CFG.allowBuy  = !!qs("#cfg-allowBuy").checked;
    CFG.allowSell = !!qs("#cfg-allowSell").checked;
    CFG.metr_summary_ms = (Number(obj["metr_summary_min"])||Math.round(CFG.metr_summary_ms/60000))*60*1000;
    LS.set("opx.cfg", CFG);
    LS.set("opx.preset", "personalizado");
    setPresetPill("personalizado");
    log("Configurações salvas. (Ativas imediatamente)");
    Cfg.close();
  };
  qs("#opx-cfg-reset").onclick = ()=>{
    Object.assign(CFG, DEFAULT_CFG);
    CFG.emaGate = { ...DEFAULT_CFG.emaGate };
    CFG.strategyTunings = cloneTunings(STRATEGY_TUNING_DEFAULTS);
    LS.set("opx.cfg", CFG);
    LS.set("opx.preset", "padrão");
    setPresetPill("padrão");
    hydrateCfgForm(); renderStrats();
    if (Tuning.isOpen()){ Tuning.editing = cloneTunings(STRATEGY_TUNING_DEFAULTS); Tuning.render(); }
    log("Padrão restaurado.");
  };

  function setPresetPill(name){
    const el = qs("#opx-preset");
    const labelMap = {padrao:"Padrão", conservador:"Conservador", moderado:"Moderado", agressivo:"Agressivo", ultra:"Ultra", personalizado:"Personalizado"};
    el.textContent = labelMap[name] || "Personalizado";
  }
  function applyPreset(name){
    const p = PRESETS[name] || PRESETS.padrao;
    const keep = {
      armMinSec: CFG.armMinSec,
      armMaxSec: CFG.armMaxSec,
      clickMinSec: CFG.clickMinSec,
      clickMaxSec: CFG.clickMaxSec,
      lockAbortSec: CFG.lockAbortSec,
      clickDelayMs: CFG.clickDelayMs,
      strategies: CFG.strategies,
      allowBuy: CFG.allowBuy,
      allowSell: CFG.allowSell,
      strategyTunings: CFG.strategyTunings
    };
    Object.assign(CFG, p, keep);
    LS.set("opx.cfg", CFG);
    LS.set("opx.preset", name);
  }
  function readNum(el){
    const v = el.value.trim().replace(",", ".");
    if (v==="") return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  }
  function hydrateCfgForm(){
    qsa("#opx-cfg-panels [data-cfg]").forEach(inp=>{
      const path = inp.getAttribute("data-cfg");
      let val = getPath(CFG, path);
      if (inp.type === "checkbox"){
        inp.checked = !!val;
      } else {
        if (path==="metr_summary_min") val = Math.round(CFG.metr_summary_ms/60000);
        inp.value = (val==null?"" : String(val));
      }
    });
    qs("#cfg-allowBuy").checked = !!CFG.allowBuy;
    qs("#cfg-allowSell").checked= !!CFG.allowSell;
  }
  function readCfgForm(){
    const out = {};
    qsa("#opx-cfg-panels [data-cfg]").forEach(inp=>{
      const k = inp.getAttribute("data-cfg");
      if (inp.type==="checkbox"){ out[k] = !!inp.checked; return; }
      const n = readNum(inp); if (n==null) return;
      if (/(emaGapFloorPct|minThermoEdge|slopeLoose|emaGate\.slopeMin|subtick_cancel_pct)$/i.test(k)) out[k] = Number(n.toFixed(4));
      else if (/(coefAtrInGap|payout_min|payout_soft|vol_min_mult|vol_max_mult|wick_ratio_max|distE20RelaxAdd|emaGate\.minDistATR)$/i.test(k)) out[k] = Number(n.toFixed(2));
      else if (/atr_mult_max/i.test(k)) out[k] = Number(n.toFixed(1));
      else if (/emaGate\.divisor$/i.test(k) || /emaGate\.directional$/i.test(k)) out[k] = Math.max(1, Math.round(n));
      else if (/(armMinSec|armMaxSec|clickMinSec|clickMaxSec|relaxAfterMin|metr_summary_min)$/i.test(k)) out[k] = Math.max(0, Math.round(n));
      else if (/clickDelayMs/i.test(k)) out[k] = Math.max(0, Math.round(n));
      else if (/lockAbortSec/i.test(k)) out[k] = Number(n.toFixed(1));
      else out[k] = n;
    });
    return out;
  }

  function renderStrats(){
    const box = qs("#opx-strats"); if (!box) return;
    box.innerHTML = "";
    const ids = Object.keys(CFG.strategies);
    ids.sort((a,b)=> (CFG.strategies[a].name||a).localeCompare(CFG.strategies[b].name||b));
    ids.forEach(id=>{
      const st = CFG.strategies[id];
      const cnt = st.orders||0;
      const lbl = `${st.name || id} (${cnt})`;
      const item = document.createElement("label");
      item.className = "cfg-item";
      item.innerHTML = `<span>${lbl}</span><input type="checkbox" data-strat="${id}">`;
      box.appendChild(item);
      const chk = item.querySelector("input");
      chk.checked = !!st.enabled;
      chk.addEventListener("change", ()=>{
        CFG.strategies[id].enabled = !!chk.checked;
        LS.set("opx.cfg", CFG);
      });
    });
  }

  const Tuning = {
    wrap: qs("#opx-tuning"),
    body: qs("#opx-tuning-body"),
    editing: null,
    open(){
      if (!this.wrap) return;
      this.editing = mergeTunings(STRATEGY_TUNING_DEFAULTS, CFG.strategyTunings || {});
      this.render();
      this.wrap.style.display = "flex";
    },
    close(){
      if (this.wrap) this.wrap.style.display = "none";
      this.editing = null;
    },
    render(){
      if (!this.body) return;
      this.body.innerHTML = buildTuningHtml();
      hydrateTuningForm(this.editing || {});
      qsa('#opx-tuning-body [data-reset-strategy]').forEach(btn=>{
        btn.onclick = ()=>{
          const id = btn.getAttribute('data-reset-strategy');
          if (!id) return;
          this.editing[id] = { ...(STRATEGY_TUNING_DEFAULTS[id] || {}) };
          hydrateTuningForm(this.editing);
          log(`Ajustes resetados: ${getTuningTitle(id)}`);
        };
      });
    },
    resetAll(){
      this.editing = cloneTunings(STRATEGY_TUNING_DEFAULTS);
      hydrateTuningForm(this.editing);
      log("Todos os ajustes de estratégias foram restaurados.", "warn");
    },
    save(){
      if (!this.body) return;
      this.editing = readTuningForm();
      CFG.strategyTunings = mergeTunings(STRATEGY_TUNING_DEFAULTS, this.editing || {});
      LS.set("opx.cfg", CFG);
      LS.set("opx.preset", "personalizado");
      setPresetPill("personalizado");
      log("Ajustes de estratégias salvos.");
      this.close();
    },
    isOpen(){
      return !!(this.wrap && this.wrap.style.display === "flex");
    }
  };

  function getTuningIds(){
    const ids = new Set([
      ...Object.keys(STRATEGY_TUNING_DEFAULTS || {}),
      ...Object.keys(STRATEGY_TUNING_SCHEMA || {})
    ]);
    return [...ids].sort((a,b)=> getTuningTitle(a).localeCompare(getTuningTitle(b)));
  }

  function getTuningTitle(id){
    return (STRATEGY_TUNING_SCHEMA[id]?.title) || (CFG.strategies?.[id]?.name) || humanizeId(id);
  }

  function findField(id, key){
    const schema = STRATEGY_TUNING_SCHEMA[id];
    return schema?.fields?.find(f=>f.key===key) || null;
  }

  function buildTuningHtml(){
    const parts = getTuningIds().map(id=>{
      const schema = STRATEGY_TUNING_SCHEMA[id] || { title: humanizeId(id), fields: [] };
      const fields = schema.fields || [];
      const defaults = STRATEGY_TUNING_DEFAULTS[id] || {};
      const cols = Math.min(3, Math.max(1, fields.length));
      const inputs = fields.length ? `
        <div class="tuning-grid cols-${cols}">
          ${fields.map(field => {
            const step = field.step != null ? field.step : "any";
            const min = field.min != null ? ` min="${field.min}"` : "";
            const placeholder = defaults[field.key] != null ? ` placeholder="${defaults[field.key]}"` : "";
            return `
            <label class="cfg-item">
              <span>${escapeHtml(field.label || field.key)}</span>
              <input type="number" inputmode="decimal" data-tuning="${id}.${field.key}" step="${step}"${min}${placeholder} />
            </label>`;
          }).join("")}
        </div>` : '<div class="tuning-empty">Sem ajustes adicionais.</div>';
      return `
        <section class="tuning-section" data-strategy="${id}">
          <div class="tuning-head">
            <div>
              <h4>${escapeHtml(schema.title || humanizeId(id))}</h4>
              ${schema.description ? `<p>${escapeHtml(schema.description)}</p>` : ""}
            </div>
            <button type="button" class="opx-btn sm ghost" data-reset-strategy="${id}">Resetar</button>
          </div>
          ${inputs}
        </section>`;
    });
    return parts.join("");
  }

  function hydrateTuningForm(data){
    qsa('#opx-tuning-body [data-tuning]').forEach(inp=>{
      const path = inp.getAttribute('data-tuning');
      const val = getPath(data, path);
      inp.value = (val==null ? '' : String(val));
    });
  }

  function normalizeTuningValue(field, value){
    if (value == null || Number.isNaN(value)) return null;
    let v = value;
    if (typeof field.min === 'number') v = Math.max(field.min, v);
    if (typeof field.max === 'number') v = Math.min(field.max, v);
    const stepNum = Number(field.step);
    if (!Number.isNaN(stepNum) && stepNum > 0){
      if (stepNum >= 1){
        v = Math.round(v);
      } else {
        const dec = String(stepNum).includes('.') ? String(stepNum).split('.')[1].length : 0;
        if (dec > 0) v = Number(v.toFixed(Math.min(6, dec)));
      }
    }
    return v;
  }

  function readTuningForm(){
    const collected = {};
    qsa('#opx-tuning-body [data-tuning]').forEach(inp=>{
      const path = inp.getAttribute('data-tuning');
      if (!path) return;
      const [id, key] = path.split('.');
      if (!id || !key) return;
      const field = findField(id, key) || {};
      const raw = inp.value.trim();
      if (!collected[id]) collected[id] = {};
      if (raw === ''){
        const def = STRATEGY_TUNING_DEFAULTS[id]?.[key];
        collected[id][key] = (def != null) ? def : null;
        return;
      }
      const num = readNum(inp);
      if (num == null) return;
      const normalized = normalizeTuningValue(field, num);
      if (normalized == null) return;
      collected[id][key] = normalized;
    });
    const baseDefaults = cloneTunings(STRATEGY_TUNING_DEFAULTS);
    const base = mergeTunings(baseDefaults, Tuning.editing || {});
    const merged = mergeTunings(base, collected);
    Object.entries(collected).forEach(([id, fields])=>{
      Object.entries(fields).forEach(([key, val])=>{
        if (val === null){
          if (STRATEGY_TUNING_DEFAULTS[id] && STRATEGY_TUNING_DEFAULTS[id][key] != null){
            merged[id][key] = STRATEGY_TUNING_DEFAULTS[id][key];
          } else {
            delete merged[id][key];
          }
        }
      });
    });
    return merged;
  }

  restoreHistory();

  // UI pulse
  if (window.__opxUiInt) clearInterval(window.__opxUiInt);
  window.__opxUiInt = setInterval(()=>{
    const uiSym = readSymbolUi();
    const tfUi = readTfUi();

    qs("#opx-sym").textContent = uiSym ? normalizeSymbol(uiSym) : "—";
    const p = readPayout(); qs("#opx-pay").textContent = p!=null ? `${Math.round(p*100)}%` : "—";

    const sym = uiSym ? normalizeSymbol(uiSym) : null;
    const tWs = sym ? getT(sym) : null;
    qs("#opx-tmr").textContent = (tWs!=null) ? `${Math.max(0, Math.floor(tWs))}s` : "—";

    qs("#opx-pend").textContent = S.pending? `${S.pending.side}${S.pending.strategyName?` • ${S.pending.strategyName}${S.pending.relax?' (relax)':''}`:""}`:"—";
    updateMiniStats();

    // Estratégias ativas (via orquestrador)
    const actEl = qs("#opx-active");
    if (actEl) {
      const list = Array.isArray(S.activeStrats) ? S.activeStrats : [];
      const names = list.map(id => (CFG.strategies?.[id]?.name) || id);
      actEl.textContent = names.length ? names.join(", ") : "—";
    }

    if (uiSym && (uiSym!==S.lastUiSym || tfUi!==CFG.tfExecUi)){
      S.lastUiSym = uiSym; CFG.tfExecUi = tfUi; CFG.tfExec = mapUiTfToBinance(tfUi);
      const binSym = normalizeSymbol(uiSym);
      bootStreamsAndSeed(binSym);
    }

    // se o painel for removido (SPA), recria
    if (!qs("#opx-root")) {
      try { mountUI(); } catch(e){}
    }
  }, 300);
}

function updateMiniStats(){
  const ui = readSymbolUi(); const sym = ui ? normalizeSymbol(ui) : null;
  const el = qs("#opx-stats"); if(!el) return;
  if(!sym){ el.textContent="—"; return; }

  const b = S.stats[sym];
  const hasResults = b && Array.isArray(b.results) && b.results.length>0;

  if (hasResults){
    const last15 = b.results.slice(-15);
    const wr15 = last15.length ? Math.round(100* last15.filter(r=>r.win).length / last15.length) : null;
    const last50 = b.results.slice(-50);
    const wr50 = last50.length ? Math.round(100* last50.filter(r=>r.win).length / last50.length) : null;
    el.textContent = `WR15 ${wr15==null?'-':wr15+'%'} • WR50 ${wr50==null?'-':wr50+'%'}`;
  } else {
    const m = S.metr;
    el.textContent = `closes ${m.closes} • sinal ${m.raw_signal} • exec ${m.executed} • canc ${m.canceled}`;
  }
}

/* ================== Boot helpers ================== */
async function bootStreamsAndSeed(binSym){
  if (S.activeBinSym === binSym) return;
  S.activeBinSym = binSym;
  closeAllStreams();
  S.pending = null; S.clickedThisMinute=null;
  [CFG.tfExec, CFG.tfRegA, CFG.tfRegB].forEach(tf=>ensureStream(binSym, tf));
  S.seeded = false;
  await seedAll(binSym);
}

/* ================== Histórico (ganho/perda) ================== */
function attachHistoryObserver(){
  const obs = new MutationObserver(()=>{
    const rows = qsa("h6.MuiTypography-subtitle1");
    const status = rows.find(r => (r.textContent||"").includes("Status"));
    const dir    = rows.find(r => (r.textContent||"").includes("Direção"));
    if(status && dir){
      const st = status.nextElementSibling?.textContent.trim();
      const sideTxt = dir.nextElementSibling?.textContent.trim();
      if(!st) return;
      const sym = S.lastOrderSym || normalizeSymbol(readSymbolUi()||"");
      log(`Histórico: ${st} ${sym?`[${sym}]`:""} (${sideTxt||""})`, st==="Ganho"?"order":"err");
      if(st==="Ganho") play("vitoria"); else if(st==="Perda") play("perdemos");
    }
  });
  obs.observe(document.body, {childList:true, subtree:true});
}

/* ================== Boot ================== */
(async function boot(){
  const ready = () => document.readyState === "complete" || document.readyState === "interactive";
  if (!ready()) await new Promise(r=>document.addEventListener('DOMContentLoaded', r, {once:true}));

  mountUI();
  attachHistoryObserver();
  await loadStrategies(); // carrega /strategies

  const uiSym = readSymbolUi(); const tfUi = readTfUi();
  if (uiSym){
    S.lastUiSym = uiSym; CFG.tfExecUi = tfUi; CFG.tfExec = mapUiTfToBinance(tfUi);
    await bootStreamsAndSeed(normalizeSymbol(uiSym));
  } else {
    log("Ativo não detectado. Abra um gráfico.","warn");
  }

  earlyClickLoop(); // no-await
})();
