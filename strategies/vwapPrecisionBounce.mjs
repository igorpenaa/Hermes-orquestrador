// VWAP Precision Bounce — reversões controladas em torno da VWAP intradiária.
import { computeAnchoredVwap, computeAdx, candleWickInfo } from './indicators.mjs';

const DEFAULTS = {
  distMinAtr: 0.25,
  distMaxAtr: 1.2,
  adxMax: 27,
  wickMin: 0.4,
  volMult: 1.0,
  sessionMinutes: 1440
};

function sessionStartTs(candles, minutes){
  if (!Array.isArray(candles) || !candles.length) return null;
  const last = candles[candles.length - 1];
  if (!last) return null;
  const ms = minutes * 60 * 1000;
  const anchor = Math.floor(last.t / ms) * ms;
  return anchor;
}

function getAtr(S, symbol, CFG){
  const base = `${symbol}_${CFG.tfExec}`;
  return S.atr?.[`${base}_atr14`] || null;
}

function getAdx5(S, symbol, CFG){
  const candles = S.candles?.[`${symbol}_${CFG.tfRegA || '5m'}`] || [];
  const res = computeAdx(candles, 14);
  return res ? res.adx : null;
}

function volumeRatio(S, symbol, CFG){
  const base = `${symbol}_${CFG.tfExec}`;
  const vma = S.vma?.[`${base}_vma20`];
  const last = S.candles?.[base]?.[S.candles[base].length - 1];
  if (!last || !vma) return null;
  return last.v / Math.max(1e-9, vma);
}

function distToVwap(price, vwap, atr){
  if (price == null || vwap == null || atr == null || atr === 0) return null;
  return Math.abs(price - vwap) / atr;
}

export default {
  id: 'vwapPrecisionBounce',
  name: 'VWAP Precision Bounce',
  detect({ symbol, S, CFG, candles, ctx, emaGateOk }) {
    if (!Array.isArray(candles) || candles.length < 20) return null;
    const tune = { ...DEFAULTS, ...(CFG?.strategyTunings?.vwapPrecisionBounce || {}) };

    const atr = getAtr(S, symbol, CFG);
    if (atr == null || atr === 0) return { reason: 'ATR indisponível' };

    const adx5 = getAdx5(S, symbol, CFG);
    if (adx5 != null && adx5 > tune.adxMax){
      return { reason: 'Dia tendencial (ADX alto)' };
    }

    const anchor = sessionStartTs(candles, tune.sessionMinutes);
    const vwap = computeAnchoredVwap(candles, anchor);
    if (vwap == null) return { reason: 'VWAP indisponível' };

    const last = candles[candles.length - 1];
    const wick = candleWickInfo(last);
    const dist = distToVwap(last.c, vwap, atr);
    const vRatio = volumeRatio(S, symbol, CFG);

    if (dist == null || dist < tune.distMinAtr || dist > tune.distMaxAtr){
      return { reason: 'Distância fora da faixa' };
    }
    if (vRatio != null && vRatio < tune.volMult){
      return { reason: 'Volume não confirma reversão' };
    }

    const closeAbove = last.c > vwap;
    const closeBelow = last.c < vwap;

    const wickUpperPct = wick.range ? wick.upper / wick.range : 0;
    const wickLowerPct = wick.range ? wick.lower / wick.range : 0;

    if (closeAbove && wickUpperPct >= tune.wickMin && CFG.allowSell !== false){
      if (emaGateOk && emaGateOk(symbol, 'SELL') === false){
        return { reason: 'Bloqueado pelo EMA Gate (SELL)' };
      }
      return { side: 'SELL', reason: 'Rejeição da VWAP (overshoot superior)' };
    }

    if (closeBelow && wickLowerPct >= tune.wickMin && CFG.allowBuy !== false){
      if (emaGateOk && emaGateOk(symbol, 'BUY') === false){
        return { reason: 'Bloqueado pelo EMA Gate (BUY)' };
      }
      return { side: 'BUY', reason: 'Rejeição da VWAP (overshoot inferior)' };
    }

    return { reason: 'Sem pavio de rejeição válido' };
  }
};
