import { getSupabaseClient } from './supabase-client.js?v=20261003-roster';
import { readVerbalOverlay } from './verbal-overlay-client.js?v=20261006-cloud';

const params = new URLSearchParams(location.search);
const room = (params.get('room') || 'LOCAL').trim().toUpperCase();
const supabase = getSupabaseClient({ optional: true });
const local = ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);
const preview = params.get('bg') === '1' || params.get('preview') === '1';
const panel = document.getElementById('verbal-overlay');
const line = document.getElementById('overlay-line');
const status = document.getElementById('overlay-status');
let revision = -1;
if (preview) document.body.classList.add('preview');

function fitLine() {
  if (panel.hidden) return;
  const scale = Math.min(1, panel.clientWidth / Math.max(1, line.scrollWidth));
  line.style.transform = `scale(${scale})`;
  panel.style.height = `${Math.ceil(line.offsetHeight * scale)}px`;
}
new ResizeObserver(fitLine).observe(panel);
document.fonts.ready.then(fitLine);

export function renderOverlay(state) {
  panel.hidden = !state.visible;
  if (!state.visible) return;
  document.getElementById('overlay-character').textContent = `${state.character} :`;
  const words = document.getElementById('overlay-words');
  words.replaceChildren();
  state.words.forEach(entry => {
    const word = document.createElement('div');
    const discarded = entry.discarded;
    const used = entry.used && !discarded;
    word.className = `word${discarded ? ' discarded' : ''}${used ? ' used' : ''}`;
    word.textContent = `${discarded ? '✕ ' : used ? '✓ ' : ''}${entry.word}`;
    word.setAttribute('aria-label', `${entry.word} : ${discarded ? 'écarté' : used ? 'placé' : 'à placer'}`);
    words.append(word);
  });
  fitLine();
}

async function poll() {
  try {
    const state = await readVerbalOverlay(room, { client: supabase, localFetch: local ? fetch : null });
    const nextRevision = `${state.draw_id || ''}:${state.revision}`;
    if (revision !== nextRevision) { renderOverlay(state); revision = nextRevision; }
    status.hidden = !preview || state.visible;
    status.textContent = 'En attente du premier tirage dans l’onglet Joute verbale.';
  } catch {
    // Keep the last draw visible during a temporary connection failure.
    status.hidden = !preview || !panel.hidden;
    status.textContent = 'Diffusion indisponible. Vérifie la connexion et le code du salon.';
  } finally { setTimeout(poll, supabase ? 1000 : 400); }
}
poll();
