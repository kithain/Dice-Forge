// Transport shared by the online player screen and local/online OBS pages.
export async function publishVerbalOverlay(room, payload, { client = null, localFetch = null } = {}) {
  const sends = [];
  if (client && room !== 'LOCAL') sends.push((async () => {
    const { data, error } = await client.rpc('df_publish_verbal_overlay', { p_room: room, p_payload: payload });
    if (error) throw error;
    return data;
  })());
  if (localFetch) sends.push((async () => {
    const response = await localFetch(`/api/verbal-overlay?room=${encodeURIComponent(room)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-DiceForge-Overlay': '1' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) throw new Error('Diffusion locale indisponible');
    return response.json();
  })());
  const results = await Promise.allSettled(sends);
  if (!results.some(result => result.status === 'fulfilled')) throw new Error('Diffusion OBS indisponible');
}

export async function readVerbalOverlay(room, { client = null, localFetch = null } = {}) {
  let cloudError = null;
  if (client && room !== 'LOCAL') {
    try {
      const { data, error } = await client.from('obs_verbal_states').select('state, revision').eq('room_code', room).maybeSingle();
      if (error) throw error;
      if (data?.state?.visible) return { ...data.state, revision: data.revision };
    } catch (error) { cloudError = error; }
  }
  if (localFetch) {
    const response = await localFetch(`/api/verbal-overlay?room=${encodeURIComponent(room)}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Diffusion locale indisponible');
    const state = await response.json();
    if (state.visible || !cloudError) return state;
  }
  if (cloudError) throw cloudError;
  return { visible: false, revision: 0 };
}
