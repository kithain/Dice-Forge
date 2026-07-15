(() => {
  const content = document.querySelector('.page, .container');
  if (!content) return;

  const storageKey = 'dice-forge-reading-zoom';
  const levels = [80, 90, 100, 110, 120, 130, 140, 150, 160];
  const fallbackLevel = 100;

  const readLevel = () => {
    const saved = Number.parseInt(localStorage.getItem(storageKey) || '', 10);
    return levels.includes(saved) ? saved : fallbackLevel;
  };

  let level = readLevel();

  const controls = document.createElement('div');
  controls.className = 'reading-zoom-controls';
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', 'Zoom de lecture');
  controls.innerHTML = `
    <button type="button" data-zoom="out" aria-label="Réduire le texte" title="Réduire le texte">A−</button>
    <button type="button" data-zoom="reset" class="reading-zoom-value" aria-label="Rétablir le zoom à 100 %" title="Rétablir à 100 %">100 %</button>
    <button type="button" data-zoom="in" aria-label="Agrandir le texte" title="Agrandir le texte">A+</button>
  `;

  const style = document.createElement('style');
  style.textContent = `
    .reading-zoom-controls {
      position: fixed;
      z-index: 10000;
      left: 18px;
      bottom: 18px;
      display: flex;
      align-items: center;
      overflow: hidden;
      border: 1px solid rgba(128, 128, 128, .55);
      border-radius: 999px;
      background: rgba(24, 24, 29, .94);
      box-shadow: 0 4px 18px rgba(0, 0, 0, .28);
      color: #fff;
      font: 600 14px/1 system-ui, sans-serif;
    }
    .reading-zoom-controls button {
      min-width: 42px;
      min-height: 40px;
      margin: 0;
      border: 0;
      border-right: 1px solid rgba(255, 255, 255, .16);
      padding: 0 12px;
      background: transparent;
      color: inherit;
      font: inherit;
      cursor: pointer;
    }
    .reading-zoom-controls button:last-child { border-right: 0; }
    .reading-zoom-controls button:hover { background: rgba(255, 255, 255, .12); }
    .reading-zoom-controls button:focus-visible {
      outline: 2px solid #f1d28a;
      outline-offset: -3px;
    }
    .reading-zoom-controls button:disabled { opacity: .4; cursor: default; }
    .reading-zoom-controls .reading-zoom-value { min-width: 68px; font-variant-numeric: tabular-nums; }
    @media print {
      .reading-zoom-controls { display: none !important; }
      .reading-zoom-content { zoom: 1 !important; }
    }
  `;

  const value = controls.querySelector('.reading-zoom-value');
  const zoomOut = controls.querySelector('[data-zoom="out"]');
  const zoomIn = controls.querySelector('[data-zoom="in"]');

  const applyLevel = (nextLevel) => {
    level = nextLevel;
    content.style.zoom = String(level / 100);
    value.textContent = `${level} %`;
    zoomOut.disabled = level === levels[0];
    zoomIn.disabled = level === levels[levels.length - 1];
    localStorage.setItem(storageKey, String(level));
  };

  controls.addEventListener('click', (event) => {
    const action = event.target.closest('button')?.dataset.zoom;
    const currentIndex = levels.indexOf(level);
    if (action === 'out' && currentIndex > 0) applyLevel(levels[currentIndex - 1]);
    if (action === 'in' && currentIndex < levels.length - 1) applyLevel(levels[currentIndex + 1]);
    if (action === 'reset') applyLevel(fallbackLevel);
  });

  content.classList.add('reading-zoom-content');
  document.head.appendChild(style);
  document.body.appendChild(controls);
  applyLevel(level);
})();
