import { createClient } from '@supabase/supabase-js';

const STORAGE_KEY = 'dice-forge.pj-markdown.v1';
const ROOM_STORAGE_KEY = 'diceforge_room';
const SUPABASE_URL = window.SUPABASE_CONFIG?.url || '';
const SUPABASE_ANON_KEY = window.SUPABASE_CONFIG?.anonKey || '';
const supabase = SUPABASE_URL && SUPABASE_ANON_KEY && !SUPABASE_URL.includes('VOTRE_PROJET')
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const STATS = [
  ['FOR', 'force'], ['CON', 'constitution'], ['TAI', 'taille'], ['INT', 'intelligence'],
  ['POU', 'pouvoir'], ['DEX', 'dexterite'], ['APP', 'apparence']
];

const SKILL_GROUPS = ['Combat', 'Physique', 'Social & mental', 'Connaissances', 'Pratique & divers'];
const SKILLS = [
  ['Estimation', '15 %', 'Pratique & divers'], ['Art (divers)', '05 %', 'Pratique & divers'], ['Artillerie (divers)', "Selon la spécialité d'arme", 'Combat'],
  ['Marchandage', '05 %', 'Social & mental'], ['Bagarre', '25 %', 'Combat'], ['Escalade', '40 %', 'Physique'], ['Commandement', '05 %', 'Social & mental'],
  ['Artisanat (divers)', '05 %', 'Pratique & divers'], ['Démolition', '01 %', 'Pratique & divers'], ['Déguisement', '01 %', 'Social & mental'], ['Esquive', 'DEX×2', 'Physique'],
  ['Conduite (divers)', '20 % ou 01 %', 'Physique'], ['Arme à énergie (divers)', "Selon la spécialité d'arme", 'Combat'],
  ['Étiquette (divers)', '05 %', 'Social & mental'], ['Baratin', '05 %', 'Social & mental'], ['Manipulation fine', '05 %', 'Pratique & divers'],
  ['Arme à feu (divers)', "Selon la spécialité d'arme", 'Combat'], ['Premiers secours', '30 %', 'Pratique & divers'],
  ['Vol', 'DEX×4 ou ½ DEX', 'Physique'], ['Jeux', 'INT+POU', 'Social & mental'], ['Lutte', '25 %', 'Combat'], ['Machine lourde (divers)', '01 %', 'Pratique & divers'],
  ['Arme lourde (divers)', "Selon la spécialité d'arme", 'Combat'], ['Se cacher', '10 %', 'Physique'], ['Intuition', '05 %', 'Social & mental'],
  ['Saut', '25 %', 'Physique'], ['Connaissance (divers)', '05 % ou 00 %', 'Connaissances'], ['Langue (divers)', 'INT (ou ÉDU)×5 ou 00 %', 'Connaissances'],
  ['Écouter', '25 %', 'Social & mental'], ['Alphabétisation (option)', '00 % ou égale à Langue', 'Connaissances'], ['Arts martiaux', '01 %', 'Combat'],
  ['Médecine', '05 %', 'Connaissances'], ['Arme de mêlée (divers)', "Selon la spécialité d'arme", 'Combat'],
  ['Arme de jet (divers)', "Selon la spécialité d'arme", 'Combat'], ['Navigation', '10 %', 'Pratique & divers'],
  ['Parade (divers)', "Selon la spécialité d'arme", 'Combat'], ['Représentation', '05 %', 'Social & mental'], ['Persuasion', '15 %', 'Social & mental'],
  ['Pilotage (divers)', '01 %', 'Physique'], ['Projection', 'DEX×2', 'Physique'], ['Psychothérapie', '01 % ou 00 %', 'Social & mental'],
  ['Réparation (divers)', '15 %', 'Pratique & divers'], ['Recherche', '25 %', 'Connaissances'], ['Équitation (divers)', '05 %', 'Physique'],
  ['Science (divers)', '01 %', 'Connaissances'], ['Sens', '10 %', 'Social & mental'], ['Bouclier', 'Selon le type de bouclier', 'Combat'],
  ['Tour de main', '05 %', 'Pratique & divers'], ['Observation', '25 %', 'Social & mental'], ['Statut', '15 % ou variable', 'Social & mental'], ['Discrétion', '10 %', 'Physique'],
  ['Stratégie', '01 %', 'Connaissances'], ['Nage', '25 %', 'Physique'], ['Enseignement', '10 %', 'Connaissances'],
  ['Compétence technique (divers)', '05 %', 'Connaissances'], ['Lancer', '25 %', 'Physique'], ['Pistage', '10 %', 'Pratique & divers']
];
const NON_MEDFAN_SKILLS = new Set([
  'Démolition',
  'Arme à énergie (divers)',
  'Arme à feu (divers)',
  'Machine lourde (divers)',
  'Arme lourde (divers)',
  'Psychothérapie',
  'Compétence technique (divers)'
]);
const ACTIVE_SKILLS = SKILLS
  .map((skill, index) => ({ skill, index }))
  .filter(({ skill }) => !NON_MEDFAN_SKILLS.has(skill[0]));

