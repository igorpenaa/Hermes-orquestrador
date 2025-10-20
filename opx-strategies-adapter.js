// opx-strategies-adapter.js
// Expõe os seus setups como window.OPX_STRATEGIES.
// Carregue ESTE script antes do content.js v6.

(function () {
  if (window.OPX_STRATEGIES) return; // já existe, não faz nada

  // Helper: pega função global se existir
  const maybe = (name) =>
    (typeof window[name] === "function" ? window[name] : null);

  // Monte aqui o objeto com as referências dos seus setups.
  // Se você já tem um bundle que agrega tudo e coloca no escopo global,
  // este arquivo só "aponta" para essas funções.
  const STRATS = {
    // ⚠️ Nomes devem bater com os que você usa nos seus .mjs
    retestBreakoutBuy:    maybe("retestBreakoutBuy"),
    retestBreakdownSell:  maybe("retestBreakdownSell"),
    rangeBreakout:        maybe("rangeBreakout"),
    secondEntry:          maybe("secondEntry"),
    reversalBar:          maybe("reversalBar"),
    trendlineRejection:   maybe("trendlineRejection"),
    gapRejection:         maybe("gapRejection"),
    doubleTopBottom:      maybe("doubleTopBottom"),
    tripleLevel:          maybe("tripleLevel"),
    microChannels:        maybe("microChannels"),
    symmetricalTriangle:  maybe("symmetricalTriangle"),
  };

  // Exponha
  window.OPX_STRATEGIES = STRATS;

  // Log amigável
  const ok = Object.entries(STRATS)
    .filter(([, fn]) => typeof fn === "function")
    .map(([k]) => k);
  if (ok.length) {
    console.log("[OPX] Setups expostos:", ok);
  } else {
    console.warn("[OPX] Nenhum setup global encontrado. " +
      "Se você usa bundle/ESM, exponha as funções no window " +
      "ou importe-as antes deste adapter.");
  }
})();
