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

export function showConfirm(message, { confirmLabel = 'Confirmer' } = {}) {
  return new Promise((resolve) => {
    // Une fiche intégrée doit utiliser le viewport de la page principale.
    let hostDocument = document;
    try { hostDocument = window.top.document; } catch { /* Cadre externe : fenêtre locale. */ }
    const previousFocus = hostDocument.activeElement;
    const backdrop = hostDocument.createElement('dialog');
    backdrop.className = 'modal-backdrop';
    Object.assign(backdrop.style, { margin: '0', width: '100%', maxWidth: 'none', height: '100%', maxHeight: 'none', border: '0', padding: '1rem', boxSizing: 'border-box' });
    backdrop.setAttribute('aria-label', 'Confirmation');
    backdrop.innerHTML = `
      <div class="modal-box">
        <div class="modal-msg" id="confirm-message"></div>
        <div class="modal-actions">
          <button type="button" class="modal-btn" data-choice="cancel" autofocus>Annuler</button>
          <button type="button" class="modal-btn danger" data-choice="ok"></button>
        </div>
      </div>`;
    backdrop.querySelector('.modal-msg').textContent = message;
    backdrop.querySelector('[data-choice="ok"]').textContent = confirmLabel;
    backdrop.setAttribute('aria-describedby', 'confirm-message');
    hostDocument.body.appendChild(backdrop);
    backdrop.showModal();
    backdrop.querySelector('[data-choice="cancel"]').focus();

    function close(result) {
      backdrop.close();
      backdrop.remove();
      previousFocus?.focus();
      resolve(result);
    }
    backdrop.addEventListener('cancel', (event) => { event.preventDefault(); close(false); });
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close(false);
      const choice = e.target.dataset && e.target.dataset.choice;
      if (choice === 'ok') close(true);
      if (choice === 'cancel') close(false);
    });
  });
}
