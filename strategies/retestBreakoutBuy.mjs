// Hermes v6 – Retest Breakout (Buy)
// Detecta rompimento forte, pullback rápido até a região rompida e nova barra de confirmação.
// Retorna apenas { side: "BUY" } no padrão do loader.

export default {
  id: "retestBreakoutBuy",
  name: "Retest Breakout (Buy)",

  detect({ symbol, S, CFG }) {
    const base = `${symbol}_${CFG.tfExec}`;
    const a = S.candles[base];
    if (!a || a.length < 6) return null;

    // ---- helpers locais (sem dependências externas)
    const i = a.length - 1;
    const C = k => a[i - k]; // k: 0=última (L), 1=retorno (r), 2=barra do rompimento (b), 3=prev
    const eps = 1e-9;
    const body = c => Math.abs(c.c - c.o);
    const range = c => Math.max(eps, c.h - c.l);
    const bodyFrac = c => body(c) / range(c);
    const strongBull = (c, minFrac = 0.55) => c.c > c.o && bodyFrac(c) >= minFrac;

    // parâmetros simples (ajuste fino se quiser)
    const BREAK_EPS = 0.0007;  // tolerância p/ "acima de"
    const RETEST_EPS = 0.0015; // quão perto precisa “tocar” a zona
    const CONFIRM_MIN_FRAC = 0.55;

    const prev = C(3), b = C(2), r = C(1), L = C(0);

    // 1) Rompimento forte na barra b acima da máxima de prev
    const broke =
      strongBull(b, CONFIRM_MIN_FRAC) &&
      b.c >= prev.h * (1 + BREAK_EPS);

    // 2) Reteste: a mínima de r volta próximo/na região do topo de b
    const touched = r.l <= b.h * (1 + RETEST_EPS);

    // 3) Confirmação: última barra volta a subir com corpo saudável
    const confirm = strongBull(L, CONFIRM_MIN_FRAC);

    if (!(broke && touched && confirm)) return null;

    // (opcional) Checagens leves com ATR para não aceitar barras minúsculas/gigantes
    const atr = S.atr[`${base}_atr14`] || 0;
    if (atr > 0) {
      const okNotTiny  = range(L) >= 0.25 * atr;
      const okNotHuge  = range(L) <= 3.0  * atr;
      if (!(okNotTiny && okNotHuge)) return null;
    }

    return { side: "BUY", reason: "Retest Breakout (Buy)" };
  }
};