const form = document.getElementById('pj-form');
const statsBody = document.getElementById('pj-stats');
const skillsBody = document.getElementById('pj-skills');
const weaponsBody = document.getElementById('pj-weapons');
let saveTimer;

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
}

function renderBaseFields() {
  statsBody.innerHTML = STATS.map(([code, key]) => `<tr>
    <td class="pj-stats-code">${code}</td>
    <td><input type="number" min="0" max="999" data-stat="${key}" aria-label="Score ${code}"></td>
    <td class="pj-stat-roll" data-stat-roll="${key}">—</td>
  </tr>`).join('');

  skillsBody.innerHTML = SKILL_GROUPS.map(group => {
    const rows = ACTIVE_SKILLS.map(({ skill: [name, base, skillGroup], index }) => skillGroup === group ? `<tr>
      <td>${escapeHtml(name)}</td>
      <td><div class="pj-base-wrap"><input type="number" min="0" max="999" data-skill-base="${index}" aria-label="Base ${escapeHtml(name)}" readonly tabindex="-1"><span class="pj-base-hint">${escapeHtml(base)}</span></div></td>
      <td><input type="number" min="0" max="999" value="0" data-skill-points="${index}" aria-label="Points répartis ${escapeHtml(name)}"></td>
      <td class="pj-skill-final" data-skill-final="${index}">0</td>
      <td><input type="checkbox" data-skill-check="${index}" aria-label="Coche ${escapeHtml(name)}"></td>
    </tr>` : '').join('');
    return `<tr class="pj-skill-group"><td colspan="5">${group}</td></tr>${rows}`;
  }).join('');
  addWeaponRow();
}

function addWeaponRow(weapon = {}) {
  const row = document.createElement('tr');
  row.innerHTML = ['name', 'score', 'damage', 'range', 'pa'].map(key =>
    `<td><input data-weapon="${key}" value="${escapeHtml(weapon[key] || '')}" aria-label="${key}"></td>`
  ).join('') + '<td><button class="pj-remove" type="button" title="Supprimer cette arme" aria-label="Supprimer cette arme">×</button></td>';
  row.querySelector('.pj-remove').addEventListener('click', () => {
    row.remove();
    if (!weaponsBody.children.length) addWeaponRow();
    changed();
  });
  weaponsBody.appendChild(row);
}

