// Weave VWAP Revert (WVR) — fades contrários em ranges comprimidos ao redor da VWAP.
import { computeAnchoredVwap, computeAdx, computeBollingerWidth, percentileRank, candleWickInfo } from './indicators.mjs';

const DEFAULTS = {
  adx5Max: 18,
  bbwPctMax: 55,
  atrMin: 0.0020,
  atrMax: 0.0050,
  distVwapXatr: 0.90,
  pavioMin: 0.25,
  volXVma: 0.65,
  gapEma950Max: 0.00022,
  filterDirection: false,
  tp1Xatr: 0.6,
  tp2Target: 'VWAP',
  stopXatr: 1.3,
  sessionMinutes: 1440,
  emaFast: 9,
  emaSlow: 50,
  emaPeriod: 100,
  emaTrend: 200
};

function sessionAnchorTs(candles, minutes){
  if (!Array.isArray(candles) || !candles.length) return null;
  const last = candles[candles.length - 1];
  const ms = Math.max(1, minutes) * 60 * 1000;
  return Math.floor((last?.t ?? Date.now()) / ms) * ms;
}

function getAtr(S, symbol, CFG){
  const base = `${symbol}_${CFG.tfExec}`;
  return S.atr?.[`${base}_atr14`] ?? null;
}

function getVolumeRatio(S, symbol, CFG){
  const base = `${symbol}_${CFG.tfExec}`;
  const data = S.candles?.[base];
  if (!Array.isArray(data) || data.length < 2) return null;
  const prev = data[data.length - 2];
  const current = data[data.length - 1];
  const vma = S.vma?.[`${base}_vma20`];
  const vol = prev?.v ?? current?.v;
  if (vol == null || !vma) return null;
  return vol / Math.max(1e-9, vma);
}

function getAdx5(S, symbol, CFG){
  const tf = CFG.tfRegA || '5m';
  const candles = S?.candles?.[`${symbol}_${tf}`] || [];
  const res = computeAdx(candles, 14);
  return res ? res.adx : null;
}

function computeBbwPercentile(candles){
  if (!Array.isArray(candles) || candles.length < 25) return { pct: null, width: null };
  const widths = [];
  for (let i = 20; i <= candles.length; i += 1){
    const slice = candles.slice(i - 20, i);
    const res = computeBollingerWidth(slice, 20, 2);
    if (res) widths.push(res.width);
  }
  const width = widths.length ? widths[widths.length - 1] : null;
  if (width == null) return { pct: null, width: null };
  const pct = percentileRank(widths, width);
  return { pct, width };
}

function emaClusterSpread(ctx, price, tune){
  if (!ctx || price == null) return null;
  const periods = new Set([tune.emaFast ?? 9, 20, tune.emaSlow ?? 50, 100, 200]);
  const values = Array.from(periods).map(period => ctx.ema?.[period]).filter(v => v != null);
  if (values.length < 2) return null;
  return (Math.max(...values) - Math.min(...values)) / Math.max(1e-9, price);
}

