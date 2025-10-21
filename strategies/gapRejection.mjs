// Hermes v6 – Strategy module
// Detecção simples de "Gap + Rejeição" baseada apenas nos dados que o Hermes mantém (candles, ATR, EMAs).
// id: gapRejection • name: Gap Rejection

const DEFAULTS = {
  gapFloorPct: 0.008,
  gapAtrMult: 0.8,
  wickMaxRatio: 0.8,
  rejectionBufferPct: 0.0005
};

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

      const tune = { ...DEFAULTS, ...(CFG?.strategyTunings?.gapRejection || {}) };

      const atrRaw = Number(S.atr[`${base}_atr14`]) || 0;
      const priceRef = Math.max(1e-9, Number(L.c) || Number(L.o) || 0);
      const rawAtrMult = Number(tune.gapAtrMult);
      const atrMult = Number.isFinite(rawAtrMult) ? rawAtrMult : DEFAULTS.gapAtrMult;
      const minGapPct = Math.max(
        Math.max(0, Number(tune.gapFloorPct) || 0),
        (atrRaw / priceRef) * atrMult
      );

      const gapUp = C1.o > C0.c * (1 + minGapPct);
      const gapDn = C1.o < C0.c * (1 - minGapPct);

      // Filtros leves para evitar barras "fora da curva"
      const rangeL = Math.max(1e-9, L.h - L.l);
      const wickTop = L.h - Math.max(L.c, L.o);
      const wickBot = Math.min(L.c, L.o) - L.l;
      const wickMaxRatio = Math.max(wickTop, wickBot) / rangeL;
      const wickLimit = Number.isFinite(tune.wickMaxRatio) ? tune.wickMaxRatio : DEFAULTS.wickMaxRatio;
      if (wickLimit > 0 && wickMaxRatio > wickLimit) return null; // pavio exagerado

      const buffer = Math.max(0, Number(tune.rejectionBufferPct) || 0);

      // Regras:
      // gapUp + candle atual vermelho + máxima da atual < máxima da barra do gap => rejeição para SELL
      if (gapUp && (L.c < L.o) && (L.h <= C1.h * (1 + buffer))) {
        return { side: "SELL" };
      }
      // gapDn + candle atual verde + mínima da atual > mínima da barra do gap => rejeição para BUY
      if (gapDn && (L.c > L.o) && (L.l >= C1.l * (1 - buffer))) {
        return { side: "BUY" };
      }
      return null;
    } catch (_e) {
      return null;
    }
  }
};
