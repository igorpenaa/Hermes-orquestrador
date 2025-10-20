// Hermes v6 – Strategy module
// Detecção simples de "Gap + Rejeição" baseada apenas nos dados que o Hermes mantém (candles, ATR, EMAs).
// id: gapRejection • name: Gap Rejection

export default {
  id: "gapRejection",
  name: "Gap Rejection",
  /**
   * @param {{symbol:string,S:any,CFG:any}} ctx
   * @returns {{side:'BUY'|'SELL'}|null}
   */
  detect({ symbol, S, CFG }) {
    try {
      const base = `${symbol}_${CFG.tfExec}`;
      const a = S.candles[base];
      if (!a || a.length < 3) return null;

      const i  = a.length - 1;
      const L  = a[i];       // última
      const C1 = a[i - 1];   // penúltima
      const C0 = a[i - 2];   // antepenúltima
      if (!L || !C1 || !C0) return null;

      const atr  = S.atr[`${base}_atr14`] || 0;
      const minGapPct = Math.max(0.008, (atr / Math.max(1e-9, L.c)) * 0.8);

      const gapUp = C1.o > C0.c * (1 + minGapPct);
      const gapDn = C1.o < C0.c * (1 - minGapPct);

      // Filtros leves para evitar barras "fora da curva"
      const rangeL = Math.max(1e-9, L.h - L.l);
      const wickTop = L.h - Math.max(L.c, L.o);
      const wickBot = Math.min(L.c, L.o) - L.l;
      const wickMaxRatio = Math.max(wickTop, wickBot) / rangeL;
      if (wickMaxRatio > 0.8) return null; // pavio exagerado

      // Regras:
      // gapUp + candle atual vermelho + máxima da atual < máxima da barra do gap => rejeição para SELL
      if (gapUp && (L.c < L.o) && (L.h < C1.h)) {
        return { side: "SELL" };
      }
      // gapDn + candle atual verde + mínima da atual > mínima da barra do gap => rejeição para BUY
      if (gapDn && (L.c > L.o) && (L.l > C1.l)) {
        return { side: "BUY" };
      }
      return null;
    } catch (_e) {
      return null;
    }
  }
};