export default {
  id: 'weaveVwapRevert',
  name: 'Weave VWAP Revert (WVR)',
  detect({ symbol, S, CFG, candles, ctx, emaGateOk }) {
    if (!Array.isArray(candles) || candles.length < 25) return null;
    const tune = { ...DEFAULTS, ...(CFG?.strategyTunings?.weaveVwapRevert || {}) };

    const anchor = sessionAnchorTs(candles, tune.sessionMinutes ?? 1440);
    const vwap = computeAnchoredVwap(candles, anchor);
    if (vwap == null) return { reason: 'VWAP indisponível' };

    const atr = getAtr(S, symbol, CFG);
    if (atr == null || atr === 0) return { reason: 'ATR indisponível' };

    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    if (!last || !prev) return null;

    const price = last.c;
    if (price == null) return { reason: 'Preço indisponível' };

    const atrNorm = atr / Math.max(1e-9, price);
    if (atrNorm < (tune.atrMin ?? 0)) return { reason: 'ATR abaixo da faixa' };
    if (atrNorm > (tune.atrMax ?? Infinity)) return { reason: 'ATR acima da faixa' };

    const adx5 = getAdx5(S, symbol, CFG);
    if (adx5 != null && adx5 > (tune.adx5Max ?? 20)) return { reason: 'ADX alto (tendência)' };

    const { pct: bbwPct } = computeBbwPercentile(candles);
    if (bbwPct != null && bbwPct > (tune.bbwPctMax ?? 55)) return { reason: 'Bandas ainda abertas' };

    const ema9 = ctx?.ema?.[tune.emaFast ?? 9];
    const ema50 = ctx?.ema?.[tune.emaSlow ?? 50];
    const gap = (ema9 != null && ema50 != null)
      ? Math.abs(ema9 - ema50) / Math.max(1e-9, price)
      : null;
    if (gap != null && gap > (tune.gapEma950Max ?? 0.00022)) return { reason: 'Gap EMA9-50 elevado' };

    const clusterSpread = emaClusterSpread(ctx, price, tune);
    if (clusterSpread != null && clusterSpread > ((tune.gapEma950Max ?? 0.00022) * 2.5)) return { reason: 'EMAs abrindo' };

    const volRatio = getVolumeRatio(S, symbol, CFG);
    if (volRatio != null && volRatio < (tune.volXVma ?? 0)) return { reason: 'Volume insuficiente' };
    if (volRatio != null && volRatio > 3) return { reason: 'Volume fora do regime' };

    const wick = candleWickInfo(last);
    const range = wick.range || Math.max(1e-9, last.h - last.l);
    const lowerRatio = range ? wick.lower / range : 0;
    const upperRatio = range ? wick.upper / range : 0;

    const lowerDist = last.l < vwap ? (vwap - last.l) / atr : 0;
    const upperDist = last.h > vwap ? (last.h - vwap) / atr : 0;
    const closeDist = Math.abs(last.c - vwap) / atr;

    const alternateColor = (last.c > last.o && prev.c < prev.o) || (last.c < last.o && prev.c > prev.o);

    const strictReturn = !!tune.filterDirection;
    const returnThreshold = Math.max(0.2, (tune.distVwapXatr ?? 0.9) * 0.85);

    const allowBuy = CFG.allowBuy !== false;
    const allowSell = CFG.allowSell !== false;

    if (allowBuy && lowerDist >= (tune.distVwapXatr ?? 0.9) && lowerRatio >= (tune.pavioMin ?? 0.25) && alternateColor){
      if (!strictReturn || closeDist <= returnThreshold){
        if (emaGateOk && emaGateOk(symbol, 'BUY') === false) return { reason: 'Bloqueado pelo EMA Gate (BUY)' };
        return { side: 'BUY', reason: 'Fade inferior na VWAP (Weave)' };
      }
    }

    if (allowSell && upperDist >= (tune.distVwapXatr ?? 0.9) && upperRatio >= (tune.pavioMin ?? 0.25) && alternateColor){
      if (!strictReturn || closeDist <= returnThreshold){
        if (emaGateOk && emaGateOk(symbol, 'SELL') === false) return { reason: 'Bloqueado pelo EMA Gate (SELL)' };
        return { side: 'SELL', reason: 'Fade superior na VWAP (Weave)' };
      }
    }

    if (!alternateColor) return { reason: 'Sem alternância de cor' };
    if (lowerRatio < (tune.pavioMin ?? 0.25) && upperRatio < (tune.pavioMin ?? 0.25)) return { reason: 'Sem pavio de exaustão' };
    if (lowerDist < (tune.distVwapXatr ?? 0.9) && upperDist < (tune.distVwapXatr ?? 0.9)) return { reason: 'Sem afastamento da VWAP' };
    if (strictReturn && closeDist > returnThreshold) return { reason: 'Aguardando retorno à VWAP' };

    return { reason: 'Condições gerais atendidas, aguardando gatilho' };
  }
};
