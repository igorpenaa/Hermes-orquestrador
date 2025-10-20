// Breakout-Retest Pro — Rompimento com reteste defendido e confirmação de volume.
const DEFAULTS = {
  lookback: 35,
  breakAtrMult: 0.2,
  breakAtrMin: 0.15,
  retestWindow: 3,
  volBreakMult: 1.1,
  allowOppositeTrend: false
};

function getAtr(S, symbol, CFG){
  const base = `${symbol}_${CFG.tfExec}`;
  return S.atr?.[`${base}_atr14`] || null;
}

function getVolumeAverage(S, symbol, CFG){
  const base = `${symbol}_${CFG.tfExec}`;
  return S.vma?.[`${base}_vma20`];
}

function computeLevel(candles, lookback, type){
  const slice = candles.slice(-lookback - 3, -2);
  if (!slice.length) return null;
  if (type === 'high') return Math.max(...slice.map(c => c.h));
  if (type === 'low') return Math.min(...slice.map(c => c.l));
  return null;
}

function trendAgree(S, symbol, CFG, side){
  const tf = CFG.tfRegA || '5m';
  const base = `${symbol}_${tf}`;
  const ema20 = S.emas?.[`${base}_ema20`];
  const ema50 = S.emas?.[`${base}_ema50`];
  if (ema20 == null || ema50 == null) return true;
  if (side === 'BUY') return ema20 >= ema50;
  if (side === 'SELL') return ema20 <= ema50;
  return true;
}

export default {
  id: 'breakoutRetestPro',
  name: 'Breakout-Retest Pro',
  detect({ symbol, S, CFG, candles, emaGateOk }) {
    if (!Array.isArray(candles) || candles.length < 10) return null;
    const tune = { ...DEFAULTS, ...(CFG?.strategyTunings?.breakoutRetestPro || {}) };

    const atr = getAtr(S, symbol, CFG);
    if (atr == null || atr === 0) return { reason: 'ATR indisponível' };

    const vma = getVolumeAverage(S, symbol, CFG);
    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    const prev2 = candles[candles.length - 3];
    if (!last || !prev || !prev2) return null;

    const volBreak = prev2.v ?? null;
    const volRetest = prev.v ?? null;

    const R = computeLevel(candles, tune.lookback, 'high');
    const SLevel = computeLevel(candles, tune.lookback, 'low');

    const breakOffset = Math.max(tune.breakAtrMult, tune.breakAtrMin) * atr;

    // BUY scenario
    const brokeUp = R != null && prev2.c >= R + breakOffset;
    const retestUp = brokeUp && prev.l <= R + atr * 0.1 && prev.c >= R;
    const confirmUp = retestUp && last.c > last.o && last.c > prev.h;
    const volOkBuy = vma == null || (volBreak != null && volBreak >= tune.volBreakMult * vma && volRetest != null && volRetest <= volBreak * 1.05);

    if (confirmUp && CFG.allowBuy !== false){
      if (!tune.allowOppositeTrend && !trendAgree(S, symbol, CFG, 'BUY')){
        return { reason: 'Tendência contrária (5m)' };
      }
      if (emaGateOk && emaGateOk(symbol, 'BUY') === false){
        return { reason: 'Bloqueado pelo EMA Gate (BUY)' };
      }
      if (!volOkBuy){
        return { reason: 'Volume não confirma rompimento' };
      }
      return { side: 'BUY', reason: 'Breakout + reteste defendido' };
    }

    // SELL scenario
    const brokeDown = SLevel != null && prev2.c <= SLevel - breakOffset;
    const retestDown = brokeDown && prev.h >= SLevel - atr * 0.1 && prev.c <= SLevel;
    const confirmDown = retestDown && last.c < last.o && last.c < prev.l;
    const volOkSell = vma == null || (volBreak != null && volBreak >= tune.volBreakMult * vma && volRetest != null && volRetest <= volBreak * 1.05);

    if (confirmDown && CFG.allowSell !== false){
      if (!tune.allowOppositeTrend && !trendAgree(S, symbol, CFG, 'SELL')){
        return { reason: 'Tendência contrária (5m)' };
      }
      if (emaGateOk && emaGateOk(symbol, 'SELL') === false){
        return { reason: 'Bloqueado pelo EMA Gate (SELL)' };
      }
      if (!volOkSell){
        return { reason: 'Volume não confirma rompimento' };
      }
      return { side: 'SELL', reason: 'Breakdown + reteste defendido' };
    }

    return { reason: 'Sem reteste válido' };
  }
};
