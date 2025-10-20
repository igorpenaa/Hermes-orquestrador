// Trendline Rejection (versão enxuta p/ Hermes v6)
// Ideia: rejeição da EMA50 como “trendline dinâmica”, com pavio dominante contra a média.

const P = {
  emaPeriod: 50,
  minBars:  60,     // precisa de barras para estabilizar a EMA
  wickRatioMin: 0.5 // pavio maior que 50% do range
};

function buildSeries({ S, CFG, symbol }) {
  const base = `${symbol}_${CFG.tfExec}`;
  const a = S.candles[base] || [];
  const c = a.map(k => ({ open:+k.o, high:+k.h, low:+k.l, close:+k.c }));
  return c;
}

function ema(values, period){
  const k = 2/(period+1);
  let e = null, out = [];
  for (const v of values){
    e = (e==null) ? v : (v*k + e*(1-k));
    out.push(e);
  }
  return out;
}

function wickRatios(bar){
  const range = Math.max(1e-12, bar.high - bar.low);
  const topW  = bar.high - Math.max(bar.close, bar.open);
  const botW  = Math.min(bar.close, bar.open) - bar.low;
  return { top: topW/range, bot: botW/range };
}

export default {
  id: "trendlineRejection",
  name: "Trendline Rejection",
  detect({ symbol, S, CFG }) {
    const c = buildSeries({ S, CFG, symbol });
    if (!Array.isArray(c) || c.length < P.minBars) return null;

    const closes = c.map(b=>b.close);
    const ema50  = ema(closes, P.emaPeriod);
    const L  = c[c.length-1];
    const B1 = c[c.length-2];
    const eL = ema50[ema50.length-1];

    if (eL==null) return null;

    const { top:topL, bot:botL } = wickRatios(L);
    const isGreen = L.close > L.open;
    const isRed   = L.close < L.open;

    // Rejeição superior (SELL): preço abaixo da ema e pavio superior grande + candle vermelho
    const sellCond = (L.close < eL && topL >= P.wickRatioMin && isRed);
    // Rejeição inferior (BUY): preço acima da ema e pavio inferior grande + candle verde
    const buyCond  = (L.close > eL && botL >= P.wickRatioMin && isGreen);

    if (sellCond) return { side: "SELL", reason: "Rejeição EMA50 (pavio sup.)" };
    if (buyCond)  return { side: "BUY",  reason: "Rejeição EMA50 (pavio inf.)"  };

    // Sinais um pouco mais permissivos com confirmação no B1 (toque + reversão)
    const touchedUp   = (B1.high >= eL && L.close < eL && isRed && topL > botL);
    const touchedDown = (B1.low  <= eL && L.close > eL && isGreen && botL > topL);

    if (touchedUp)   return { side: "SELL", reason: "Toque/recusa EMA50" };
    if (touchedDown) return { side: "BUY",  reason: "Toque/recusa EMA50" };

    return null;
  }
};
