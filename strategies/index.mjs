// strategies/index.mjs
// Loader + roteador leve. Cada detect wrapper consulta o orquestrador apenas 1x por minuto por símbolo.

import { evaluate } from './orchestrator.mjs';

import * as doubleTopBottom       from './doubleTopBottom.mjs';
import * as gapRejection          from './gapRejection.mjs';
import * as microChannels         from './microChannels.mjs';
import * as rangeBreakout         from './rangeBreakout.mjs';
import * as retestBreakdownSell   from './retestBreakdownSell.mjs';
import * as retestBreakoutBuy     from './retestBreakoutBuy.mjs';
import * as reversalBar           from './reversalBar.mjs';
import * as secondEntry           from './secondEntry.mjs';
import * as symmetricalTriangle   from './symmetricalTriangle.mjs';
import * as trendlineRejection    from './trendlineRejection.mjs';
import * as tripleLevel           from './tripleLevel.mjs';
import * as emaCrossHermes        from './emaCrossHermes.mjs';

// ---------- helpers ----------
function toTitleCase(s){
  return String(s||'').replace(/[-_]+/g,' ').replace(/\s+/g,' ').trim().replace(/\b\w/g,x=>x.toUpperCase());
}

// normaliza caso alguma estratégia exporte default, e valida campos essenciais
function normalize(mod){
  const m = (mod && typeof mod === 'object' && mod.default && typeof mod.default === 'object')
    ? mod.default
    : mod;

  const id     = m?.id ?? null;
  const name   = m?.name || m?.label || (id ? toTitleCase(id) : 'Estratégia');
  const detect = m?.detect;

  if (!id || typeof detect !== 'function') {
    // Não quebra o app: devolve um placeholder sem sinal, com id único.
    const pid = `invalid_${Math.random().toString(36).slice(2, 9)}`;
    console.warn(`[OPX][strategies] Estratégia inválida normalizada: id=${String(id)} detect=${typeof detect}. Placeholder criado com id=${pid}`);
    return { id: pid, name: `${name} (inv)`, detect(){ return null; } };
  }
  return { id, name, detect };
}

// mapa {id -> módulo} (já normalizados)
const STRATS_MAP = {
  retestBuy:       normalize(retestBreakoutBuy),
  retestSell:      normalize(retestBreakdownSell),
  rangeBreakout:   normalize(rangeBreakout),
  secondEntry:     normalize(secondEntry),
  microChannels:   normalize(microChannels),
  triangle:        normalize(symmetricalTriangle),
  doubleTop:       normalize(doubleTopBottom),
  tripleLevel:     normalize(tripleLevel),
  trendReject:     normalize(trendlineRejection),
  reversalBar:     normalize(reversalBar),
  gapReject:       normalize(gapRejection),

  // nova externa
  emaCrossHermes:  normalize(emaCrossHermes),
};

// chave de cache por símbolo/minuto (usa T ou t da última vela do TF de execução)
function getMinuteKey(S, CFG, symbol){
  const base = `${symbol}_${CFG.tfExec}`;
  const a = S?.candles?.[base];
  if (!a || !a.length) return null;
  const last = a[a.length-1];
  const ts = last.T ?? last.t ?? Date.now();
  return Math.floor(ts / 60000);
}

// Cache por símbolo: { [symbol]: { key, result } }
const cacheBySymbol = Object.create(null);

export async function loadAll({ asset, S, CFG }){
  // garantir entrada em CFG.strategies (para o painel/checkboxes)
  const ensureCfgEntry = (id, name)=>{
    CFG.strategies = CFG.strategies || {};
    if (!CFG.strategies[id]) CFG.strategies[id] = { enabled: true, name, orders: 0 };
    else CFG.strategies[id].name = name;
  };
  Object.values(STRATS_MAP).forEach(m => ensureCfgEntry(m.id, m.name));

  // única chamada/decisão por minuto por símbolo
  function centralEval(symbol){
    if (!symbol) return { chosen:null, activeList:[], relaxActive:false };

    const key = getMinuteKey(S, CFG, symbol);
    const c = (cacheBySymbol[symbol] ||= { key:null, result:null });

    if (key && key === c.key) return c.result;

    let chosen = null, activeList = [], relaxActive = false;
    try {
      const out = evaluate(symbol, S, CFG, STRATS_MAP) || {};
      chosen      = out.chosen ?? null;
      activeList  = Array.isArray(out.activeList) ? out.activeList : [];
      relaxActive = !!out.relaxActive;
    } catch (e) {
      // Não derruba o fluxo: só loga e segue sem sinal.
      console.warn("[OPX][strategies] evaluate() falhou:", e?.message || e);
    }

    c.key    = key;
    c.result = { chosen, activeList, relaxActive };

    // publicar para a UI (mantém compatibilidade)
    S.activeStrats = activeList;
    S.relaxMode    = relaxActive;

    return c.result;
  }

  // wrappers: apenas a estratégia escolhida devolve sinal; chamadas síncronas
  const wrappers = Object.values(STRATS_MAP).map((mod) => ({
    id:   mod.id,
    name: mod.name,
    detect: ({ symbol /*, S, CFG */ })=>{
      const out = centralEval(symbol);
      if (!out || !out.chosen) return null;

      // Segurança: normaliza id da escolhida para comparação
      const chosenId = out.chosen.strategyId || out.chosen.id || out.chosen;
      if (chosenId === mod.id){
        const side = (out.chosen.side || "").toUpperCase();
        if (side !== "BUY" && side !== "SELL") return null; // ignora lixo

        return {
          side,
          strategyId: mod.id,
          strategyName: mod.name + (out.relaxActive ? " (relax)" : ""),
          relax: !!out.relaxActive
        };
      }
      return null;
    }
  }));

  return wrappers;
}
