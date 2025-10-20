// EMA Flow Scalper 2.1 — Pullbacks curtos até a EMA20 dentro de tendência forte.
import { computeAdx, computeEmaSlope, ratio } from './indicators.mjs';

const DEFAULTS = {
  adxMin: 20,
  atrNMin: 0.00025,
  volMult: 1.0,
  emaGapMin: 0.0004,
  slopeMin: 0.0005,
  requireM15Agree: false,
  slopeLookback: 3
};

function getTfCandles(S, symbol, tf){
  return S?.candles?.[`${symbol}_${tf}`] || [];
}

function getAdx(S, symbol, tf){
  const candles = getTfCandles(S, symbol, tf);
  const res = computeAdx(candles, 14);
  return res ? res.adx : null;
}

function getSlope(S, symbol, tf, period, lookback){
  const candles = getTfCandles(S, symbol, tf);
  return computeEmaSlope(candles, period, lookback);
}

function getVolumeRatio(S, symbol, CFG){
  const base = `${symbol}_${CFG.tfExec}`;
  const last = S.candles?.[base]?.[S.candles[base].length - 1];
  const prev = S.candles?.[base]?.[S.candles[base].length - 2];
  const vma = S.vma?.[`${base}_vma20`];
  const vol = prev?.v ?? last?.v;
  if (vol == null || !vma) return null;
  return vol / Math.max(1e-9, vma);
}

function regimeBias({ S, symbol, CFG, requireM15 }){
  const tf5 = CFG.tfRegA || '5m';
  const tf15 = CFG.tfRegB || '15m';
  const base5 = `${symbol}_${tf5}`;
  const base15 = `${symbol}_${tf15}`;
  const ema5_20 = S.emas?.[`${base5}_ema20`];
  const ema5_50 = S.emas?.[`${base5}_ema50`];
  const ema15_20 = S.emas?.[`${base15}_ema20`];
  const ema15_50 = S.emas?.[`${base15}_ema50`];
  const bull5 = ema5_20 != null && ema5_50 != null && ema5_20 > ema5_50;
  const bear5 = ema5_20 != null && ema5_50 != null && ema5_20 < ema5_50;
  const bull15 = ema15_20 != null && ema15_50 != null && ema15_20 > ema15_50;
  const bear15 = ema15_20 != null && ema15_50 != null && ema15_20 < ema15_50;
  const buyAllowed = bull5 && (!requireM15 || bull15 || (!bear15 && !bull15));
  const sellAllowed = bear5 && (!requireM15 || bear15 || (!bull15 && !bear15));
  return { buyAllowed, sellAllowed, bull5, bear5, bull15, bear15 };
}

function wickSupport(candle, side){
  if (!candle) return false;
  const high = candle.h ?? 0;
  const low = candle.l ?? 0;
  const close = candle.c ?? 0;
  const open = candle.o ?? 0;
  if (side === 'BUY'){
    return close > open && close >= (Math.max(open, close) - (high - low) * 0.05);
  }
  if (side === 'SELL'){
    return close < open && close <= (Math.min(open, close) + (high - low) * 0.05);
  }
  return false;
}

export default {
  id: 'emaFlowScalper21',
  name: 'EMA Flow Scalper 2.1',
  detect({ symbol, S, CFG, candles, ctx, emaGateOk, regimeAgreeDetailed }) {
    if (!Array.isArray(candles) || candles.length < 5) return null;

    const tune = { ...DEFAULTS, ...(CFG?.strategyTunings?.emaFlowScalper21 || {}) };
    const base = `${symbol}_${CFG.tfExec}`;
    const atrRaw = S.atr?.[`${base}_atr14`];
    const atrNorm = ctx?.atrN ?? (atrRaw != null && ctx?.L?.c ? atrRaw / ctx.L.c : null);
    if (atrNorm != null && atrNorm < tune.atrNMin){
      return { reason: 'ATR insuficiente' };
    }

    const adx5 = getAdx(S, symbol, CFG.tfRegA || '5m');
    if (adx5 != null && adx5 < tune.adxMin){
      return { reason: `ADX insuficiente (${adx5.toFixed(1)})` };
    }

    const slope50 = getSlope(S, symbol, CFG.tfRegA || '5m', 50, tune.slopeLookback);

    const bias = regimeBias({ S, symbol, CFG, requireM15: !!tune.requireM15Agree });
    if (!bias.buyAllowed && !bias.sellAllowed){
      return { reason: 'Tendência oposta/indefinida' };
    }

    const ema20 = S.emas?.[`${base}_ema20`];
    const ema50 = S.emas?.[`${base}_ema50`];
    if (ema20 == null || ema50 == null) return { reason: 'EMAs 1m indisponíveis' };

    const gap = ratio(Math.abs(ema20 - ema50), ctx?.L?.c || ema20);
    if (gap != null && gap < tune.emaGapMin){
      return { reason: 'EMAs comprimidas' };
    }

    const volumeRatio = getVolumeRatio(S, symbol, CFG);
    if (volumeRatio != null && volumeRatio < tune.volMult){
      return { reason: 'Volume baixo' };
    }

    const L = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    if (!L || !prev) return null;

    const touchBuy = prev?.l != null && ema20 != null && prev.l <= ema20;
    const touchSell = prev?.h != null && ema20 != null && prev.h >= ema20;

    const confirmBuy = touchBuy && L.c > L.o && L.c > prev.h && L.c >= ema20;
    const confirmSell = touchSell && L.c < L.o && L.c < prev.l && L.c <= ema20;

    if (confirmBuy && CFG.allowBuy !== false && bias.buyAllowed){
      if (slope50 != null && slope50 < tune.slopeMin){
        return { reason: 'Slope 5m insuficiente' };
      }
      if (emaGateOk && emaGateOk(symbol, 'BUY') === false){
        return { reason: 'Bloqueado pelo EMA Gate (BUY)' };
      }
      if (!wickSupport(L, 'BUY')){
        return { reason: 'Confirmação fraca' };
      }
      return { side: 'BUY', reason: 'Pullback confirmado na EMA20' };
    }

    if (confirmSell && CFG.allowSell !== false && bias.sellAllowed){
      if (slope50 != null && -slope50 < tune.slopeMin){
        return { reason: 'Slope 5m insuficiente' };
      }
      if (emaGateOk && emaGateOk(symbol, 'SELL') === false){
        return { reason: 'Bloqueado pelo EMA Gate (SELL)' };
      }
      if (!wickSupport(L, 'SELL')){
        return { reason: 'Confirmação fraca' };
      }
      return { side: 'SELL', reason: 'Pullback confirmado na EMA20' };
    }

    const regime = typeof regimeAgreeDetailed === 'function' ? regimeAgreeDetailed(symbol) : null;
    const biasLabel = regime ? regime.state : '—';
    return { reason: `Sem confirmação • Regime ${biasLabel}` };
  }
};