function numberValue(key) {
  const value = Number(form.querySelector(`[data-stat="${key}"]`)?.value);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function damageBonus(total) {
  if (!total) return '';
  if (total <= 12) return '-1D6'; if (total <= 16) return '-1D4'; if (total <= 24) return 'Aucun';
  if (total <= 32) return '+1D4'; if (total <= 40) return '+1D6';
  return `+${Math.max(2, Math.ceil((total - 40) / 16) + 1)}D6`;
}

function updateDerived() {
  STATS.forEach(([, key]) => {
    const score = numberValue(key);
    form.querySelector(`[data-stat-roll="${key}"]`).textContent = score ? score * 5 : '—';
  });
  const con = numberValue('constitution'), size = numberValue('taille');
  const pow = numberValue('pouvoir'), int = numberValue('intelligence'), str = numberValue('force');
  setDerived('hp', con && size ? Math.ceil((con + size) / 2) : '');
  setDerived('pp', pow || '');
  setDerived('damage', str && size ? damageBonus(str + size) : '');
  setDerived('experience', int ? Math.ceil(int / 2) : '');
  updateSkillCalculations();
}

function automaticSkillBase(name, label) {
  const dex = numberValue('dexterite') || 0;
  const intelligence = numberValue('intelligence') || 0;
  const power = numberValue('pouvoir') || 0;
  if (name === 'Esquive' || name === 'Projection') return dex * 2;
  if (name === 'Vol') return dex * 4;
  if (name === 'Jeux') return intelligence + power;
  if (name === 'Langue (divers)' || name === 'Alphabétisation (option)') return intelligence * 5;
  if (label.startsWith('Selon')) return 0;
  return parseInt(label, 10) || 0;
}

function updateSkillCalculations() {
  let spent = 0;
  ACTIVE_SKILLS.forEach(({ skill: [name, label], index }) => {
    const baseInput = form.querySelector(`[data-skill-base="${index}"]`);
    const pointsInput = form.querySelector(`[data-skill-points="${index}"]`);
    baseInput.value = automaticSkillBase(name, label);
    const base = Math.max(0, parseInt(baseInput.value, 10) || 0);
    const points = Math.max(0, parseInt(pointsInput.value, 10) || 0);
    spent += points;
    form.querySelector(`[data-skill-final="${index}"]`).textContent = base + points;
  });
  const professional = Math.max(0, parseInt(fieldValue('skillProfessionalPool'), 10) || 0);
  const personal = (numberValue('intelligence') || 0) * 10;
  const total = professional + personal;
  const remaining = total - spent;
  document.getElementById('pj-skill-personal').textContent = personal;
  document.getElementById('pj-skill-total').textContent = total;
  document.getElementById('pj-skill-spent').textContent = spent;
  document.getElementById('pj-skill-remaining').textContent = remaining;
  document.getElementById('pj-skill-remaining-card').classList.toggle('over-budget', remaining < 0);
}

function setDerived(key, value) { form.querySelector(`[data-derived="${key}"]`).value = value; }

function fieldValue(key) { return form.querySelector(`[data-field="${key}"]`)?.value.trim() || ''; }

function collectData() {
  const fields = {};
  form.querySelectorAll('[data-field]').forEach(input => { fields[input.dataset.field] = input.value; });
  const stats = {};
  STATS.forEach(([, key]) => { stats[key] = form.querySelector(`[data-stat="${key}"]`).value; });
  const skills = SKILLS.map(() => ({}));
  ACTIVE_SKILLS.forEach(({ index }) => {
    skills[index] = {
      base: form.querySelector(`[data-skill-base="${index}"]`).value,
      points: form.querySelector(`[data-skill-points="${index}"]`).value,
      score: form.querySelector(`[data-skill-final="${index}"]`).textContent,
      checked: form.querySelector(`[data-skill-check="${index}"]`).checked
    };
  });
  const weapons = Array.from(weaponsBody.rows).map(row => Object.fromEntries(
    Array.from(row.querySelectorAll('[data-weapon]')).map(input => [input.dataset.weapon, input.value])
  ));
  return { fields, stats, skills, weapons };
}

function applyData(data) {
  if (!data || typeof data !== 'object') return;
  Object.entries(data.fields || {}).forEach(([key, value]) => {
    const input = form.querySelector(`[data-field="${key}"]`); if (input) input.value = value ?? '';
  });
  Object.entries(data.stats || {}).forEach(([key, value]) => {
    const input = form.querySelector(`[data-stat="${key}"]`); if (input) input.value = value ?? '';
  });
  updateDerived();
  (data.skills || []).forEach((skill, index) => {
    const base = form.querySelector(`[data-skill-base="${index}"]`);
    const points = form.querySelector(`[data-skill-points="${index}"]`);
    const check = form.querySelector(`[data-skill-check="${index}"]`);
    if (points) {
      const legacyPoints = skill.points === undefined ? Math.max(0, (parseInt(skill.score, 10) || 0) - (parseInt(base?.value, 10) || 0)) : skill.points;
      points.value = legacyPoints || 0;
    }
    if (check) check.checked = !!skill.checked;
  });
  weaponsBody.innerHTML = '';
  (data.weapons?.length ? data.weapons : [{}]).forEach(addWeaponRow);
  updateDerived(); updateFilename();
}

function changed() {
  updateDerived(); updateFilename();
  const state = document.getElementById('pj-save-state'); state.textContent = 'Modifications en cours…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(collectData()));
    state.textContent = 'Brouillon enregistré localement';
  }, 250);
}

