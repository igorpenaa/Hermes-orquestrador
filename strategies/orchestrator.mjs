// strategies/orchestrator.mjs
// Orquestrador de estratégias: guards por cenário, Relax mode e EMA Gate direcional
// Não depende do DOM. Usa apenas S (state), CFG e candles do M1.

import { computeAdx, computeAtrSeries, computeBollingerWidth, computePercentile, computeAnchoredVwap, percentileRank } from './indicators.mjs';

function emaSeries(values, len){
  const k = 2/(len+1);
  let p = null;
  return values.map(v => (p = (p==null ? v : v*k + p*(1-k))));
}
function slope(series, n=8){
  if (!Array.isArray(series) || series.length < 3) return 0;
  const pivot = series.length - 2; // usa a vela fechada mais recente
  if (pivot < 1) return 0;
  const lookback = Math.max(1, Math.min(Math.floor(n), pivot));
  const a = series[pivot], b = series[pivot - lookback];
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

function isConditionDisabled(toggles, strategyId, index){
  if (!toggles || !strategyId) return false;
  const bucket = toggles[strategyId];
  if (!bucket) return false;
  const key = String(index);
  if (Object.prototype.hasOwnProperty.call(bucket, key)) return !!bucket[key];
  const alt = String(Number(index));
  return Object.prototype.hasOwnProperty.call(bucket, alt) ? !!bucket[alt] : false;
}
function toTitleCase(str){
  return String(str || '').replace(/[-_]+/g,' ').replace(/\s+/g,' ').trim().replace(/\b\w/g, x => x.toUpperCase());
}

const DEFAULT_TUNINGS = {
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
    distMinAtr: 0.1,
    distMaxAtr: 1.9,
    adxMax: 38,
    wickMin: 0.25,
    volMult: 0.7,
    sessionMinutes: 1440
  },
  weaveVwapRevert: {
    adx5Max: 18,
    bbwPctMax: 55,
    atrMin: 0.0020,
    atrMax: 0.0050,
    distVwapXatr: 0.90,
    pavioMin: 0.25,
    volXVma: 0.65,
    gapEma950Max: 0.00022,
    filterDirection: false,
    tp1Xatr: 0.6,
    tp2Target: 'VWAP',
    stopXatr: 1.3,
    sessionMinutes: 1440,
    emaFast: 9,
    emaSlow: 50,
    emaPeriod: 100,
    emaTrend: 200
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
    slopePeriod: 14,
    atrMin: 0.0025,
    atrMax: 0.0180,
    slopeAbsMax: 0.0035
  },
  rangeBreakout: {
    slopePeriod: 20,
    atrMin: 0.0040,
    atrMax: 0.0150,
    slopeAbsMin: 0.0005
  },
  gapRejection: {},
  weaveVwapRevert: {
    adx5_max: 18,
    bbw_pct_max: 55,
    atr_min: 0.0020,
    atr_max: 0.0050,
    dist_vwap_xatr: 0.90,
    pavio_min: 0.25,
    vol_xvma: 0.65,
    gap_ema9_50_max: 0.00022,
    tp1_xatr: 0.6,
    tp2_target: "VWAP",
    stop_xatr: 1.3
  },
  tripleLevel: {
    emaPeriod: 14,
    atrMin: 0.0025,
    atrMax: 0.0240,
    distMax: 1.7
  },
  trendlineRejection: {
    emaPeriod: 14,
    atrMin: 0.0020,
    distMax: 1.7
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
  },
  buySniper1m: {
    emaFast: 9,
    emaSlow: 21,
    emaTrend: 50,
    slopeMin: 0.0002,
    slopeSlowMin: 0.00015,
    emaGapMin: 0.0005,
    atrMinMult: 0.0018,
    rsiTrigger: 50,
    rsiPreTrigger: 48,
    rsiMax: 75,
    volumeMinMult: 0.8,
    volumeSpikeMax: 3.5
  },
  sellSniper1m: {
    emaFast: 9,
    emaSlow: 21,
    emaTrend: 50,
    slopeMin: -0.00004,
    slopeSlowMin: -0.00003,
    emaGapMin: 0.00018,
    atrMinMult: 0.0008,
    rsiTrigger: 54,
    rsiPreTrigger: 53,
    rsiMin: 18,
    bodyStrength: 0.4,
    volumeMinMult: 0.5,
    volumeSpikeMax: 5.0,
    touchTolerancePct: 0.0018,
    breakTolerancePct: 0.00025
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
    if (tune.emaSlow) { periods.add(tune.emaSlow); slopePeriods.add(tune.emaSlow); }
    if (tune.emaPeriod) { periods.add(tune.emaPeriod); slopePeriods.add(tune.emaPeriod); }
    if (tune.slopePeriod) { periods.add(tune.slopePeriod); slopePeriods.add(tune.slopePeriod); }
    if (tune.emaTrend) periods.add(tune.emaTrend);
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
    if (series) {
      const lookback = Math.max(1, Math.floor(period));
      slopeMap[period] = slope(series, lookback);
    }
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
function evaluateGuards(ctx, relax, CFG, symbol, S){
  const slopeLoose = CFG.slopeLoose ?? 0.0007;
  const distAdd    = CFG.distE20RelaxAdd ?? 0.10;
  const results    = {};
  const perStrategy = {};

  const slopeAbsDefault = Math.abs(ctx.slope20 ?? 0);
  const base1 = symbol ? `${symbol}_${CFG.tfExec}` : null;
  const tfA = CFG.tfRegA || '5m';
  const base5 = symbol ? `${symbol}_${tfA}` : null;
  const candles1 = base1 ? (S?.candles?.[base1] || []) : [];
  const candles5 = base5 ? (S?.candles?.[base5] || []) : [];
  const adx5Val = candles5.length ? (computeAdx(candles5, 14)?.adx ?? null) : null;
  const priceRef = ctx?.L?.c ?? null;
  const ema20_1m = ctx?.ema?.[20];
  const ema50_1m = ctx?.ema?.[50];
  const emaGap1m = (ema20_1m != null && ema50_1m != null && priceRef)
    ? Math.abs(ema20_1m - ema50_1m) / Math.max(1e-9, priceRef)
    : null;
  const volumeRatioCtx = (ctx?.vNow != null && ctx?.vAvg20)
    ? ctx.vNow / Math.max(1e-9, ctx.vAvg20)
    : null;
  const atrRaw1m = base1 ? (S?.atr?.[`${base1}_atr14`] ?? null) : null;

  (function(){
    const tune = getTuning(CFG, 'aOrbAvwapRegime');
    const sessionMinutes = tune.sessionMinutes ?? 1440;
    const orMinutes = tune.orMinutes ?? 15;
    let atrAvailable = false;
    let orAvailable = false;
    let vwapAvailable = false;
    if (candles1.length){
      atrAvailable = atrRaw1m != null && atrRaw1m > 0;
      const ms = sessionMinutes * 60 * 1000;
      const lastTs = candles1[candles1.length - 1]?.t ?? null;
      const startTs = lastTs != null ? Math.floor(lastTs / ms) * ms : null;
      if (startTs != null){
        const endTs = startTs + orMinutes * 60 * 1000;
        const slice = candles1.filter(c => c.t >= startTs && c.t < endTs);
        if (slice.length){
          const hi = Math.max(...slice.map(c => c.h));
          const lo = Math.min(...slice.map(c => c.l));
          orAvailable = Number.isFinite(hi) && Number.isFinite(lo) && (hi - lo) > 0;
        }
        const avwap = computeAnchoredVwap(candles1, startTs);
        vwapAvailable = avwap != null;
      }
    }
    perStrategy.aOrbAvwapRegime = { ...tune };
    results.aOrbAvwapRegime = guardResult([
      cond('ATR disponível', atrAvailable, { actual: atrRaw1m, digits: 6 }),
      cond(`Opening Range (${orMinutes}m) detectada`, orAvailable),
      cond('AVWAP disponível', vwapAvailable),
      cond('ADX5 disponível', adx5Val != null, { actual: adx5Val, digits: 2 })
    ], { relaxApplied: relax, tune });
  })();

  (function(){
    const tune = getTuning(CFG, 'buySniper1m');
    const emaFast = tune.emaFast ?? 9;
    const emaSlow = tune.emaSlow ?? 21;
    const slopeFast = ctx.slope?.[emaFast] ?? 0;
    const slopeSlow = ctx.slope?.[emaSlow] ?? 0;
    const emaFastVal = ctx.ema?.[emaFast];
    const emaSlowVal = ctx.ema?.[emaSlow];
    const priceRef = ctx?.L?.c ?? null;
    const gap = (priceRef && emaFastVal != null && emaSlowVal != null)
      ? Math.abs(emaFastVal - emaSlowVal) / Math.max(1e-9, priceRef)
      : null;
    const atrMin = tune.atrMinMult ?? 0.0018;
    const volMin = Number.isFinite(tune.volumeMinMult) ? tune.volumeMinMult : 0;
    const volMax = Number.isFinite(tune.volumeSpikeMax) ? tune.volumeSpikeMax : 10;
    const volRatio = (ctx?.vNow != null && ctx?.vAvg20)
      ? ctx.vNow / Math.max(1e-9, ctx.vAvg20)
      : null;
    perStrategy.buySniper1m = { ...tune };
    results.buySniper1m = guardResult([
      cond(`EMA${emaFast} > EMA${emaSlow}`, emaFastVal != null && emaSlowVal != null && emaFastVal > emaSlowVal, {
        actual: emaFastVal,
        expected: emaSlowVal,
        comparator: '>'
      }),
      cond(`Slope EMA${emaFast} ≥ ${fmt(tune.slopeMin ?? 0, 5)}`, slopeFast >= (tune.slopeMin ?? 0), {
        actual: slopeFast,
        expected: tune.slopeMin ?? 0,
        comparator: '≥',
        digits: 5
      }),
      cond(`Slope EMA${emaSlow} ≥ ${fmt((tune.slopeSlowMin ?? tune.slopeMin) ?? 0, 5)}`,
        slopeSlow >= ((tune.slopeSlowMin ?? tune.slopeMin) ?? 0), {
          actual: slopeSlow,
          expected: (tune.slopeSlowMin ?? tune.slopeMin) ?? 0,
          comparator: '≥',
          digits: 5
        }),
      cond(`Gap EMA ≥ ${fmt(tune.emaGapMin ?? 0, 5)}`, gap != null && gap >= (tune.emaGapMin ?? 0), {
        actual: gap,
        expected: tune.emaGapMin ?? 0,
        comparator: '≥',
        digits: 5
      }),
      cond(`ATRₙ ≥ ${fmt(atrMin, 5)}`, ctx.atrN != null && ctx.atrN >= atrMin, {
        actual: ctx.atrN,
        expected: atrMin,
        comparator: '≥',
        digits: 5
      }),
      cond(`Volume ratio entre ${fmt(volMin, 2)} e ${fmt(volMax, 2)}`,
        volRatio == null || (volRatio >= volMin && volRatio <= volMax), {
          actual: volRatio,
          expected: `${fmt(volMin, 2)}-${fmt(volMax, 2)}`,
          comparator: '∈'
        })
    ], { relaxApplied: relax, tune });
  })();

  (function(){
    const tune = getTuning(CFG, 'sellSniper1m');
    const emaFast = tune.emaFast ?? 9;
    const emaSlow = tune.emaSlow ?? 21;
    const slopeFast = ctx.slope?.[emaFast] ?? 0;
    const slopeSlow = ctx.slope?.[emaSlow] ?? 0;
    const emaFastVal = ctx.ema?.[emaFast];
    const emaSlowVal = ctx.ema?.[emaSlow];
    const priceRef = ctx?.L?.c ?? null;
    const gap = (priceRef && emaFastVal != null && emaSlowVal != null)
      ? Math.abs(emaFastVal - emaSlowVal) / Math.max(1e-9, priceRef)
      : null;
    const atrMin = tune.atrMinMult ?? 0.0018;
    const volMin = Number.isFinite(tune.volumeMinMult) ? tune.volumeMinMult : 0;
    const volMax = Number.isFinite(tune.volumeSpikeMax) ? tune.volumeSpikeMax : 10;
    const volRatio = (ctx?.vNow != null && ctx?.vAvg20)
      ? ctx.vNow / Math.max(1e-9, ctx.vAvg20)
      : null;
    perStrategy.sellSniper1m = { ...tune };
    results.sellSniper1m = guardResult([
      cond(`EMA${emaFast} < EMA${emaSlow}`, emaFastVal != null && emaSlowVal != null && emaFastVal < emaSlowVal, {
        actual: emaFastVal,
        expected: emaSlowVal,
        comparator: '<'
      }),
      cond(`Slope EMA${emaFast} ≤ ${fmt(tune.slopeMin ?? 0, 5)}`, slopeFast <= (tune.slopeMin ?? 0), {
        actual: slopeFast,
        expected: tune.slopeMin ?? 0,
        comparator: '≤',
        digits: 5
      }),
      cond(`Slope EMA${emaSlow} ≤ ${fmt((tune.slopeSlowMin ?? tune.slopeMin) ?? 0, 5)}`,
        slopeSlow <= ((tune.slopeSlowMin ?? tune.slopeMin) ?? 0), {
          actual: slopeSlow,
          expected: (tune.slopeSlowMin ?? tune.slopeMin) ?? 0,
          comparator: '≤',
          digits: 5
        }),
      cond(`Gap EMA ≥ ${fmt(tune.emaGapMin ?? 0, 5)}`, gap != null && gap >= (tune.emaGapMin ?? 0), {
        actual: gap,
        expected: tune.emaGapMin ?? 0,
        comparator: '≥',
        digits: 5
      }),
      cond(`ATRₙ ≥ ${fmt(atrMin, 5)}`, ctx.atrN != null && ctx.atrN >= atrMin, {
        actual: ctx.atrN,
        expected: atrMin,
        comparator: '≥',
        digits: 5
      }),
      cond(`Volume ratio entre ${fmt(volMin, 2)} e ${fmt(volMax, 2)}`,
        volRatio == null || (volRatio >= volMin && volRatio <= volMax), {
          actual: volRatio,
          expected: `${fmt(volMin, 2)}-${fmt(volMax, 2)}`,
          comparator: '∈'
        })
    ], { relaxApplied: relax, tune });
  })();

  (function(){
    const tune = getTuning(CFG, 'emaFlowScalper21');
    const atrN = ctx?.atrN ?? null;
    const gapMin = tune.emaGapMin ?? 0;
    perStrategy.emaFlowScalper21 = { ...tune };
    results.emaFlowScalper21 = guardResult([
      cond(`ADX5 ≥ ${fmt(tune.adxMin ?? 0, 2)}`, adx5Val != null && adx5Val >= (tune.adxMin ?? 0), { actual: adx5Val, expected: tune.adxMin, comparator: '≥', digits: 2 }),
      cond(`ATRₙ ≥ ${fmt(tune.atrNMin ?? 0, 4)}`, atrN != null && atrN >= (tune.atrNMin ?? 0), { actual: atrN, expected: tune.atrNMin, comparator: '≥', digits: 4 }),
      cond(`Gap EMA20-EMA50 ≥ ${fmt(gapMin, 4)}`, emaGap1m != null && emaGap1m >= gapMin, { actual: emaGap1m, expected: gapMin, comparator: '≥', digits: 4 }),
      cond(`Volume ×VMA20 ≥ ${fmt(tune.volMult ?? 0, 2)}`, volumeRatioCtx == null || volumeRatioCtx >= (tune.volMult ?? 0), { actual: volumeRatioCtx, expected: tune.volMult, comparator: '≥', digits: 2 })
    ], { relaxApplied: relax, tune });
  })();

  (function(){
    const tune = getTuning(CFG, 'breakoutRetestPro');
    const lookback = Math.max(5, Math.floor(tune.lookback ?? 30));
    const enoughHistory = candles1.length >= (lookback + 5);
    const vAvg = ctx?.vAvg20 ?? null;
    perStrategy.breakoutRetestPro = { ...tune };
    results.breakoutRetestPro = guardResult([
      cond('ATR disponível', atrRaw1m != null && atrRaw1m > 0, { actual: atrRaw1m, digits: 6 }),
      cond(`Histórico ≥ ${lookback}`, enoughHistory, { actual: candles1.length, expected: lookback, comparator: '≥' }),
      cond('VMA20 disponível', vAvg != null && vAvg > 0, { actual: vAvg, digits: 2 })
    ], { relaxApplied: relax, tune });
  })();

  (function(){
    const tune = getTuning(CFG, 'vwapPrecisionBounce');
    const atrOk = atrRaw1m != null && atrRaw1m > 0;
    const adxMax = tune.adxMax ?? 30;
    perStrategy.vwapPrecisionBounce = { ...tune };
    results.vwapPrecisionBounce = guardResult([
      cond('ATR disponível', atrOk, { actual: atrRaw1m, digits: 6 }),
      cond(`ADX5 ≤ ${fmt(adxMax, 2)}`, adx5Val != null && adx5Val <= adxMax, { actual: adx5Val, expected: adxMax, comparator: '≤', digits: 2 }),
      cond('Histórico ≥ 20 velas', candles1.length >= 20, { actual: candles1.length, expected: 20, comparator: '≥' })
    ], { relaxApplied: relax, tune });
  })();

  (function(){
    const tune = getTuning(CFG, 'weaveVwapRevert');
    const price = ctx?.L?.c ?? null;
    const atrPct = (price && atrRaw1m != null && atrRaw1m > 0) ? atrRaw1m / Math.max(1e-9, price) : null;
    const closes = candles1.map(c => c.c).filter(v => Number.isFinite(v));
    const ema9 = closes.length ? last(emaSeries(closes, 9)) : null;
    const ema20 = closes.length ? last(emaSeries(closes, 20)) : null;
    const ema50 = closes.length ? last(emaSeries(closes, 50)) : null;
    const ema100 = closes.length ? last(emaSeries(closes, 100)) : null;
    const ema200 = closes.length ? last(emaSeries(closes, 200)) : null;
    const gap95 = (price && ema9 != null && ema50 != null)
      ? Math.abs(ema9 - ema50) / Math.max(1e-9, price)
      : null;
    let clusterRange = null;
    if (price && [ema9, ema20, ema50, ema100, ema200].every(v => Number.isFinite(v))){
      const vals = [ema9, ema20, ema50, ema100, ema200];
      clusterRange = (Math.max(...vals) - Math.min(...vals)) / Math.max(1e-9, price);
    }
    let vwap = null;
    if (candles1.length){
      const lastCandle = candles1[candles1.length - 1];
      const sessionMinutes = tune.sessionMinutes ?? 1440;
      const anchorMs = Math.floor((lastCandle?.t ?? 0) / (sessionMinutes * 60 * 1000)) * (sessionMinutes * 60 * 1000);
      vwap = computeAnchoredVwap(candles1, anchorMs);
    }
    const distVwap = (price != null && vwap != null && atrRaw1m != null && atrRaw1m > 0)
      ? Math.abs(price - vwap) / atrRaw1m
      : null;
    let widthInfo = { current: null, threshold: null };
    if (candles1.length >= 40){
      const widths = [];
      for (let i = 20; i <= candles1.length; i += 1){
        const slice = candles1.slice(i - 20, i);
        const bw = computeBollingerWidth(slice, 20, 2);
        if (bw && bw.width != null) widths.push(bw.width);
      }
      if (widths.length){
        const currentWidth = widths[widths.length - 1];
        const limitPct = Math.max(0, Math.min(100, tune.bbw_pct_max ?? 55));
        const threshold = computePercentile(widths, limitPct);
        widthInfo = { current: currentWidth, threshold };
      }
    }
    const adxInput = candles1.length ? candles1.slice(-120) : [];
    const adxLocal = adxInput.length > 10 ? computeAdx(adxInput, 5) : null;
    const adxValue = adxLocal?.adx ?? null;
    const adxLimit = tune.adx5_max ?? 20;
    const atrMin = tune.atr_min ?? 0;
    const atrMax = tune.atr_max ?? Infinity;
    const distMin = tune.dist_vwap_xatr ?? 0.9;
    const volMin = tune.vol_xvma ?? 0.6;
    const gapMax = tune.gap_ema9_50_max ?? 0.00025;
    const clusterMax = gapMax * 2.4;
    const currentWidth = widthInfo.current;
    const widthThreshold = widthInfo.threshold;
    const widthOk = currentWidth != null && widthThreshold != null ? currentWidth <= widthThreshold : false;
    perStrategy.weaveVwapRevert = { ...tune };
    results.weaveVwapRevert = guardResult([
      cond('ATR disponível', atrRaw1m != null && atrRaw1m > 0, { actual: atrRaw1m, digits: 6 }),
      cond(`ATR% entre ${fmt(atrMin, 4)} e ${fmt(atrMax, 4)}`, atrPct != null && atrPct >= atrMin && atrPct <= atrMax, {
        actual: atrPct,
        expected: `${fmt(atrMin, 4)}-${fmt(atrMax, 4)}`,
        comparator: '∈',
        digits: 4
      }),
      cond(`ADX5 ≤ ${fmt(adxLimit, 2)}`, adxValue == null || adxValue <= adxLimit, {
        actual: adxValue,
        expected: adxLimit,
        comparator: '≤',
        digits: 2
      }),
      cond(`Gap EMA9-50 ≤ ${fmt(gapMax, 6)}`, gap95 != null && gap95 <= gapMax, {
        actual: gap95,
        expected: gapMax,
        comparator: '≤',
        digits: 6
      }),
      cond('EMAs aglomeradas', clusterRange != null && clusterRange <= clusterMax, {
        actual: clusterRange,
        expected: clusterMax,
        comparator: '≤',
        digits: 6
      }),
      cond('Compressão BBWidth dentro do percentil alvo', widthOk, {
        actual: currentWidth,
        expected: widthThreshold,
        comparator: '≤',
        digits: 6
      }),
      cond(`Distância VWAP ≥ ${fmt(distMin, 2)}×ATR`, distVwap != null && distVwap >= distMin, {
        actual: distVwap,
        expected: distMin,
        comparator: '≥',
        digits: 2
      }),
      cond(`Volume ×VMA20 ≥ ${fmt(volMin, 2)}`, volumeRatioCtx == null || volumeRatioCtx >= volMin, {
        actual: volumeRatioCtx,
        expected: volMin,
        comparator: '≥',
        digits: 2
      })
    ], {
      relaxApplied: relax,
      tune,
      metrics: {
        atrPct,
        distVwap,
        width: currentWidth,
        widthThreshold,
        gap95,
        clusterRange,
        adx: adxValue
      }
    });
  })();

  (function(){
    const tune = getTuning(CFG, 'liquiditySweepReversal');
    const adxMax = tune.adxMax ?? 27;
    const lookback = Math.max(10, Math.floor(tune.lookback ?? 30));
    perStrategy.liquiditySweepReversal = { ...tune };
    results.liquiditySweepReversal = guardResult([
      cond(`ADX5 ≤ ${fmt(adxMax, 2)}`, adx5Val != null && adx5Val <= adxMax, { actual: adx5Val, expected: adxMax, comparator: '≤', digits: 2 }),
      cond(`Histórico ≥ ${lookback}`, candles1.length >= lookback + 5, { actual: candles1.length, expected: lookback, comparator: '≥' })
    ], { relaxApplied: relax, tune });
  })();

  (function(){
    const tune = getTuning(CFG, 'atrSqueezeBreak');
    const atrSeries = candles1.length ? computeAtrSeries(candles1, 14) : [];
    const closes = candles1.slice(-atrSeries.length).map(c => c.c);
    const atrNormSeries = atrSeries.map((atr, idx) => {
      const close = closes[idx];
      if (!close) return null;
      return atr / close;
    }).filter(v => v != null);
    const atrLookback = Math.min(atrNormSeries.length, Math.max(10, Math.floor(tune.atrLookback ?? 200)));
    const atrSlice = atrNormSeries.slice(-atrLookback);
    const atrThresh = atrSlice.length ? computePercentile(atrSlice, tune.atrPercentile ?? 35) : null;
    const atrCurrent = atrSlice.length ? atrSlice[atrSlice.length - 1] : null;
    const atrOk = atrCurrent != null && atrThresh != null && atrCurrent <= atrThresh;

    const bbwCurrent = computeBollingerWidth(candles1, 20, 2);
    const bbwSeries = [];
    if (candles1.length >= 20){
      for (let i = 20; i <= candles1.length; i += 1){
        const slice = candles1.slice(i - 20, i);
        const res = computeBollingerWidth(slice, 20, 2);
        if (res) bbwSeries.push(res.width);
      }
    }
    const bbwThresh = bbwSeries.length ? computePercentile(bbwSeries, tune.bbwPercentile ?? 35) : null;
    const bbwOk = bbwCurrent && bbwThresh != null && bbwCurrent.width <= bbwThresh;
    perStrategy.atrSqueezeBreak = { ...tune };
    results.atrSqueezeBreak = guardResult([
      cond('ATRₙ em compressão', atrOk, { actual: atrCurrent, expected: atrThresh, comparator: '≤', digits: 4 }),
      cond('Bandas comprimidas', bbwOk, { actual: bbwCurrent ? bbwCurrent.width : null, expected: bbwThresh, comparator: '≤', digits: 4 })
    ], { relaxApplied: relax, tune });
  })();

  function distInfo(period, base){
    const baseVal = base != null ? base : 1.0;
    const distVal = ctx.dist?.[period] ?? ctx.distE20 ?? Infinity;
    const limit   = baseVal + (relax ? distAdd : 0);
    return { distVal, limit, base: baseVal };
  }

  // Aquila Alpinista (BUY momentum)
  (function(){
    const tune = getTuning(CFG, 'alpinista');
    const emaFast = tune.emaFast ?? 20;
    const emaSlow = tune.emaSlow ?? 50;
    const slopeBase = tune.slopeMin ?? 0.0012;
    const slopeReq = relax ? Math.min(slopeLoose, slopeBase) : slopeBase;
    const lookback = Math.max(3, Math.floor(tune.lookback ?? 6));
    const baseStrong = Math.ceil(lookback * 0.6);
    const minStrongBase = Math.max(2, Math.floor(tune.minStrong ?? baseStrong));
    const minStrongReq = relax ? Math.max(2, minStrongBase - 1) : minStrongBase;
    const bodyStrength = tune.bodyStrength ?? 0.55;
    const seq = (ctx.C || []).slice(-lookback-1, -1);
    const seqOk = seq.length >= lookback;
    const strongCount = seq.filter(c => strongBull(c, bodyStrength)).length;
    const stairUp = seqOk && seq.every((c, idx) => idx === 0 || (c.l > seq[idx-1].l && c.c > seq[idx-1].c));
    const emaFastVal = ctx.ema?.[emaFast];
    const emaSlowVal = ctx.ema?.[emaSlow];
    const slopeVal = ctx.slope?.[emaFast] ?? ctx.slope20 ?? 0;
    const atrMin = tune.atrMin ?? 0.0045;
    const atrMax = tune.atrMax ?? 0.0280;
    const { distVal, limit: distMax } = distInfo(emaFast, tune.distMax);
    const volReqBase = tune.volMult ?? 0;
    const volReq = relax ? Math.max(0, volReqBase - 0.1) : volReqBase;
    const volRatio = (ctx.vNow != null && ctx.vAvg20)
      ? ctx.vNow / Math.max(1e-9, ctx.vAvg20)
      : null;
    perStrategy.alpinista = { ...tune, minStrong: minStrongReq, slopeMin: slopeReq, volMult: volReq };
    results.alpinista = guardResult([
      cond(`EMA${emaFast} > EMA${emaSlow}`, emaFastVal > emaSlowVal, { actual: emaFastVal, expected: emaSlowVal, comparator: '>', digits: 4 }),
      cond(`Slope${emaFast} ≥ ${fmt(slopeReq, 4)}`, slopeVal >= slopeReq, { actual: slopeVal, expected: slopeReq, comparator: '≥', digits: 4 }),
      cond(`Escalada ${strongCount}/${minStrongReq}`, seqOk && stairUp && strongCount >= minStrongReq, {
        extra: `SeqOk=${seqOk ? 'Sim' : 'Não'} • Escada=${stairUp ? 'Sim' : 'Não'}`
      }),
      cond(`ATRₙ ≥ ${fmt(atrMin, 4)}`, ctx.atrN >= atrMin, { actual: ctx.atrN, expected: atrMin, comparator: '≥', digits: 4 }),
      cond(`ATRₙ ≤ ${fmt(atrMax, 4)}`, ctx.atrN <= atrMax, { actual: ctx.atrN, expected: atrMax, comparator: '≤', digits: 4 }),
      cond(`Dist. EMA${emaFast} ≤ ${fmt(distMax, 3)}`, distVal <= distMax, { actual: distVal, expected: distMax, comparator: '≤', digits: 3 }),
      cond(`Volume ≥ ${fmt(volReq, 2)}×VMA20`, volRatio == null || volRatio >= volReq, { actual: volRatio, expected: volReq, comparator: '≥', digits: 2 })
    ], { relaxApplied: relax, tune: { ...tune, minStrong: minStrongReq, slopeMin: slopeReq, volMult: volReq } });
  })();

  // Boreal Bagjump (SELL momentum)
  (function(){
    const tune = getTuning(CFG, 'bagjump');
    const emaFast = tune.emaFast ?? 20;
    const emaSlow = tune.emaSlow ?? 50;
    const slopeBase = tune.slopeMin ?? 0.0012;
    const slopeReq = relax ? Math.min(slopeLoose, slopeBase) : slopeBase;
    const lookback = Math.max(3, Math.floor(tune.lookback ?? 6));
    const baseStrong = Math.ceil(lookback * 0.6);
    const minStrongBase = Math.max(2, Math.floor(tune.minStrong ?? baseStrong));
    const minStrongReq = relax ? Math.max(2, minStrongBase - 1) : minStrongBase;
    const bodyStrength = tune.bodyStrength ?? 0.55;
    const seq = (ctx.C || []).slice(-lookback-1, -1);
    const seqOk = seq.length >= lookback;
    const strongCount = seq.filter(c => strongBear(c, bodyStrength)).length;
    const stairDown = seqOk && seq.every((c, idx) => idx === 0 || (c.h < seq[idx-1].h && c.c < seq[idx-1].c));
    const emaFastVal = ctx.ema?.[emaFast];
    const emaSlowVal = ctx.ema?.[emaSlow];
    const slopeVal = ctx.slope?.[emaFast] ?? ctx.slope20 ?? 0;
    const atrMin = tune.atrMin ?? 0.0045;
    const atrMax = tune.atrMax ?? 0.0280;
    const { distVal, limit: distMax } = distInfo(emaFast, tune.distMax);
    const volReqBase = tune.volMult ?? 0;
    const volReq = relax ? Math.max(0, volReqBase - 0.1) : volReqBase;
    const volRatio = (ctx.vNow != null && ctx.vAvg20)
      ? ctx.vNow / Math.max(1e-9, ctx.vAvg20)
      : null;
    perStrategy.bagjump = { ...tune, minStrong: minStrongReq, slopeMin: slopeReq, volMult: volReq };
    results.bagjump = guardResult([
      cond(`EMA${emaFast} < EMA${emaSlow}`, emaFastVal < emaSlowVal, { actual: emaFastVal, expected: emaSlowVal, comparator: '<', digits: 4 }),
      cond(`Slope${emaFast} ≤ -${fmt(slopeReq, 4)}`, slopeVal <= -slopeReq, { actual: slopeVal, expected: -slopeReq, comparator: '≤', digits: 4 }),
      cond(`Queda ${strongCount}/${minStrongReq}`, seqOk && stairDown && strongCount >= minStrongReq, {
        extra: `SeqOk=${seqOk ? 'Sim' : 'Não'} • Escada=${stairDown ? 'Sim' : 'Não'}`
      }),
      cond(`ATRₙ ≥ ${fmt(atrMin, 4)}`, ctx.atrN >= atrMin, { actual: ctx.atrN, expected: atrMin, comparator: '≥', digits: 4 }),
      cond(`ATRₙ ≤ ${fmt(atrMax, 4)}`, ctx.atrN <= atrMax, { actual: ctx.atrN, expected: atrMax, comparator: '≤', digits: 4 }),
      cond(`Dist. EMA${emaFast} ≤ ${fmt(distMax, 3)}`, distVal <= distMax, { actual: distVal, expected: distMax, comparator: '≤', digits: 3 }),
      cond(`Volume ≥ ${fmt(volReq, 2)}×VMA20`, volRatio == null || volRatio >= volReq, { actual: volRatio, expected: volReq, comparator: '≥', digits: 2 })
    ], { relaxApplied: relax, tune: { ...tune, minStrong: minStrongReq, slopeMin: slopeReq, volMult: volReq } });
  })();

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

  const toggles = CFG.guardToggles || {};
  Object.entries(results).forEach(([id, guard])=>{
    if (!guard || !Array.isArray(guard.conditions)) return;
    guard.conditions = guard.conditions.map((cond, idx)=>{
      const disabledToggle = isConditionDisabled(toggles, id, idx);
      const disabled = (cond && cond.disabled) || disabledToggle;
      const pass = disabled ? true : !!(cond && cond.pass);
      return { ...cond, pass, disabled, index: idx };
    });
    guard.ok = guard.conditions.every(c => c.pass);
    guard.disabledCount = guard.conditions.filter(c => c.disabled).length;
  });

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
  { id:'aOrbAvwapRegime'     },
  { id:'emaFlowScalper21'    },
  { id:'buySniper1m'         },
  { id:'sellSniper1m'        },
  { id:'breakoutRetestPro'   },
  { id:'weaveVwapRevert'     },
  { id:'vwapPrecisionBounce' },
  { id:'weaveVwapRevert'     },
  { id:'liquiditySweepReversal' },
  { id:'atrSqueezeBreak'     },
  { id:'alpinista'           },
  { id:'bagjump'             },
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

    const guardBundle   = evaluateGuards(ctx, ORCH.relaxMode, CFG, symbol, S) || {};
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
        chosen: false,
        detect: null
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

    const normalizeDetectInfo = (hit)=>{
      if (!hit){
        return { stage: 'waiting', side: null, reason: 'Nenhum gatilho detectado nesta vela' };
      }
      if (typeof hit !== 'object'){
        return { stage: 'waiting', side: null, reason: String(hit) };
      }
      const side = hit.side || null;
      const baseReason = hit.reason || (side ? 'Gatilho validado' : 'Sem gatilho filtrado');
      const info = {
        stage: side ? 'signal' : 'waiting',
        side,
        reason: baseReason,
        mode: hit.mode || null,
        score: hit.score != null ? hit.score : null,
        pending: !!hit.pending,
        entry: hit.entry != null ? hit.entry : null,
        stop: hit.stop != null ? hit.stop : null,
        targets: Array.isArray(hit.targets) ? hit.targets.slice(0, 3) : null
      };
      if (hit.sizeMultiplier != null) info.sizeMultiplier = hit.sizeMultiplier;
      if (hit.context && typeof hit.context === 'object'){ info.context = hit.context; }
      return info;
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
      if (stratEntry){
        stratEntry.detect = normalizeDetectInfo(hit);
      }
      if (stratEntry && hit && hit.side){
        stratEntry.lastSignal = hit.side;
      }
      if (!hit || !hit.side) continue;

      // EMA Gate global (opcional)
      const gateOK = emaGateAllows(hit.side, ctx, CFG.emaGate);
      if (stratEntry) stratEntry.gateOk = gateOK;
      if (!gateOK){
        if (stratEntry){
          stratEntry.gateBlocked = true;
          if (stratEntry.detect) stratEntry.detect.stage = 'blocked';
        }
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
        if (stratEntry.detect) stratEntry.detect.stage = 'executed';
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
