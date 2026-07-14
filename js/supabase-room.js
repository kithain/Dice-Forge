// ——— Supabase multiplayer room logic ———
import { createClient } from '@supabase/supabase-js';
import { showToast, showConfirm } from './toast.js';
import { speciesByName } from './brp-data.js?v=20260709-canon-age-bands';

// ▼▼▼ Config chargée depuis supabase-config.js (gitignored) ▼▼▼
const SUPABASE_URL = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url) || 'https://VOTRE_PROJET.supabase.co';
const SUPABASE_ANON_KEY = (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.anonKey) || 'VOTRE_CLE_ANON';
// ▲▲▲ ▲▲▲

let sb = null;
let roomState = { code: null, player: null, connected: false };
let liveSub = null;
let currentPlayerCharacter = null;

const FANTASY_NAMES = [
  'Thalindra', 'Kaelen', 'Brynhild', 'Draven', 'Isolde', 'Grimjaw', 'Nyx', 'Orin',
  'Faelar', 'Morrigan', 'Zephyrion', 'Sylvara', 'Thoradin', 'Elowen', 'Ragnor', 'Vesper',
  'Aldric', 'Cyneth', 'Lyraelle', 'Balthor', 'Ythera', 'Corvyn', 'Maelis', 'Drusk',
  'Sariel', 'Wrenna', 'Malachar', 'Ondine', 'Fenwick', 'Astrid', 'Torvik', 'Rowanna',
  'Erevan', 'Sindri', 'Marwenna', 'Kethric', 'Ilyara', 'Bramwell', 'Nerissa', 'Skarn'
];
const CHARACTER_FIELDS = [
  ['FOR', 'force'],
  ['CON', 'constitution'],
  ['TAI', 'taille'],
  ['INT', 'intelligence'],
  ['POU', 'pouvoir'],
  ['DEX', 'dexterite'],
  ['CHA', 'charisme']
];
const CHARACTER_COLUMNS = [
  'player_name',
  'nom',
  'espece',
  'genre',
  'age',
  'profession',
  'richesse',
  'traits',
  'notes',
  'force',
  'constitution',
  'taille',
  'intelligence',
  'pouvoir',
  'dexterite',
  'charisme',
  'created_at'
].join(', ');

export function randomFantasyName() {
  return FANTASY_NAMES[Math.floor(Math.random() * FANTASY_NAMES.length)];
}

export function initPlaceholder() {
  const el = document.getElementById('player-name');
  if (el && !el.value) el.placeholder = randomFantasyName();
}

export function getPlayerCharacter() {
  return currentPlayerCharacter;
}

export function isRoomConnected() {
  return !!roomState.connected;
}

export function isRoomCreator() {
  return !!roomState.isCreator;
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
  await loadPlayerCharacter(name);
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
  await loadPlayerCharacter(name);
  subscribeLive(code, name);
  await loadRecent(code, name);
}

export async function purgeRoom() {
  if (!roomState.connected || !sb) return;
  const confirmed = await showConfirm('Supprimer tous les jets de cette partie ?');
  if (!confirmed) return;
  const { error } = await sb.from('rolls')
    .delete()
    .eq('room_code', roomState.code)
    .neq('expression', '— Partie créée —');
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
  clearPlayerCharacter();
}

function showConnected() {
  document.getElementById('room-join').style.display = 'none';
  document.getElementById('room-connected').style.display = '';
  document.getElementById('room-badge-text').textContent = 'Room: ' + roomState.code;
  document.getElementById('player-badge-text').textContent = 'Joueur: ' + roomState.player;
  document.getElementById('live-feed').style.display = '';
  if (!roomState.isCreator) document.getElementById('purge-btn').style.display = 'none';
}

function clearPlayerCharacter() {
  currentPlayerCharacter = null;
  const card = document.getElementById('room-character-card');
  if (card) card.style.display = 'none';
}

