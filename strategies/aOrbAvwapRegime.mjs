// A-ORB/AVWAP Regime — versão refinada com filtros de contexto, score e modos Breakout/Fade.
import { computeAdx, computeAtr } from './indicators.mjs';

const DEFAULTS = {
  sessionMinutes: 1440,
  orWindowMin: 15,
  orTradeMaxMin: 90,
  minVolFactor: 0.8,
  adxNoTradeBand: [23, 27],
  newsSpikeAtr: 2.5,
  cooldownBarsAfterNews: 5,
  // Trend Breakout
  adxBreakMin: 25,
  emaGapMin: 0.0005,
  breakBodyMinPct: 0.55,
  breakBeyondOrAtr: 0.20,
  breakBeyondOrMinPct: 0.0004,
  volBreakMin: 1.4,
  pullbackMaxAtr: 0.5,
  pullbackHardStopAtr: 0.6,
  breakMaxDistVwapAtr: 1.5,
  breakEntryMaxDistAtr: 0.6,
  dirtyOrWickPct: 0.6,
  dirtyOrMaxBars: 3,
  // VWAP Fade
  adxFadeMax: 23,
  wickMinFade: 0.40,
  distVwapFadeMinAtr: 0.4,
  distVwapFadeMaxAtr: 1.3,
  distVwapFadeCutAtr: 0.25,
  volFailMin: 1.1,
  vwapSlopeLimit: 0.0002,
  emaCompressionMax: 0.0005,
  sequenceLookback: 7,
  // Score / execução
  minScore: 70,
  midScoreHalfRange: [60, 69],
  // Targets
  tp1Atr: 1.0,
  tp2BreakRangeFactor: 0.8,
  tp2FadeVwapAtr: 0.5,
  slBreakAtr: 0.5,
  slFadeAtr: 0.6,
};

function last(arr, n = 1){
  return Array.isArray(arr) && arr.length >= n ? arr[arr.length - n] : null;
}

function sma(values, period){
  if (!Array.isArray(values) || !values.length) return null;
  const slice = values.slice(-period);
  if (!slice.length) return null;
  const sum = slice.reduce((acc, v) => acc + (Number(v) || 0), 0);
  return sum / slice.length;
}

function bodyPct(candle){
  if (!candle) return 0;
  const high = Number(candle.h) || 0;
  const low = Number(candle.l) || 0;
  const range = Math.max(high - low, 1e-9);
  const open = Number(candle.o) || 0;
  const close = Number(candle.c) || 0;
  return Math.abs(close - open) / range;
}

function wickUpperPct(candle){
  if (!candle) return 0;
  const open = Number(candle.o) || 0;
  const close = Number(candle.c) || 0;
  const high = Number(candle.h) || 0;
  const low = Number(candle.l) || 0;
  const range = Math.max(high - low, 1e-9);
  const topBody = Math.max(open, close);
  return (high - topBody) / range;
}

function wickLowerPct(candle){
  if (!candle) return 0;
  const open = Number(candle.o) || 0;
  const close = Number(candle.c) || 0;
  const high = Number(candle.h) || 0;
  const low = Number(candle.l) || 0;
  const range = Math.max(high - low, 1e-9);
  const bottomBody = Math.min(open, close);
  return (bottomBody - low) / range;
}

function candleTs(candle){
  if (!candle) return null;
  return Number(candle.t ?? candle.T ?? candle.time ?? null);
}

function sessionStartTs(candles, minutes){
  if (!Array.isArray(candles) || !candles.length) return null;
  const ts = candleTs(last(candles));
  if (!Number.isFinite(ts)) return null;
  const bucket = Math.max(1, Math.floor(minutes));
  const ms = bucket * 60 * 1000;
  return Math.floor(ts / ms) * ms;
}

