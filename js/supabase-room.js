// ——— Supabase multiplayer room logic ———
import { getSupabaseClient } from './supabase-client.js?v=20261003-roster';
import { showToast, showConfirm } from './toast.js';
import { compactRoll } from './roll-display.js?v=20261002-brp-display';

let sb = null;
let roomState = { code: null, player: null, userId: null, connected: false };
let liveSub = null;
let currentPlayerCharacter = null;
let campaignAccess = { isMj: false, campaigns: [] };
let campaignUiInitialized = false;
let campaignRoomCreating = false;
let campaignSaving = false;

function campaignErrorMessage(error) {
  if (/df_campaigns|df_create_session_room|schema cache|function.*not found/i.test(error?.message || '')) {
    return 'Gestion des campagnes indisponible : appliquez la migration Supabase des campagnes.';
  }
  return error?.message || 'Connexion aux campagnes indisponible.';
}

function campaignStatus(id, message = '') {
  const element = document.getElementById(id);
  if (element) element.textContent = message;
}

function managedCampaigns() {
  return campaignAccess.campaigns.filter(campaign => campaign.can_manage);
}

function renderCampaignSelects({ selectedRoom = '', selectedEditor = '' } = {}) {
  const roomSelect = document.getElementById('room-campaign-select');
  const editorSelect = document.getElementById('campaign-editor-select');
  if (!roomSelect || !editorSelect) return;
  const roomValue = selectedRoom || roomSelect.value;
  const editorValue = selectedEditor || editorSelect.value;
  roomSelect.replaceChildren();
  editorSelect.replaceChildren();
  const option = (value, label) => {
    const node = document.createElement('option');
    node.value = value;
    node.textContent = label;
    return node;
  };
  roomSelect.append(option('', 'Sélectionner une campagne'));
  editorSelect.append(option('', 'Nouvelle campagne'));
  for (const campaign of managedCampaigns()) {
    const label = `${campaign.name} · ${campaign.id}`;
    roomSelect.append(option(campaign.id, label));
    editorSelect.append(option(campaign.id, label));
  }
  roomSelect.value = managedCampaigns().some(campaign => campaign.id === roomValue) ? roomValue : '';
  editorSelect.value = managedCampaigns().some(campaign => campaign.id === editorValue) ? editorValue : '';
  updateRoomCampaignHint();
}

function updateCampaignUi() {
  const managerButton = document.getElementById('campaign-manager-btn');
  const createButton = document.getElementById('create-btn');
  if (managerButton) managerButton.hidden = !campaignAccess.isMj;
  if (createButton) createButton.style.display = campaignAccess.isMj ? '' : 'none';
  const newSessionButton = document.getElementById('new-session-btn');
  if (newSessionButton) newSessionButton.style.display = roomState.connected && campaignAccess.isMj ? '' : 'none';
}

function acceptCampaignAccess(data) {
  campaignAccess = {
    isMj: data?.is_mj === true,
    campaigns: Array.isArray(data?.campaigns) ? data.campaigns : []
  };
  updateCampaignUi();
  renderCampaignSelects();
}

export async function refreshCampaigns() {
  sbInit();
  if (!sb || !await authenticatedUserId()) {
    acceptCampaignAccess(null);
    return false;
  }
  try {
    const { data, error } = await sb.rpc('df_campaigns', { p_operation: 'list' });
    if (error) throw error;
    acceptCampaignAccess(data);
    campaignStatus('campaign-status');
    return true;
  } catch (error) {
    acceptCampaignAccess(null);
    campaignStatus('campaign-status', campaignErrorMessage(error));
    return false;
  }
}

async function loadRoomCampaign(code) {
  const { data, error } = await sb.rpc('df_campaigns', { p_operation: 'room', p_room: code });
  if (error) {
    campaignStatus('campaign-status', campaignErrorMessage(error));
    return false;
  }
  acceptCampaignAccess(data);
  if (!data?.campaign?.id) {
    campaignStatus('campaign-status', 'Cette room n’a pas de campagne. La migration des rooms existantes est requise.');
    return false;
  }
  roomState.campaignId = data.campaign.id;
  roomState.campaignName = data.campaign.name;
  localStorage.setItem('diceforge_room', JSON.stringify(roomState));
  campaignStatus('campaign-status');
  return true;
}

