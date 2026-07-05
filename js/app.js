// ——— Main application: dice state, rolling logic, rendering ———
import { makeSVG } from './dice-shapes.js';
import * as D3D from './dice3d.js';
import { sendRoll, joinRoom, createRoom, purgeRoom, leaveRoom, randomFantasyName, initPlaceholder, restoreSession, saveCharacterSheet, getPlayerCharacter } from './supabase-room.js?v=20260705-character-tests';
import { showToast } from './toast.js?v=20260705-character-tests';

// ——— config ———
const DTYPES = [4, 6, 8, 10, 12, 20, 100];
const MAX_CHARACTER_MOVES = 3;
const MAX_CHARACTER_REROLLS = 2;
const CHARACTER_STATS = [
  { key: 'force', code: 'FOR', label: 'Force', count: 3, type: 6, mod: 0 },
  { key: 'constitution', code: 'CON', label: 'Constitution', count: 3, type: 6, mod: 0 },
  { key: 'taille', code: 'TAI', label: 'Taille', count: 2, type: 6, mod: 6 },
  { key: 'intelligence', code: 'INT', label: 'Intelligence', count: 2, type: 6, mod: 6 },
  { key: 'pouvoir', code: 'POU', label: 'Pouvoir', count: 3, type: 6, mod: 0 },
  { key: 'dexterite', code: 'DEX', label: 'Dextérité', count: 3, type: 6, mod: 0 },
  { key: 'apparence', code: 'APP', label: 'Apparence', count: 3, type: 6, mod: 0 }
];

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
  document.querySelectorAll('.qbtn').forEach(b => b.disabled = disabled);
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

