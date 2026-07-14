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

const SKILLS = [
  ['Estimation', '15 %'], ['Art (divers)', '05 %'], ['Artillerie (divers)', "Selon la spécialité d'arme"],
  ['Marchandage', '05 %'], ['Bagarre', '25 %'], ['Escalade', '40 %'], ['Commandement', '05 %'],
  ['Artisanat (divers)', '05 %'], ['Démolition', '01 %'], ['Déguisement', '01 %'], ['Esquive', 'DEX×2'],
  ['Conduite (divers)', '20 % ou 01 %'], ['Arme à énergie (divers)', "Selon la spécialité d'arme"],
  ['Étiquette (divers)', '05 %'], ['Baratin', '05 %'], ['Manipulation fine', '05 %'],
  ['Arme à feu (divers)', "Selon la spécialité d'arme"], ['Premiers secours', '30 %'],
  ['Vol', 'DEX×4 ou ½ DEX'], ['Jeux', 'INT+POU'], ['Lutte', '25 %'], ['Machine lourde (divers)', '01 %'],
  ['Arme lourde (divers)', "Selon la spécialité d'arme"], ['Se cacher', '10 %'], ['Intuition', '05 %'],
  ['Saut', '25 %'], ['Connaissance (divers)', '05 % ou 00 %'], ['Langue (divers)', 'INT (ou ÉDU)×5 ou 00 %'],
  ['Écouter', '25 %'], ['Alphabétisation (option)', '00 % ou égale à Langue'], ['Arts martiaux', '01 %'],
  ['Médecine', '05 %'], ['Arme de mêlée (divers)', "Selon la spécialité d'arme"],
  ['Arme de jet (divers)', "Selon la spécialité d'arme"], ['Navigation', '10 %'],
  ['Parade (divers)', "Selon la spécialité d'arme"], ['Représentation', '05 %'], ['Persuasion', '15 %'],
  ['Pilotage (divers)', '01 %'], ['Projection', 'DEX×2'], ['Psychothérapie', '01 % ou 00 %'],
  ['Réparation (divers)', '15 %'], ['Recherche', '25 %'], ['Équitation (divers)', '05 %'],
  ['Science (divers)', '01 %'], ['Sens', '10 %'], ['Bouclier', 'Selon le type de bouclier'],
  ['Tour de main', '05 %'], ['Observation', '25 %'], ['Statut', '15 % ou variable'], ['Discrétion', '10 %'],
  ['Stratégie', '01 %'], ['Nage', '25 %'], ['Enseignement', '10 %'],
  ['Compétence technique (divers)', '05 %'], ['Lancer', '25 %'], ['Pistage', '10 %']
];

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

  skillsBody.innerHTML = SKILLS.map(([name, base], index) => `<tr>
    <td>${escapeHtml(name)}</td><td>${escapeHtml(base)}</td>
    <td><input data-skill-score="${index}" aria-label="Score final ${escapeHtml(name)}"></td>
    <td><input type="checkbox" data-skill-check="${index}" aria-label="Coche ${escapeHtml(name)}"></td>
  </tr>`).join('');
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
  setDerived('experience', int ? Math.floor(int / 2) : '');
}

function setDerived(key, value) { form.querySelector(`[data-derived="${key}"]`).value = value; }

function fieldValue(key) { return form.querySelector(`[data-field="${key}"]`)?.value.trim() || ''; }

function collectData() {
  const fields = {};
  form.querySelectorAll('[data-field]').forEach(input => { fields[input.dataset.field] = input.value; });
  const stats = {};
  STATS.forEach(([, key]) => { stats[key] = form.querySelector(`[data-stat="${key}"]`).value; });
  const skills = SKILLS.map((_, index) => ({
    score: form.querySelector(`[data-skill-score="${index}"]`).value,
    checked: form.querySelector(`[data-skill-check="${index}"]`).checked
  }));
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
  (data.skills || []).forEach((skill, index) => {
    const score = form.querySelector(`[data-skill-score="${index}"]`), check = form.querySelector(`[data-skill-check="${index}"]`);
    if (score) score.value = skill.score || ''; if (check) check.checked = !!skill.checked;
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
  const skillRows = SKILLS.map(([name, base], i) => `| ${name} | ${base} | ${cell(data.skills[i].score)} | [${data.skills[i].checked ? 'x' : ' '}] |`).join('\n');
  const weaponRows = data.weapons.filter(w => Object.values(w).some(Boolean)).map(w => `| ${cell(w.name)} | ${cell(w.score)} | ${cell(w.damage)} | ${cell(w.range)} | ${cell(w.pa)} |`).join('\n') || '|  |  |  |  |  |';
  const d = key => form.querySelector(`[data-derived="${key}"]`).value;
  return `---\ntype: "pj"\njoueur: ${yaml(f.player)}\nprofession: ${yaml(f.profession)}\nrace: ${yaml(f.race)}\naliases: [${yaml(f.name || 'Personnage')}]\n---\n\n# ${f.name || 'Nom du personnage'}\n\n**Joueur :** ${f.player || ''}  \n**Profession :** ${f.profession || ''}  \n**Race :** ${f.race || ''}\n\n## Caractéristiques\n\n| Carac | Score | Jet (x5) |\n|-------|-------|----------|\n${statRows}\n\n## Attributs dérivés\n\n- **Points de vie :** (CON + TAI) / 2 = ${d('hp')}\n- **Points de pouvoir :** POU = ${d('pp')}\n- **Bonus aux dégâts :** ${d('damage')}\n- **Bonus d'expérience :** INT / 2 = ${d('experience')}\n- **Mouvement :** ${f.movement || '10'}\n\n## Compétences\n\nLe score final correspond à la valeur de base, augmentée des points de compétence et des éventuels bonus de catégorie.\n\n| Compétence | Base | Score final | Coche |\n|------------|------|-------------|-------|\n${skillRows}\n\n## Armes\n\n| Arme | % | Dégâts | Portée | PA |\n|------|---|--------|--------|----|\n${weaponRows}\n\n## Armure\n\n- **Type :** ${inline(f.armorType)}\n- **Points d'armure :** ${inline(f.armorPoints)}\n\n## Sorts / pouvoirs\n\n${bullets(f.powers)}\n\n## Équipement et richesse\n\n${bullets(f.equipment)}\n\n## Histoire et liens\n\n- **Origine :** ${inline(f.origin)}\n- **Liens avec les PNJ :** ${inline(f.npcLinks)}\n- **Liens avec les factions :** ${inline(f.factionLinks)}\n- **Motivation personnelle :** ${inline(f.motivation)}\n\n## Notes de jeu\n\n${bullets(f.notes)}\n\n---\n\nRetour: [[PJ/index_pj|Index PJ]]\n`;
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
  data.skills = SKILLS.map(([name]) => {
    const row = skillSection.split(/\r?\n/).find(line => line.split('|')[1]?.trim() === name), cells = row?.split('|') || [];
    return { score: cells[3]?.trim() || '', checked: /^\[x\]$/i.test(cells[4]?.trim() || '') };
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
form.addEventListener('input', changed); form.addEventListener('change', changed);
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
