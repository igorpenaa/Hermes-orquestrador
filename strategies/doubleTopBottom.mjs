// strategies/doubleTopBottom.mjs
// Hermes v6 strategy module interface:
// export default { id, name, detect({ symbol, S, CFG }) => { side:'BUY'|'SELL', reason?:string } | null }

import { emaSeries } from './indicators.mjs';

const ID   = "doubleTopBottom";
const NAME = "Double Top / Bottom";

const DEFAULTS = {
  emaRef1: 14,
  emaRef2: 35,
  atrMin: 0.0025,
  atrMax: 0.042,
  slopeNeutroMax: 0.0015,
  slopeLookback: 5,
  peakTolerancePct: 0.003,
  neckBreakTolPct: 0.0007,
  bodyStrengthMin: 0.55,
  reverseOrder: false
};

function seriesSlope(series, lookback = 3){
  if (!Array.isArray(series) || !series.length) return 0;
  const end = series.length - 1;
  const prev = Math.max(0, end - Math.max(1, Math.floor(lookback)));
  const a = series[end];
  const b = series[prev];
  if (a == null || b == null) return 0;
  const denom = Math.max(1e-9, Math.abs(b));
  return (a - b) / denom;
}

/**
 * Utilidades locais (sem dependências externas)
 */
function bodyStrength(c) {
  const body = Math.abs(c.c - c.o);
  const range = Math.max(1e-12, c.h - c.l);
  return body / range; // 0..1
}
function approxEq(a, b, tolPct) {
  if (a === 0 || b === 0) return false;
  const d = Math.abs(a - b) / ((Math.abs(a) + Math.abs(b)) / 2);
  return d <= tolPct;
}
function lastClosed(candles) {
  // último candle da lista é fechado quando chamado no onMinuteClose
  return candles[candles.length - 1];
}
function prevClosed(candles) {
  return candles[candles.length - 2];
}
function localExtrema(window) {
  const tops = [];
  const bots = [];
  for (let i = 1; i < window.length - 1; i++) {
    const p = window[i - 1], c = window[i], n = window[i + 1];
    if (c.h > p.h && c.h > n.h) tops.push({ i, h: c.h, l: c.l });
    if (c.l < p.l && c.l < n.l) bots.push({ i, h: c.h, l: c.l });
  }
  return { tops, bots };
}

/**
 * Detector:
 * - Procura 2 topos (ou 2 fundos) com alturas (ou profundidades) próximas (<=0.3%)
 * - “Pescoço” = menor mínima do range (para topo duplo) / maior máxima (para fundo duplo)
 * - Confirmação = fechamento rompe o pescoço e a vela tem corpo forte
 */
