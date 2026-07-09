// ——— Main application: dice state, rolling logic, rendering ———
import { makeSVG } from './dice-shapes.js?v=20260705-game-icons-inline';
import * as D3D from './dice3d-box.js?v=20260706-d100-two-dice-box-v2';
import { sendRoll, joinRoom, createRoom, purgeRoom, leaveRoom, randomFantasyName, initPlaceholder, restoreSession, saveCharacterSheet, getPlayerCharacter } from './supabase-room.js?v=20260708-brp-orc';
import { showToast } from './toast.js?v=20260708-brp-orc';
import { BRP_SPECIES, BRP_PROFESSIONS, speciesByName, professionByName } from './brp-data.js?v=20260708-livret-joueur';

// ——— config ———
const DTYPES = [4, 6, 8, 10, 12, 20, 100];
const MAX_CHARACTER_MOVES = 3;
const MAX_CHARACTER_REROLLS = 2;
const CHARACTER_EXPORT_FORMAT = 'dice-forge.character.v1';
const BRP_DIFFICULTIES = [
  { value: 'auto', label: 'Automatique', shortLabel: 'Automatique', mode: 'auto-success' },
  { value: 'easy', label: 'Facile ×2', shortLabel: 'Facile', multiplier: 2 },
  { value: 'normal', label: 'Moyen ×1', shortLabel: 'Moyen', multiplier: 1 },
  { value: 'hard', label: 'Difficile ÷2', shortLabel: 'Difficile', divisor: 2 },
  { value: 'impossible', label: 'Impossible', shortLabel: 'Impossible', mode: 'auto-failure' }
];
const CHARACTER_STATS = [
  { key: 'force', code: 'FOR', label: 'Force', count: 3, type: 6, mod: 0, test: 'Effort' },
  { key: 'constitution', code: 'CON', label: 'Constitution', count: 3, type: 6, mod: 0, test: 'Endurance' },
  { key: 'taille', code: 'TAI', label: 'Taille', count: 2, type: 6, mod: 6, test: null },
  { key: 'intelligence', code: 'INT', label: 'Intelligence', count: 2, type: 6, mod: 6, test: 'Idée' },
  { key: 'pouvoir', code: 'POU', label: 'Pouvoir', count: 3, type: 6, mod: 0, test: 'Chance' },
  { key: 'dexterite', code: 'DEX', label: 'Dextérité', count: 3, type: 6, mod: 0, test: 'Agilité' },
  { key: 'charisme', code: 'CHA', label: 'Charisme', count: 3, type: 6, mod: 0, test: 'Charme' }
];
const CHARACTER_DETAIL_KEYS = ['espece', 'genre', 'age', 'profession', 'richesse', 'traits', 'notes'];

// ——— state ———
let expr = {};   // {4:0,6:0,...}
DTYPES.forEach(t => expr[t] = 0);
let results = null;
let rolling = false;
let cfg = { anim: true, sound: true, hide: false };
let characterState = { generated: false, rerollsUsed: 0, stats: {}, saved: false };

// ——— crypto random ———
function rnd(min, max) {
  const range = max - min + 1;
  const max32 = Math.floor(4294967296 / range) * range;
  const arr = new Uint32Array(1);
  let v;
  do { crypto.getRandomValues(arr); v = arr[0]; } while (v >= max32);
  return min + (v % range);
}

// ——— sound ———
function sndRoll() {
  if (!cfg.sound) return;
  try {
    const audio = document.getElementById('roll-sfx');
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    audio.volume = .85;
    const playPromise = audio.play();
    if (playPromise && playPromise.catch) playPromise.catch(() => {});
  } catch (e) {}
}
function sndCrit() {
  if (!cfg.sound) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const gn = ctx.createGain(); gn.gain.setValueAtTime(.12, ctx.currentTime); gn.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .7);
    gn.connect(ctx.destination);
    [523, 659, 784, 1047].forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      o.connect(gn); o.start(ctx.currentTime + i * .08); o.stop(ctx.currentTime + .7);
    });
  } catch (e) {}
}
function sndFail() {
  if (!cfg.sound) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const gn = ctx.createGain(); gn.gain.setValueAtTime(.1, ctx.currentTime); gn.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .6);
    gn.connect(ctx.destination);
    [300, 250, 200].forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      o.connect(gn); o.start(ctx.currentTime + i * .1); o.stop(ctx.currentTime + .6);
    });
  } catch (e) {}
}

// ——— dice grid ———
function renderGrid() {
  const el = document.getElementById('dgrid');
  el.innerHTML = DTYPES.map(t => `
    <div class="dsel${expr[t] > 0 ? ' active' : ''}" id="dsel-${t}">
      <div style="height:46px;display:flex;align-items:center;justify-content:center;">
        ${makeSVG(t, null, 'idle').replace('viewBox="0 0 100 100"', 'viewBox="0 0 100 100" width="42" height="42"')}
      </div>
      <div class="dname">D${t}</div>
      <div class="dcount">
        <button class="cbtn" onclick="chg(${t},-1)">−</button>
        <span class="cval" id="cv-${t}">${expr[t]}</span>
        <button class="cbtn" onclick="chg(${t},1)">+</button>
      </div>
    </div>`).join('');
}

function renderExBar() {
  const bar = document.getElementById('exbar');
  const mod = parseInt(document.getElementById('mod-input').value) || 0;
  const parts = DTYPES.filter(t => expr[t] > 0);
  if (parts.length === 0) {
    bar.innerHTML = '<span class="exempty">Sélectionnez des dés ci-dessus…</span>';
    document.getElementById('roll-btn').disabled = true;
    return;
  }
  document.getElementById('roll-btn').disabled = false;
  let html = parts.map((t, i) => `${i > 0 ? '<span class="explus">+</span>' : ''}<span class="extok">${expr[t]}D${t}</span>`).join('');
  if (mod !== 0) html += `<span class="explus">${mod >= 0 ? '+' : ''}</span><span class="extok" style="color:var(--purp2);border-color:rgba(168,85,247,.3);background:rgba(168,85,247,.08)">${mod}</span>`;
  html += `<button class="exclear" onclick="clearExpr()">✕ Effacer</button>`;
  bar.innerHTML = html;
}

