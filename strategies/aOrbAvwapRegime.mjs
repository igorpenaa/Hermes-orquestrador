// A-ORB/AVWAP Regime Switcher — alterna entre rompimentos da Opening Range e fades na AVWAP.
import { computeAnchoredVwap, computeAdx } from './indicators.mjs';

const DEFAULTS = {
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
};

function sessionStartTs(candles, minutes){
  if (!Array.isArray(candles) || !candles.length) return null;
  const last = candles[candles.length - 1];
  const ms = minutes * 60 * 1000;
  return Math.floor(last.t / ms) * ms;
}

function openingRange(candles, startTs, orMinutes){
  if (!startTs) return null;
  const endTs = startTs + orMinutes * 60 * 1000;
  const slice = candles.filter(c => c.t >= startTs && c.t < endTs);
  if (!slice.length) return null;
  const highs = slice.map(c => c.h);
  const lows = slice.map(c => c.l);
  return {
    high: Math.max(...highs),
    low: Math.min(...lows)
  };
}

function getAdx5(S, symbol, CFG){
  const candles = S.candles?.[`${symbol}_${CFG.tfRegA || '5m'}`] || [];
  const res = computeAdx(candles, 14);
  return res ? res.adx : null;
}

function emaGap(S, symbol, CFG){
  const base = `${symbol}_${CFG.tfRegA || '5m'}`;
  const ema20 = S.emas?.[`${base}_ema20`];
  const ema50 = S.emas?.[`${base}_ema50`];
  const price = S.candles?.[base]?.[S.candles[base].length - 1]?.c;
  if (ema20 == null || ema50 == null || price == null) return null;
  return Math.abs(ema20 - ema50) / Math.max(1e-9, price);
}

function vwapSlope(candles, startTs, lookback){
  if (!Array.isArray(candles) || candles.length < lookback + 2) return 0;
  const now = computeAnchoredVwap(candles, startTs);
  const idx = Math.max(0, candles.length - 1 - lookback);
  const slice = candles.slice(0, idx + 1);
  const prev = computeAnchoredVwap(slice, startTs);
  if (now == null || prev == null) return 0;
  return (now - prev) / Math.max(1e-9, prev);
}

function volumeRatio(S, symbol, CFG){
  const base = `${symbol}_${CFG.tfExec}`;
  const vma = S.vma?.[`${base}_vma20`];
  const last = S.candles?.[base]?.[S.candles[base].length - 1];
  if (!last || !vma) return null;
  return last.v / Math.max(1e-9, vma);
}

function distanceTo(value, target, atr){
  if (value == null || target == null || atr == null || atr === 0) return null;
  return Math.abs(value - target) / atr;
}

export default {
  id: 'aOrbAvwapRegime',
  name: 'A-ORB / AVWAP Regime',
  detect({ symbol, S, CFG, candles, emaGateOk }) {
    if (!Array.isArray(candles) || candles.length < 20) return null;
    const tune = { ...DEFAULTS, ...(CFG?.strategyTunings?.aOrbAvwapRegime || {}) };

    const base = `${symbol}_${CFG.tfExec}`;
    const atr = S.atr?.[`${base}_atr14`];
    if (atr == null || atr === 0) return { reason: 'ATR indisponível' };

    const startTs = sessionStartTs(candles, tune.sessionMinutes);
    const range = openingRange(candles, startTs, tune.orMinutes);
    if (!range) return { reason: 'Opening Range indisponível' };

    const adx5 = getAdx5(S, symbol, CFG);
    const gap = emaGap(S, symbol, CFG);
    const trendMode = (adx5 != null && adx5 >= tune.adxTrend) && (gap == null || gap >= tune.emaGapMin);

    const anchoredVwap = computeAnchoredVwap(candles, startTs);
    if (anchoredVwap == null) return { reason: 'AVWAP indisponível' };
    const slope = vwapSlope(candles, startTs, tune.vwapSlopeLookback);

    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    const volRatio = volumeRatio(S, symbol, CFG);

    const distVwap = distanceTo(last.c, anchoredVwap, atr);

    const breakOffset = 0.2 * atr;
    const pullbackLimit = tune.pullbackMaxAtr * atr;

    if (trendMode){
      if (last.c >= range.high + breakOffset && last.c > last.o && (volRatio == null || volRatio >= tune.breakVolMult)){
        if (slope < tune.vwapSlopeMin){
          return { reason: 'AVWAP sem inclinação favorável' };
        }
        if (emaGateOk && emaGateOk(symbol, 'BUY') === false){
          return { reason: 'Bloqueado pelo EMA Gate (BUY)' };
        }
        if (prev.l < range.high - pullbackLimit){
          return { reason: 'Pullback imediato muito profundo' };
        }
        return { side: 'BUY', reason: 'Trend Breakout da OR' };
      }
      if (last.c <= range.low - breakOffset && last.c < last.o && (volRatio == null || volRatio >= tune.breakVolMult)){
        if (slope > -tune.vwapSlopeMin){
          return { reason: 'AVWAP sem inclinação favorável' };
        }
        if (emaGateOk && emaGateOk(symbol, 'SELL') === false){
          return { reason: 'Bloqueado pelo EMA Gate (SELL)' };
        }
        if (prev.h > range.low + pullbackLimit){
          return { reason: 'Pullback imediato muito profundo' };
        }
        return { side: 'SELL', reason: 'Trend Breakdown da OR' };
      }
      return { reason: 'Sem rompimento válido da OR' };
    }

    if (distVwap == null || distVwap < tune.distVwapMin || distVwap > tune.distVwapMax){
      return { reason: 'Distância à AVWAP fora da faixa para fade' };
    }

    if (last.h > range.high && last.c < range.high && (volRatio == null || volRatio >= tune.fadeVolMult)){
      if (emaGateOk && emaGateOk(symbol, 'SELL') === false){
        return { reason: 'Bloqueado pelo EMA Gate (SELL)' };
      }
      return { side: 'SELL', reason: 'Fade na OR superior' };
    }

    if (last.l < range.low && last.c > range.low && (volRatio == null || volRatio >= tune.fadeVolMult)){
      if (emaGateOk && emaGateOk(symbol, 'BUY') === false){
        return { reason: 'Bloqueado pelo EMA Gate (BUY)' };
      }
      return { side: 'BUY', reason: 'Fade na OR inferior' };
    }

    return { reason: 'Sem gatilho para fade' };
  }
};
