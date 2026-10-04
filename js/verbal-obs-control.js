export function createVerbalObs() {
  let drawId = null;
  let activeRoom = null;
  let queue = Promise.resolve();

  function roomCode() {
    try { return JSON.parse(localStorage.getItem('diceforge_room'))?.code || 'LOCAL'; }
    catch { return 'LOCAL'; }
  }

  function send(room, payload) {
    queue = queue.then(async () => {
      if (room !== activeRoom || payload.draw_id !== drawId) return;
      try {
        const response = await fetch(`/api/verbal-overlay?room=${encodeURIComponent(room)}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'X-DiceForge-Overlay': '1' },
          body: JSON.stringify(payload), signal: AbortSignal.timeout(5000)
        });
        if (!response.ok) throw new Error('Publication indisponible');
      } catch {
        // La diffusion locale peut être indisponible sur le site joueur en ligne.
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
