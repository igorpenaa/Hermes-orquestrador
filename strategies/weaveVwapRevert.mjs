// Weave VWAP Revert — reversões contrárias na VWAP com EMAs entrelaçadas.
import { computeAnchoredVwap, computeAdx, candleWickInfo, emaSeries, percentileRank } from './indicators.mjs';

const DEFAULTS = {
  adx5_max: 18,
  bbw_pct_max: 55,
  atr_min: 0.0020,
  atr_max: 0.0050,
  dist_vwap_xatr: 0.90,
  pavio_min: 0.25,
  vol_xvma: 0.65,
  gap_ema9_50_max: 0.00022,
  tp1_xatr: 0.6,
  tp2_target: 'VWAP',
  stop_xatr: 1.3
};

const SESSION_MINUTES = 1440;
const BB_PERIOD = 20;
const BB_LOOKBACK = 160;

function sessionStartTs(candles, minutes){
  if (!Array.isArray(candles) || !candles.length) return null;
  const last = candles[candles.length - 1];
  if (!last) return null;
  const ms = minutes * 60 * 1000;
  const anchor = Math.floor(last.t / ms) * ms;
  return anchor;
}

function bollingerWidthSeries(candles, period = BB_PERIOD, lookback = BB_LOOKBACK){
  if (!Array.isArray(candles) || candles.length < period) return [];
  const closes = candles.map(c => Number(c.c)).filter(v => Number.isFinite(v));
  if (closes.length < period) return [];
  const out = [];
  for (let i = period; i <= closes.length; i += 1){
    const slice = closes.slice(i - period, i);
    const mean = slice.reduce((acc, v) => acc + v, 0) / period;
    if (!Number.isFinite(mean) || mean === 0) continue;
    const variance = slice.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / period;
    const std = Math.sqrt(Math.max(variance, 0));
    const width = ((mean + 2 * std) - (mean - 2 * std)) / mean;
    if (Number.isFinite(width)) out.push(width);
  }
  const keep = Math.max(period, lookback);
  return out.length > keep ? out.slice(out.length - keep) : out;
}

function volumeRatio(S, symbol, CFG){
  const base = `${symbol}_${CFG.tfExec}`;
  const vma = S.vma?.[`${base}_vma20`];
  const last = S.candles?.[base]?.[S.candles[base].length - 1];
  if (!last || !vma) return null;
  const ratio = last.v / Math.max(vma, 1e-9);
  return Number.isFinite(ratio) ? ratio : null;
}

function atrPercent(S, symbol, CFG){
  const base = `${symbol}_${CFG.tfExec}`;
  const last = S.candles?.[base]?.[S.candles[base].length - 1];
  const atr = S.atr?.[`${base}_atr14`];
  if (!last || !atr || atr <= 0) return null;
  return atr / Math.max(last.c || 1e-9, 1e-9);
}

function emaClusterInfo(closes){
  const ema9 = emaSeries(closes, 9).slice(-1)[0];
  const ema20 = emaSeries(closes, 20).slice(-1)[0];
  const ema50 = emaSeries(closes, 50).slice(-1)[0];
  const ema100 = emaSeries(closes, 100).slice(-1)[0];
  const ema200 = emaSeries(closes, 200).slice(-1)[0];
  return { ema9, ema20, ema50, ema100, ema200 };
}

function emaRangeNormalized(emas, price){
  const values = Object.values(emas).filter(v => Number.isFinite(v));
  if (values.length < 5 || price == null || price === 0) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  return Math.abs(max - min) / price;
}

function detectSide(lastClose, vwap, wick, pavioMin){
  if (lastClose == null || vwap == null || !wick) return { side: null, reason: 'Dados insuficientes' };
  const upperPct = wick.range ? wick.upper / wick.range : 0;
  const lowerPct = wick.range ? wick.lower / wick.range : 0;
  if (lastClose > vwap){
    if (upperPct >= pavioMin) return { side: 'SELL', reason: 'Fade VWAP superior com pavio de exaustão' };
    return { side: null, reason: 'Sem pavio superior suficiente' };
  }
  if (lastClose < vwap){
    if (lowerPct >= pavioMin) return { side: 'BUY', reason: 'Fade VWAP inferior com pavio de exaustão' };
    return { side: null, reason: 'Sem pavio inferior suficiente' };
  }
  return { side: null, reason: 'Preço centralizado na VWAP' };
}

export default {
  id: 'weaveVwapRevert',
  name: 'Weave VWAP Revert',
  detect({ symbol, S, CFG }){
    const base = `${symbol}_${CFG.tfExec}`;
    const candles = S.candles?.[base];
    if (!Array.isArray(candles) || candles.length < 220){
      return { reason: 'Velas insuficientes para WVR' };
    }

    const tune = { ...DEFAULTS, ...(CFG?.strategyTunings?.weaveVwapRevert || {}) };
    const last = candles[candles.length - 1];
    if (!last) return { reason: 'Última vela indisponível' };

    const atrPct = atrPercent(S, symbol, CFG);
    if (atrPct == null || atrPct < tune.atr_min || atrPct > tune.atr_max){
      return { reason: 'ATR fora da faixa útil' };
    }

    const vRatio = volumeRatio(S, symbol, CFG);
    if (vRatio != null && vRatio < tune.vol_xvma){
      return { reason: 'Volume fraco para reversão' };
    }

    const closes = candles.map(c => Number(c.c)).filter(v => Number.isFinite(v));
    const emas = emaClusterInfo(closes);
    if (!Object.values(emas).every(v => Number.isFinite(v))){
      return { reason: 'EMAs indisponíveis' };
    }

    const price = Number(last.c) || 0;
    if (!price) return { reason: 'Preço inválido' };

    const gap95 = Math.abs(emas.ema9 - emas.ema50) / price;
    if (!Number.isFinite(gap95) || gap95 > tune.gap_ema9_50_max){
      return { reason: 'EMAs abrindo (gap 9-50)' };
    }

    const clusterRange = emaRangeNormalized(emas, price);
    if (clusterRange == null || clusterRange > tune.gap_ema9_50_max * 2.2){
      return { reason: 'EMAs desalinhadas (sem “teia”)' };
    }

    const adxInput = candles.slice(-120);
    const adxRes = computeAdx(adxInput, 5);
    if (adxRes && Number.isFinite(adxRes.adx) && adxRes.adx > tune.adx5_max){
      return { reason: 'ADX alto — tendência ganhando força' };
    }

    const widths = bollingerWidthSeries(candles, BB_PERIOD, BB_LOOKBACK);
    const currentWidth = widths.length ? widths[widths.length - 1] : null;
    if (currentWidth == null){
      return { reason: 'BBWidth indisponível' };
    }
    const widthPct = percentileRank(widths, currentWidth);
    if (widthPct != null && widthPct > tune.bbw_pct_max){
      return { reason: 'Bandas pouco comprimidas' };
    }

    const anchor = sessionStartTs(candles, SESSION_MINUTES);
    const vwap = computeAnchoredVwap(candles, anchor);
    if (vwap == null){
      return { reason: 'VWAP indisponível' };
    }

    const atr = S.atr?.[`${base}_atr14`];
    if (!atr || atr <= 0) return { reason: 'ATR indisponível' };
    const distAtr = Math.abs(price - vwap) / atr;
    if (!Number.isFinite(distAtr) || distAtr < tune.dist_vwap_xatr){
      return { reason: 'Preço ainda não afastou da VWAP' };
    }

    const wick = candleWickInfo(last);
    const { side, reason } = detectSide(price, vwap, wick, tune.pavio_min);
    if (!side){
      return { reason };
    }

    return { side, reason };
  }
};
