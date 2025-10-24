// Hermes v6 – Retest Breakout (Buy)
// Rompimento de resistência seguido de reteste técnico e confirmação compradora.

import { emaSeries, computeEmaSlope, computeAtr } from './indicators.mjs';

const ID = 'retestBreakoutBuy';
const NAME = 'Retest Breakout (Buy)';

const DEFAULTS = {
  emaRef1: 14,
  emaRef2: 35,
  slopeMin: 0.0005,
  atrMin: 0.0025,
  atrMax: 0.028,
  distEmaRef1Xatr: 1.7,
  reverseOrder: false,
  slopeLookback: 3,
  breakTolerancePct: 0.0007,
  retestTolerancePct: 0.0015,
  confirmBodyMin: 0.55,
};

function num(value, fallback){
  const v = Number(value);
  return Number.isFinite(v) ? v : fallback;
}

function candleAt(candles, offset){
  return candles[candles.length - 1 - offset];
}

function bodyFraction(candle){
  if (!candle) return 0;
  const high = Number(candle.h) || 0;
  const low = Number(candle.l) || 0;
  const open = Number(candle.o) || 0;
  const close = Number(candle.c) || 0;
  const range = Math.max(1e-9, high - low);
  return Math.abs(close - open) / range;
}

function isBullStrong(candle, minFrac){
  if (!candle) return false;
  const open = Number(candle.o) || 0;
  const close = Number(candle.c) || 0;
  return close > open && bodyFraction(candle) >= minFrac;
}

function isBearStrong(candle, minFrac){
  if (!candle) return false;
  const open = Number(candle.o) || 0;
  const close = Number(candle.c) || 0;
  return close < open && bodyFraction(candle) >= minFrac;
}

function normalizeAtr(atrAbs, refPrice){
  if (!Number.isFinite(atrAbs) || !Number.isFinite(refPrice) || refPrice === 0) return null;
  return atrAbs / Math.abs(refPrice);
}

function ensureCandles({ symbol, CFG, S, candles }){
  if (Array.isArray(candles) && candles.length){
    return candles;
  }
  const base = `${symbol}_${CFG.tfExec}`;
  return Array.isArray(S.candles?.[base]) ? S.candles[base] : [];
}