// ——— controls ———
function chg(type, delta) {
  if (rolling) return;
  expr[type] = Math.max(0, Math.min(10, expr[type] + delta));
  renderGrid(); renderExBar();
}
function clearExpr() {
  if (rolling) return;
  DTYPES.forEach(t => expr[t] = 0);
  document.getElementById('mod-input').value = 0;
  renderGrid(); renderExBar();
  results = null; renderResult();
}
function toggleSetting(k) {
  cfg[k] = !cfg[k];
  document.getElementById('tog-' + k).classList.toggle('on', cfg[k]);
}

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const active = btn.id === 'tab-' + tab;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === 'panel-' + tab);
  });
}

function initCharacterOptions() {
  const speciesSelect = document.getElementById('character-species');
  if (speciesSelect && !speciesSelect.options.length) {
    speciesSelect.innerHTML = BRP_SPECIES.map(species => `<option value="${species.name}">${species.name}</option>`).join('');
  }

  const professionSelect = document.getElementById('character-profession');
  if (professionSelect && !professionSelect.options.length) {
    professionSelect.innerHTML = '<option value="">Profession...</option>' + BRP_PROFESSIONS.map(profession =>
      `<option value="${profession.name}">${profession.name}${profession.tag ? ` · ${profession.tag}` : ''}</option>`
    ).join('');
  }
  syncProfessionRichesse();
}

function currentSpecies() {
  return speciesByName(document.getElementById('character-species')?.value);
}

function currentCharacterAge() {
  const ageInput = document.querySelector('[data-character-field="age"]');
  const age = parseInt(ageInput?.value, 10);
  return Number.isFinite(age) && age >= 0 ? age : null;
}

function ageBandForSpecies(age = currentCharacterAge(), species = currentSpecies()) {
  if (age === null) return null;
  const band = species.ageBands?.find(item => item.max === null || age <= item.max);
  return band?.label || null;
}

function formatSpeciesAge(age = currentCharacterAge(), species = currentSpecies()) {
  const band = ageBandForSpecies(age, species);
  if (age === null || !band) return 'Âge relatif selon l’espèce.';
  return `${age} ans · ${species.name} : ${band}`;
}

function renderCharacterAgeHint() {
  const hint = document.getElementById('character-age-band');
  if (hint) hint.textContent = formatSpeciesAge();
}

function currentProfession() {
  return professionByName(document.getElementById('character-profession')?.value);
}

function syncProfessionRichesse() {
  const profession = currentProfession();
  const richesseInput = document.querySelector('[data-character-field="richesse"]');
  if (profession && richesseInput) richesseInput.value = profession.richesse;
}

function characterProfileChanged(kind) {
  syncProfessionRichesse();
  if (kind === 'species' && characterState.generated) {
    characterState = { generated: false, rerollsUsed: 0, stats: {}, saved: false };
    showToast('Espèce modifiée: génère une nouvelle série', 'success');
  }
  characterNameChanged();
}

// ——— roll ———
function buildGroups() {
  return DTYPES.filter(t => expr[t] > 0).map(t => ({
    type: t,
    rolls: Array.from({ length: expr[t] }, () => ({ val: null, state: 'rolling' }))
  }));
}

function rollAll() {
  if (rolling) return;
  const groups = buildGroups();
  if (!groups.length) return;
  const mod = parseInt(document.getElementById('mod-input').value) || 0;

  rolling = true;
  results = { groups, total: null, mod };
  document.getElementById('roll-btn').classList.add('rolling');
  document.getElementById('roll-btn').disabled = true;
  disableQuick(true);

  sndRoll();

  const dur = cfg.anim ? 1800 : 0;

  if (cfg.anim) {
    groups.forEach(g => g.rolls.forEach(r => { r.val = rnd(1, g.type); r.state = 'rolling'; }));
    groups.forEach(g => g.rolls.forEach(r => { r.finalVal = rnd(1, g.type); }));
    document.getElementById('result-area').style.visibility = 'hidden';
    renderResult();
    D3D.roll(groups, dur, () => finalize(groups, mod));
  } else {
    finalize(groups, mod);
  }
}

function finalize(groups, mod) {
  groups.forEach(g => {
    g.rolls.forEach(r => {
      r.val = r.finalVal !== undefined ? r.finalVal : rnd(1, g.type);
      const ratio = r.val / g.type;
      if (g.type === 20 && r.val === 20) r.state = 's-crit';
      else if (g.type === 20 && r.val === 1) r.state = 's-fail';
      else if (ratio >= .85) r.state = 's-high';
      else if (ratio <= .15) r.state = 's-low';
      else r.state = 's-norm';
    });
  });
  const rawTotal = groups.reduce((s, g) => s + g.rolls.reduce((ss, r) => ss + r.val, 0), 0);
  const total = rawTotal + mod;
  const hasCrit = groups.some(g => g.type === 20 && g.rolls.some(r => r.val === 20));
  const hasFail = groups.some(g => g.type === 20 && g.rolls.some(r => r.val === 1));
  if (hasCrit) sndCrit();
  else if (hasFail) sndFail();

  results = { groups, total, rawTotal, mod };
  rolling = false;
  document.getElementById('roll-btn').classList.remove('rolling');
  document.getElementById('roll-btn').disabled = false;
  disableQuick(false);
  document.getElementById('result-area').style.visibility = '';
  renderResult();
  D3D.hide();

  const exprStr = groups.map(g => `${g.rolls.length}D${g.type}`).join(' + ') + (mod !== 0 ? (mod >= 0 ? ` + ${mod}` : ` − ${Math.abs(mod)}`) : '');
  const rollsStr = groups.map(g => `[${g.rolls.map(r => r.val).join(', ')}]`).join(' ');
  sendRoll(exprStr, rollsStr, total, hasCrit, hasFail, cfg.hide);
}

function disableQuick(disabled) {
  document.querySelectorAll('.qbtn, .brp-test-btn').forEach(b => b.disabled = disabled);
}

function setRollingUi(active) {
  rolling = active;
  document.getElementById('roll-btn').classList.toggle('rolling', active);
  document.getElementById('roll-btn').disabled = active;
  disableQuick(active);
}