function updateRoomCampaignHint() {
  const selected = document.getElementById('room-campaign-select')?.value;
  campaignStatus('room-create-campaign-id', selected ? `ID campagne : ${selected}` : 'Une campagne est obligatoire.');
}

export function selectManagedCampaign() {
  const id = document.getElementById('campaign-editor-select')?.value;
  const campaign = managedCampaigns().find(candidate => candidate.id === id);
  const name = document.getElementById('campaign-name-input');
  const description = document.getElementById('campaign-description-input');
  if (name) name.value = campaign?.name || '';
  if (description) description.value = campaign?.description || '';
  campaignStatus('campaign-editor-id', campaign ? `ID campagne : ${campaign.id} · ${campaign.room_count || 0} room(s)` : 'L’ID unique est attribué à la création.');
  campaignStatus('campaign-editor-status');
  const button = document.getElementById('campaign-save-btn');
  if (button) button.textContent = campaign ? 'Enregistrer les modifications' : 'Créer la campagne';
}

export function initCampaignUi() {
  if (campaignUiInitialized) return;
  campaignUiInitialized = true;
  document.getElementById('room-create-form')?.addEventListener('submit', submitCampaignRoom);
  document.getElementById('campaign-manager-form')?.addEventListener('submit', saveCampaign);
  document.getElementById('room-campaign-select')?.addEventListener('change', updateRoomCampaignHint);
  document.getElementById('campaign-editor-select')?.addEventListener('change', selectManagedCampaign);
  document.getElementById('room-create-cancel')?.addEventListener('click', () => document.getElementById('room-create-dialog')?.close());
  document.getElementById('campaign-manager-close')?.addEventListener('click', () => document.getElementById('campaign-manager-dialog')?.close());
}

export async function openCampaignManager() {
  initCampaignUi();
  if (!await refreshCampaigns() || !campaignAccess.isMj) return;
  selectManagedCampaign();
  const dialog = document.getElementById('campaign-manager-dialog');
  if (dialog && !dialog.open) dialog.showModal();
}

export async function saveCampaign(event) {
  event?.preventDefault();
  if (campaignSaving || !campaignAccess.isMj) return;
  const form = document.getElementById('campaign-manager-form');
  if (form && !form.reportValidity()) return;
  const id = document.getElementById('campaign-editor-select')?.value || null;
  const name = document.getElementById('campaign-name-input')?.value.trim();
  const description = document.getElementById('campaign-description-input')?.value.trim() || '';
  if (!name) { campaignStatus('campaign-editor-status', 'Le nom de campagne est obligatoire.'); return; }
  if (id && !managedCampaigns().some(campaign => campaign.id === id)) return;
  campaignSaving = true;
  const button = document.getElementById('campaign-save-btn');
  if (button) button.disabled = true;
  campaignStatus('campaign-editor-status', 'Enregistrement…');
  try {
    const { data, error } = await sb.rpc('df_campaigns', {
      p_operation: id ? 'update' : 'create', p_campaign: id, p_name: name, p_description: description
    });
    if (error) throw error;
    const campaign = data?.campaign;
    acceptCampaignAccess(data);
    renderCampaignSelects({ selectedRoom: campaign?.id, selectedEditor: campaign?.id });
    selectManagedCampaign();
    if (campaign?.id === roomState.campaignId) {
      roomState.campaignName = campaign.name;
      localStorage.setItem('diceforge_room', JSON.stringify(roomState));
      showConnected();
    }
    campaignStatus('campaign-editor-status', id ? 'Campagne mise à jour.' : 'Campagne créée. Vous pouvez maintenant la sélectionner pour une room.');
    showToast(id ? 'Campagne mise à jour' : 'Campagne créée', 'success');
  } catch (error) {
    campaignStatus('campaign-editor-status', campaignErrorMessage(error));
  } finally {
    campaignSaving = false;
    if (button) button.disabled = false;
  }
}

