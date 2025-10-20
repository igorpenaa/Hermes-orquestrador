// Hermes v6 – Retest Breakdown (Sell)
// Rompimento forte para baixo, pullback até região rompida e nova barra de confirmação de baixa.

export default {
  id: "retestBreakdownSell",
  name: "Retest Breakdown (Sell)",

  detect({ symbol, S, CFG }) {
    const base = `${symbol}_${CFG.tfExec}`;
    const a = S.candles[base];
    if (!a || a.length < 6) return null;

    const i = a.length - 1;
    const C = k => a[i - k];
    const eps = 1e-9;
    const body = c => Math.abs(c.c - c.o);
    const range = c => Math.max(eps, c.h - c.l);
    const bodyFrac = c => body(c) / range(c);
    const strongBear = (c, minFrac = 0.55) => c.c < c.o && bodyFrac(c) >= minFrac;

    const BREAK_EPS = 0.0007;
    const RETEST_EPS = 0.0015;
    const CONFIRM_MIN_FRAC = 0.55;

    const prev = C(3), b = C(2), r = C(1), L = C(0);

    // 1) Rompimento forte para baixo na barra b (fechando abaixo da mínima de prev)
    const broke =
      strongBear(b, CONFIRM_MIN_FRAC) &&
      b.c <= prev.l * (1 - BREAK_EPS);

    // 2) Reteste: a máxima de r volta próximo/na região do fundo de b
    const touched = r.h >= b.l * (1 - RETEST_EPS);

    // 3) Confirmação: última barra volta a cair com corpo saudável
    const confirm = strongBear(L, CONFIRM_MIN_FRAC);

    if (!(broke && touched && confirm)) return null;

    // filtro leve via ATR
    const atr = S.atr[`${base}_atr14`] || 0;
    if (atr > 0) {
      const okNotTiny  = range(L) >= 0.25 * atr;
      const okNotHuge  = range(L) <= 3.0  * atr;
      if (!(okNotTiny && okNotHuge)) return null;
    }

    return { side: "SELL", reason: "Retest Breakdown (Sell)" };
  }
};
