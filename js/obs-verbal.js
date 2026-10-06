const params = new URLSearchParams(location.search);
const room = params.get('room') || 'LOCAL';
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
    const response = await fetch(`/api/verbal-overlay?room=${encodeURIComponent(room)}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Connexion indisponible');
    const state = await response.json();
    if (revision !== state.revision) { renderOverlay(state); revision = state.revision; }
    status.hidden = !preview || state.visible;
    status.textContent = 'En attente du premier tirage dans l’onglet Joute verbale.';
  } catch {
    panel.hidden = true;
    revision = -1;
    status.hidden = !preview;
    status.textContent = 'Serveur local indisponible. Lance le cockpit Dice Forge ou scripts/serve_local.py.';
  } finally { setTimeout(poll, 400); }
}
poll();
