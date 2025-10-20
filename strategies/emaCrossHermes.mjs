// EMA Cross (Hermes) — módulo externo alinhado ao Gate/Regime
export default {
  id: "emaCross",
  name: "EMA Cross (Hermes)",
  detect({ symbol, S, CFG, emaGateOk, regimeAgreeDetailed }) {
    const b1 = `${symbol}_${CFG.tfExec}`;
    const a = S.candles[b1]; if(!a || a.length<2) return null;
    const last=a[a.length-1], prev=a[a.length-2];
    const e20 = S.emas[`${b1}_ema20`]; if(e20==null) return null;

    const k=2/(20+1); const prevE20=(e20 - last.c*k)/(1-k);
    const reg=regimeAgreeDetailed(symbol); if(!reg || reg.state==="OPPOSED"){ return { reason:"regime oposto" }; }

    const wantBuy =(reg.state==="BULL") || (reg.state==="MIX" && reg.bias5==="BULL");
    const wantSell=(reg.state==="BEAR") || (reg.state==="MIX" && reg.bias5==="BEAR");

    if (wantBuy && CFG.allowBuy && prev.c<=prevE20 && last.c>e20){
      if(!emaGateOk(symbol,"BUY")) return { reason:"emaGate BUY bloqueou" };
      return { side:"BUY" };
    }
    if (wantSell && CFG.allowSell && prev.c>=prevE20 && last.c<e20){
      if(!emaGateOk(symbol,"SELL")) return { reason:"emaGate SELL bloqueou" };
      return { side:"SELL" };
    }
    return null;
  }
};