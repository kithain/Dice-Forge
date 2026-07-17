import { createClient } from '@supabase/supabase-js';
import './tooltips.js?v=20260715-character-help';

if (new URLSearchParams(window.location.search).get('embedded') === '1') {
  document.body.classList.add('pj-embedded');
}

const STORAGE_KEY = 'dice-forge.pj-markdown.v1';
const PRINT_STORAGE_KEY = 'dice-forge.pj-print.v1';
const ROOM_STORAGE_KEY = 'diceforge_room';
const SUPABASE_URL = window.SUPABASE_CONFIG?.url || '';
const SUPABASE_ANON_KEY = window.SUPABASE_CONFIG?.anonKey || '';
const supabase = SUPABASE_URL && SUPABASE_ANON_KEY && !SUPABASE_URL.includes('VOTRE_PROJET')
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const STATS = [
  ['FOR', 'force', 'Puissance physique : soulever, pousser, briser ou retenir. Contribue au bonus aux dégâts.'],
  ['CON', 'constitution', 'Résistance du corps : fatigue, maladie et poison. Contribue aux points de vie.'],
  ['TAI', 'taille', 'Masse et gabarit du personnage. Contribue aux points de vie et au bonus aux dégâts.'],
  ['INT', 'intelligence', 'Capacité à comprendre, raisonner et trouver des solutions. Détermine les points personnels.'],
  ['POU', 'pouvoir', 'Force mentale et spirituelle. Sert à la magie, à la chance et aux points de pouvoir.'],
  ['DEX', 'dexterite', 'Vitesse, coordination et précision. Influence notamment Esquive et Vol.'],
  ['APP', 'apparence', 'Apparence et présence visible du personnage. Influence sa première impression sociale.']
];

const SKILL_GROUPS = ['Combat', 'Physique', 'Magie & pouvoirs', 'Social & mental', 'Connaissances', 'Pratique & divers'];
// L'emplacement vide conserve les index des anciennes sauvegardes après le retrait d'une compétence.
const SKILLS = [
  ['Estimation', '15 %', 'Pratique & divers'], ['Art (divers)', '05 %', 'Pratique & divers'], ['Artillerie (divers)', "Selon la spécialité d'arme", 'Combat'],
  ['Marchandage', '05 %', 'Social & mental'], ['Bagarre', '25 %', 'Combat'], ['Escalade', '40 %', 'Physique'], ['Commandement', '05 %', 'Social & mental'],
  ['Artisanat (divers)', '05 %', 'Pratique & divers'], ['Démolition', '01 %', 'Pratique & divers'], ['Déguisement', '01 %', 'Social & mental'], ['Esquive', 'DEX×2', 'Physique'],
  ['Conduite (divers)', '20 % ou 01 %', 'Physique'], ['Arme à énergie (divers)', "Selon la spécialité d'arme", 'Combat'],
  ['Étiquette (divers)', '05 %', 'Social & mental'], ['Baratin', '05 %', 'Social & mental'], ['Manipulation fine', '05 %', 'Pratique & divers'],
  ['Arme à feu (divers)', "Selon la spécialité d'arme", 'Combat'], ['Premiers secours', '30 %', 'Pratique & divers'],
  ['Vol', '½ DEX', 'Magie & pouvoirs'], ['Jeux', 'INT+POU', 'Social & mental'], ['Lutte', '25 %', 'Combat'],
  ['Arme lourde (divers)', "Selon la spécialité d'arme", 'Combat'], ['Se cacher', '10 %', 'Physique'], ['Intuition', '05 %', 'Social & mental'],
  ['Saut', '25 %', 'Physique'], ['Connaissance (divers)', '05 % ou 00 %', 'Connaissances'], ['Langue (divers)', 'INT (ou ÉDU)×5 ou 00 %', 'Connaissances'],
  ['Écouter', '25 %', 'Social & mental'], ['Alphabétisation (option)', 'Selon profession', 'Connaissances'],
  ['Médecine', '05 %', 'Connaissances'], ['Arme de mêlée (divers)', "Selon la spécialité d'arme", 'Combat'],
  ['Arme de jet (divers)', "Selon la spécialité d'arme", 'Combat'], ['Navigation', '10 %', 'Pratique & divers'],
  ['Parade (divers)', "Selon la spécialité d'arme", 'Combat'], ['Représentation', '05 %', 'Social & mental'], ['Intimidation/Persuasion', '15 %', 'Social & mental'],
  ['Pilotage (divers)', '01 %', 'Physique'], ['', '', ''], ['Psychothérapie', '01 % ou 00 %', 'Social & mental'],
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
  'Arme lourde (divers)',
  'Psychothérapie',
  'Compétence technique (divers)'
]);
const ACTIVE_SKILLS = SKILLS
  .map((skill, index) => ({ skill, index }))
  .filter(({ skill }) => skill[0] && !NON_MEDFAN_SKILLS.has(skill[0]));

