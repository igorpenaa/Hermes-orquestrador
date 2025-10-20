// Liquidity Sweep Reversal — Falhas após varredura de extremos recentes.
import { computeAdx, candleWickInfo } from './indicators.mjs';

const DEFAULTS = {
  lookback: 30,
  adxMax: 27,
  wickMin: 0.45,
  volMult: 1.0
};

function getAdx5(S, symbol, CFG){
  const candles = S.candles?.[`${symbol}_${CFG.tfRegA || '5m'}`] || [];
  const res = computeAdx(candles, 14);
  return res ? res.adx : null;
}

function getVolumeRatio(S, symbol, CFG){
  const base = `${symbol}_${CFG.tfExec}`;
  const vma = S.vma?.[`${base}_vma20`];
  const last = S.candles?.[base]?.[S.candles[base].length - 1];
  if (!last || !vma) return null;
  return last.v / Math.max(1e-9, vma);
}

function referenceLevels(candles, lookback){
  const slice = candles.slice(-lookback - 2, -1);
  if (!slice.length) return { high: null, low: null };
  const highs = slice.map(c => c.h);
  const lows = slice.map(c => c.l);
  return {
    high: Math.max(...highs),
    low: Math.min(...lows)
  };
}

export default {
  id: 'liquiditySweepReversal',
  name: 'Liquidity Sweep Reversal',
  detect({ symbol, S, CFG, candles, emaGateOk }) {
    if (!Array.isArray(candles) || candles.length < 10) return null;
    const tune = { ...DEFAULTS, ...(CFG?.strategyTunings?.liquiditySweepReversal || {}) };

    const adx5 = getAdx5(S, symbol, CFG);
    if (adx5 != null && adx5 > tune.adxMax){
      return { reason: 'Tendência forte (ADX alto)' };
    }

    const levels = referenceLevels(candles, tune.lookback);
    const last = candles[candles.length - 1];
    const wick = candleWickInfo(last);
    const vRatio = getVolumeRatio(S, symbol, CFG);

    if (vRatio != null && vRatio < tune.volMult){
      return { reason: 'Volume não confirma sweep' };
    }

    const sweepLow = levels.low != null && last.l < levels.low && last.c > levels.low;
    const sweepHigh = levels.high != null && last.h > levels.high && last.c < levels.high;

    if (sweepLow && CFG.allowBuy !== false){
      const wickPct = wick.range ? wick.lower / wick.range : 0;
      if (wickPct < tune.wickMin){
        return { reason: 'Pavio inferior insuficiente' };
      }
      if (emaGateOk && emaGateOk(symbol, 'BUY') === false){
        return { reason: 'Bloqueado pelo EMA Gate (BUY)' };
      }
      return { side: 'BUY', reason: 'Sweep de mínima revertido' };
    }

    if (sweepHigh && CFG.allowSell !== false){
      const wickPct = wick.range ? wick.upper / wick.range : 0;
      if (wickPct < tune.wickMin){
        return { reason: 'Pavio superior insuficiente' };
      }
      if (emaGateOk && emaGateOk(symbol, 'SELL') === false){
        return { reason: 'Bloqueado pelo EMA Gate (SELL)' };
      }
      return { side: 'SELL', reason: 'Sweep de máxima revertido' };
    }

    return { reason: 'Sem sweep válido' };
  }
};