function finishRollingUi() {
  rolling = false;
  document.getElementById('roll-btn').classList.remove('rolling');
  disableQuick(false);
  document.getElementById('result-area').style.visibility = '';
  D3D.hide();
  renderExBar();
}

// ——— character sheet ———
function rollMany(count, type) {
  const rolls = Array.from({ length: count }, () => rnd(1, type));
  return { rolls, total: rolls.reduce((sum, val) => sum + val, 0) };
}

function clampCharacteristic(value) {
  return Math.max(3, Math.min(21, value));
}

function formulaForStat(def) {
  return { count: def.count, type: def.type, mod: def.mod };
}

function racialModifierForStat(key, species = currentSpecies()) {
  return species.modifiers?.[key] || null;
}

function buildCharacterStats() {
  const stats = {};
  const species = currentSpecies();
  CHARACTER_STATS.forEach(def => {
    const formula = formulaForStat(def);
    const result = rollMany(formula.count, formula.type);
    const rolledBase = result.total + formula.mod;
    const racialFormula = racialModifierForStat(def.key, species);
    let racial = null;
    let racialAdjust = 0;
    if (racialFormula) {
      const racialRoll = rollMany(racialFormula.count, racialFormula.type);
      racialAdjust = racialFormula.sign * racialRoll.total;
      racial = {
        ...racialFormula,
        rolls: racialRoll.rolls,
        total: racialRoll.total,
        adjust: racialAdjust
      };
    }
    const rawBase = rolledBase + racialAdjust;
    stats[def.key] = {
      base: clampCharacteristic(rawBase),
      rolledBase,
      rawBase,
      adjust: 0,
      rolls: result.rolls,
      formula,
      racial
    };
  });
  return stats;
}

function generateCharacterStats() {
  characterState = {
    generated: true,
    rerollsUsed: 0,
    stats: buildCharacterStats(),
    saved: false
  };
  renderCharacterSheet();
}

function rerollCharacterStats() {
  if (!characterState.generated || characterState.rerollsUsed >= MAX_CHARACTER_REROLLS) return;
  characterState.rerollsUsed += 1;
  characterState.stats = buildCharacterStats();
  characterState.saved = false;
  renderCharacterSheet();
}

function resetCharacterSheet() {
  characterState = { generated: false, rerollsUsed: 0, stats: {}, saved: false };
  const nameInput = document.getElementById('character-name');
  if (nameInput) nameInput.value = '';
  document.querySelectorAll('[data-character-field]').forEach(field => {
    if (field.tagName === 'SELECT') field.selectedIndex = 0;
    else field.value = '';
  });
  syncProfessionRichesse();
  renderCharacterSheet();
}

function characterNameChanged() {
  characterState.saved = false;
  renderCharacterSheet();
}

function characterMovedOut() {
  return CHARACTER_STATS.reduce((sum, def) => {
    const stat = characterState.stats[def.key];
    return sum + Math.max(0, -(stat?.adjust || 0));
  }, 0);
}

function characterMovedIn() {
  return CHARACTER_STATS.reduce((sum, def) => {
    const stat = characterState.stats[def.key];
    return sum + Math.max(0, stat?.adjust || 0);
  }, 0);
}

function characterReserve() {
  return characterMovedOut() - characterMovedIn();
}

function characterFinal(def) {
  const stat = characterState.stats[def.key];
  return stat ? stat.base + stat.adjust : 0;
}

function formatAdjust(value) {
  if (value > 0) return `+${value}`;
  return `${value}`;
}

function formatFormula(formula) {
  const mod = formula.mod > 0 ? ` + ${formula.mod}` : formula.mod < 0 ? ` - ${Math.abs(formula.mod)}` : '';
  return `${formula.count}D${formula.type}${mod}`;
}

function formatCalculationPart(value) {
  if (value > 0) return ` + ${value}`;
  if (value < 0) return ` - ${Math.abs(value)}`;
  return '';
}

function formatSignedFormula(formula) {
  const sign = formula.sign >= 0 ? '+' : '-';
  return `${sign}${formula.count}D${formula.type}`;
}

function formatSignedValue(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function getCharacterDetails() {
  const details = {};
  document.querySelectorAll('[data-character-field]').forEach(field => {
    details[field.dataset.characterField] = field.value.trim();
  });
  return details;
}

function getCharacterNameValue() {
  return document.getElementById('character-name')?.value.trim() || '';
}

function numericOrFallback(value, fallback = 0) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeRollList(rolls) {
  return Array.isArray(rolls)
    ? rolls.map(value => parseInt(value, 10)).filter(Number.isFinite)
    : [];
}

function normalizeFormulaForImport(formula, def) {
  if (!formula || typeof formula !== 'object') return formulaForStat(def);
  return {
    count: Math.max(1, numericOrFallback(formula.count, def.count)),
    type: Math.max(2, numericOrFallback(formula.type, def.type)),
    mod: numericOrFallback(formula.mod, def.mod)
  };
}

function normalizeRacialForImport(racial) {
  if (!racial || typeof racial !== 'object') return null;
  const sign = Number(racial.sign) < 0 ? -1 : 1;
  const rolls = normalizeRollList(racial.rolls);
  const total = numericOrFallback(racial.total, rolls.reduce((sum, value) => sum + value, 0));
  return {
    sign,
    count: Math.max(1, numericOrFallback(racial.count, rolls.length || 1)),
    type: Math.max(2, numericOrFallback(racial.type, 6)),
    rolls,
    total,
    adjust: numericOrFallback(racial.adjust, sign * total)
  };
}

function characterScoresFromRecord(record) {
  const scores = {};
  CHARACTER_STATS.forEach(def => {
    const parsed = parseInt(record?.[def.key], 10);
    scores[def.key] = Number.isFinite(parsed) ? parsed : null;
  });
  return scores;
}

function hasCompleteCharacterScores(scores) {
  return CHARACTER_STATS.every(def => Number.isFinite(scores?.[def.key]));
}

function exportPayloadFromCurrentSheet() {
  if (!characterState.generated) return null;
  return {
    nom: getCharacterNameValue(),
    details: getCharacterDetails(),
    stats: characterScores(),
    generation: {
      rerollsUsed: characterState.rerollsUsed,
      stats: characterState.stats
    }
  };
}

function exportPayloadFromSavedCharacter(character) {
  if (!character) return null;
  const stats = characterScoresFromRecord(character);
  if (!hasCompleteCharacterScores(stats)) return null;
  const details = {};
  CHARACTER_DETAIL_KEYS.forEach(key => {
    details[key] = character[key] ?? '';
  });
  return {
    nom: character.nom || '',
    details,
    stats
  };
}

function safeExportFilename(name) {
  const base = (name || 'personnage')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'personnage';
  return `dice-forge-${base}.json`;
}

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function exportCharacterSheet() {
  const character = exportPayloadFromCurrentSheet() || exportPayloadFromSavedCharacter(getPlayerCharacter());
  if (!character) {
    showToast('Aucune fiche personnage à exporter', 'error');
    return;
  }

  downloadJson(safeExportFilename(character.nom), {
    format: CHARACTER_EXPORT_FORMAT,
    exportedAt: new Date().toISOString(),
    character
  });
  showToast('Fiche personnage exportée', 'success');
}

function readImportedFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Lecture impossible'));
    reader.readAsText(file, 'utf-8');
  });
}