function setStatus(message) {
  document.getElementById('pj-save-state').textContent = message;
}

function currentRoom() {
  try {
    const room = JSON.parse(localStorage.getItem(ROOM_STORAGE_KEY));
    return room?.code && room?.player ? room : null;
  } catch (error) {
    return null;
  }
}

function supabaseErrorMessage(error) {
  if (error?.code === '42P01' || /relation .*pj_sheets.* does not exist/i.test(error?.message || '')) {
    return 'Table pj_sheets absente : exécute le fichier supabase-pj-sheets.sql dans Supabase.';
  }
  return error?.message || 'Erreur Supabase inconnue';
}

async function saveSheetToSupabase() {
  const room = currentRoom();
  if (!supabase) { setStatus('Supabase n’est pas configuré.'); return; }
  if (!room) { setStatus('Rejoins d’abord une partie dans Dice Forge.'); return; }
  if (!fieldValue('name')) { setStatus('Donne un nom au personnage avant la sauvegarde.'); return; }

  const button = document.getElementById('pj-cloud-save');
  button.disabled = true;
  setStatus('Sauvegarde Supabase en cours…');
  const data = collectData();
  const { error } = await supabase.from('pj_sheets').upsert({
    room_code: room.code,
    player_name: room.player,
    character_name: fieldValue('name'),
    sheet_data: data,
    markdown_content: toMarkdown(),
    updated_at: new Date().toISOString()
  }, { onConflict: 'room_code,player_name' });
  button.disabled = false;

  if (error) { setStatus('Sauvegarde impossible : ' + supabaseErrorMessage(error)); return; }
  clearTimeout(saveTimer);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  setStatus(`Fiche de ${fieldValue('name')} sauvegardée dans la partie ${room.code}.`);
}

async function loadSheetFromSupabase() {
  const room = currentRoom();
  if (!supabase) { setStatus('Supabase n’est pas configuré.'); return; }
  if (!room) { setStatus('Rejoins d’abord une partie dans Dice Forge.'); return; }

  const button = document.getElementById('pj-cloud-load');
  button.disabled = true;
  setStatus('Chargement Supabase en cours…');
  const { data, error } = await supabase.from('pj_sheets')
    .select('sheet_data, character_name, updated_at')
    .eq('room_code', room.code)
    .eq('player_name', room.player)
    .maybeSingle();
  button.disabled = false;

  if (error) { setStatus('Chargement impossible : ' + supabaseErrorMessage(error)); return; }
  if (!data) { setStatus(`Aucune fiche en ligne pour ${room.player} dans la partie ${room.code}.`); return; }
  applyData(data.sheet_data);
  clearTimeout(saveTimer);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(collectData()));
  const date = data.updated_at ? new Date(data.updated_at).toLocaleString('fr-FR') : '';
  setStatus(`Fiche chargée depuis Supabase${date ? ` — ${date}` : ''}.`);
}

function slugName(name) {
  return (name || 'nom_du_perso').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'nom_du_perso';
}

function filename() { return `${slugName(fieldValue('name'))}.md`; }
function updateFilename() { document.getElementById('pj-filename').textContent = filename(); }
function yaml(value) { return JSON.stringify(String(value || '')); }
function cell(value) { return String(value || '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>'); }
function inline(value) { return String(value || '').replace(/\r?\n/g, '<br>'); }
function bullets(value) { const lines = String(value || '').split(/\r?\n/).filter(line => line.trim()); return lines.length ? lines.map(line => `- ${line}`).join('\n') : '- '; }

