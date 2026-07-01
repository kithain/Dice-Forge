// ——— Supabase multiplayer room logic ———
import { createClient } from '@supabase/supabase-js';
import { showToast, showConfirm } from './toast.js';

// ▼▼▼ Config chargée depuis supabase-config.js (gitignored) ▼▼▼
const SUPABASE_URL = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url) || 'https://VOTRE_PROJET.supabase.co';
const SUPABASE_ANON_KEY = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.anonKey) || 'VOTRE_CLE_ANON';
// ▲▲▲ ▲▲▲

let sb = null;
let roomState = { code: null, player: null, connected: false };
let liveSub = null;

const FANTASY_NAMES = [
  'Thalindra', 'Kaelen', 'Brynhild', 'Draven', 'Isolde', 'Grimjaw', 'Nyx', 'Orin',
  'Faelar', 'Morrigan', 'Zephyrion', 'Sylvara', 'Thoradin', 'Elowen', 'Ragnor', 'Vesper',
  'Aldric', 'Cyneth', 'Lyraelle', 'Balthor', 'Ythera', 'Corvyn', 'Maelis', 'Drusk',
  'Sariel', 'Wrenna', 'Malachar', 'Ondine', 'Fenwick', 'Astrid', 'Torvik', 'Rowanna',
  'Erevan', 'Sindri', 'Marwenna', 'Kethric', 'Ilyara', 'Bramwell', 'Nerissa', 'Skarn'
];

export function randomFantasyName() {
  return FANTASY_NAMES[Math.floor(Math.random() * FANTASY_NAMES.length)];
}

export function initPlaceholder() {
  const el = document.getElementById('player-name');
  if (el && !el.value) el.placeholder = randomFantasyName();
}

function sbInit() {
  if (sb) return;
  if (SUPABASE_URL.includes('VOTRE_PROJET')) {
    console.warn('Supabase: configure SUPABASE_URL et SUPABASE_ANON_KEY');
    return;
  }
  sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 4; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

export async function joinRoom() {
  const name = document.getElementById('player-name').value.trim();
  const code = document.getElementById('room-code').value.trim().toUpperCase();
  if (!name) { showToast('Entre ton nom de joueur', 'error'); return; }
  if (!code) { showToast('Entre le code de la partie', 'error'); return; }
  sbInit();
  if (!sb) { showToast('Supabase non configuré. Voir instructions.', 'error'); return; }

  const { data, error } = await sb.from('rolls')
    .select('id')
    .eq('room_code', code)
    .limit(1);
  if (error) { showToast('Erreur: ' + error.message, 'error'); return; }
  if (!data.length) { showToast('Aucune partie trouvée avec ce code', 'error'); return; }

  roomState = { code, player: name, connected: true };
  localStorage.setItem('diceforge_room', JSON.stringify(roomState));
  showConnected();
  await checkCreator(code, name);
  subscribeLive(code, name);
  await loadRecent(code, name);
}

export async function createRoom() {
  const name = document.getElementById('player-name').value.trim();
  if (!name) { showToast('Entre ton nom de joueur', 'error'); return; }
  sbInit();
  if (!sb) { showToast('Supabase non configuré. Voir instructions.', 'error'); return; }

  const code = genCode();
  const { error } = await sb.from('rolls').insert({
    room_code: code,
    player_name: name,
    expression: '— Partie créée —',
    rolls_detail: '',
    total: 0,
    is_crit: false,
    is_fail: false
  });
  if (error) { showToast('Erreur: ' + error.message, 'error'); return; }

  roomState = { code, player: name, connected: true, isCreator: true };
  localStorage.setItem('diceforge_room', JSON.stringify(roomState));
  document.getElementById('room-code').value = code;
  showConnected();
  document.getElementById('purge-btn').style.display = '';
  subscribeLive(code, name);
  await loadRecent(code, name);
}

export async function purgeRoom() {
  if (!roomState.connected || !sb) return;
  const confirmed = await showConfirm('Supprimer tous les jets de cette partie ?');
  if (!confirmed) return;
  const { error } = await sb.from('rolls')
    .delete()
    .eq('room_code', roomState.code);
  if (error) { showToast('Erreur: ' + error.message, 'error'); return; }
  document.getElementById('live-list').innerHTML = '';
  showToast('Salle purgée', 'success');
}

export function leaveRoom() {
  if (liveSub) { liveSub.unsubscribe(); liveSub = null; }
  roomState = { code: null, player: null, connected: false };
  localStorage.removeItem('diceforge_room');
  document.getElementById('room-join').style.display = '';
  document.getElementById('room-connected').style.display = 'none';
  document.getElementById('live-feed').style.display = 'none';
  document.getElementById('live-list').innerHTML = '';
}

function showConnected() {
  document.getElementById('room-join').style.display = 'none';
  document.getElementById('room-connected').style.display = '';
  document.getElementById('room-badge-text').textContent = 'Room: ' + roomState.code;
  document.getElementById('player-badge-text').textContent = 'Joueur: ' + roomState.player;
  document.getElementById('live-feed').style.display = '';
  if (!roomState.isCreator) document.getElementById('purge-btn').style.display = 'none';
}

async function checkCreator(code, name) {
  const { data } = await sb.from('rolls')
    .select('player_name')
    .eq('room_code', code)
    .eq('expression', '— Partie créée —')
    .limit(1);
  const isCreator = data && data.length && data[0].player_name === name;
  roomState.isCreator = !!isCreator;
  localStorage.setItem('diceforge_room', JSON.stringify(roomState));
  document.getElementById('purge-btn').style.display = isCreator ? '' : 'none';
}

function subscribeLive(code, selfName) {
  if (liveSub) liveSub.unsubscribe();
  liveSub = sb.channel('rolls:' + code)
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'rolls', filter: 'room_code=eq.' + code },
      (payload) => {
        const r = payload.new;
        if (r.expression === '— Partie créée —') return;
        addLiveItem(r, r.player_name === selfName);
      }
    )
    .subscribe();
}