function normalizeImportedCharacter(raw) {
  const source = raw?.character && typeof raw.character === 'object' ? raw.character : raw;
  if (!source || typeof source !== 'object') throw new Error('Format de fiche invalide');

  const details = { ...(source.details || {}) };
  CHARACTER_DETAIL_KEYS.forEach(key => {
    if (details[key] === undefined && source[key] !== undefined) details[key] = source[key];
  });

  const statSource = { ...(source.stats || {}) };
  CHARACTER_STATS.forEach(def => {
    if (statSource[def.key] === undefined && source[def.key] !== undefined) statSource[def.key] = source[def.key];
  });

  const stats = {};
  CHARACTER_STATS.forEach(def => {
    const parsed = parseInt(statSource[def.key], 10);
    if (!Number.isFinite(parsed)) throw new Error(`Caractéristique manquante: ${def.code}`);
    stats[def.key] = clampCharacteristic(parsed);
  });

  return {
    nom: String(source.nom || source.name || source.characterName || ''),
    details,
    stats,
    generation: source.generation && typeof source.generation === 'object' ? source.generation : null
  };
}

function ensureSelectOption(select, value) {
  if (!select || !value) return;
  const exists = Array.from(select.options).some(option => option.value === value);
  if (!exists) select.add(new Option(value, value));
}

function setCharacterFieldValue(key, value) {
  const field = document.querySelector(`[data-character-field="${key}"]`);
  if (!field) return;
  const text = value === undefined || value === null ? '' : String(value);
  if (field.tagName === 'SELECT') ensureSelectOption(field, text);
  field.value = text;
}

function importedStatsState(payload) {
  const exportedStats = payload.generation?.stats || {};
  const stats = {};

  CHARACTER_STATS.forEach(def => {
    const exported = exportedStats[def.key];
    const fallback = clampCharacteristic(payload.stats[def.key]);
    if (exported && typeof exported === 'object') {
      const base = clampCharacteristic(numericOrFallback(exported.base, fallback));
      const adjust = numericOrFallback(exported.adjust, fallback - base);
      const rawBase = numericOrFallback(exported.rawBase, base);
      stats[def.key] = {
        base,
        rolledBase: numericOrFallback(exported.rolledBase, rawBase),
        rawBase,
        adjust,
        rolls: normalizeRollList(exported.rolls),
        formula: normalizeFormulaForImport(exported.formula, def),
        racial: normalizeRacialForImport(exported.racial),
        imported: !!exported.imported || !Array.isArray(exported.rolls) || !exported.rolls.length
      };
      return;
    }

    stats[def.key] = {
      base: fallback,
      rolledBase: fallback,
      rawBase: fallback,
      adjust: 0,
      rolls: [],
      formula: formulaForStat(def),
      racial: null,
      imported: true
    };
  });

  return stats;
}

function applyImportedCharacter(payload) {
  const nameInput = document.getElementById('character-name');
  if (nameInput) nameInput.value = payload.nom;
  CHARACTER_DETAIL_KEYS.forEach(key => setCharacterFieldValue(key, payload.details[key]));
  if (!payload.details.richesse) syncProfessionRichesse();

  characterState = {
    generated: true,
    rerollsUsed: Math.max(0, Math.min(MAX_CHARACTER_REROLLS, numericOrFallback(payload.generation?.rerollsUsed, 0))),
    stats: importedStatsState(payload),
    saved: false
  };
  renderCharacterSheet();
  switchTab('character');
}

async function importCharacterSheet(event) {
  const input = event?.target;
  const file = input?.files?.[0];
  if (!file) return;

  try {
    const text = await readImportedFile(file);
    const parsed = JSON.parse(text);
    const payload = normalizeImportedCharacter(parsed);
    applyImportedCharacter(payload);
    showToast('Fiche importée. Enregistre-la dans cette room.', 'success');
  } catch (error) {
    showToast('Import impossible: ' + (error.message || 'fichier invalide'), 'error');
  } finally {
    if (input) input.value = '';
  }
}

function damageBonus(forcePlusTaille) {
  if (forcePlusTaille <= 12) return '-1D6';
  if (forcePlusTaille <= 16) return '-1D4';
  if (forcePlusTaille <= 24) return 'Aucun';
  if (forcePlusTaille <= 32) return '+1D4';
  if (forcePlusTaille <= 40) return '+1D6';
  if (forcePlusTaille <= 56) return '+2D6';
  if (forcePlusTaille <= 72) return '+3D6';
  if (forcePlusTaille <= 88) return '+4D6';
  if (forcePlusTaille <= 104) return '+5D6';
  if (forcePlusTaille <= 120) return '+6D6';
  if (forcePlusTaille <= 136) return '+7D6';
  if (forcePlusTaille <= 152) return '+8D6';
  return `+${9 + Math.floor((forcePlusTaille - 153) / 16)}D6`;
}

function characterScores() {
  const scores = {};
  CHARACTER_STATS.forEach(def => {
    scores[def.key] = characterFinal(def);
  });
  return scores;
}

