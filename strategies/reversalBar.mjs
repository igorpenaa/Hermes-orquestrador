// strategies/reversalBar.mjs
// Adaptação para o Hermes v6 – barra de reversão (pin bar / martelo / estrela cadente simples)
// Usa proporção de pavio e direção da barra vs. direção recente.

export default {
  id: "reversalBar",
  name: "Reversal Bar",
  detect({ symbol, S, CFG }) {
    const base = `${symbol}_${CFG.tfExec}`;
    const arr = S.candles[base];
    if (!arr || arr.length < 5) return null;

    const i = arr.length - 1;
    const L = arr[i];         // candle atual (fechado)
    const P = arr[i - 1];

    const range = Math.max(1e-12, L.h - L.l);
    const body = Math.abs(L.c - L.o);
    const topWick = L.h - Math.max(L.c, L.o);
    const botWick = Math.min(L.c, L.o) - L.l;

    // direção recente (5 velas)
    const recent = arr.slice(-5);
    const upBias = recent[0].c < recent[recent.length - 1].c;
    const dnBias = recent[0].c > recent[recent.length - 1].c;

    // Hammer (reversão de baixa -> alta): pavio inferior longo, corpo pequeno/fechamento positivo
    const isHammer =
      botWick / range >= 0.55 && body / range <= 0.35 && L.c > L.o;

    // Shooting star (reversão de alta -> baixa): pavio superior longo, corpo pequeno/fechamento negativo
    const isStar =
      topWick / range >= 0.55 && body / range <= 0.35 && L.c < L.o;

    // Confirmação leve: a barra anterior foi no sentido oposto
    const prevBear = P.c < P.o;
    const prevBull = P.c > P.o;

    // BUY se viés recente estava de baixa (ou última barra bearish) e surge martelo
    if (isHammer && (dnBias || prevBear)) {
      return { side: "BUY" };
    }

    // SELL se viés recente estava de alta (ou última barra bullish) e surge shooting star
    if (isStar && (upBias || prevBull)) {
      return { side: "SELL" };
    }

    return null;
  },
};
