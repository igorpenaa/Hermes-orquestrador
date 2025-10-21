// strategies/indicators.mjs
// Utilitários leves de indicadores para as estratégias Hermes.

function ensureArray(arr){
  return Array.isArray(arr) ? arr : [];
}

export function emaSeries(values, period){
  const src = ensureArray(values);
  if (!src.length || !Number.isFinite(period) || period <= 0) return [];
  const k = 2 / (period + 1);
  let prev = null;
  return src.map(value => {
    const v = Number(value);
    if (!Number.isFinite(v)) return prev ?? null;
    prev = prev == null ? v : (v * k + prev * (1 - k));
    return prev;
  });
}

function wilderSmooth(values, period){
  const src = ensureArray(values);
  if (!src.length || period <= 0) return [];
  const out = new Array(src.length).fill(null);
  let prev = null;
  let sum = 0;
  for (let i = 0; i < src.length; i += 1){
    const v = Number(src[i]) || 0;
    if (i < period){
      sum += v;
      if (i === period - 1){
        prev = sum / period;
        out[i] = prev;
      }
      continue;
    }
    prev = prev == null ? v : (prev - (prev / period) + v);
    out[i] = prev;
  }
  return out;
}

function trueRange(curr, prev){
  if (!curr) return 0;
  const prevClose = prev ? prev.c : curr.c;
  const highLow = (curr.h ?? 0) - (curr.l ?? 0);
  const highClose = Math.abs((curr.h ?? 0) - prevClose);
  const lowClose  = Math.abs((curr.l ?? 0) - prevClose);
  return Math.max(highLow, highClose, lowClose);
}

export function computeAtrSeries(candles, period = 14){
  const src = ensureArray(candles);
  if (src.length < 2) return [];
  const trVals = [];
  for (let i = 1; i < src.length; i += 1){
    trVals.push(trueRange(src[i], src[i-1]));
  }
  const smooth = wilderSmooth(trVals, period);
  return smooth.filter(v => v != null);
}

export function computeAtr(candles, period = 14){
  const series = computeAtrSeries(candles, period);
  return series.length ? series[series.length - 1] : null;
}

export function computeAdx(candles, period = 14){
  const src = ensureArray(candles);
  if (src.length <= period) return null;
  const trVals = [];
  const dmPlus = [];
  const dmMinus = [];
  for (let i = 1; i < src.length; i += 1){
    const curr = src[i];
    const prev = src[i-1];
    const upMove = (curr.h ?? 0) - (prev.h ?? 0);
    const downMove = (prev.l ?? 0) - (curr.l ?? 0);
    dmPlus.push((upMove > downMove && upMove > 0) ? upMove : 0);
    dmMinus.push((downMove > upMove && downMove > 0) ? downMove : 0);
    trVals.push(trueRange(curr, prev));
  }
  const trSmooth = wilderSmooth(trVals, period);
  const dmPlusSmooth = wilderSmooth(dmPlus, period);
  const dmMinusSmooth = wilderSmooth(dmMinus, period);
  const diPlus = [];
  const diMinus = [];
  for (let i = 0; i < trSmooth.length; i += 1){
    const tr = trSmooth[i];
    const dmP = dmPlusSmooth[i];
    const dmM = dmMinusSmooth[i];
    if (!tr || !Number.isFinite(tr) || tr === 0 || dmP == null || dmM == null){
      diPlus.push(0);
      diMinus.push(0);
      continue;
    }
    diPlus.push(100 * (dmP / tr));
    diMinus.push(100 * (dmM / tr));
  }
  const dx = diPlus.map((val, i) => {
    const sum = val + diMinus[i];
    if (!sum) return 0;
    return 100 * (Math.abs(val - diMinus[i]) / sum);
  });
  const adxSmooth = wilderSmooth(dx, period).filter(v => v != null);
  if (!adxSmooth.length) return null;
  return {
    adx: adxSmooth[adxSmooth.length - 1],
    plusDI: diPlus[diPlus.length - 1],
    minusDI: diMinus[diMinus.length - 1]
  };
}

export function computeEmaSlope(candles, period = 50, lookback = 3){
  const src = ensureArray(candles);
  if (!src.length) return 0;
  const closes = src.map(c => c.c).filter(v => Number.isFinite(v));
  const series = emaSeries(closes, period);
  if (!series.length) return 0;
  const end = series.length - 1;
  const prevIdx = Math.max(0, end - Math.max(1, lookback));
  const a = series[end];
  const b = series[prevIdx];
  if (a == null || b == null) return 0;
  const denom = Math.max(1e-9, Math.abs(b));
  return (a - b) / denom;
}

