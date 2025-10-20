// strategies/symmetricalTriangle.mjs
// Adaptação para o Hermes v6 – Triângulo simétrico + ruptura
// Checa pico de máximas descendente e mínimas ascendentes numa janela e busca rompimento na barra seguinte.

export default {
  id: "symTriangle",
  name: "Triângulo Simétrico",
  detect({ symbol, S, CFG }) {
    const base = `${symbol}_${CFG.tfExec}`;
    const arr = S.candles[base];
    if (!arr || arr.length < 26) return null;

    // Usamos 10 velas prévias (exclui a última) para medir inclinação dos topos/fundos
    const win = arr.slice(-12, -2);
    const hs = win.map(x => x.h);
    const ls = win.map(x => x.l);
    if (hs.length < 2 || ls.length < 2) return null;

    const upperSlope = (hs[hs.length - 1] - hs[0]) / Math.max(1e-9, hs[0]);
    const lowerSlope = (ls[ls.length - 1] - ls[0]) / Math.max(1e-9, ls[0]);

    // condição básica de triângulo simétrico: topos descendo e fundos subindo
    if (!(upperSlope < 0 && lowerSlope > 0)) return null;

    const i = arr.length - 1;
    const L = arr[i];
    const B1 = arr[i - 1];

    const hi = Math.max(...hs);
    const lo = Math.min(...ls);

    // Rompimento para cima: B1 fecha acima da borda superior e L confirma positivo
    if (B1.c > hi && L.c > L.o) {
      return { side: "BUY" };
    }

    // Rompimento para baixo: B1 fecha abaixo da borda inferior e L confirma negativo
    if (B1.c < lo && L.c < L.o) {
      return { side: "SELL" };
    }

    return null;
  },
};
