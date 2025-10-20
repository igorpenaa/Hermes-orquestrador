// ATR Squeeze Break — Compressão curta seguida de expansão direcional.
import { computeAtrSeries, computeBollingerWidth, computePercentile } from './indicators.mjs';

const DEFAULTS = {
  atrPercentile: 35,
  bbwPercentile: 35,
  atrLookback: 200,
  boxLenMin: 8,
  boxLenMax: 15,
  breakAtrMult: 0.2,
  volMult: 1.1,
  pullbackMaxAtr: 0.5
};

function getAtrNormalized(candles, lookback){
  const series = computeAtrSeries(candles, 14);
  if (!series.length) return [];
  const closes = candles.slice(-series.length).map(c => c.c);
  return series.map((atr, idx) => {
    const close = closes[idx] ?? null;
    if (!close) return null;
    return atr / close;
  }).filter(v => v != null);
}

function getVolumeRatio(S, symbol, CFG){
  const base = `${symbol}_${CFG.tfExec}`;
  const vma = S.vma?.[`${base}_vma20`];
  const last = S.candles?.[base]?.[S.candles[base].length - 1];
  if (!last || !vma) return null;
  return last.v / Math.max(1e-9, vma);
}

function boxLevels(candles, len){
  const slice = candles.slice(-len - 1, -1);
  if (!slice.length) return null;
  return {
    high: Math.max(...slice.map(c => c.h)),
    low: Math.min(...slice.map(c => c.l))
  };
}

export default {
  id: 'atrSqueezeBreak',
  name: 'ATR Squeeze Break',
  detect({ symbol, S, CFG, candles, emaGateOk }) {
    if (!Array.isArray(candles) || candles.length < 30) return null;
    const tune = { ...DEFAULTS, ...(CFG?.strategyTunings?.atrSqueezeBreak || {}) };

    const atrNormSeries = getAtrNormalized(candles, tune.atrLookback);
    if (!atrNormSeries.length) return { reason: 'ATR histórico indisponível' };
    const atrCurrent = atrNormSeries[atrNormSeries.length - 1];
    const atrThresh = computePercentile(atrNormSeries.slice(-tune.atrLookback), tune.atrPercentile);
    if (atrThresh != null && atrCurrent > atrThresh){
      return { reason: 'ATR acima do limite do squeeze' };
    }

    const bbw = computeBollingerWidth(candles, 20, 2);
    if (!bbw) return { reason: 'BBWidth indisponível' };
    const bbwSeries = [];
    for (let i = 20; i <= candles.length; i += 1){
      const slice = candles.slice(i - 20, i);
      const res = computeBollingerWidth(slice, 20, 2);
      if (res) bbwSeries.push(res.width);
    }
    const bbwThresh = computePercentile(bbwSeries, tune.bbwPercentile);
    if (bbwThresh != null && bbw.width > bbwThresh){
      return { reason: 'Bandas ainda largas' };
    }

    const volRatio = getVolumeRatio(S, symbol, CFG);
    if (volRatio != null && volRatio < tune.volMult){
      return { reason: 'Volume não confirma escape' };
    }

    const boxLen = Math.round((tune.boxLenMin + tune.boxLenMax) / 2);
    const levels = boxLevels(candles, boxLen);
    if (!levels) return { reason: 'Caixa de compressão indisponível' };

    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    const base = `${symbol}_${CFG.tfExec}`;
    const atrRaw = S.atr?.[`${base}_atr14`];
    const atr = atrRaw || (prev && prev.h != null && prev.l != null ? prev.h - prev.l : null);
    if (atr == null) return { reason: 'ATR atual indisponível' };

    const breakOffset = tune.breakAtrMult * atr;
    const pullbackLimit = tune.pullbackMaxAtr * atr;

    const brokeUp = last.c >= levels.high + breakOffset && last.c > last.o;
    const brokeDown = last.c <= levels.low - breakOffset && last.c < last.o;

    if (brokeUp && CFG.allowBuy !== false){
      if (prev.l < levels.high - pullbackLimit){
        return { reason: 'Pullback imediato muito profundo' };
      }
      if (emaGateOk && emaGateOk(symbol, 'BUY') === false){
        return { reason: 'Bloqueado pelo EMA Gate (BUY)' };
      }
      return { side: 'BUY', reason: 'Escape após squeeze' };
    }

    if (brokeDown && CFG.allowSell !== false){
      if (prev.h > levels.low + pullbackLimit){
        return { reason: 'Pullback imediato muito profundo' };
      }
      if (emaGateOk && emaGateOk(symbol, 'SELL') === false){
        return { reason: 'Bloqueado pelo EMA Gate (SELL)' };
      }
      return { side: 'SELL', reason: 'Quebra após squeeze' };
    }

    return { reason: 'Sem escape válido' };
  }
};