function characterDerived(scores = characterScores(), species = currentSpecies()) {
  const hitPoints = Math.ceil((scores.constitution + scores.taille) / 2);
  return [
    { code: 'BD', label: 'Bonus dégâts', value: damageBonus(scores.force + scores.taille), detail: `FOR+TAI ${scores.force + scores.taille}` },
    { code: 'PV', label: 'Points de vie', value: hitPoints, detail: 'CON+TAI / 2' },
    { code: 'BM', label: 'Blessure majeure', value: Math.ceil(hitPoints / 2), detail: 'PV / 2' },
    { code: 'PP', label: 'Points de pouvoir', value: scores.pouvoir, detail: 'Max = POU' },
    { code: 'XP', label: 'Bonus expérience', value: `+${Math.ceil(scores.intelligence / 2)}`, detail: 'INT / 2' },
    { code: 'MOV', label: 'Mouvement', value: species.mov, detail: species.name },
    { code: 'PF', label: 'Fatigue optionnelle', value: scores.force + scores.constitution, detail: 'FOR+CON' },
    { code: 'SAN', label: 'Santé mentale opt.', value: scores.pouvoir * 5, detail: 'POU×5' }
  ];
}

function shiftCharacterPoint(key, delta) {
  if (!characterState.generated) return;
  const stat = characterState.stats[key];
  if (!stat) return;

  if (delta > 0) {
    if (characterReserve() <= 0) return;
    if (stat.base + stat.adjust >= 21) return;
    stat.adjust += 1;
  } else {
    if (stat.adjust > 0) {
      stat.adjust -= 1;
    } else {
      if (characterMovedOut() >= MAX_CHARACTER_MOVES) return;
      if (stat.base + stat.adjust <= 3) return;
      stat.adjust -= 1;
    }
  }

  characterState.saved = false;
  renderCharacterSheet();
}

function renderCharacterSheet() {
  const grid = document.getElementById('character-grid');
  if (!grid) return;
  const derivedEl = document.getElementById('character-derived');
  const referenceEl = document.getElementById('character-reference');
  const calculationsEl = document.getElementById('character-calculations');

  const nameInput = document.getElementById('character-name');
  const hasName = !!(nameInput && nameInput.value.trim());
  const movedOut = characterMovedOut();
  const reserve = characterReserve();
  const canSave = characterState.generated && hasName && reserve === 0 && !characterState.saved;

  renderCharacterAgeHint();
  document.getElementById('char-generate-btn').disabled = characterState.generated;
  document.getElementById('char-reroll-btn').disabled = !characterState.generated || characterState.rerollsUsed >= MAX_CHARACTER_REROLLS;
  document.getElementById('char-save-btn').disabled = !canSave;
  document.getElementById('char-new-btn').disabled = !characterState.saved;
  document.getElementById('char-rerolls').textContent = `Relances restantes: ${MAX_CHARACTER_REROLLS - characterState.rerollsUsed}`;
  document.getElementById('char-moved').textContent = `Points déplacés: ${movedOut}/${MAX_CHARACTER_MOVES}`;
  document.getElementById('char-reserve').textContent = `Réserve: ${reserve}`;
  document.getElementById('char-reserve').classList.toggle('char-warn', reserve > 0);
  renderCharacterReference(referenceEl);
  renderCharacterCalculations(calculationsEl);

  const empty = document.getElementById('char-empty');
  empty.style.display = characterState.generated ? 'none' : '';
  grid.style.display = characterState.generated ? 'grid' : 'none';

  if (!characterState.generated) {
    grid.innerHTML = '';
    if (derivedEl) {
      derivedEl.innerHTML = '';
      derivedEl.style.display = 'none';
    }
    return;
  }

  grid.innerHTML = CHARACTER_STATS.map(def => {
    const stat = characterState.stats[def.key];
    const finalVal = characterFinal(def);
    const formula = stat.formula || formulaForStat(def);
    const detail = `${stat.rolls.join(' + ')}${formatCalculationPart(formula.mod)}`;
    const racialDetail = stat.racial
      ? ` · Race ${formatSignedFormula(stat.racial)} (${stat.racial.rolls.join(' + ')}) = ${formatSignedValue(stat.racial.adjust)}`
      : '';
    const clampDetail = stat.rawBase !== stat.base ? ` · borné ${stat.base}` : '';
    const statDetail = stat.imported
      ? `Importé · valeur ${finalVal}`
      : `Base ${stat.rolledBase ?? stat.base} · ${formatFormula(formula)} (${detail})${racialDetail}${clampDetail}`;
    const adjustClass = stat.adjust > 0 ? 'pos' : stat.adjust < 0 ? 'neg' : '';
    const addDisabled = (reserve <= 0 || finalVal >= 21) ? 'disabled' : '';
    const removeDisabled = ((movedOut >= MAX_CHARACTER_MOVES && stat.adjust <= 0) || finalVal <= 3) ? 'disabled' : '';
    const testLine = def.test
      ? `<div class="stat-test-line">${def.test}: ${finalVal * 5}%</div>`
      : '<div class="stat-test-line muted">Pas de jet de caractéristique</div>';

    return `<div class="stat-card">
      <div class="stat-head">
        <span class="stat-code">${def.code}</span>
        <span class="stat-name">${def.label}</span>
      </div>
      <div class="stat-score">${finalVal}</div>
      ${testLine}
      <div class="stat-detail">${statDetail}</div>
      <div class="stat-controls">
        <button class="char-step" type="button" onclick="shiftCharacterPoint('${def.key}', -1)" ${removeDisabled}>−</button>
        <span class="stat-adjust ${adjustClass}">${formatAdjust(stat.adjust)}</span>
        <button class="char-step" type="button" onclick="shiftCharacterPoint('${def.key}', 1)" ${addDisabled}>+</button>
      </div>
    </div>`;
  }).join('');

  if (derivedEl) {
    derivedEl.style.display = '';
    derivedEl.innerHTML = `<div class="slabel">Caractéristiques dérivées</div>
      <div class="derived-grid">
        ${characterDerived().map(item => `<div class="derived-card">
          <div class="derived-code">${item.code}</div>
          <div class="derived-value">${item.value}</div>
          <div class="derived-label">${item.label}</div>
          <div class="derived-detail">${item.detail}</div>
        </div>`).join('')}
      </div>`;
  }
}