async function authenticatedUserId() {
  sbInit();
  if (!sb) return null;
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}

const FANTASY_NAMES = [
  'Thalindra', 'Kaelen', 'Brynhild', 'Draven', 'Isolde', 'Grimjaw', 'Nyx', 'Orin',
  'Faelar', 'Morrigan', 'Zephyrion', 'Sylvara', 'Thoradin', 'Elowen', 'Ragnor', 'Vesper',
  'Aldric', 'Cyneth', 'Lyraelle', 'Balthor', 'Ythera', 'Corvyn', 'Maelis', 'Drusk',
  'Sariel', 'Wrenna', 'Malachar', 'Ondine', 'Fenwick', 'Astrid', 'Torvik', 'Rowanna',
  'Erevan', 'Sindri', 'Marwenna', 'Kethric', 'Ilyara', 'Bramwell', 'Nerissa', 'Skarn'
];
const LEGACY_CHARACTER_COLUMNS = [
  'user_id',
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
  if (!el) return;
  const authenticatedName = localStorage.getItem('diceforge_player_name');
  if (authenticatedName) {
    el.value = authenticatedName;
    el.readOnly = true;
    el.title = 'Nom lié au compte connecté';
  }
  if (!el.value) el.placeholder = randomFantasyName();
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
  sb = getSupabaseClient({ optional: true });
  if (!sb) console.warn('Supabase non configuré.');
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

  const userId = await authenticatedUserId();
  if (!userId) { showToast('Session expirée. Reconnecte-toi.', 'error'); return; }

  const { data, error } = await sb.from('rooms')
    .select('room_code')
    .eq('room_code', code)
    .limit(1);
  if (error) { showToast('Erreur: ' + error.message, 'error'); return; }
  if (!data.length) { showToast('Aucune partie trouvée avec ce code', 'error'); return; }

  const { error: membershipError } = await sb.from('room_members').upsert({
    room_code: code,
    user_id: userId,
    player_name: name
  }, { onConflict: 'room_code,user_id' });
  if (membershipError) { showToast('Impossible de rejoindre la partie: ' + membershipError.message, 'error'); return; }

  clearPlayerCharacter();
  roomState = { code, player: name, userId, connected: true };
  localStorage.setItem('diceforge_room', JSON.stringify(roomState));
  await loadRoomCampaign(code);
  showConnected();
  await loadPlayerCharacter(name);
  await checkCreator(code);
  await configureLiveFeed(code, name);
}

export async function createRoom() {
  const name = document.getElementById('player-name').value.trim();
  if (!name) { showToast('Entre ton nom de joueur', 'error'); return; }
  initCampaignUi();
  if (!await refreshCampaigns() || !campaignAccess.isMj) return;
  renderCampaignSelects({ selectedRoom: roomState.campaignId });
  campaignStatus('room-create-status', managedCampaigns().length ? '' : 'Créez d’abord une campagne pour pouvoir créer une room.');
  const dialog = document.getElementById('room-create-dialog');
  if (dialog && !dialog.open) dialog.showModal();
}

