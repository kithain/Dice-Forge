(() => {
    const display = document.getElementById('timer-display');
    const stateLabel = document.getElementById('timer-state');
    const preview = document.querySelector('.timer-preview');
    const toggle = document.getElementById('timer-toggle');
    const reset = document.getElementById('timer-reset');
    const obsUrl = document.getElementById('obs-url');
    const copyButton = document.getElementById('copy-obs-url');
    const toast = document.getElementById('timer-toast');
    let state = { duration_ms: 300000, remaining_ms: 300000, running: false };
    let localDeadline = null;
    let toastTimeout;

    function format(ms) {
        const seconds = Math.max(0, Math.ceil(ms / 1000));
        return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    }

    function render() {
        const remaining = state.running && localDeadline ? Math.max(0, localDeadline - Date.now()) : state.remaining_ms;
        display.textContent = format(remaining);
        preview.classList.toggle('urgent', remaining > 0 && remaining <= 10000);
        const ready = !state.running && remaining === state.duration_ms;
        stateLabel.textContent = remaining <= 0 ? 'Temps écoulé' : state.running ? 'En cours' : ready ? 'Prêt' : 'En pause';
        toggle.textContent = state.running ? 'Pause' : ready || remaining <= 0 ? 'Démarrer' : 'Reprendre';
        requestAnimationFrame(render);
    }

    async function sync() {
        try {
            const response = await fetch('/api/timer', { cache: 'no-store' });
            if (!response.ok) throw new Error('timer unavailable');
            state = await response.json();
            localDeadline = state.running ? Date.now() + state.remaining_ms : null;
        } catch {
            stateLabel.textContent = 'Connexion interrompue';
        }
    }

    async function command(payload) {
        const response = await fetch('/api/timer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!response.ok) return;
        state = await response.json();
        localDeadline = state.running ? Date.now() + state.remaining_ms : null;
    }

    document.querySelectorAll('[data-seconds]').forEach((button) => {
        button.addEventListener('click', () => command({ action: 'preset', seconds: Number(button.dataset.seconds) }));
    });
    toggle.addEventListener('click', () => command({ action: 'toggle' }));
    reset.addEventListener('click', () => command({ action: 'reset' }));

    obsUrl.textContent = new URL('/overlays/timer', window.location.origin).href;
    copyButton.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(obsUrl.textContent);
            toast.textContent = 'URL OBS copiée.';
        } catch {
            toast.textContent = 'Copie impossible. Sélectionne l’adresse.';
        }
        toast.classList.add('visible');
        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => toast.classList.remove('visible'), 2200);
    });

    sync();
    setInterval(sync, 1000);
    requestAnimationFrame(render);
})();