const SPELL_SLOT_COUNT = 6;
const SPELLS = [
  ['Blessure', ['Sorcier', 'Étudiant']],
  ['Déflagration', ['Sorcier']],
  ['Feu', ['Sorcier', 'Chaman']],
  ['Foudre', ['Sorcier']],
  ['Givre', ['Sorcier', 'Chaman']],
  ['Soins', ['Prêtre', 'Chaman', 'Étudiant']],
  ['Guérison Supérieure', ['Prêtre']],
  ['Contrôle', ['Sorcier', 'Chaman']],
  ['Protection', ['Sorcier', 'Prêtre', 'Étudiant']],
  ['Contre-magie', ['Sorcier', 'Prêtre']],
  ['Dissipation', ['Sorcier', 'Prêtre', 'Chaman']],
  ['Métamorphose', ['Sorcier']],
  ['Illusion', ['Sorcier', 'Étudiant']],
  ['Invisibilité', ['Sorcier']],
  ['Lévitation', ['Sorcier', 'Étudiant']],
  ['Téléportation', ['Sorcier']],
  ['Diminution', ['Sorcier', 'Prêtre']],
  ['Amélioration', ['Sorcier', 'Prêtre', 'Chaman']],
  ['Perception', ['Sorcier', 'Prêtre', 'Chaman', 'Étudiant']],
  ['Vision', ['Sorcier', 'Prêtre']],
  ['Parole mentale', ['Sorcier', 'Prêtre', 'Chaman', 'Étudiant']],
  ['Lumière', ['Sorcier', 'Prêtre', 'Chaman', 'Étudiant']],
  ['Ténèbres', ['Sorcier', 'Prêtre', 'Chaman']],
  ['Mur', ['Sorcier', 'Prêtre']],
  ['Garde', ['Sorcier', 'Prêtre']],
  ['Résistance', ['Prêtre', 'Chaman']],
  ['Émoussement', ['Sorcier']],
  ['Affûtage', ['Sorcier']],
  ['Scellement', ['Sorcier', 'Étudiant']],
  ['Déscelement', ['Sorcier', 'Étudiant']],
  ['Conjurer Élémentaire', ['Sorcier', 'Chaman']],
  ['Bénédiction', ['Prêtre']],
  ['Malédiction', ['Prêtre']],
  ['Sanctifier', ['Prêtre']],
  ['Exorcisme', ['Prêtre', 'Chaman']],
  ['Renaissance', ['Prêtre']],
  ['Transe', ['Chaman']],
  ['Esprit Gardien', ['Chaman']]
];
const SPELLCASTER_ALIASES = new Map([
  ['sorcier', 'Sorcier'], ['sorciere', 'Sorcier'], ['mage', 'Sorcier'], ['magicien', 'Sorcier'], ['magicienne', 'Sorcier'],
  ['pretre', 'Prêtre'], ['pretresse', 'Prêtre'],
  ['chaman', 'Chaman'], ['chamane', 'Chaman'],
  ['etudiant', 'Étudiant'], ['etudiante', 'Étudiant']
]);

