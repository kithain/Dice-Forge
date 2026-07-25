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
let currentPlayerCharacter = null;

const FANTASY_NAMES = [
  'Thalindra', 'Kaelen', 'Brynhild', 'Draven', 'Isolde', 'Grimjaw', 'Nyx', 'Orin',
  'Faelar', 'Morrigan', 'Zephyrion', 'Sylvara', 'Thoradin', 'Elowen', 'Ragnor', 'Vesper',
  'Aldric', 'Cyneth', 'Lyraelle', 'Balthor', 'Ythera', 'Corvyn', 'Maelis', 'Drusk',
  'Sariel', 'Wrenna', 'Malachar', 'Ondine', 'Fenwick', 'Astrid', 'Torvik', 'Rowanna',
  'Erevan', 'Sindri', 'Marwenna', 'Kethric', 'Ilyara', 'Bramwell', 'Nerissa', 'Skarn'
];
const LEGACY_CHARACTER_COLUMNS = [
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
const CHARACTER_COLUMNS = [
  LEGACY_CHARACTER_COLUMNS,
  'rerolls_used',
  'generation'
].join(', ');

function isMissingGenerationColumns(error) {
  const message = String(error?.message || '');
  return /rerolls_used|generation/i.test(message)
    && /column|schema cache|does not exist|not find|could not find/i.test(message);
}

function characterDatabaseError(error) {
  if (isMissingGenerationColumns(error)) {
    return 'Migration Supabase requise : réexécute supabase-personnages.sql pour ajouter rerolls_used et generation.';
  }
  if (/personnages|schema cache|not find/i.test(error?.message || '')) {
    return 'Table personnages introuvable. Exécute le SQL fourni dans Supabase.';
  }
  return error?.message || 'Erreur Supabase inconnue';
}

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
  await configureLiveFeed(code, name);
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
  await configureLiveFeed(code, name);
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

function obsUrl(page) {
  const url = new URL(page, window.location.href);
  if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') url.port = '8010';
  url.searchParams.set('room', roomState.code);
  return url.href;
}

function updateObsLinks() {
  const feedLink = document.getElementById('obs-feed-link');
  const diceLink = document.getElementById('obs-dice-link');
  if (!roomState.connected || !roomState.code) return;
  if (feedLink) feedLink.href = obsUrl('obs.html');
  if (diceLink) diceLink.href = obsUrl('obs-dice.html');
}

function showConnected() {
  document.getElementById('room-join').style.display = 'none';
  document.getElementById('room-connected').style.display = '';
  document.getElementById('room-badge-text').textContent = 'Room: ' + roomState.code;
  document.getElementById('player-badge-text').textContent = 'Joueur: ' + roomState.player;
  updateObsLinks();
  updateCreatorUi();
}

function updateCreatorUi() {
  const creator = !!roomState.isCreator;
  document.getElementById('live-feed').style.display = creator ? '' : 'none';
  document.getElementById('purge-btn').style.display = creator ? '' : 'none';
  document.getElementById('obs-feed-link').style.display = creator ? '' : 'none';
  document.getElementById('obs-dice-link').style.display = creator ? '' : 'none';
  if (!creator) document.getElementById('live-list').innerHTML = '';
}

async function configureLiveFeed(code, playerName) {
  updateCreatorUi();
  if (!roomState.isCreator) {
    if (liveSub) { liveSub.unsubscribe(); liveSub = null; }
    return;
  }
  subscribeLive(code, playerName);
  await loadRecent(code, playerName);
}

function clearPlayerCharacter() {
  currentPlayerCharacter = null;
  const card = document.getElementById('room-character-card');
  if (card) card.style.display = 'none';
}

function renderPlayerCharacter(character) {
  const card = document.getElementById('room-character-card');
  const nameEl = document.getElementById('room-character-name');
  if (!card || !nameEl) return;

  card.style.display = '';
  if (!character) {
    currentPlayerCharacter = null;
    nameEl.textContent = 'Aucune fiche personnage enregistrée';
    return;
  }

  currentPlayerCharacter = character;
  const heading = [character.nom, character.espece, character.profession].filter(Boolean).join(' · ');
  nameEl.textContent = heading || character.nom || 'Personnage';
}

export async function loadPlayerCharacter(playerName = roomState.player, {
  preserveOnError = false,
  preserveWhenMissing = false,
  throwOnError = false
} = {}) {
  if (!playerName) {
    if (!preserveOnError) clearPlayerCharacter();
    if (throwOnError) throw new Error('Aucun joueur connecté.');
    return null;
  }
  sbInit();
  if (!sb) {
    if (!preserveOnError) clearPlayerCharacter();
    if (throwOnError) throw new Error('Supabase n’est pas configuré.');
    return null;
  }

  let { data, error } = await sb.from('personnages')
    .select(CHARACTER_COLUMNS)
    .eq('player_name', playerName)
    .order('created_at', { ascending: false })
    .limit(1);

  if (isMissingGenerationColumns(error)) {
    console.warn('Colonnes de relance absentes : chargement de la fiche au format historique.');
    const legacyResult = await sb.from('personnages')
      .select(LEGACY_CHARACTER_COLUMNS)
      .eq('player_name', playerName)
      .order('created_at', { ascending: false })
      .limit(1);
    data = legacyResult.data;
    error = legacyResult.error;
  }

  if (error) {
    if (!preserveOnError) renderPlayerCharacter(null);
    console.error('Erreur chargement fiche personnage:', error.message);
    if (throwOnError) throw error;
    return null;
  }

  const character = data && data.length ? data[0] : null;
  if (!character && preserveWhenMissing) return null;
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
  updateCreatorUi();
}

function subscribeLive(code, selfName) {
  if (!roomState.isCreator) return;
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
  if (!roomState.isCreator) return;
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
  if (!roomState.isCreator) return;
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

export async function saveCharacterSheet(nom, details, stats, generation = null, options = {}) {
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
    charisme: stats.charisme,
    rerolls_used: Math.max(0, Math.min(2, parseInt(generation?.rerollsUsed, 10) || 0)),
    generation: generation && typeof generation === 'object' ? generation : null
  };

  const existing = await sb.from('personnages')
    .select('player_name')
    .eq('player_name', playerName)
    .limit(1);

  if (existing.error) {
    showToast('Erreur: ' + characterDatabaseError(existing.error), 'error');
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
    showToast('Erreur: ' + characterDatabaseError(error), 'error');
    return false;
  }

  showToast(options.successMessage || 'Fiche personnage enregistrée', 'success');
  renderPlayerCharacter(data || payload);
  return true;
}

export async function restoreSession() {
  const saved = localStorage.getItem('diceforge_room');
  if (saved) {
    try {
      const r = JSON.parse(saved);
      if (r.code && r.player) {
        // Le statut de créateur est toujours revérifié avant d'afficher ou charger les jets.
        roomState = { code: r.code, player: r.player, connected: true, isCreator: false };
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
          await configureLiveFeed(r.code, r.player);
        }
      }
    } catch (e) {}
  }
}
