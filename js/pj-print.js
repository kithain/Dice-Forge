import { loadPrintSnapshot } from './pj-pdf-data.js?v=20261003-pdf';
import { spellScore } from './pj-magic.js?v=20261003-learning';

const STAT_LABELS = [['FOR', 'force'], ['CON', 'constitution'], ['TAI', 'taille'],
  ['INT', 'intelligence'], ['POU', 'pouvoir'], ['DEX', 'dexterite'], ['CHA', 'apparence']];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function text(value, fallback = '—') {
  return escapeHtml(String(value ?? '').trim() || fallback);
}

function box(label, value) {
  return `<div class="field"><span class="label">${escapeHtml(label)}</span><div class="value">${text(value)}</div></div>`;
}

function metric(label, value) {
  return `<div class="metric"><span class="label">${escapeHtml(label)}</span><strong>${text(value)}</strong></div>`;
}

function table(headers, rows, empty, className = '') {
  return `<table class="${className}"><thead><tr>${headers.map(h => `<th scope="col">${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${rows.length
    ? rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${headers.length}" class="empty-row">${escapeHtml(empty)}</td></tr>`}</tbody></table>`;
}

function heading(title, subtitle = '') {
  return `<header class="page-heading"><h2>${escapeHtml(title)}</h2>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}</header>`;
}

function inventorySection(label, rows, columns) {
  const meaningful = (Array.isArray(rows) ? rows : []).filter(row => columns.some(([, key]) => String(row?.[key] ?? '').trim()));
  if (!meaningful.length) return '';
  return `<section class="inventory-section"><h3>${escapeHtml(label)}</h3>${table(columns.map(([label]) => label),
    meaningful.map(row => columns.map(([, key]) => text(row[key]))), '', columns.length > 2 ? 'inventory-table detailed' : 'inventory-table')}</section>`;
}

function renderPrintSheet(data) {
  const f = data.fields || {}, s = data.stats || {}, d = data.derived || {}, budget = data.budget || {};
  const dead = data.lifecycle?.status === 'dead';
  const locked = dead || ['play', 'legacy_review'].includes(data.creation?.phase);
  const session = data.progression?.session;
  const stats = STAT_LABELS.map(([label, key]) => `<div class="stat"><b>${label}</b><strong>${text(s[key])}</strong><small>×5 : ${String(s[key] ?? '').trim() && Number.isFinite(Number(s[key])) ? text(Number(s[key]) * 5) : '—'}</small></div>`).join('');
  const budgetSummary = locked
    ? `<div class="budget">${metric('XP acquis', data.progression?.xp_points ?? 0)}${metric('Points des sorts appris', data.progression?.learning_points ?? 0)}${metric(session?.closed_at ? 'Session clôturée · XP restants' : 'XP de la session', session?.closed_at || dead ? 0 : session?.remaining ?? 0)}</div>`
    : `<div class="budget">${metric('Budget initial', budget.total)}${metric('Points attribués', budget.spent)}${metric('Points restants', budget.remaining)}</div>`;
  const spellNames = new Set((data.spells || []).filter(spell => spell.name).map(spell => spell.name));
  const printableGroups = (data.skillGroups || []).map(group => ({ ...group,
    skills: (group.skills || []).filter(skill => data.printVersion === 2 || group.name !== 'Magie & pouvoirs' || !spellNames.has(skill.name))
  })).filter(group => group.skills.length);
  const weight = group => group.skills.length + 2;
  const columns = [[], []], weights = [0, 0];
  printableGroups.map((group, index) => ({ group, index }))
    .sort((a, b) => weight(b.group) - weight(a.group)).forEach(entry => {
      const column = weights[0] <= weights[1] ? 0 : 1;
      columns[column].push(entry);
      weights[column] += weight(entry.group);
    });
  columns.forEach(column => column.sort((a, b) => a.index - b.index));
  if (columns[1].some(entry => entry.index === 0)) columns.reverse();
  const groupMarkup = group => {
    const skills = group.skills;
    return `<section class="skill-group"><h3>${text(group.name)}</h3>${table(
      ['Compétence', ...(locked ? [] : ['Base', 'Pts']), 'Score %', 'XP'],
      skills.map(skill => [text(skill.name), ...(locked ? [] : [text(skill.base, '0'), text(skill.points, '0')]),
        `<strong>${text(skill.score, '0')}</strong>`, `<span class="check-box">${skill.checked ? '×' : ''}</span>`]), '')}</section>`;
  };
  const skillGroups = columns.map(groups => `<div class="skill-column">${groups.map(({ group }) => groupMarkup(group)).join('')}</div>`).join('');
  const weapons = (data.weapons || []).filter(w => ['name', 'damage'].some(key => String(w[key] ?? '').trim()));
  const weaponRows = weapons.map(w => [text(w.name), text(({ mixed: 'Contact + jet', distance: 'Jet', contact: 'Contact' })[w.attackType]),
    text(w.contactScore), text(w.distanceScore), text(w.damage)]);
  const spellRows = (data.spells || []).filter(spell => spell.name).map(spell => [text(spell.name),
    `<strong>${text(spellScore(data, spell))} %</strong>`, `<span class="check-box">${spell.checked ? '×' : ''}</span>`]);
  const inventory = data.printInventory;
  const potions = inventory?.potions ?? inventory?.consumables?.find(row => row.type === 'alchemy-potions')?.entries ?? [];
  const date = new Date(data.generatedAt);
  const generatedDate = Number.isNaN(date.getTime()) ? '' : date.toLocaleString('fr-FR');
  const status = dead ? 'Personnage décédé' : locked ? 'Personnage en jeu' : 'Création en cours';
  const name = String(f.name || 'personnage').trim() || 'personnage';
  document.title = `${name} - fiche Dice Forge`;
  document.getElementById('print-context').textContent = `${name} · ${status}`;
  document.getElementById('print-sheet').innerHTML = `
    <article class="print-page">
      <header class="sheet-title"><div><p>Dice Forge / BRP · Fiche de jeu</p><h1>${text(f.name, 'Nom du personnage')}</h1></div><div class="sheet-meta"><strong>${escapeHtml(status)}</strong><br>${text(generatedDate, '')}</div></header>
      <section class="identity">${box('Joueur', f.player)}${box('Profession', f.profession)}${box('Espèce', f.race)}${box('Âge', f.age)}</section>
      <h2 class="section-title">Caractéristiques</h2><div class="stat-grid">${stats}</div>
      <div class="metric-grid">${metric('PV maximum', d.hp)}${metric('PP maximum', d.pp)}${metric('Mod. dégâts', d.damage)}${metric('Mouvement', f.movement)}${metric('Course %', d.course)}${metric('Pool XP / session', d.experience)}</div>
      <h2 class="section-title">Compétences</h2>${budgetSummary}
      <div class="skill-columns">${skillGroups}</div>
      <p class="sheet-note">XP : coche après une réussite utile. Une tentative de D100 &gt; score par cible et par session. 1 XP = +1 point, maximum 100 %. Le reliquat est perdu en fin de session.</p>
    </article>
    <article class="print-page">
      ${heading('Combat, sorts et pouvoirs', name)}
      <h3>Armes de la fiche</h3>${table(['Arme', 'Usage', 'Contact %', 'Jet %', 'Dégâts'], weaponRows, 'Aucune arme renseignée sur la fiche.')}
      <div class="armor-grid">${box('Armure portée', f.armorType)}${box('Points d’armure', f.armorPoints)}</div>
      <h3>Sorts connus</h3>${table(['Sort / pouvoir', 'Score', 'XP'], spellRows, 'Aucun sort renseigné.', 'spells-table')}
      <p class="sheet-note">Tous les sorts connus sont disponibles. Leur lancement dépend des PP et de leurs conditions. Un sort appris commence à 20 + 3D6 %, sans ajout d’INT et sans dépense d’XP.</p>
      ${f.powers ? `<h3>Notes de magie et pouvoirs</h3><div class="text-box">${text(f.powers)}</div>` : ''}
      ${f.equipment ? `<h3>Équipement et richesse notés sur la fiche</h3><div class="text-box">${text(f.equipment)}</div>` : ''}
      ${!inventory ? '<p class="sheet-note inventory-warning">Inventaire détaillé indisponible dans ce navigateur. Ouvrez l’onglet Inventaire du personnage, attendez son chargement puis recréez cet aperçu.</p>' : ''}
    </article>
    ${inventory ? `<article class="print-page">${heading('Inventaire du personnage', name)}
      <p class="sheet-note">Copie locale au moment de l’export. Vérifiez la sauvegarde en ligne de l’inventaire pour retrouver ces données sur un autre appareil.</p>
      <div class="budget">${metric('Or · po', inventory.wallet?.po ?? 0)}${metric('Argent · pa', inventory.wallet?.pa ?? 0)}${metric('Cuivre · pc', inventory.wallet?.pc ?? 0)}</div>
      ${inventorySection('Armes transportées et en stock', inventory.weapons, [['Arme', 'name'], ['Description', 'description'], ['Dégâts', 'damage'], ['Mains', 'hands'], ['Particularités', 'specials']])}
      ${inventorySection('Armures et protections', inventory.armors, [['Armure', 'name'], ['Description', 'description'], ['PA', 'protection'], ['Mobilité', 'mobility'], ['Discrétion', 'stealth'], ['Particularités', 'specials']])}
      ${inventorySection('Équipement', inventory.equipment, [['Objet', 'name'], ['Description', 'description']])}
      ${inventorySection('Consommables', (inventory.consumables || []).filter(row => row.type !== 'alchemy-potions'), [['Objet', 'name'], ['Description', 'description']])}
      ${inventorySection('Divers et richesse', inventory.miscellaneous, [['Objet', 'name'], ['Description', 'description']])}
      <h3>Potions</h3><p class="sheet-note">Maximum 4 doses transportées par personnage, sac compris. Les doses en stock sont distinctes.</p>
      ${table(['Préparation', 'Transport', 'Stock', 'Effet', 'Contrecoup'], (Array.isArray(potions) ? potions : []).map(p => [text(p.name), text(p.carried, '0'), text(p.stock, '0'), text(p.effect), text(p.backlash)]), 'Aucune potion renseignée.', 'potions-table')}
    </article>` : ''}
    <article class="print-page">${heading('Histoire, liens et notes', name)}
      <h3>Origine</h3><div class="text-box">${text(f.origin)}</div>
      <h3>Motivation personnelle</h3><div class="text-box">${text(f.motivation)}</div>
      <h3>Liens avec les PNJ</h3><div class="text-box">${text(f.npcLinks)}</div>
      <h3>Liens avec les factions</h3><div class="text-box">${text(f.factionLinks)}</div>
      <h3>Notes de jeu</h3><div class="text-box notes-box">${text(f.notes)}</div>
      <footer class="footer">Dice Forge · Règles de campagne · Copie du ${text(generatedDate, '')}</footer>
    </article>`;
}

const printButton = document.getElementById('print-pdf');
try {
  const data = loadPrintSnapshot(sessionStorage, localStorage);
  if (data) {
    renderPrintSheet(data);
    printButton.disabled = false;
  }
} catch {
  document.querySelector('.print-empty').textContent = 'La fiche à imprimer est illisible. Revenez à la fiche et recréez l’aperçu PDF.';
}
printButton.addEventListener('click', () => window.print());
document.getElementById('print-ink').addEventListener('change', event => {
  document.body.classList.toggle('ink-saving', event.target.checked);
});
