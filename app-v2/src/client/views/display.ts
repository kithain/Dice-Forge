import type { BattlemapState } from '../../shared/battlemap.js';
import type { CombatState } from '../../shared/combat.js';
import type { AnimatedDie } from '../dice-animation.js';
import type { RollRecord } from '../cloud.js';
import { api, escapeHtml } from '../http.js';

let rollRefreshTimer: number | undefined;

const ROLL_OVERLAY_PATHS = ['/overlays/dice', '/overlays/history', '/overlays/rolls'];

export async function renderDisplay(workspace: HTMLElement, pathname: string): Promise<void> {
  document.body.classList.add('display-mode');
  if (!ROLL_OVERLAY_PATHS.includes(pathname) && rollRefreshTimer !== undefined) {
    window.clearInterval(rollRefreshTimer);
    rollRefreshTimer = undefined;
  }
  if (pathname === '/overlays/map') return renderMap(workspace);
  if (pathname === '/overlays/dice') return renderDiceOverlay(workspace);
  if (pathname === '/overlays/history' || pathname === '/overlays/rolls') return renderRollHistory(workspace);
  const combat = await api<CombatState>('/api/combat');
  if (pathname === '/portrait_view') return renderPortrait(workspace, combat);
  renderPlayers(workspace, combat);
}

async function renderMap(workspace: HTMLElement): Promise<void> {
  const state = await api<BattlemapState>('/api/battlemap');
  workspace.innerHTML = `<div class="display-map" ${state.map ? `style="background-image:url('${escapeHtml(state.map)}?t=${Date.now()}')"` : ''}>${state.tokens.map((token) => `<div class="map-token display-token" style="left:${token.x}px;top:${token.y}px;width:${token.size}px;height:${token.size}px;background:${escapeHtml(token.color)}${token.portraitUrl ? ` url('${escapeHtml(token.portraitUrl)}') center/cover` : ''}"><span>${token.marker ?? ''}</span><small>${escapeHtml(token.name)}</small></div>`).join('')}</div>`;
}

function renderPlayers(workspace: HTMLElement, combat: CombatState): void {
  const activeId = combat.participants[combat.current_turn_index]?.id;
  workspace.innerHTML = `<div class="player-display"><header><span>Round ${combat.round_number}</span><strong>Initiative</strong></header>${combat.participants.filter((participant) => participant.role === 'player').map((participant) => `<article class="player-card ${participant.id === activeId ? 'active' : ''}"><div class="player-avatar">${participant.portrait ? `<img src="/portraits/${escapeHtml(participant.portrait)}">` : participant.token_number}</div><div><h2>${escapeHtml(participant.name)}</h2><p>${participant.statuses.map((status) => escapeHtml(status.name)).join(' · ') || 'Prêt'}</p></div><strong>${participant.hp}<small> / ${participant.hp_max} PV</small></strong></article>`).join('')}</div>`;
}

function renderPortrait(workspace: HTMLElement, combat: CombatState): void {
  const participant = combat.participants[combat.current_turn_index];
  workspace.innerHTML = participant ? `<div class="portrait-display">${participant.portrait ? `<img src="/portraits/${escapeHtml(participant.portrait)}">` : ''}<div><p>Tour actif · Round ${combat.round_number}</p><h1>${escapeHtml(participant.name)}</h1><strong>${participant.hp} / ${participant.hp_max} PV</strong><span>${participant.statuses.map((status) => escapeHtml(status.name)).join(' · ')}</span></div></div>` : '<p class="empty-state">Aucun combattant actif.</p>';
}

function resetRollRefresh(): void {
  if (rollRefreshTimer !== undefined) {
    window.clearInterval(rollRefreshTimer);
    rollRefreshTimer = undefined;
  }
}

function overlayRoom(): string {
  return (new URLSearchParams(location.search).get('room') || '').trim().toUpperCase();
}

function historyLimit(): number {
  const requested = Number(new URLSearchParams(location.search).get('limit'));
  return Number.isInteger(requested) ? Math.max(1, Math.min(10, requested)) : 5;
}

async function renderDiceOverlay(workspace: HTMLElement): Promise<void> {
  resetRollRefresh();
  const room = overlayRoom();
  const { cloud } = await import('../cloud.js');
  const rolls = room ? await cloud.publicRolls(room) : [];
  workspace.innerHTML = `<div class="obs-roll-stage"><div class="dice-animation obs-dice-animation" id="obs-dice-animation" hidden aria-label="Animation du lancer OBS"></div></div>${room ? '' : '<p class="obs-overlay-setup">Ajoutez <code>?room=CODE</code> à l’adresse OBS.</p>'}`;
  if (!room) return;

  const animation = workspace.querySelector<HTMLElement>('#obs-dice-animation')!;
  let lastSeen = rolls[0]?.id ?? 0;
  let refreshing = false;
  rollRefreshTimer = window.setInterval(() => {
    if (refreshing) return;
    refreshing = true;
    void cloud.publicRolls(room).then(async (latest) => {
      const unseen = latest.filter((roll) => roll.id > lastSeen).reverse();
      for (const roll of unseen) {
        const dice = diceFromRoll(roll);
        if (!dice.length) continue;
        try {
          const { animateDice } = await import('../dice-animation.js');
          await animateDice(animation, dice);
        } catch (error) {
          console.error('Impossible d’afficher l’animation OBS.', error);
        }
      }
      if (latest[0]) lastSeen = Math.max(lastSeen, latest[0].id);
    }).catch(() => undefined).finally(() => { refreshing = false; });
  }, 500);
}

async function renderRollHistory(workspace: HTMLElement): Promise<void> {
  resetRollRefresh();
  const room = overlayRoom();
  const { cloud } = await import('../cloud.js');
  const rolls = room ? await cloud.publicRolls(room) : [];
  workspace.innerHTML = '<div class="roll-overlay roll-history-overlay" id="roll-overlay"></div>';
  const list = workspace.querySelector<HTMLElement>('#roll-overlay')!;
  renderRollList(list, rolls, room);
  if (!room) return;

  let refreshing = false;
  rollRefreshTimer = window.setInterval(() => {
    if (refreshing) return;
    refreshing = true;
    void cloud.publicRolls(room).then((latest) => renderRollList(list, latest, room))
      .catch(() => undefined).finally(() => { refreshing = false; });
  }, 1000);
}

function diceFromRoll(roll: RollRecord): AnimatedDie[] {
  const dice: AnimatedDie[] = [];
  for (const match of roll.rolls_detail.matchAll(/D(\d+)\[([^\]]+)]/gi)) {
    const sides = Number(match[1]);
    for (const rawValue of match[2]!.split(',')) {
      const value = Number(rawValue.trim());
      if (Number.isInteger(sides) && sides >= 2 && Number.isInteger(value)) dice.push({ sides, value });
    }
  }
  return dice;
}

function renderRollList(target: HTMLElement, rolls: RollRecord[], room: string): void {
  target.innerHTML = rolls.slice(0, historyLimit()).map((roll) => `<article><div class="roll-history-detail"><strong>${escapeHtml(roll.player_name)}</strong><span>${escapeHtml(roll.expression)}</span><small>${escapeHtml(roll.rolls_detail)}</small></div><b>${roll.total}</b></article>`).join('')
    || `<p>${room ? 'En attente de jets publics…' : 'Ajoutez ?room=CODE à l’adresse OBS.'}</p>`;
}
