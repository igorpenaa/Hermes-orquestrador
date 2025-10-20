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

function fmt(n, digits=4){
  if (n == null || Number.isNaN(n) || !Number.isFinite(n)) return '—';
  return Number(n).toFixed(digits);
}
function cond(label, pass, info={}){ return { label, pass, ...info }; }
function guardResult(conditions, meta={}){
  return { ok: conditions.every(c => c.pass), conditions, ...meta };
}
function toTitleCase(str){
  return String(str || '').replace(/[-_]+/g,' ').replace(/\s+/g,' ').trim().replace(/\b\w/g, x => x.toUpperCase());
}

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

function regimeAgree(symbol, S, CFG){
  try {
    if (!symbol || !S || !CFG) return null;
    const tfA = CFG.tfRegA || '5m';
    const tfB = CFG.tfRegB || '15m';
    const baseA = `${symbol}_${tfA}`;
    const baseB = `${symbol}_${tfB}`;
    const e5_20  = S.emas?.[`${baseA}_ema20`];
    const e5_50  = S.emas?.[`${baseA}_ema50`];
    const e15_20 = S.emas?.[`${baseB}_ema20`];
    const e15_50 = S.emas?.[`${baseB}_ema50`];
    if ([e5_20, e5_50, e15_20, e15_50].some(v => v == null)) return null;

    const bull5 = e5_20 > e5_50;
    const bear5 = e5_20 < e5_50;
    const bull15 = e15_20 > e15_50;
    const bear15 = e15_20 < e15_50;

    let state = "MIX";
    if (bull5 && bull15) state = "BULL";
    else if (bear5 && bear15) state = "BEAR";
    else if ((bull5 && bear15) || (bear5 && bull15)) state = "OPPOSED";

    const bias5 = bull5 ? "BULL" : bear5 ? "BEAR" : "MIX";
    return { state, bias5 };
  } catch (_err) {
    return null;
  }
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
function evaluateGuards(ctx, relax, CFG){
  const slopeMinBase = 0.001;
  const slopeLoose   = CFG.slopeLoose ?? 0.0007;
  const slopeMin     = relax ? slopeLoose : slopeMinBase;
  const distBase     = 1.0;
  const distAdd      = CFG.distE20RelaxAdd ?? 0.10;
  const distMax      = distBase + (relax ? distAdd : 0);
  const atrLowCut    = 0.0035;
  const atrMedMin    = 0.004;
  const atrMedMax    = 0.015;
  const atrHiMax     = 0.020;

  const slopeAbs = Math.abs(ctx.slope20);

  const results = {
    retestBreakoutBuy: guardResult([
      cond('EMA20 > EMA50', ctx.e20 > ctx.e50, { actual: ctx.e20, expected: ctx.e50, comparator: '>' }),
      cond(`Slope20 ≥ ${fmt(slopeMin, 4)}`, ctx.slope20 >= slopeMin, { actual: ctx.slope20, expected: slopeMin, comparator: '≥', digits: 4 }),
      cond(`ATRₙ ≥ ${fmt(atrMedMin, 4)}`, ctx.atrN >= atrMedMin, { actual: ctx.atrN, expected: atrMedMin, comparator: '≥', digits: 4 }),
      cond(`ATRₙ ≤ ${fmt(atrHiMax, 4)}`, ctx.atrN <= atrHiMax, { actual: ctx.atrN, expected: atrHiMax, comparator: '≤', digits: 4 }),
      cond(`Dist. EMA20 ≤ ${fmt(distMax, 3)}`, ctx.distE20 <= distMax, { actual: ctx.distE20, expected: distMax, comparator: '≤', digits: 3 })
    ], { relaxApplied: relax }),

    retestBreakdownSell: guardResult([
      cond('EMA20 < EMA50', ctx.e20 < ctx.e50, { actual: ctx.e20, expected: ctx.e50, comparator: '<' }),
      cond(`Slope20 ≤ -${fmt(slopeMin, 4)}`, ctx.slope20 <= -slopeMin, { actual: ctx.slope20, expected: -slopeMin, comparator: '≤', digits: 4 }),
      cond(`ATRₙ ≥ ${fmt(atrMedMin, 4)}`, ctx.atrN >= atrMedMin, { actual: ctx.atrN, expected: atrMedMin, comparator: '≥', digits: 4 }),
      cond(`ATRₙ ≤ ${fmt(atrHiMax, 4)}`, ctx.atrN <= atrHiMax, { actual: ctx.atrN, expected: atrHiMax, comparator: '≤', digits: 4 }),
      cond(`Dist. EMA20 ≤ ${fmt(distMax, 3)}`, ctx.distE20 <= distMax, { actual: ctx.distE20, expected: distMax, comparator: '≤', digits: 3 })
    ], { relaxApplied: relax }),

    doubleTopBottom: guardResult([
      cond(`ATRₙ ≥ ${fmt(atrMedMin, 4)}`, ctx.atrN >= atrMedMin, { actual: ctx.atrN, expected: atrMedMin, comparator: '≥', digits: 4 }),
      cond(`ATRₙ ≤ ${fmt(atrMedMax, 4)}`, ctx.atrN <= atrMedMax, { actual: ctx.atrN, expected: atrMedMax, comparator: '≤', digits: 4 }),
      cond('Tendência neutra (EMA20≤EMA50 ou |slope|<0.0007)', (ctx.e20 <= ctx.e50) || (slopeAbs < 0.0007), {
        extra: `EMA20=${fmt(ctx.e20,4)} • EMA50=${fmt(ctx.e50,4)} • |slope|=${fmt(slopeAbs,4)}`
      })
    ], { relaxApplied: relax }),

    symTriangle: guardResult([
      cond(`ATRₙ ≥ ${fmt(atrMedMin, 4)}`, ctx.atrN >= atrMedMin, { actual: ctx.atrN, expected: atrMedMin, comparator: '≥', digits: 4 }),
      cond('ATRₙ ≤ 0.0120', ctx.atrN <= 0.012, { actual: ctx.atrN, expected: 0.012, comparator: '≤', digits: 4 }),
      cond('|Slope20| ≤ 0.0020', slopeAbs <= 0.002, { actual: slopeAbs, expected: 0.002, comparator: '≤', digits: 4 })
    ], { relaxApplied: relax }),

    rangeBreakout: guardResult([
      cond(`ATRₙ ≥ ${fmt(atrMedMin, 4)}`, ctx.atrN >= atrMedMin, { actual: ctx.atrN, expected: atrMedMin, comparator: '≥', digits: 4 }),
      cond(`ATRₙ ≤ ${fmt(atrMedMax, 4)}`, ctx.atrN <= atrMedMax, { actual: ctx.atrN, expected: atrMedMax, comparator: '≤', digits: 4 }),
      cond('|Slope20| ≥ 0.0005', slopeAbs >= 0.0005, { actual: slopeAbs, expected: 0.0005, comparator: '≥', digits: 4 })
    ], { relaxApplied: relax }),

    gapRejection: guardResult([
      cond('Sem restrições adicionais', true, { note: 'Verificação direta do sinal.' })
    ], { relaxApplied: relax }),

    tripleLevel: guardResult([
      cond(`ATRₙ ≥ ${fmt(atrMedMin, 4)}`, ctx.atrN >= atrMedMin, { actual: ctx.atrN, expected: atrMedMin, comparator: '≥', digits: 4 }),
      cond(`ATRₙ ≤ ${fmt(atrMedMax, 4)}`, ctx.atrN <= atrMedMax, { actual: ctx.atrN, expected: atrMedMax, comparator: '≤', digits: 4 }),
      cond(`Dist. EMA20 ≤ ${fmt(distMax, 3)}`, ctx.distE20 <= distMax, { actual: ctx.distE20, expected: distMax, comparator: '≤', digits: 3 })
    ], { relaxApplied: relax }),

    trendlineRejection: guardResult([
      cond(`ATRₙ ≥ ${fmt(atrLowCut, 4)}`, ctx.atrN >= atrLowCut, { actual: ctx.atrN, expected: atrLowCut, comparator: '≥', digits: 4 }),
      cond(`Dist. EMA20 ≤ ${fmt(distMax, 3)}`, ctx.distE20 <= distMax, { actual: ctx.distE20, expected: distMax, comparator: '≤', digits: 3 })
    ], { relaxApplied: relax }),

    secondEntry: guardResult([
      cond(`|Slope20| ≥ ${fmt(slopeMin, 4)}`, slopeAbs >= slopeMin, { actual: slopeAbs, expected: slopeMin, comparator: '≥', digits: 4 }),
      cond(`Dist. EMA20 ≤ ${fmt(distMax, 3)}`, ctx.distE20 <= distMax, { actual: ctx.distE20, expected: distMax, comparator: '≤', digits: 3 })
    ], { relaxApplied: relax }),

    microChannels: guardResult([
      cond(`|Slope20| ≥ ${fmt(slopeMin, 4)}`, slopeAbs >= slopeMin, { actual: slopeAbs, expected: slopeMin, comparator: '≥', digits: 4 }),
      cond(`Dist. EMA20 ≤ ${fmt(distMax, 3)}`, ctx.distE20 <= distMax, { actual: ctx.distE20, expected: distMax, comparator: '≤', digits: 3 })
    ], { relaxApplied: relax }),

    reversalBar: guardResult([
      cond(`ATRₙ ≥ ${fmt(atrLowCut, 4)}`, ctx.atrN >= atrLowCut, { actual: ctx.atrN, expected: atrLowCut, comparator: '≥', digits: 4 }),
      cond(`Dist. EMA20 ≤ ${fmt(distMax, 3)}`, ctx.distE20 <= distMax, { actual: ctx.distE20, expected: distMax, comparator: '≤', digits: 3 })
    ], { relaxApplied: relax }),

    emaCross: guardResult([
      cond('Cruzamento e inclinação coerentes',
        (ctx.e20 > ctx.e50 && ctx.slope20 >= slopeMin) || (ctx.e20 < ctx.e50 && ctx.slope20 <= -slopeMin),
        { extra: `EMA20=${fmt(ctx.e20,4)} • EMA50=${fmt(ctx.e50,4)} • slope=${fmt(ctx.slope20,5)}` }
      )
    ], { relaxApplied: relax })
  };

  return {
    results,
    thresholds: {
      slopeMin,
      slopeLoose,
      distMax,
      distBase,
      distRelaxAdd: distAdd,
      atrLowCut,
      atrMedMin,
      atrMedMax,
      atrHiMax
    }
  };
}

// PIPE (ordem de prioridade leve; pode ajustar)
const PIPE = [
  { id:'retestBreakoutBuy'   },
  { id:'retestBreakdownSell' },
  { id:'rangeBreakout'       },
  { id:'secondEntry'         },
  { id:'microChannels'       },
  { id:'symTriangle'         },
  { id:'doubleTopBottom'     },
  { id:'tripleLevel'         },
  { id:'trendlineRejection'  },
  { id:'reversalBar'         },
  { id:'gapRejection'        },
  { id:'emaCross'            }, // mantém no fim para usar como retomada/continuação
];

export function evaluate(symbol, S, CFG, STRATS_MAP){
  // Retorna: { chosen, activeList, relaxActive }
  // chosen = { side, strategyId, strategyName, relax }
  try{
    const base = `${symbol}_${CFG.tfExec}`;
    const candles = S.candles[base];
    const gateCfgBase = CFG.emaGate || {};
    if (!candles || candles.length < 30){
      return {
        chosen: null,
        activeList: [],
        relaxActive: false,
        analysis: {
          timestamp: Date.now(),
          symbol,
          candles: candles ? candles.length : 0,
          reason: 'Velas insuficientes para diagnóstico',
          relaxActive: false,
          relaxAuto: CFG.relaxAuto !== false,
          activeByScene: [],
          finalActives: [],
          strategies: [],
          guardResults: {},
          metrics: null,
          thresholds: null,
          emaGate: {
            enabled: !!gateCfgBase.enabled,
            divisor: gateCfgBase.divisor ?? null,
            directional: gateCfgBase.directional ?? null,
            minDistATR: gateCfgBase.minDistATR ?? null,
            slopeMin: gateCfgBase.slopeMin ?? null,
            allowBuy: null,
            allowSell: null,
            blocked: []
          }
        }
      };
    }

    const ctx = buildCtx(candles);

    // ------- Relax Mode control -------
    // guarda um relógio local por símbolo em S.__orch
    const orchStore = (S.__orch ||= {});
    const ORCH = (orchStore[symbol] ||= {
      lastActiveTs: Date.now(),
      relaxMode: false,
      relaxSince: null,
      lastEvalTs: 0,
      cache: null,
    });
    const relaxAuto     = (CFG.relaxAuto !== false);               // ON por padrão
    const relaxAfterMin = Math.max(1, CFG.relaxAfterMin || 12)*60*1000;

    const guardBundle   = evaluateGuards(ctx, ORCH.relaxMode, CFG) || {};
    const guardResults  = guardBundle.results || {};
    const thresholds    = guardBundle.thresholds || {};

    // Ver quais estariam ativas pelo cenário:
    const activeByScene = PIPE
      .filter(p => guardResults[p.id]?.ok)
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

    const strategiesInfo = PIPE.map(p => {
      const guard = guardResults[p.id] || { ok:false, conditions:[] };
      const cfgEntry = CFG.strategies?.[p.id];
      const enabled = cfgEntry ? cfgEntry.enabled !== false : true;
      const name = cfgEntry?.name || STRATS_MAP?.[p.id]?.name || toTitleCase(p.id);
      return {
        id: p.id,
        name,
        enabled,
        activeByScene: !!guard.ok,
        activeFinal: enabled && guard.ok && finalActives.includes(p.id),
        guard,
        relaxApplied: guard.relaxApplied || false,
        gateBlocked: false,
        gateOk: null,
        lastSignal: null,
        chosen: false
      };
    });
    const stratMap = new Map(strategiesInfo.map(it => [it.id, it]));

    const emaGateCfg = CFG.emaGate || {};
    const emaGateInfo = {
      enabled: !!emaGateCfg.enabled,
      divisor: emaGateCfg.divisor ?? null,
      directional: emaGateCfg.directional ?? null,
      minDistATR: emaGateCfg.minDistATR ?? null,
      slopeMin: emaGateCfg.slopeMin ?? null,
      allowBuy: emaGateCfg.enabled ? emaGateAllows('BUY', ctx, emaGateCfg) : null,
      allowSell: emaGateCfg.enabled ? emaGateAllows('SELL', ctx, emaGateCfg) : null,
      blocked: [],
      lastDecision: null
    };

    const metrics = {
      ema20: ctx.e20,
      ema50: ctx.e50,
      slope20: ctx.slope20,
      atrN: ctx.atrN,
      distE20: ctx.distE20,
      volume: ctx.vNow,
      vAvg20: ctx.vAvg20
    };

    const analysis = {
      timestamp: Date.now(),
      symbol,
      candles: candles.length,
      relaxActive,
      relaxAuto,
      relaxSince: ORCH.relaxSince,
      activeByScene: [...activeByScene],
      finalActives: [...finalActives],
      guardResults,
      metrics,
      thresholds,
      strategies: strategiesInfo,
      emaGate: emaGateInfo,
      regime: regimeAgree(symbol, S, CFG),
      candleTs: ctx.L?.t ?? ctx.L?.T ?? null
    };

    // Percorre PIPE na ordem, mas chamando apenas as ativas finais
    for (const p of PIPE){
      const id = p.id;
      if (!finalActives.includes(id)) continue;

      const mod = STRATS_MAP[id];
      if (!mod || typeof mod.detect !== "function") continue;

      const emaGateFn = (_sym, side) => emaGateAllows(side, ctx, CFG.emaGate);
      const hit = mod.detect({
        symbol,
        S,
        CFG,
        candles,
        ctx,
        utils: { strongBull, strongBear },
        emaGateOk: emaGateFn,
        regimeAgreeDetailed: (sym) => regimeAgree(sym || symbol, S, CFG)
      });
      const stratEntry = stratMap.get(id);
      if (stratEntry && hit && hit.side){
        stratEntry.lastSignal = hit.side;
      }
      if (!hit || !hit.side) continue;

      // EMA Gate global (opcional)
      const gateOK = emaGateAllows(hit.side, ctx, CFG.emaGate);
      if (stratEntry) stratEntry.gateOk = gateOK;
      if (!gateOK){
        if (stratEntry) stratEntry.gateBlocked = true;
        const blockedLabel = stratEntry ? `${stratEntry.name} (${hit.side})` : `${toTitleCase(id)} (${hit.side})`;
        emaGateInfo.blocked.push(blockedLabel);
        emaGateInfo.lastDecision = `Bloqueado ${hit.side}`;
        continue;
      }
      emaGateInfo.lastDecision = `Liberado ${hit.side}`;

      const strategyId = mod.id || id;
      const strategyName = (CFG.strategies?.[strategyId]?.name) || mod.name || strategyId;

      const chosen = { side: hit.side, strategyId, strategyName, relax: relaxActive };
      analysis.chosen = { ...chosen };
      if (stratEntry){
        stratEntry.chosen = true;
        stratEntry.activeFinal = true;
        stratEntry.lastSignal = hit.side;
      }

      return {
        chosen,
        activeList: finalActives,
        relaxActive,
        analysis
      };
    }

    return { chosen:null, activeList: finalActives, relaxActive, analysis };
  }catch(e){
    console.error("[orchestrator] evaluate error:", e);
    return {
      chosen: null,
      activeList: [],
      relaxActive: false,
      analysis: {
        timestamp: Date.now(),
        symbol,
        error: e?.message || String(e)
      }
    };
  }
}
