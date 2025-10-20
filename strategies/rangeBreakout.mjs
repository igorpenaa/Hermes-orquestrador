// Range + Breakout — adaptação p/ Hermes v6 (detector enxuto, sem deps externas)
// Preserva a ideia original: caixa das últimas velas, break acima/abaixo e fakeouts.  :contentReference[oaicite:2]{index=2}

const P = {
  breakoutEps: 0,         // tolerância
  lookbackBox: 16,        // tamanho da caixa (≈ original: -16..-2)
  minBars: 22,            // barras mínimas para evitar ruído
  wickBodyRatioMin: 0.6,  // p/ fakeouts
};

function lastClose(c, n=0){ return c[c.length-1-n]; }

function buildSeries({ S, CFG, symbol }) {
  const base = `${symbol}_${CFG.tfExec}`;
  const a = S.candles[base] || [];
  // mapeia no formato esperado pela lógica (OHLC)
  const c = a.map(k => ({ open:+k.o, high:+k.h, low:+k.l, close:+k.c }));
  return c;
}

export default {
  id: "rangeBreakout",
  name: "Range + Breakout",
  detect({ symbol, S, CFG }) {
    const c = buildSeries({ S, CFG, symbol });
    if (!Array.isArray(c) || c.length < P.minBars) return null;

    const L  = lastClose(c, 0);
    const B1 = lastClose(c, 1);
    const box = c.slice(-P.lookbackBox-2, -2);
    if (box.length < 4) return null;

    const hi = Math.max(...box.map(x=>x.high));
    const lo = Math.min(...box.map(x=>x.low));

    // fakeouts (idêntica à ideia original)
    const bodyB1 = Math.abs(B1.close - B1.open);
    const fakeUp = (B1.high > hi && B1.close < hi && (B1.high - B1.close) > bodyB1 * P.wickBodyRatioMin);
    const fakeDn = (B1.low  < lo && B1.close > lo && (B1.close - B1.low ) > bodyB1 * P.wickBodyRatioMin);

    const breakoutUp   = (B1.close > hi + P.breakoutEps) && (L.close > L.open);
    const breakoutDown = (B1.close < lo - P.breakoutEps) && (L.close < L.open);

    if ((breakoutUp || fakeDn)) {
      return { side: "BUY",  reason: "Range breakout/fakeDn" };
    }
    if ((breakoutDown || fakeUp)) {
      return { side: "SELL", reason: "Range breakdown/fakeUp" };
    }
    return null;
  }
};
