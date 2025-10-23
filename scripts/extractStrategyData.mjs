import fs from 'fs';

const raw = fs.readFileSync(new URL('../Paramentos,  níveis e informações das estratégias.mb', import.meta.url), 'utf8');

const STRATEGY_ID_BY_NAME = new Map([
  ['A-ORB / AVWAP Regime', 'aOrbAvwapRegime'],
  ['Micro Channels', 'microChannels'],
  ['Second Entry', 'secondEntry'],
  ['EMA Flow Scalper 2.1', 'emaFlowScalper21'],
  ['Aquila Alpinista', 'alpinista'],
  ['ATR Squeeze Break', 'atrSqueezeBreak'],
  ['Boreal Bagjump', 'bagjump'],
  ['BUY Sniper 1m', 'buySniper1m'],
  ['Double Top / Bottom', 'doubleTopBottom'],
  ['Gap Rejection', 'gapRejection'],
  ['Liquidity Sweep Reversal', 'liquiditySweepReversal'],
  ['Range Breakout', 'rangeBreakout'],
  ['Retest Breakdown (Sell)', 'retestBreakdownSell'],
  ['Retest Breakout (Buy)', 'retestBreakoutBuy'],
  ['Reversal Bar', 'reversalBar'],
  ['SELL Sniper 1m', 'sellSniper1m'],
  ['Symmetrical Triangle', 'symTriangle'],
  ['Trendline Rejection', 'trendlineRejection'],
  ['Triple Level', 'tripleLevel'],
  ['VWAP Precision Bounce', 'vwapPrecisionBounce'],
]);

const LEVEL_KEYS = ['metralhadora','espingarda','pistola','rifle','marksman','sniper'];

const sections = [];
const headerRegex = /⚙️ Estrutura da Estratégia — ([^\n]+)/g;
let match;
const indices = [];
while ((match = headerRegex.exec(raw))){
  indices.push({ name: match[1].trim(), index: match.index });
}
for (let i=0; i<indices.length; i++){
  const cur = indices[i];
  const next = indices[i+1];
  const sectionText = raw.slice(cur.index, next ? next.index : raw.length);
  sections.push({ name: cur.name, text: sectionText });
}

function cleanLines(text){
  return text.split(/\r?\n/).map(l=>l.trimEnd());
}

function parseStructure(block){
  const lines = cleanLines(block);
  const entries = [];
  let current = null;
  const flush = () => {
    if (!current) return;
    entries.push(current);
    current = null;
  };
  for (const rawLine of lines){
    const line = rawLine.trim();
    if (!line || line.startsWith('Parâmetro') || line.startsWith('Cada preset') || line.startsWith('Níveis de rigorosidade') || line.startsWith('⚙️') || line.startsWith('________________________________________')){
      continue;
    }
    if (line.startsWith('🔹 Afrouxar:')){
      if (!current) current = { label: '', func: '' };
      current.loosen = (current.loosen ? `${current.loosen} ` : '') + line.replace('🔹 Afrouxar:', '').trim();
      continue;
    }
    if (line.startsWith('🔹 Apertar:')){
      if (!current) current = { label: '', func: '' };
      current.tighten = (current.tighten ? `${current.tighten} ` : '') + line.replace('🔹 Apertar:', '').trim();
      continue;
    }
    if (line.startsWith('🔹')){
      continue;
    }
    flush();
    let label = line;
    let func = '';
    if (line.includes('\t')){
      const [a, ...rest] = line.split('\t');
      label = a.trim();
      func = rest.join(' ').trim();
    } else {
      const parts = line.split(/\s{2,}/);
      if (parts.length > 1){
        label = parts.shift().trim();
        func = parts.join(' ').trim();
      }
    }
    current = { label, func };
  }
  flush();
  return entries;
}

function parseBrain(block){
  return block.split('________________________________________')[0]?.trim() || block.trim();
}

function parseTips(block){
  const tips = [];
  const lines = cleanLines(block);
  for (const line of lines){
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^[0-9]+\./.test(trimmed)){
      tips.push(trimmed.replace(/^[0-9]+\.\s*/, '').trim());
    }
  }
  return tips;
}

function snakeToCamel(str){
  return str.replace(/_([a-z])/g, (_,c)=>c.toUpperCase());
}