const SKILL_HELP = {
  'Estimation': "Évaluer la valeur, la qualité ou l'authenticité d'un objet.",
  'Art (divers)': 'Créer ou interpréter une œuvre artistique dans une spécialité choisie.',
  'Artillerie (divers)': "Utiliser une arme de siège ou une pièce d'artillerie adaptée à l'univers.",
  'Marchandage': "Négocier un prix, un échange ou les conditions d'un accord.",
  'Bagarre': 'Combattre à mains nues avec coups, prises simples et improvisation.',
  'Escalade': 'Grimper sur une paroi, un mur, un arbre ou une surface difficile.',
  'Commandement': 'Donner des ordres clairs, coordonner un groupe et maintenir son moral.',
  'Artisanat (divers)': "Fabriquer, entretenir ou examiner des objets d'un métier précis.",
  'Déguisement': "Modifier son apparence pour passer pour quelqu'un d'autre ou rester méconnaissable.",
  'Esquive': 'Éviter une attaque, un projectile ou un danger soudain.',
  'Conduite (divers)': 'Diriger un véhicule, un attelage ou une embarcation de la spécialité choisie.',
  'Étiquette (divers)': 'Connaître les usages, titres et comportements attendus dans un milieu social.',
  'Baratin': "Convaincre rapidement par l'assurance, l'improvisation ou un mensonge plausible.",
  'Manipulation fine': 'Réaliser un geste précis : crochetage, mécanisme délicat ou travail minutieux.',
  'Premiers secours': 'Stabiliser rapidement une blessure et prodiguer des soins immédiats.',
  'Vol': "Se déplacer et manœuvrer en vol lorsqu'un pouvoir ou une capacité le permet.",
  'Jeux': 'Connaître les règles, tactiques et astuces des jeux de hasard ou de stratégie.',
  'Lutte': 'Saisir, immobiliser, projeter ou se libérer au corps à corps.',
  'Se cacher': 'Trouver et utiliser une cachette pour ne pas être vu.',
  'Intuition': 'Pressentir une intention, un danger ou ce qui ne va pas dans une situation.',
  'Saut': 'Franchir une distance ou un obstacle et réceptionner une chute courte.',
  'Connaissance (divers)': "Se rappeler des informations dans un domaine d'érudition choisi.",
  'Langue (divers)': 'Comprendre, parler, lire ou écrire une langue selon le niveau atteint.',
  'Écouter': 'Percevoir et identifier des sons faibles, lointains ou dissimulés.',
  'Alphabétisation (option)': "Lire et écrire dans une culture où cette capacité n'est pas automatique.",
  'Médecine': 'Diagnostiquer et traiter blessures, maladies ou empoisonnements sur la durée.',
  'Arme de mêlée (divers)': 'Attaquer avec une arme de contact de la spécialité choisie.',
  'Arme de jet (divers)': 'Attaquer à distance avec un arc, une fronde ou une arme lancée selon la spécialité.',
  'Navigation': "S'orienter et tracer une route à l'aide du terrain, des cartes ou des astres.",
  'Parade (divers)': "Bloquer ou dévier une attaque avec l'arme choisie.",
  'Représentation': 'Captiver un public par le chant, la musique, le théâtre, la danse ou le rituel.',
  'Intimidation/Persuasion': "Obtenir l'adhésion par la menace, l'autorité ou une argumentation directe.",
  'Pilotage (divers)': 'Contrôler un appareil ou moyen de transport complexe de la spécialité choisie.',
  'Réparation (divers)': 'Diagnostiquer une panne et remettre en état un objet ou mécanisme.',
  'Recherche': 'Trouver une information dans des archives, une bibliothèque ou un ensemble de documents.',
  'Équitation (divers)': 'Monter, guider et maîtriser une monture de la spécialité choisie.',
  'Science (divers)': 'Appliquer une discipline scientifique ou savante à un problème précis.',
  'Sens': 'Utiliser un sens particulier pour détecter, reconnaître ou analyser quelque chose.',
  'Bouclier': 'Bloquer une attaque et se protéger avec un type de bouclier.',
  'Tour de main': "Dissimuler ou subtiliser un petit objet par l'adresse et la distraction.",
  'Observation': "Repérer un détail visible, un indice ou une anomalie dans l'environnement.",
  'Statut': 'Utiliser sa position sociale, sa réputation ou ses relations pour obtenir un avantage.',
  'Discrétion': 'Se déplacer silencieusement et rester inaperçu.',
  'Stratégie': "Planifier une bataille, anticiper l'adversaire et employer au mieux ses forces.",
  'Nage': "Se déplacer dans l'eau et résister à la noyade ou au courant.",
  'Enseignement': "Transmettre efficacement un savoir ou entraîner quelqu'un dans une compétence.",
  'Lancer': "Envoyer avec précision un objet qui n'est pas traité comme une arme spécialisée.",
  'Pistage': "Suivre des traces et interpréter le passage d'une créature ou d'un groupe."
};

const form = document.getElementById('pj-form');
const statsBody = document.getElementById('pj-stats');
const skillsBody = document.getElementById('pj-skills');
const weaponsBody = document.getElementById('pj-weapons');
let saveTimer;
let spellSlots = Array.from({ length: SPELL_SLOT_COUNT }, () => ({ name: '', points: '0', checked: false }));
let localEditRevision = 0;
let sheetLoadInProgress = false;

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
}