export async function submitCampaignRoom(event) {
  event?.preventDefault();
  if (campaignRoomCreating || !campaignAccess.isMj) return;
  const form = document.getElementById('room-create-form');
  if (form && !form.reportValidity()) return;
  const campaignId = document.getElementById('room-campaign-select')?.value || '';
  const selectedCampaign = managedCampaigns().find(campaign => campaign.id === campaignId);
  if (!selectedCampaign) { campaignStatus('room-create-status', 'Sélectionnez une campagne de rattachement.'); return; }
  const name = document.getElementById('player-name').value.trim();
  if (!name) { campaignStatus('room-create-status', 'Entre ton nom de joueur.'); return; }
  campaignRoomCreating = true;
  const button = document.getElementById('room-create-submit');
  if (button) button.disabled = true;
  campaignStatus('room-create-status', 'Création de la room…');
  try {
    const userId = await authenticatedUserId();
    if (!userId) throw new Error('Session expirée. Reconnecte-toi.');
    const code = genCode();
    const { data, error } = await sb.rpc('df_create_session_room', {
      p_source: campaignId === roomState.campaignId && roomState.isCreator ? roomState.code : null,
      p_code: code, p_name: name, p_campaign: campaignId
    });
    if (error) throw error;
    if (data?.legacy) throw new Error('Migration Supabase des campagnes requise pour créer une room.');
    if (liveSub) { liveSub.unsubscribe(); liveSub = null; }
    clearPlayerCharacter();
    roomState = {
      code, player: name, userId, connected: true, isCreator: true,
      campaignId, campaignName: selectedCampaign.name
    };
    localStorage.setItem('diceforge_room', JSON.stringify(roomState));
    document.getElementById('room-code').value = code;
    showConnected();
    document.getElementById('room-create-dialog')?.close();
    await loadPlayerCharacter(name);
    await configureLiveFeed(code, name);
    showToast(`Room ${code} créée dans ${selectedCampaign.name}`, 'success');
  } catch (error) {
    campaignStatus('room-create-status', campaignErrorMessage(error));
    showToast('Création de la room impossible : ' + campaignErrorMessage(error), 'error');
  } finally {
    campaignRoomCreating = false;
    if (button) button.disabled = false;
  }
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
  roomState = { code: null, player: null, userId: null, connected: false };
  localStorage.removeItem('diceforge_room');
  document.getElementById('room-join').style.display = '';
  document.getElementById('room-connected').style.display = 'none';
  document.getElementById('live-feed').style.display = 'none';
  document.getElementById('live-list').innerHTML = '';
  clearPlayerCharacter();
  updateCampaignUi();
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
  campaignStatus('room-campaign-name', roomState.campaignName ? `Campagne : ${roomState.campaignName}` : 'Campagne indisponible');
  campaignStatus('room-campaign-id', roomState.campaignId || '—');
  updateObsLinks();
  updateCreatorUi();
}

