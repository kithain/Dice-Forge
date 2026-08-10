(() => {
    const roomInput = document.getElementById('active-room');
    const clearButton = document.getElementById('clear-room');
    const inviteLink = document.getElementById('player-invite');
    const copyInvite = document.getElementById('copy-invite');
    const toast = document.getElementById('toast');
    const ROOM_KEY = 'diceforge_cockpit_room';
    const PLAYER_URL = 'https://kithain.github.io/Dice-Forge/index.html';
    let toastTimer;

    function normalizeRoom(value) {
        return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    }

    function roomUrl(path, absolute = false) {
        const url = new URL(path, absolute ? window.location.origin : window.location.href);
        const room = normalizeRoom(roomInput.value);
        if (room) url.searchParams.set('room', room);
        return absolute ? url.href : `${url.pathname}${url.search}`;
    }

    function showToast(message) {
        toast.textContent = message;
        toast.classList.add('visible');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove('visible'), 2200);
    }

    function updateLinks() {
        const room = normalizeRoom(roomInput.value);
        roomInput.value = room;
        if (room) localStorage.setItem(ROOM_KEY, room);
        else localStorage.removeItem(ROOM_KEY);

        document.querySelectorAll('[data-room-link]').forEach((link) => {
            const base = link.getAttribute('href').split('?')[0];
            link.href = roomUrl(base);
        });
        const invite = new URL(PLAYER_URL);
        if (room) invite.searchParams.set('room', room);
        inviteLink.href = invite.href;
        copyInvite.disabled = !room;
    }

    async function copyUrl(path) {
        try {
            await navigator.clipboard.writeText(roomUrl(path, true));
            showToast('URL copiée dans le presse-papiers.');
        } catch {
            showToast('Copie impossible : sélectionne l’URL dans le navigateur.');
        }
    }

    let initialRoom = localStorage.getItem(ROOM_KEY) || '';
    try {
        const diceRoom = JSON.parse(localStorage.getItem('diceforge_room') || 'null');
        if (!initialRoom && diceRoom?.code) initialRoom = diceRoom.code;
    } catch {}
    roomInput.value = normalizeRoom(initialRoom);
    updateLinks();

    roomInput.addEventListener('input', updateLinks);
    clearButton.addEventListener('click', () => {
        roomInput.value = '';
        updateLinks();
        roomInput.focus();
    });
    document.querySelectorAll('[data-copy-link]').forEach((button) => {
        button.addEventListener('click', () => copyUrl(button.dataset.copyLink));
    });
    copyInvite.addEventListener('click', async () => {
        if (!roomInput.value) return;
        try {
            await navigator.clipboard.writeText(inviteLink.href);
            showToast('Invitation joueur copiée.');
        } catch {
            showToast('Copie impossible : ouvre le lien puis copie son adresse.');
        }
    });
})();
