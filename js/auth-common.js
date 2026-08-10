import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const config = window.SUPABASE_CONFIG || {};

export const AUTH_PLAYER_KEY = 'diceforge_player_name';

export function authClient() {
  if (!config.url || !config.anonKey) {
    throw new Error('Supabase n\u2019est pas configur\u00e9.');
  }
  return createClient(config.url, config.anonKey);
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