const KEY_MAP = {
  aOrbAvwapRegime: {
    opening_range_min: 'orMinutes',
    session_minutes: 'sessionMinutes',
    adx5_mode_trend: 'adxTrend',
    gap_ema5m_pct: 'emaGapMin',
    volume_break: 'breakVolMult',
    volume_fade: 'fadeVolMult',
    dist_avwap_min_xatr: 'distVwapMin',
    dist_avwap_max_xatr: 'distVwapMax',
    pullback_max_xatr: 'pullbackMaxAtr',
    slope_avwap_min: 'vwapSlopeMin'
  },
  gapRejection: {
    gap_fixo_pct: 'gapFloorPct',
    gap_xatr: 'gapAtrMult',
    pavio_max: 'wickMaxRatio',
    rej_margin_pct: 'rejectionBufferPct'
  },
  liquiditySweepReversal: {
    lookback_ref: 'lookback',
    adx5_max: 'adxMax',
    pavio_min: 'wickMin',
    vol_xvma20: 'volMult'
  },
  vwapPrecisionBounce: {
    dist_min_xatr: 'distMinAtr',
    dist_max_xatr: 'distMaxAtr',
    adx5_max: 'adxMax',
    pavio_min: 'wickMin',
    vol_xvma20: 'volMult'
  },
  tripleLevel: {
    ema_ref: 'emaPeriod',
    dist_ema_xatr: 'distMax',
    atr_min: 'atrMin',
    atr_max: 'atrMax'
  },
  symTriangle: {
    period_slope: 'slopePeriod',
    atr_min: 'atrMin',
    atr_max: 'atrMax',
    slope_abs_max: 'slopeAbsMax'
  },
  trendlineRejection: {
    ema_ref: 'emaPeriod',
    atr_min: 'atrMin',
    dist_ema_xatr: 'distMax'
  },
  reversalBar: {
    ema_ref: 'emaPeriod',
    dist_ema_xatr: 'distMax',
    atr_min: 'atrMin'
  },
  secondEntry: {
    period_slope: 'slopePeriod',
    ema_ref: 'emaPeriod',
    slope_min: 'slopeAbsMin',
    dist_ema_xatr: 'distMax'
  },
  microChannels: {
    period_slope: 'slopePeriod',
    ema_ref: 'emaPeriod',
    slope_min: 'slopeAbsMin',
    dist_ema_xatr: 'distMax'
  },
  rangeBreakout: {
    slope_period: 'slopePeriod',
    atr_min: 'atrMin',
    atr_max: 'atrMax',
    slope_abs_min: 'slopeAbsMin'
  },
  retestBreakdownSell: {
    ema_fast: 'emaFast',
    ema_slow: 'emaSlow',
    slope_min: 'slopeMin',
    atr_min: 'atrMin',
    atr_max: 'atrMax',
    dist_max: 'distMax'
  },
  retestBreakoutBuy: {
    ema_fast: 'emaFast',
    ema_slow: 'emaSlow',
    slope_min: 'slopeMin',
    atr_min: 'atrMin',
    atr_max: 'atrMax',
    dist_max: 'distMax'
  },
  alpinista: {
    ema_fast: 'emaFast',
    ema_slow: 'emaSlow',
    slope_min: 'slopeMin',
    lookback: 'lookback',
    min_strong: 'minStrong',
    body_strength: 'bodyStrength',
    dist_max: 'distMax',
    atr_min: 'atrMin',
    atr_max: 'atrMax',
    vol_mult: 'volMult'
  },
  bagjump: {
    ema_fast: 'emaFast',
    ema_slow: 'emaSlow',
    slope_min: 'slopeMin',
    lookback: 'lookback',
    min_strong: 'minStrong',
    body_strength: 'bodyStrength',
    dist_max: 'distMax',
    atr_min: 'atrMin',
    atr_max: 'atrMax',
    vol_mult: 'volMult'
  },
  breakoutRetestPro: {
    lookback: 'lookback',
    break_atr_mult: 'breakAtrMult',
    break_atr_min: 'breakAtrMin',
    vol_break_mult: 'volBreakMult'
  },
  emaFlowScalper21: {
    adx_min: 'adxMin',
    atr_n_min: 'atrNMin',
    vol_mult: 'volMult',
    ema_gap_min: 'emaGapMin',
    slope_min: 'slopeMin',
    require_m15_agree: 'requireM15Agree'
  },
  atrSqueezeBreak: {
    atr_percentile: 'atrPercentile',
    bbw_percentile: 'bbwPercentile',
    atr_lookback: 'atrLookback',
    box_len_min: 'boxLenMin',
    box_len_max: 'boxLenMax',
    break_atr_mult: 'breakAtrMult',
    vol_mult: 'volMult',
    pullback_max_atr: 'pullbackMaxAtr'
  },
  doubleTopBottom: {
    ema_fast: 'emaFast',
    ema_slow: 'emaSlow',
    atr_min: 'atrMin',
    atr_max: 'atrMax',
    slope_neutral_max: 'slopeNeutralMax'
  },
  buySniper1m: {
    slope_min: 'slopeMin',
    slope_slow_min: 'slopeSlowMin',
    ema_gap_min: 'emaGapMin',
    atr_min_mult: 'atrMinMult',
    rsi_trigger: 'rsiTrigger',
    rsi_pre_trigger: 'rsiPreTrigger',
    rsi_max: 'rsiMax',
    body_strength: 'bodyStrength',
    volume_min_mult: 'volumeMinMult',
    volume_spike_max: 'volumeSpikeMax',
    touch_tolerance_pct: 'touchTolerancePct',
    break_tolerance_pct: 'breakTolerancePct'
  },
  sellSniper1m: {
    slope_min: 'slopeMin',
    slope_slow_min: 'slopeSlowMin',
    ema_gap_min: 'emaGapMin',
    atr_min_mult: 'atrMinMult',
    rsi_trigger: 'rsiTrigger',
    rsi_pre_trigger: 'rsiPreTrigger',
    rsi_min: 'rsiMin',
    body_strength: 'bodyStrength',
    volume_min_mult: 'volumeMinMult',
    volume_spike_max: 'volumeSpikeMax',
    touch_tolerance_pct: 'touchTolerancePct',
    break_tolerance_pct: 'breakTolerancePct'
  },
  rangeBreakout: {
    slope_period: 'slopePeriod',
    atr_min: 'atrMin',
    atr_max: 'atrMax',
    slope_abs_min: 'slopeAbsMin'
  }
};