function buildOpeningRange(candles, startTs, orMinutes){
  if (!Number.isFinite(startTs)) return null;
  const endTs = startTs + orMinutes * 60 * 1000;
  const slice = candles.filter(c => {
    const ts = candleTs(c);
    return Number.isFinite(ts) && ts >= startTs && ts < endTs;
  });
  if (!slice.length) return null;
  const highs = slice.map(c => Number(c.h) || 0);
  const lows = slice.map(c => Number(c.l) || 0);
  return {
    high: Math.max(...highs),
    low: Math.min(...lows),
    range: Math.max(...highs) - Math.min(...lows),
    candles: slice,
  };
}

function anchoredVwapSeries(candles, anchorTs){
  const out = [];
  let pv = 0;
  let vol = 0;
  for (const candle of candles){
    const ts = candleTs(candle);
    if (!Number.isFinite(ts)){
      out.push(out.length ? out[out.length - 1] : 0);
      continue;
    }
    if (anchorTs && ts < anchorTs){
      out.push(out.length ? out[out.length - 1] : Number(candle.c) || 0);
      continue;
    }
    const volume = Math.max(Number(candle.v) || 0, 0);
    const typical = ((Number(candle.h) || 0) + (Number(candle.l) || 0) + (Number(candle.c) || 0)) / 3;
    pv += typical * volume;
    vol += volume;
    const value = vol > 0 ? pv / vol : (out.length ? out[out.length - 1] : Number(candle.c) || 0);
    out.push(value);
  }
  return out;
}

function slope(series, lookback){
  if (!Array.isArray(series) || series.length < lookback + 1) return 0;
  const slice = series.slice(-lookback - 1);
  const first = slice[0];
  const lastVal = slice[slice.length - 1];
  if (!Number.isFinite(first) || !Number.isFinite(lastVal) || Math.abs(lastVal) < 1e-9) return 0;
  return (lastVal - first) / lookback / lastVal;
}

function emaGap(S, symbol, CFG){
  const tf = CFG.tfRegA || '5m';
  const base = `${symbol}_${tf}`;
  const ema20 = S.emas?.[`${base}_ema20`];
  const ema50 = S.emas?.[`${base}_ema50`];
  const price = S.candles?.[base]?.[S.candles[base].length - 1]?.c;
  if (ema20 == null || ema50 == null || price == null) return null;
  return Math.abs(ema20 - ema50) / Math.max(Math.abs(price), 1e-9);
}

function distanceNormalized(price, reference, atr){
  if (!Number.isFinite(price) || !Number.isFinite(reference) || !Number.isFinite(atr) || atr <= 0) return null;
  return Math.abs(price - reference) / atr;
}

function hasSequenceHigherHighLow(candles, lookback){
  const slice = candles.slice(-lookback);
  if (slice.length < 3) return false;
  for (let i = 1; i < slice.length; i += 1){
    if (!((slice[i].h ?? 0) >= (slice[i-1].h ?? 0) && (slice[i].l ?? 0) >= (slice[i-1].l ?? 0))){
      return false;
    }
  }
  return true;
}

function hasSequenceLowerLowHigh(candles, lookback){
  const slice = candles.slice(-lookback);
  if (slice.length < 3) return false;
  for (let i = 1; i < slice.length; i += 1){
    if (!((slice[i].l ?? 0) <= (slice[i-1].l ?? 0) && (slice[i].h ?? 0) <= (slice[i-1].h ?? 0))){
      return false;
    }
  }
  return true;
}