function renderBaseFields() {
  statsBody.innerHTML = STATS.map(([code, key, help]) => `<tr>
    <td class="pj-stats-code"><span class="pj-help-target has-tooltip" tabindex="0" data-tooltip="${escapeHtml(help)}">${code}<span class="tooltip-hint" aria-hidden="true">?</span></span></td>
    <td><input type="number" min="0" max="999" data-stat="${key}" aria-label="Score ${code}"></td>
    <td class="pj-stat-roll" data-stat-roll="${key}">—</td>
  </tr>`).join('');

  skillsBody.innerHTML = SKILL_GROUPS.map(group => {
    const rows = ACTIVE_SKILLS.map(({ skill: [name, base, skillGroup], index }) => skillGroup === group ? `<tr>
      <td><span class="pj-help-target has-tooltip" tabindex="0" data-tooltip="${escapeHtml(SKILL_HELP[name] || `Utiliser ${name} dans une situation appropriée.`)}">${escapeHtml(name)}<span class="tooltip-hint" aria-hidden="true">?</span></span></td>
      <td><div class="pj-base-wrap"><input type="number" min="0" max="999" data-skill-base="${index}" aria-label="Base ${escapeHtml(name)}" readonly tabindex="-1"><span class="pj-base-hint">${escapeHtml(base)}</span></div></td>
      <td><input type="number" min="0" max="999" value="0" data-skill-points="${index}" aria-label="Points répartis ${escapeHtml(name)}"></td>
      <td class="pj-skill-final" data-skill-final="${index}">0</td>
      <td><input type="checkbox" data-skill-check="${index}" aria-label="Coche ${escapeHtml(name)}"></td>
    </tr>` : '').join('');
    return `<tr class="pj-skill-group"><td colspan="5">${group}</td></tr>${rows}`;
  }).join('');
  renderSpellRows();
  addWeaponRow();
}

function normalizedProfession() {
  return fieldValue('profession').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('fr-FR');
}

function spellcasterClass() {
  const profession = normalizedProfession();
  for (const [alias, casterClass] of SPELLCASTER_ALIASES) {
    if (profession === alias || profession.includes(alias)) return casterClass;
  }
  return null;
}

function availableSpells() {
  const casterClass = spellcasterClass();
  return casterClass ? SPELLS.filter(([, classes]) => classes.includes(casterClass)).map(([name]) => name) : [];
}

function renderSpellRows() {
  skillsBody.querySelectorAll('[data-spell-row], [data-spell-group]').forEach(row => row.remove());
  const casterClass = spellcasterClass();
  if (!casterClass) return;
  const options = availableSpells();
  const groupRows = Array.from(skillsBody.querySelectorAll('.pj-skill-group'));
  const magicGroup = groupRows.find(row => row.textContent.trim() === 'Magie & pouvoirs');
  if (!magicGroup) return;
  const fragment = document.createDocumentFragment();
  const heading = document.createElement('tr');
  heading.className = 'pj-spell-group';
  heading.dataset.spellGroup = '';
  heading.innerHTML = `<td colspan="5">Sorts de ${escapeHtml(casterClass)} — base INT</td>`;
  fragment.appendChild(heading);
  spellSlots.forEach((slot, index) => {
    const row = document.createElement('tr');
    row.dataset.spellRow = String(index);
    row.innerHTML = `<td><select data-spell-name="${index}" aria-label="Sort ${index + 1}">
      <option value="">Choisir un sort…</option>
      ${options.map(name => `<option value="${escapeHtml(name)}"${slot.name === name ? ' selected' : ''}>${escapeHtml(name)}</option>`).join('')}
    </select></td>
    <td class="pj-spell-base" data-spell-base="${index}">0</td>
    <td><input type="number" min="0" max="999" value="${escapeHtml(slot.points || '0')}" data-spell-points="${index}" aria-label="Points répartis pour le sort ${index + 1}"></td>
    <td class="pj-skill-final" data-spell-final="${index}">0</td>
    <td><input type="checkbox" data-spell-check="${index}" aria-label="Coche du sort ${index + 1}"${slot.checked ? ' checked' : ''}></td>`;
    fragment.appendChild(row);
  });
  magicGroup.after(fragment);
  updateSpellOptions();
  updateSkillCalculations();
}

function syncSpellSlotsFromForm() {
  spellSlots = Array.from({ length: SPELL_SLOT_COUNT }, (_, index) => ({
    name: form.querySelector(`[data-spell-name="${index}"]`)?.value ?? spellSlots[index]?.name ?? '',
    points: form.querySelector(`[data-spell-points="${index}"]`)?.value ?? spellSlots[index]?.points ?? '0',
    checked: form.querySelector(`[data-spell-check="${index}"]`)?.checked ?? !!spellSlots[index]?.checked
  }));
}