function renderCharacterCalculations(calculationsEl) {
  if (!calculationsEl) return;

  const species = currentSpecies();
  const profession = currentProfession();
  const age = currentCharacterAge();
  const ageBand = ageBandForSpecies(age, species);
  if (!characterState.generated) {
    calculationsEl.value = [
      `Espèce sélectionnée : ${species.name}`,
      `Modificateurs : ${species.modifierText}`,
      `MOV : ${species.mov}`,
      age !== null ? `Âge : ${age} ans (${species.name} : ${ageBand})` : 'Âge : non défini',
      profession ? `Profession : ${profession.name} · Richesse : ${profession.richesse}` : 'Profession : non sélectionnée',
      '',
      'Générez une série pour afficher le détail des jets et des caractéristiques dérivées.'
    ].join('\n');
    return;
  }

  const scores = characterScores();
  const hitPoints = Math.ceil((scores.constitution + scores.taille) / 2);
  const majorWound = Math.ceil(hitPoints / 2);
  const personalPoints = scores.intelligence * 10;
  const lines = [
    `Espèce : ${species.name} (${species.modifierText})`,
    `Profession : ${profession ? profession.name : 'non sélectionnée'}`,
    `Richesse : ${profession ? profession.richesse : (document.querySelector('[data-character-field="richesse"]')?.value || 'non définie')}`,
    age !== null ? `Âge : ${age} ans (${species.name} : ${ageBand})` : 'Âge : non défini',
    '',
    'Caractéristiques'
  ];

  CHARACTER_STATS.forEach(def => {
    const stat = characterState.stats[def.key];
    const formula = stat.formula || formulaForStat(def);
    const testText = def.test ? `, ${def.test} ${characterFinal(def)}×5 = ${characterFinal(def) * 5}%` : '';
    if (stat.imported) {
      const adjustText = stat.adjust ? `, ajustement ${formatAdjust(stat.adjust)} => ${characterFinal(def)}` : '';
      lines.push(`${def.code} ${def.label} : valeur importée ${stat.base}${adjustText}${testText}`);
      return;
    }
    const rollExpr = `${stat.rolls.join(' + ')}${formatCalculationPart(formula.mod)}`;
    const adjustText = stat.adjust ? `, ajustement ${formatAdjust(stat.adjust)} => ${characterFinal(def)}` : '';
    const racialText = stat.racial
      ? ` ; mod. ${species.name} ${formatSignedFormula(stat.racial)} = ${formatSignedValue(stat.racial.adjust)}`
      : '';
    const clampText = stat.rawBase !== stat.base ? ` ; borné ${stat.base}` : '';
    lines.push(`${def.code} ${def.label} : ${formatFormula(formula)} = ${rollExpr} = ${stat.rolledBase ?? stat.base}${racialText} ; départ ${stat.rawBase ?? stat.base}${clampText}${adjustText}${testText}`);
  });

  lines.push(
    '',
    'Caractéristiques dérivées',
    `BD : FOR ${scores.force} + TAI ${scores.taille} = ${scores.force + scores.taille} => ${damageBonus(scores.force + scores.taille)}`,
    `PV : plafond((CON ${scores.constitution} + TAI ${scores.taille}) / 2) = ${hitPoints}`,
    `Blessure majeure : plafond(PV ${hitPoints} / 2) = ${majorWound}`,
    `PP : POU ${scores.pouvoir}`,
    `Bonus expérience : plafond(INT ${scores.intelligence} / 2) = +${Math.ceil(scores.intelligence / 2)}`,
    `MOV : ${species.mov} (${species.name})`,
    `Fatigue optionnelle : FOR ${scores.force} + CON ${scores.constitution} = ${scores.force + scores.constitution}`,
    `Santé mentale optionnelle : POU ${scores.pouvoir} × 5 = ${scores.pouvoir * 5}`,
    '',
    'Compétences',
    'Points professionnels : 325 (niveau Héroïque du livret)',
    `Points personnels : INT ${scores.intelligence} × 10 = ${personalPoints}`
  );

  if (species.culturalSkills) lines.push(`Compétences culturelles : ${species.culturalSkills}`);
  if (profession) lines.push(`Compétences de profession : ${profession.skills}`);
  if (profession?.special) lines.push(`Spécial profession : ${profession.special}`);
  if (species.special) lines.push(`Spécial espèce : ${species.special}`);

  calculationsEl.value = lines.join('\n');
}

function renderCharacterReference(referenceEl) {
  if (!referenceEl) return;
  const species = currentSpecies();
  const profession = currentProfession();
  const scores = characterState.generated ? characterScores() : null;
  const personalPoints = scores ? scores.intelligence * 10 : null;
  const age = currentCharacterAge();
  const ageBand = ageBandForSpecies(age, species);

  referenceEl.innerHTML = `<div class="slabel">Références du livret</div>
    <div class="reference-grid">
      <div class="reference-card">
        <div class="reference-title">${species.name}</div>
        <div class="reference-line"><b>Mod.</b> ${species.modifierText}</div>
        <div class="reference-line"><b>MOV</b> ${species.mov}</div>
        ${age !== null ? `<div class="reference-line"><b>Âge</b> ${age} ans : ${ageBand}</div>` : ''}
        ${species.culturalSkills ? `<div class="reference-line"><b>Culture</b> ${species.culturalSkills}</div>` : ''}
        <div class="reference-line"><b>Prof.</b> ${species.suggestedProfessions}</div>
        ${species.special ? `<div class="reference-note">${species.special}</div>` : ''}
      </div>
      <div class="reference-card">
        <div class="reference-title">${profession ? profession.name : 'Profession'}</div>
        ${profession ? `<div class="reference-line"><b>Richesse</b> ${profession.richesse}</div>
          <div class="reference-line"><b>Compétences</b> ${profession.skills}</div>
          ${profession.special ? `<div class="reference-note">${profession.special}</div>` : ''}` : '<div class="reference-line muted">Aucune profession sélectionnée.</div>'}
        <div class="reference-line"><b>Points prof.</b> 325 · <b>Perso</b> ${personalPoints ?? 'INT × 10'}</div>
      </div>
    </div>`;
}

