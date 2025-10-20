// Boreal Bagjump — captura quedas abruptas priorizando vendas em cascata
const DEFAULTS = {
  lookback: 6,
  minStrong: 4,
  bodyStrength: 0.55,
  emaFast: 20,
  emaSlow: 50,
  slopeMin: 0.0012,
  distMax: 1.25,
  atrMin: 0.0045,
  atrMax: 0.028,
  volMult: 1.15
};

function strongBear(bodyFn, candle, minBody){
  if (typeof bodyFn === 'function'){
    return bodyFn(candle, minBody);
  }
  const range = Math.max(1e-9, candle.h - candle.l);
  const body = Math.max(0, candle.o - candle.c);
  return (body / range) >= minBody;
}

function trendingDown(seq){
  if (!Array.isArray(seq) || seq.length < 2) return false;
  for (let i = 1; i < seq.length; i += 1){
    if (seq[i].h >= seq[i-1].h) return false;
    if (seq[i].c >= seq[i-1].c) return false;
  }
  return true;
}

function volumeOk(vNow, vAvg, mult){
  if (vNow == null || vAvg == null || vAvg <= 0 || mult <= 0) return true;
  return (vNow / vAvg) >= mult;
}

export default {
  id: 'bagjump',
  name: 'Boreal Bagjump',
  detect({ symbol, CFG, candles, ctx, emaGateOk, regimeAgreeDetailed, utils }) {
    const tune = { ...DEFAULTS, ...(CFG?.strategyTunings?.bagjump || {}) };
    const lookback = Math.max(3, Math.floor(tune.lookback ?? DEFAULTS.lookback));
    const baseStrong = Math.ceil(lookback * 0.6);
    const minStrong = Math.max(2, Math.floor(tune.minStrong ?? baseStrong));
    if (!Array.isArray(candles) || candles.length < lookback + 2) return null;

    if (!CFG?.allowSell) return { reason: 'Vendas desabilitadas' };

    const regime = typeof regimeAgreeDetailed === 'function' ? regimeAgreeDetailed(symbol) : null;
    if (regime && !(regime.state === 'BEAR' || (regime.state === 'MIX' && regime.bias5 === 'BEAR'))){
      return { reason: 'Regime direcional desfavorável (vendas)' };
    }

    const seq = candles.slice(-lookback-1, -1);
    if (seq.length < lookback) return { reason: 'Histórico insuficiente' };

    const bodyFn = utils?.strongBear;
    const strongCount = seq.filter(c => strongBear(bodyFn, c, tune.bodyStrength)).length;
    if (strongCount < minStrong){
      return { reason: `Velas fortes insuficientes (${strongCount}/${minStrong})` };
    }
    if (!trendingDown(seq)){
      return { reason: 'Sequência não confirma cascata de topos e fundos' };
    }

    const lastClosed = seq[seq.length - 1];
    const emaFast = ctx?.ema?.[tune.emaFast];
    const emaSlow = ctx?.ema?.[tune.emaSlow];
    if (emaFast == null || emaSlow == null) return { reason: 'EMAs indisponíveis' };
    if (!(emaFast < emaSlow)) return { reason: 'EMA rápida não confirma tendência de queda' };

    const slopeVal = ctx?.slope?.[tune.emaFast] ?? ctx?.slope20 ?? 0;
    if (!(slopeVal <= -tune.slopeMin)){
      return { reason: `Slope insuficiente (${slopeVal.toFixed(5)})` };
    }

    const atrN = ctx?.atrN;
    if (atrN == null || atrN < tune.atrMin || atrN > tune.atrMax){
      return { reason: 'ATR fora da janela' };
    }

    const distFast = ctx?.dist?.[tune.emaFast];
    if (distFast != null && tune.distMax != null && distFast > tune.distMax){
      return { reason: 'Preço afastado demais da EMA' };
    }

    if (!volumeOk(ctx?.vNow, ctx?.vAvg20, tune.volMult)){
      return { reason: 'Volume não confirma pressão vendedora' };
    }

    if (emaGateOk && emaGateOk(symbol, 'SELL') === false){
      return { reason: 'Bloqueado pelo EMA Gate (SELL)' };
    }

    if (!lastClosed || !(lastClosed.c < lastClosed.o)){
      return { reason: 'Última vela não é de corpo vendedor' };
    }

    return { side: 'SELL', reason: 'Queda acelerada capturada (Boreal Bagjump)' };
  }
};
