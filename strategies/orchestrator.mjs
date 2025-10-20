// strategies/orchestrator.mjs
// Orquestrador de estratégias: guards por cenário, Relax mode e EMA Gate direcional
// Não depende do DOM. Usa apenas S (state), CFG e candles do M1.

function emaSeries(values, len){
  const k = 2/(len+1);
  let p = null;
  return values.map(v => (p = (p==null ? v : v*k + p*(1-k))));
}
function slope(series, n=8){
  const i = series.length-1;
  const a = series[i-1], b = series[i-1-n];
  if (a==null || b==null) return 0;
  const denom = Math.max(1e-9, Math.abs(b));
  return (a - b) / denom;
}
function last(arr, n=1){ return arr[arr.length - n]; }

function fmt(n, digits=4){
  if (n == null || Number.isNaN(n) || !Number.isFinite(n)) return '—';
  return Number(n).toFixed(digits);
}
function cond(label, pass, info={}){ return { label, pass, ...info }; }
function guardResult(conditions, meta={}){
  return { ok: conditions.every(c => c.pass), conditions, ...meta };
}
function toTitleCase(str){
  return String(str || '').replace(/[-_]+/g,' ').replace(/\s+/g,' ').trim().replace(/\b\w/g, x => x.toUpperCase());
}

