// strategies/rangeBreakout.mjs
// Range Breakout — detector de rompimentos com controle de slope/ATR e opção de ordem reversa

import { computeAtr } from './indicators.mjs';

const ID = "rangeBreakout";
const NAME = "Range Breakout";

const CONSTANTS = {
  breakoutEps: 0,
  lookbackBox: 16,
  minBars: 24,
  wickBodyRatioMin: 0.6,
  atrPeriod: 14,
};

const DEFAULTS = {
  periodoSlope: 14,
  slopeMin: 0.0002,
  atrMin: 0.0025,
  atrMax: 0.022,
  reverseOrder: false,
};

function buildSeries({ S, CFG, symbol }) {
  const base = `${symbol}_${CFG.tfExec}`;
  const candles = S.candles[base] || [];
  return candles.map(k => ({
    open: Number(k.o) || 0,
    high: Number(k.h) || 0,
    low: Number(k.l) || 0,
    close: Number(k.c) || 0,
  }));
}

function last(candles, offset = 0) {
  return candles[candles.length - 1 - offset];
}

function seriesSlope(values, lookback) {
  if (!Array.isArray(values) || values.length < 2) return 0;
  const end = values.length - 1;
  const prev = Math.max(0, end - Math.max(1, Math.floor(lookback)));
  const a = Number(values[end]);
  const b = Number(values[prev]);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return 0;
  return (a - b) / Math.abs(b);
}

function atrPct(candles, period, refPrice) {
  const atrAbs = computeAtr(candles, period);
  if (!Number.isFinite(atrAbs)) return null;
  const denom = Math.max(1e-9, Math.abs(refPrice));
  return atrAbs / denom;
}

function wickRatio(candle, direction = 'up') {
  if (!candle) return 0;
  const body = Math.max(1e-9, Math.abs(candle.close - candle.open));
  if (direction === 'up') {
    return Math.max(0, candle.high - Math.max(candle.close, candle.open)) / body;
  }
  return Math.max(0, Math.min(candle.close, candle.open) - candle.low) / body;
}

function detect({ symbol, S, CFG }) {
  const tuneRaw = CFG?.strategyTunings?.[ID] || {};
  const tune = {
    ...DEFAULTS,
    ...tuneRaw,
  };

  const periodoSlope = Math.max(2, Math.round(tune.periodoSlope ?? tune.slopePeriod ?? DEFAULTS.periodoSlope));
  const slopeMin = Math.abs(Number.isFinite(Number(tune.slopeMin ?? tune.slopeAbsMin))
    ? Number(tune.slopeMin ?? tune.slopeAbsMin)
    : DEFAULTS.slopeMin);
  const atrMin = Number.isFinite(Number(tune.atrMin)) ? Number(tune.atrMin) : DEFAULTS.atrMin;
  const atrMax = Number.isFinite(Number(tune.atrMax)) ? Number(tune.atrMax) : DEFAULTS.atrMax;
  const reverseOrder = Boolean(tune.reverseOrder ?? tune.ordemReversa ?? tune.orderReversal ?? DEFAULTS.reverseOrder);

  const candles = buildSeries({ S, CFG, symbol });
  if (!candles.length || candles.length < CONSTANTS.minBars) return null;

  const current = last(candles, 0);
  const previous = last(candles, 1);
  if (!current || !previous) return null;

  const closes = candles.map(c => c.close);
  const slopeAbs = Math.abs(seriesSlope(closes, periodoSlope));
  if (!Number.isFinite(slopeAbs) || slopeAbs < slopeMin) {
    return null;
  }

  const refPrice = current.close || previous.close;
  if (!Number.isFinite(refPrice) || refPrice <= 0) return null;

  let atrValue = atrPct(candles.slice(-Math.max(CONSTANTS.minBars, periodoSlope + 6)), CONSTANTS.atrPeriod, refPrice);
  if (!Number.isFinite(atrValue)) {
    const hiFallback = [current.high, previous.high].filter(Number.isFinite);
    const loFallback = [current.low, previous.low].filter(Number.isFinite);
    if (hiFallback.length && loFallback.length) {
      const range = Math.max(...hiFallback) - Math.min(...loFallback);
      if (Number.isFinite(range) && range > 0) {
        atrValue = range / Math.max(1e-9, Math.abs(refPrice));
      }
    }
  }
  if (Number.isFinite(atrValue)) {
    if (atrValue < atrMin || atrValue > atrMax) {
      return null;
    }
  }

  const box = candles.slice(-CONSTANTS.lookbackBox - 2, -2);
  if (!box.length) return null;
  const highs = box.map(c => c.high).filter(Number.isFinite);
  const lows = box.map(c => c.low).filter(Number.isFinite);
  if (!highs.length || !lows.length) return null;

  const hi = Math.max(...highs);
  const lo = Math.min(...lows);
  if (!Number.isFinite(hi) || !Number.isFinite(lo) || hi <= lo) return null;

  const breakoutUp = (current.close > hi + CONSTANTS.breakoutEps) && (current.close > current.open);
  const breakoutDown = (current.close < lo - CONSTANTS.breakoutEps) && (current.close < current.open);

  const fakeUp = (previous.high > hi) && (previous.close <= hi) && (wickRatio(previous, 'up') >= CONSTANTS.wickBodyRatioMin);
  const fakeDown = (previous.low < lo) && (previous.close >= lo) && (wickRatio(previous, 'down') >= CONSTANTS.wickBodyRatioMin);

  if (reverseOrder) {
    if (fakeUp) {
      return { side: 'SELL', reason: 'Range fake breakout (reverse)' };
    }
    if (fakeDown) {
      return { side: 'BUY', reason: 'Range fake breakdown (reverse)' };
    }
  }

  if (breakoutUp) {
    return { side: 'BUY', reason: 'Range breakout' };
  }
  if (breakoutDown) {
    return { side: 'SELL', reason: 'Range breakdown' };
  }

  if (!reverseOrder) {
    if (fakeDown) {
      return { side: 'BUY', reason: 'Range fake breakdown' };
    }
    if (fakeUp) {
      return { side: 'SELL', reason: 'Range fake breakout' };
    }
  }

  return null;
}

export default { id: ID, name: NAME, detect };