function updateSpellOptions() {
  const selected = new Set(Array.from(form.querySelectorAll('[data-spell-name]')).map(select => select.value).filter(Boolean));
  form.querySelectorAll('[data-spell-name]').forEach(select => {
    Array.from(select.options).forEach(option => {
      option.disabled = !!option.value && option.value !== select.value && selected.has(option.value);
    });
  });
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
  const profession = fieldValue('profession').toLocaleLowerCase('fr-FR');
  if (name === 'Esquive') return dex * 2;
  if (name === 'Vol') return Math.ceil(dex / 2);
  if (name === 'Jeux') return intelligence + power;
  if (name === 'Langue (divers)') return intelligence * 5;
  if (name === 'Alphabétisation (option)') {
    if (profession.includes('érudit') || profession.includes('étudiant')) return intelligence * 5;
    if (profession.includes('sorcier') || profession.includes('prêtre')) return intelligence * 4;
    if (profession.includes('noble')) return intelligence * 3;
    return 0;
  }
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
  const spellBase = numberValue('intelligence') || 0;
  form.querySelectorAll('[data-spell-row]').forEach(row => {
    const index = row.dataset.spellRow;
    const name = form.querySelector(`[data-spell-name="${index}"]`)?.value || '';
    const points = Math.max(0, parseInt(form.querySelector(`[data-spell-points="${index}"]`)?.value, 10) || 0);
    form.querySelector(`[data-spell-base="${index}"]`).textContent = name ? spellBase : 0;
    form.querySelector(`[data-spell-final="${index}"]`).textContent = name ? spellBase + points : 0;
    if (name) spent += points;
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
  syncSpellSlotsFromForm();
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
  return { fields, stats, skills, spells: spellSlots, weapons };
}

function applyData(data) {
  if (!data || typeof data !== 'object') return;
  Object.entries(data.fields || {}).forEach(([key, value]) => {
    const input = form.querySelector(`[data-field="${key}"]`); if (input) input.value = value ?? '';
  });
  Object.entries(data.stats || {}).forEach(([key, value]) => {
    const input = form.querySelector(`[data-stat="${key}"]`); if (input) input.value = value ?? '';
  });
  spellSlots = Array.from({ length: SPELL_SLOT_COUNT }, (_, index) => ({
    name: data.spells?.[index]?.name || '',
    points: data.spells?.[index]?.points ?? '0',
    checked: !!data.spells?.[index]?.checked
  }));
  renderSpellRows();
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
  localEditRevision += 1;
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

async function loadSheetFromSupabase({ automatic = false } = {}) {
  const room = currentRoom();
  if (sheetLoadInProgress) return false;
  if (!supabase) {
    if (!automatic) setStatus('Supabase n’est pas configuré.');
    return false;
  }
  if (!room) {
    if (!automatic) setStatus('Rejoins d’abord une partie dans Dice Forge.');
    return false;
  }

  const button = document.getElementById('pj-cloud-load');
  const revisionAtStart = localEditRevision;
  sheetLoadInProgress = true;
  button.disabled = true;
  setStatus(automatic ? 'Recherche automatique de la fiche Supabase…' : 'Chargement Supabase en cours…');
  let data = null;
  let error = null;
  try {
    const result = await supabase.from('pj_sheets')
      .select('sheet_data, character_name, updated_at')
      .eq('room_code', room.code)
      .eq('player_name', room.player)
      .maybeSingle();
    data = result.data;
    error = result.error;
  } catch (caughtError) {
    error = caughtError;
  } finally {
    sheetLoadInProgress = false;
    button.disabled = false;
  }

  if (error) {
    setStatus(`${automatic ? 'Chargement automatique impossible' : 'Chargement impossible'} : ${supabaseErrorMessage(error)}`);
    return false;
  }
  if (!data) {
    setStatus(`Aucune fiche en ligne pour ${room.player} dans la partie ${room.code}. Brouillon local conservé.`);
    return false;
  }
  if (!data.sheet_data || typeof data.sheet_data !== 'object') {
    setStatus('La fiche Supabase existe mais son contenu est illisible. Brouillon local conservé.');
    return false;
  }
  if (automatic && localEditRevision !== revisionAtStart) {
    setStatus('Fiche Supabase trouvée, mais chargement automatique annulé car la fiche locale a été modifiée.');
    return false;
  }
  applyData(data.sheet_data);
  clearTimeout(saveTimer);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(collectData()));
  const date = data.updated_at ? new Date(data.updated_at).toLocaleString('fr-FR') : '';
  setStatus(`Fiche chargée${automatic ? ' automatiquement' : ''} depuis Supabase${date ? ` — ${date}` : ''}.`);
  return true;
}

function autoLoadSheetFromSupabase() {
  if (!supabase || !currentRoom()) return;
  loadSheetFromSupabase({ automatic: true });
}

function setTransferStatus(message, type = '') {
  const status = document.getElementById('pj-transfer-status');
  status.textContent = message;
  status.className = `pj-transfer-status${type ? ` ${type}` : ''}`;
}

function openTransferDialog() {
  const room = currentRoom();
  if (!supabase) { setStatus('Supabase n’est pas configuré.'); return; }
  if (!room) { setStatus('Rejoins d’abord le salon source dans Dice Forge.'); return; }
  if (!fieldValue('name')) { setStatus('Donne un nom au personnage avant le transfert.'); return; }
  document.getElementById('pj-transfer-source').textContent = room.code;
  document.getElementById('pj-transfer-player').textContent = room.player;
  document.getElementById('pj-transfer-character').textContent = fieldValue('name');
  document.getElementById('pj-transfer-code').value = '';
  setTransferStatus('');
  document.getElementById('pj-transfer-dialog').showModal();
  document.getElementById('pj-transfer-code').focus();
}

async function transferSheetToRoom() {
  const room = currentRoom();
  const targetCode = document.getElementById('pj-transfer-code').value.trim().toUpperCase();
  const button = document.getElementById('pj-transfer-submit');
  if (!supabase || !room) { setTransferStatus('Salon source ou Supabase indisponible.', 'error'); return; }
  if (!/^[A-Z0-9]{4}$/.test(targetCode)) { setTransferStatus('Saisis un code de salon valide à 4 caractères.', 'error'); return; }
  if (targetCode === room.code.toUpperCase()) { setTransferStatus('Le salon de destination doit être différent du salon actuel.', 'error'); return; }

  button.disabled = true;
  setTransferStatus(`Vérification du salon ${targetCode}…`);
  const { data: roomRows, error: roomError } = await supabase.from('rolls')
    .select('id')
    .eq('room_code', targetCode)
    .limit(1);
  if (roomError) {
    button.disabled = false;
    setTransferStatus(`Vérification impossible : ${roomError.message}`, 'error');
    return;
  }
  if (!roomRows?.length) {
    button.disabled = false;
    setTransferStatus(`Le salon ${targetCode} n’existe pas.`, 'error');
    return;
  }

  const { data: existing, error: existingError } = await supabase.from('pj_sheets')
    .select('character_name')
    .eq('room_code', targetCode)
    .eq('player_name', room.player)
    .maybeSingle();
  if (existingError) {
    button.disabled = false;
    setTransferStatus(`Transfert impossible : ${supabaseErrorMessage(existingError)}`, 'error');
    return;
  }
  if (existing && !confirm(`${room.player} possède déjà la fiche « ${existing.character_name} » dans le salon ${targetCode}. La remplacer ?`)) {
    button.disabled = false;
    setTransferStatus('Transfert annulé.');
    return;
  }

  setTransferStatus(`Copie de la fiche vers ${targetCode}…`);
  const data = collectData();
  const { error } = await supabase.from('pj_sheets').upsert({
    room_code: targetCode,
    player_name: room.player,
    character_name: fieldValue('name'),
    sheet_data: data,
    markdown_content: toMarkdown(),
    updated_at: new Date().toISOString()
  }, { onConflict: 'room_code,player_name' });
  button.disabled = false;
  if (error) { setTransferStatus(`Transfert impossible : ${supabaseErrorMessage(error)}`, 'error'); return; }

  setTransferStatus(`Fiche copiée dans le salon ${targetCode}.`, 'success');
  setStatus(`Fiche de ${fieldValue('name')} transférée vers le salon ${targetCode}.`);
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
  const spellRows = data.spells.filter(spell => spell.name).map(spell => {
    const base = Number(s.intelligence) || 0;
    const points = Math.max(0, parseInt(spell.points, 10) || 0);
    return `| ${cell(spell.name)} | ${base} | ${points} | ${base + points} | [${spell.checked ? 'x' : ' '}] |`;
  }).join('\n');
  const skillRows = SKILL_GROUPS.map(group => {
    const rows = ACTIVE_SKILLS.map(({ skill: [name, , skillGroup], index }) => skillGroup === group
      ? `| ${name} | ${cell(data.skills[index].base)} | ${cell(data.skills[index].points)} | ${cell(data.skills[index].score)} | [${data.skills[index].checked ? 'x' : ' '}] |`
      : '').filter(Boolean).join('\n');
    const spells = group === 'Magie & pouvoirs' && spellRows ? `\n${spellRows}` : '';
    return `| **${group}** |  |  |  |  |\n${rows}${spells}`;
  }).join('\n');
  const weaponRows = data.weapons.filter(w => Object.values(w).some(Boolean)).map(w => `| ${cell(w.name)} | ${cell(w.score)} | ${cell(w.damage)} | ${cell(w.range)} | ${cell(w.pa)} |`).join('\n') || '|  |  |  |  |  |';
  const d = key => form.querySelector(`[data-derived="${key}"]`).value;
  const professional = Math.max(0, parseInt(f.skillProfessionalPool, 10) || 0);
  const personal = (Number(s.intelligence) || 0) * 10;
  const spent = data.skills.reduce((sum, skill) => sum + (parseInt(skill.points, 10) || 0), 0)
    + data.spells.filter(spell => spell.name).reduce((sum, spell) => sum + (parseInt(spell.points, 10) || 0), 0);
  return `---\ntype: "pj"\njoueur: ${yaml(f.player)}\nprofession: ${yaml(f.profession)}\nrace: ${yaml(f.race)}\naliases: [${yaml(f.name || 'Personnage')}]\n---\n\n# ${f.name || 'Nom du personnage'}\n\n**Joueur :** ${f.player || ''}  \n**Profession :** ${f.profession || ''}  \n**Race :** ${f.race || ''}\n\n## Caractéristiques\n\n| Carac | Score | Jet (x5) |\n|-------|-------|----------|\n${statRows}\n\n## Attributs dérivés\n\n- **Points de vie :** (CON + TAI) / 2 = ${d('hp')}\n- **Points de pouvoir :** POU = ${d('pp')}\n- **Bonus aux dégâts :** ${d('damage')}\n- **Bonus d'expérience :** INT / 2 = ${d('experience')}\n- **Mouvement :** ${f.movement || '10'}\n\n## Compétences\n\n- **Points professionnels :** ${professional}\n- **Points personnels :** ${personal}\n- **Total disponible :** ${professional + personal}\n- **Points répartis :** ${spent}\n- **Points restants :** ${professional + personal - spent}\n\n| Compétence | Base | Points répartis | Score final | Coche |\n|------------|------|------------------|-------------|-------|\n${skillRows}\n\n## Armes\n\n| Arme | % | Dégâts | Portée | PA |\n|------|---|--------|--------|----|\n${weaponRows}\n\n## Armure\n\n- **Type :** ${inline(f.armorType)}\n- **Points d'armure :** ${inline(f.armorPoints)}\n\n## Sorts / pouvoirs\n\n${bullets(f.powers)}\n\n## Équipement et richesse\n\n${bullets(f.equipment)}\n\n## Histoire et liens\n\n- **Origine :** ${inline(f.origin)}\n- **Liens avec les PNJ :** ${inline(f.npcLinks)}\n- **Liens avec les factions :** ${inline(f.factionLinks)}\n- **Motivation personnelle :** ${inline(f.motivation)}\n\n## Notes de jeu\n\n${bullets(f.notes)}\n\n---\n\nRetour: [[PJ/index_pj|Index PJ]]\n`;
}

function downloadMarkdown() {
  const blob = new Blob([toMarkdown()], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = filename(); document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  document.getElementById('pj-save-state').textContent = `Fiche enregistrée : ${filename()}`;
}

function openPdfPreview() {
  updateDerived();
  const data = collectData();
  data.skillGroups = SKILL_GROUPS.map(group => ({
    name: group,
    skills: ACTIVE_SKILLS
      .filter(({ skill: [, , skillGroup] }) => skillGroup === group)
      .map(({ skill: [name], index }) => ({ name, ...(data.skills[index] || {}) }))
      .concat(group === 'Magie & pouvoirs' ? data.spells.filter(spell => spell.name).map(spell => {
        const base = numberValue('intelligence') || 0;
        const points = Math.max(0, parseInt(spell.points, 10) || 0);
        return { name: spell.name, base, points, score: base + points, checked: spell.checked };
      }) : [])
  }));
  data.derived = Object.fromEntries(['hp', 'pp', 'damage', 'experience'].map(key => [
    key,
    form.querySelector(`[data-derived="${key}"]`)?.value || ''
  ]));
  data.budget = {
    professional: document.querySelector('[data-field="skillProfessionalPool"]')?.value || '0',
    personal: document.getElementById('pj-skill-personal').textContent,
    total: document.getElementById('pj-skill-total').textContent,
    spent: document.getElementById('pj-skill-spent').textContent,
    remaining: document.getElementById('pj-skill-remaining').textContent
  };
  data.generatedAt = new Date().toISOString();
  localStorage.setItem(PRINT_STORAGE_KEY, JSON.stringify(data));
  window.location.href = 'pj-print.html';
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
  const data = { fields: {}, stats: {}, skills: [], spells: [], weapons: [] };
  data.fields.name = (text.match(/^# (.+)$/m) || [])[1] || '';
  data.fields.player = valueAfter('Joueur', text); data.fields.profession = valueAfter('Profession', text); data.fields.race = valueAfter('Race', text);
  const statSection = section(text, 'Caractéristiques');
  STATS.forEach(([code, key]) => { const m = statSection.match(new RegExp(`\\|\\s*${code}\\s*\\|\\s*([^|]*)`)); data.stats[key] = m ? m[1].trim() : ''; });
  const derived = section(text, 'Attributs dérivés');
  data.fields.movement = (derived.match(/\*\*Mouvement\s*:\*\*\s*([^\n]*)/) || [])[1]?.trim() || '10';
  const skillSection = section(text, 'Compétences');
  data.fields.skillProfessionalPool = (skillSection.match(/\*\*Points professionnels\s*:\*\*\s*(\d+)/) || [])[1] || '325';
  data.skills = SKILLS.map(([name]) => {
    if (!name) return {};
    const importedNames = name === 'Intimidation/Persuasion' ? [name, 'Persuasion'] : [name];
    const row = skillSection.split(/\r?\n/).find(line => importedNames.includes(line.split('|')[1]?.trim())), cells = row?.split('|') || [];
    const modern = cells.length >= 7;
    return modern
      ? { base: cells[2]?.trim() || '', points: cells[3]?.trim() || '0', score: cells[4]?.trim() || '', checked: /^\[x\]$/i.test(cells[5]?.trim() || '') }
      : { score: cells[3]?.trim() || '', checked: /^\[x\]$/i.test(cells[4]?.trim() || '') };
  });
  const spellNames = new Set(SPELLS.map(([name]) => name));
  data.spells = skillSection.split(/\r?\n/).filter(line => {
    const name = line.split('|')[1]?.trim();
    return spellNames.has(name);
  }).slice(0, SPELL_SLOT_COUNT).map(line => {
    const cells = line.split('|');
    return { name: cells[1]?.trim() || '', points: cells[3]?.trim() || '0', checked: /^\[x\]$/i.test(cells[5]?.trim() || '') };
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
function formChanged(event) {
  if (event.target.matches('[data-field="profession"]')) {
    syncSpellSlotsFromForm();
    renderSpellRows();
  }
  if (event.target.matches('[data-spell-name]')) updateSpellOptions();
  changed();
}
form.addEventListener('input', formChanged);
form.addEventListener('change', formChanged);
document.getElementById('pj-add-weapon').addEventListener('click', () => { addWeaponRow(); changed(); });
document.getElementById('pj-download').addEventListener('click', downloadMarkdown);
document.getElementById('pj-pdf').addEventListener('click', openPdfPreview);
document.getElementById('pj-cloud-save').addEventListener('click', saveSheetToSupabase);
document.getElementById('pj-cloud-load').addEventListener('click', () => loadSheetFromSupabase());
document.getElementById('pj-transfer-open').addEventListener('click', openTransferDialog);
document.getElementById('pj-transfer-submit').addEventListener('click', transferSheetToRoom);
document.getElementById('pj-transfer-code').addEventListener('input', event => { event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); });
document.getElementById('pj-transfer-code').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); transferSheetToRoom(); } });
document.getElementById('pj-open').addEventListener('click', () => document.getElementById('pj-file').click());
document.getElementById('pj-file').addEventListener('change', event => { const file = event.target.files[0]; if (file) openMarkdown(file).catch(() => alert('Ce fichier Markdown ne peut pas être ouvert.')); event.target.value = ''; });
document.getElementById('pj-reset').addEventListener('click', () => {
  if (!confirm('Effacer le brouillon actuel et créer une nouvelle fiche ?')) return;
  localStorage.removeItem(STORAGE_KEY); form.reset(); spellSlots = Array.from({ length: SPELL_SLOT_COUNT }, () => ({ name: '', points: '0', checked: false })); renderSpellRows(); weaponsBody.innerHTML = ''; addWeaponRow(); updateDerived(); updateFilename(); changed();
});
autoLoadSheetFromSupabase();
