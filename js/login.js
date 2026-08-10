import { AUTH_PLAYER_KEY, authClient, playerEmail, safeReturnUrl } from './auth-common.js';

const form = document.getElementById('login-form');
const message = document.getElementById('login-message');
const submit = document.getElementById('login-submit');
const client = authClient();

function setMessage(text, type = '') {
  message.textContent = text;
  message.className = `login-message ${type}`;
}

const { data: existing } = await client.auth.getUser();
if (existing.user) {
  location.replace(safeReturnUrl(new URLSearchParams(location.search).get('return')));
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const playerName = document.getElementById('login-player').value.trim();
  const password = document.getElementById('login-password').value;
  submit.disabled = true;
  setMessage('Connexion en cours\u2026');
  try {
    const email = playerEmail(playerName);
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data.user) throw error || new Error('Connexion refus\u00e9e.');
    localStorage.setItem(AUTH_PLAYER_KEY, playerName);
    if (data.user.user_metadata?.player_name !== playerName) {
      await client.auth.updateUser({ data: { player_name: playerName } });
    }
    location.replace(safeReturnUrl(new URLSearchParams(location.search).get('return')));
  } catch (error) {
    setMessage(error?.message === 'Invalid login credentials'
      ? 'Nom de joueur ou mot de passe incorrect.'
      : (error?.message || 'Connexion impossible.'), 'error');
    submit.disabled = false;
  }
});