function toMarkdown() {
  const data = collectData(), f = data.fields, s = data.stats;
  const statRows = STATS.map(([code, key]) => `| ${code} | ${cell(s[key])} | ${s[key] ? Number(s[key]) * 5 : ''} |`).join('\n');
  const skillRows = SKILL_GROUPS.map(group => {
    const rows = ACTIVE_SKILLS.map(({ skill: [name, , skillGroup], index }) => skillGroup === group
      ? `| ${name} | ${cell(data.skills[index].base)} | ${cell(data.skills[index].points)} | ${cell(data.skills[index].score)} | [${data.skills[index].checked ? 'x' : ' '}] |`
      : '').filter(Boolean).join('\n');
    return `| **${group}** |  |  |  |  |\n${rows}`;
  }).join('\n');
  const weaponRows = data.weapons.filter(w => Object.values(w).some(Boolean)).map(w => `| ${cell(w.name)} | ${cell(w.score)} | ${cell(w.damage)} | ${cell(w.range)} | ${cell(w.pa)} |`).join('\n') || '|  |  |  |  |  |';
  const d = key => form.querySelector(`[data-derived="${key}"]`).value;
  const professional = Math.max(0, parseInt(f.skillProfessionalPool, 10) || 0);
  const personal = (Number(s.intelligence) || 0) * 10;
  const spent = data.skills.reduce((sum, skill) => sum + (parseInt(skill.points, 10) || 0), 0);
  return `---\ntype: "pj"\njoueur: ${yaml(f.player)}\nprofession: ${yaml(f.profession)}\nrace: ${yaml(f.race)}\naliases: [${yaml(f.name || 'Personnage')}]\n---\n\n# ${f.name || 'Nom du personnage'}\n\n**Joueur :** ${f.player || ''}  \n**Profession :** ${f.profession || ''}  \n**Race :** ${f.race || ''}\n\n## Caractéristiques\n\n| Carac | Score | Jet (x5) |\n|-------|-------|----------|\n${statRows}\n\n## Attributs dérivés\n\n- **Points de vie :** (CON + TAI) / 2 = ${d('hp')}\n- **Points de pouvoir :** POU = ${d('pp')}\n- **Bonus aux dégâts :** ${d('damage')}\n- **Bonus d'expérience :** INT / 2 = ${d('experience')}\n- **Mouvement :** ${f.movement || '10'}\n\n## Compétences\n\n- **Points professionnels :** ${professional}\n- **Points personnels :** ${personal}\n- **Total disponible :** ${professional + personal}\n- **Points répartis :** ${spent}\n- **Points restants :** ${professional + personal - spent}\n\n| Compétence | Base | Points répartis | Score final | Coche |\n|------------|------|------------------|-------------|-------|\n${skillRows}\n\n## Armes\n\n| Arme | % | Dégâts | Portée | PA |\n|------|---|--------|--------|----|\n${weaponRows}\n\n## Armure\n\n- **Type :** ${inline(f.armorType)}\n- **Points d'armure :** ${inline(f.armorPoints)}\n\n## Sorts / pouvoirs\n\n${bullets(f.powers)}\n\n## Équipement et richesse\n\n${bullets(f.equipment)}\n\n## Histoire et liens\n\n- **Origine :** ${inline(f.origin)}\n- **Liens avec les PNJ :** ${inline(f.npcLinks)}\n- **Liens avec les factions :** ${inline(f.factionLinks)}\n- **Motivation personnelle :** ${inline(f.motivation)}\n\n## Notes de jeu\n\n${bullets(f.notes)}\n\n---\n\nRetour: [[PJ/index_pj|Index PJ]]\n`;
}