function detect({ symbol, S, CFG, candles: candlesFromCtx }){
  const candles = ensureCandles({ symbol, CFG, S, candles: candlesFromCtx });
  if (!candles.length || candles.length < 6) return null;
  if (CFG?.allowBuy === false) return { reason: 'Compras desabilitadas' };

  const tuneRaw = CFG?.strategyTunings?.[ID] || {};
  const tune = { ...DEFAULTS, ...tuneRaw };

  const emaRef1 = Math.max(1, Math.round(num(tune.emaRef1 ?? tune.emaFast, DEFAULTS.emaRef1)));
  const emaRef2 = Math.max(1, Math.round(num(tune.emaRef2 ?? tune.emaSlow, DEFAULTS.emaRef2)));
  const slopeMin = Math.abs(num(tune.slopeMin, DEFAULTS.slopeMin));
  const atrMin = Math.max(0, num(tune.atrMin, DEFAULTS.atrMin));
  const atrMax = Math.max(atrMin, num(tune.atrMax, DEFAULTS.atrMax));
  const distMax = Math.max(0, num(tune.distEmaRef1Xatr ?? tune.distMax, DEFAULTS.distEmaRef1Xatr));
  const reverseOrder = Boolean(tune.reverseOrder ?? tune.ordemReversa ?? tune.orderReversal ?? DEFAULTS.reverseOrder);
  const slopeLookback = Math.max(1, Math.round(num(tune.slopeLookback, DEFAULTS.slopeLookback)));
  const breakTolerancePct = Math.max(0, num(tune.breakTolerancePct ?? tune.breakTolPct, DEFAULTS.breakTolerancePct));
  const retestTolerancePct = Math.max(0, num(tune.retestTolerancePct ?? tune.touchTolerancePct, DEFAULTS.retestTolerancePct));
  const confirmBodyMin = Math.max(0, Math.min(1, num(tune.confirmBodyMin ?? tune.bodyStrength, DEFAULTS.confirmBodyMin)));

  const closes = candles.map(c => Number(c.c) || 0);
  const emaFastSeries = emaSeries(closes, emaRef1);
  const emaSlowSeries = emaSeries(closes, emaRef2);
  const len = candles.length;

  const emaFastNow = emaFastSeries[len - 1];
  const emaFastPrev = emaFastSeries[len - 2];
  const emaSlowNow = emaSlowSeries[len - 1];
  const emaSlowPrev = emaSlowSeries[len - 2];

  if ([emaFastNow, emaFastPrev, emaSlowNow, emaSlowPrev].some(v => v == null)){
    return { reason: 'EMAs indisponíveis' };
  }

  const slopeFast = computeEmaSlope(candles, emaRef1, slopeLookback);
  if (!(Number.isFinite(slopeFast) && slopeFast >= slopeMin)){
    return null;
  }

  if (!(emaFastNow > emaSlowNow && emaFastPrev > emaSlowPrev)){
    return null;
  }

  const last = candleAt(candles, 0);
  const retest = candleAt(candles, 1);
  const breakCandle = candleAt(candles, 2);
  const preBreak = candleAt(candles, 3);

  if (!last || !retest || !breakCandle || !preBreak){
    return null;
  }

  const price = Number(last.c) || Number(last.o);
  if (!Number.isFinite(price) || price <= 0){
    return null;
  }

  const base = `${symbol}_${CFG.tfExec}`;
  let atrAbs = num(S?.atr?.[`${base}_atr14`], null);
  if (!Number.isFinite(atrAbs)){
    const recent = candles.slice(-Math.max(20, emaRef2 + 4));
    atrAbs = computeAtr(recent, 14);
  }
  const atrNorm = normalizeAtr(atrAbs, price);
  if (atrNorm != null){
    if (atrNorm < atrMin || atrNorm > atrMax){
      return null;
    }
  }

  const distLimitAbs = distMax * (Number.isFinite(atrAbs) ? atrAbs : price * atrMin);
  const emaFastRetest = emaFastSeries[len - 2];
  const retestLow = Number(retest.l) || Number(retest.c) || 0;
  const distFromEma = Math.max(0, (emaFastRetest ?? emaFastNow) - retestLow);
  if (Number.isFinite(distLimitAbs) && distLimitAbs > 0 && distFromEma > distLimitAbs){
    return null;
  }

  const prevHigh = Math.max(Number(preBreak.h) || 0, Number(preBreak.c) || 0);
  const breakOk =
    isBullStrong(breakCandle, confirmBodyMin) &&
    prevHigh > 0 &&
    Number(breakCandle.c) >= prevHigh * (1 + breakTolerancePct);

  const breakHigh = Math.max(Number(breakCandle.h) || 0, Number(breakCandle.c) || 0);
  const retestTouched =
    breakHigh > 0 &&
    Number(retest.l) >= prevHigh * (1 - retestTolerancePct) &&
    Number(retest.l) <= breakHigh * (1 + retestTolerancePct);

  const confirmBull =
    isBullStrong(last, confirmBodyMin) &&
    Number(last.c) > Number(retest.h);

  const staysAboveEma = Number(last.c) >= (emaFastNow ?? Number(last.c));

  if (breakOk && retestTouched && confirmBull && staysAboveEma){
    return { side: 'BUY', reason: NAME };
  }

  if (reverseOrder && breakOk){
    const loseEma =
      Number(retest.c) < (emaFastRetest ?? emaFastNow) &&
      Number(last.c) < (emaFastNow ?? Number(last.c));
    const confirmBear = isBearStrong(last, confirmBodyMin);
    if (loseEma && confirmBear){
      return { side: 'SELL', reason: `${NAME} (reverse)` };
    }
  }

  return null;
}

export default { id: ID, name: NAME, detect };
