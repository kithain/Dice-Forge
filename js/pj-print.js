const PRINT_STORAGE_KEY = 'dice-forge.pj-print.v1';
const STAT_LABELS = [
  ['FOR', 'force'], ['CON', 'constitution'], ['TAI', 'taille'], ['INT', 'intelligence'],
  ['POU', 'pouvoir'], ['DEX', 'dexterite'], ['APP', 'apparence']
];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function text(value, fallback = '—') {
  const clean = String(value ?? '').trim();
  return escapeHtml(clean || fallback);
}

function box(label, value, className = '') {
  return `<div class="field ${className}"><span class="label">${escapeHtml(label)}</span><div class="value">${text(value)}</div></div>`;
}

function metric(label, value) {
  return `<div class="metric"><span class="label">${escapeHtml(label)}</span><div class="value">${text(value)}</div></div>`;
}

function renderPrintSheet(data) {
  const f = data.fields || {}, s = data.stats || {}, d = data.derived || {}, budget = data.budget || {};
  const stats = STAT_LABELS.map(([label, key]) => `<div class="stat"><b>${label}</b><strong>${text(s[key])}</strong><small>Jet ×5 : ${s[key] ? text(Number(s[key]) * 5) : '—'}</small></div>`).join('');
  const skillGroups = (data.skillGroups || []).map(group => `<section class="skill-group">
    <h3>${text(group.name)}</h3>
    <table><thead><tr><th>Compétence</th><th>Base</th><th>Pts</th><th>Final</th><th>✓</th></tr></thead><tbody>
      ${(group.skills || []).map(skill => `<tr><td>${text(skill.name)}</td><td class="num">${text(skill.base, '0')}</td><td class="num">${text(skill.points, '0')}</td><td class="num"><b>${text(skill.score, '0')}</b></td><td class="check">${skill.checked ? '✓' : ''}</td></tr>`).join('')}
    </tbody></table>
  </section>`).join('');
  const weapons = (data.weapons || []).filter(weapon => ['name', 'damage', 'range', 'pa'].some(key => String(weapon[key] || '').trim()));
  const weaponRows = weapons.length ? weapons.map(weapon => `<tr><td>${text(weapon.name)}</td><td>${weapon.attackType === 'distance' ? 'Distance' : weapon.attackType === 'contact' ? 'Contact' : '—'}</td><td>${text(weapon.score)}</td><td>${text(weapon.damage)}</td><td>${text(weapon.range)}</td><td>${text(weapon.pa)}</td></tr>`).join('') : '<tr><td colspan="6">Aucune arme renseignée</td></tr>';
  const generatedDate = data.generatedAt ? new Date(data.generatedAt).toLocaleString('fr-FR') : '';

  document.title = `${String(f.name || 'personnage').trim() || 'personnage'} - fiche PDF`;
  document.getElementById('print-sheet').innerHTML = `
    <header class="sheet-title"><div><p>Dice Forge · BRP médiéval-fantastique</p><h1>${text(f.name, 'Nom du personnage')}</h1></div><div class="sheet-meta">Fiche préparée pour PDF<br>${text(generatedDate, '')}</div></header>
    <section class="identity">${box('Nom du personnage', f.name, 'wide')}${box('Joueur', f.player)}${box('Profession', f.profession)}${box('Race', f.race)}</section>
    <div class="top-grids">
      <section><h2 class="section-title">Caractéristiques</h2><div class="stat-grid">${stats}</div></section>
      <section><h2 class="section-title">Attributs dérivés</h2><div class="metric-grid">${metric('Points de vie', d.hp)}${metric('Points de pouvoir', d.pp)}${metric('Bonus aux dégâts', d.damage)}${metric("Bonus d’expérience", d.experience)}${metric('Mouvement', f.movement)}</div></section>
    </div>
    <h2 class="section-title">Compétences</h2>
    <div class="budget">${metric('Professionnels', budget.professional)}${metric('Personnels', budget.personal)}${metric('Disponibles', budget.total)}${metric('Répartis', budget.spent)}${metric('Restants', budget.remaining)}</div>
    <div class="skill-columns">${skillGroups}</div>
    <div class="page-break">
      <h2 class="section-title">Armes</h2>
      <table><thead><tr><th>Arme</th><th>Type</th><th>%</th><th>Dégâts</th><th>Portée</th><th>PA</th></tr></thead><tbody>${weaponRows}</tbody></table>
      <div class="two-columns">
        <section><h2 class="section-title">Armure</h2>${box('Type', f.armorType)}${box("Points d’armure", f.armorPoints)}</section>
        <section><h2 class="section-title">Sorts / pouvoirs</h2><div class="text-box">${text(f.powers)}</div></section>
      </div>
      <h2 class="section-title">Équipement et richesse</h2><div class="text-box">${text(f.equipment)}</div>
      <h2 class="section-title">Histoire et liens</h2>
      <div class="history"><div>${box('Origine', f.origin)}</div><div>${box('Motivation personnelle', f.motivation)}</div><div class="text-box"><span class="label">Liens avec les PNJ</span>${text(f.npcLinks)}</div><div class="text-box"><span class="label">Liens avec les factions</span>${text(f.factionLinks)}</div></div>
      <h2 class="section-title">Notes de jeu</h2><div class="text-box">${text(f.notes)}</div>
      <footer class="footer">Fiche générée depuis le fichier Markdown Dice Forge.</footer>
    </div>`;
}

try {
  const data = JSON.parse(localStorage.getItem(PRINT_STORAGE_KEY));
  if (data) renderPrintSheet(data);
} catch (error) {
  document.querySelector('.print-empty').textContent = 'La fiche à imprimer est illisible. Revenez à la fiche et recréez l’aperçu PDF.';
}

document.getElementById('print-pdf').addEventListener('click', () => window.print());
