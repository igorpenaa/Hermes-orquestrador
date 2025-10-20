// Hermes v6 – Strategy module
// Detecção de “Microcanais”: 6 velas consecutivas na mesma direção com preço colado na EMA20.
// id: microChannels • name: Microcanais

export default {
  id: "microChannels",
  name: "Microcanais",
  /**
   * @param {{symbol:string,S:any,CFG:any}} ctx
   * @returns {{side:'BUY'|'SELL'}|null}
   */
  detect({ symbol, S, CFG }) {
    try {
      const base = `${symbol}_${CFG.tfExec}`;
      const a = S.candles[base];
      if (!a || a.length < 7) return null;

      const i = a.length - 1;
      const win = a.slice(-6);
      const L = a[i];

      // Precisamos de ATR e EMA20 para a "proximidade"
      const atr  = S.atr[`${base}_atr14`] || 0;
      const ema20 = S.emas[`${base}_ema20`];
      if (ema20 == null) return null;

      const allUp = win.every(x => x.c > x.o);
      const allDn = win.every(x => x.c < x.o);

      // "Grudado" na EMA20: desvio menor que ~0.5*ATR
      const dist = Math.abs(L.c - ema20);
      const near = dist <= 0.5 * atr;

      if (allUp && near)  return { side: "BUY"  };
      if (allDn && near)  return { side: "SELL" };
      return null;
    } catch (_e) {
      return null;
    }
  }
};
