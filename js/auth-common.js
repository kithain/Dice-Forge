import { getSupabaseClient } from './supabase-client.js';

export const AUTH_PLAYER_KEY = 'diceforge_player_name';

export function authClient() {
  return getSupabaseClient();
}

export function playerEmail(playerName) {
  const slug = String(playerName || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');
  if (!slug) throw new Error('Entre un nom de joueur valide.');
  return `${slug}@diceforge.app`;
}

export function safeReturnUrl(value) {
  if (!value) return 'index.html';
  try {
    const url = new URL(value, window.location.href);
    return url.origin === window.location.origin ? `${url.pathname}${url.search}${url.hash}` : 'index.html';
  } catch {
    return 'index.html';
  }
}
