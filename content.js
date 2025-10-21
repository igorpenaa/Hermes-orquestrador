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

let CURRENT_CFG = null;

/* ================== Config (default + presets) ================== */
const STRATEGY_TUNING_DEFAULTS = {
  aOrbAvwapRegime: {
    orMinutes: 15,
    sessionMinutes: 1440,
    adxTrend: 23,
    emaGapMin: 0.0005,
    breakVolMult: 1.1,
    fadeVolMult: 1.0,
    distVwapMin: 0.25,
    distVwapMax: 1.2,
    pullbackMaxAtr: 0.6,
    vwapSlopeMin: 0,
    vwapSlopeLookback: 10
  },
  emaFlowScalper21: {
    adxMin: 20,
    atrNMin: 0.00025,
    volMult: 1.0,
    emaGapMin: 0.0004,
    slopeMin: 0.0005,
    requireM15Agree: false,
    slopeLookback: 3
  },
  breakoutRetestPro: {
    lookback: 35,
    breakAtrMult: 0.2,
    breakAtrMin: 0.15,
    retestWindow: 3,
    volBreakMult: 1.1,
    allowOppositeTrend: false
  },
  vwapPrecisionBounce: {
    distMinAtr: 0.25,
    distMaxAtr: 1.2,
    adxMax: 27,
    wickMin: 0.4,
    volMult: 1.0,
    sessionMinutes: 1440
  },
  liquiditySweepReversal: {
    lookback: 30,
    adxMax: 27,
    wickMin: 0.45,
    volMult: 1.0
  },
  atrSqueezeBreak: {
    atrPercentile: 35,
    bbwPercentile: 35,
    atrLookback: 200,
    boxLenMin: 8,
    boxLenMax: 15,
    breakAtrMult: 0.2,
    volMult: 1.1,
    pullbackMaxAtr: 0.5
  },
  alpinista: {
    emaFast: 20,
    emaSlow: 50,
    slopeMin: 0.0012,
    lookback: 6,
    minStrong: 4,
    bodyStrength: 0.55,
    distMax: 1.25,
    atrMin: 0.0045,
    atrMax: 0.0280,
    volMult: 1.15
  },
  bagjump: {
    emaFast: 20,
    emaSlow: 50,
    slopeMin: 0.0012,
    lookback: 6,
    minStrong: 4,
    bodyStrength: 0.55,
    distMax: 1.25,
    atrMin: 0.0045,
    atrMax: 0.0280,
    volMult: 1.15
  },
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
  gapRejection: {
    gapFloorPct: 0.008,
    gapAtrMult: 0.8,
    wickMaxRatio: 0.8,
    rejectionBufferPct: 0.0005
  },
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

const STRATEGY_RIGIDITY_VERSION = 1;
const RIGIDITY_MIN = 0;
const RIGIDITY_MAX = 100;
const DEFAULT_STRATEGY_RIGIDITY = {
  version: STRATEGY_RIGIDITY_VERSION,
  global: 50,
  overrides: {}
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
  protectionRestMin: 10,

  // fluxos
  hist_max_lines: 2000,
  metr_summary_ms: 10 * 60 * 1000,

  // gerais
  allowBuy: true,
  allowSell: true,
  retracaoMode: "off",
  protectionLossStreak: 3,
  protectionRestMin: 5,
  audioVolume: 0.9,

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

  strategyTunings: cloneTunings(STRATEGY_TUNING_DEFAULTS),
  guardToggles: {},
  strategyRigidity: {
    version: DEFAULT_STRATEGY_RIGIDITY.version,
    global: DEFAULT_STRATEGY_RIGIDITY.global,
    overrides: { ...(DEFAULT_STRATEGY_RIGIDITY.overrides || {}) }
  }
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
  aOrbAvwapRegime: {
    title: "A-ORB / AVWAP Regime",
    description: "Parâmetros do rompimento da Opening Range e dos fades na AVWAP.",
    fields: [
      { key: "orMinutes", label: "Opening Range (min)", step: 1, min: 1 },
      { key: "adxTrend", label: "ADX5 modo trend", step: 1, min: 0 },
      { key: "emaGapMin", label: "Gap EMA5m (pct)", step: 0.0001, min: 0 },
      { key: "breakVolMult", label: "Volume rompimento", step: 0.05, min: 0 },
      { key: "fadeVolMult", label: "Volume fade", step: 0.05, min: 0 },
      { key: "distVwapMin", label: "Dist. AVWAP min (×ATR)", step: 0.05, min: 0 },
      { key: "distVwapMax", label: "Dist. AVWAP máx (×ATR)", step: 0.05, min: 0 },
      { key: "pullbackMaxAtr", label: "Pullback máx (×ATR)", step: 0.05, min: 0 },
      { key: "vwapSlopeMin", label: "Slope AVWAP min", step: 0.0001 }
    ],
    scenarios: [
      { key: 'minimo', label: 'Cenário mínimo', values: { adxTrend: 23, emaGapMin: 0.0005, breakVolMult: 1.1, fadeVolMult: 1.0, distVwapMin: 0.25, distVwapMax: 1.2, pullbackMaxAtr: 0.6, vwapSlopeMin: 0 } },
      { key: 'ouro', label: 'Cenário ouro', values: { adxTrend: 25, emaGapMin: 0.0006, breakVolMult: 1.3, fadeVolMult: 1.1, distVwapMin: 0.3, distVwapMax: 1.0, pullbackMaxAtr: 0.5, vwapSlopeMin: 0.0002 } }
    ]
  },
  emaFlowScalper21: {
    title: "EMA Flow Scalper 2.1",
    description: "Ajuste do filtro direcional e da confirmação de fluxo nos pullbacks de EMA.",
    fields: [
      { key: "adxMin", label: "ADX5 mínimo", step: 1, min: 0 },
      { key: "atrNMin", label: "ATRₙ mínimo", step: 0.00005, min: 0 },
      { key: "volMult", label: "Volume ×VMA20", step: 0.05, min: 0 },
      { key: "emaGapMin", label: "Gap EMA20-50 (pct)", step: 0.0001, min: 0 },
      { key: "slopeMin", label: "Slope EMA50 5m", step: 0.0001 }
    ],
    scenarios: [
      { key: 'minimo', label: 'Cenário mínimo', values: { adxMin: 20, atrNMin: 0.00025, volMult: 1.0, emaGapMin: 0.0004, slopeMin: 0.0005, requireM15Agree: false } },
      { key: 'ouro', label: 'Cenário ouro', values: { adxMin: 25, atrNMin: 0.00035, volMult: 1.2, emaGapMin: 0.0008, slopeMin: 0.0008, requireM15Agree: true } }
    ]
  },
  breakoutRetestPro: {
    title: "Breakout-Retest Pro",
    description: "Controla o quão forte o rompimento precisa ser e o volume exigido no reteste.",
    fields: [
      { key: "lookback", label: "Lookback SR", step: 1, min: 10 },
      { key: "breakAtrMult", label: "Offset rompimento (×ATR)", step: 0.01, min: 0 },
      { key: "breakAtrMin", label: "Offset mínimo", step: 0.01, min: 0 },
      { key: "volBreakMult", label: "Volume rompimento", step: 0.05, min: 0 }
    ],
    scenarios: [
      { key: 'minimo', label: 'Cenário mínimo', values: { lookback: 35, breakAtrMult: 0.2, breakAtrMin: 0.15, volBreakMult: 1.1 } },
      { key: 'ouro', label: 'Cenário ouro', values: { lookback: 40, breakAtrMult: 0.22, breakAtrMin: 0.2, volBreakMult: 1.3 } }
    ]
  },
  vwapPrecisionBounce: {
    title: "VWAP Precision Bounce",
    description: "Limiar de deslocamento e volume para reversões na VWAP.",
    fields: [
      { key: "distMinAtr", label: "Distância min (×ATR)", step: 0.05, min: 0 },
      { key: "distMaxAtr", label: "Distância máx (×ATR)", step: 0.05, min: 0 },
      { key: "adxMax", label: "ADX5 máximo", step: 1, min: 0 },
      { key: "wickMin", label: "Pavio mínimo", step: 0.05, min: 0 },
      { key: "volMult", label: "Volume ×VMA20", step: 0.05, min: 0 }
    ],
    scenarios: [
      { key: 'minimo', label: 'Cenário mínimo', values: { distMinAtr: 0.25, distMaxAtr: 1.2, adxMax: 27, wickMin: 0.4, volMult: 1.0 } },
      { key: 'ouro', label: 'Cenário ouro', values: { distMinAtr: 0.3, distMaxAtr: 1.1, adxMax: 25, wickMin: 0.45, volMult: 1.2 } }
    ]
  },
  liquiditySweepReversal: {
    title: "Liquidity Sweep Reversal",
    description: "Filtros para varreduras de liquidez com rejeição.",
    fields: [
      { key: "lookback", label: "Lookback referência", step: 1, min: 5 },
      { key: "adxMax", label: "ADX5 máximo", step: 1, min: 0 },
      { key: "wickMin", label: "Pavio mínimo", step: 0.05, min: 0 },
      { key: "volMult", label: "Volume ×VMA20", step: 0.05, min: 0 }
    ],
    scenarios: [
      { key: 'minimo', label: 'Cenário mínimo', values: { lookback: 30, adxMax: 27, wickMin: 0.45, volMult: 1.0 } },
      { key: 'ouro', label: 'Cenário ouro', values: { lookback: 30, adxMax: 25, wickMin: 0.5, volMult: 1.3 } }
    ]
  },
  atrSqueezeBreak: {
    title: "ATR Squeeze Break",
    description: "Controla os limiares de compressão de ATR e BandWidth antes do rompimento.",
    fields: [
      { key: "atrPercentile", label: "Percentil ATR", step: 1, min: 0, max: 100 },
      { key: "bbwPercentile", label: "Percentil BBWidth", step: 1, min: 0, max: 100 },
      { key: "boxLenMin", label: "Box min (velas)", step: 1, min: 2 },
      { key: "boxLenMax", label: "Box máx (velas)", step: 1, min: 2 },
      { key: "breakAtrMult", label: "Offset rompimento (×ATR)", step: 0.01, min: 0 },
      { key: "volMult", label: "Volume ×VMA20", step: 0.05, min: 0 },
      { key: "pullbackMaxAtr", label: "Pullback máx (×ATR)", step: 0.05, min: 0 }
    ],
    scenarios: [
      { key: 'minimo', label: 'Cenário mínimo', values: { atrPercentile: 35, bbwPercentile: 35, boxLenMin: 8, boxLenMax: 15, breakAtrMult: 0.2, volMult: 1.1, pullbackMaxAtr: 0.5 } },
      { key: 'ouro', label: 'Cenário ouro', values: { atrPercentile: 30, bbwPercentile: 30, boxLenMin: 8, boxLenMax: 14, breakAtrMult: 0.22, volMult: 1.3, pullbackMaxAtr: 0.45 } }
    ]
  },
  alpinista: {
    title: "Aquila Alpinista",
    description: "Configura a leitura de escaladas agressivas para compras priorizadas.",
    fields: [
      { key: "lookback", label: "Velas analisadas", step: 1, min: 3 },
      { key: "minStrong", label: "Velas fortes mín", step: 1, min: 1 },
      { key: "bodyStrength", label: "Corpo mínimo", step: 0.01 },
      { key: "emaFast", label: "EMA rápida", step: 1, min: 1 },
      { key: "emaSlow", label: "EMA lenta", step: 1, min: 1 },
      { key: "slopeMin", label: "Slope min", step: 0.0001 },
      { key: "distMax", label: "Dist. EMA (×ATR)", step: 0.01 },
      { key: "atrMin", label: "ATRₙ min", step: 0.0001 },
      { key: "atrMax", label: "ATRₙ máx", step: 0.0001 },
      { key: "volMult", label: "Volume ×VMA20", step: 0.05 }
    ]
  },
  bagjump: {
    title: "Boreal Bagjump",
    description: "Parâmetros da captura de quedas bruscas para vendas priorizadas.",
    fields: [
      { key: "lookback", label: "Velas analisadas", step: 1, min: 3 },
      { key: "minStrong", label: "Velas fortes mín", step: 1, min: 1 },
      { key: "bodyStrength", label: "Corpo mínimo", step: 0.01 },
      { key: "emaFast", label: "EMA rápida", step: 1, min: 1 },
      { key: "emaSlow", label: "EMA lenta", step: 1, min: 1 },
      { key: "slopeMin", label: "Slope min", step: 0.0001 },
      { key: "distMax", label: "Dist. EMA (×ATR)", step: 0.01 },
      { key: "atrMin", label: "ATRₙ min", step: 0.0001 },
      { key: "atrMax", label: "ATRₙ máx", step: 0.0001 },
      { key: "volMult", label: "Volume ×VMA20", step: 0.05 }
    ]
  },
  buySniper1m: {
    title: "BUY Sniper 1m",
    description: "Ajuste o quão exigente é o pullback relâmpago na tendência curta.",
    fields: [
      { key: "slopeMin", label: "Slope EMA9 min", step: 0.00001 },
      { key: "slopeSlowMin", label: "Slope EMA21 min", step: 0.00001 },
      { key: "emaGapMin", label: "Gap EMA9-21 (pct)", step: 0.00005, min: 0 },
      { key: "atrMinMult", label: "ATRₙ mínimo (pct)", step: 0.0001, min: 0 },
      { key: "rsiTrigger", label: "RSI gatilho", step: 1 },
      { key: "rsiPreTrigger", label: "RSI pré-gatilho", step: 1 },
      { key: "rsiMax", label: "RSI máximo", step: 1 },
      { key: "bodyStrength", label: "Força mínima do candle", step: 0.01, min: 0 },
      { key: "volumeMinMult", label: "Volume mínimo ×VMA", step: 0.05, min: 0 },
      { key: "volumeSpikeMax", label: "Volume máximo ×VMA", step: 0.1, min: 0 },
      { key: "touchTolerancePct", label: "Tolerância ao toque (%)", step: 0.00005, min: 0 },
      { key: "breakTolerancePct", label: "Tolerância ao rompimento (%)", step: 0.00005, min: 0 }
    ]
  },
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
  sellSniper1m: {
    title: "SELL Sniper 1m",
    description: "Controle o rigor das reversões relâmpago contra a tendência curta.",
    fields: [
      { key: "slopeMin", label: "Slope EMA9 máx", step: 0.00001 },
      { key: "slopeSlowMin", label: "Slope EMA21 máx", step: 0.00001 },
      { key: "emaGapMin", label: "Gap EMA9-21 (pct)", step: 0.00005, min: 0 },
      { key: "atrMinMult", label: "ATRₙ mínimo (pct)", step: 0.0001, min: 0 },
      { key: "rsiTrigger", label: "RSI gatilho", step: 1 },
      { key: "rsiPreTrigger", label: "RSI pré-gatilho", step: 1 },
      { key: "rsiMin", label: "RSI mínimo", step: 1, min: 0 },
      { key: "bodyStrength", label: "Força mínima do candle", step: 0.01, min: 0 },
      { key: "volumeMinMult", label: "Volume mínimo ×VMA", step: 0.05, min: 0 },
      { key: "volumeSpikeMax", label: "Volume máximo ×VMA", step: 0.1, min: 0 },
      { key: "touchTolerancePct", label: "Tolerância ao toque (%)", step: 0.00005, min: 0 },
      { key: "breakTolerancePct", label: "Tolerância ao rompimento (%)", step: 0.00005, min: 0 }
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
    description: "Defina o tamanho mínimo do gap e a tolerância da rejeição.",
    fields: [
      { key: "gapFloorPct", label: "Gap mínimo fixo (%)", step: 0.0005, min: 0 },
      { key: "gapAtrMult", label: "Gap mínimo ×ATR", step: 0.05, min: 0 },
      { key: "wickMaxRatio", label: "Pavio máx. (proporção)", step: 0.05, min: 0 },
      { key: "rejectionBufferPct", label: "Margem de rejeição (%)", step: 0.0005, min: 0 }
    ]
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

const STRATEGY_RIGIDITY_SCHEMA = {
  aOrbAvwapRegime: {
    fields: {
      orMinutes: { loose: 10, strict: 20 },
      adxTrend: { loose: 18, strict: 30 },
      emaGapMin: { loose: 0.0003, strict: 0.0009 },
      breakVolMult: { loose: 0.9, strict: 1.4 },
      fadeVolMult: { loose: 0.8, strict: 1.3 },
      distVwapMin: { loose: 0.15, strict: 0.4 },
      distVwapMax: { loose: 1.6, strict: 0.9 },
      pullbackMaxAtr: { loose: 0.9, strict: 0.45 },
      vwapSlopeMin: { loose: -0.0002, strict: 0.0005 }
    }
  },
  alpinista: {
    fields: {
      lookback: { loose: 4, strict: 8 },
      minStrong: { loose: 3, strict: 5 },
      bodyStrength: { loose: 0.4, strict: 0.7 },
      emaFast: { loose: 15, strict: 25 },
      emaSlow: { loose: 40, strict: 65 },
      slopeMin: { loose: 0.0008, strict: 0.0016 },
      distMax: { loose: 1.6, strict: 0.9 },
      atrMin: { loose: 0.0035, strict: 0.006 },
      atrMax: { loose: 0.035, strict: 0.022 },
      volMult: { loose: 0.9, strict: 1.5 }
    }
  },
  atrSqueezeBreak: {
    fields: {
      atrPercentile: { loose: 45, strict: 25 },
      bbwPercentile: { loose: 45, strict: 25 },
      boxLenMin: { loose: 5, strict: 10 },
      boxLenMax: { loose: 18, strict: 12 },
      breakAtrMult: { loose: 0.1, strict: 0.3 },
      volMult: { loose: 0.85, strict: 1.5 },
      pullbackMaxAtr: { loose: 0.8, strict: 0.35 }
    }
  },
  bagjump: {
    fields: {
      lookback: { loose: 4, strict: 8 },
      minStrong: { loose: 3, strict: 5 },
      bodyStrength: { loose: 0.4, strict: 0.7 },
      emaFast: { loose: 15, strict: 25 },
      emaSlow: { loose: 40, strict: 65 },
      slopeMin: { loose: 0.0008, strict: 0.0016 },
      distMax: { loose: 1.6, strict: 0.9 },
      atrMin: { loose: 0.0035, strict: 0.006 },
      atrMax: { loose: 0.035, strict: 0.022 },
      volMult: { loose: 0.9, strict: 1.5 }
    }
  },
  breakoutRetestPro: {
    fields: {
      lookback: { loose: 25, strict: 45 },
      breakAtrMult: { loose: 0.12, strict: 0.28 },
      breakAtrMin: { loose: 0.08, strict: 0.22 },
      volBreakMult: { loose: 0.9, strict: 1.4 }
    }
  },
  buySniper1m: {
    fields: {
      slopeMin: { loose: 0.00012, strict: 0.00028 },
      slopeSlowMin: { loose: 0.00009, strict: 0.00021 },
      emaGapMin: { loose: 0.0003, strict: 0.0007 },
      atrMinMult: { loose: 0.0012, strict: 0.0024 },
      rsiTrigger: { loose: 48, strict: 52 },
      rsiPreTrigger: { loose: 46, strict: 50 },
      rsiMax: { loose: 82, strict: 68 },
      bodyStrength: { loose: 0.45, strict: 0.65 },
      volumeMinMult: { loose: 0.6, strict: 1.0 },
      volumeSpikeMax: { loose: 4.5, strict: 2.5 },
      touchTolerancePct: { loose: 0.0010, strict: 0.0004 },
      breakTolerancePct: { loose: 0.00018, strict: 0.00002 }
    }
  },
  doubleTopBottom: {
    fields: {
      emaFast: { loose: 15, strict: 28 },
      emaSlow: { loose: 40, strict: 65 },
      atrMin: { loose: 0.003, strict: 0.006 },
      atrMax: { loose: 0.02, strict: 0.011 },
      slopeNeutralMax: { loose: 0.0012, strict: 0.0004 }
    }
  },
  emaCross: {
    fields: {
      emaFast: { loose: 15, strict: 28 },
      emaSlow: { loose: 40, strict: 65 },
      slopeMin: { loose: 0.0006, strict: 0.0015 }
    }
  },
  emaFlowScalper21: {
    fields: {
      adxMin: { loose: 15, strict: 28 },
      atrNMin: { loose: 0.00018, strict: 0.0004 },
      volMult: { loose: 0.8, strict: 1.35 },
      emaGapMin: { loose: 0.00025, strict: 0.0008 },
      slopeMin: { loose: 0.0003, strict: 0.0008 }
    }
  },
  gapRejection: {
    fields: {
      gapFloorPct: { loose: 0.005, strict: 0.011 },
      gapAtrMult: { loose: 0.5, strict: 1.1 },
      wickMaxRatio: { loose: 0.95, strict: 0.6 },
      rejectionBufferPct: { loose: 0.001, strict: 0 }
    }
  },
  liquiditySweepReversal: {
    fields: {
      lookback: { loose: 20, strict: 40 },
      adxMax: { loose: 35, strict: 20 },
      wickMin: { loose: 0.35, strict: 0.55 },
      volMult: { loose: 0.8, strict: 1.4 }
    }
  },
  microChannels: {
    fields: {
      slopePeriod: { loose: 15, strict: 28 },
      emaPeriod: { loose: 15, strict: 28 },
      slopeAbsMin: { loose: 0.0006, strict: 0.0015 },
      distMax: { loose: 1.4, strict: 0.75 }
    }
  },
  rangeBreakout: {
    fields: {
      slopePeriod: { loose: 15, strict: 28 },
      slopeAbsMin: { loose: 0.0003, strict: 0.0008 },
      atrMin: { loose: 0.003, strict: 0.006 },
      atrMax: { loose: 0.02, strict: 0.011 }
    }
  },
  retestBreakdownSell: {
    fields: {
      emaFast: { loose: 15, strict: 28 },
      emaSlow: { loose: 40, strict: 65 },
      slopeMin: { loose: 0.0007, strict: 0.0015 },
      atrMin: { loose: 0.003, strict: 0.006 },
      atrMax: { loose: 0.026, strict: 0.015 },
      distMax: { loose: 1.4, strict: 0.75 }
    }
  },
  retestBreakoutBuy: {
    fields: {
      emaFast: { loose: 15, strict: 28 },
      emaSlow: { loose: 40, strict: 65 },
      slopeMin: { loose: 0.0007, strict: 0.0015 },
      atrMin: { loose: 0.003, strict: 0.006 },
      atrMax: { loose: 0.026, strict: 0.015 },
      distMax: { loose: 1.4, strict: 0.75 }
    }
  },
  reversalBar: {
    fields: {
      emaPeriod: { loose: 15, strict: 28 },
      distMax: { loose: 1.4, strict: 0.75 },
      atrMin: { loose: 0.0025, strict: 0.0055 }
    }
  },
  sellSniper1m: {
    fields: {
      slopeMin: { loose: -0.0001, strict: -0.0003 },
      slopeSlowMin: { loose: -0.00008, strict: -0.00022 },
      emaGapMin: { loose: 0.0003, strict: 0.0007 },
      atrMinMult: { loose: 0.0012, strict: 0.0024 },
      rsiTrigger: { loose: 52, strict: 48 },
      rsiPreTrigger: { loose: 51, strict: 53 },
      rsiMin: { loose: 20, strict: 30 },
      bodyStrength: { loose: 0.45, strict: 0.65 },
      volumeMinMult: { loose: 0.6, strict: 1.0 },
      volumeSpikeMax: { loose: 4.5, strict: 2.5 },
      touchTolerancePct: { loose: 0.0010, strict: 0.0004 },
      breakTolerancePct: { loose: 0.00018, strict: 0.00002 }
    }
  },
  secondEntry: {
    fields: {
      slopePeriod: { loose: 15, strict: 28 },
      emaPeriod: { loose: 15, strict: 28 },
      slopeAbsMin: { loose: 0.0006, strict: 0.0015 },
      distMax: { loose: 1.4, strict: 0.75 }
    }
  },
  symTriangle: {
    fields: {
      slopePeriod: { loose: 15, strict: 28 },
      atrMin: { loose: 0.003, strict: 0.006 },
      atrMax: { loose: 0.016, strict: 0.009 },
      slopeAbsMax: { loose: 0.003, strict: 0.0012 }
    }
  },
  tripleLevel: {
    fields: {
      emaPeriod: { loose: 15, strict: 28 },
      distMax: { loose: 1.4, strict: 0.75 },
      atrMin: { loose: 0.003, strict: 0.006 },
      atrMax: { loose: 0.021, strict: 0.011 }
    }
  },
  trendlineRejection: {
    fields: {
      emaPeriod: { loose: 15, strict: 28 },
      distMax: { loose: 1.4, strict: 0.75 },
      atrMin: { loose: 0.0025, strict: 0.0055 }
    }
  },
  vwapPrecisionBounce: {
    fields: {
      distMinAtr: { loose: 0.15, strict: 0.35 },
      distMaxAtr: { loose: 1.6, strict: 0.9 },
      adxMax: { loose: 35, strict: 20 },
      wickMin: { loose: 0.3, strict: 0.5 },
      volMult: { loose: 0.8, strict: 1.4 }
    }
  }
};

function resolveCfgContext(cfg){
  if (cfg && typeof cfg === "object") return cfg;
  if (CURRENT_CFG && typeof CURRENT_CFG === "object") return CURRENT_CFG;
  return {};
}

function isValidTuningId(id, cfg){
  if (!id) return false;
  const normalized = String(id).trim();
  if (!normalized) return false;
  const lower = normalized.toLowerCase();
  if (lower === "undefined" || lower === "emacrossfallback") return false;
  const context = resolveCfgContext(cfg);
  const name = context?.strategies?.[id]?.name;
  if (typeof name === "string" && name.trim().toLowerCase() === "undefined") return false;
  return true;
}

function getTuningTitle(id, cfg){
  const context = resolveCfgContext(cfg);
  return (STRATEGY_TUNING_SCHEMA[id]?.title) || (context?.strategies?.[id]?.name) || humanizeId(id);
}

function getTuningIds(cfg){
  const context = resolveCfgContext(cfg);
  const ids = new Set([
    ...Object.keys(STRATEGY_TUNING_DEFAULTS || {}),
    ...Object.keys(STRATEGY_TUNING_SCHEMA || {}),
    ...Object.keys(context?.strategies || {})
  ]);
  return [...ids]
    .filter(id => isValidTuningId(id, context))
    .sort((a, b)=> getTuningTitle(a, context).localeCompare(getTuningTitle(b, context)));
}

const RIGIDITY_LEVELS = [
  { threshold: 0, label: 'Metralhadora', description: 'Entradas abertas' },
  { threshold: 10, label: 'Ultra agressivo', description: 'Entradas livres' },
  { threshold: 25, label: 'Bem agressivo', description: 'Livre' },
  { threshold: 40, label: 'Agressivo', description: 'Livre com supervisão' },
  { threshold: 50, label: 'Moderador/Padrão' },
  { threshold: 60, label: 'Conservador' },
  { threshold: 80, label: 'Colete' },
  { threshold: 90, label: 'Escudo' },
  { threshold: 100, label: 'Blindado' }
];

function clampRigidityValue(val){
  const num = Number(val);
  if (Number.isNaN(num)) return DEFAULT_STRATEGY_RIGIDITY.global;
  return Math.min(RIGIDITY_MAX, Math.max(RIGIDITY_MIN, Math.round(num)));
}

function getRigidityStrategyIds(cfg){
  const context = resolveCfgContext(cfg);
  const ids = new Set(Object.keys(STRATEGY_RIGIDITY_SCHEMA || {}));
  getTuningIds(context).forEach(id=>{
    if (id) ids.add(id);
  });
  return [...ids].sort((a, b)=>String(a).localeCompare(String(b)));
}

function getRigidityLevelInfo(value){
  const val = clampRigidityValue(value);
  let current = RIGIDITY_LEVELS[0];
  for (const level of RIGIDITY_LEVELS){
    if (val >= level.threshold){
      current = level;
    } else {
      break;
    }
  }
  return current;
}

function normalizeRigidity(raw, cfg){
  const base = (raw && typeof raw === "object") ? raw : {};
  const baseVersion = Number(base.version) || 0;
  const normalized = {
    version: STRATEGY_RIGIDITY_VERSION,
    global: DEFAULT_STRATEGY_RIGIDITY.global,
    overrides: {}
  };
  const shouldReset = baseVersion < STRATEGY_RIGIDITY_VERSION;
  if (!shouldReset){
    normalized.global = clampRigidityValue(base.global != null ? base.global : DEFAULT_STRATEGY_RIGIDITY.global);
    const srcOverrides = (base.overrides && typeof base.overrides === "object") ? base.overrides : {};
    getRigidityStrategyIds(cfg).forEach(id=>{
      if (Object.prototype.hasOwnProperty.call(srcOverrides, id)){
        normalized.overrides[id] = clampRigidityValue(srcOverrides[id]);
      }
    });
  }
  return normalized;
}

function getEffectiveRigidity(id, rigidity){
  if (!id) return clampRigidityValue(rigidity?.global ?? DEFAULT_STRATEGY_RIGIDITY.global);
  if (rigidity?.overrides && Object.prototype.hasOwnProperty.call(rigidity.overrides, id)){
    return clampRigidityValue(rigidity.overrides[id]);
  }
  return clampRigidityValue(rigidity?.global ?? DEFAULT_STRATEGY_RIGIDITY.global);
}

function isRigidityOverride(id, rigidity){
  return !!(rigidity?.overrides && Object.prototype.hasOwnProperty.call(rigidity.overrides, id));
}

function pruneRigidityOverrides(rigidity, cfg){
  if (!rigidity || typeof rigidity !== "object") return;
  const valid = new Set(getRigidityStrategyIds(cfg));
  Object.keys(rigidity.overrides || {}).forEach(id=>{
    if (!valid.has(id)) delete rigidity.overrides[id];
  });
}

const SAVED_CFG = LS.get("opx.cfg", {});
const CFG = { ...DEFAULT_CFG, ...(SAVED_CFG || {}) };
CFG.strategies = CFG.strategies || {};
CFG.guardToggles = { ...(DEFAULT_CFG.guardToggles || {}), ...(CFG.guardToggles || {}) };
CFG.emaGate = { ...DEFAULT_CFG.emaGate, ...(CFG.emaGate || {}) };
CFG.strategyTunings = mergeTunings(STRATEGY_TUNING_DEFAULTS, CFG.strategyTunings || {});
CURRENT_CFG = CFG;
CFG.strategyRigidity = normalizeRigidity(CFG.strategyRigidity, CFG);
pruneRigidityOverrides(CFG.strategyRigidity, CFG);
CFG.retracaoMode = resolveRetracaoMode(CFG.retracaoMode);
CFG.audioVolume = clamp01(CFG.audioVolume != null ? CFG.audioVolume : DEFAULT_CFG.audioVolume);
cleanupUndefinedStrategies();
CURRENT_CFG = CFG;

function cleanupUndefinedStrategies(){
  const invalidIds = new Set();
  Object.entries(CFG.strategies || {}).forEach(([id, entry])=>{
    const normalizedId = String(id || "").trim();
    const name = typeof entry?.name === "string" ? entry.name.trim() : "";
    if (!normalizedId || normalizedId.toLowerCase() === "undefined" || name.toLowerCase() === "undefined"){
      invalidIds.add(id);
    }
  });
  invalidIds.forEach(id=>{ delete CFG.strategies[id]; });
  Object.keys(CFG.strategyTunings || {}).forEach(id=>{
    if (!id || invalidIds.has(id) || String(id).trim().toLowerCase() === "undefined"){
      delete CFG.strategyTunings[id];
    }
  });
  if (CFG.strategyRigidity?.overrides){
    Object.keys(CFG.strategyRigidity.overrides).forEach(id=>{
      if (!id || invalidIds.has(id) || String(id).trim().toLowerCase() === "undefined"){
        delete CFG.strategyRigidity.overrides[id];
      }
    });
  }
}

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
    block: { gap:0, edge:0, volume:0, wick:0, atrSpike:0, regimeMixOpp:0, payout:0, cooldown:0, seed:0, timer:0, protection:0 }
  },
  metr_last_summary: Date.now(),
  lastLateLogSec: null, clickedThisMinute: null,
  currentPresetName: LS.get("opx.preset", "padrão"),

  strategiesLoaded: {},
  activeStrats: [],
  relaxMode: false,
  analysisLog: [],
  onAnalysis: null,
  executedOrders: [],
  sessionScore: { total: 0, wins: 0, losses: 0, ties: 0 },
  lastAudioVolume: (CFG.audioVolume && CFG.audioVolume > 0) ? CFG.audioVolume : DEFAULT_CFG.audioVolume
};

/* ================== Utils ================== */
const qs  = (s, r=document)=>r.querySelector(s);
const qsa = (s, r=document)=>[...r.querySelectorAll(s)];
const sleep = ms=>new Promise(r=>setTimeout(r,ms));
const nowStr = ()=> new Date().toLocaleTimeString();
const toPct = x => (x*100).toFixed(2)+"%";
const PRICE_DECIMALS = 4;
const asset = p => chrome.runtime.getURL(p);
const getPath = (obj, path) => path.split('.').reduce((a,k)=> (a?a[k]:undefined), obj);
const setPath = (obj, path, val) => { const parts = path.split('.'); const last = parts.pop(); let cur = obj; for (const p of parts){ if(!(p in cur) || typeof cur[p]!=='object') cur[p]={}; cur=cur[p]; } cur[last] = val; };
function clamp01(v){
  return Math.min(1, Math.max(0, Number(v) || 0));
}
function resolveRetracaoMode(raw){
  if (raw === true) return "instant";
  if (raw === false || raw == null) return "off";
  if (typeof raw === "string"){
    const norm = raw.trim().toLowerCase();
    if (["instant", "immediate", "imediata", "imediato"].includes(norm)) return "instant";
    if (["signal", "sinal", "on_signal", "on-signal"].includes(norm)) return "signal";
  }
  return "off";
}
function humanizeId(id){ if(!id) return "Estratégia"; return String(id).replace(/[-_]+/g," ").replace(/\s+/g," ").trim().replace(/\b\w/g, m => m.toUpperCase()); }
function escapeHtml(str){
  return String(str ?? "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));
}
function clampDecimals(val, max=8){
  const n = Number(val);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(max, Math.floor(n)));
}
function truncateValue(num, decimals){
  const dec = clampDecimals(decimals, 8);
  if (dec === 0) return Math.trunc(num);
  const factor = 10 ** dec;
  return Math.trunc(num * factor) / factor;
}
function fixedNoRound(num, decimals){
  const dec = clampDecimals(decimals, 8);
  if (dec === 0) return String(Math.trunc(num));
  const truncated = truncateValue(num, dec);
  return truncated.toFixed(dec);
}
function formatNumber(num, digits=4){
  if (num == null || Number.isNaN(num) || !Number.isFinite(num)) return "—";
  const abs = Math.abs(num);
  const baseDigits = Number.isFinite(Number(digits)) ? Number(digits) : 4;
  let decimals;
  if (abs >= 1000) decimals = 2;
  else if (abs >= 100) decimals = 2;
  else if (abs >= 10) decimals = Math.min(2, baseDigits);
  else if (abs >= 1) decimals = Math.min(4, Math.max(0, baseDigits));
  else if (abs >= 0.1) decimals = Math.min(5, Math.max(0, baseDigits + 1));
  else if (abs >= 0.01) decimals = Math.min(6, Math.max(0, baseDigits + 2));
  else decimals = Math.min(7, Math.max(0, baseDigits + 3));
  const dec = clampDecimals(decimals, 8);
  if (dec >= 4) return fixedNoRound(num, dec);
  return num.toFixed(dec);
}

const flipSide = side => side === "BUY" ? "SELL" : side === "SELL" ? "BUY" : side;

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
Object.values(sounds).forEach(a=>{a.preload='auto';});
function applyAudioVolume(vol){
  const clamped = clamp01(vol);
  Object.values(sounds).forEach(a=>{ a.volume = clamped; });
  CFG.audioVolume = clamped;
  if (clamped > 0) S.lastAudioVolume = clamped;
  return clamped;
}
applyAudioVolume(CFG.audioVolume);
const play = key => { const a=sounds[key]; if(!a) return; a.currentTime=0; a.play().catch(()=>{}); };

/* ===== Log / histórico ===== */
function wrapText(str, width=65){
  if (!str) return "";
  const out = []; let i = 0;
  while (i < str.length){ out.push(str.slice(i, i+width)); i += width; }
  return out.join("\n");
}

function formatSideLabel({ side, originalSide, reverse }){
  if (reverse && originalSide && side && originalSide !== side){
    return `${originalSide}→${side}`;
  }
  return side || originalSide || "—";
}

function ensureScoreboard(){
  if (!S.sessionScore) S.sessionScore = { total:0, wins:0, losses:0, ties:0 };
  if (!Array.isArray(S.executedOrders)) S.executedOrders = [];
  ensureProtection();
}

function ensureProtection(){
  if (!S.protection) S.protection = { lossStreak: 0, until: 0, active: false };
}

function tfToMs(tf){
  const m = String(tf || "").match(/^(\d+)([mhdw])$/i);
  if (!m) return 60 * 1000;
  const value = Number(m[1]) || 1;
  const unit = m[2].toLowerCase();
  const mult = unit === "m" ? 60 * 1000
    : unit === "h" ? 60 * 60 * 1000
    : unit === "d" ? 24 * 60 * 60 * 1000
    : unit === "w" ? 7 * 24 * 60 * 60 * 1000
    : 60 * 1000;
  return value * mult;
}

function updateScoreboard(){
  ensureScoreboard();
  const totalEl = qs("#opx-score-total");
  const winEl = qs("#opx-score-wins");
  const lossEl = qs("#opx-score-losses");
  const tieEl = qs("#opx-score-ties");
  if (totalEl) totalEl.textContent = String(S.sessionScore.total || 0);
  if (winEl) winEl.textContent = String(S.sessionScore.wins || 0);
  if (lossEl) lossEl.textContent = String(S.sessionScore.losses || 0);
  if (tieEl) tieEl.textContent = String(S.sessionScore.ties || 0);
}

function resetScoreboard(){
  ensureScoreboard();
  ensureProtection();
  S.sessionScore = { total: 0, wins: 0, losses: 0, ties: 0 };
  S.executedOrders = [];
  if (S.protection) S.protection.lossStreak = 0;
  updateScoreboard();
  log("Placar de ordens zerado.");
}

function registerExecutedOrder(p){
  ensureScoreboard();
  const execTf = CFG.tfExec || "1m";
  const waitInterval = tfToMs(execTf);
  const baseCloseMs = p.closeTsMs ?? Date.now();
  const inferredEntryMs = Number.isFinite(baseCloseMs) && Number.isFinite(waitInterval)
    ? baseCloseMs - waitInterval
    : null;
  const evalAfterMs = baseCloseMs + waitInterval;
  const safeRefPrice = (p && p.refPrice != null) ? Number(p.refPrice) : null;
  const refPrice = (safeRefPrice != null && !Number.isNaN(safeRefPrice)) ? safeRefPrice : null;
  const safeEntryOpen = (p && p.entryCandleOpen != null) ? Number(p.entryCandleOpen) : null;
  const entryCandleOpenVal = (safeEntryOpen != null && !Number.isNaN(safeEntryOpen)) ? safeEntryOpen : null;
  const explicitEntryTs = p && p.entryCandleTimestamp != null ? Number(p.entryCandleTimestamp) : null;
  let entryCandleTimestamp = Number.isFinite(explicitEntryTs)
    ? explicitEntryTs
    : (Number.isFinite(inferredEntryMs) ? inferredEntryMs : null);
  const rawLivePrice = (p && p.symbol) ? S.live?.[p.symbol] : null;
  const livePriceVal = (rawLivePrice != null && !Number.isNaN(Number(rawLivePrice))) ? Number(rawLivePrice) : null;
  let entryPrice = null;
  let entrySource = null;
  if (p){
    const mode = typeof p.retracaoMode === "string" ? p.retracaoMode : (p.retracao ? "instant" : "off");
    if (mode === "instant" || mode === "signal"){
      if (livePriceVal != null){ entryPrice = livePriceVal; entrySource = "livePrice"; }
      else if (refPrice != null){ entryPrice = refPrice; entrySource = "refPrice"; }
      else if (entryCandleOpenVal != null){ entryPrice = entryCandleOpenVal; entrySource = "candleOpen"; }
    } else {
      if (entryCandleOpenVal != null){ entryPrice = entryCandleOpenVal; entrySource = "candleOpen"; }
      else if (livePriceVal != null){ entryPrice = livePriceVal; entrySource = "livePrice"; }
      else if (refPrice != null){ entryPrice = refPrice; entrySource = "refPrice"; }
      if ((entryPrice == null || Number.isNaN(entryPrice)) && p.symbol && execTf){
        const fallbackInfo = pickCandleOpenForSymbol(p.symbol, execTf, entryCandleTimestamp, "register");
        if (fallbackInfo?.price != null){
          entryPrice = fallbackInfo.price;
          entrySource = fallbackInfo.source;
          if (fallbackInfo.candle?.t != null){
            const ts = Number(fallbackInfo.candle.t);
            if (Number.isFinite(ts)){
              entryCandleTimestamp = ts;
            }
          }
        }
      }
    }
  }
  if (entryPrice != null && Number.isNaN(entryPrice)){
    entryPrice = null;
    entrySource = null;
  }
  const order = {
    symbol: p.symbol,
    side: p.side,
    originalSide: p.originalSide || p.side,
    reverse: !!p.reverse,
    strategyId: p.strategyId || null,
    strategyName: p.strategyName || null,
    relax: !!p.relax,
    retracao: !!p.retracao,
    retracaoMode: typeof p.retracaoMode === "string" ? p.retracaoMode : (p.retracao ? "instant" : "off"),
    entryPrice,
    entrySource,
    refPrice,
    entryCandleOpen: entryCandleOpenVal,
    entryCandleTimestamp,
    entryOpenMs: entryCandleTimestamp,
    tfExec: execTf,
    tfMs: waitInterval,
    targetCloseMs: p.closeTsMs ?? null,
    evalAfterMs,
    executedAt: Date.now()
  };
  S.executedOrders.push(order);
  S.sessionScore.total = (S.sessionScore.total || 0) + 1;
  updateScoreboard();
  return order;
}

function applyOrderResult(order, outcome, finalPrice){
  if (!order) return;
  ensureScoreboard();
  ensureProtection();
  if (outcome === "win"){
    S.sessionScore.wins = (S.sessionScore.wins || 0) + 1;
    play("vitoria");
  } else if (outcome === "loss"){
    S.sessionScore.losses = (S.sessionScore.losses || 0) + 1;
    play("perdemos");
  } else {
    S.sessionScore.ties = (S.sessionScore.ties || 0) + 1;
  }

  if (S.protection){
    if (outcome === "loss"){
      S.protection.lossStreak = (S.protection.lossStreak || 0) + 1;
      if (S.protection.lossStreak >= 2){
        const restMinutes = Math.max(0, Number(CFG.protectionRestMin) || 0);
        S.protection.lossStreak = 0;
        if (restMinutes > 0){
          S.protection.active = true;
          S.protection.until = Date.now() + restMinutes * 60 * 1000;
          log(`Proteção ativada: aguardando ${restMinutes} min após 2 perdas consecutivas.`, "warn");
        } else {
          S.protection.active = false;
          S.protection.until = 0;
          log("Proteção sinalizou 2 perdas consecutivas (descanso configurado em 0 min).", "warn");
        }
      }
    } else if (outcome === "win" || outcome === "tie"){
      S.protection.lossStreak = 0;
    }
  }

  const baseLabel = `Resultado: ${outcome === "win" ? "VITÓRIA" : outcome === "loss" ? "DERROTA" : "EMPATE"}`;
  const priceDigits = PRICE_DECIMALS + 1;
  const priceInfo = order.entryPrice != null && finalPrice != null
    ? ` | preço entrada ${formatNumber(order.entryPrice, priceDigits)} → fechamento ${formatNumber(finalPrice, priceDigits)}`
    : "";
  const strat = order.strategyName ? ` | ${order.strategyName}` : "";
  const reverseTag = order.reverse ? " (reversa)" : "";
  log(`${baseLabel}${reverseTag} — ${order.symbol || "—"} ${formatSideLabel(order)}${strat}${priceInfo}`, outcome === "loss" ? "err" : "order");
  updateScoreboard();
}

function pickCandleOpenForSymbol(symbol, tf, targetTs, purpose="eval"){
  if (!symbol || !tf) return null;
  const key = `${symbol}_${tf}`;
  const arr = S.candles[key];
  if (!Array.isArray(arr) || arr.length === 0) return null;

  const normalizedTs = Number.isFinite(targetTs) ? targetTs : null;
  let candidate = null;

  if (normalizedTs != null){
    candidate = arr.find(c => c && Number.isFinite(c.t) && Math.abs(c.t - normalizedTs) <= 2000);
  }

  if (!candidate){
    candidate = arr[arr.length - 1];
  }

  if (!candidate || candidate.o == null) return null;
  const price = Number(candidate.o);
  if (!Number.isFinite(price) || Number.isNaN(price)) return null;

  const priceNorm = truncateValue(price, PRICE_DECIMALS);
  const byTs = normalizedTs != null;
  let source = "candleOpenEval";
  if (purpose === "register"){
    source = byTs ? "candleOpenRegister" : "candleOpenFallback";
  }

  return {
    price: priceNorm,
    source,
    candle: candidate,
  };
}

function evaluateOrdersOnClose(symbol){
  ensureScoreboard();
  if (!S.executedOrders || S.executedOrders.length === 0) return;

  const remaining = [];
  for (const order of S.executedOrders){
    if (order.symbol !== symbol){
      remaining.push(order);
      continue;
    }
    if (order.evaluated){
      continue;
    }

    const tf = order.tfExec || CFG.tfExec;
    const base = `${symbol}_${tf}`;
    const candles = S.candles[base];
    if (!candles || candles.length === 0){
      remaining.push(order);
      continue;
    }
    const last = candles[candles.length - 1];
    if (!last || !last.x){
      remaining.push(order);
      continue;
    }

    const waitUntil = order.evalAfterMs ?? order.targetCloseMs ?? null;
    if (waitUntil && last.T && last.T < waitUntil - 5000){
      remaining.push(order);
      continue;
    }

    const finalPriceRaw = last.c != null ? Number(last.c) : null;
    const entryRaw = order.entryPrice != null ? Number(order.entryPrice) : null;
    let entry = entryRaw != null ? truncateValue(entryRaw, PRICE_DECIMALS) : null;
    const finalPrice = finalPriceRaw != null ? truncateValue(finalPriceRaw, PRICE_DECIMALS) : null;

    if (order.retracaoMode === "off" || order.retracaoMode === "normal" || !order.retracao){
      const snapshot = pickCandleOpenForSymbol(order.symbol, tf, order.entryCandleTimestamp ?? order.entryOpenMs ?? null);
      if (snapshot?.price != null){
        entry = snapshot.price;
        order.entryPrice = snapshot.price;
        order.entrySource = snapshot.source;
        if (snapshot.candle?.t != null){
          const ts = Number(snapshot.candle.t);
          if (Number.isFinite(ts)){
            order.entryCandleTimestamp = ts;
            order.entryOpenMs = ts;
          }
        }
      }
    }

    let outcome = null;
    if (finalPrice != null && entry != null){
      if (order.side === "BUY"){
        if (finalPrice > entry) outcome = "win";
        else if (finalPrice < entry) outcome = "loss";
      } else if (order.side === "SELL"){
        if (finalPrice < entry) outcome = "win";
        else if (finalPrice > entry) outcome = "loss";
      }
      if (outcome == null) outcome = "tie";
    }

    order.evaluated = true;
    const finalForLog = finalPrice != null ? finalPrice : finalPriceRaw;
    applyOrderResult(order, outcome, finalForLog);
  }

  S.executedOrders = remaining.filter(o => !o.evaluated);
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
    if (tf==="1m" && S.pending && S.pending.symbol===symbol){
      if (S.pending.entryCandleOpen == null && !k.x){
        S.pending.entryCandleOpen = c.o;
      }
      if (S.pending.requireNextTick && !k.x){
        S.pending.tickOk = true;
      }
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
  ensureProtection();
  const prot = S.protection;
  if (prot){
    const cfgRest = Number(CFG.protectionRestMin) || 0;
    if (prot.active && cfgRest <= 0){
      prot.active = false;
      prot.until = 0;
    }
    if (prot.active){
      if (Date.now() >= (prot.until || 0)){
        prot.active = false;
        prot.until = 0;
        log("Proteção concluída — operações liberadas novamente.");
      } else {
        S.metr.block.protection = (S.metr.block.protection || 0) + 1;
        const remainingMin = Math.max(0, Math.ceil(((prot.until || 0) - Date.now()) / 60000));
        return { ok:false, why:`proteção perdas (${remainingMin}m)` };
      }
    }
  }
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
        CFG.strategies[s.id] = { enabled: true, name: nm, orders: 0, reverse: false };
      } else {
        CFG.strategies[s.id].name = nm;
        if (CFG.strategies[s.id].reverse == null) CFG.strategies[s.id].reverse = false;
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
      if (sig && sig.side){
        const rawSide = String(sig.side).toUpperCase();
        const reverseActive = !!CFG.strategies[id]?.reverse;
        const execSide = reverseActive ? flipSide(rawSide) : rawSide;
        if (!execSide) continue;
        if (!((execSide === "BUY" && CFG.allowBuy) || (execSide === "SELL" && CFG.allowSell))){
          continue;
        }
        return {
          ...sig,
          side: execSide,
          originalSide: rawSide,
          reverse: reverseActive,
          strategyId:id,
          strategyName: CFG.strategies[id]?.name || st.name || id,
          relax: !!sig.relax
        };
      }
    }catch(e){
      console.debug("[OPX] detect erro", id, e?.message || e);
    }
  }
  return null;
}

/* ================== Fechamento do minuto ================== */
function onMinuteClose(symbol){
  evaluateOrdersOnClose(symbol);
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
  const retracaoMode = resolveRetracaoMode(CFG.retracaoMode);
  const retracao = retracaoMode !== "off";
  S.pending = {
    side: sig.side,
    originalSide: sig.originalSide || sig.side,
    reverse: !!sig.reverse,
    symbol,
    forMinuteUnix,
    refPrice: ref,
    armedAtMs, closeTsMs,
    requireNextTick: !retracao,
    tickOk: retracao,
    strategyId: sig.strategyId,
    strategyName: sig.strategyName,
    relax: !!sig.relax,
    retracao,
    retracaoMode,
    entryCandleOpen: null
  };
  S.clickedThisMinute = null;
  S.lastLateLogSec = null;

  const tagR = sig.relax ? " (relax)" : "";
  const human = `${sig.strategyName || "Estratégia"}${tagR}`;
  const pendLabel = formatSideLabel(S.pending);
  if (S.pending.side === "BUY"){ play("possivel_compra"); }
  else if (S.pending.side === "SELL"){ play("possivel_venda"); }
  const actionLabel = retracaoMode === "signal"
    ? "execução ao sinal (retração)"
    : retracaoMode === "instant"
      ? "execução imediata (retração)"
      : "armando janela";
  log(`Pendente ${pendLabel} ${symbol} | ${human} — ${actionLabel}`, "warn");
  if (retracaoMode === "signal"){
    attemptExecutePending(S.pending, { bypassWindow: true }).catch(()=>{});
  }
}

/* ================== Loop do early-click (JIT/Confirmação) ================== */
async function attemptExecutePending(p, opts={}){
  if (!p || !S.armed) return false;
  if (S.pending !== p) return false;
  const nowMs = opts.nowMs ?? Date.now();
  const closeMs = p.closeTsMs || ((S.wsCloseTs[p.symbol]||nowMs) + 60*1000);
  let t = (closeMs - nowMs) / 1000;
  if (t < 0) t = 0;

  if (opts.fromLoop && t <= CFG.lockAbortSec){
    const sInt = Math.floor(Math.max(0, t));
    if (S.lastLateLogSec !== sInt){
      S.lastLateLogSec = sInt;
      log(`Timer ${sInt}s — muito tarde para armar`, "warn");
    }
  }

  const inClick = (t <= CFG.clickMinSec && t >= CFG.clickMaxSec);
  const safe = (t > CFG.lockAbortSec);
  const tickReady = (!p.requireNextTick) || p.tickOk;
  const mode = typeof p.retracaoMode === "string" ? p.retracaoMode : (p.retracao ? "instant" : "off");
  const autoMode = mode === "instant" || mode === "signal";
  const shouldExecute = tickReady
    && S.clickedThisMinute !== p.forMinuteUnix
    && ((opts.bypassWindow) || autoMode || (inClick && safe));

  if (!shouldExecute) return false;

  const { edgeMin, payoutMin } = dynamicThresholds(p.symbol);
  const payout = readPayout(), edge = readThermoEdge();

  if (payoutMin>0 && (payout==null || payout < payoutMin)){
    log("Payout abaixo do mínimo — sinal mantido, sem execução.","err");
    if (S.pending === p){ S.pending=null; S.metr.canceled++; }
    return "canceled";
  }

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

  if (!volOk){
    log("Cancelado: volume abaixo do mínimo × VMA","err");
    if (S.pending === p){ S.pending=null; S.metr.canceled++; }
    return "canceled";
  }
  if (!wickOk){
    log("Cancelado: pavio excedeu limite na vela atual","err");
    if (S.pending === p){ S.pending=null; S.metr.canceled++; }
    return "canceled";
  }
  if (edgeMin>0 && (edge==null || edge < edgeMin)){
    log("Condições mudaram — edge baixo no JIT, cancelado.","err");
    if (S.pending === p){ S.pending=null; S.metr.canceled++; }
    return "canceled";
  }

  await sleep(CFG.clickDelayMs);
  if (!S.pending || S.pending !== p || !S.armed) return false;

  (p.side==="BUY") ? (CFG.allowBuy && clickBuy()) : (CFG.allowSell && clickSell());
  S.lastOrderSym = p.symbol;
  S.clickedThisMinute = p.forMinuteUnix;
  S.pending = null; S.metr.executed++;
  registerExecutedOrder(p);

  if (p.strategyId && CFG.strategies[p.strategyId]) {
    CFG.strategies[p.strategyId].orders = (CFG.strategies[p.strategyId].orders||0)+1;
    LS.set("opx.cfg", CFG);
  }

  const tagRelax = p.relax ? " (relax)" : "";
  const human = p.strategyName ? ` | ${p.strategyName}${tagRelax}` : (p.relax ? " | (relax)" : "");
  const modeNote = mode === "signal" ? " [Retração-sinal]" : (p.retracao ? " [Retração]" : "");
  const tfLabel = CFG.tfExec ? ` (${CFG.tfExec})` : "";
  const orderLabel = p.reverse && p.originalSide && p.originalSide !== p.side
    ? `ORDEM: ${p.originalSide} -> ${p.side} (REVERSA)`
    : `ORDEM: ${p.side}`;
  log(`${orderLabel}${tfLabel}${human}${modeNote} — enviado em ~T-${Math.round(t)}s`,`order`);
  if (p.side==="BUY") play("compra_confirmada"); else play("venda_confirmada");
  return "executed";
}

async function earlyClickLoop(){
  while(true){
    try{
      const p = S.pending;
      if (p && S.armed){
        await attemptExecutePending(p, { fromLoop: true });
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
      <button id="opx-volume-btn" class="opx-btn icon" title="Áudio">🔊</button>
      <button id="opx-menu" class="opx-btn icon" title="Configurações">⚙</button>
      <button id="opx-tuning-btn" class="opx-btn icon" title="Ajustes de estratégias">🛠</button>
    </div>

    <div id="opx-body" class="opx-body">
      <div id="opx-scoreboard" class="opx-scoreboard">
        <div class="score-boxes">
          <div class="score-box">
            <span class="score-label">Total</span>
            <strong id="opx-score-total" class="score-value">0</strong>
          </div>
          <div class="score-box win">
            <span class="score-label">Vitórias</span>
            <strong id="opx-score-wins" class="score-value">0</strong>
          </div>
          <div class="score-box loss">
            <span class="score-label">Perdas</span>
            <strong id="opx-score-losses" class="score-value">0</strong>
          </div>
          <div class="score-box tie">
            <span class="score-label">Devolvidas</span>
            <strong id="opx-score-ties" class="score-value">0</strong>
          </div>
        </div>
        <button id="opx-score-reset" class="opx-btn sm ghost">Zerar placar</button>
      </div>
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
      <button id="opx-debrief-btn" class="opx-btn">Debriefing</button>
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
          <div class="cfg-grid cols-4">
            <label class="cfg-item cfg-checkbox"><span>Habilitar COMPRAR</span><input type="checkbox" id="cfg-allowBuy"></label>
            <label class="cfg-item cfg-checkbox"><span>Habilitar VENDER</span><input type="checkbox" id="cfg-allowSell"></label>
            <label class="cfg-item cfg-checkbox"><span>Relax automático</span><input type="checkbox" data-cfg="relaxAuto"></label>
            <label class="cfg-item"><span>Modalidade retração</span><select data-cfg="retracaoMode" class="cfg-select"><option value="off">Desligado</option><option value="instant">Execução imediata</option><option value="signal">Execução ao sinal</option></select></label>
          </div>
          <div class="cfg-grid cols-4">
            ${cfgInput("Relax após (min)","relaxAfterMin",12,0)}
            ${cfgInput("Slope relax (min)","slopeLoose",0.0007,4)}
            ${cfgInput("+dist EMA ref (×ATR)","distE20RelaxAdd",0.10,2)}
            ${cfgInput("Resumo (min)","metr_summary_min",10,0)}
            ${cfgInput("Perdas consecutivas (proteção)","protectionLossStreak",3,0)}
            ${cfgInput("Espera proteção (min)","protectionRestMin",5,0)}
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

  <!-- Modal Debriefing -->
  <div id="opx-debrief" class="opx-modal">
    <div class="box">
      <div class="top">
        <h3 class="opx-title">Debriefing de Indicadores</h3>
        <div class="gap"></div>
        <button class="close" id="opx-debrief-refresh">Atualizar</button>
        <button class="close" id="opx-debrief-close">Fechar</button>
      </div>
      <div id="opx-debrief-body" class="analysis-list"></div>
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
  const resetBtn = qs("#opx-score-reset");
  if (resetBtn) resetBtn.onclick = ()=>resetScoreboard();
  updateScoreboard();

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
    sync(){ if(this.body){ this.body.innerHTML = renderAnalysisList(S.analysisLog); wireGuardToggleHandlers(this.body); this.body.scrollTop = 0; } },
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
  const Debrief = {
    wrap: qs("#opx-debrief"),
    body: qs("#opx-debrief-body"),
    open(){ if (this.wrap){ this.wrap.style.display="flex"; this.sync(); } },
    close(){ if (this.wrap){ this.wrap.style.display="none"; } },
    sync(){ if (this.body){ this.body.innerHTML = renderDebriefList(S.analysisLog); wireGuardToggleHandlers(this.body); this.body.scrollTop = 0; } },
    isOpen(){ return !!(this.wrap && this.wrap.style.display === "flex"); }
  };
  qs("#opx-debrief-btn").onclick = ()=>Debrief.open();
  qs("#opx-debrief-close").onclick = ()=>Debrief.close();
  qs("#opx-debrief-refresh").onclick = ()=>Debrief.sync();

  function refreshConditionViews(){
    if (Analysis.isOpen()) Analysis.sync();
    if (Debrief.isOpen()) Debrief.sync();
  }

  window.__opxRefreshConditions = refreshConditionViews;

  S.onAnalysis = ()=>{
    if (Analysis.isOpen()) Analysis.sync();
    if (Debrief.isOpen()) Debrief.sync();
  };

  // config modal
  const Cfg = {
    wrap: qs("#opx-cfg-wrap"),
    open(){ hydrateCfgForm(); renderStrats(); this.wrap.style.display="flex"; },
    close(){ this.wrap.style.display="none"; }
  };
  const volumeBtn = qs("#opx-volume-btn");
  const audioIconFor = muted => muted ? "🔇" : "🔊";
  S.updateVolumeUi = ()=>{
    if (!volumeBtn) return;
    const muted = (CFG.audioVolume ?? 0) <= 0;
    volumeBtn.textContent = audioIconFor(muted);
    volumeBtn.title = muted ? "Áudio desativado" : "Áudio ativado";
  };
  S.updateVolumeUi();
  qs("#opx-menu").onclick = ()=> Cfg.open();
  qs("#opx-cfg-close").onclick = ()=> Cfg.close();
  if (volumeBtn){
    volumeBtn.onclick = ()=>{
      const muted = (CFG.audioVolume ?? 0) <= 0;
      if (muted){
        const restore = (S.lastAudioVolume && S.lastAudioVolume > 0) ? S.lastAudioVolume : DEFAULT_CFG.audioVolume;
        const applied = applyAudioVolume(restore);
        CFG.audioVolume = applied;
      } else {
        S.lastAudioVolume = CFG.audioVolume && CFG.audioVolume > 0 ? CFG.audioVolume : DEFAULT_CFG.audioVolume;
        const applied = applyAudioVolume(0);
        CFG.audioVolume = applied;
      }
      LS.set("opx.cfg", CFG);
      S.updateVolumeUi();
    };
  }

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
    CFG.retracaoMode = resolveRetracaoMode(CFG.retracaoMode);
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
    CFG.strategyRigidity = normalizeRigidity(DEFAULT_STRATEGY_RIGIDITY);
    CFG.guardToggles = {};
    CFG.retracaoMode = resolveRetracaoMode(CFG.retracaoMode);
    applyAudioVolume(CFG.audioVolume);
    if (typeof S.updateVolumeUi === "function") S.updateVolumeUi();
    LS.set("opx.cfg", CFG);
    LS.set("opx.preset", "padrão");
    setPresetPill("padrão");
    hydrateCfgForm(); renderStrats();
    if (Tuning.isOpen()){
      Tuning.editing = cloneTunings(STRATEGY_TUNING_DEFAULTS);
      Tuning.rigidity = normalizeRigidity(DEFAULT_STRATEGY_RIGIDITY);
      applyRigidityToAll(Tuning.editing, Tuning.rigidity);
      Tuning.render();
    }
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
      strategyTunings: CFG.strategyTunings,
      strategyRigidity: CFG.strategyRigidity,
      protectionLossStreak: CFG.protectionLossStreak,
      protectionRestMin: CFG.protectionRestMin,
      audioVolume: CFG.audioVolume
    };
    Object.assign(CFG, p, keep);
    CFG.retracaoMode = resolveRetracaoMode(CFG.retracaoMode);
    applyAudioVolume(CFG.audioVolume);
    if (typeof S.updateVolumeUi === "function") S.updateVolumeUi();
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
      } else if (inp.tagName === "SELECT"){
        inp.value = val != null ? String(val) : "";
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
      if (inp.tagName === "SELECT"){ out[k] = k === "retracaoMode" ? resolveRetracaoMode(inp.value) : inp.value; return; }
      const n = readNum(inp); if (n==null) return;
      if (/(emaGapFloorPct|minThermoEdge|slopeLoose|emaGate\.slopeMin|subtick_cancel_pct)$/i.test(k)) out[k] = Number(n.toFixed(4));
      else if (/(coefAtrInGap|payout_min|payout_soft|vol_min_mult|vol_max_mult|wick_ratio_max|distE20RelaxAdd|emaGate\.minDistATR)$/i.test(k)) out[k] = Number(n.toFixed(2));
      else if (/atr_mult_max/i.test(k)) out[k] = Number(n.toFixed(1));
      else if (/emaGate\.divisor$/i.test(k) || /emaGate\.directional$/i.test(k)) out[k] = Math.max(1, Math.round(n));
      else if (/(armMinSec|armMaxSec|clickMinSec|clickMaxSec|relaxAfterMin|metr_summary_min|protectionLossStreak|protectionRestMin)$/i.test(k)) out[k] = Math.max(0, Math.round(n));
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

  function collectStrategyFlagIds(){
    const ids = new Set([
      ...Object.keys(CFG.strategies || {}),
      ...Object.keys(STRATEGY_TUNING_DEFAULTS || {}),
      ...Object.keys(STRATEGY_TUNING_SCHEMA || {})
    ]);
    return [...ids];
  }

  function cloneStrategyFlags(){
    const out = {};
    collectStrategyFlagIds().forEach(id=>{
      const entry = CFG.strategies?.[id] || {};
      out[id] = { reverse: !!entry.reverse };
    });
    return out;
  }

  function defaultStrategyFlags(){
    const out = {};
    collectStrategyFlagIds().forEach(id=>{
      out[id] = { reverse: false };
    });
    return out;
  }

  function hydrateTuningFlags(flags){
    qsa('#opx-tuning-body [data-flag-strategy]').forEach(chk=>{
      const id = chk.getAttribute('data-flag-strategy');
      const key = chk.getAttribute('data-flag-key');
      chk.checked = !!(flags?.[id]?.[key]);
    });
  }

  function readTuningFlags(){
    const collected = {};
    qsa('#opx-tuning-body [data-flag-strategy]').forEach(chk=>{
      const id = chk.getAttribute('data-flag-strategy');
      const key = chk.getAttribute('data-flag-key');
      if (!id || !key) return;
      if (!collected[id]) collected[id] = {};
      collected[id][key] = chk.checked;
    });
    return collected;
  }

  function applyRigidityToStrategy(editing, id, value){
    if (!editing || !id) return;
    const spec = STRATEGY_RIGIDITY_SCHEMA[id];
    if (!spec || !spec.fields) return;
    const level = clampRigidityValue(value);
    const baseDefaults = STRATEGY_TUNING_DEFAULTS[id] || {};
    const baseline = clampRigidityValue(DEFAULT_STRATEGY_RIGIDITY.global);
    editing[id] = { ...(baseDefaults || {}), ...(editing[id] || {}) };
    Object.entries(spec.fields).forEach(([key, range])=>{
      if (!range) return;
      const loose = Number(range.loose);
      const strict = Number(range.strict);
      if (!Number.isFinite(loose) || !Number.isFinite(strict)) return;
      const def = Number(baseDefaults[key]);
      const field = findField(id, key) || {};
      let raw;
      if (Number.isFinite(def)){
        if (level === baseline){
          raw = def;
        } else if (level < baseline){
          const denom = baseline - RIGIDITY_MIN;
          const t = denom > 0 ? Math.min(1, Math.max(0, (baseline - level) / denom)) : 1;
          raw = def + (loose - def) * t;
        } else {
          const denom = RIGIDITY_MAX - baseline;
          const t = denom > 0 ? Math.min(1, Math.max(0, (level - baseline) / denom)) : 1;
          raw = def + (strict - def) * t;
        }
      } else {
        const ratio = Math.min(1, Math.max(0, level / Math.max(1, RIGIDITY_MAX)));
        raw = loose + (strict - loose) * ratio;
      }
      const normalized = normalizeTuningValue(field, raw);
      if (normalized != null){
        editing[id][key] = normalized;
      }
    });
  }

  function applyRigidityToAll(editing, rigidity){
    if (!editing) return;
    const normalized = normalizeRigidity(rigidity);
    getRigidityStrategyIds().forEach(id=>{
      const value = getEffectiveRigidity(id, normalized);
      applyRigidityToStrategy(editing, id, value);
    });
  }

  function hydrateRigidityControls(rigidity){
    const normalized = normalizeRigidity(rigidity);
    const globalInput = qs('#opx-rigidity-global');
    if (globalInput){
      const val = clampRigidityValue(normalized.global);
      globalInput.value = val;
      updateRigidityIndicator('global', val, false);
    }
    qsa('[data-rigidity-id]').forEach(input=>{
      const id = input.getAttribute('data-rigidity-id');
      const val = getEffectiveRigidity(id, normalized);
      input.value = val;
      updateRigidityIndicator(id, val, isRigidityOverride(id, normalized));
    });
  }

  function updateRigidityIndicator(id, value, override){
    const label = qs(`[data-rigidity-label="${id || 'global'}"]`);
    if (label) label.textContent = `${clampRigidityValue(value)}%`;
    const tag = qs(`[data-rigidity-tag="${id || 'global'}"]`);
    if (tag){
      const info = getRigidityLevelInfo(value);
      tag.textContent = info.label;
      tag.title = info.description ? `${info.label}: ${info.description}` : info.label;
      tag.classList.toggle('override', !!override);
      tag.dataset.inheritance = (!id || id === 'global') ? 'global' : (override ? 'override' : 'inherited');
    }
    if (id && id !== 'global'){
      const resetBtn = qs(`[data-rigidity-reset="${id}"]`);
      if (resetBtn){
        resetBtn.disabled = !override;
        resetBtn.classList.toggle('disabled', !override);
      }
    }
  }

  function setupRigidityEvents(tuning){
    const globalInput = qs('#opx-rigidity-global');
    if (globalInput){
      globalInput.addEventListener('input', ()=>{
        updateRigidityIndicator('global', clampRigidityValue(globalInput.value), false);
      });
      globalInput.addEventListener('change', ()=>{
        if (!tuning) return;
        const val = clampRigidityValue(globalInput.value);
        tuning.rigidity = normalizeRigidity(tuning.rigidity);
        tuning.rigidity.global = val;
        applyRigidityToAll(tuning.editing, tuning.rigidity);
        hydrateTuningForm(tuning.editing);
        hydrateRigidityControls(tuning.rigidity);
      });
    }
    qsa('[data-rigidity-id]').forEach(input=>{
      const id = input.getAttribute('data-rigidity-id');
      if (!id) return;
      input.addEventListener('input', ()=>{
        const val = clampRigidityValue(input.value);
        const globalVal = clampRigidityValue(tuning?.rigidity?.global ?? DEFAULT_STRATEGY_RIGIDITY.global);
        updateRigidityIndicator(id, val, val !== globalVal);
      });
      input.addEventListener('change', ()=>{
        if (!tuning) return;
        const val = clampRigidityValue(input.value);
        tuning.rigidity = normalizeRigidity(tuning.rigidity);
        const globalVal = clampRigidityValue(tuning.rigidity.global);
        if (val === globalVal){
          if (tuning.rigidity.overrides){
            delete tuning.rigidity.overrides[id];
          }
        } else {
          tuning.rigidity.overrides = tuning.rigidity.overrides || {};
          tuning.rigidity.overrides[id] = val;
        }
        const effectiveVal = getEffectiveRigidity(id, tuning.rigidity);
        applyRigidityToStrategy(tuning.editing, id, effectiveVal);
        hydrateTuningForm(tuning.editing);
        hydrateRigidityControls(tuning.rigidity);
      });
    });
    qsa('[data-rigidity-reset]').forEach(btn=>{
      const id = btn.getAttribute('data-rigidity-reset');
      btn.addEventListener('click', ev=>{
        ev.stopPropagation();
        if (!tuning || !id) return;
        tuning.rigidity = normalizeRigidity(tuning.rigidity);
        if (tuning.rigidity.overrides){
          delete tuning.rigidity.overrides[id];
        }
        const val = getEffectiveRigidity(id, tuning.rigidity);
        applyRigidityToStrategy(tuning.editing, id, val);
        hydrateTuningForm(tuning.editing);
        hydrateRigidityControls(tuning.rigidity);
      });
    });
  }

  const Tuning = {
    wrap: qs("#opx-tuning"),
    body: qs("#opx-tuning-body"),
    editing: null,
    flags: null,
    rigidity: null,
    sectionState: null,
    open(){
      if (!this.wrap) return;
      this.editing = mergeTunings(STRATEGY_TUNING_DEFAULTS, CFG.strategyTunings || {});
      this.flags = cloneStrategyFlags();
      this.rigidity = normalizeRigidity(CFG.strategyRigidity);
      applyRigidityToAll(this.editing, this.rigidity);
      this.sectionState = {};
      this.render();
      this.wrap.style.display = "flex";
    },
    close(){
      if (this.wrap) this.wrap.style.display = "none";
      this.editing = null;
      this.flags = null;
      this.rigidity = null;
      this.sectionState = null;
    },
    render(){
      if (!this.body) return;
      this.body.innerHTML = buildTuningHtml(this.sectionState || {}, this.rigidity || DEFAULT_STRATEGY_RIGIDITY);
      hydrateTuningForm(this.editing || {});
      hydrateTuningFlags(this.flags || {});
      hydrateRigidityControls(this.rigidity || DEFAULT_STRATEGY_RIGIDITY);
      setupTuningCollapsible(this);
      setupRigidityEvents(this);
      qsa('#opx-tuning-body [data-flag-strategy]').forEach(chk=>{
        chk.onchange = ()=>{
          const id = chk.getAttribute('data-flag-strategy');
          const key = chk.getAttribute('data-flag-key');
          if (!id || !key) return;
          if (!this.flags) this.flags = {};
          if (!this.flags[id]) this.flags[id] = {};
          this.flags[id][key] = chk.checked;
        };
      });
      qsa('#opx-tuning-body [data-reset-strategy]').forEach(btn=>{
        btn.onclick = ()=>{
          const id = btn.getAttribute('data-reset-strategy');
          if (!id) return;
          this.editing[id] = { ...(STRATEGY_TUNING_DEFAULTS[id] || {}) };
          const effective = getEffectiveRigidity(id, this.rigidity || DEFAULT_STRATEGY_RIGIDITY);
          applyRigidityToStrategy(this.editing, id, effective);
          hydrateTuningForm(this.editing);
          if (this.flags){
            this.flags[id] = { reverse: false };
            hydrateTuningFlags(this.flags);
          }
          log(`Ajustes resetados: ${getTuningTitle(id)}`);
        };
        btn.addEventListener('click', ev => ev.stopPropagation());
      });
      qsa('#opx-tuning-body [data-scenario-id]').forEach(btn=>{
        btn.onclick = ()=>{
          const id = btn.getAttribute('data-scenario-id');
          const key = btn.getAttribute('data-scenario-key');
          if (!id || !key) return;
          const scenario = STRATEGY_TUNING_SCHEMA[id]?.scenarios?.find(sc=>sc.key===key);
          if (!scenario) return;
          if (!this.editing) this.editing = {};
          this.editing[id] = { ...(this.editing[id] || {}), ...(scenario.values || {}) };
          const effective = getEffectiveRigidity(id, this.rigidity || DEFAULT_STRATEGY_RIGIDITY);
          applyRigidityToStrategy(this.editing, id, effective);
          hydrateTuningForm(this.editing);
          log(`Cenário aplicado: ${getTuningTitle(id)} – ${scenario.label || scenario.key}`);
        };
        btn.addEventListener('click', ev => ev.stopPropagation());
      });
    },
    resetAll(){
      this.editing = cloneTunings(STRATEGY_TUNING_DEFAULTS);
      this.flags = defaultStrategyFlags();
      this.rigidity = normalizeRigidity(DEFAULT_STRATEGY_RIGIDITY);
      applyRigidityToAll(this.editing, this.rigidity);
      hydrateTuningForm(this.editing);
      hydrateTuningFlags(this.flags);
      hydrateRigidityControls(this.rigidity);
      log("Todos os ajustes de estratégias foram restaurados.", "warn");
    },
    save(){
      if (!this.body) return;
      this.editing = readTuningForm();
      this.flags = readTuningFlags();
      CFG.strategyTunings = mergeTunings(STRATEGY_TUNING_DEFAULTS, this.editing || {});
      CFG.strategyRigidity = normalizeRigidity(this.rigidity);
      pruneRigidityOverrides(CFG.strategyRigidity);
      CFG.strategies = CFG.strategies || {};
      const flagIds = new Set([
        ...Object.keys(CFG.strategies || {}),
        ...Object.keys(this.flags || {})
      ]);
      flagIds.forEach(id=>{
        CFG.strategies[id] = CFG.strategies[id] || {};
        CFG.strategies[id].reverse = !!(this.flags?.[id]?.reverse);
      });
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

    function findField(id, key){
    const schema = STRATEGY_TUNING_SCHEMA[id];
    return schema?.fields?.find(f=>f.key===key) || null;
  }

function buildRigidityGlobalSection(rigidity){
  const value = clampRigidityValue(rigidity?.global ?? DEFAULT_STRATEGY_RIGIDITY.global);
  const level = getRigidityLevelInfo(value);
  return `
    <section class="tuning-section tuning-rigidity" data-rigidity-global>
      <div class="tuning-head">
        <div>
          <h4>Rigor global</h4>
          <p>Ajuste simultaneamente os limites de todas as estratégias. 0% = mais entradas, 100% = mais rigor.</p>
        </div>
      </div>
      <div class="rigidity-control">
        <div class="rigidity-label">
          <span>Rigor geral</span>
          <div class="rigidity-status">
            <span class="rigidity-value" data-rigidity-label="global">${value}%</span>
            <span class="rigidity-tag" data-rigidity-tag="global" title="${level.description ? `${level.label}: ${level.description}` : level.label}" data-inheritance="global">${level.label}</span>
          </div>
        </div>
        <div class="rigidity-slider">
          <input type="range" min="0" max="100" step="1" id="opx-rigidity-global" value="${value}">
        </div>
        <p class="rigidity-hint">Aplicado automaticamente nas estratégias que não tiverem rigor individual personalizado.</p>
      </div>
    </section>`;
}

function buildStrategyRigiditySection(id){
  return `
    <div class="rigidity-control" data-rigidity-block="${id}">
      <div class="rigidity-label">
        <span>Rigor da estratégia</span>
        <div class="rigidity-status">
          <span class="rigidity-value" data-rigidity-label="${id}">--%</span>
          <span class="rigidity-tag" data-rigidity-tag="${id}" data-inheritance="inherited" title="Seguindo o rigor global">--</span>
        </div>
      </div>
      <div class="rigidity-slider">
        <input type="range" min="0" max="100" step="1" data-rigidity-id="${id}">
        <button type="button" class="opx-btn sm ghost" data-rigidity-reset="${id}">Usar geral</button>
      </div>
      <p class="rigidity-hint">0% = configuração mais frouxa • 100% = mais rigorosa.</p>
    </div>`;
}

function buildTuningHtml(state={}, rigidity=DEFAULT_STRATEGY_RIGIDITY){
  const globalHtml = buildRigidityGlobalSection(rigidity);
  const parts = getTuningIds().map(id=>{
    const schema = STRATEGY_TUNING_SCHEMA[id] || { title: humanizeId(id), fields: [] };
    const fields = schema.fields || [];
    const defaults = STRATEGY_TUNING_DEFAULTS[id] || {};
      const cols = Math.min(3, Math.max(1, fields.length));
      const scenarios = Array.isArray(schema.scenarios) ? schema.scenarios : [];
      const flagsHtml = `<div class="tuning-flags">
            <label class="cfg-item cfg-checkbox">
              <span>Ordem reversa</span>
              <input type="checkbox" data-flag-strategy="${id}" data-flag-key="reverse">
            </label>
          </div>`;
      const scenariosHtml = scenarios.length ? `
        <div class="tuning-scenarios">
          ${scenarios.map(sc => `
            <button type="button" class="opx-btn sm" data-scenario-id="${id}" data-scenario-key="${escapeHtml(sc.key)}">
              ${escapeHtml(sc.label || sc.key)}
            </button>`).join('')}
        </div>` : '';
    const rigidityHtml = buildStrategyRigiditySection(id);
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
    const open = !!state[id];
    const sectionClass = open ? 'tuning-section' : 'tuning-section collapsed';
    const arrow = open ? '▾' : '▸';
    const content = [rigidityHtml, flagsHtml, scenariosHtml, inputs].filter(Boolean).join('');
    return `
      <section class="${sectionClass}" data-strategy="${id}">
        <div class="tuning-head">
          <div>
            <h4>${escapeHtml(schema.title || humanizeId(id))}</h4>
              ${schema.description ? `<p>${escapeHtml(schema.description)}</p>` : ""}
            </div>
            <div class="tuning-actions">
              <span class="tuning-arrow">${arrow}</span>
              <button type="button" class="opx-btn sm ghost" data-reset-strategy="${id}">Resetar</button>
            </div>
          </div>
          <div class="tuning-content">
            ${content}
          </div>
        </section>`;
  });
  return [globalHtml, ...parts].join("");
}

  function setupTuningCollapsible(tuning){
    if (!tuning || !tuning.body) return;
    qsa('#opx-tuning-body .tuning-section').forEach(section=>{
      const id = section.getAttribute('data-strategy');
      if (!id) return;
      const arrow = section.querySelector('.tuning-arrow');
      const applyState = open => {
        section.classList.toggle('collapsed', !open);
        if (arrow) arrow.textContent = open ? '▾' : '▸';
      };
      const current = !!(tuning.sectionState && tuning.sectionState[id]);
      applyState(current);
      const head = section.querySelector('.tuning-head');
      if (head){
        head.onclick = ev => {
          if (ev.target.closest('button')) return;
          const nextOpen = section.classList.contains('collapsed');
          if (!tuning.sectionState) tuning.sectionState = {};
          tuning.sectionState[id] = nextOpen;
          applyState(nextOpen);
        };
      }
    });
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

    const pendEl = qs("#opx-pend");
    if (pendEl){
      if (S.pending){
        const label = formatSideLabel(S.pending);
        const reverseTag = S.pending.reverse ? " (reversa)" : "";
        const stratTag = S.pending.strategyName ? ` • ${S.pending.strategyName}${S.pending.relax?' (relax)':''}` : (S.pending.relax ? " • (relax)" : "");
        pendEl.textContent = `${label}${reverseTag}${stratTag}`;
      } else {
        pendEl.textContent = "—";
      }
    }
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
function guardToggleKey(idx){
  if (idx == null) return null;
  const num = Number(idx);
  return Number.isNaN(num) ? String(idx) : String(num);
}

function isGuardConditionDisabled(strategyId, index){
  const key = guardToggleKey(index);
  if (!strategyId || key == null) return false;
  const bucket = CFG.guardToggles?.[strategyId];
  if (!bucket) return false;
  if (Object.prototype.hasOwnProperty.call(bucket, key)) return !!bucket[key];
  const alt = guardToggleKey(Number(key));
  return alt != null && Object.prototype.hasOwnProperty.call(bucket, alt) ? !!bucket[alt] : false;
}

function setGuardConditionDisabled(strategyId, index, disabled){
  const key = guardToggleKey(index);
  if (!strategyId || key == null) return;
  CFG.guardToggles = CFG.guardToggles || {};
  if (!CFG.guardToggles[strategyId]) CFG.guardToggles[strategyId] = {};
  if (disabled){
    CFG.guardToggles[strategyId][key] = true;
  } else {
    delete CFG.guardToggles[strategyId][key];
    if (Object.keys(CFG.guardToggles[strategyId]).length === 0){
      delete CFG.guardToggles[strategyId];
    }
  }
  LS.set("opx.cfg", CFG);
}

function decorateGuardForDisplay(strategyId, guard){
  if (!guard || !Array.isArray(guard.conditions)) return guard;
  const toggles = CFG.guardToggles?.[strategyId] || {};
  const out = { ...guard };
  out.conditions = guard.conditions.map((cond, idx)=>{
    const baseIndex = cond && cond.index != null ? cond.index : idx;
    const key = guardToggleKey(baseIndex);
    const toggledOff = key != null && !!toggles[key];
    const disabled = !!cond?.disabled || toggledOff;
    const pass = disabled ? true : !!cond?.pass;
    return { ...cond, pass, disabled, index: baseIndex };
  });
  out.ok = out.conditions.every(c => c.pass);
  out.disabledCount = out.conditions.filter(c => c.disabled).length;
  return out;
}

function decorateStrategyForDisplay(strat){
  if (!strat) return strat;
  const out = { ...strat };
  out.guard = decorateGuardForDisplay(strat.id, strat.guard);
  return out;
}

function renderConditionItem(cond, opts={}){
  if (!cond) return "";
  const { strategyId, index } = opts;
  const baseIndex = cond.index != null ? cond.index : index;
  const disabled = !!cond.disabled;
  const clsParts = [cond.pass ? "pass" : "fail"];
  if (disabled) clsParts.push("disabled");
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
  const tag = disabled ? '<span class="cond-tag">Ignorado</span>' : '';
  const canToggle = strategyId && baseIndex != null;
  const checked = !isGuardConditionDisabled(strategyId, baseIndex);
  const toggleHtml = canToggle
    ? `<label class="cond-toggle" title="Ativar ou desativar este requisito">`
      + `<input type="checkbox" data-guard-toggle="1" data-guard-strategy="${escapeHtml(strategyId)}" data-guard-index="${escapeHtml(String(baseIndex))}" data-guard-label="${escapeHtml(cond.label || '')}" ${checked ? "checked" : ""}>`
      + '<span class="toggle-ui"></span>'
      + '</label>'
    : "";
  return `<li class="${clsParts.join(' ')}">`
    + `<div class="cond-text">${label}${detailStr}${tag}</div>`
    + `${toggleHtml}`
    + `</li>`;
}

function renderStrategyBlock(strat){
  if (!strat) return "";
  const view = decorateStrategyForDisplay(strat);
  const classes = ["analysis-strategy"];
  let status = "Requisitos não atendidos";
  if (view.enabled === false){
    classes.push("disabled");
    status = "Desativada na central";
  } else if (view.gateBlocked){
    classes.push("blocked");
    status = "Bloqueada pelo EMA Gate";
  } else if (view.activeFinal){
    classes.push("active");
    status = "Ativa (cenário + central)";
  } else if (view.activeByScene){
    classes.push("waiting");
    status = "Liberada pelo cenário";
  } else {
    classes.push("inactive");
  }

  const badges = [];
  if (view.chosen) badges.push('<span class="pill pill-chosen">Escolhida</span>');
  if (view.relaxApplied) badges.push('<span class="pill pill-relax">Relax</span>');
  if (view.gateBlocked) badges.push('<span class="pill pill-block">Gate</span>');

  const infoParts = [];
  infoParts.push(`Cenário: ${view.activeByScene ? "Sim" : "Não"}`);
  infoParts.push(`Central: ${view.enabled === false ? "Off" : view.activeFinal ? "Sim" : "Não"}`);
  if (view.lastSignal){
    const gateNote = view.gateBlocked ? " (gate)" : "";
    infoParts.push(`Último sinal: ${view.lastSignal}${gateNote}`);
  }
  if (view.gateOk === true && !view.gateBlocked){
    infoParts.push("EMA Gate liberou");
  } else if (view.gateOk === false){
    infoParts.push("EMA Gate negou");
  }

  const conditions = view.guard && Array.isArray(view.guard.conditions) ? view.guard.conditions : [];
  const condHtml = conditions.length
    ? `<ul class="conditions">${conditions.map((c, idx) => renderConditionItem(c, { strategyId: view.id, index: idx })).join("")}</ul>`
    : '<div class="strategy-no-conditions">Sem requisitos adicionais.</div>';

  const name = escapeHtml(view.name || humanizeId(view.id));
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

function summarizeDebriefMeta(view){
  const notes = [];
  notes.push(`Cenário: ${view.activeByScene ? "OK" : "Bloqueado"}`);
  notes.push(`Central: ${view.enabled === false ? "Off" : "On"}`);
  if (view.activeFinal && view.enabled !== false) notes.push("Liberada para gatilho");
  if (view.relaxApplied) notes.push("Relax ativo");
  if (view.gateBlocked) notes.push("EMA Gate bloqueou");
  else if (view.gateOk === true) notes.push("EMA Gate liberou");
  else if (view.gateOk === false) notes.push("EMA Gate negou");
  if (view.lastSignal) notes.push(`Último gatilho: ${view.lastSignal}`);
  return notes.join(" • ");
}

function renderDebriefTrigger(view){
  const guard = view.guard || { conditions: [] };
  const conditions = Array.isArray(guard.conditions) ? guard.conditions : [];
  const pending = conditions.filter(c => !c.pass && !c.disabled);
  const detect = view.detect || null;

  let cls = "waiting";
  let status = "Aguardando habilitação na central";

  if (view.enabled === false){
    cls = "disabled";
    status = "Desativada na central";
  } else if (!view.activeByScene){
    cls = "blocked";
    status = "Cenário não habilitado";
  } else if (pending.length){
    cls = "blocked";
    status = `Pendências: ${pending.map(c => c.label || "Indicador").join(", ")}`;
  } else if (view.gateBlocked){
    cls = "blocked";
    status = "Bloqueada pelo EMA Gate";
  } else if (view.chosen && detect){
    cls = "executed";
    const label = detect.side ? `${detect.side}` : "";
    status = detect.reason ? `${detect.reason}${label ? ` (${label})` : ""}` : `Ordem confirmada${label ? ` (${label})` : ""}`;
  } else if (detect && detect.side){
    cls = "ready";
    status = detect.reason ? `${detect.reason} (${detect.side})` : `Gatilho pronto (${detect.side})`;
  } else if (view.activeFinal){
    cls = "waiting";
    status = detect && detect.reason ? detect.reason : "Aguardando gatilho da estratégia";
  }

  const extras = [];
  const reasonNote = detect && detect.reason ? String(detect.reason) : null;
  if (reasonNote && !status.includes(reasonNote)){
    extras.push(`Motivo: ${reasonNote}`);
  }
  if (detect){
    if (detect.mode) extras.push(`Modo: ${detect.mode}`);
    if (detect.score != null) extras.push(`Score: ${formatNumber(detect.score, 1)}`);
    if (detect.pending) extras.push("Pré-confirmação");
    if (detect.sizeMultiplier != null) extras.push(`Lote: ${formatNumber(detect.sizeMultiplier, 2)}`);
  }
  const extraHtml = extras.length
    ? `<div class="debrief-trigger-extra">${escapeHtml(extras.join(' • '))}</div>`
    : "";

  const tradeParts = [];
  if (detect){
    const entryVal = Number(detect.entry);
    const stopVal = Number(detect.stop);
    if (Number.isFinite(entryVal)) tradeParts.push(`Entrada: ${formatNumber(entryVal, 5)}`);
    if (Number.isFinite(stopVal)) tradeParts.push(`Stop: ${formatNumber(stopVal, 5)}`);
    if (Array.isArray(detect.targets) && detect.targets.length){
      const targets = detect.targets
        .map(t => Number(t))
        .filter(v => Number.isFinite(v))
        .map(v => formatNumber(v, 5));
      if (targets.length) tradeParts.push(`Alvos: ${targets.join(", ")}`);
    }
  }
  const tradeHtml = tradeParts.length
    ? `<div class="debrief-trigger-extra">${escapeHtml(tradeParts.join(' • '))}</div>`
    : "";

  const detailsHtml = `${extraHtml}${tradeHtml}`;

  return `<div class="debrief-trigger ${cls}">
    <div class="debrief-trigger-status">${escapeHtml(status)}</div>
    ${detailsHtml}
  </div>`;
}

function renderDebriefStrategyBlock(strat){
  if (!strat) return "";
  const view = decorateStrategyForDisplay(strat);
  const summary = summarizeDebriefMeta(view);
  const conditions = view.guard && Array.isArray(view.guard.conditions) ? view.guard.conditions : [];
  const condHtml = conditions.length
    ? `<ul class="conditions">${conditions.map((c, idx) => renderConditionItem(c, { strategyId: view.id, index: idx })).join("")}</ul>`
    : '<div class="strategy-no-conditions">Sem indicadores definidos.</div>';
  const trigger = renderDebriefTrigger(view);
  return `<div class="analysis-strategy debrief">
    <div class="strategy-head">
      <span class="strategy-name">${escapeHtml(view.name || humanizeId(view.id))}</span>
    </div>
    <div class="debrief-summary">${escapeHtml(summary)}</div>
    ${trigger}
    <div class="debrief-section-title">Pré-requisitos</div>
    ${condHtml}
  </div>`;
}

function renderDebriefStrategiesSection(strats){
  if (!Array.isArray(strats) || !strats.length){
    return '<div class="analysis-section"><div class="analysis-empty">Sem indicadores para exibir.</div></div>';
  }
  return `<div class="analysis-section">
    <div class="analysis-subtitle">Checklist de gatilho por estratégia</div>
    ${strats.map(renderDebriefStrategyBlock).join("")}
  </div>`;
}

function renderDebriefEntry(entry, idx){
  if (!entry) return "";
  const summary = escapeHtml(analysisSummary(entry));
  const strategies = renderDebriefStrategiesSection(entry.strategies);
  return `<details class="analysis-entry" ${idx===0 ? "open" : ""}>
    <summary>${summary}</summary>
    <div class="analysis-content">
      ${strategies}
    </div>
  </details>`;
}

function renderDebriefList(entries, limit=15){
  if (!Array.isArray(entries) || !entries.length){
    return '<div class="analysis-empty">Nenhum diagnóstico registrado ainda.</div>';
  }
  const slice = entries.slice(-limit).reverse();
  return slice.map((entry, idx) => renderDebriefEntry(entry, idx)).join("");
}

function wireGuardToggleHandlers(root){
  if (!root) return;
  qsa('[data-guard-toggle]', root).forEach(input => {
    input.onchange = ()=>{
      const stratId = input.getAttribute('data-guard-strategy');
      const idxAttr = input.getAttribute('data-guard-index');
      const label = input.getAttribute('data-guard-label') || 'Indicador';
      const enabled = input.checked;
      setGuardConditionDisabled(stratId, idxAttr, !enabled);
      const stratName = stratId ? humanizeId(stratId) : 'Estratégia';
      const prefix = enabled ? 'Requisito ativado' : 'Requisito desativado';
      log(`${prefix}: ${label} (${stratName})`, enabled ? 'ok' : 'warn');
      if (typeof window.__opxRefreshConditions === 'function') {
        window.__opxRefreshConditions();
      }
    };
  });
}
