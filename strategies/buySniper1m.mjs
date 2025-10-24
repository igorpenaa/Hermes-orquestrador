// BUY Sniper 1m — micro pullbacks agressivos na tendência curta
import { emaSeries, computeEmaSlope, computeRsiSeries } from './indicators.mjs';

const DEFAULTS = {
  emaFast: 9,
  emaSlow: 21,
  emaTrend: 50,
  slopeEma9Min: 0.00005,
  slopeEma21Min: 0.00004,
  slopeMin: 0.00005,
  slopeSlowMin: 0.00004,
  emaGapMin: 0.00018,
  gapEma9_21Pct: 0.00018,
  atrMinPct: 0.0008,
  atrMinMult: 0.0008,
  rsiLength: 14,
  rsiTrigger: 46,
  rsiPre: 44,
  rsiPreTrigger: 44,
  rsiMax: 85,
  stopBars: 2,
  riskReward: 1.0,
  slopeLookback: 3,
  touchTolerancePct: 0.0016,
  breakTolerancePct: 0.00025,
  tolTouchPct: 0.0016,
  tolBreakPct: 0.00025,
  bodyMin: 0.4,
  bodyStrength: 0.4,
  volumeMinMult: 0.5,
  volumeSpikeMax: 5,
  volMinXvma: 0.5,
  volMaxXvma: 5
};

function bodyStrength(candle){
  if (!candle) return 0;
  const range = Math.max(1e-9, (Number(candle.h) || 0) - (Number(candle.l) || 0));
  const body = Math.max(0, (Number(candle.c) || 0) - (Number(candle.o) || 0));
  return body / range;
}

export default {
  id: 'buySniper1m',
  name: 'BUY Sniper 1m',

  detect({ symbol, S, CFG, candles, emaGateOk }) {
    if (!Array.isArray(candles) || candles.length < 30){
      return { reason: 'Histórico insuficiente' };
    }
    if (CFG?.allowBuy === false){
      return { reason: 'Compras desabilitadas' };
    }

    const tune = { ...DEFAULTS, ...(CFG?.strategyTunings?.buySniper1m || {}) };
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
    const slopeFastMin = tune.slopeEma9Min ?? tune.slopeMin;
    const slopeSlowMin = tune.slopeEma21Min ?? tune.slopeSlowMin ?? slopeFastMin;
    if (slopeFast < slopeFastMin || slopeSlow < slopeSlowMin){
      return { reason: 'Inclinação insuficiente da tendência curta' };
    }

    if (!(emaFast > emaSlow)){
      return { reason: 'EMA curta abaixo da EMA média' };
    }

    const gap = Math.abs(emaFast - emaSlow) / Math.max(1e-9, price);
    const gapMin = tune.gapEma9_21Pct ?? tune.emaGapMin;
    if (gap < gapMin){
      return { reason: 'EMAs comprimidas (chop)' };
    }

    const atrRaw = S.atr?.[`${base}_atr14`];
    const atrNorm = atrRaw != null ? atrRaw / Math.max(1e-9, price) : null;
    const atrMin = tune.atrMinPct ?? tune.atrMinMult;
    if (atrNorm != null && atrNorm < atrMin){
      return { reason: 'Volatilidade insuficiente' };
    }

    const vma = S.vma?.[`${base}_vma20`];
    const volume = prev?.v ?? last?.v;
    const volumeRatio = vma ? volume / Math.max(1e-9, vma) : null;
    if (volumeRatio != null){
      const volumeMin = tune.volMinXvma ?? tune.volumeMinMult ?? 0;
      if (volumeRatio < volumeMin){
        return { reason: 'Volume fraco no pullback' };
      }
      const volumeMax = tune.volMaxXvma ?? tune.volumeSpikeMax ?? Infinity;
      if (volumeRatio > volumeMax){
        return { reason: 'Volume anômalo (possível exaustão)' };
      }
    }

    const tolerance = tune.tolTouchPct ?? tune.touchTolerancePct ?? 0.0007;
    const pullbackTouch = prev.l <= (emaFastPrev ?? emaFast) * (1 + tolerance);
    const pullbackClosedAbove = prev.c > (emaSlowPrev ?? emaSlow);
    if (!(pullbackTouch && pullbackClosedAbove)){
      return { reason: 'Pullback não tocou suporte dinâmico' };
    }

    const breakTol = tune.tolBreakPct ?? tune.breakTolerancePct ?? 0;
    const breakout = last.c >= prev.h * (1 + breakTol);
    const lastBody = bodyStrength(last);
    const minBody = tune.bodyMin ?? tune.bodyStrength ?? 0;
    if (!(breakout && lastBody >= minBody && last.c > last.o)){
      return { reason: 'Candle de retomada sem força' };
    }

    const rsiSeries = computeRsiSeries(closes, tune.rsiLength);
    const rsiNow = rsiSeries[len - 1];
    const rsiPrev = rsiSeries[len - 2];
    if (rsiNow == null || rsiPrev == null){
      return { reason: 'RSI indisponível' };
    }
    if (rsiNow > tune.rsiMax){
      return { reason: 'RSI muito esticado' };
    }
    const rsiPre = tune.rsiPre ?? tune.rsiPreTrigger ?? (tune.rsiTrigger - 2);
    const crossedUp = rsiPrev <= rsiPre && rsiNow >= tune.rsiTrigger;
    if (!crossedUp){
      return { reason: 'RSI não confirmou momentum' };
    }

    if (emaGateOk && emaGateOk(symbol, 'BUY') === false){
      return { reason: 'Bloqueado pelo EMA Gate (BUY)' };
    }

    const lookback = Math.max(1, Math.floor(tune.stopBars));
    const stopWindow = candles.slice(-1 - lookback, -1);
    if (!stopWindow.length){
      return { reason: 'Janela de stop indisponível' };
    }
    const stopLow = Math.min(...stopWindow.map(c => Number(c.l) || Infinity));
    if (!Number.isFinite(stopLow) || stopLow >= price){
      return { reason: 'Stop inválido' };
    }

    const entry = Math.max(prev.h, last.c);
    const risk = entry - stopLow;
    if (!(risk > 0)){
      return { reason: 'Risco não positivo' };
    }
    const tp = entry + risk * (tune.riskReward ?? 1);

    const trendBias = emaTrendSeries[len - 1];

    return {
      side: 'BUY',
      reason: 'BUY Sniper: pullback relâmpago retomado',
      entry,
      stop: stopLow,
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