function updateCreatorUi() {
  const creator = !!roomState.isCreator;
  document.getElementById('live-feed').style.display = creator ? '' : 'none';
  document.getElementById('purge-btn').style.display = creator ? '' : 'none';
  const newSessionButton = document.getElementById('new-session-btn');
  if (newSessionButton) newSessionButton.style.display = campaignAccess.isMj ? '' : 'none';
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

  const userId = roomState.userId || await authenticatedUserId();
  if (!userId) {
    if (!preserveOnError) clearPlayerCharacter();
    if (throwOnError) throw new Error('Session utilisateur expirée.');
    return null;
  }

  let { data, error } = await sb.from('personnages')
    .select(CHARACTER_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (isMissingGenerationColumns(error)) {
    console.warn('Colonnes de relance absentes : chargement de la fiche au format historique.');
    const legacyResult = await sb.from('personnages')
      .select(LEGACY_CHARACTER_COLUMNS)
      .eq('user_id', userId)
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
  if (character?.player_name && character.player_name !== roomState.player) {
    roomState.player = character.player_name;
    localStorage.setItem('diceforge_player_name', character.player_name);
    localStorage.setItem('diceforge_room', JSON.stringify(roomState));
    const playerInput = document.getElementById('player-name');
    if (playerInput) playerInput.value = character.player_name;
    const playerBadge = document.getElementById('player-badge-text');
    if (playerBadge) playerBadge.textContent = 'Joueur: ' + character.player_name;
  }
  renderPlayerCharacter(character);
  window.dispatchEvent(new CustomEvent('diceforge:character-loaded', {
    detail: { character }
  }));
  return character;
}

async function checkCreator(code) {
  const { data } = await sb.from('rooms')
    .select('owner_id')
    .eq('room_code', code)
    .limit(1);
  const isCreator = data && data.length && data[0].owner_id === roomState.userId;
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
  const compact = masked ? null : compactRoll(r);
  const rollsOut = masked ? '???' : compact ? '' : esc(r.rolls_detail);
  const totOut = masked ? '?' : compact ? `${esc(compact.total)}${esc(compact.marker)}` : `${r.total}${r.is_crit ? ' ★' : r.is_fail ? ' ✗' : ''}`;

  const html = `<div class="live-item ${cls}${compact ? ' live-compact' : ''}">
    <span class="live-player">${esc(r.player_name)}${compact ? ' :' : ''}${hiddenTag}</span>
    <span class="live-expr">${esc(compact ? compact.expression : r.expression)}</span>
    ${compact ? '' : `<span class="live-rolls">${rollsOut}</span>`}
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

export async function sendRoll(expr, rollsDetail, total, isCrit, isFail, isHidden, characterName = null) {
  if (!roomState.connected || !sb) return;
  const { error } = await sb.from('rolls').insert({
    room_code: roomState.code,
    user_id: roomState.userId,
    player_name: characterName || roomState.player,
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
  const userId = roomState.userId || await authenticatedUserId();
  if (!userId) { showToast('Session expirée. Reconnecte-toi.', 'error'); return false; }

  const payload = {
    user_id: userId,
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
    .eq('user_id', userId)
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
      .eq('user_id', userId)
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
        .eq('user_id', userId)
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
  initCampaignUi();
  await refreshCampaigns();
  const requestedRoom = new URLSearchParams(window.location.search)
    .get('room')?.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || '';
  if (requestedRoom) document.getElementById('room-code').value = requestedRoom;
  const saved = localStorage.getItem('diceforge_room');
  if (saved) {
    try {
      const r = JSON.parse(saved);
      if (r.code && r.player && (!requestedRoom || requestedRoom === r.code)) {
        const authenticatedName = localStorage.getItem('diceforge_player_name') || r.player;
        // Le statut de créateur est toujours revérifié avant d'afficher ou charger les jets.
        const userId = await authenticatedUserId();
        if (!userId) return;
        roomState = { code: r.code, player: authenticatedName, userId, connected: true, isCreator: false };
        document.getElementById('player-name').value = authenticatedName;
        document.getElementById('room-code').value = r.code;
        sbInit();
        if (sb) {
          const { data, error } = await sb.from('rooms')
            .select('room_code')
            .eq('room_code', r.code)
            .limit(1);
          if (error) {
            showToast('Impossible de vérifier la partie: ' + error.message, 'error');
            return;
          }
          if (!data.length) {
            localStorage.removeItem('diceforge_room');
            roomState = { code: null, player: null, userId: null, connected: false };
            showToast('Cette ancienne partie n’existe plus. Crée une nouvelle partie ou saisis un autre code.', 'error');
            return;
          }
          const { error: membershipError } = await sb.from('room_members').upsert({
            room_code: r.code,
            user_id: userId,
            player_name: authenticatedName
          }, { onConflict: 'room_code,user_id' });
          if (membershipError) {
            showToast('Impossible de restaurer la partie: ' + membershipError.message, 'error');
            return;
          }
          await loadRoomCampaign(r.code);
          showConnected();
          await loadPlayerCharacter(authenticatedName);
          await checkCreator(r.code);
          await configureLiveFeed(r.code, authenticatedName);
          return;
        }
      }
    } catch (e) {}
  }

  if (requestedRoom) {
    sbInit();
    if (!sb) return;
    const { data, error } = await sb.auth.getUser();
    if (error || !data.user) return;
    const authenticatedName = localStorage.getItem('diceforge_player_name')
      || data.user.user_metadata?.player_name
      || data.user.email?.split('@')[0]
      || '';
    if (!authenticatedName) return;
    localStorage.setItem('diceforge_player_name', authenticatedName);
    document.getElementById('player-name').value = authenticatedName;
    document.getElementById('room-code').value = requestedRoom;
    await joinRoom();
  }
}
