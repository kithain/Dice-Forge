// ——— Main application: dice state, rolling logic, rendering ———
import { makeSVG } from './dice-shapes.js';
import * as D3D from './dice3d.js';
import { sendRoll, joinRoom, createRoom, purgeRoom, leaveRoom, randomFantasyName, initPlaceholder, restoreSession } from './supabase-room.js';

// ——— config ———
const DTYPES = [4, 6, 8, 10, 12, 20, 100];

// ——— state ———
let expr = {};   // {4:0,6:0,...}
DTYPES.forEach(t => expr[t] = 0);
let results = null;
let rolling = false;
let cfg = { anim: true, sound: true, hide: false };

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

// ——— render result ———
function renderResult() {
  const el = document.getElementById('result-area');
  if (!results) { el.innerHTML = ''; return; }
  const { groups, total, rawTotal, mod } = results;

  let html = '<div class="dice-display">';
  groups.forEach((g, gi) => {
    if (gi > 0) html += '<span class="gplus">+</span>';
    html += '<div class="dgroup">';
    g.rolls.forEach((r, ri) => {
      const cls = cfg.anim ? r.state : '';
      const vc = r.state === 's-crit' ? 'crit' : r.state === 's-fail' ? 'fail' : 'norm';
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
    if (multiDice) {
      const parts = groups.map(g => g.rolls.map(r => r.val).join(' + ')).join(' + ');
      const modStr = mod !== 0 ? (mod >= 0 ? ` <span class="total-mod">+ ${mod}</span>` : ` <span class="total-mod">− ${Math.abs(mod)}</span>`) : '';
      brkd = `<div class="total-brkd">${parts}${modStr} = ${total}</div>`;
    }
    const critMsg = hasCrit ? '<div class="crit-msg crit">⭐ Coup Critique !</div>' : hasFail ? '<div class="crit-msg fail">💀 Échec Critique !</div>' : '';

    html += `<div class="total-box">
      <div class="total-lbl">Résultat Total</div>
      <div class="total-num${hasCrit ? ' crit-style' : ''}">${total}</div>
      ${brkd}${critMsg}
      <div class="rand-badge">🔒 Généré via crypto.getRandomValues()</div>
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
function quickMulti(list) {
  if (rolling) return;
  DTYPES.forEach(t => expr[t] = 0);
  list.forEach(({ t, n }) => expr[t] = n);
  document.getElementById('mod-input').value = 0;
  renderGrid(); renderExBar(); rollAll();
}

// ——— expose handlers used by inline onclick attributes ———
window.chg = chg;
window.clearExpr = clearExpr;
window.toggleSetting = toggleSetting;
window.rollAll = rollAll;
window.renderExBar = renderExBar;
window.quickRoll = quickRoll;
window.quickMulti = quickMulti;
window.joinRoom = joinRoom;
window.createRoom = createRoom;
window.purgeRoom = purgeRoom;
window.leaveRoom = leaveRoom;
window.randomFantasyName = randomFantasyName;

// ——— init ———
renderGrid();
renderExBar();
initPlaceholder();
restoreSession();
