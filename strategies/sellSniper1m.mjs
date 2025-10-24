// SELL Sniper 1m — reversões agressivas após micro pullbacks
import { emaSeries, computeEmaSlope, computeRsiSeries } from './indicators.mjs';

const DEFAULTS = {
  emaFast: 9,
  emaSlow: 21,
  emaTrend: 50,
  slopeEma9Max: -0.00004,
  slopeEma21Max: -0.00003,
  gapEma9_21Pct: 0.00018,
  atrMinPct: 0.0008,
  rsiLength: 14,
  rsiTrigger: 54,
  rsiPre: 53,
  rsiMin: 18,
  stopBars: 2,
  riskReward: 1.0,
  slopeLookback: 3,
  tolTouchPct: 0.0018,
  tolBreakPct: 0.00025,
  candleForceMin: 0.4,
  volMinXvma: 0.5,
  volMaxXvma: 5.0
};

function normalizeSellSniperTuning(raw = {}){
  const tune = { ...raw };
  if (tune.slopeEma9Max == null && Number.isFinite(tune.slopeMin)) {
    tune.slopeEma9Max = tune.slopeMin;
  }
  if (tune.slopeEma21Max == null && Number.isFinite(tune.slopeSlowMin)) {
    tune.slopeEma21Max = tune.slopeSlowMin;
  }
  if (tune.gapEma9_21Pct == null && Number.isFinite(tune.emaGapMin)) {
    tune.gapEma9_21Pct = tune.emaGapMin;
  }
  if (tune.atrMinPct == null && Number.isFinite(tune.atrMinMult)) {
    tune.atrMinPct = tune.atrMinMult;
  }
  if (tune.rsiPre == null && Number.isFinite(tune.rsiPreTrigger)) {
    tune.rsiPre = tune.rsiPreTrigger;
  }
  if (tune.candleForceMin == null && Number.isFinite(tune.bodyStrength)) {
    tune.candleForceMin = tune.bodyStrength;
  }
  if (tune.volMinXvma == null && Number.isFinite(tune.volumeMinMult)) {
    tune.volMinXvma = tune.volumeMinMult;
  }
  if (tune.volMaxXvma == null && Number.isFinite(tune.volumeSpikeMax)) {
    tune.volMaxXvma = tune.volumeSpikeMax;
  }
  if (tune.tolTouchPct == null && Number.isFinite(tune.touchTolerancePct)) {
    tune.tolTouchPct = tune.touchTolerancePct;
  }
  if (tune.tolBreakPct == null && Number.isFinite(tune.breakTolerancePct)) {
    tune.tolBreakPct = tune.breakTolerancePct;
  }
  return tune;
}

function bodyStrength(candle){
  if (!candle) return 0;
  const range = Math.max(1e-9, (Number(candle.h) || 0) - (Number(candle.l) || 0));
  const body = Math.max(0, (Number(candle.o) || 0) - (Number(candle.c) || 0));
  return body / range;
}