function downloadMarkdown() {
  const blob = new Blob([toMarkdown()], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = filename(); document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  document.getElementById('pj-save-state').textContent = `Fiche enregistrée : ${filename()}`;
}

function valueAfter(label, text) {
  const match = text.match(new RegExp(`\\*\\*${label}\\s*:\\*\\*\\s*(.*)`));
  return match ? match[1].trim().replace(/  $/, '').replace(/<br\s*\/?>/gi, '\n') : '';
}
function section(text, title) {
  const match = text.match(new RegExp(`## ${title}\\s*\\n([\\s\\S]*?)(?=\\n## |\\n---|$)`)); return match ? match[1].trim() : '';
}
function listText(text) { return text.split(/\r?\n/).map(line => line.replace(/^-\s*/, '')).filter(Boolean).join('\n'); }

function parseMarkdown(text) {
  const data = { fields: {}, stats: {}, skills: [], weapons: [] };
  data.fields.name = (text.match(/^# (.+)$/m) || [])[1] || '';
  data.fields.player = valueAfter('Joueur', text); data.fields.profession = valueAfter('Profession', text); data.fields.race = valueAfter('Race', text);
  const statSection = section(text, 'Caractéristiques');
  STATS.forEach(([code, key]) => { const m = statSection.match(new RegExp(`\\|\\s*${code}\\s*\\|\\s*([^|]*)`)); data.stats[key] = m ? m[1].trim() : ''; });
  const derived = section(text, 'Attributs dérivés');
  data.fields.movement = (derived.match(/\*\*Mouvement\s*:\*\*\s*([^\n]*)/) || [])[1]?.trim() || '10';
  const skillSection = section(text, 'Compétences');
  data.fields.skillProfessionalPool = (skillSection.match(/\*\*Points professionnels\s*:\*\*\s*(\d+)/) || [])[1] || '325';
  data.skills = SKILLS.map(([name]) => {
    const row = skillSection.split(/\r?\n/).find(line => line.split('|')[1]?.trim() === name), cells = row?.split('|') || [];
    const modern = cells.length >= 7;
    return modern
      ? { base: cells[2]?.trim() || '', points: cells[3]?.trim() || '0', score: cells[4]?.trim() || '', checked: /^\[x\]$/i.test(cells[5]?.trim() || '') }
      : { score: cells[3]?.trim() || '', checked: /^\[x\]$/i.test(cells[4]?.trim() || '') };
  });
  const weaponSection = section(text, 'Armes');
  data.weapons = weaponSection.split(/\r?\n/).filter(line => /^\|/.test(line) && !/Arme|---/.test(line)).map(line => {
    const c = line.split('|').slice(1); return { name:c[0]?.trim(),score:c[1]?.trim(),damage:c[2]?.trim(),range:c[3]?.trim(),pa:c[4]?.trim() };
  }).filter(w => Object.values(w).some(Boolean));
  const armor = section(text, 'Armure'); data.fields.armorType = valueAfter('Type', armor); data.fields.armorPoints = valueAfter("Points d'armure", armor);
  data.fields.powers = listText(section(text, 'Sorts / pouvoirs')); data.fields.equipment = listText(section(text, 'Équipement et richesse'));
  const history = section(text, 'Histoire et liens');
  data.fields.origin = valueAfter('Origine', history); data.fields.npcLinks = valueAfter('Liens avec les PNJ', history);
  data.fields.factionLinks = valueAfter('Liens avec les factions', history); data.fields.motivation = valueAfter('Motivation personnelle', history);
  data.fields.notes = listText(section(text, 'Notes de jeu'));
  return data;
}

async function openMarkdown(file) {
  const text = await file.text(); applyData(parseMarkdown(text)); changed();
  document.getElementById('pj-save-state').textContent = `Fiche ouverte : ${file.name}`;
}

renderBaseFields();
try { const draft = JSON.parse(localStorage.getItem(STORAGE_KEY)); if (draft) applyData(draft); } catch (error) { console.warn('Brouillon illisible', error); }
updateDerived(); updateFilename();
form.addEventListener('input', changed);
form.addEventListener('change', changed);
document.getElementById('pj-add-weapon').addEventListener('click', () => { addWeaponRow(); changed(); });
document.getElementById('pj-download').addEventListener('click', downloadMarkdown);
document.getElementById('pj-cloud-save').addEventListener('click', saveSheetToSupabase);
document.getElementById('pj-cloud-load').addEventListener('click', loadSheetFromSupabase);
document.getElementById('pj-open').addEventListener('click', () => document.getElementById('pj-file').click());
document.getElementById('pj-file').addEventListener('change', event => { const file = event.target.files[0]; if (file) openMarkdown(file).catch(() => alert('Ce fichier Markdown ne peut pas être ouvert.')); event.target.value = ''; });
document.getElementById('pj-reset').addEventListener('click', () => {
  if (!confirm('Effacer le brouillon actuel et créer une nouvelle fiche ?')) return;
  localStorage.removeItem(STORAGE_KEY); form.reset(); weaponsBody.innerHTML = ''; addWeaponRow(); updateDerived(); updateFilename(); changed();
});
