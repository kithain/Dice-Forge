import { AUTH_PLAYER_KEY, authClient } from './auth-common.js';

async function requireAuthentication() {
  try {
    const client = authClient();
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) throw error || new Error('Session absente');

    const playerName = localStorage.getItem(AUTH_PLAYER_KEY)
      || data.user.user_metadata?.player_name
      || data.user.email?.split('@')[0]
      || '';
    if (playerName) localStorage.setItem(AUTH_PLAYER_KEY, playerName);
    window.diceForgeAuth = { client, user: data.user, playerName };
    document.documentElement.classList.remove('auth-pending');
    window.dispatchEvent(new CustomEvent('diceforge:auth-ready', {
      detail: { user: data.user, playerName }
    }));
  } catch {
    const target = `${location.pathname}${location.search}${location.hash}`;
    location.replace(`login.html?return=${encodeURIComponent(target)}`);
  }
}

requireAuthentication();