async function loadRecent(code, selfName) {
  const { data } = await sb.from('rolls')
    .select('*')
    .eq('room_code', code)
    .neq('expression', '— Partie créée —')
    .order('created_at', { ascending: false })
    .limit(20);
  if (!data) return;
  const list = document.getElementById('live-list');
  list.innerHTML = '';
  data.forEach(r => addLiveItem(r, r.player_name === selfName, true));
}

function addLiveItem(r, isSelf, prepend) {
  const list = document.getElementById('live-list');
  if (!list.children.length) list.innerHTML = '';
  const cls = isSelf ? 'live-self' : '';
  const time = new Date(r.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const masked = r.is_hidden && !isSelf;

  const tCls = masked ? '' : (r.is_crit ? 'crit' : r.is_fail ? 'fail' : '');
  const hiddenTag = r.is_hidden ? ' <span title="Jet caché par le joueur">🔒</span>' : '';
  const rollsOut = masked ? '???' : esc(r.rolls_detail);
  const totOut = masked ? '?' : `${r.total}${r.is_crit ? ' ★' : r.is_fail ? ' ✗' : ''}`;

  const html = `<div class="live-item ${cls}">
    <span class="live-player">${esc(r.player_name)}${hiddenTag}</span>
    <span class="live-expr">${esc(r.expression)}</span>
    <span class="live-rolls">${rollsOut}</span>
    <span class="live-tot ${tCls}">${totOut}</span>
    <span class="live-time">${time}</span>
  </div>`;
  list.insertAdjacentHTML(prepend ? 'beforeend' : 'afterbegin', html);
  if (!prepend) list.parentElement.scrollTop = 0;
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

export async function sendRoll(expr, rollsDetail, total, isCrit, isFail, isHidden) {
  if (!roomState.connected || !sb) return;
  const { error } = await sb.from('rolls').insert({
    room_code: roomState.code,
    player_name: roomState.player,
    expression: expr,
    rolls_detail: rollsDetail,
    total: total,
    is_crit: isCrit,
    is_fail: isFail,
    is_hidden: !!isHidden
  });
  if (error) console.error('Erreur envoi du jet (vérifie la colonne is_hidden sur la table rolls):', error.message);
}

export function restoreSession() {
  const saved = localStorage.getItem('diceforge_room');
  if (saved) {
    try {
      const r = JSON.parse(saved);
      if (r.code && r.player) {
        roomState = { code: r.code, player: r.player, connected: true, isCreator: r.isCreator || false };
        document.getElementById('player-name').value = r.player;
        document.getElementById('room-code').value = r.code;
        sbInit();
        if (sb) {
          showConnected();
          checkCreator(r.code, r.player);
          subscribeLive(r.code, r.player);
          loadRecent(r.code, r.player);
        }
      }
    } catch (e) {}
  }
}
