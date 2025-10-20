// strategies/doubleTopBottom.mjs
// Hermes v6 strategy module interface:
// export default { id, name, detect({ symbol, S, CFG }) => { side:'BUY'|'SELL', reason?:string } | null }

const ID   = "doubleTopBottom";
const NAME = "Double Top / Bottom";

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
  const base = `${symbol}_${CFG.tfExec}`;
  const arr = S.candles[base];
  if (!arr || arr.length < 30) return null;

  const win = arr.slice(-22); // janela recente
  const L   = lastClosed(win);
  const B1  = prevClosed(win);

  const { tops, bots } = localExtrema(win);

  // ---- Double Top -> SELL
  if (tops.length >= 2) {
    const t1 = tops[tops.length - 2];
    const t2 = tops[tops.length - 1];
    // topos com alturas muito próximas (0.3%)
    if (approxEq(t1.h, t2.h, 0.003)) {
      // pescoço = menor mínima no intervalo entre os topos
      const from = Math.min(t1.i, t2.i);
      const to   = Math.max(t1.i, t2.i);
      const neck = Math.min(...win.slice(from, to + 1).map(c => c.l));

      // rompimento do pescoço (fechamento abaixo) + corpo forte
      const broke = (B1.c < neck * 1.0007) || (L.c < neck * 1.0007); // 0.07% de folga
      const strong = bodyStrength(L) >= 0.55;

      if (broke && strong) {
        return { side: "SELL", reason: "Double Top" };
      }
    }
  }

  // ---- Double Bottom -> BUY
  if (bots.length >= 2) {
    const b1 = bots[bots.length - 2];
    const b2 = bots[bots.length - 1];
    // fundos com profundidades muito próximas (0.3%)
    if (approxEq(b1.l, b2.l, 0.003)) {
      // pescoço = maior máxima no intervalo entre os fundos
      const from = Math.min(b1.i, b2.i);
      const to   = Math.max(b1.i, b2.i);
      const neck = Math.max(...win.slice(from, to + 1).map(c => c.h));

      // rompimento do pescoço (fechamento acima) + corpo forte
      const broke = (B1.c > neck * 0.9993) || (L.c > neck * 0.9993); // 0.07% de folga
      const strong = bodyStrength(L) >= 0.55;

      if (broke && strong) {
        return { side: "BUY", reason: "Double Bottom" };
      }
    }
  }

  return null;
}

export default { id: ID, name: NAME, detect };
