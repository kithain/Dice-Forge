(() => {
  const content = document.querySelector('[data-aid-content]');
  if (!content) return;
  content.querySelectorAll('table').forEach(table => {
    if (!table.tHead && table.tBodies[0]) {
      const rows = [...table.tBodies[0].rows];
      const headerRows = [];
      for (const row of rows) {
        if (![...row.cells].every(cell => cell.tagName === 'TH')) break;
        headerRows.push(row);
      }
      if (headerRows.length) {
        const header = table.createTHead();
        headerRows.forEach(row => header.append(row));
      }
    }
    if (table.closest('.table-wrap,.alchemy-table,.help-table-wrap') || table.classList.contains('resistance-table')) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'aid-table-scroll';
    wrapper.tabIndex = 0;
    wrapper.setAttribute('role', 'region');
    wrapper.setAttribute('aria-label', table.caption?.textContent || 'Tableau : défilement horizontal si nécessaire');
    table.before(wrapper);
    wrapper.append(table);
  });
  const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const headings = [...content.querySelectorAll('h1,h2,h3')];
  const entries = headings.map((heading, index) => {
    if (!heading.id) {
      let id = `aide-rubrique-${index + 1}`;
      while (document.getElementById(id)) id += '-section';
      heading.id = id;
    }
    const parts = [];
    // Include the body of this heading for searches such as "100", "PP" or "défense".
    let next = heading.nextElementSibling;
    while (next && !/^H[123]$/.test(next.tagName)) {
      parts.push(next.textContent);
      next = next.nextElementSibling;
    }
    return { heading, title: heading.textContent.trim(), body: parts.join(' ') };
  });
  const controls = document.createElement('div');
  controls.className = 'aid-controls';
  controls.innerHTML = `
    <div class="aid-controls-row">
      <a class="aid-home" href="aides-jeu.html">Dice Forge <span>/ Aides de jeu</span></a>
      <div class="aid-actions"><label><input type="checkbox" id="aid-ink" checked> Économie d’encre</label>
        <button type="button" id="aid-print">Imprimer / PDF</button></div>
    </div>
    <div class="aid-controls-row aid-reading-tools">
      <details class="aid-outline"><summary>Sommaire de cette aide</summary><nav aria-label="Rubriques de cette aide"></nav></details>
      <div class="aid-search"><label for="aid-query">Rechercher dans cette aide</label>
        <input id="aid-query" type="search" placeholder="Un sort, une règle, un équipement…" autocomplete="off">
        <div class="aid-search-results" hidden><p role="status" aria-live="polite"></p><ol></ol></div>
      </div>
    </div>
    <p class="aid-print-tip">PDF : A4, échelle 100 %, sans en-têtes du navigateur. Les précisions repliées sont incluses à l’impression.</p>`;
  document.body.prepend(controls);
  document.body.classList.add('game-aid', 'aid-ink-saving');
  const outline = controls.querySelector('.aid-outline');
  const toc = outline.querySelector('nav');
  const linkFor = entry => {
    const link = document.createElement('a');
    link.href = `#${entry.heading.id}`;
    link.textContent = entry.title;
    link.addEventListener('click', () => {
      for (let ancestor = entry.heading.parentElement; ancestor; ancestor = ancestor.parentElement) {
        if (ancestor.tagName === 'DETAILS') ancestor.open = true;
      }
      outline.open = false;
      controls.querySelector('.aid-search-results').hidden = true;
      entry.heading.tabIndex = -1;
      entry.heading.focus({ preventScroll: true });
    });
    return link;
  };
  entries.filter(entry => entry.heading.tagName !== 'H3').forEach(entry => toc.append(linkFor(entry)));
  const query = controls.querySelector('#aid-query');
  const results = controls.querySelector('.aid-search-results');
  const list = results.querySelector('ol');
  let searchTimer;
  function search() {
    const words = normalize(query.value.trim()).split(/\s+/).filter(Boolean);
    results.hidden = !words.length;
    list.replaceChildren();
    if (!words.length) return;
    const matches = entries.filter(entry => words.every(word => normalize(`${entry.title} ${entry.body}`).includes(word)));
    results.querySelector('[role="status"]').textContent = `${matches.length} rubrique${matches.length === 1 ? '' : 's'} trouvée${matches.length === 1 ? '' : 's'}${matches.length > 30 ? ' · 30 premières affichées, précisez votre recherche' : ''}`;
    matches.slice(0, 30).forEach(entry => {
      const item = document.createElement('li');
      item.append(linkFor(entry));
      list.append(item);
    });
  }
  query.addEventListener('input', () => {
    clearTimeout(searchTimer);
    if (!query.value.trim()) search();
    else searchTimer = setTimeout(search, 120);
  });
  query.addEventListener('keydown', event => {
    if (event.key === 'Escape') results.hidden = true;
    if (event.key === 'Enter') { search(); list.querySelector('a')?.click(); }
  });
  document.addEventListener('click', event => { if (!controls.contains(event.target)) { results.hidden = true; outline.open = false; } });
  query.addEventListener('focus', () => { if (query.value.trim()) search(); });
  controls.querySelector('#aid-ink').addEventListener('change', event => document.body.classList.toggle('aid-ink-saving', event.target.checked));
  let closedDetails = [];
  let printing = false;
  function preparePrint() {
    if (printing) return;
    printing = true;
    closedDetails = [...content.querySelectorAll('details:not([open])')];
    closedDetails.forEach(details => { details.open = true; });
  }
  function finishPrint() {
    closedDetails.forEach(details => { details.open = false; });
    closedDetails = [];
    printing = false;
  }
  window.addEventListener('beforeprint', preparePrint);
  window.addEventListener('afterprint', finishPrint);
  window.diceForgePrint = () => window.print();
  controls.querySelector('#aid-print').addEventListener('click', window.diceForgePrint);
})();
