const params = new URLSearchParams(location.search);
const room = params.get('room') || 'LOCAL';
const preview = params.get('bg') === '1' || params.get('preview') === '1';
const panel = document.getElementById('verbal-overlay');
const status = document.getElementById('overlay-status');
let revision = -1;
if (preview) document.body.classList.add('preview');

export function renderOverlay(state) {
  panel.hidden = !state.visible;
  if (!state.visible) return;
  document.getElementById('overlay-character').textContent = state.character;
  document.getElementById('overlay-approach').textContent = state.approach;
  const words = document.getElementById('overlay-words');
  words.replaceChildren();
  state.words.forEach(entry => {
    const word = document.createElement('div');
    word.className = `word${entry.discarded ? ' discarded' : ''}${entry.used ? ' used' : ''}`;
    word.textContent = `${entry.used ? '✓ ' : ''}${entry.word}`;
    words.append(word);
  });
  const used = state.words.filter(entry => entry.used && !entry.discarded).length;
  const discarded = state.words.filter(entry => entry.discarded).length;
  document.getElementById('overlay-progress').textContent = `${used}/5 mots placés · ${discarded}/${state.words.length - 5} joker(s) · Validation à la discrétion du MJ`;
}

async function poll() {
  try {
    const response = await fetch(`/api/verbal-overlay?room=${encodeURIComponent(room)}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Connexion indisponible');
    const state = await response.json();
    if (revision !== state.revision) { renderOverlay(state); revision = state.revision; }
    status.hidden = !preview || state.visible;
    status.textContent = 'En attente du premier tirage dans l’onglet Confrontation verbale.';
  } catch {
    panel.hidden = true;
    revision = -1;
    status.hidden = !preview;
    status.textContent = 'Serveur local indisponible. Lance le cockpit Dice Forge ou scripts/serve_local.py.';
  } finally { setTimeout(poll, 400); }
}
poll();
