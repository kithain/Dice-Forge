import { createClient } from '@supabase/supabase-js';

const params = new URLSearchParams(window.location.search);
const room = (params.get('room') || params.get('code') || '').trim().toUpperCase();
const limit = clampInt(params.get('limit'), 1, 12, 5);
const showHistory = params.get('history') !== '0';
const preview = params.get('bg') === '1' || params.get('preview') === '1';
const wide = params.get('wide') === '1' || params.get('layout') === 'wide';

const statusEl = document.getElementById('obs-status');
const listEl = document.getElementById('obs-list');
const roomEl = document.getElementById('obs-room');

let supabase = null;
let sub = null;

if (preview) document.body.classList.add('preview');
if (wide) document.body.classList.add('wide');
roomEl.textContent = room ? `Room ${room}` : 'Room --';

boot();

async function boot() {
  if (!room) {
    showSetup();
    return;
  }

  const cfg = window.SUPABASE_CONFIG || {};
  if (!cfg.url || !cfg.anonKey || cfg.url.includes('VOTRE_PROJET')) {
    setStatus('Supabase non configure.');
    return;
  }

  supabase = createClient(cfg.url, cfg.anonKey);
  setStatus('Connexion au live...');

  if (showHistory) await loadRecent();
  subscribe();
}

async function loadRecent() {
  const { data, error } = await supabase.from('rolls')
    .select('*')
    .eq('room_code', room)
    .neq('expression', '— Partie créée —')
    .neq('expression', 'â€” Partie crÃ©Ã©e â€”')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    setStatus(`Erreur chargement: ${error.message}`);
    return;
  }

  listEl.innerHTML = '';
  (data || []).reverse().forEach((roll) => addRoll(roll, true));
  setStatus(data && data.length ? 'En attente des prochains jets...' : 'Aucun jet recent. En attente...');
}

function subscribe() {
  if (sub) sub.unsubscribe();
  sub = supabase.channel(`obs-rolls:${room}`)
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'rolls', filter: `room_code=eq.${room}` },
      (payload) => {
        const roll = payload.new;
        if (isRoomCreation(roll)) return;
        addRoll(roll);
        setStatus('Live connecte');
      }
    )
    .subscribe((state) => {
      if (state === 'SUBSCRIBED') setStatus('Live connecte');
      if (state === 'CHANNEL_ERROR') setStatus('Erreur de connexion live');
      if (state === 'TIMED_OUT') setStatus('Connexion live expiree');
    });
}

function addRoll(roll, append = false) {
  const card = document.createElement('article');
  const hidden = !!roll.is_hidden;
  const isCrit = !!roll.is_crit && !hidden;
  const isFail = !!roll.is_fail && !hidden;
  card.className = `roll-card${isCrit ? ' crit' : ''}${isFail ? ' fail' : ''}${hidden ? ' hidden' : ''}`;

  const total = hidden ? '?' : `${roll.total}${isCrit ? ' ★' : isFail ? ' ✕' : ''}`;
  const detail = hidden ? 'Jet cache' : (roll.rolls_detail || '');
  const time = roll.created_at
    ? new Date(roll.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : '--:--';

  card.innerHTML = `
    <div class="roll-player">
      <div class="roll-name">${esc(roll.player_name || 'Joueur')}</div>
      <div class="roll-time">${time}</div>
    </div>
    <div class="roll-body">
      <div class="roll-expr">${esc(roll.expression || '')}</div>
      <div class="roll-detail">${esc(detail)}</div>
    </div>
    <div class="roll-total">${esc(total)}</div>
  `;

  if (append) listEl.appendChild(card);
  else listEl.prepend(card);

  while (listEl.children.length > limit) {
    listEl.removeChild(append ? listEl.firstElementChild : listEl.lastElementChild);
  }
}

function showSetup() {
  listEl.innerHTML = `
    <div class="obs-setup">
      Ajoute le code de salle dans l'URL OBS :<br>
      <code>http://127.0.0.1:8010/obs.html?room=ABCD</code><br><br>
      Optionnel : <code>&limit=3</code> pour limiter le nombre de jets affiches,
      <code>&bg=1</code> pour afficher un fond de test hors OBS.
    </div>
  `;
  setStatus('En attente du code room');
}

function isRoomCreation(roll) {
  return roll && (
    roll.expression === '— Partie créée —' ||
    roll.expression === 'â€” Partie crÃ©Ã©e â€”'
  );
}

function setStatus(text) {
  statusEl.textContent = text;
}

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function esc(value) {
  const d = document.createElement('div');
  d.textContent = value == null ? '' : String(value);
  return d.innerHTML;
}

window.addEventListener('beforeunload', () => {
  if (sub) sub.unsubscribe();
});
