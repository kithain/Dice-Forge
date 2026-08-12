import type { DiceRoll } from '../shared/dice.js';
import type { SessionState } from '../shared/contracts.js';

const DEFAULT_OBS_DICE_RELAY_URL = 'http://127.0.0.1:8787';

function obsDiceRelayUrl(): string {
  const params = new URLSearchParams(window.location.search);
  return (params.get('obsRelay') || window.localStorage.getItem('diceforge.obsRelayUrl') || DEFAULT_OBS_DICE_RELAY_URL).replace(/\/+$/, '');
}

function rollValues(roll: DiceRoll): number[] {
  return roll.results.flatMap((result) => result.values);
}

function rollId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function publishRollToObsRelay(session: SessionState, roll: DiceRoll, source = 'dice_forge_v2'): Promise<void> {
  const room = session.room.trim().toUpperCase();
  const joueur = session.playerName.trim();
  const resultats = rollValues(roll);
  if (!room || !joueur || !resultats.length) return;

  try {
    await fetch(`${obsDiceRelayUrl()}/rooms/${encodeURIComponent(room)}/rolls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: rollId(),
        room,
        joueur,
        formule: roll.expression,
        resultats,
        total: roll.total,
        horodatage: new Date().toISOString(),
        source,
      }),
    });
  } catch (error) {
    console.warn('OBS dice relay unavailable.', error);
  }
}
