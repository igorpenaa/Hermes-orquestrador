// Aquila Alpinista — momentum forte de compra priorizando escaladas rápidas
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

function strongBull(bodyFn, candle, minBody){
  if (typeof bodyFn === 'function'){
    return bodyFn(candle, minBody);
  }
  const range = Math.max(1e-9, candle.h - candle.l);
  const body = Math.max(0, candle.c - candle.o);
  return (body / range) >= minBody;
}

function trendingUp(seq){
  if (!Array.isArray(seq) || seq.length < 2) return false;
  for (let i = 1; i < seq.length; i += 1){
    if (seq[i].l <= seq[i-1].l) return false;
    if (seq[i].c <= seq[i-1].c) return false;
  }
  return true;
}

function volumeOk(vNow, vAvg, mult){
  if (vNow == null || vAvg == null || vAvg <= 0 || mult <= 0) return true;
  return (vNow / vAvg) >= mult;
}

export default {
  id: 'alpinista',
  name: 'Aquila Alpinista',
  detect({ symbol, CFG, candles, ctx, emaGateOk, regimeAgreeDetailed, utils }) {
    const tune = { ...DEFAULTS, ...(CFG?.strategyTunings?.alpinista || {}) };
    const lookback = Math.max(3, Math.floor(tune.lookback ?? DEFAULTS.lookback));
    const baseStrong = Math.ceil(lookback * 0.6);
    const minStrong = Math.max(2, Math.floor(tune.minStrong ?? baseStrong));
    if (!Array.isArray(candles) || candles.length < lookback + 2) return null;

    if (!CFG?.allowBuy) return { reason: 'Compras desabilitadas' };

    const regime = typeof regimeAgreeDetailed === 'function' ? regimeAgreeDetailed(symbol) : null;
    if (regime && !(regime.state === 'BULL' || (regime.state === 'MIX' && regime.bias5 === 'BULL'))){
      return { reason: 'Regime direcional desfavorável (compras)' };
    }

    const seq = candles.slice(-lookback-1, -1);
    if (seq.length < lookback) return { reason: 'Histórico insuficiente' };

    const bodyFn = utils?.strongBull;
    const strongCount = seq.filter(c => strongBull(bodyFn, c, tune.bodyStrength)).length;
    if (strongCount < minStrong){
      return { reason: `Velas fortes insuficientes (${strongCount}/${minStrong})` };
    }
    if (!trendingUp(seq)){
      return { reason: 'Sequência não confirma escada de topos e fundos' };
    }

    const lastClosed = seq[seq.length - 1];
    const emaFast = ctx?.ema?.[tune.emaFast];
    const emaSlow = ctx?.ema?.[tune.emaSlow];
    if (emaFast == null || emaSlow == null) return { reason: 'EMAs indisponíveis' };
    if (!(emaFast > emaSlow)) return { reason: 'EMA rápida não confirma tendência' };

    const slopeVal = ctx?.slope?.[tune.emaFast] ?? ctx?.slope20 ?? 0;
    if (!(slopeVal >= tune.slopeMin)){
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
      return { reason: 'Volume não confirma aceleração' };
    }

    if (emaGateOk && emaGateOk(symbol, 'BUY') === false){
      return { reason: 'Bloqueado pelo EMA Gate (BUY)' };
    }

    if (!lastClosed || !(lastClosed.c > lastClosed.o)){
      return { reason: 'Última vela não é de corpo comprador' };
    }

    return { side: 'BUY', reason: 'Escalada confirmada (Aquila Alpinista)' };
  }
};
