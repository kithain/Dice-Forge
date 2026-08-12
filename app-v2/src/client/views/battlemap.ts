import type { BattlemapState, MapToken } from '../../shared/battlemap.js';
import type { CombatState } from '../../shared/combat.js';
import { api, escapeHtml } from '../http.js';

type Notify = (message: string, error?: boolean) => void;

export async function renderBattlemap(workspace: HTMLElement, notify: Notify, canManage = false): Promise<void> {
  const [state, combat] = await Promise.all([api<BattlemapState>('/api/battlemap'), api<CombatState>('/api/combat')]);
  workspace.innerHTML = `<section class="tool-header compact"><div><p class="eyebrow">${canManage ? 'Contrôle MJ' : 'Vue joueur'}</p><h1>Battle Map</h1><p>${state.tokens.length} token(s) · ${state.map ? 'Carte chargée' : 'Aucune carte'}</p></div>${canManage ? '<div class="toolbar"><label class="upload-button">Importer une carte<input id="map-upload" type="file" accept="image/png,image/jpeg,image/gif,image/webp"></label><button class="danger" id="clear-tokens">Effacer les tokens</button></div>' : ''}</section>
    <section class="battlemap-layout"><div class="map-board" id="map-board" ${state.map ? `style="background-image:url('${escapeHtml(state.map)}?t=${Date.now()}')"` : ''}>${state.tokens.map(tokenHtml).join('')}<span class="map-empty">${state.map ? '' : 'Importez une carte pour commencer'}</span></div>
    ${canManage ? `<aside class="tracker-side"><div class="side-card"><h2>Ajouter un token</h2><form id="add-token"><input name="name" required placeholder="Nom"><input name="color" type="color" value="#4a90e2"><button class="primary">Ajouter</button></form></div><div class="side-card"><h2>Depuis le tracker</h2><div class="combat-token-list">${combat.participants.map((participant) => `<button data-combat-token="${participant.id}"><span style="background:${participant.role === 'player' ? '#4a90e2' : participant.role === 'ally' ? '#2ecc71' : '#d9534f'}"></span>${escapeHtml(participant.name)}</button>`).join('') || '<small>Aucun combattant.</small>'}</div></div></aside>` : ''}</section>`;
  if (!canManage) return;
  const refresh = () => renderBattlemap(workspace, notify, true);
  document.querySelector<HTMLInputElement>('#map-upload')?.addEventListener('change', (event) => {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    const body = new FormData(); body.set('map', file);
    void api('/api/battlemap/map', { method: 'POST', body }).then(refresh).catch((error) => notify(error.message, true));
  });
  document.querySelector('#clear-tokens')?.addEventListener('click', () => void api('/api/battlemap/tokens', { method: 'DELETE' }).then(refresh));
  document.querySelector<HTMLFormElement>('#add-token')?.addEventListener('submit', (event) => {
    event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget as HTMLFormElement));
    void upsert({ id: crypto.randomUUID(), name: String(data.name), color: String(data.color), x: 30, y: 30, size: 50, portraitUrl: null, marker: null }).then(refresh);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-combat-token]').forEach((button, index) => button.addEventListener('click', () => {
    const participant = combat.participants.find((item) => item.id === button.dataset.combatToken)!;
    void upsert({ id: `combat-${participant.id}`, name: participant.name, x: 30 + index * 18, y: 30 + index * 18, size: 50, color: participant.role === 'player' ? '#4a90e2' : participant.role === 'ally' ? '#2ecc71' : '#d9534f', portraitUrl: participant.portrait ? `/portraits/${participant.portrait}` : null, marker: participant.token_number }).then(refresh);
  }));
  bindTokenDragging(state.tokens, refresh);
}

function tokenHtml(token: MapToken): string {
  return `<button class="map-token" data-token="${token.id}" style="left:${token.x}px;top:${token.y}px;width:${token.size}px;height:${token.size}px;background:${escapeHtml(token.color)}${token.portraitUrl ? ` url('${escapeHtml(token.portraitUrl)}') center/cover` : ''}" title="${escapeHtml(token.name)}"><span>${token.marker ?? ''}</span><small>${escapeHtml(token.name)}</small></button>`;
}

function upsert(token: MapToken): Promise<BattlemapState> {
  return api('/api/battlemap/tokens', { method: 'PUT', body: JSON.stringify(token) });
}

function bindTokenDragging(tokens: MapToken[], refresh: () => Promise<void>): void {
  document.querySelectorAll<HTMLElement>('[data-token]').forEach((element) => {
    element.addEventListener('pointerdown', (event) => {
      event.preventDefault(); element.setPointerCapture(event.pointerId);
      const token = tokens.find((item) => item.id === element.dataset.token)!;
      const start = { x: event.clientX, y: event.clientY, left: token.x, top: token.y };
      const move = (moveEvent: PointerEvent) => { element.style.left = `${Math.max(0, start.left + moveEvent.clientX - start.x)}px`; element.style.top = `${Math.max(0, start.top + moveEvent.clientY - start.y)}px`; };
      element.addEventListener('pointermove', move);
      element.addEventListener('pointerup', () => {
        element.removeEventListener('pointermove', move);
        void upsert({ ...token, x: Number.parseFloat(element.style.left), y: Number.parseFloat(element.style.top) }).then(refresh);
      }, { once: true });
    });
    element.addEventListener('dblclick', () => void api(`/api/battlemap/tokens/${encodeURIComponent(element.dataset.token!)}`, { method: 'DELETE' }).then(refresh));
  });
}
