(() => {
  if (document.querySelector('.site-menu-root')) return;

  const pages = [
    ['index.html', '⚒', 'Dice Forge'],
    ['index.html#fiche-personnage', '♙', 'Fiche personnage'],
    ['livret_joueur.html', '▤', 'Livret joueur'],
    ['inventaire.html', '⌘', 'Équipement'],
    ['ecran_joueur_BRP_ORC.html', '◈', 'Écran joueur'],
    ['ecran_MJ_BRP_ORC.html', '♜', 'Écran MJ'],
    ['BRP_ORC_traduction_FR_complete.html', '☷', 'Règles BRP complètes'],
    ['help.html', '?', 'Aide']
  ];
  const currentPage = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const currentHash = location.hash.toLowerCase();
  const localLinks = currentPage === 'ecran_joueur_brp_orc.html'
    ? [['#jets', 'Jets'], ['#magie', 'Magie']]
    : currentPage === 'ecran_mj_brp_orc.html'
      ? [['#resolution', 'Résolution'], ['#combat', 'Combat']]
      : [];

  const root = document.createElement('div');
  root.className = 'site-menu-root';
  root.innerHTML = `
    <button class="site-menu-toggle" type="button" aria-label="Ouvrir le menu" aria-expanded="false" aria-controls="site-menu-panel"><span class="site-menu-icon" aria-hidden="true"></span></button>
    <button class="site-menu-backdrop" type="button" tabindex="-1" aria-label="Fermer le menu"></button>
    <aside class="site-menu-panel" id="site-menu-panel" aria-label="Menu principal" aria-hidden="true">
      <div class="site-menu-head"><strong class="site-menu-brand">Dice Forge</strong></div>
      <button class="site-menu-close" type="button">Fermer</button>
      <p class="site-menu-label">Navigation</p>
      <nav class="site-menu-links"></nav>
      <div class="site-menu-local"></div>
    </aside>`;

  const links = root.querySelector('.site-menu-links');
  pages.forEach(([href, glyph, label]) => {
    const link = document.createElement('a');
    link.href = href;
    link.innerHTML = `<span class="site-menu-glyph" aria-hidden="true">${glyph}</span><span>${label}</span>`;
    const normalizedHref = href.toLowerCase();
    const isCurrent = normalizedHref.includes('#')
      ? `${currentPage}${currentHash}` === normalizedHref || currentPage === 'pj.html'
      : currentPage === normalizedHref && !currentHash;
    if (isCurrent) link.setAttribute('aria-current', 'page');
    links.appendChild(link);
  });

  if (localLinks.length) {
    const local = root.querySelector('.site-menu-local');
    local.innerHTML = '<div class="site-menu-separator"></div><p class="site-menu-label">Sur cette page</p><div class="site-menu-links site-menu-local-links"></div>';
    const localList = local.querySelector('.site-menu-local-links');
    localLinks.forEach(([href, label]) => {
      const link = document.createElement('a');
      link.href = href;
      link.innerHTML = `<span class="site-menu-glyph" aria-hidden="true">#</span><span>${label}</span>`;
      localList.appendChild(link);
    });
    const print = document.createElement('button');
    print.className = 'site-menu-action';
    print.type = 'button';
    print.innerHTML = '<span class="site-menu-glyph" aria-hidden="true">⎙</span><span>Imprimer</span>';
    print.addEventListener('click', () => window.print());
    localList.appendChild(print);
  }

  document.body.appendChild(root);
  document.body.classList.add('site-menu-enhanced');
  const toggle = root.querySelector('.site-menu-toggle');
  const panel = root.querySelector('.site-menu-panel');
  const closeButton = root.querySelector('.site-menu-close');
  const backdrop = root.querySelector('.site-menu-backdrop');
  let previouslyFocused = null;

  const setOpen = (open) => {
    root.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
    panel.setAttribute('aria-hidden', String(!open));
    if (open) {
      previouslyFocused = document.activeElement;
      closeButton.focus();
    } else if (previouslyFocused && document.contains(previouslyFocused)) {
      previouslyFocused.focus();
    }
  };
  toggle.addEventListener('click', () => setOpen(!root.classList.contains('is-open')));
  closeButton.addEventListener('click', () => setOpen(false));
  backdrop.addEventListener('click', () => setOpen(false));
  root.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => setOpen(false)));
  document.addEventListener('keydown', (event) => {
    if (!root.classList.contains('is-open')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...panel.querySelectorAll('a, button:not([disabled])')];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
})();
