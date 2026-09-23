(() => {
    const timer = document.getElementById('overlay-timer');
    const display = document.getElementById('timer-display');
    let state = { duration_ms: 300000, remaining_ms: 300000, running: false };
    let localDeadline = null;

    if (new URLSearchParams(window.location.search).get('preview') === '1') {
        document.body.classList.add('preview');
    }

    function format(ms) {
        const seconds = Math.max(0, Math.ceil(ms / 1000));
        return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    }

    function render() {
        const remaining = state.running && localDeadline ? Math.max(0, localDeadline - Date.now()) : state.remaining_ms;
        display.textContent = format(remaining);
        timer.classList.toggle('urgent', remaining > 0 && remaining <= 10000);
        timer.classList.toggle('finished', remaining <= 0);
        requestAnimationFrame(render);
    }

    async function sync() {
        try {
            const response = await fetch('/api/timer', { cache: 'no-store' });
            if (!response.ok) return;
            state = await response.json();
            localDeadline = state.running ? Date.now() + state.remaining_ms : null;
        } catch {}
    }

    sync();
    setInterval(sync, 500);
    requestAnimationFrame(render);
})();
