// Triple Level — adaptação p/ Hermes v6 (detector direto, sem deps externas)
// Mantém a lógica essencial: 3 níveis formados no histórico; gatilho no B1 e confirmação no L.  :contentReference[oaicite:3]{index=3}

const P = {
  windowLevels: 14,  // janela para níveis (≈ original: slice -14..-2)
  minBars: 22,
  breakoutEps: 0,
};

function lastClose(c, n=0){ return c[c.length-1-n]; }

function buildSeries({ S, CFG, symbol }) {
  const base = `${symbol}_${CFG.tfExec}`;
  const a = S.candles[base] || [];
  const c = a.map(k => ({ open:+k.o, high:+k.h, low:+k.l, close:+k.c }));
  return c;
}

export default {
  id: "tripleLevel",
  name: "Triple Level",
  detect({ symbol, S, CFG }) {
    const c = buildSeries({ S, CFG, symbol });
    if (!Array.isArray(c) || c.length < P.minBars) return null;

    const L  = lastClose(c, 0);
    const B1 = lastClose(c, 1);

    const z = c.slice(-P.windowLevels-2, -2).map(x=>({ h:x.high, l:x.low }));
    if (z.length < 6) return null;

    const l1 = Math.min(...z.map(x=>x.l));   // “piso”
    const l3 = Math.max(...z.map(x=>x.h));   // “teto”

    const long  = (B1.close > l3 + P.breakoutEps) && (L.close > L.open);
    const short = (B1.close < l1 - P.breakoutEps) && (L.close < L.open);

    if (long)  return { side: "BUY",  reason: "TripleLevel break up" };
    if (short) return { side: "SELL", reason: "TripleLevel break down" };
    return null;
  }
};
