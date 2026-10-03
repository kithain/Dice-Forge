import { getSupabaseClient } from './supabase-client.js?v=20261003-roster';
import { showConfirm } from './toast.js?v=20261002-safe-confirm';

function rosterNotExposed(error) {
  return error?.code === 'PGRST202' || /Could not find the function public\.df_character_roster\b.*schema cache/i.test(String(error?.message || ''));
}

// The server owns selection and attribution. Local storage only names the draft.
export async function mountCharacterRoster(container, { room, beforeSelect, onSelect, manager = false } = {}) {
  if (!container || !window.SUPABASE_CONFIG?.characterV2 || !room?.code) return;
  const client = getSupabaseClient({ optional: true });
  if (!client) return;
  let busy = false;
  const title = document.createElement('h2'); title.textContent = manager ? 'Disponibilité et attribution des PJ' : 'Choisir un personnage';
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  const controls = document.createElement('div');
  container.replaceChildren(title, controls, status);
  const request = async (operation = 'list', character = null, reserved = null) => {
    const { data, error } = await client.rpc('df_character_roster', { p_room: room.code, p_operation: operation, p_character: character, p_reserved_user: reserved });
    if (error) throw error;
    return data;
  };
  async function act(operation, character, reserved = null) {
    if (busy) return;
    if (operation === 'dead' && !await showConfirm(`Déclarer ${character.name} mort ? Sa fiche et son historique seront conservés. Les XP restants seront perdus.`, { title: 'Décès du personnage' })) return;
    if (['select','new'].includes(operation) && beforeSelect && !await beforeSelect()) return;
    busy = true; controls.inert = true;
    try {
      const data = await request(operation, character.character_id, reserved);
      if (['select','new'].includes(operation)) {
        if (operation === 'new') {
          const draftKey = `dice-forge.pj-markdown.v2:${room.userId}:${room.code}:new`;
          const previous = localStorage.getItem(draftKey);
          if (previous) localStorage.setItem(`${draftKey}:archive:${Date.now()}`, previous);
          localStorage.removeItem(draftKey);
        }
        localStorage.setItem(`diceforge_character:${room.userId}:${room.code}`, operation === 'new' ? 'new' : character.character_id);
        status.textContent = operation === 'new' ? 'Nouvelle création ouverte.' : `${character.name} sélectionné.`;
        await onSelect?.(character);
      }
      render(data);
      if (operation !== 'select') status.textContent = 'Modification enregistrée.';
    } catch (error) {
      if (rosterNotExposed(error)) showUnavailable();
      else status.textContent = `Action impossible : ${error.message || 'connexion indisponible'}. Actualisez la liste avant de réessayer.`;
    }
    finally { busy = false; controls.inert = false; }
  }
  function button(label, callback) {
    const element = document.createElement('button'); element.type = 'button'; element.className = 'room-btn'; element.textContent = label;
    element.addEventListener('click', callback); return element;
  }
  function render(data) {
    if (data?.legacy) { container.hidden = true; return; }
    controls.replaceChildren();
    container.hidden = manager && !data.is_mj;
    if (container.hidden) return;
    const characters = data.characters || [];
    if (manager) {
      for (const character of characters) {
        const row = document.createElement('p');
        const name = document.createElement('strong'); name.textContent = `${character.name} · ${character.player_name || 'sans joueur'} · ${character.status === 'dead' ? 'mort' : character.available ? 'disponible' : 'indisponible'}`;
        row.append(name, ' ');
        if (character.status === 'active') {
          row.append(button(character.available ? 'Retirer de la liste' : 'Rendre disponible', () => act(character.available ? 'withdraw' : 'offer', character)), ' ', button('Déclarer mort', () => act('dead', character)));
          if (character.owner_user_id === room.userId) {
            const reservation = document.createElement('select'); reservation.setAttribute('aria-label', 'Joueur auquel réserver ce prétiré');
            const any = document.createElement('option'); any.value = ''; any.textContent = 'Tout joueur de la campagne'; reservation.append(any);
            for (const member of data.members || []) { const option = document.createElement('option'); option.value = member.user_id; option.textContent = member.name; reservation.append(option); }
            row.append(' ', reservation, ' ', button('Proposer comme prétiré', () => act('preset', character, reservation.value || null)));
          }
        }
        controls.append(row);
      }
    } else {
      const select = document.createElement('select'); select.setAttribute('aria-label', 'Personnage disponible');
      const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = 'Sélectionnez un PJ disponible'; select.append(placeholder);
      for (const character of characters.filter(c => c.can_select && !c.needs_sheet)) {
        const option = document.createElement('option'); option.value = character.character_id; option.textContent = `${character.name}${character.preset ? ' · prétiré' : ''}`; select.append(option);
      }
      select.value = data.selected_character_id || '';
      controls.append(select, ' ', button('Choisir ce PJ', () => { const character = characters.find(c => c.character_id === select.value); if (character) act('select', character); }));
      controls.append(' ', button('Créer un nouveau PJ', () => act('new', { name: 'Nouveau PJ', character_id: null })));
      for (const character of characters.filter(c => c.needs_sheet && c.status === 'active' && c.owner_user_id === room.userId)) {
        controls.append(' ', button(`Créer la fiche de ${character.name}`, () => act('attach', character)));
      }
      if (data.selected_character_id) localStorage.setItem(`diceforge_character:${room.userId}:${room.code}`, data.selected_character_id);
    }
    controls.append(' ', button('Actualiser la liste', refresh));
  }
  async function refresh() {
    if (busy) return;
    busy = true;
    try { const data = await request(); status.textContent = ''; render(data); }
    catch (error) {
      if (rosterNotExposed(error)) showUnavailable();
      else status.textContent = `Liste indisponible : ${error.message || 'connexion indisponible'}`;
    }
    finally { busy = false; }
  }
  function showUnavailable() {
    container.hidden = false;
    controls.replaceChildren(button('Réessayer la liste', refresh));
    status.textContent = 'La sélection des PJ n’est pas encore disponible sur ce serveur. Aucun personnage n’a été changé.';
  }
  await refresh();
}
