import type { SessionState } from './contracts.js';

export const EMPTY_SESSION: SessionState = Object.freeze({
  room: '',
  playerName: '',
});

export function normalizeRoom(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

export function normalizePlayerName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 40);
}

export function normalizeSession(value: Partial<SessionState>): SessionState {
  return {
    room: normalizeRoom(value.room ?? ''),
    playerName: normalizePlayerName(value.playerName ?? ''),
  };
}
