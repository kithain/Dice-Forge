// ——— Toast / confirm modal system (replaces alert()/confirm()) ———

function getContainer() {
  let el = document.getElementById('toast-container');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast-container';
    el.className = 'toast-container';
    document.body.appendChild(el);
  }
  return el;
}

export function showToast(message, type = 'info', duration = 3500) {
  const container = getContainer();
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('leaving');
    setTimeout(() => toast.remove(), 200);
  }, duration);
}

export function showConfirm(message) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal-box">
        <div class="modal-msg">${message}</div>
        <div class="modal-actions">
          <button class="modal-btn" data-choice="cancel">Annuler</button>
          <button class="modal-btn danger" data-choice="ok">Confirmer</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);

    function close(result) {
      backdrop.remove();
      resolve(result);
    }
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close(false);
      const choice = e.target.dataset && e.target.dataset.choice;
      if (choice === 'ok') close(true);
      if (choice === 'cancel') close(false);
    });
  });
}