function normalizePreset(strategyId, preset){
  const mapping = KEY_MAP[strategyId] || {};
  const out = {};
  for (const [key, value] of Object.entries(preset)){
    if (key === 'notes' || key === 'mode') continue;
    const target = mapping[key] || snakeToCamel(key);
    out[target] = value;
  }
  const notes = preset.notes ? String(preset.notes).trim() : '';
  return { values: out, notes };
}

function parseSetups(block, strategyId){
  const presetRegex = /([0-9️⃣][^\n]+)\n\{([\s\S]*?)\}\n/g;
  const matches = [];
  let m;
  while ((m = presetRegex.exec(block))){
    matches.push({ header: m[1].trim(), json: m[2], start: m.index, end: presetRegex.lastIndex });
  }
  const presets = {};
  matches.forEach((entry, idx)=>{
    const { header, json, end } = entry;
    const nextStart = idx + 1 < matches.length ? matches[idx+1].start : block.length;
    let after = block.slice(end, nextStart).replace(/[_\s]+/g, ' ').trim();
    after = after.replace(/🧭[\s\S]*$/, '').trim();
    let jsonText = `{${json}}`;
    jsonText = jsonText.replace(/\/\/.*$/gm, '');
    let data;
    try {
      data = JSON.parse(jsonText);
    } catch (err) {
      console.error('Failed to parse preset for', strategyId, header);
      console.error(jsonText);
      throw err;
    }
    const normalized = normalizePreset(strategyId, data);
    const levelKey = LEVEL_KEYS.find(level => header.toLowerCase().includes(level));
    if (levelKey){
      normalized.notes = [normalized.notes, after].filter(Boolean).join(' ').trim();
      presets[levelKey] = normalized;
    }
  });
  return presets;
}

const out = {};
for (const { name, text } of sections){
  const id = STRATEGY_ID_BY_NAME.get(name);
  if (!id) continue;
  const structurePart = text.split('🧠 Como')[0]?.split('Parâmetro')[1];
  const brainPart = text.includes('🧠 Como') ? text.split('🧠 Como')[1] : '';
  const setupsPart = text.includes('✅ 6 SETUPS') ? text.split('✅ 6 SETUPS')[1] : '';
  const tipsPart = text.includes('🧭') ? text.split('🧭')[1] : '';
  const actualBrain = brainPart.split('✅ 6 SETUPS')[0] || brainPart.split('⚙️ Micro')[0] || '';
  const structure = structurePart ? parseStructure(structurePart) : [];
  const brain = parseBrain(actualBrain || '');
  const tips = parseTips(tipsPart || '');
  const presets = parseSetups(text || '', id);
  out[id] = { name, structure, brain: brain.trim(), tips, presets };
}

console.log(JSON.stringify(out, null, 2));
