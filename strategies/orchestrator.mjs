// strategies/orchestrator.mjs
// Orquestrador de estratégias: guards por cenário, Relax mode e EMA Gate direcional
// Não depende do DOM. Usa apenas S (state), CFG e candles do M1.

function emaSeries(values, len){
  const k = 2/(len+1);
  let p = null;
  return values.map(v => (p = (p==null ? v : v*k + p*(1-k))));
}
function slope(series, n=8){
  const i = series.length-1;
  const a = series[i-1], b = series[i-1-n];
  if (a==null || b==null) return 0;
  const denom = Math.max(1e-9, Math.abs(b));
  return (a - b) / denom;
}
function last(arr, n=1){ return arr[arr.length - n]; }

function buildCtx(candles){
  // candles: [{o,h,l,c,v,t,...}] formato do seu content.js (M1)
  const closes = candles.map(c => c.c);
  const highs  = candles.map(c => c.h);
  const lows   = candles.map(c => c.l);
  const vol    = candles.map(c => c.v);

  const e20 = emaSeries(closes, 20);
  const e50 = emaSeries(closes, 50);

  const i   = candles.length - 1;
  const L   = candles[i];           // última (andando)
  const P   = candles[i-1];         // penúltima (fechada)

  const range = Math.max(1e-9, P.h - P.l);
  const atr   = range; // leve (coerente com content.js)
  const atrN  = atr / Math.max(1e-9, P.c);

  // VMA(20) leve para volume
  const vma20 = emaSeries(vol, 20);
  const vma   = vma20[i-1];

  const distE20 = Math.abs(P.c - e20[i-1]) / Math.max(1e-9, atr);

  return {
    // velas
    C: candles, L: P, // usamos penúltima fechada para confirmar padrões
    // EMAs
    e20: e20[i-1], e50: e50[i-1],
    slope20: slope(e20, 8),
    // volatilidade / distância
    atr, atrN, distE20,
    // volume
    vNow: P.v, vAvg20: vma,
  };
}

// Helpers de força do candle (0..1) – proporcionais ao corpo vs range
function strongBull(c, min=0.45){
  const range = Math.max(1e-9, c.h - c.l);
  const body  = Math.max(0, c.c - c.o);
  return (body / range) >= min;
}
function strongBear(c, min=0.45){
  const range = Math.max(1e-9, c.h - c.l);
  const body  = Math.max(0, c.o - c.c);
  return (body / range) >= min;
}

function emaGateAllows(side, ctx, gateCfg){
  // gateCfg = {enabled, divisor, directional, minDistATR, slopeMin}
  if (!gateCfg || !gateCfg.enabled) return true;

  // recalcular EMAs para divisor/direcional (leve; small arrays)
  const closes = ctx.C.map(k => k.c);
  const eDiv   = last(emaSeries(closes, gateCfg.divisor));
  const eDirS  = emaSeries(closes, gateCfg.directional);
  const slDir  = slope(eDirS, 8);

  const minDist = (gateCfg.minDistATR ?? 0.30) * ctx.atr;
  const above   = ctx.L.c >= (eDiv + minDist);
  const below   = ctx.L.c <= (eDiv - minDist);
  const upDir   = slDir >= (gateCfg.slopeMin ?? 0.0008);
  const dnDir   = slDir <= -(gateCfg.slopeMin ?? 0.0008);

  if (side === "BUY")  return above && upDir;
  if (side === "SELL") return below && dnDir;
  return false;
}

// Guards por estratégia (cenário ideal). Ajustáveis no "relax".
function makeGuards(ctx, relax, CFG){
  // parâmetros base
  let slopeMin    = 0.001;
  let slopeLoose  = CFG.slopeLoose ?? 0.0007;
  let distMax     = 1.0;
  let atrLowCut   = 0.0035;  // "chato demais"
  let atrMedMin   = 0.004;
  let atrMedMax   = 0.015;
  let atrHiMax    = 0.020;

  if (relax) {
    slopeMin = slopeLoose;
    distMax  = distMax + (CFG.distE20RelaxAdd ?? 0.10);
  }

  return {
    retestBuy:      () => (ctx.e20>ctx.e50 && ctx.slope20>=slopeMin && ctx.atrN>=atrMedMin && ctx.atrN<=atrHiMax && ctx.distE20<=distMax),
    retestSell:     () => (ctx.e20<ctx.e50 && ctx.slope20<=-slopeMin && ctx.atrN>=atrMedMin && ctx.atrN<=atrHiMax && ctx.distE20<=distMax),

    doubleTop:      () => (ctx.atrN>=atrMedMin && ctx.atrN<=atrMedMax && (ctx.e20<=ctx.e50 || Math.abs(ctx.slope20)<0.0007)),
    triangle:       () => (ctx.atrN>=atrMedMin && ctx.atrN<=0.012 && Math.abs(ctx.slope20)<=0.002),

    rangeBreakout:  () => (ctx.atrN>=atrMedMin && ctx.atrN<=atrMedMax && Math.abs(ctx.slope20)>=0.0005),

    gapReject:      () => true,

    tripleLevel:    () => (ctx.atrN>=atrMedMin && ctx.atrN<=atrMedMax && ctx.distE20<=distMax),

    trendReject:    () => (ctx.atrN>=atrLowCut && ctx.distE20<=distMax),

    secondEntry:    () => (Math.abs(ctx.slope20)>=slopeMin && ctx.distE20<=distMax),

    microChannels:  () => (Math.abs(ctx.slope20)>=slopeMin && ctx.distE20<=distMax),

    reversalBar:    () => (ctx.atrN>=atrLowCut && ctx.distE20<=distMax),

    // EMA Cross (Hermes) como continuação
    emaCross:       () => ( (ctx.e20>ctx.e50 && ctx.slope20>=slopeMin) || (ctx.e20<ctx.e50 && ctx.slope20<=-slopeMin) )
  };
}