function buildCharacterStats() {
  const stats = {};
  CHARACTER_STATS.forEach(def => {
    const result = rollMany(def.count, def.type);
    stats[def.key] = {
      base: result.total + def.mod,
      adjust: 0,
      rolls: result.rolls
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

function shiftCharacterPoint(key, delta) {
  if (!characterState.generated) return;
  const stat = characterState.stats[key];
  if (!stat) return;

  if (delta > 0) {
    if (characterReserve() <= 0) return;
    stat.adjust += 1;
  } else {
    if (stat.adjust > 0) {
      stat.adjust -= 1;
    } else {
      if (characterMovedOut() >= MAX_CHARACTER_MOVES) return;
      if (stat.base + stat.adjust <= 1) return;
      stat.adjust -= 1;
    }
  }

  characterState.saved = false;
  renderCharacterSheet();
}

function renderCharacterSheet() {
  const grid = document.getElementById('character-grid');
  if (!grid) return;

  const nameInput = document.getElementById('character-name');
  const hasName = !!(nameInput && nameInput.value.trim());
  const movedOut = characterMovedOut();
  const reserve = characterReserve();
  const canSave = characterState.generated && hasName && reserve === 0 && !characterState.saved;

  document.getElementById('char-generate-btn').disabled = characterState.generated;
  document.getElementById('char-reroll-btn').disabled = !characterState.generated || characterState.rerollsUsed >= MAX_CHARACTER_REROLLS;
  document.getElementById('char-save-btn').disabled = !canSave;
  document.getElementById('char-new-btn').disabled = !characterState.saved;
  document.getElementById('char-rerolls').textContent = `Relances restantes: ${MAX_CHARACTER_REROLLS - characterState.rerollsUsed}`;
  document.getElementById('char-moved').textContent = `Points déplacés: ${movedOut}/${MAX_CHARACTER_MOVES}`;
  document.getElementById('char-reserve').textContent = `Réserve: ${reserve}`;
  document.getElementById('char-reserve').classList.toggle('char-warn', reserve > 0);

  const empty = document.getElementById('char-empty');
  empty.style.display = characterState.generated ? 'none' : '';
  grid.style.display = characterState.generated ? 'grid' : 'none';

  if (!characterState.generated) {
    grid.innerHTML = '';
    return;
  }

  grid.innerHTML = CHARACTER_STATS.map(def => {
    const stat = characterState.stats[def.key];
    const finalVal = characterFinal(def);
    const detail = `${stat.rolls.join(' + ')}${def.mod ? ` + ${def.mod}` : ''}`;
    const adjustClass = stat.adjust > 0 ? 'pos' : stat.adjust < 0 ? 'neg' : '';
    const addDisabled = reserve <= 0 ? 'disabled' : '';
    const removeDisabled = ((movedOut >= MAX_CHARACTER_MOVES && stat.adjust <= 0) || finalVal <= 1) ? 'disabled' : '';

    return `<div class="stat-card">
      <div class="stat-head">
        <span class="stat-code">${def.code}</span>
        <span class="stat-name">${def.label}</span>
      </div>
      <div class="stat-score">${finalVal}</div>
      <div class="stat-detail">Base ${stat.base} · ${def.count}D${def.type}${def.mod ? ` + ${def.mod}` : ''} (${detail})</div>
      <div class="stat-controls">
        <button class="char-step" type="button" onclick="shiftCharacterPoint('${def.key}', -1)" ${removeDisabled}>−</button>
        <span class="stat-adjust ${adjustClass}">${formatAdjust(stat.adjust)}</span>
        <button class="char-step" type="button" onclick="shiftCharacterPoint('${def.key}', 1)" ${addDisabled}>+</button>
      </div>
    </div>`;
  }).join('');
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

  const saved = await saveCharacterSheet(name, stats);
  if (saved) {
    characterState.saved = true;
    renderCharacterSheet();
  }
}

// ——— render result ———
function renderResult() {
  const el = document.getElementById('result-area');
  if (!results) { el.innerHTML = ''; return; }
  const { groups, total, rawTotal, mod, characterTest } = results;

  let html = '<div class="dice-display">';
  groups.forEach((g, gi) => {
    if (gi > 0) html += '<span class="gplus">+</span>';
    html += '<div class="dgroup">';
    g.rolls.forEach((r, ri) => {
      const cls = cfg.anim ? r.state : '';
      const vc = characterTest && r.val !== null ? (characterTest.success ? 'crit' : 'fail') : (r.state === 's-crit' ? 'crit' : r.state === 's-fail' ? 'fail' : 'norm');
      html += `<div class="die-item">
        <div class="dsvg-wrap ${cls}" style="--d:${(ri * 0.08).toFixed(2)}s">
          ${makeSVG(g.type, r.val, r.state)}
        </div>
        <div class="dval ${vc}">${r.val !== null ? r.val : ''}</div>
      </div>`;
    });
    html += '</div>';
  });
  html += '</div>';

  if (total !== null) {
    const hasCrit = groups.length === 1 && groups[0].type === 20 && groups[0].rolls.some(r => r.val === 20);
    const hasFail = groups.length === 1 && groups[0].type === 20 && groups[0].rolls.some(r => r.val === 1);
    const multiDice = groups.reduce((s, g) => s + g.rolls.length, 0) > 1 || mod !== 0;

    let brkd = '';
    if (characterTest) {
      const sign = characterTest.success ? '<=' : '>';
      brkd = `<div class="total-brkd">${characterTest.code} ${characterTest.score} × 5 = ${characterTest.threshold}% · jet ${total} ${sign} ${characterTest.threshold}</div>`;
    } else if (multiDice) {
      const parts = groups.map(g => g.rolls.map(r => r.val).join(' + ')).join(' + ');
      const modStr = mod !== 0 ? (mod >= 0 ? ` <span class="total-mod">+ ${mod}</span>` : ` <span class="total-mod">− ${Math.abs(mod)}</span>`) : '';
      brkd = `<div class="total-brkd">${parts}${modStr} = ${total}</div>`;
    }
    const critMsg = characterTest
      ? `<div class="test-msg ${characterTest.success ? 'success' : 'failure'}">${characterTest.success ? 'Réussite' : 'Échec'} </div>`
      : hasCrit ? '<div class="crit-msg crit">⭐ Coup Critique !</div>' : hasFail ? '<div class="crit-msg fail">💀 Échec Critique !</div>' : '';

    html += `<div class="total-box">
      <div class="total-lbl">${characterTest ? 'Résultat D100' : 'Résultat Total'}</div>
      <div class="total-num${hasCrit ? ' crit-style' : ''}">${total}</div>
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
  if (!def || !Number.isFinite(score)) {
    showToast('Aucune fiche liée pour ce test', 'error');
    return;
  }

  const threshold = score * 5;
  const groups = [{
    type: 100,
    rolls: [{ val: null, state: 'rolling' }]
  }];
  const test = {
    key,
    code: def.code,
    label: def.label,
    score,
    threshold,
    success: false
  };

  setRollingUi(true);
  results = { groups, total: null, rawTotal: null, mod: 0, characterTest: test };
  sndRoll();

  const dur = cfg.anim ? 1800 : 0;
  if (cfg.anim) {
    groups[0].rolls[0].val = rnd(1, 100);
    groups[0].rolls[0].finalVal = rnd(1, 100);
    document.getElementById('result-area').style.visibility = 'hidden';
    renderResult();
    D3D.roll(groups, dur, () => finalizeCharacteristicTest(groups, test));
  } else {
    finalizeCharacteristicTest(groups, test);
  }
}

function finalizeCharacteristicTest(groups, test) {
  const roll = groups[0].rolls[0];
  roll.val = roll.finalVal !== undefined ? roll.finalVal : rnd(1, 100);
  test.success = roll.val <= test.threshold;
  roll.state = test.success ? 's-high' : 's-low';

  results = { groups, total: roll.val, rawTotal: roll.val, mod: 0, characterTest: test };
  finishRollingUi();
  renderResult();

  const exprStr = `Test ${test.code} ${test.score}×5 (${test.threshold}%)`;
  const rollsStr = `[${roll.val}] ${test.success ? '<=' : '>'} ${test.threshold} — ${test.success ? 'Réussite' : 'Échec'}`;
  sendRoll(exprStr, rollsStr, roll.val, test.success, !test.success, cfg.hide);
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
window.generateCharacterStats = generateCharacterStats;
window.rerollCharacterStats = rerollCharacterStats;
window.resetCharacterSheet = resetCharacterSheet;
window.characterNameChanged = characterNameChanged;
window.renderCharacterSheet = renderCharacterSheet;
window.shiftCharacterPoint = shiftCharacterPoint;
window.submitCharacterSheet = submitCharacterSheet;
window.joinRoom = joinRoom;
window.createRoom = createRoom;
window.purgeRoom = purgeRoom;
window.leaveRoom = leaveRoom;
window.randomFantasyName = randomFantasyName;

// ——— init ———
renderGrid();
renderExBar();
renderCharacterSheet();
initPlaceholder();
restoreSession();
