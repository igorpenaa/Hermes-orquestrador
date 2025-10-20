// strategies/secondEntry.mjs
// Adaptação para o Hermes v6 – usa séries já mantidas em S/*
// Ideia: tendência recente + pullback até EMA20/VMA e candle de retomada

export default {
  id: "secondEntry",
  name: "Pullback (Second Entry)",
  detect({ symbol, S, CFG }) {
    const base = `${symbol}_${CFG.tfExec}`;
    const arr = S.candles[base];
    if (!arr || arr.length < 20) return null;

    const i = arr.length - 1;
    const L = arr[i];               // candle atual (fechado)
    const a = arr.slice(-8);        // janela curta p/ direção
    const up   = a[0].c < a[5].c;   // tendência curta de alta
    const down = a[0].c > a[5].c;   // tendência curta de baixa

    const ema20 = S.emas[`${base}_ema20`];
    const vma20 = S.vma[`${base}_vma20`];
    const atr14 = S.atr[`${base}_atr14`] || 0;

    if (ema20 == null || vma20 == null) return null;

    // BUY: tendência curtinha de alta + toque/pullback até média e fechamento positivo
    if (up && L.l <= Math.max(ema20, (a[a.length - 1]?.v ? vma20 : ema20)) && L.c > L.o) {
      return { side: "BUY" };
    }

    // SELL: tendência curtinha de baixa + toque/pullback até média e fechamento negativo
    if (down && L.h >= Math.min(ema20, (a[a.length - 1]?.v ? vma20 : ema20)) && L.c < L.o) {
      return { side: "SELL" };
    }

    return null;
  },
};