export default {
  id: 'aOrbAvwapRegime',
  name: 'A-ORB / AVWAP Regime',
  detect({ symbol, S, CFG, candles, emaGateOk }) {
    if (!Array.isArray(candles) || candles.length < 40) return null;

    const tune = { ...DEFAULTS, ...(CFG?.strategyTunings?.aOrbAvwapRegime || {}) };

    const lastCandle = last(candles);
    const prevCandle = last(candles, 2);
    if (!lastCandle || !prevCandle) return null;

    const atr1 = computeAtr(candles, 14);
    if (!Number.isFinite(atr1) || atr1 <= 0) return { reason: 'ATR inválido' };

    const volAvg20 = sma(candles.map(c => Number(c.v) || 0), 20);
    if (!Number.isFinite(volAvg20) || volAvg20 <= 0) return { reason: 'Média de volume indisponível' };

    const sessionStart = sessionStartTs(candles, tune.sessionMinutes);
    const opening = buildOpeningRange(candles, sessionStart, tune.orWindowMin);
    if (!opening) return { reason: 'Opening Range indisponível' };

    const endOrTs = sessionStart + tune.orWindowMin * 60 * 1000;
    const lastTs = candleTs(lastCandle);
    if (!Number.isFinite(lastTs)) return null;

    const minutesSinceOr = (lastTs - endOrTs) / 60000;
    if (minutesSinceOr < 0) return { reason: 'Opening Range ainda em formação' };
    if (minutesSinceOr > tune.orTradeMaxMin) return { reason: 'Fora da janela pós-OR' };

    const dirtyWicks = opening.candles.filter(c => {
      const up = wickUpperPct(c);
      const down = wickLowerPct(c);
      return up >= tune.dirtyOrWickPct || down >= tune.dirtyOrWickPct;
    }).length;

    const adxFrame = S.candles?.[`${symbol}_${CFG.tfRegA || '5m'}`] || [];
    const adxData = computeAdx(adxFrame, 14);
    const adx5 = adxData?.adx ?? null;

    const ema20 = S.emas?.[`${symbol}_${CFG.tfRegA || '5m'}_ema20`];
    const ema50 = S.emas?.[`${symbol}_${CFG.tfRegA || '5m'}_ema50`];

    const vwapSeries = anchoredVwapSeries(candles, sessionStart);
    const vwap = last(vwapSeries);
    const vwapSlope = slope(vwapSeries, 10);

    const volOkGlobal = (Number(lastCandle.v) || 0) >= tune.minVolFactor * volAvg20;
    if (!volOkGlobal) return { reason: 'Volume abaixo do mínimo' };

    const newsSpike = (Number(lastCandle.h) - Number(lastCandle.l)) > tune.newsSpikeAtr * atr1;
    if (newsSpike) return { reason: 'Spike de volatilidade recente' };

    if (adx5 != null && adx5 >= tune.adxNoTradeBand[0] && adx5 <= tune.adxNoTradeBand[1]){
      return { reason: 'ADX na zona neutra' };
    }

    const emaGapValue = emaGap(S, symbol, CFG);

    const distToVwap = distanceNormalized(Number(lastCandle.c), vwap, atr1);

    const breakoutContext = {};
    const fadeContext = {};

    // ---------- Trend Breakout mode ----------
    const breakCandle = prevCandle; // candle que rompeu a OR
    const confirmCandle = lastCandle; // candle seguinte (avaliar pullback/reteste)

    const trendBull = adx5 != null && adx5 >= tune.adxBreakMin && (ema20 == null || ema50 == null || ema20 > ema50);
    const trendBear = adx5 != null && adx5 >= tune.adxBreakMin && (ema20 == null || ema50 == null || ema20 < ema50);

    const breakBeyondBuy = breakCandle?.c >= opening.high + Math.max(tune.breakBeyondOrAtr * atr1, tune.breakBeyondOrMinPct * Math.abs(breakCandle.c || 0));
    const breakBeyondSell = breakCandle?.c <= opening.low - Math.max(tune.breakBeyondOrAtr * atr1, tune.breakBeyondOrMinPct * Math.abs(breakCandle.c || 0));

    const breakBodyOk = bodyPct(breakCandle) >= tune.breakBodyMinPct;
    const breakVolOk = (Number(breakCandle?.v) || 0) >= tune.volBreakMin * volAvg20;

    const breakVwapSideBuy = Number(breakCandle?.c) > vwap && vwapSlope > 0;
    const breakVwapSideSell = Number(breakCandle?.c) < vwap && vwapSlope < 0;

    const pullbackBuy = breakBeyondBuy
      ? Math.max(0, opening.high - Math.min(Number(confirmCandle.l) || 0, Number(breakCandle.l) || 0)) / atr1
      : Infinity;
    const pullbackSell = breakBeyondSell
      ? Math.max(0, Math.max(Number(confirmCandle.h) || 0, Number(breakCandle.h) || 0) - opening.low) / atr1
      : Infinity;

    const distVwapBreak = breakCandle ? distanceNormalized(Number(breakCandle.c), vwap, atr1) : null;

    const retestVolume = Number(confirmCandle.v) || 0;
    const breakVolume = Number(breakCandle?.v) || 0;

    const sequenceBuy = breakBeyondBuy && (Number(confirmCandle.c) >= opening.high || (Number(confirmCandle.l) <= opening.high && Number(confirmCandle.c) > opening.high));
    const sequenceSell = breakBeyondSell && (Number(confirmCandle.c) <= opening.low || (Number(confirmCandle.h) >= opening.low && Number(confirmCandle.c) < opening.low));

    const entryBreakBuy = breakBeyondBuy ? Math.max(Number(breakCandle.h) || 0, opening.high) : null;
    const entryBreakSell = breakBeyondSell ? Math.min(Number(breakCandle.l) || 0, opening.low) : null;
    const entryDistBuy = entryBreakBuy != null ? Math.abs(entryBreakBuy - opening.high) / atr1 : null;
    const entryDistSell = entryBreakSell != null ? Math.abs(entryBreakSell - opening.low) / atr1 : null;

    const breakoutScore = (
      (adx5 != null && adx5 >= tune.adxBreakMin ? 20 : 0) +
      ((trendBull || trendBear) ? 15 : 0) +
      ((breakBeyondBuy || breakBeyondSell) ? 15 : 0) +
      (breakVolOk ? 20 : 0) +
      (((trendBull && breakVwapSideBuy) || (trendBear && breakVwapSideSell)) ? 20 : 0) +
      (((breakBeyondBuy && pullbackBuy <= tune.pullbackMaxAtr) || (breakBeyondSell && pullbackSell <= tune.pullbackMaxAtr)) ? 10 : 0)
    );

    breakoutContext.adx5 = adx5;
    breakoutContext.breakBeyond = breakBeyondBuy || breakBeyondSell;
    breakoutContext.breakVolume = breakVolume;
    breakoutContext.retestVolume = retestVolume;
    breakoutContext.distVwapBreak = distVwapBreak;
    breakoutContext.pullback = breakBeyondBuy ? pullbackBuy : pullbackSell;
    breakoutContext.score = breakoutScore;

    const breakoutInvalidReason = (() => {
      if (!breakCandle) return 'Sem candle de rompimento';
      if (dirtyWicks >= tune.dirtyOrMaxBars) return 'Opening Range ruidosa';
      if (!(trendBull || trendBear)) return 'ADX ou EMAs não sustentam tendência';
      if (!(breakBeyondBuy || breakBeyondSell)) return 'Sem rompimento válido da OR';
      if (!breakBodyOk) return 'Corpo do rompimento pequeno';
      if (!breakVolOk) return 'Volume insuficiente no rompimento';
      if ((breakBeyondBuy && !breakVwapSideBuy) || (breakBeyondSell && !breakVwapSideSell)) return 'AVWAP desalinhada';
      if ((breakBeyondBuy && pullbackBuy > tune.pullbackHardStopAtr) || (breakBeyondSell && pullbackSell > tune.pullbackHardStopAtr)) return 'Pullback imediato muito profundo';
      if ((breakBeyondBuy && retestVolume > breakVolume) || (breakBeyondSell && retestVolume > breakVolume)) return 'Reteste com volume maior que o rompimento';
      if ((breakBeyondBuy && distVwapBreak != null && distVwapBreak > tune.breakMaxDistVwapAtr) || (breakBeyondSell && distVwapBreak != null && distVwapBreak > tune.breakMaxDistVwapAtr)) return 'Rompimento esticado da AVWAP';
      if ((breakBeyondBuy && entryDistBuy != null && entryDistBuy > tune.breakEntryMaxDistAtr) || (breakBeyondSell && entryDistSell != null && entryDistSell > tune.breakEntryMaxDistAtr)) return 'Entrada distante da OR';
      if ((breakBeyondBuy && !sequenceBuy) || (breakBeyondSell && !sequenceSell)) return 'Sem sequência/defesa pós-rompimento';
      return null;
    })();

    if (!breakoutInvalidReason && breakoutScore >= tune.minScore){
      const side = breakBeyondBuy ? 'BUY' : 'SELL';
      if (side === 'BUY' && CFG.allowBuy === false) return { reason: 'Compras desativadas' };
      if (side === 'SELL' && CFG.allowSell === false) return { reason: 'Vendas desativadas' };
      if (emaGateOk && emaGateOk(symbol, side) === false) return { reason: `Bloqueado pelo EMA Gate (${side})` };

      const entry = side === 'BUY' ? Math.max(Number(breakCandle.h) || 0, opening.high) : Math.min(Number(breakCandle.l) || 0, opening.low);
      const stop = side === 'BUY'
        ? Math.min(opening.high - tune.slBreakAtr * atr1, Number(confirmCandle.l) || entry)
        : Math.max(opening.low + tune.slBreakAtr * atr1, Number(confirmCandle.h) || entry);
      const tp1 = side === 'BUY' ? entry + tune.tp1Atr * atr1 : entry - tune.tp1Atr * atr1;
      const tp2Range = Math.max(opening.range * tune.tp2BreakRangeFactor, 1.5 * atr1);
      const tp2 = side === 'BUY' ? entry + tp2Range : entry - tp2Range;

      let sizeMultiplier = 1;
      if (breakoutScore >= tune.midScoreHalfRange[0] && breakoutScore <= tune.midScoreHalfRange[1]){
        sizeMultiplier = 0.5;
      }

      return {
        side,
        reason: side === 'BUY' ? 'Trend Breakout validado' : 'Trend Breakdown validado',
        mode: 'breakout',
        score: breakoutScore,
        entry,
        stop,
        targets: [tp1, tp2],
        sizeMultiplier,
        context: {
          ...breakoutContext,
          openingHigh: opening.high,
          openingLow: opening.low,
          vwap,
          vwapSlope,
          distToVwap,
          dirtyWicks,
        },
      };
    }

    if (!breakoutInvalidReason && breakoutScore > 0 && breakoutScore < tune.minScore){
      breakoutContext.reason = 'Score insuficiente para breakout';
    }

    // ---------- VWAP Fade mode ----------
    const chopRegime = (adx5 != null && adx5 < tune.adxFadeMax) || (emaGapValue != null && emaGapValue < tune.emaCompressionMax);

    const failHigh = Number(lastCandle.h) > opening.high && Number(lastCandle.c) < opening.high;
    const failLow = Number(lastCandle.l) < opening.low && Number(lastCandle.c) > opening.low;

    const wickOkTop = wickUpperPct(lastCandle) >= tune.wickMinFade;
    const wickOkLow = wickLowerPct(lastCandle) >= tune.wickMinFade;

    const distFade = distanceNormalized(Number(lastCandle.c), vwap, atr1);
    const volFail = Number(lastCandle.v) || 0;
    const pushVolume = Number(prevCandle.v) || 0;

    const vwapSlopeWeak = Math.abs(vwapSlope) <= tune.vwapSlopeLimit;

    const sequenceUp = hasSequenceHigherHighLow(candles, tune.sequenceLookback);
    const sequenceDown = hasSequenceLowerLowHigh(candles, tune.sequenceLookback);

    const fadeScore = (
      (chopRegime ? 20 : 0) +
      ((failHigh || failLow) ? 20 : 0) +
      (((failHigh && wickOkTop) || (failLow && wickOkLow)) ? 15 : 0) +
      ((distFade != null && distFade >= tune.distVwapFadeMinAtr && distFade <= tune.distVwapFadeMaxAtr) ? 20 : 0) +
      ((volFail >= tune.volFailMin * volAvg20 && volFail <= Math.max(pushVolume, 1)) ? 15 : 0) +
      (vwapSlopeWeak ? 10 : 0)
    );

    fadeContext.adx5 = adx5;
    fadeContext.chop = chopRegime;
    fadeContext.distFade = distFade;
    fadeContext.volFail = volFail;
    fadeContext.pushVolume = pushVolume;
    fadeContext.vwapSlope = vwapSlope;
    fadeContext.score = fadeScore;

    const fadeInvalidReason = (() => {
      if (!chopRegime) return 'Regime não favorece mean reversion';
      if (!(failHigh || failLow)) return 'Sem falha clara da OR';
      if ((failHigh && !wickOkTop) || (failLow && !wickOkLow)) return 'Pavio da falha insuficiente';
      if (distFade == null || distFade < tune.distVwapFadeMinAtr || distFade > tune.distVwapFadeMaxAtr) return 'Distância até AVWAP fora da faixa';
      if (distFade < tune.distVwapFadeCutAtr) return 'Sem espaço para alvo na AVWAP';
      if (volFail < tune.volFailMin * volAvg20) return 'Volume da falha fraco';
      if (pushVolume > 0 && volFail > pushVolume) return 'Sem exaustão (volume ainda crescente)';
      if (!vwapSlopeWeak) return 'AVWAP inclinada contra o fade';
      if ((failHigh && sequenceUp) || (failLow && sequenceDown)) return 'Microtendência contra o fade';
      return null;
    })();

    if (!fadeInvalidReason && fadeScore >= tune.minScore){
      const side = failHigh ? 'SELL' : 'BUY';
      if (side === 'BUY' && CFG.allowBuy === false) return { reason: 'Compras desativadas' };
      if (side === 'SELL' && CFG.allowSell === false) return { reason: 'Vendas desativadas' };
      if (emaGateOk && emaGateOk(symbol, side) === false) return { reason: `Bloqueado pelo EMA Gate (${side})` };

      const entry = side === 'SELL' ? Math.min(Number(lastCandle.l) || Number(opening.high) || 0, Number(prevCandle.c) || 0) : Math.max(Number(lastCandle.h) || Number(opening.low) || 0, Number(prevCandle.c) || 0);
      const stop = side === 'SELL'
        ? Math.max(Number(lastCandle.h) || 0, opening.high) + tune.slFadeAtr * atr1
        : Math.min(Number(lastCandle.l) || 0, opening.low) - tune.slFadeAtr * atr1;
      const tp1 = side === 'SELL' ? opening.high : opening.low;
      const tp2 = side === 'SELL'
        ? Math.max(vwap, entry - tune.tp2FadeVwapAtr * atr1)
        : Math.min(vwap, entry + tune.tp2FadeVwapAtr * atr1);

      let sizeMultiplier = 1;
      if (fadeScore >= tune.midScoreHalfRange[0] && fadeScore <= tune.midScoreHalfRange[1]){
        sizeMultiplier = 0.5;
      }

      return {
        side,
        reason: failHigh ? 'VWAP Fade na máxima da OR' : 'VWAP Fade na mínima da OR',
        mode: 'fade',
        score: fadeScore,
        entry,
        stop,
        targets: [tp1, tp2],
        sizeMultiplier,
        context: {
          ...fadeContext,
          openingHigh: opening.high,
          openingLow: opening.low,
          vwap,
        },
      };
    }

    if (!fadeInvalidReason && fadeScore > 0 && fadeScore < tune.minScore){
      fadeContext.reason = 'Score insuficiente para fade';
    }

    return {
      reason: breakoutInvalidReason || fadeInvalidReason || 'Sem gatilho filtrado',
      context: {
        breakout: breakoutContext,
        fade: fadeContext,
      },
    };
  },
};