export function computeVwap(candles){
  const src = ensureArray(candles);
  let pv = 0;
  let vol = 0;
  for (const c of src){
    const volume = Number(c.v) || 0;
    if (volume <= 0) continue;
    const typical = ((Number(c.h) || 0) + (Number(c.l) || 0) + (Number(c.c) || 0)) / 3;
    pv += typical * volume;
    vol += volume;
  }
  if (vol <= 0) return null;
  return pv / vol;
}

export function computeAnchoredVwap(candles, anchorTs){
  const src = ensureArray(candles);
  if (!src.length) return null;
  let pv = 0;
  let vol = 0;
  for (const c of src){
    if (anchorTs && c.t < anchorTs) continue;
    const volume = Number(c.v) || 0;
    if (volume <= 0) continue;
    const typical = ((Number(c.h) || 0) + (Number(c.l) || 0) + (Number(c.c) || 0)) / 3;
    pv += typical * volume;
    vol += volume;
  }
  if (vol <= 0) return null;
  return pv / vol;
}

export function computeBollingerWidth(candles, period = 20, mult = 2){
  const src = ensureArray(candles);
  const closes = src.map(c => c.c).filter(v => Number.isFinite(v));
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const mean = slice.reduce((acc, v) => acc + v, 0) / period;
  const variance = slice.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / period;
  const std = Math.sqrt(Math.max(variance, 0));
  if (!Number.isFinite(mean) || mean === 0) return null;
  const upper = mean + mult * std;
  const lower = mean - mult * std;
  const width = (upper - lower) / mean;
  return { width, upper, lower, basis: mean };
}

export function computePercentile(values, pct){
  const src = ensureArray(values).filter(v => Number.isFinite(v));
  if (!src.length) return null;
  const sorted = [...src].sort((a, b) => a - b);
  const clamped = Math.min(100, Math.max(0, pct));
  const idx = (clamped / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  const weight = idx - lower;
  return sorted[lower] + (sorted[upper] - sorted[lower]) * weight;
}

export function percentileRank(values, value){
  const src = ensureArray(values).filter(v => Number.isFinite(v));
  if (!src.length || value == null || !Number.isFinite(value)) return null;
  const count = src.filter(v => v <= value).length;
  return (count / src.length) * 100;
}

export function computeRsiSeries(values, period = 14){
  const src = ensureArray(values);
  if (src.length < 2 || period <= 0) return new Array(src.length).fill(null);
  const closes = src.map(v => {
    if (v && typeof v === 'object' && v.c != null) return Number(v.c) || 0;
    return Number(v) || 0;
  });
  const result = new Array(closes.length).fill(null);
  if (closes.length <= period) return result;

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i += 1){
    const change = closes[i] - closes[i - 1];
    if (change >= 0) gainSum += change;
    else lossSum -= change;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;

  const compute = (g, l) => {
    if (l === 0){
      if (g === 0) return 50;
      return 100;
    }
    const rs = g / l;
    return 100 - (100 / (1 + rs));
  };

  result[period] = compute(avgGain, avgLoss);

  for (let i = period + 1; i < closes.length; i += 1){
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = ((avgGain * (period - 1)) + gain) / period;
    avgLoss = ((avgLoss * (period - 1)) + loss) / period;
    result[i] = compute(avgGain, avgLoss);
  }

  return result;
}

export function candleWickInfo(candle){
  if (!candle) return { upper: 0, lower: 0, body: 0, range: 0 };
  const open = Number(candle.o) || 0;
  const close = Number(candle.c) || 0;
  const high = Number(candle.h) || 0;
  const low = Number(candle.l) || 0;
  const body = Math.abs(close - open);
  const range = Math.max(1e-9, high - low);
  const upper = high - Math.max(open, close);
  const lower = Math.min(open, close) - low;
  return { upper, lower, body, range };
}

export function typicalPrice(candle){
  if (!candle) return null;
  return ((Number(candle.h) || 0) + (Number(candle.l) || 0) + (Number(candle.c) || 0)) / 3;
}

export function distance(valueA, valueB){
  if (valueA == null || valueB == null) return null;
  return Math.abs(valueA - valueB);
}

export function ratio(num, denom){
  if (denom == null || denom === 0) return null;
  return num / denom;
}