async function submitCharacterSheet() {
  if (!characterState.generated) return;
  const name = document.getElementById('character-name').value.trim();
  if (!name) { showToast('Entre le nom du personnage', 'error'); return; }
  if (characterReserve() !== 0) { showToast('Replace les points retirés avant d’enregistrer', 'error'); return; }

  const stats = {};
  CHARACTER_STATS.forEach(def => {
    stats[def.key] = characterFinal(def);
  });

  const saved = await saveCharacterSheet(name, getCharacterDetails(), stats);
  if (saved) {
    characterState.saved = true;
    renderCharacterSheet();
  }
}

function formatPercentile(value) {
  return value === 100 ? '00' : String(value).padStart(2, '0');
}

function brpDifficulty(value) {
  return BRP_DIFFICULTIES.find(item => item.value === value) || BRP_DIFFICULTIES.find(item => item.value === 'normal');
}

function clampPercentScore(value) {
  return Math.max(1, Math.min(300, value));
}

function brpThresholdFor(score, difficulty) {
  if (difficulty.mode === 'auto-success') return score;
  if (difficulty.mode === 'auto-failure') return 0;
  if (difficulty.divisor) return Math.ceil(score / difficulty.divisor);
  return Math.ceil(score * (difficulty.multiplier || 1));
}

function fumbleMinFor(threshold) {
  if (threshold <= 20) return 96;
  if (threshold <= 40) return 97;
  if (threshold <= 60) return 98;
  if (threshold <= 80) return 99;
  return 100;
}

function evaluatePercentile(threshold, rollValue) {
  const criticalLimit = Math.max(1, Math.ceil(threshold / 20));
  const specialLimit = Math.max(1, Math.ceil(threshold / 5));
  const fumbleMin = fumbleMinFor(threshold);
  const rollLabel = formatPercentile(rollValue);

  if (rollValue >= fumbleMin) {
    return { success: false, level: 'fumble', label: 'Maladresse', criticalLimit, specialLimit, fumbleMin, rollLabel };
  }
  if (rollValue >= 96 || rollValue > threshold) {
    return { success: false, level: 'failure', label: 'Échec', criticalLimit, specialLimit, fumbleMin, rollLabel };
  }
  if (rollValue <= criticalLimit) {
    return { success: true, level: 'critical', label: 'Réussite critique', criticalLimit, specialLimit, fumbleMin, rollLabel };
  }
  if (rollValue <= specialLimit) {
    return { success: true, level: 'special', label: 'Réussite spéciale', criticalLimit, specialLimit, fumbleMin, rollLabel };
  }
  return { success: true, level: 'success', label: 'Réussite', criticalLimit, specialLimit, fumbleMin, rollLabel };
}

function automaticPercentileResult(test) {
  if (test.difficulty?.mode === 'auto-success') {
    return {
      ...test,
      success: true,
      level: 'success',
      label: 'Réussite automatique',
      rollLabel: 'AUTO',
      criticalLimit: Math.max(1, Math.ceil(test.threshold / 20)),
      specialLimit: Math.max(1, Math.ceil(test.threshold / 5)),
      fumbleMin: fumbleMinFor(test.threshold),
      automatic: true
    };
  }
  return {
    ...test,
    success: false,
    level: 'failure',
    label: 'Échec automatique',
    rollLabel: 'AUTO',
    criticalLimit: 0,
    specialLimit: 0,
    fumbleMin: 100,
    automatic: true
  };
}

function createPercentileTest({ kind, typeLabel, name, code, score, threshold, difficulty }) {
  return {
    kind,
    typeLabel,
    name,
    code,
    score,
    threshold,
    difficulty,
    difficultyLabel: difficulty?.shortLabel || 'Moyen',
    success: false,
    automatic: !!difficulty?.mode
  };
}

function brpTestSummary(test) {
  if (test.kind === 'character') {
    return `${test.name} ${test.code} ${test.score} × 5 = ${test.threshold}% · jet ${test.rollLabel}`;
  }

  const base = `Test BRP ${test.score}% · ${test.difficulty?.label || test.difficultyLabel}`;
  if (test.automatic) return `${base} => ${test.label}`;
  return `${base} => ${test.threshold}% · jet ${test.rollLabel}`;
}

function brpTestExpression(test) {
  if (test.kind === 'character') return `${test.name} ${test.code} ${test.score}×5 (${test.threshold}%)`;
  if (test.automatic) return `Test BRP ${test.score}% · ${test.difficulty?.label || test.difficultyLabel}`;
  return `Test BRP ${test.score}% · ${test.difficulty?.label || test.difficultyLabel} (${test.threshold}%)`;
}

function sendPercentileTest(test, totalValue) {
  const isStrongSuccess = test.level === 'critical' || test.level === 'special';
  sendRoll(brpTestExpression(test), `[${test.rollLabel}] ${test.label}`, totalValue, isStrongSuccess, !test.success, cfg.hide);
}