export default {
  id: 'sellSniper1m',
  name: 'SELL Sniper 1m',

  detect({ symbol, S, CFG, candles, emaGateOk }) {
    if (!Array.isArray(candles) || candles.length < 30){
      return { reason: 'Histórico insuficiente' };
    }
    if (CFG?.allowSell === false){
      return { reason: 'Vendas desabilitadas' };
    }

    const tune = normalizeSellSniperTuning({
      ...DEFAULTS,
      ...(CFG?.strategyTunings?.sellSniper1m || {})
    });
    const base = `${symbol}_${CFG.tfExec}`;
    const len = candles.length;
    const last = candles[len - 1];
    const prev = candles[len - 2];
    if (!last || !prev || !candles[len - 3]){
      return { reason: 'Velas insuficientes para pullback' };
    }

    const closes = candles.map(c => Number(c.c) || 0);
    const emaFastSeries = emaSeries(closes, tune.emaFast);
    const emaSlowSeries = emaSeries(closes, tune.emaSlow);
    const emaTrendSeries = emaSeries(closes, tune.emaTrend);

    const emaFast = emaFastSeries[len - 1];
    const emaSlow = emaSlowSeries[len - 1];
    const emaFastPrev = emaFastSeries[len - 2];
    const emaSlowPrev = emaSlowSeries[len - 2];
    if ([emaFast, emaSlow, emaFastPrev, emaSlowPrev].some(v => v == null)){
      return { reason: 'EMAs indisponíveis' };
    }

    const price = last.c ?? last.o;
    if (!Number.isFinite(price) || price <= 0){
      return { reason: 'Preço inválido' };
    }

    const slopeFast = computeEmaSlope(candles, tune.emaFast, tune.slopeLookback);
    const slopeSlow = computeEmaSlope(candles, tune.emaSlow, tune.slopeLookback);
    const slopeFastMax = tune.slopeEma9Max ?? tune.slopeMin ?? -0.0002;
    const slopeSlowMax = tune.slopeEma21Max ?? tune.slopeSlowMin ?? slopeFastMax;
    if (slopeFast > slopeFastMax || slopeSlow > slopeSlowMax){
      return { reason: 'Inclinação insuficiente para venda' };
    }

    if (!(emaFast < emaSlow)){
      return { reason: 'EMA curta acima da EMA média' };
    }

    const gap = Math.abs(emaFast - emaSlow) / Math.max(1e-9, price);
    if (gap < (tune.gapEma9_21Pct ?? tune.emaGapMin ?? 0)){
      return { reason: 'EMAs comprimidas (chop)' };
    }

    const atrRaw = S.atr?.[`${base}_atr14`];
    const atrNorm = atrRaw != null ? atrRaw / Math.max(1e-9, price) : null;
    if (atrNorm != null && atrNorm < (tune.atrMinPct ?? tune.atrMinMult ?? 0)){
      return { reason: 'Volatilidade insuficiente' };
    }

    const vma = S.vma?.[`${base}_vma20`];
    const volume = prev?.v ?? last?.v;
    const volumeRatio = vma ? volume / Math.max(1e-9, vma) : null;
    if (volumeRatio != null){
      if (volumeRatio < (tune.volMinXvma ?? tune.volumeMinMult ?? 0)){
        return { reason: 'Volume fraco na retração' };
      }
      if (volumeRatio > (tune.volMaxXvma ?? tune.volumeSpikeMax ?? Infinity)){
        return { reason: 'Volume anômalo (possível absorção)' };
      }
    }

    const tolerance = tune.tolTouchPct ?? tune.touchTolerancePct ?? 0.0007;
    const pullbackTouch = prev.h >= (emaFastPrev ?? emaFast) * (1 - tolerance);
    const pullbackWithin = prev.h <= (emaFastPrev ?? emaFast) * (1 + tolerance * 2);
    const pullbackClosedBelow = prev.c < (emaSlowPrev ?? emaSlow);
    if (!(pullbackTouch && pullbackWithin && pullbackClosedBelow)){
      return { reason: 'Pullback não testou resistência dinâmica' };
    }

    const breakdown = last.c <= prev.l * (1 - (tune.tolBreakPct ?? tune.breakTolerancePct ?? 0));
    const lastBody = bodyStrength(last);
    if (!(breakdown && lastBody >= (tune.candleForceMin ?? tune.bodyStrength ?? 0) && last.c < last.o)){
      return { reason: 'Candle de reversão sem força' };
    }

    const rsiSeries = computeRsiSeries(closes, tune.rsiLength);
    const rsiNow = rsiSeries[len - 1];
    const rsiPrev = rsiSeries[len - 2];
    if (rsiNow == null || rsiPrev == null){
      return { reason: 'RSI indisponível' };
    }
    if (rsiNow < tune.rsiMin){
      return { reason: 'RSI muito esticado para baixo' };
    }
    const crossedDown = rsiPrev >= (tune.rsiPre ?? tune.rsiPreTrigger ?? (tune.rsiTrigger + 2)) && rsiNow <= tune.rsiTrigger;
    if (!crossedDown){
      return { reason: 'RSI não confirmou pressão vendedora' };
    }

    if (emaGateOk && emaGateOk(symbol, 'SELL') === false){
      return { reason: 'Bloqueado pelo EMA Gate (SELL)' };
    }

    const lookback = Math.max(1, Math.floor(tune.stopBars));
    const stopWindow = candles.slice(-1 - lookback, -1);
    if (!stopWindow.length){
      return { reason: 'Janela de stop indisponível' };
    }
    const stopHigh = Math.max(...stopWindow.map(c => Number(c.h) || -Infinity));
    if (!Number.isFinite(stopHigh) || stopHigh <= price){
      return { reason: 'Stop inválido' };
    }

    const entry = Math.min(prev.l, last.c);
    const risk = stopHigh - entry;
    if (!(risk > 0)){
      return { reason: 'Risco não positivo' };
    }
    const tp = entry - risk * (tune.riskReward ?? 1);

    const trendBias = emaTrendSeries[len - 1];

    return {
      side: 'SELL',
      reason: 'SELL Sniper: micro reversão confirmada',
      entry,
      stop: stopHigh,
      tp,
      meta: {
        emaFast,
        emaSlow,
        emaTrend: trendBias,
        slopeFast,
        slopeSlow,
        gap,
        rsi: rsiNow,
        volumeRatio,
        atrNorm
      }
    };
  }
};