function renderPlayerCharacter(character) {
  const card = document.getElementById('room-character-card');
  const nameEl = document.getElementById('room-character-name');
  const statsEl = document.getElementById('room-character-stats');
  if (!card || !nameEl || !statsEl) return;

  card.style.display = '';
  if (!character) {
    currentPlayerCharacter = null;
    nameEl.textContent = 'Aucune fiche';
    statsEl.innerHTML = '<span class="room-character-empty">Aucune fiche personnage enregistrée pour ce joueur.</span>';
    return;
  }

  currentPlayerCharacter = character;
  const heading = [character.nom, character.espece, character.profession].filter(Boolean).join(' · ');
  nameEl.textContent = heading || character.nom;
  const stats = CHARACTER_FIELDS.map(([code, key]) =>
    `<span class="room-character-stat">${code} ${esc(character[key])}</span>`
  );
  const derived = characterDerivedSummary(character).map(([code, value]) =>
    `<span class="room-character-stat derived">${code} ${esc(value)}</span>`
  );
  statsEl.innerHTML = stats.concat(derived).join('');
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

function characterDerivedSummary(character) {
  const force = Number(character.force);
  const constitution = Number(character.constitution);
  const taille = Number(character.taille);
  const pouvoir = Number(character.pouvoir);
  if (![force, constitution, taille, pouvoir].every(Number.isFinite)) return [];

  const hitPoints = Math.ceil((constitution + taille) / 2);
  return [
    ['PV', hitPoints],
    ['BM', Math.ceil(hitPoints / 2)],
    ['PP', pouvoir],
    ['MOV', speciesByName(character.espece).mov],
    ['BD', damageBonus(force + taille)]
  ];
}

async function loadPlayerCharacter(playerName = roomState.player) {
  if (!playerName) { clearPlayerCharacter(); return null; }
  sbInit();
  if (!sb) { clearPlayerCharacter(); return null; }

  const { data, error } = await sb.from('personnages')
    .select(CHARACTER_COLUMNS)
    .eq('player_name', playerName)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    renderPlayerCharacter(null);
    console.error('Erreur chargement fiche personnage:', error.message);
    return null;
  }

  const character = data && data.length ? data[0] : null;
  renderPlayerCharacter(character);
  window.dispatchEvent(new CustomEvent('diceforge:character-loaded', {
    detail: { character }
  }));
  return character;
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
  const masked = r.is_hidden && !roomState.isCreator;

  const tCls = masked ? '' : (r.is_crit ? 'crit' : r.is_fail ? 'fail' : '');
  const hiddenTag = r.is_hidden ? ' <span title="Jet caché — visible uniquement par le MJ">🔒</span>' : '';
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

function emptyToNull(value) {
  return value && value.trim ? value.trim() || null : value || null;
}

function parseOptionalInt(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function saveCharacterSheet(nom, details, stats) {
  if (!stats) {
    stats = details || {};
    details = {};
  }

  const fallbackPlayer = document.getElementById('player-name')?.value.trim();
  const playerName = roomState.connected && roomState.player ? roomState.player : fallbackPlayer;
  if (!playerName) { showToast('Entre ton nom de joueur avant d’enregistrer', 'error'); return false; }

  sbInit();
  if (!sb) { showToast('Supabase non configuré. Voir instructions.', 'error'); return false; }

  const payload = {
    player_name: playerName,
    nom,
    espece: emptyToNull(details.espece),
    genre: emptyToNull(details.genre),
    age: parseOptionalInt(details.age),
    profession: emptyToNull(details.profession),
    richesse: emptyToNull(details.richesse),
    traits: emptyToNull(details.traits),
    notes: emptyToNull(details.notes),
    force: stats.force,
    constitution: stats.constitution,
    taille: stats.taille,
    intelligence: stats.intelligence,
    pouvoir: stats.pouvoir,
    dexterite: stats.dexterite,
    charisme: stats.charisme
  };

  const existing = await sb.from('personnages')
    .select('player_name')
    .eq('player_name', playerName)
    .limit(1);

  if (existing.error) {
    const missingTable = /personnages|schema cache|not find/i.test(existing.error.message);
    const hint = missingTable ? 'Table personnages introuvable. Exécute le SQL fourni dans Supabase.' : existing.error.message;
    showToast('Erreur: ' + hint, 'error');
    return false;
  }

  let data = null;
  let error = null;
  if (existing.data && existing.data.length) {
    const updateResult = await sb.from('personnages')
      .update(payload)
      .eq('player_name', playerName)
      .select(CHARACTER_COLUMNS)
      .single();
    data = updateResult.data;
    error = updateResult.error;
  } else {
    const insertResult = await sb.from('personnages')
      .insert(payload)
      .select(CHARACTER_COLUMNS)
      .single();
    data = insertResult.data;
    error = insertResult.error;

    if (error && (error.code === '23505' || /duplicate key|conflict/i.test(error.message))) {
      const updateResult = await sb.from('personnages')
        .update(payload)
        .eq('player_name', playerName)
        .select(CHARACTER_COLUMNS)
        .single();
      data = updateResult.data;
      error = updateResult.error;
    }
  }

  if (error) {
    const missingTable = /personnages|schema cache|not find/i.test(error.message);
    const hint = missingTable ? 'Table personnages introuvable. Exécute le SQL fourni dans Supabase.' : error.message;
    showToast('Erreur: ' + hint, 'error');
    return false;
  }

  showToast('Fiche personnage enregistrée', 'success');
  renderPlayerCharacter(data || payload);
  return true;
}

export async function restoreSession() {
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
          const { data, error } = await sb.from('rolls')
            .select('id')
            .eq('room_code', r.code)
            .limit(1);
          if (error) {
            showToast('Impossible de vérifier la partie: ' + error.message, 'error');
            return;
          }
          if (!data.length) {
            localStorage.removeItem('diceforge_room');
            roomState = { code: null, player: null, connected: false };
            showToast('Cette ancienne partie n’existe plus. Crée une nouvelle partie ou saisis un autre code.', 'error');
            return;
          }
          showConnected();
          await loadPlayerCharacter(r.player);
          await checkCreator(r.code, r.player);
          subscribeLive(r.code, r.player);
          await loadRecent(r.code, r.player);
        }
      }
    } catch (e) {}
  }
}