const DEFAULT_TUNINGS = {
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

const RELAX_IGNORE = new Set(['gapRejection']);

function getTuning(CFG, id){
  return { ...(DEFAULT_TUNINGS[id] || {}), ...((CFG?.strategyTunings || {})[id] || {}) };
}

function buildCtx(candles, CFG){
  // candles: [{o,h,l,c,v,t,...}] formato do seu content.js (M1)
  const closes = candles.map(c => c.c);
  const highs  = candles.map(c => c.h);
  const lows   = candles.map(c => c.l);
  const vol    = candles.map(c => c.v);

  const periods = new Set([20, 50]);
  const slopePeriods = new Set([20]);
  const tunings = CFG?.strategyTunings || {};
  const ids = new Set([
    ...Object.keys(DEFAULT_TUNINGS),
    ...Object.keys(tunings)
  ]);
  ids.forEach(id => {
    const tune = { ...(DEFAULT_TUNINGS[id] || {}), ...(tunings[id] || {}) };
    if (tune.emaFast) { periods.add(tune.emaFast); slopePeriods.add(tune.emaFast); }
    if (tune.emaSlow) periods.add(tune.emaSlow);
    if (tune.emaPeriod) { periods.add(tune.emaPeriod); slopePeriods.add(tune.emaPeriod); }
    if (tune.slopePeriod) { periods.add(tune.slopePeriod); slopePeriods.add(tune.slopePeriod); }
  });

  const emaSeriesMap = {};
  periods.forEach(period => {
    emaSeriesMap[period] = emaSeries(closes, period);
  });

  const i   = candles.length - 1;
  const L   = candles[i];           // última (andando)
  const P   = candles[i-1];         // penúltima (fechada)

  const range = Math.max(1e-9, P.h - P.l);
  const atr   = range; // leve (coerente com content.js)
  const atrN  = atr / Math.max(1e-9, P.c);

  const emaValues = {};
  const distMap = {};
  periods.forEach(period => {
    const series = emaSeriesMap[period];
    const value = series ? series[i-1] : null;
    emaValues[period] = value;
    distMap[period] = value == null ? null : Math.abs(P.c - value) / Math.max(1e-9, atr);
  });

  const slopeMap = {};
  slopePeriods.forEach(period => {
    const series = emaSeriesMap[period];
    if (series) slopeMap[period] = slope(series, 8);
  });

  const vma20 = emaSeries(vol, 20);
  const vma   = vma20[i-1];

  const defaultFast = 20;
  const defaultSlow = 50;

  return {
    C: candles,
    L: P,
    ema: emaValues,
    slope: slopeMap,
    dist: distMap,
    e20: emaValues[defaultFast],
    e50: emaValues[defaultSlow],
    slope20: slopeMap[defaultFast],
    atr,
    atrN,
    distE20: distMap[defaultFast],
    vNow: P.v,
    vAvg20: vma,
    highs,
    lows
  };
}

function regimeAgree(symbol, S, CFG){
  try {
    if (!symbol || !S || !CFG) return null;
    const tfA = CFG.tfRegA || '5m';
    const tfB = CFG.tfRegB || '15m';
    const baseA = `${symbol}_${tfA}`;
    const baseB = `${symbol}_${tfB}`;
    const e5_20  = S.emas?.[`${baseA}_ema20`];
    const e5_50  = S.emas?.[`${baseA}_ema50`];
    const e15_20 = S.emas?.[`${baseB}_ema20`];
    const e15_50 = S.emas?.[`${baseB}_ema50`];
    if ([e5_20, e5_50, e15_20, e15_50].some(v => v == null)) return null;

    const bull5 = e5_20 > e5_50;
    const bear5 = e5_20 < e5_50;
    const bull15 = e15_20 > e15_50;
    const bear15 = e15_20 < e15_50;

    let state = "MIX";
    if (bull5 && bull15) state = "BULL";
    else if (bear5 && bear15) state = "BEAR";
    else if ((bull5 && bear15) || (bear5 && bull15)) state = "OPPOSED";

    const bias5 = bull5 ? "BULL" : bear5 ? "BEAR" : "MIX";
    return { state, bias5 };
  } catch (_err) {
    return null;
  }
}

// Helpers de força do candle (0..1) – proporcionais ao corpo vs range
function strongBull(c, min=0.45){
  const range = Math.max(1e-9, c.h - c.l);
  const body  = Math.max(0, c.c - c.o);
  return (body / range) >= min;
}
function strongBear(c, min=0.45){
  const range = Math.max(1e-9, c.h - c.l);
  const body  = Math.max(0, c.o - c.c);
  return (body / range) >= min;
}

function emaGateAllows(side, ctx, gateCfg){
  // gateCfg = {enabled, divisor, directional, minDistATR, slopeMin}
  if (!gateCfg || !gateCfg.enabled) return true;

  // recalcular EMAs para divisor/direcional (leve; small arrays)
  const closes = ctx.C.map(k => k.c);
  const eDiv   = last(emaSeries(closes, gateCfg.divisor));
  const eDirS  = emaSeries(closes, gateCfg.directional);
  const slDir  = slope(eDirS, 8);

  const minDist = (gateCfg.minDistATR ?? 0.30) * ctx.atr;
  const above   = ctx.L.c >= (eDiv + minDist);
  const below   = ctx.L.c <= (eDiv - minDist);
  const upDir   = slDir >= (gateCfg.slopeMin ?? 0.0008);
  const dnDir   = slDir <= -(gateCfg.slopeMin ?? 0.0008);

  if (side === "BUY")  return above && upDir;
  if (side === "SELL") return below && dnDir;
  return false;
}

// Guards por estratégia (cenário ideal). Ajustáveis no "relax".
function evaluateGuards(ctx, relax, CFG){
  const slopeLoose = CFG.slopeLoose ?? 0.0007;
  const distAdd    = CFG.distE20RelaxAdd ?? 0.10;
  const results    = {};
  const perStrategy = {};

  const slopeAbsDefault = Math.abs(ctx.slope20 ?? 0);

  function distInfo(period, base){
    const baseVal = base != null ? base : 1.0;
    const distVal = ctx.dist?.[period] ?? ctx.distE20 ?? Infinity;
    const limit   = baseVal + (relax ? distAdd : 0);
    return { distVal, limit, base: baseVal };
  }

  // Retest Breakout (Buy)
  (function(){
    const tune = getTuning(CFG, 'retestBreakoutBuy');
    const emaFast = tune.emaFast ?? 20;
    const emaSlow = tune.emaSlow ?? 50;
    const slopeBase = tune.slopeMin ?? 0.001;
    const slopeReq  = relax ? Math.min(slopeLoose, slopeBase) : slopeBase;
    const atrMin = tune.atrMin ?? 0.004;
    const atrMax = tune.atrMax ?? 0.020;
    const { distVal, limit: distMax } = distInfo(emaFast, tune.distMax);
    const emaFastVal = ctx.ema?.[emaFast];
    const emaSlowVal = ctx.ema?.[emaSlow];
    const slopeVal = ctx.slope?.[emaFast] ?? ctx.slope20 ?? 0;
    perStrategy.retestBreakoutBuy = { ...tune };
    results.retestBreakoutBuy = guardResult([
      cond(`EMA${emaFast} > EMA${emaSlow}`, emaFastVal > emaSlowVal, { actual: emaFastVal, expected: emaSlowVal, comparator: '>', digits: 4 }),
      cond(`Slope${emaFast} ≥ ${fmt(slopeReq, 4)}`, slopeVal >= slopeReq, { actual: slopeVal, expected: slopeReq, comparator: '≥', digits: 4 }),
      cond(`ATRₙ ≥ ${fmt(atrMin, 4)}`, ctx.atrN >= atrMin, { actual: ctx.atrN, expected: atrMin, comparator: '≥', digits: 4 }),
      cond(`ATRₙ ≤ ${fmt(atrMax, 4)}`, ctx.atrN <= atrMax, { actual: ctx.atrN, expected: atrMax, comparator: '≤', digits: 4 }),
      cond(`Dist. EMA${emaFast} ≤ ${fmt(distMax, 3)}`, distVal <= distMax, { actual: distVal, expected: distMax, comparator: '≤', digits: 3 })
    ], { relaxApplied: relax, tune });
  })();

  // Retest Breakdown (Sell)
  (function(){
    const tune = getTuning(CFG, 'retestBreakdownSell');
    const emaFast = tune.emaFast ?? 20;
    const emaSlow = tune.emaSlow ?? 50;
    const slopeBase = tune.slopeMin ?? 0.001;
    const slopeReq  = relax ? Math.min(slopeLoose, slopeBase) : slopeBase;
    const atrMin = tune.atrMin ?? 0.004;
    const atrMax = tune.atrMax ?? 0.020;
    const { distVal, limit: distMax } = distInfo(emaFast, tune.distMax);
    const emaFastVal = ctx.ema?.[emaFast];
    const emaSlowVal = ctx.ema?.[emaSlow];
    const slopeVal = ctx.slope?.[emaFast] ?? ctx.slope20 ?? 0;
    perStrategy.retestBreakdownSell = { ...tune };
    results.retestBreakdownSell = guardResult([
      cond(`EMA${emaFast} < EMA${emaSlow}`, emaFastVal < emaSlowVal, { actual: emaFastVal, expected: emaSlowVal, comparator: '<', digits: 4 }),
      cond(`Slope${emaFast} ≤ -${fmt(slopeReq, 4)}`, slopeVal <= -slopeReq, { actual: slopeVal, expected: -slopeReq, comparator: '≤', digits: 4 }),
      cond(`ATRₙ ≥ ${fmt(atrMin, 4)}`, ctx.atrN >= atrMin, { actual: ctx.atrN, expected: atrMin, comparator: '≥', digits: 4 }),
      cond(`ATRₙ ≤ ${fmt(atrMax, 4)}`, ctx.atrN <= atrMax, { actual: ctx.atrN, expected: atrMax, comparator: '≤', digits: 4 }),
      cond(`Dist. EMA${emaFast} ≤ ${fmt(distMax, 3)}`, distVal <= distMax, { actual: distVal, expected: distMax, comparator: '≤', digits: 3 })
    ], { relaxApplied: relax, tune });
  })();

  // Double Top / Bottom
  (function(){
    const tune = getTuning(CFG, 'doubleTopBottom');
    const emaFast = tune.emaFast ?? 20;
    const emaSlow = tune.emaSlow ?? 50;
    const atrMin = tune.atrMin ?? 0.004;
    const atrMax = tune.atrMax ?? 0.015;
    const slopeNeutral = tune.slopeNeutralMax ?? 0.0007;
    const emaFastVal = ctx.ema?.[emaFast];
    const emaSlowVal = ctx.ema?.[emaSlow];
    const slopeAbs = Math.abs(ctx.slope?.[emaFast] ?? ctx.slope20 ?? 0);
    perStrategy.doubleTopBottom = { ...tune };
    results.doubleTopBottom = guardResult([
      cond(`ATRₙ ≥ ${fmt(atrMin, 4)}`, ctx.atrN >= atrMin, { actual: ctx.atrN, expected: atrMin, comparator: '≥', digits: 4 }),
      cond(`ATRₙ ≤ ${fmt(atrMax, 4)}`, ctx.atrN <= atrMax, { actual: ctx.atrN, expected: atrMax, comparator: '≤', digits: 4 }),
      cond(`Neutro (EMA${emaFast}≤EMA${emaSlow} ou |slope|≤${fmt(slopeNeutral,4)})`, (emaFastVal <= emaSlowVal) || (slopeAbs <= slopeNeutral), {
        extra: `EMA${emaFast}=${fmt(emaFastVal,4)} • EMA${emaSlow}=${fmt(emaSlowVal,4)} • |slope|=${fmt(slopeAbs,4)}`
      })
    ], { relaxApplied: relax, tune });
  })();

  // Symmetrical Triangle
  (function(){
    const tune = getTuning(CFG, 'symTriangle');
    const slopePeriod = tune.slopePeriod ?? 20;
    const slopeAbs = Math.abs(ctx.slope?.[slopePeriod] ?? ctx.slope20 ?? 0);
    const atrMin = tune.atrMin ?? 0.004;
    const atrMax = tune.atrMax ?? 0.012;
    const slopeMax = tune.slopeAbsMax ?? 0.002;
    perStrategy.symTriangle = { ...tune };
    results.symTriangle = guardResult([
      cond(`ATRₙ ≥ ${fmt(atrMin, 4)}`, ctx.atrN >= atrMin, { actual: ctx.atrN, expected: atrMin, comparator: '≥', digits: 4 }),
      cond(`ATRₙ ≤ ${fmt(atrMax, 4)}`, ctx.atrN <= atrMax, { actual: ctx.atrN, expected: atrMax, comparator: '≤', digits: 4 }),
      cond(`|Slope${slopePeriod}| ≤ ${fmt(slopeMax, 4)}`, slopeAbs <= slopeMax, { actual: slopeAbs, expected: slopeMax, comparator: '≤', digits: 4 })
    ], { relaxApplied: relax, tune });
  })();

  // Range Breakout
  (function(){
    const tune = getTuning(CFG, 'rangeBreakout');
    const slopePeriod = tune.slopePeriod ?? 20;
    const slopeAbs = Math.abs(ctx.slope?.[slopePeriod] ?? ctx.slope20 ?? 0);
    const atrMin = tune.atrMin ?? 0.004;
    const atrMax = tune.atrMax ?? 0.015;
    const slopeMin = tune.slopeAbsMin ?? 0.0005;
    perStrategy.rangeBreakout = { ...tune };
    results.rangeBreakout = guardResult([
      cond(`ATRₙ ≥ ${fmt(atrMin, 4)}`, ctx.atrN >= atrMin, { actual: ctx.atrN, expected: atrMin, comparator: '≥', digits: 4 }),
      cond(`ATRₙ ≤ ${fmt(atrMax, 4)}`, ctx.atrN <= atrMax, { actual: ctx.atrN, expected: atrMax, comparator: '≤', digits: 4 }),
      cond(`|Slope${slopePeriod}| ≥ ${fmt(slopeMin, 4)}`, slopeAbs >= slopeMin, { actual: slopeAbs, expected: slopeMin, comparator: '≥', digits: 4 })
    ], { relaxApplied: relax, tune });
  })();

  // Gap Rejection (sem filtros adicionais)
  perStrategy.gapRejection = { ...getTuning(CFG, 'gapRejection') };
  results.gapRejection = guardResult([
    cond('Sem restrições adicionais', true, { note: 'Verificação direta do sinal.' })
  ], { relaxApplied: relax });

  // Triple Level
  (function(){
    const tune = getTuning(CFG, 'tripleLevel');
    const emaPeriod = tune.emaPeriod ?? 20;
    const atrMin = tune.atrMin ?? 0.004;
    const atrMax = tune.atrMax ?? 0.015;
    const { distVal, limit: distMax } = distInfo(emaPeriod, tune.distMax);
    perStrategy.tripleLevel = { ...tune };
    results.tripleLevel = guardResult([
      cond(`ATRₙ ≥ ${fmt(atrMin, 4)}`, ctx.atrN >= atrMin, { actual: ctx.atrN, expected: atrMin, comparator: '≥', digits: 4 }),
      cond(`ATRₙ ≤ ${fmt(atrMax, 4)}`, ctx.atrN <= atrMax, { actual: ctx.atrN, expected: atrMax, comparator: '≤', digits: 4 }),
      cond(`Dist. EMA${emaPeriod} ≤ ${fmt(distMax, 3)}`, distVal <= distMax, { actual: distVal, expected: distMax, comparator: '≤', digits: 3 })
    ], { relaxApplied: relax, tune });
  })();

  // Trendline Rejection
  (function(){
    const tune = getTuning(CFG, 'trendlineRejection');
    const emaPeriod = tune.emaPeriod ?? 20;
    const atrMin = tune.atrMin ?? 0.0035;
    const { distVal, limit: distMax } = distInfo(emaPeriod, tune.distMax);
    perStrategy.trendlineRejection = { ...tune };
    results.trendlineRejection = guardResult([
      cond(`ATRₙ ≥ ${fmt(atrMin, 4)}`, ctx.atrN >= atrMin, { actual: ctx.atrN, expected: atrMin, comparator: '≥', digits: 4 }),
      cond(`Dist. EMA${emaPeriod} ≤ ${fmt(distMax, 3)}`, distVal <= distMax, { actual: distVal, expected: distMax, comparator: '≤', digits: 3 })
    ], { relaxApplied: relax, tune });
  })();

  // Second Entry
  (function(){
    const tune = getTuning(CFG, 'secondEntry');
    const emaPeriod = tune.emaPeriod ?? 20;
    const slopePeriod = tune.slopePeriod ?? emaPeriod;
    const slopeMin = tune.slopeAbsMin ?? 0.001;
    const slopeAbs = Math.abs(ctx.slope?.[slopePeriod] ?? ctx.slope20 ?? 0);
    const { distVal, limit: distMax } = distInfo(emaPeriod, tune.distMax);
    perStrategy.secondEntry = { ...tune };
    results.secondEntry = guardResult([
      cond(`|Slope${slopePeriod}| ≥ ${fmt(slopeMin, 4)}`, slopeAbs >= slopeMin, { actual: slopeAbs, expected: slopeMin, comparator: '≥', digits: 4 }),
      cond(`Dist. EMA${emaPeriod} ≤ ${fmt(distMax, 3)}`, distVal <= distMax, { actual: distVal, expected: distMax, comparator: '≤', digits: 3 })
    ], { relaxApplied: relax, tune });
  })();

  // Micro Channels
  (function(){
    const tune = getTuning(CFG, 'microChannels');
    const emaPeriod = tune.emaPeriod ?? 20;
    const slopePeriod = tune.slopePeriod ?? emaPeriod;
    const slopeMin = tune.slopeAbsMin ?? 0.001;
    const slopeAbs = Math.abs(ctx.slope?.[slopePeriod] ?? ctx.slope20 ?? 0);
    const { distVal, limit: distMax } = distInfo(emaPeriod, tune.distMax);
    perStrategy.microChannels = { ...tune };
    results.microChannels = guardResult([
      cond(`|Slope${slopePeriod}| ≥ ${fmt(slopeMin, 4)}`, slopeAbs >= slopeMin, { actual: slopeAbs, expected: slopeMin, comparator: '≥', digits: 4 }),
      cond(`Dist. EMA${emaPeriod} ≤ ${fmt(distMax, 3)}`, distVal <= distMax, { actual: distVal, expected: distMax, comparator: '≤', digits: 3 })
    ], { relaxApplied: relax, tune });
  })();

  // Reversal Bar
  (function(){
    const tune = getTuning(CFG, 'reversalBar');
    const emaPeriod = tune.emaPeriod ?? 20;
    const atrMin = tune.atrMin ?? 0.0035;
    const { distVal, limit: distMax } = distInfo(emaPeriod, tune.distMax);
    perStrategy.reversalBar = { ...tune };
    results.reversalBar = guardResult([
      cond(`ATRₙ ≥ ${fmt(atrMin, 4)}`, ctx.atrN >= atrMin, { actual: ctx.atrN, expected: atrMin, comparator: '≥', digits: 4 }),
      cond(`Dist. EMA${emaPeriod} ≤ ${fmt(distMax, 3)}`, distVal <= distMax, { actual: distVal, expected: distMax, comparator: '≤', digits: 3 })
    ], { relaxApplied: relax, tune });
  })();

  // EMA Cross
  (function(){
    const tune = getTuning(CFG, 'emaCross');
    const emaFast = tune.emaFast ?? 20;
    const emaSlow = tune.emaSlow ?? 50;
    const slopeBase = tune.slopeMin ?? 0.001;
    const slopeReq = relax ? Math.min(slopeLoose, slopeBase) : slopeBase;
    const emaFastVal = ctx.ema?.[emaFast];
    const emaSlowVal = ctx.ema?.[emaSlow];
    const slopeVal = ctx.slope?.[emaFast] ?? ctx.slope20 ?? 0;
    perStrategy.emaCross = { ...tune };
    results.emaCross = guardResult([
      cond('Cruzamento e inclinação coerentes',
        (emaFastVal > emaSlowVal && slopeVal >= slopeReq) || (emaFastVal < emaSlowVal && slopeVal <= -slopeReq),
        { extra: `EMA${emaFast}=${fmt(emaFastVal,4)} • EMA${emaSlow}=${fmt(emaSlowVal,4)} • slope=${fmt(slopeVal,5)}` }
      )
    ], { relaxApplied: relax, tune });
  })();

  return {
    results,
    thresholds: {
      slopeLoose,
      distRelaxAdd: distAdd,
      perStrategy
    }
  };
}

// PIPE (ordem de prioridade leve; pode ajustar)
const PIPE = [
  { id:'retestBreakoutBuy'   },
  { id:'retestBreakdownSell' },
  { id:'rangeBreakout'       },
  { id:'secondEntry'         },
  { id:'microChannels'       },
  { id:'symTriangle'         },
  { id:'doubleTopBottom'     },
  { id:'tripleLevel'         },
  { id:'trendlineRejection'  },
  { id:'reversalBar'         },
  { id:'gapRejection'        },
  { id:'emaCross'            }, // mantém no fim para usar como retomada/continuação
];

export function evaluate(symbol, S, CFG, STRATS_MAP){
  // Retorna: { chosen, activeList, relaxActive }
  // chosen = { side, strategyId, strategyName, relax }
  try{
    const base = `${symbol}_${CFG.tfExec}`;
    const candles = S.candles[base];
    const gateCfgBase = CFG.emaGate || {};
    if (!candles || candles.length < 30){
      return {
        chosen: null,
        activeList: [],
        relaxActive: false,
        analysis: {
          timestamp: Date.now(),
          symbol,
          candles: candles ? candles.length : 0,
          reason: 'Velas insuficientes para diagnóstico',
          relaxActive: false,
          relaxAuto: CFG.relaxAuto !== false,
          activeByScene: [],
          finalActives: [],
          strategies: [],
          guardResults: {},
          metrics: null,
          thresholds: null,
          emaGate: {
            enabled: !!gateCfgBase.enabled,
            divisor: gateCfgBase.divisor ?? null,
            directional: gateCfgBase.directional ?? null,
            minDistATR: gateCfgBase.minDistATR ?? null,
            slopeMin: gateCfgBase.slopeMin ?? null,
            allowBuy: null,
            allowSell: null,
            blocked: []
          }
        }
      };
    }

    const ctx = buildCtx(candles, CFG);

    // ------- Relax Mode control -------
    // guarda um relógio local por símbolo em S.__orch
    const orchStore = (S.__orch ||= {});
    const ORCH = (orchStore[symbol] ||= {
      lastActiveTs: Date.now(),
      relaxMode: false,
      relaxSince: null,
      lastEvalTs: 0,
      cache: null,
    });
    const relaxAuto     = (CFG.relaxAuto !== false);               // ON por padrão
    const relaxAfterMin = Math.max(1, CFG.relaxAfterMin || 12)*60*1000;

    const guardBundle   = evaluateGuards(ctx, ORCH.relaxMode, CFG) || {};
    const guardResults  = guardBundle.results || {};
    const thresholdsRaw = guardBundle.thresholds || {};

    // Ver quais estariam ativas pelo cenário:
    const activeByScene = PIPE
      .filter(p => guardResults[p.id]?.ok)
      .map(p => p.id);

    // Se não há nenhuma ativa por cenário e relax está ligado e não estamos em relax → aciona após N minutos
    const relaxCandidates = activeByScene.filter(id => !RELAX_IGNORE.has(id));

    if (relaxAuto){
      if (relaxCandidates.length > 0){
        ORCH.lastActiveTs = Date.now();
        if (ORCH.relaxMode){ ORCH.relaxMode = false; ORCH.relaxSince = null; }
      } else {
        if (!ORCH.relaxMode && (Date.now() - ORCH.lastActiveTs) >= relaxAfterMin){
          ORCH.relaxMode  = true;
          ORCH.relaxSince = Date.now();
        }
      }
    }

    const relaxActive = ORCH.relaxMode === true;

    // Agora, as ativas finais consideram também os toggles da central (CFG.strategies[id]?.enabled)
    const finalActives = activeByScene.filter(id => {
      const st = CFG.strategies?.[id];
      return !st || st.enabled !== false; // se não existir config, consideramos habilitada
    });

    // Expõe a lista no S para a UI (painel "Ativas")
    S.activeStrats = finalActives;

    const strategiesInfo = PIPE.map(p => {
      const guard = guardResults[p.id] || { ok:false, conditions:[] };
      const cfgEntry = CFG.strategies?.[p.id];
      const enabled = cfgEntry ? cfgEntry.enabled !== false : true;
      const name = cfgEntry?.name || STRATS_MAP?.[p.id]?.name || toTitleCase(p.id);
      return {
        id: p.id,
        name,
        enabled,
        activeByScene: !!guard.ok,
        activeFinal: enabled && guard.ok && finalActives.includes(p.id),
        guard,
        relaxApplied: guard.relaxApplied || false,
        gateBlocked: false,
        gateOk: null,
        lastSignal: null,
        chosen: false
      };
    });
    const stratMap = new Map(strategiesInfo.map(it => [it.id, it]));

    const emaGateCfg = CFG.emaGate || {};
    const emaGateInfo = {
      enabled: !!emaGateCfg.enabled,
      divisor: emaGateCfg.divisor ?? null,
      directional: emaGateCfg.directional ?? null,
      minDistATR: emaGateCfg.minDistATR ?? null,
      slopeMin: emaGateCfg.slopeMin ?? null,
      allowBuy: emaGateCfg.enabled ? emaGateAllows('BUY', ctx, emaGateCfg) : null,
      allowSell: emaGateCfg.enabled ? emaGateAllows('SELL', ctx, emaGateCfg) : null,
      blocked: [],
      lastDecision: null
    };

    const baseRetest = getTuning(CFG, 'retestBreakoutBuy');
    const fastPeriod = baseRetest.emaFast ?? 20;
    const slowPeriod = baseRetest.emaSlow ?? 50;
    const metrics = {
      emaFast: ctx.ema?.[fastPeriod],
      emaFastPeriod: fastPeriod,
      emaSlow: ctx.ema?.[slowPeriod],
      emaSlowPeriod: slowPeriod,
      ema20: ctx.e20,
      ema50: ctx.e50,
      slopeFast: ctx.slope?.[fastPeriod] ?? ctx.slope20 ?? 0,
      slopeFastPeriod: fastPeriod,
      slope20: ctx.slope20,
      atrN: ctx.atrN,
      distFast: ctx.dist?.[fastPeriod] ?? ctx.distE20,
      distPeriod: fastPeriod,
      distE20: ctx.distE20,
      volume: ctx.vNow,
      vAvg20: ctx.vAvg20
    };

    const thresholds = {
      slopeLoose: CFG.slopeLoose ?? 0.0007,
      distRelaxAdd: CFG.distE20RelaxAdd ?? 0.10,
      perStrategy: thresholdsRaw.perStrategy || {},
      retest: baseRetest,
      retestPeriods: { fast: fastPeriod, slow: slowPeriod }
    };
    thresholds.slopeMin = baseRetest.slopeMin ?? 0.001;
    thresholds.distMax = baseRetest.distMax ?? 1.0;
    thresholds.atrMedMin = baseRetest.atrMin ?? 0.004;
    thresholds.atrHiMax = baseRetest.atrMax ?? 0.020;
    const rangeTune = getTuning(CFG, 'rangeBreakout');
    thresholds.atrMedMax = rangeTune.atrMax ?? thresholds.atrHiMax;
    const trendTune = getTuning(CFG, 'trendlineRejection');
    thresholds.atrLowCut = trendTune.atrMin ?? 0.0035;

    const analysis = {
      timestamp: Date.now(),
      symbol,
      candles: candles.length,
      relaxActive,
      relaxAuto,
      relaxSince: ORCH.relaxSince,
      activeByScene: [...activeByScene],
      finalActives: [...finalActives],
      guardResults,
      metrics,
      thresholds,
      strategies: strategiesInfo,
      emaGate: emaGateInfo,
      regime: regimeAgree(symbol, S, CFG),
      candleTs: ctx.L?.t ?? ctx.L?.T ?? null
    };

    // Percorre PIPE na ordem, mas chamando apenas as ativas finais
    for (const p of PIPE){
      const id = p.id;
      if (!finalActives.includes(id)) continue;

      const mod = STRATS_MAP[id];
      if (!mod || typeof mod.detect !== "function") continue;

      const emaGateFn = (_sym, side) => emaGateAllows(side, ctx, CFG.emaGate);
      const hit = mod.detect({
        symbol,
        S,
        CFG,
        candles,
        ctx,
        utils: { strongBull, strongBear },
        emaGateOk: emaGateFn,
        regimeAgreeDetailed: (sym) => regimeAgree(sym || symbol, S, CFG)
      });
      const stratEntry = stratMap.get(id);
      if (stratEntry && hit && hit.side){
        stratEntry.lastSignal = hit.side;
      }
      if (!hit || !hit.side) continue;

      // EMA Gate global (opcional)
      const gateOK = emaGateAllows(hit.side, ctx, CFG.emaGate);
      if (stratEntry) stratEntry.gateOk = gateOK;
      if (!gateOK){
        if (stratEntry) stratEntry.gateBlocked = true;
        const blockedLabel = stratEntry ? `${stratEntry.name} (${hit.side})` : `${toTitleCase(id)} (${hit.side})`;
        emaGateInfo.blocked.push(blockedLabel);
        emaGateInfo.lastDecision = `Bloqueado ${hit.side}`;
        continue;
      }
      emaGateInfo.lastDecision = `Liberado ${hit.side}`;

      const strategyId = mod.id || id;
      const strategyName = (CFG.strategies?.[strategyId]?.name) || mod.name || strategyId;

      const chosen = { side: hit.side, strategyId, strategyName, relax: relaxActive };
      analysis.chosen = { ...chosen };
      if (stratEntry){
        stratEntry.chosen = true;
        stratEntry.activeFinal = true;
        stratEntry.lastSignal = hit.side;
      }

      return {
        chosen,
        activeList: finalActives,
        relaxActive,
        analysis
      };
    }

    return { chosen:null, activeList: finalActives, relaxActive, analysis };
  }catch(e){
    console.error("[orchestrator] evaluate error:", e);
    return {
      chosen: null,
      activeList: [],
      relaxActive: false,
      analysis: {
        timestamp: Date.now(),
        symbol,
        error: e?.message || String(e)
      }
    };
  }
}