function detect({ symbol, S, CFG }) {
  const tune = {
    ...DEFAULTS,
    ...(CFG?.strategyTunings?.doubleTopBottom || {})
  };
  const emaRef1 = Math.max(1, Math.round(tune.emaRef1 ?? tune.emaFast ?? DEFAULTS.emaRef1));
  const emaRef2 = Math.max(1, Math.round(tune.emaRef2 ?? tune.emaSlow ?? DEFAULTS.emaRef2));
  const atrMin = Number.isFinite(Number(tune.atrMin)) ? Number(tune.atrMin) : DEFAULTS.atrMin;
  const atrMax = Number.isFinite(Number(tune.atrMax)) ? Number(tune.atrMax) : DEFAULTS.atrMax;
  const slopeNeutralMax = Math.abs(Number.isFinite(Number(tune.slopeNeutroMax ?? tune.slopeNeutralMax))
    ? Number(tune.slopeNeutroMax ?? tune.slopeNeutralMax)
    : DEFAULTS.slopeNeutroMax);
  const slopeLookback = Math.max(1, Math.floor(tune.slopeLookback ?? DEFAULTS.slopeLookback));
  const peakTolerance = Math.max(1e-5, tune.peakTolerancePct ?? DEFAULTS.peakTolerancePct);
  const breakTolerance = Math.max(0, Math.min(0.05, tune.neckBreakTolPct ?? tune.breakTolerancePct ?? DEFAULTS.neckBreakTolPct));
  const minBodyStrength = Math.max(0, Math.min(1, tune.bodyStrengthMin ?? tune.bodyMin ?? DEFAULTS.bodyStrengthMin));
  const reverseOrder = Boolean(tune.reverseOrder ?? tune.orderReversal ?? DEFAULTS.reverseOrder);

  const base = `${symbol}_${CFG.tfExec}`;
  const arr = S.candles[base];
  if (!arr || arr.length < 30) return null;

  const win = arr.slice(-22); // janela recente
  const L   = lastClosed(win);
  const B1  = prevClosed(win);

  const priceRef = B1?.c ?? L?.c ?? null;
  if (priceRef == null || !Number.isFinite(priceRef) || priceRef <= 0) return null;

  const closes = arr.map(c => Number(c?.c) || 0);
  const emaRef1Series = emaSeries(closes, emaRef1);
  const emaRef2Series = emaSeries(closes, emaRef2);
  const emaRef1Val = emaRef1Series[emaRef1Series.length - 1];
  const emaRef2Val = emaRef2Series[emaRef2Series.length - 1];
  if (emaRef1Val == null || emaRef2Val == null) {
    return null;
  }
  const slopeNeutral = Math.abs(seriesSlope(emaRef1Series, slopeLookback));
  if (slopeNeutral > slopeNeutralMax) {
    return null;
  }

  const atrKey = `${base}_atr14`;
  const atrRaw = S.atr?.[atrKey];
  const atrFallback = Math.max(0, (B1?.h ?? 0) - (B1?.l ?? 0));
  const atrPct = (atrRaw != null ? atrRaw : atrFallback) / Math.max(1e-9, priceRef);
  if (Number.isFinite(atrPct)) {
    if (atrPct < atrMin || atrPct > atrMax) {
      return null;
    }
  }

  const { tops, bots } = localExtrema(win);

  // ---- Double Top -> SELL
  if (tops.length >= 2) {
    const t1 = tops[tops.length - 2];
    const t2 = tops[tops.length - 1];
    // topos com alturas muito próximas (0.3%)
    if (approxEq(t1.h, t2.h, peakTolerance)) {
      // pescoço = menor mínima no intervalo entre os topos
      const from = Math.min(t1.i, t2.i);
      const to   = Math.max(t1.i, t2.i);
      const neck = Math.min(...win.slice(from, to + 1).map(c => c.l));

      // rompimento do pescoço (fechamento abaixo) + corpo forte
      const broke = (B1.c <= neck * (1 - breakTolerance)) || (L.c <= neck * (1 - breakTolerance));
      const strong = bodyStrength(L) >= minBodyStrength;

      if (broke && strong) {
        const side = reverseOrder ? "BUY" : "SELL";
        return { side, reason: reverseOrder ? "Double Top (reverse)" : "Double Top" };
      }
    }
  }

  // ---- Double Bottom -> BUY
  if (bots.length >= 2) {
    const b1 = bots[bots.length - 2];
    const b2 = bots[bots.length - 1];
    // fundos com profundidades muito próximas (0.3%)
    if (approxEq(b1.l, b2.l, peakTolerance)) {
      // pescoço = maior máxima no intervalo entre os fundos
      const from = Math.min(b1.i, b2.i);
      const to   = Math.max(b1.i, b2.i);
      const neck = Math.max(...win.slice(from, to + 1).map(c => c.h));

      // rompimento do pescoço (fechamento acima) + corpo forte
      const broke = (B1.c >= neck * (1 + breakTolerance)) || (L.c >= neck * (1 + breakTolerance));
      const strong = bodyStrength(L) >= minBodyStrength;

      if (broke && strong) {
        const side = reverseOrder ? "SELL" : "BUY";
        return { side, reason: reverseOrder ? "Double Bottom (reverse)" : "Double Bottom" };
      }
    }
  }

  return null;
}

export default { id: ID, name: NAME, detect };
