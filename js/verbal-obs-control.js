import { getSupabaseClient } from './supabase-client.js?v=20261003-roster';
import { showToast } from './toast.js?v=20261002-safe-confirm';
import { publishVerbalOverlay } from './verbal-overlay-client.js?v=20261006-cloud';

export function createVerbalObs() {
  let drawId = null;
  let activeRoom = null;
  let queue = Promise.resolve();
  let reportedFailure = false;

  function roomCode() {
    try { return JSON.parse(localStorage.getItem('diceforge_room'))?.code || 'LOCAL'; }
    catch { return 'LOCAL'; }
  }

  function send(room, payload) {
    queue = queue.then(async () => {
      if (room !== activeRoom || payload.draw_id !== drawId) return;
      try {
        const local = ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(location.href).hostname);
        await publishVerbalOverlay(room, payload, {
          client: getSupabaseClient({ optional: true }), localFetch: local ? fetch : null
        });
        reportedFailure = false;
      } catch {
        if (!reportedFailure) showToast('Diffusion OBS de la joute verbale indisponible. Vérifie la connexion au salon.', 'error');
        reportedFailure = true;
      }
    });
  }

  return (payload, newDraw = false) => {
    const room = roomCode();
    if (!payload || activeRoom !== room) {
      drawId = null;
      activeRoom = room;
    }
    if (!payload) return;
    if (newDraw) {
      drawId = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
    }
    if (drawId) send(room, { ...payload, visible: true, draw_id: drawId, new_draw: newDraw });
  };
}
