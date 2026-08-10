import { AUTH_PLAYER_KEY, authClient } from './auth-common.js';

const client = authClient();
const playerName = localStorage.getItem(AUTH_PLAYER_KEY) || 'Joueur';
document.getElementById('account-player').textContent = playerName;

document.getElementById('password-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const password = document.getElementById('new-password').value;
  const confirmation = document.getElementById('confirm-password').value;
  const message = document.getElementById('account-message');
  message.className = 'login-message';
  if (password.length < 8) {
    message.textContent = 'Le mot de passe doit contenir au moins 8 caract\u00e8res.';
    message.classList.add('error');
    return;
  }
  if (password !== confirmation) {
    message.textContent = 'Les deux mots de passe ne correspondent pas.';
    message.classList.add('error');
    return;
  }
  const { error } = await client.auth.updateUser({ password });
  if (error) {
    message.textContent = error.message;
    message.classList.add('error');
    return;
  }
  event.target.reset();
  message.textContent = 'Mot de passe modifi\u00e9.';
  message.classList.add('success');
});

document.getElementById('logout-button').addEventListener('click', async () => {
  await client.auth.signOut();
  localStorage.removeItem(AUTH_PLAYER_KEY);
  localStorage.removeItem('diceforge_room');
  location.replace('login.html');
});