// PIPE (ordem de prioridade leve; pode ajustar)
const PIPE = [
  { id:'retestBuy'      },
  { id:'retestSell'     },
  { id:'rangeBreakout'  },
  { id:'secondEntry'    },
  { id:'microChannels'  },
  { id:'triangle'       },
  { id:'doubleTop'      },
  { id:'tripleLevel'    },
  { id:'trendReject'    },
  { id:'reversalBar'    },
  { id:'gapReject'      },
  { id:'emaCross'       }, // mantém no fim para usar como retomada/continuação
];

export function evaluate(symbol, S, CFG, STRATS_MAP){
  // Retorna: { chosen, activeList, relaxActive }
  // chosen = { side, strategyId, strategyName, relax }
  try{
    const base = `${symbol}_${CFG.tfExec}`;
    const candles = S.candles[base];
    if (!candles || candles.length < 30) return { chosen:null, activeList:[], relaxActive:false };

    const ctx = buildCtx(candles);

    // ------- Relax Mode control -------
    // guarda um relógio local no S.orch
    const ORCH = (S.__orch ||= { lastActiveTs: Date.now(), relaxMode:false, relaxSince: null, lastEvalTs: 0, cache: null });
    const relaxAuto     = (CFG.relaxAuto !== false);               // ON por padrão
    const relaxAfterMin = Math.max(1, CFG.relaxAfterMin || 12)*60*1000;

    // Monta lista de *guards* ativos (sem olhar enabled da central ainda)
    const guards = makeGuards(ctx, ORCH.relaxMode, CFG);

    // Ver quais estariam ativas pelo cenário:
    const activeByScene = PIPE
      .filter(p => typeof guards[p.id] === "function" && guards[p.id]())
      .map(p => p.id);

    // Se não há nenhuma ativa por cenário e relax está ligado e não estamos em relax → aciona após N minutos
    if (relaxAuto){
      if (activeByScene.length > 0){
        ORCH.lastActiveTs = Date.now();
        if (ORCH.relaxMode){ ORCH.relaxMode = false; ORCH.relaxSince = null; }
      } else {
        if (!ORCH.relaxMode && (Date.now() - ORCH.lastActiveTs) >= relaxAfterMin){
          ORCH.relaxMode  = true;
          ORCH.relaxSince = Date.now();
        }
      }
    }

    const relaxActive = ORCH.relaxMode === true;

    // Agora, as ativas finais consideram também os toggles da central (CFG.strategies[id]?.enabled)
    const finalActives = activeByScene.filter(id => {
      const st = CFG.strategies?.[id];
      return !st || st.enabled !== false; // se não existir config, consideramos habilitada
    });

    // Expõe a lista no S para a UI (painel "Ativas")
    S.activeStrats = finalActives;

    // Percorre PIPE na ordem, mas chamando apenas as ativas finais
    for (const p of PIPE){
      const id = p.id;
      if (!finalActives.includes(id)) continue;

      const mod = STRATS_MAP[id];
      if (!mod || typeof mod.detect !== "function") continue;

      const hit = mod.detect(candles, { strongBull, strongBear });
      if (!hit || !hit.side) continue;

      // EMA Gate global (opcional)
      const gateOK = emaGateAllows(hit.side, ctx, CFG.emaGate);
      if (!gateOK) continue;

      const strategyName = (CFG.strategies?.[id]?.name) || mod.name || id;

      return {
        chosen: { side: hit.side, strategyId: id, strategyName, relax: relaxActive },
        activeList: finalActives,
        relaxActive
      };
    }

    return { chosen:null, activeList: finalActives, relaxActive };
  }catch(e){
    console.error("[orchestrator] evaluate error:", e);
    return { chosen:null, activeList:[], relaxActive:false };
  }
}
