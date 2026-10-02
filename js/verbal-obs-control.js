export function createVerbalObs() {
  const show = document.getElementById('verbal-obs-show');
  const hide = document.getElementById('verbal-obs-hide');
  const link = document.getElementById('verbal-obs-url');
  const status = document.getElementById('verbal-obs-status');
  let current = null;
  let visible = false;
  let activeRoom = null;
  let queue = Promise.resolve();
  let revision = 0;

  function roomCode() {
    try { return JSON.parse(localStorage.getItem('diceforge_room'))?.code || 'LOCAL'; }
    catch { return 'LOCAL'; }
  }

  function updateLink() {
    const url = new URL('obs-verbal.html', location.href);
    url.searchParams.set('room', roomCode());
    link.href = url.href;
    link.textContent = url.href;
  }

  function send(room, payload) {
    const version = ++revision;
    queue = queue.then(async () => {
      try {
        const response = await fetch(`/api/verbal-overlay?room=${encodeURIComponent(room)}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'X-DiceForge-Overlay': '1' },
          body: JSON.stringify(payload), signal: AbortSignal.timeout(5000)
        });
        if (!response.ok) throw new Error('Publication indisponible');
        if (version === revision) status.textContent = payload.visible ? 'OBS affiche cette aide au RP. Les modifications sont synchronisées.' : 'Overlay OBS masqué.';
      } catch {
        if (version === revision) status.textContent = 'Synchronisation OBS indisponible. Utilise le cockpit local ou lance python scripts/serve_local.py ; réessaie avec Afficher ou Masquer.';
      }
    });
  }

  function publish() {
    const room = roomCode();
    if (activeRoom && activeRoom !== room) {
      send(activeRoom, { visible: false });
      visible = false;
    }
    activeRoom = room;
    send(room, visible && current ? { ...current, visible: true } : { visible: false });
    hide.disabled = false;
  }

  show.addEventListener('click', () => { if (current) { visible = true; publish(); } });
  hide.addEventListener('click', () => { visible = false; publish(); });
  document.getElementById('verbal-obs-copy').addEventListener('click', async () => {
    updateLink();
    try { await navigator.clipboard.writeText(link.href); status.textContent = 'URL copiée : ajoute-la comme source Navigateur dans OBS (700 × 550).'; }
    catch { status.textContent = 'Copie le lien affiché pour ta source Navigateur OBS.'; }
  });
  updateLink();
  return payload => {
    current = payload;
    show.disabled = !current;
    updateLink();
    if (!current) {
      if (visible) { visible = false; publish(); }
    } else if (visible) publish();
  };
}