// ——— render result ———
function renderResult() {
  const el = document.getElementById('result-area');
  if (!results) { el.innerHTML = ''; return; }
  const { groups, total, mod, characterTest } = results;
  if (total === null) { el.innerHTML = ''; return; }

  let html = '';

  if (total !== null) {
    const hasCrit = groups.length === 1 && groups[0].type === 20 && groups[0].rolls.some(r => r.val === 20);
    const hasFail = groups.length === 1 && groups[0].type === 20 && groups[0].rolls.some(r => r.val === 1);
    const multiDice = groups.reduce((s, g) => s + g.rolls.length, 0) > 1 || mod !== 0;

    let brkd = '';
    if (characterTest) {
      const fumbleText = characterTest.fumbleMin === 100 ? '00' : `${formatPercentile(characterTest.fumbleMin)}–00`;
      const thresholdLine = characterTest.automatic
        ? ''
        : `<div class="total-brkd test-thresholds">Critique ≤ ${formatPercentile(characterTest.criticalLimit)} · Spéciale ≤ ${formatPercentile(characterTest.specialLimit)} · Maladresse ${fumbleText}</div>`;
      brkd = `<div class="total-brkd">${brpTestSummary(characterTest)}</div>${thresholdLine}`;
    } else if (multiDice) {
      const parts = groups.map(g => g.rolls.map(r => r.val).join(' + ')).join(' + ');
      const modStr = mod !== 0 ? (mod >= 0 ? ` <span class="total-mod">+ ${mod}</span>` : ` <span class="total-mod">− ${Math.abs(mod)}</span>`) : '';
      brkd = `<div class="total-brkd">${parts}${modStr} = ${total}</div>`;
    }
    const critMsg = characterTest
      ? `<div class="test-msg ${characterTest.level}">${characterTest.label}</div>`
      : hasCrit ? '<div class="crit-msg crit">⭐ Coup Critique !</div>' : hasFail ? '<div class="crit-msg fail">💀 Échec Critique !</div>' : '';

    html += `<div class="total-box">
      <div class="total-lbl">${characterTest ? (characterTest.automatic ? 'Test BRP' : 'Résultat D100') : 'Résultat Total'}</div>
      <div class="total-num${hasCrit ? ' crit-style' : ''}">${characterTest ? characterTest.rollLabel : total}</div>
      ${brkd}${critMsg}
    </div>`;
  }

  el.innerHTML = html;
}

// ——— quick roll ———
function quickRoll(type) {
  if (rolling) return;
  DTYPES.forEach(t => expr[t] = 0);
  expr[type] = 1;
  document.getElementById('mod-input').value = 0;
  renderGrid(); renderExBar(); rollAll();
}
function quickMulti(list, mod = 0) {
  if (rolling) return;
  DTYPES.forEach(t => expr[t] = 0);
  list.forEach(({ t, n }) => expr[t] = n);
  document.getElementById('mod-input').value = mod;
  renderGrid(); renderExBar(); rollAll();
}

function quickCharacteristicTest(key) {
  if (rolling) return;
  const def = CHARACTER_STATS.find(stat => stat.key === key);
  const character = getPlayerCharacter();
  const score = Number(character && character[key]);
  if (!def || !def.test || !Number.isFinite(score)) {
    showToast('Aucune fiche liée pour ce test', 'error');
    return;
  }

  const threshold = score * 5;
  const test = createPercentileTest({
    kind: 'character',
    typeLabel: 'Caractéristique',
    key,
    code: def.code,
    name: def.test,
    score,
    threshold,
    difficulty: brpDifficulty('normal')
  });
  startPercentileRoll(test);
}

function rollBrpPercentileTest() {
  if (rolling) return;

  const scoreInput = document.getElementById('brp-test-score');
  const difficulty = brpDifficulty(document.getElementById('brp-test-difficulty')?.value);
  const score = clampPercentScore(parseInt(scoreInput?.value, 10) || 0);

  if (!scoreInput || !Number.isFinite(parseInt(scoreInput.value, 10)) || parseInt(scoreInput.value, 10) <= 0) {
    showToast('Entre un score de 1 à 300%', 'error');
    return;
  }

  if (scoreInput) scoreInput.value = score;
  const threshold = brpThresholdFor(score, difficulty);
  const test = createPercentileTest({
    kind: 'brp',
    typeLabel: 'Test BRP',
    name: 'Test BRP',
    score,
    threshold,
    difficulty
  });

  if (test.automatic) {
    const resolved = automaticPercentileResult(test);
    results = { groups: [], total: resolved.success ? 0 : 100, rawTotal: null, mod: 0, characterTest: resolved };
    renderResult();
    sendPercentileTest(resolved, resolved.success ? 0 : 100);
    return;
  }

  startPercentileRoll(test);
}

function startPercentileRoll(test) {
  const groups = [{
    type: 100,
    rolls: [{ val: null, state: 'rolling' }]
  }];

  setRollingUi(true);
  results = { groups, total: null, rawTotal: null, mod: 0, characterTest: test };
  sndRoll();

  const dur = cfg.anim ? 1800 : 0;
  if (cfg.anim) {
    groups[0].rolls[0].val = rnd(1, 100);
    groups[0].rolls[0].finalVal = rnd(1, 100);
    document.getElementById('result-area').style.visibility = 'hidden';
    renderResult();
    D3D.roll(groups, dur, () => finalizePercentileTest(groups, test));
  } else {
    finalizePercentileTest(groups, test);
  }
}

function finalizePercentileTest(groups, test) {
  const roll = groups[0].rolls[0];
  roll.val = roll.finalVal !== undefined ? roll.finalVal : rnd(1, 100);
  Object.assign(test, evaluatePercentile(test.threshold, roll.val));
  roll.state = test.success ? 's-high' : 's-low';

  results = { groups, total: roll.val, rawTotal: roll.val, mod: 0, characterTest: test };
  finishRollingUi();
  renderResult();

  sendPercentileTest(test, roll.val);
}

// ——— expose handlers used by inline onclick attributes ———
window.chg = chg;
window.clearExpr = clearExpr;
window.toggleSetting = toggleSetting;
window.switchTab = switchTab;
window.rollAll = rollAll;
window.renderExBar = renderExBar;
window.quickRoll = quickRoll;
window.quickMulti = quickMulti;
window.quickCharacteristicTest = quickCharacteristicTest;
window.rollBrpPercentileTest = rollBrpPercentileTest;
window.generateCharacterStats = generateCharacterStats;
window.rerollCharacterStats = rerollCharacterStats;
window.resetCharacterSheet = resetCharacterSheet;
window.characterNameChanged = characterNameChanged;
window.characterProfileChanged = characterProfileChanged;
window.renderCharacterSheet = renderCharacterSheet;
window.shiftCharacterPoint = shiftCharacterPoint;
window.submitCharacterSheet = submitCharacterSheet;
window.exportCharacterSheet = exportCharacterSheet;
window.importCharacterSheet = importCharacterSheet;
window.joinRoom = joinRoom;
window.createRoom = createRoom;
window.purgeRoom = purgeRoom;
window.leaveRoom = leaveRoom;
window.randomFantasyName = randomFantasyName;

// ——— init ———
initCharacterOptions();
renderGrid();
renderExBar();
renderCharacterSheet();
initPlaceholder();
restoreSession();
