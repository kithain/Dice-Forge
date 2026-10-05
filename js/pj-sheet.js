import { characteristicErrors, normalizeCharacteristics, archiveInactiveSkills, transferSheetData, isCreationLocked, skillSaveValues } from './sheet-validation.js?v=20261003-roster';
import { mountProgression } from './pj-progression.js?v=20261003-xp-frame';
import { getSupabaseClient } from './supabase-client.js?v=20261003-roster';
import { characterDraftKey } from './character-store.js?v=20261003-roster';
import { normalizeGenre } from './character-identity.js?v=20261005-genre';
import { mountCharacterRoster } from './character-roster.js?v=20261003-deletion';
import { SKILL_IDS, SPELL_IDS } from './character-ids.js?v=20261002-campaign-v2-r1';
import { normalizeSpells, magicBudget, magicErrors, mergeMagicSheet, patchMagicMarkdown, spellScore } from './pj-magic.js?v=20261003-learning';
import './tooltips.js?v=20261003-age-help';
import { showConfirm } from './toast.js?v=20261002-safe-confirm';
import { professionSkill, ageHelpText } from './creation-help.js?v=20261003-age-help';
import { creationBudget, creationBudgetErrors, creationValidationErrors } from './creation-budget.js?v=20261003-complete-budget';
import { professionByName } from './brp-data.js?v=20260715-combat-cleanup';
import { BRP_SKILL_GROUPS as SKILL_GROUPS, BRP_SKILLS as SKILLS, BRP_ACTIVE_SKILLS as ACTIVE_SKILLS } from './brp-skills.js?v=20260925-medfan';
import { readPrintInventory, storePrintSnapshot } from './pj-pdf-data.js?v=20261003-pdf';

const IS_EMBEDDED = new URLSearchParams(window.location.search).get('embedded') === '1';
const SYNC_FROM_GENERATOR = new URLSearchParams(window.location.search).get('syncGenerated') === '1';
if (IS_EMBEDDED) {
  document.body.classList.add('pj-embedded');
  // La page parente porte le défilement ; le cadre suit la hauteur du contenu.
  const sheetPage = document.querySelector('.pj-page');
  const frame = window.frameElement;
  if (frame && sheetPage) {
    new ResizeObserver(() => {
      const height = Math.ceil(sheetPage.getBoundingClientRect().bottom + window.scrollY);
      if (height > 0) frame.style.height = `${height + 2}px`;
    }).observe(sheetPage);
  }
}

const STORAGE_KEY = characterDraftKey();
const ROOM_STORAGE_KEY = 'diceforge_room';
const supabase = getSupabaseClient({ optional: true });

const STATS = [
  ['FOR', 'force', 'Puissance physique : soulever, pousser, briser ou retenir. Contribue au bonus aux dégâts.'],
  ['CON', 'constitution', 'Résistance du corps : fatigue, maladie et poison. Contribue aux points de vie.'],
  ['TAI', 'taille', 'Masse et gabarit du personnage. Contribue aux points de vie et au bonus aux dégâts.'],
  ['INT', 'intelligence', 'Capacité à comprendre, raisonner et trouver des solutions. Détermine les points personnels.'],
  ['POU', 'pouvoir', 'Force mentale et spirituelle. Sert à la magie, à la chance et aux points de pouvoir.'],
  ['DEX', 'dexterite', 'Vitesse, coordination et précision. Influence notamment Défense et Vol.'],
  ['APP', 'apparence', 'Apparence et présence visible du personnage. Influence sa première impression sociale.']
];

const DEFENSE_SKILL_INDEX = SKILLS.findIndex(([name]) => name === 'Défense');
// Ancien emplacement de Bouclier. Il reste réservé pour ne pas décaler les sauvegardes existantes.
const LEGACY_SHIELD_SKILL_INDEX = 46;

const WEAPON_CATALOG = [
  ['Dague', 'mixed', '1d4'], ['Gourdin', 'contact', '1d4'], ['Épée courte', 'contact', '1d6'],
  ['Rapière', 'contact', '1d8'], ['Épée longue', 'contact', '1d8 / 1d10'], ['Sabre', 'contact', '1d8'],
  ['Hachette', 'mixed', '1d6'], ['Hache de bataille', 'contact', '1d8 / 1d10'],
  ['Hache à deux mains', 'contact', '1d12'], ["Masse d'armes", 'contact', '1d8'],
  ['Marteau de guerre', 'contact', '1d8 / 1d10'], ['Pioche', 'contact', '1d8 / 1d10'],
  ['Fléau', 'contact', '1d8'], ['Lance', 'mixed', '1d6 / 1d8'], ['Hallebarde', 'contact', '1d10'],
  ['Pique', 'contact', '1d10'], ['Bâton', 'contact', '1d6 / 1d8'], ['Épée à deux mains', 'contact', '2d6'],
  ['Fronde', 'distance', '1d4'], ['Javelot', 'mixed', '1d6'], ['Arc court', 'distance', '1d6'],
  ['Arc long', 'distance', '1d8'], ['Arbalète légère', 'distance', '1d8'], ['Arbalète lourde', 'distance', '1d12'],
  ['Arbalète de poing', 'distance', '1d6'], ['Sarbacane', 'distance', '1d2'], ['Arquebuse naine', 'distance', '2d8']
].map(([name, attackType, damage]) => ({ name, attackType, damage }));

function weaponDefinition(name) {
  return WEAPON_CATALOG.find(weapon => weapon.name === name);
}

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
  'Art': 'Créer ou interpréter une œuvre artistique dans une spécialité choisie.',
  'Artillerie': "Utiliser une arme de siège ou une pièce d'artillerie adaptée à l'univers.",
  'Marchandage': "Négocier un prix, un échange ou les conditions d'un accord.",
  'Bagarre': 'Combattre à mains nues avec coups, prises simples et improvisation.',
  'Escalade': 'Grimper sur une paroi, un mur, un arbre ou une surface difficile.',
  'Commandement': 'Donner des ordres clairs, coordonner un groupe et maintenir son moral.',
  'Artisanat': "Fabriquer, entretenir ou examiner des objets d'un métier précis.",
  'Déguisement': "Modifier son apparence pour passer pour quelqu'un d'autre ou rester méconnaissable.",
  'Défense': 'Éviter, bloquer ou dévier une attaque par une esquive ou une parade adaptée.',
  'Conduite': 'Diriger un véhicule, un attelage ou une embarcation de la spécialité choisie.',
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
  'Arme de mêlée': 'Attaquer avec une arme de contact de la spécialité choisie.',
  'Arme de jet': 'Attaquer à distance avec un arc, une fronde ou une arme lancée selon la spécialité.',
  'Navigation': "S'orienter et tracer une route à l'aide du terrain, des cartes ou des astres.",
  'Représentation': 'Captiver un public par le chant, la musique, le théâtre, la danse ou le rituel.',
  'Intimidation/Persuasion': "Obtenir l'adhésion par la menace, l'autorité ou une argumentation directe.",
  'Pilotage': 'Contrôler un appareil ou moyen de transport complexe de la spécialité choisie.',
  'Réparation': 'Diagnostiquer une panne et remettre en état un objet ou mécanisme.',
  'Recherche': 'Trouver une information dans des archives, une bibliothèque ou un ensemble de documents.',
  'Équitation (divers)': 'Monter, guider et maîtriser une monture de la spécialité choisie.',
  'Alchimie': 'Identifier, préparer et transformer des substances alchimiques.',
  'Sens': 'Utiliser un sens particulier pour détecter, reconnaître ou analyser quelque chose.',
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
const spellsBody = document.getElementById('pj-spells');
const weaponsBody = document.getElementById('pj-weapons');
let saveTimer;
let spellSlots = [];
let spellSheetContext = null;
let magicEditRevision = 0;
let magicSaveInProgress = false;
let localEditRevision = 0;
let sheetLoadInProgress = false;

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
}

function renderBaseFields() {
  statsBody.innerHTML = STATS.map(([code, key, help]) => `<tr>
    <td class="pj-stats-code"><span class="pj-help-target has-tooltip" tabindex="0" data-tooltip="${escapeHtml(help)}">${code}<span class="tooltip-hint" aria-hidden="true">?</span></span></td>
    <td><input type="number" min="0" max="999" data-stat="${key}" placeholder="N/A" aria-label="Score ${code}, vide pour N/A"></td>
    <td class="pj-stat-roll" data-stat-roll="${key}">—</td>
  </tr>`).join('');

  skillsBody.innerHTML = SKILL_GROUPS.map(group => {
    const rows = ACTIVE_SKILLS.map(({ skill: [name, base, skillGroup], index }) => skillGroup === group ? `<tr>
      <td><span data-profession-star="${index}" title="Compétence proposée par la profession"></span><span class="pj-help-target has-tooltip" tabindex="0" data-tooltip="${escapeHtml(SKILL_HELP[name] || `Utiliser ${name} dans une situation appropriée.`)}">${escapeHtml(name)}<span class="tooltip-hint" aria-hidden="true">?</span></span></td>
      <td><div class="pj-base-wrap"><input type="number" min="0" max="999" data-skill-base="${index}" aria-label="Base ${escapeHtml(name)}" readonly tabindex="-1"><span class="pj-base-hint">${escapeHtml(base)}</span></div></td>
      <td><input type="number" min="0" max="999" value="0" data-skill-points="${index}" aria-label="Points répartis ${escapeHtml(name)}"></td>
      <td class="pj-skill-final" data-skill-final="${index}">0</td>
      <td><input type="checkbox" data-skill-check="${index}" aria-label="Coche ${escapeHtml(name)}" disabled title="Coche automatique après un jet réussi"></td>
    </tr>` : '').join('');
    return `<tr class="pj-skill-group"><td colspan="5">${group}</td></tr>${rows}`;
  }).join('');
  renderSpellRows();
  addWeaponRow();
}

function renderSpellRows() {
  spellsBody.replaceChildren();
  spellSlots.forEach((slot, index) => {
    if (!slot.name) return;
    const row = document.createElement('tr');
    row.dataset.spellRow = String(index);
    row.innerHTML = `<td><strong>${escapeHtml(slot.name)}</strong>${slot.allocation?.origin==='learning' ? `<small class="pj-spell-attribution">Appris : ${slot.allocation.learning_points} points réservés · XP : ${slot.allocation.xp_points || 0}</small>` : ''}</td>
      <td class="pj-spell-base" data-spell-base="${index}">0</td>
      <td><input type="number" min="0" max="999" step="1" value="${escapeHtml(slot.points)}" data-spell-points="${index}" aria-label="Points répartis ${escapeHtml(slot.name)}"></td>
      <td class="pj-skill-final" data-spell-final="${index}">0</td>
      <td><input type="checkbox" data-spell-check="${index}" aria-label="Coche ${escapeHtml(slot.name)}" disabled title="Coche automatique après un jet réussi"${slot.checked ? ' checked' : ''}></td>`;
    spellsBody.appendChild(row);
  });
  document.getElementById('pj-spells-table-wrap').hidden = !spellSlots.some(slot => slot.name);
  document.getElementById('pj-spells-empty').hidden = spellSlots.some(slot => slot.name);
  document.getElementById('pj-spells-help').textContent = spellSheetContext
    ? (isCreationLocked(spellSheetContext) ? 'Points acquis verrouillés ; les coches sont automatiques après une réussite.' : 'Sorts de la fiche Supabase : les noms sont fixes, les points répartis sont modifiables.')
    : 'Sorts de votre brouillon. La fiche Supabase est chargée automatiquement lorsque vous êtes dans une partie.';
  refreshNewSpellOptions();
  updateMagicCalculations();
  updateCreationControls();
}

function syncSpellSlotsFromForm() {
  spellSlots = spellSlots.map((slot, index) => ({ ...slot,
    points: form.querySelector(`[data-spell-points="${index}"]`)?.value ?? slot.points,
    checked: form.querySelector(`[data-spell-check="${index}"]`)?.checked ?? slot.checked
  }));
}

function magicContext() {
  if (spellSheetContext) return spellSheetContext;
  return {
    fields: { profession: fieldValue('profession'), skillProfessionalPool: fieldValue('skillProfessionalPool') },
    stats: { intelligence: numberValue('intelligence') || 0 },
    skills: SKILLS.map((_, index) => ({ points: form.querySelector(`[data-skill-points="${index}"]`)?.value || '0' })),
    spells: spellSlots
  };
}

function availableNewSpells() {
  if(magicContext().creation?.phase==='play')return SPELLS.map(([name])=>name);
  const profession = String(magicContext().fields?.profession || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const casterClass = Array.from(SPELLCASTER_ALIASES).find(([alias]) => profession.split(/[^a-z]+/).includes(alias))?.[1];
  return casterClass ? SPELLS.filter(([, classes]) => classes.includes(casterClass)).map(([name]) => name) : [];
}

function refreshNewSpellOptions() {
  const select = document.getElementById('pj-new-spell');
  const previous = select.value;
  const existing = new Set(spellSlots.map(slot => slot.name));
  const options = availableNewSpells().filter(name => !existing.has(name));
  select.innerHTML = '<option value="" disabled selected>Choisir un sort…</option>' + options.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
  if (options.includes(previous)) select.value = previous;
  const locked=isCreationLocked(spellSheetContext || loadedSheetData);
  const session=magicContext().progression?.session;
  const canLearn=magicContext().creation?.phase==='play' && session?.room_code===currentRoom()?.code && !session?.closed_at;
  const pending=learningPending();
  document.getElementById('pj-add-spell').disabled = (locked && !canLearn) || !!pending || !options.length;
  document.getElementById('pj-add-spell').textContent=locked ? '+ Apprendre un sort' : '+ Ajouter un sort';
  document.getElementById('pj-learning-fields').hidden=!locked;
  document.getElementById('pj-new-spell-allocation').hidden=locked;
  document.getElementById('pj-new-spell-score').hidden=locked;
  document.getElementById('pj-confirm-spell').textContent=locked ? 'Tirer et enregistrer 20 + 3D6' : 'Ajouter ce sort';
  document.getElementById('pj-learning-retry').hidden=!pending;
  document.getElementById('pj-magic-rules').textContent=locked
    ? 'Tous les sorts connus sont disponibles selon les PP et les conditions du sort. Un apprentissage vaut 20 + 3D6 %, puis les XP permettent de progresser.'
    : 'En création : score = INT + points répartis. Après validation, les nouveaux sorts utilisent un tirage d’apprentissage séparé.';
}

function updateMagicCalculations() {
  syncSpellSlotsFromForm();
  const budget = { ...currentCreationBudget(), intelligence: numberValue('intelligence') || 0 };
  renderCreationBudget(budget);
  for (const key of ['professional', 'personal', 'total', 'spent', 'remaining']) document.getElementById(`pj-magic-${key}`).textContent = budget[key];
  document.getElementById('pj-magic-remaining-card').classList.toggle('over-budget', budget.remaining < 0);
  form.querySelectorAll('[data-spell-row]').forEach(row => {
    const index = Number(row.dataset.spellRow);
    form.querySelector(`[data-spell-base="${index}"]`).textContent = spellSlots[index].allocation?.base ?? budget.intelligence;
    form.querySelector(`[data-spell-final="${index}"]`).textContent = spellScore(magicContext(),spellSlots[index]);
    const input = form.querySelector(`[data-spell-points="${index}"]`);
    input.dataset.previousPoints = input.value;
    input.max = String(Math.max(Number(input.value) || 0, 0,Math.min(100-budget.intelligence, Number(input.value)+ (professionByName(fieldValue('profession'))?.tag==='Magie' ? budget.remaining : budget.personalRemaining))));
  });
  const newInput = document.getElementById('pj-new-spell-points');
  newInput.max = String(Math.max(0, Math.min(100-budget.intelligence, professionByName(fieldValue('profession'))?.tag === 'Magie' ? budget.remaining : budget.personalRemaining)));
  const value = newInput.value;
  document.getElementById('pj-new-spell-score').textContent = `Score final : ${value === '' ? '—' : budget.intelligence + (Number(value) || 0)}`;
}

function setSpellStatus(message, error = false) {
  const status = document.getElementById('pj-spells-status');
  status.textContent = message;
  status.classList.toggle('pj-error', error);
}

function addSpell() {
  if (isCreationLocked(spellSheetContext || loadedSheetData)) return learnSpell();
  syncSpellSlotsFromForm();
  const name = document.getElementById('pj-new-spell').value;
  const input = document.getElementById('pj-new-spell-points');
  if (!name || input.value === '' || !input.checkValidity()) {
    setSpellStatus(`Choisissez un sort et attribuez-lui de 0 à ${input.max} points entiers disponibles.`, true);
    return;
  }
  if (spellSlots.some(slot => slot.name === name)) { setSpellStatus('Ce sort est déjà présent.', true); return; }
  const next = { name, points: input.value, checked: false };
  const proposed = [...spellSlots, next];
  const errors = magicErrors(magicContext(), proposed, availableNewSpells(), ACTIVE_SKILLS.map(({ index }) => index));
  errors.push(...creationBudgetErrors(budgetSheet(), budgetSkills(), proposed));
  if (errors.length) { setSpellStatus(errors.join(' '), true); return; }
  const empty = spellSlots.findIndex(slot => !slot.name);
  if (empty < 0) spellSlots.push(next); else spellSlots[empty] = next;
  document.getElementById('pj-spell-add-panel').hidden = true;
  document.getElementById('pj-new-spell-points').value = '';
  renderSpellRows();
  magicEditRevision += 1;
  changed();
  setSpellStatus(`« ${name} » ajouté. Cliquez sur « Sauvegarder les sorts » pour l’enregistrer.`);
}

function learningKey() {const r=currentRoom();return `diceforge:learn:${r?.userId}:${loadedSheetData?.state_id}:${r?.code}`;}
function learningPending() {try{return JSON.parse(localStorage.getItem(learningKey()));}catch{return null;}}
let learningBusy=false;
async function learnSpell(resume=false) {
  if(learningBusy)return;
  const room=currentRoom();
  if(!supabase || !room){setSpellStatus('Rejoignez une partie pour apprendre un sort.',true);return;}
  let args=learningPending();
  if(args && !resume){setSpellStatus('Récupérez d’abord l’apprentissage en attente.',true);return;}
  if(!args) {
    const name=document.getElementById('pj-new-spell').value;
    const source=document.getElementById('pj-learning-source').value.trim();
    const days=document.getElementById('pj-learning-days');
    if(!name || !source || !days.value || !days.checkValidity() || !document.getElementById('pj-learning-confirmed').checked) {
      setSpellStatus('Choisissez un sort, indiquez sa source et confirmez l’étude réussie après accord oral du MJ.',true);return;
    }
    args={p_spell:SPELL_IDS[name],p_source:source,p_method:document.getElementById('pj-learning-method').value,p_study_days:Number(days.value),p_confirmed:true};
  }
  learningBusy=true;form.inert=true;document.querySelector('.pj-toolbar').inert=true;
  const key=learningKey();
  try {
    if(!args.p_request) {
      const saved=await saveSheetToSupabase();
      if(!saved?.sheet_data)throw Error('Sauvegarde préalable impossible : aucun tirage effectué.');
      args={...args,p_state:saved.sheet_data.state_id,p_room:room.code,p_request:crypto.randomUUID(),p_expected_revision:saved.sheet_data.revision};
      localStorage.setItem(key,JSON.stringify(args));
    }
    const {data,error}=await supabase.rpc('df_learn_spell',args);
    if(error)throw error;
    if(!data?.sheet_data || !data.receipt)throw Error('Résultat incertain : récupérez le même apprentissage.');
    localStorage.removeItem(key);
    spellSheetContext=structuredClone(data.sheet_data);applyData(data.sheet_data);
    clearTimeout(saveTimer);localStorage.setItem(STORAGE_KEY,JSON.stringify(data.sheet_data));
    document.getElementById('pj-spell-add-panel').hidden=true;
    document.getElementById('pj-learning-confirmed').checked=false;
    let message=`${data.receipt.name} appris : 20 + ${data.receipt.dice.join(' + ')} = ${data.receipt.score} %. Attribution réservée, aucun XP dépensé.`;
    try {if(!await saveSheetToSupabase())message+=' Sort enregistré ; export à actualiser.';}catch {message+=' Sort enregistré ; export à actualiser après reconnexion.';}
    setSpellStatus(message);
  } catch(error) {
    if(error.code && /^([0-9]{2}|P0)/.test(error.code))localStorage.removeItem(key);
    setSpellStatus(error.message || 'Connexion interrompue : récupérez l’apprentissage.',true);
  } finally {learningBusy=false;form.inert=false;document.querySelector('.pj-toolbar').inert=false;refreshNewSpellOptions();}
}

function addWeaponRow(weapon = {}) {
  const row = document.createElement('tr');
  const definition = weaponDefinition(weapon.name);
  const legacyOption = weapon.name && !definition ? `<option value="${escapeHtml(weapon.name)}" selected>${escapeHtml(weapon.name)} (ancienne fiche)</option>` : '';
  const damage = weapon.damage || definition?.damage || '';
  row.innerHTML = `<td><select data-weapon="name" aria-label="Arme">
      <option value="">Choisir une arme…</option>
      ${legacyOption}
      ${WEAPON_CATALOG.map(item => `<option value="${escapeHtml(item.name)}"${weapon.name === item.name ? ' selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}
    </select></td>
    <td><input data-weapon="attackType" type="hidden" value="${escapeHtml(definition?.attackType || weapon.attackType || '')}"><span data-weapon-class>—</span></td>
    <td><input data-weapon="contactScore" value="${escapeHtml(weapon.contactScore || '')}" aria-label="Pourcentage au contact" readonly tabindex="-1"></td>
    <td><input data-weapon="distanceScore" value="${escapeHtml(weapon.distanceScore || '')}" aria-label="Pourcentage au jet" readonly tabindex="-1"></td>
    <td><input data-weapon="damage" value="${escapeHtml(damage)}" aria-label="Dégâts"></td>
    <td><button class="pj-remove" type="button" title="Supprimer cette arme" aria-label="Supprimer cette arme">×</button></td>`;
  row.querySelector('.pj-remove').addEventListener('click', () => {
    row.remove();
    if (!weaponsBody.children.length) addWeaponRow();
    changed();
  });
  weaponsBody.appendChild(row);
  syncWeaponScores();
}

function skillFinalScore(name) {
  const entry = ACTIVE_SKILLS.find(({ skill }) => skill[0] === name);
  return entry ? form.querySelector(`[data-skill-final="${entry.index}"]`)?.textContent || '' : '';
}

function syncWeaponScores() {
  const scores = {
    contact: skillFinalScore('Arme de mêlée'),
    distance: skillFinalScore('Arme de jet')
  };
  Array.from(weaponsBody.rows).forEach(row => {
    const name = row.querySelector('[data-weapon="name"]')?.value || '';
    const definition = weaponDefinition(name);
    const typeInput = row.querySelector('[data-weapon="attackType"]');
    if (typeInput && definition) typeInput.value = definition.attackType;
    const type = typeInput?.value || '';
    const classLabel = row.querySelector('[data-weapon-class]');
    if (classLabel) classLabel.textContent = type === 'mixed' ? 'Contact + jet' : type === 'distance' ? 'Jet' : type === 'contact' ? 'Contact' : '—';
    const contactScore = row.querySelector('[data-weapon="contactScore"]');
    const distanceScore = row.querySelector('[data-weapon="distanceScore"]');
    if (contactScore) {
      const applicable = type === 'contact' || type === 'mixed';
      contactScore.value = applicable ? scores.contact || '0' : '';
      contactScore.placeholder = applicable ? '' : '—';
      contactScore.title = applicable ? 'Score de la compétence Arme de mêlée.' : 'Cette arme ne possède pas de mode de contact dans le catalogue.';
    }
    if (distanceScore) {
      const applicable = type === 'distance' || type === 'mixed';
      distanceScore.value = applicable ? scores.distance || '0' : '';
      distanceScore.placeholder = applicable ? '' : '—';
      distanceScore.title = applicable ? 'Score de la compétence Arme de jet.' : 'Cette arme ne possède pas de mode de jet dans le catalogue.';
    }
  });
}

function applyWeaponSelection(select) {
  const row = select.closest('tr');
  const definition = weaponDefinition(select.value);
  if (!row) return;
  if (!definition) {
    if (!select.value) {
      row.querySelector('[data-weapon="attackType"]').value = '';
      row.querySelector('[data-weapon="damage"]').value = '';
    }
    syncWeaponScores();
    return;
  }
  row.querySelector('[data-weapon="attackType"]').value = definition.attackType;
  row.querySelector('[data-weapon="damage"]').value = definition.damage;
  syncWeaponScores();
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
  const ageHelp = document.getElementById('pj-age-help');
  if (ageHelp) ageHelp.dataset.tooltip = ageHelpText(fieldValue('race'));
  STATS.forEach(([, key]) => {
    const score = numberValue(key);
    form.querySelector(`[data-stat-roll="${key}"]`).textContent = score ? score * 5 : '—';
  });
  const con = numberValue('constitution'), size = numberValue('taille');
  const pow = numberValue('pouvoir'), int = numberValue('intelligence'), str = numberValue('force');
  const dex = numberValue('dexterite'), movement = Number(fieldValue('movement'));
  setDerived('hp', con && size ? Math.ceil((con + size) / 2) : '');
  setDerived('pp', pow || '');
  setDerived('damage', str && size ? damageBonus(str + size) : '');
  setDerived('experience', int ? Math.ceil(int / 2) : '');
  setDerived('course', dex && movement > 0 ? `${Math.min(95, (dex + movement) * 3)} %` : '');
  updateSkillCalculations();
}

function automaticSkillBase(name, label) {
  const dex = numberValue('dexterite') || 0;
  const intelligence = numberValue('intelligence') || 0;
  const power = numberValue('pouvoir') || 0;
  const profession = fieldValue('profession').toLocaleLowerCase('fr-FR');
  if (name === 'Défense') return dex * 2;
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
  ACTIVE_SKILLS.forEach(({ skill: [name, label], index }) => {
    const star = form.querySelector(`[data-profession-star="${index}"]`);
    if (star) star.textContent = professionSkill(name, fieldValue('profession')) ? '★ ' : '';
    const baseInput = form.querySelector(`[data-skill-base="${index}"]`);
    const pointsInput = form.querySelector(`[data-skill-points="${index}"]`);
    baseInput.value = isCreationLocked(loadedSheetData)
      ? loadedSheetData.skills?.[index]?.base ?? '' : Math.min(100, automaticSkillBase(name, label));
    const base = Math.max(0, parseInt(baseInput.value, 10) || 0);
    const points = Math.max(0, parseInt(pointsInput.value, 10) || 0);
    pointsInput.dataset.previousPoints = pointsInput.value;
    pointsInput.max = String(Math.max(0, 100 - base));
    form.querySelector(`[data-skill-final="${index}"]`).textContent = isCreationLocked(loadedSheetData)
      ? loadedSheetData.skills?.[index]?.score ?? '—' : base + points;
  });
  syncSpellSlotsFromForm();
  const shared = currentCreationBudget();
  const {professional, personal, total, outside} = shared;
  document.getElementById('pj-profession-help').textContent = isCreationLocked(loadedSheetData) ? ''
    : `★ Compétences proposées par votre profession (choix et spécialités selon le livret). ${professional} points professionnels pour ces compétences ; ${personal} points personnels pour les compétences de votre choix. Hors profession : ${outside}/${personal} points personnels. Ctrl + clic sur les flèches : ±10 points.`;
  for (const {skill:[name],index} of ACTIVE_SKILLS) {
    const input = form.querySelector(`[data-skill-points="${index}"]`);
    const current = Number(input.value) || 0;
    const available = professionSkill(name, fieldValue('profession')) ? shared.remaining : shared.personalRemaining;
    input.max = String(Math.max(current, 0, Math.min(Number(input.max), current + available)));
  }
  syncWeaponScores();
  document.getElementById('pj-skill-personal').textContent = personal;
  document.getElementById('pj-skill-total').textContent = total;
  document.getElementById('pj-skill-spent').textContent = shared.spent;
  document.getElementById('pj-skill-remaining').textContent = shared.remaining;
  document.getElementById('pj-skill-remaining-card').classList.toggle('over-budget', shared.remaining < 0);
  updateMagicCalculations();
}

function budgetSheet() {
  return { ...loadedSheetData, fields: { ...loadedSheetData.fields, profession: fieldValue('profession'), skillProfessionalPool: fieldValue('skillProfessionalPool') }, stats: { ...loadedSheetData.stats, intelligence: numberValue('intelligence') } };
}
function budgetSkills() {
  if (isCreationLocked(loadedSheetData)) return loadedSheetData.skills || [];
  const skills = SKILLS.map(() => ({}));
  ACTIVE_SKILLS.forEach(({ index }) => { skills[index] = { points: form.querySelector(`[data-skill-points="${index}"]`).value }; });
  return skills;
}
function currentCreationBudget() { return creationBudget(budgetSheet(), budgetSkills(), spellSlots); }
function renderCreationBudget(budget) {
  for (const prefix of ['skill', 'magic']) {
    for (const [key,value] of [['professional',budget.professional],['personal',budget.personal],['professional-remaining',budget.professionalRemaining],['personal-remaining',budget.personalRemaining]]) {
      const node = document.getElementById(`pj-${prefix}-${key}`); if (node) node.textContent = value;
    }
    document.getElementById(`pj-${prefix}-personal-card`)?.classList.toggle('over-budget', budget.personalRemaining < 0);
  }
  const errors = creationBudgetErrors(budgetSheet(), budgetSkills(), spellSlots);
  for (const id of ['pj-budget-status', 'pj-magic-budget-status']) {
    const status = document.getElementById(id);
    status.textContent = errors.join(' '); status.hidden = !errors.length;
  }
  const button = document.getElementById('pj-validate-creation');
  if (!isCreationLocked(loadedSheetData)) {
    const validationErrors = creationValidationErrors(budgetSheet(), budgetSkills(), spellSlots);
    button.disabled = loadedSheetData?.lifecycle?.status === 'dead' || !!validationErrors.length;
    button.title = validationErrors.join(' ');
    const status = document.getElementById('pj-creation-status');
    if (loadedSheetData.creation?.phase === 'draft') status.textContent = validationErrors.length
      ? 'Création en brouillon. ' + validationErrors.join(' ')
      : 'Tous les points initiaux sont répartis. Vous pouvez valider la création.';
  }
}
function constrainPointInput(input) {
  if (isCreationLocked(loadedSheetData) || input.value === '') return;
  syncSpellSlotsFromForm();
  const skills = budgetSkills(), spells = structuredClone(spellSlots);
  const isSkill = input.hasAttribute('data-skill-points');
  const index = Number(isSkill ? input.dataset.skillPoints : input.dataset.spellPoints);
  const name = isSkill ? SKILLS[index][0] : '';
  if (isSkill) skills[index].points = 0; else spells[index].points = 0;
  const budget = creationBudget(budgetSheet(), skills, spells);
  const eligible = isSkill ? professionSkill(name, fieldValue('profession')) : professionByName(fieldValue('profession'))?.tag === 'Magie';
  const base = isSkill ? Number(form.querySelector(`[data-skill-base="${index}"]`).value) : numberValue('intelligence');
  const maximum = Math.max(0, Math.min(100-base, eligible ? budget.remaining : budget.personalRemaining));
  const previous = Math.max(0, Number(input.dataset.previousPoints) || 0);
  const requested = Math.floor(Number(input.value) || 0);
  const value = Math.max(0, Math.min(100-base, requested <= previous ? requested : Math.min(requested,Math.max(previous,maximum))));
  if (value !== Number(input.value)) {
    input.value = String(value);
    return `Attribution limitée à ${value} points : budget ${eligible ? 'disponible' : 'personnel'} et score maximal de 100 %.`;
  }
}

function setDerived(key, value) { form.querySelector(`[data-derived="${key}"]`).value = value; }

function fieldValue(key) { return form.querySelector(`[data-field="${key}"]`)?.value.trim() || ''; }

// Les anciennes compétences inactives sont archivées hors de la fiche active.
let loadedSheetData = {};

function collectData() {
  syncSpellSlotsFromForm();
  const fields = {};
  form.querySelectorAll('[data-field]').forEach(input => { fields[input.dataset.field] = input.value; });
  fields.genre = normalizeGenre(loadedSheetData.fields?.genre ?? loadedSheetData.fields?.sex);
  fields.age = loadedSheetData.fields?.age ?? '';
  const { sex: legacySex, ...previousFields } = loadedSheetData.fields || {};
  const stats = {};
  STATS.forEach(([, key]) => { stats[key] = form.querySelector(`[data-stat="${key}"]`).value; });
  const skills = isCreationLocked(loadedSheetData)
    ? SKILLS.map((_, index) => structuredClone(loadedSheetData.skills?.[index] || {}))
    : SKILLS.map(() => ({}));
  ACTIVE_SKILLS.forEach(({ index }) => {
    skills[index] = skillSaveValues(loadedSheetData, index, {
      ...loadedSheetData.skills?.[index],
      id: SKILL_IDS[index],
      base: form.querySelector(`[data-skill-base="${index}"]`).value,
      points: form.querySelector(`[data-skill-points="${index}"]`).value,
      score: form.querySelector(`[data-skill-final="${index}"]`).textContent,
      checked: form.querySelector(`[data-skill-check="${index}"]`).checked
    });
  });
  const weapons = Array.from(weaponsBody.rows).map(row => Object.fromEntries(
    Array.from(row.querySelectorAll('[data-weapon]')).map(input => [input.dataset.weapon, input.value])
  ));
  const retiredSkills = archiveInactiveSkills(loadedSheetData, ACTIVE_SKILLS.map(({ index }) => index), SKILL_IDS);
  return { ...loadedSheetData, retiredSkills, fields: { ...previousFields, ...fields }, stats, skills,
    spells: spellSlots.map(slot => slot.name ? { ...slot, id: slot.id || SPELL_IDS[slot.name] } : slot), weapons };
}

function applyData(data) {
  if (!data || typeof data !== 'object') return;
  loadedSheetData = structuredClone(data);
  loadedSheetData.fields ||= {};
  loadedSheetData.fields.genre = normalizeGenre(data.fields?.genre ?? data.fields?.sex);
  form.querySelectorAll('[data-field]').forEach(input => { input.value = ''; });
  STATS.forEach(([, key]) => {
    const input = form.querySelector(`[data-stat="${key}"]`);
    if (input) input.value = '';
  });
  ACTIVE_SKILLS.forEach(({ index }) => {
    const points = form.querySelector(`[data-skill-points="${index}"]`);
    const check = form.querySelector(`[data-skill-check="${index}"]`);
    if (points) points.value = '0';
    if (check) check.checked = false;
  });
  Object.entries(data.fields || {}).forEach(([key, value]) => {
    const input = form.querySelector(`[data-field="${key}"]`);
    if (input?.tagName === 'SELECT' && value && !Array.from(input.options).some(option => option.value === String(value))) input.add(new Option(value, value));
    if (input) input.value = value ?? '';
  });
  form.querySelector('[data-field="genre"]').value = loadedSheetData.fields.genre;
  // Les brouillons du générateur et les anciennes fiches peuvent omettre ce champ.
  const professionalPool = form.querySelector('[data-field="skillProfessionalPool"]');
  if (!professionalPool.value.trim()) professionalPool.value = professionalPool.defaultValue;
  Object.entries(data.stats || {}).forEach(([key, value]) => {
    const input = form.querySelector(`[data-stat="${key}"]`); if (input) input.value = value ?? '';
  });
  spellSlots = normalizeSpells(data.spells);
  renderSpellRows();
  updateDerived();
  const savedSkills = Array.isArray(data.skills) ? data.skills : [];
  const legacyShield = savedSkills[LEGACY_SHIELD_SKILL_INDEX] || {};
  const shieldHasPointAllocation = legacyShield.points !== undefined;
  const shieldPoints = shieldHasPointAllocation ? Math.max(0, parseInt(legacyShield.points, 10) || 0) : 0;
  const shieldFinalScore = shieldHasPointAllocation ? 0 : Math.max(0, parseInt(legacyShield.score, 10) || 0);
  savedSkills.forEach((skill, index) => {
    const base = form.querySelector(`[data-skill-base="${index}"]`);
    const points = form.querySelector(`[data-skill-points="${index}"]`);
    const check = form.querySelector(`[data-skill-check="${index}"]`);
    if (points) {
      let migratedPoints = skill.points === undefined ? Math.max(0, (parseInt(skill.score, 10) || 0) - (parseInt(base?.value, 10) || 0)) : Math.max(0, parseInt(skill.points, 10) || 0);
      if (index === DEFENSE_SKILL_INDEX && !isCreationLocked(data)) {
        if (shieldHasPointAllocation) migratedPoints += shieldPoints;
        else if (shieldFinalScore) migratedPoints = Math.max(migratedPoints, shieldFinalScore - (parseInt(base?.value, 10) || 0));
      }
      points.value = migratedPoints;
    }
    if (check) check.checked = !!skill.checked || (index === DEFENSE_SKILL_INDEX && !!legacyShield.checked);
  });
  weaponsBody.innerHTML = '';
  (data.weapons?.length ? data.weapons : [{}]).forEach(addWeaponRow);
  updateDerived(); updateFilename(); updateCreationControls();
}

function changed() {
  localEditRevision += 1;
  updateDerived(); updateFilename();
  const state = document.getElementById('pj-save-state'); state.textContent = 'Modifications en cours…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(collectData()));
    if (state.textContent === 'Modifications en cours…') state.textContent = 'Brouillon enregistré localement';
  }, 250);
}

function setSkillChecked(index, checked, kind = 'skill') {
  if (!Number.isInteger(index) || index < 0 || !['skill', 'spell'].includes(kind)) return false;
  const checkbox = form.querySelector(`[data-${kind}-check="${index}"]`);
  if (kind === 'spell' && spellSlots[index]) spellSlots[index].checked = !!checked;
  if (!checkbox) return false;
  checkbox.checked = !!checked;
  changed();
  return true;
}

async function clearAllSkillChecks() {
  const checked = Array.from(form.querySelectorAll('[data-skill-check], [data-spell-check]')).filter(input => input.checked);
  if (!checked.length) {
    setStatus('Toutes les cases d’expérience sont déjà décochées.');
    return;
  }
  const countLabel = checked.length === 1 ? 'la case d’expérience' : `les ${checked.length} cases d’expérience`;
  const confirmed = await showConfirm(`Décocher ${countLabel} pour commencer une nouvelle partie ?`);
  if (!confirmed) return;
  checked.forEach(input => { input.checked = false; });
  localStorage.removeItem(`${STORAGE_KEY}.experience`);
  syncSpellSlotsFromForm();
  changed();
  setStatus(`${checked.length === 1 ? 'Case d’expérience décochée' : `${checked.length} cases d’expérience décochées`}. Pense à sauvegarder la fiche en ligne si nécessaire.`);
}

function setStatus(message) {
  document.getElementById('pj-save-state').textContent = message;
}

function currentRoom() {
  try {
    const room = JSON.parse(localStorage.getItem(ROOM_STORAGE_KEY));
    return room?.code && room?.player && room?.userId ? room : null;
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

async function saveSpells() {
  if (magicSaveInProgress) return;
  syncSpellSlotsFromForm();
  const budgetErrors = creationBudgetErrors(budgetSheet(), budgetSkills(), spellSlots);
  if (budgetErrors.length) { setSpellStatus('Sauvegarde refusée : ' + budgetErrors.join(' '), true); return; }
  if (!document.getElementById('pj-spell-add-panel').hidden) {
    setSpellStatus('Terminez l’ajout du nouveau sort ou annulez-le avant la sauvegarde.', true);
    return;
  }
  const proposed = structuredClone(spellSlots);
  const powers = form.querySelector('[data-field="powers"]').value;
  const revision = magicEditRevision;
  const room = currentRoom();
  if (!supabase || !room) {
    const errors = magicErrors(magicContext(), proposed, availableNewSpells(), ACTIVE_SKILLS.map(({ index }) => index));
    if (errors.length) { setSpellStatus(errors.join(' '), true); return; }
    let local = {};
    try { local = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { /* Nouveau brouillon. */ }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mergeMagicSheet(local, proposed, powers)));
    setSpellStatus('Sorts et notes de magie enregistrés localement. Rejoignez une partie pour les sauvegarder dans Supabase.');
    return;
  }
  magicSaveInProgress = true;
  document.getElementById('pj-save-spells').disabled = true;
  setSpellStatus('Sauvegarde des sorts…');
  try {
    const { data: saved, error: loadError } = await supabase.from('pj_sheets')
      .select('id, sheet_data, markdown_content, updated_at')
      .eq('user_id', room.userId).eq('room_code', room.code).eq('player_name', room.player).maybeSingle();
    if (loadError) throw loadError;
    if (!saved?.sheet_data) {
      setSpellStatus('Sauvegardez d’abord votre fiche depuis l’onglet « Fiche » pour créer son enregistrement dans la partie.', true);
      return;
    }
    spellSheetContext = structuredClone(saved.sheet_data);
    const errors = magicErrors(saved.sheet_data, proposed, availableNewSpells(), ACTIVE_SKILLS.map(({ index }) => index));
    updateMagicCalculations();
    if (errors.length) { setSpellStatus(errors.join(' '), true); return; }
    const merged = mergeMagicSheet(saved.sheet_data, proposed, powers);
    const { data: result, error } = await supabase.from('pj_sheets').update({
      sheet_data: merged,
      markdown_content: patchMagicMarkdown(saved.markdown_content, saved.sheet_data, merged),
      updated_at: new Date().toISOString()
    }).eq('id', saved.id).eq('user_id', room.userId).eq('updated_at', saved.updated_at)
      .select('id').maybeSingle();
    if (error) throw error;
    if (!result) { setSpellStatus('La fiche a changé pendant la sauvegarde. Recommencez pour repartir de ses dernières données.', true); return; }
    if (result.revision) loadedSheetData = { ...loadedSheetData, revision: result.revision };
    spellSheetContext = result.sheet_data || merged;
    if (magicEditRevision === revision) {
      spellSlots = normalizeSpells((result.sheet_data || merged).spells);
      renderSpellRows();
      clearTimeout(saveTimer);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(collectData()));
      setStatus('Sorts sauvegardés dans Supabase. Brouillon local conservé.');
    }
    setSpellStatus(magicEditRevision === revision
      ? 'Sorts et notes de magie sauvegardés dans Supabase.'
      : 'Sorts sauvegardés. Des modifications plus récentes restent à enregistrer.');
  } catch (error) {
    setSpellStatus('Sauvegarde des sorts impossible : ' + supabaseErrorMessage(error), true);
  } finally {
    magicSaveInProgress = false;
    document.getElementById('pj-save-spells').disabled = false;
  }
}

async function saveSheetToSupabase() {
  const room = currentRoom();
  if (!supabase) { setStatus('Supabase n’est pas configuré.'); return; }
  if (!room) { setStatus('Rejoins d’abord une partie dans Dice Forge.'); return; }
  if (!fieldValue('name')) { setStatus('Donne un nom au personnage avant la sauvegarde.'); return; }
  const budgetErrors = creationBudgetErrors(collectData());
  if (budgetErrors.length) { setStatus('Sauvegarde refusée : ' + budgetErrors.join(' ')); return; }

  const validationErrors = characteristicErrors(collectData().stats);
  const invalidInput = form.querySelector('[data-stat]:invalid');
  if (invalidInput) { invalidInput.reportValidity(); setStatus('Caractéristique invalide : indiquez un entier entre 0 et 999, ou laissez vide pour N/A.'); return; }
  if (validationErrors.length) { setStatus(validationErrors.join(' ')); return; }
  const button = document.getElementById('pj-cloud-save');
  button.disabled = true;
  setStatus('Sauvegarde Supabase en cours…');
  const data = collectData();
  data.stats = normalizeCharacteristics(data.stats);
  let result;
  try { result = await supabase.from('pj_sheets').upsert({
    user_id: room.userId,
    room_code: room.code,
    player_name: room.player,
    character_name: fieldValue('name'),
    sheet_data: data,
    markdown_content: toMarkdown(),
    updated_at: new Date().toISOString()
  }, { onConflict: 'room_code,player_name' }).select('*');
  } finally {button.disabled = false;}
  const { data: saved, error } = result;

  if (error) { setStatus('Sauvegarde impossible : ' + supabaseErrorMessage(error)); return; }
  const savedRow = Array.isArray(saved) ? saved[0] : saved;
  if (!savedRow?.sheet_data) { setStatus('Sauvegarde non confirmée : le serveur n’a pas renvoyé la fiche enregistrée. Actualisez la fiche avant de recommencer.'); return; }
  loadedSheetData = structuredClone(savedRow.sheet_data);
  const savedData = savedRow.sheet_data;
  spellSheetContext = structuredClone(savedData);
  renderSpellRows();
  updateCreationControls();
  updateDerived();
  clearTimeout(saveTimer);
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...savedData, revision: savedRow.revision || savedData.revision }));
  localStorage.removeItem(`${STORAGE_KEY}.experience`);
  setStatus(`Fiche de ${fieldValue('name')} sauvegardée dans la partie ${room.code}.`);
  return savedRow;
}


function updateCreationControls() {
  const source = spellSheetContext?.state_id === loadedSheetData?.state_id && isCreationLocked(spellSheetContext) ? spellSheetContext : loadedSheetData;
  const locked = isCreationLocked(source);
  const dead = source?.lifecycle?.status === 'dead';
  form.inert = dead;
  for (const id of ['pj-cloud-save', 'pj-save-spells', 'pj-validate-creation']) {
    const action = document.getElementById(id); if (action) action.disabled = dead;
  }
  form.classList.toggle('pj-creation-locked', locked);
  form.querySelectorAll('[data-stat], [data-skill-points], [data-spell-points], [data-field="skillProfessionalPool"], [data-field="profession"], [data-field="race"]').forEach(input => {
    input.readOnly = locked || (window.SUPABASE_CONFIG?.characterV2 && input.matches('[data-stat], [data-field="race"], [data-field="skillProfessionalPool"]'));
    if (input.matches('[data-stat]')) input.title = 'Valeur issue du générateur. Les ajustements se font dans la création.';
  });
  const button = document.getElementById('pj-validate-creation');
  button.hidden = source?.creation?.phase !== 'draft';
  const validationErrors = creationValidationErrors(budgetSheet(), budgetSkills(), spellSlots);
  button.disabled = dead || validationErrors.length > 0;
  button.title = validationErrors.join(' ');
  const status = document.getElementById('pj-creation-status');
  status.hidden = !source?.creation;
  const skillHelp = document.getElementById('pj-skills-help');
  skillHelp.textContent = locked ? 'Scores acquis et coches d’expérience.' : 'Répartissez les points disponibles. Le score final est calculé automatiquement : base + points répartis.';
  form.querySelectorAll('.pj-skill-group td').forEach(cell => { cell.colSpan = locked ? 3 : 5; });
  status.textContent = source?.creation?.phase === 'legacy_review'
    ? 'Fiche historique conservée. Une incohérence doit être tranchée par le MJ ; les points restent verrouillés.'
    : locked ? 'Fiche en jeu : points acquis verrouillés. Les coches sont automatiques après une réussite.'
      : 'Création en brouillon : caractéristiques issues du générateur. Répartissez vos points puis validez.';
  const session = source?.progression?.session;
  if (locked && session) {
    status.textContent += session.closed_at
      ? ` Session ${session.room_code} clôturée : ${session.lost} XP non dépensés perdus.`
      : ` Session ${session.room_code} : ${session.remaining}/${session.pool} XP disponibles.`;
  }
  if (dead) { button.hidden = true; status.hidden = false; status.textContent = 'PJ mort : fiche et historique conservés en lecture seule. Choisissez un autre PJ disponible.'; }
  else if (source?.creation?.phase === 'draft') status.textContent += validationErrors.length
    ? ' ' + validationErrors.join(' ')
    : ' Tous les points initiaux sont répartis : vous pouvez valider.';
}

async function validateCreation() {
  const room = currentRoom();
  if (!supabase || !room) { setStatus('Rejoignez une partie pour valider la création.'); return; }
  const errors = creationValidationErrors(collectData());
  if (errors.length) { setStatus('Validation refusée : ' + errors.join(' ')); return; }
  if (!await showConfirm('Valider cette création et verrouiller les caractéristiques et points initiaux ?', { confirmLabel: 'Valider la création' })) return;
  const button = document.getElementById('pj-validate-creation');
  button.disabled = true;
  form.inert = true;
  try {
    const saved = await saveSheetToSupabase();
    if (!saved?.sheet_data?.state_id || saved.sheet_data.creation?.phase !== 'draft') return;
    const { data, error } = await supabase.rpc('df_validate_creation', {
      p_state: saved.sheet_data.state_id, p_room: room.code,
      p_expected_revision: saved.sheet_data.revision
    });
    if (error) throw error;
    if (!data?.sheet_data) throw new Error('Validation de création sans fiche retournée.');
    spellSheetContext = structuredClone(data.sheet_data);
    applyData(data.sheet_data);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(collectData()));
    setStatus('Création validée. Les points initiaux sont verrouillés.');
  } catch (error) {
    setStatus('Validation impossible : ' + supabaseErrorMessage(error));
  } finally { form.inert = false; updateDerived(); }
}

async function restoreGeneratedIdentity(data, room) {
  if (!data?.fields) return;
  try {
    let query = supabase.from('personnages').select('genre, age')
      .eq('user_id', room.userId);
    if (window.SUPABASE_CONFIG?.characterV2 && data.character_id) {
      query = query.eq('character_id', data.character_id);
    } else if (data.fields.name) {
      query = query.eq('nom', data.fields.name);
    } else return;
    const { data: character, error } = await query.maybeSingle();
    if (!error && character?.genre != null) data.fields.genre = normalizeGenre(character.genre);
    if (!error && character && Object.hasOwn(character, 'age')) data.fields.age = character.age ?? '';
  } catch { /* La fiche reste accessible si l'identité du générateur est indisponible. */ }
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
  const magicRevisionAtStart = magicEditRevision;
  sheetLoadInProgress = true;
  button.disabled = true;
  setStatus(automatic ? 'Recherche automatique de la fiche Supabase…' : 'Chargement Supabase en cours…');
  let data = null;
  let error = null;
  try {
    const result = await supabase.from('pj_sheets')
      .select('sheet_data, character_name, updated_at')
      .eq('user_id', room.userId)
      .eq('room_code', room.code)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    data = result.data;
    error = result.error;
    if (!error && data?.sheet_data) await restoreGeneratedIdentity(data.sheet_data, room);
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
    setStatus(`Aucune fiche en ligne liée au compte de ${room.player}. Brouillon local conservé.`);
    return false;
  }
  if (!data.sheet_data || typeof data.sheet_data !== 'object') {
    setStatus('La fiche Supabase existe mais son contenu est illisible. Brouillon local conservé.');
    return false;
  }
  spellSheetContext = structuredClone(data.sheet_data);
  if (automatic && localEditRevision !== revisionAtStart) {
    if (magicEditRevision === magicRevisionAtStart) {
      spellSlots = normalizeSpells(data.sheet_data.spells);
      form.querySelector('[data-field="powers"]').value = data.sheet_data.fields?.powers || '';
      renderSpellRows();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(collectData()));
      setSpellStatus('Sorts et notes de magie chargés depuis Supabase.');
      setStatus('Sorts Supabase chargés ; les modifications locales de la fiche sont conservées.');
    } else {
      updateMagicCalculations();
      setStatus('Fiche Supabase trouvée ; vos modifications locales sont conservées.');
    }
    return false;
  }
  if (automatic) {
    let pending;
    try { pending = JSON.parse(localStorage.getItem(`${STORAGE_KEY}.experience`)); } catch { /* Aucune coche à fusionner. */ }
    const owner = JSON.stringify([data.sheet_data.fields?.name || '', data.sheet_data.fields?.player || '']);
    if (pending?.owner === owner && Array.isArray(pending.checks)) {
      pending.checks.forEach(({ kind, index, id, name }) => {
        const entries = data.sheet_data[kind === 'spell' ? 'spells' : 'skills'];
        if (id) index = entries?.findIndex(entry => entry.id === id);
        if (!Number.isInteger(index) || !entries?.[index]) return;
        if (kind === 'spell' && entries[index].name !== name) return;
        entries[index].checked = true;
      });
    }
  } else {
    localStorage.removeItem(`${STORAGE_KEY}.experience`);
  }
  applyData(data.sheet_data);
  clearTimeout(saveTimer);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(collectData()));
  const date = data.updated_at ? new Date(data.updated_at).toLocaleString('fr-FR') : '';
  setStatus(`Fiche chargée${automatic ? ' automatiquement' : ''} depuis Supabase${date ? ` — ${date}` : ''}.`);
  return true;
}

async function refreshSheetFromSupabase() {
  if (!supabase) {
    setStatus('Supabase n’est pas configuré.');
    return;
  }
  if (!currentRoom()) {
    setStatus('Rejoins d’abord une partie dans Dice Forge.');
    return;
  }

  const confirmed = await showConfirm(
    'Remplacer toutes les données de la fiche complète par la dernière sauvegarde Supabase ? Les modifications locales non sauvegardées seront perdues.'
  );
  if (!confirmed) return;
  await loadSheetFromSupabase();
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
  const { data: roomRows, error: roomError } = await supabase.from('rooms')
    .select('room_code')
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
    .select('*')
    .eq('user_id', room.userId)
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
  const data = transferSheetData(collectData(), existing);
  const validationErrors = characteristicErrors(data.stats);
  const invalidInput = form.querySelector('[data-stat]:invalid');
  if (invalidInput) { invalidInput.reportValidity(); button.disabled = false; setTransferStatus('Caractéristique invalide : indiquez un entier entre 0 et 999, ou laissez vide pour N/A.', 'error'); return; }
  if (validationErrors.length) { button.disabled = false; setTransferStatus(validationErrors.join(' '), 'error'); return; }
  data.stats = normalizeCharacteristics(data.stats);
  const { error } = await supabase.from('pj_sheets').upsert({
    user_id: room.userId,
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

function toMarkdownWithLegacyHeader() {
  const data = collectData(), f = data.fields, s = data.stats;
  const statRows = STATS.map(([code, key]) => `| ${code} | ${cell(s[key])} | ${s[key] ? Number(s[key]) * 5 : ''} |`).join('\n');
  const spellRows = data.spells.filter(spell => spell.name).map(spell => {
    const base = spell.allocation?.base ?? (Number(s.intelligence) || 0);
    const points = Math.max(0, parseInt(spell.points, 10) || 0);
    return `| ${cell(spell.name)} | ${base} | ${points} | ${spellScore(data,spell)} | [${spell.checked ? 'x' : ' '}] |`;
  }).join('\n');
  const skillRows = SKILL_GROUPS.map(group => {
    const rows = ACTIVE_SKILLS.map(({ skill: [name, , skillGroup], index }) => skillGroup === group
      ? `| ${name} | ${cell(data.skills[index].base)} | ${cell(data.skills[index].points)} | ${cell(data.skills[index].score)} | [${data.skills[index].checked ? 'x' : ' '}] |`
      : '').filter(Boolean).join('\n');
    const spells = group === 'Magie & pouvoirs' && spellRows ? `\n${spellRows}` : '';
    return `| **${group}** |  |  |  |  |\n${rows}${spells}`;
  }).join('\n');
  const weaponRows = data.weapons.filter(w => w.name || w.damage).map(w => {
    const score = w.attackType === 'mixed' ? `Contact ${w.contactScore || 0} / Jet ${w.distanceScore || 0}`
      : w.attackType === 'distance' ? `Jet ${w.distanceScore || 0}`
      : w.attackType === 'contact' ? `Contact ${w.contactScore || 0}` : '';
    return `| ${cell(w.name)} | ${cell(score)} | ${cell(w.damage)} |`;
  }).join('\n') || '|  |  |  |';
  const d = key => form.querySelector(`[data-derived="${key}"]`).value;
  const professional = Math.max(0, parseInt(f.skillProfessionalPool, 10) || 0);
  const personal = isCreationLocked(data) && data.creation?.personal != null ? data.creation.personal : (Number(s.intelligence) || 0) * 10;
  const spent = data.skills.reduce((sum, skill) => sum + (parseInt(skill.points, 10) || 0), 0)
    + data.spells.filter(spell => spell.name).reduce((sum, spell) => sum + (parseInt(spell.points, 10) || 0), 0);
  return `---\ntype: "pj"\njoueur: ${yaml(f.player)}\nprofession: ${yaml(f.profession)}\nrace: ${yaml(f.race)}\ngenre: ${yaml(f.genre)}\naliases: [${yaml(f.name || 'Personnage')}]\n---\n\n# ${f.name || 'Nom du personnage'}\n\n**Joueur :** ${f.player || ''}  \n**Profession :** ${f.profession || ''}  \n**Race :** ${f.race || ''}  \n**Âge :** ${f.age || ''}  \n**Genre :** ${f.genre || ''}\n\n## Caractéristiques\n\n| Carac | Score | Jet (x5) |\n|-------|-------|----------|\n${statRows}\n\n## Attributs dérivés\n\n- **Points de vie :** (CON + TAI) / 2 = ${d('hp')}\n- **Points de pouvoir :** POU = ${d('pp')}\n- **Bonus aux dégâts :** ${d('damage')}\n- **Bonus d'expérience :** INT / 2 = ${d('experience')}\n- **Mouvement :** ${f.movement || '10'}\n\n## Compétences\n\n- **Points professionnels :** ${professional}\n- **Points personnels :** ${personal}\n- **Total disponible :** ${professional + personal}\n- **Points répartis :** ${spent}\n- **Points restants :** ${professional + personal - spent}\n\n| Compétence | Base | Points répartis | Score final | Coche |\n|------------|------|------------------|-------------|-------|\n${skillRows}\n\n## Armes\n\n| Arme | % | Dégâts | Portée | PA |\n|------|---|--------|--------|----|\n${weaponRows}\n\n## Armure\n\n- **Type :** ${inline(f.armorType)}\n- **Points d'armure :** ${inline(f.armorPoints)}\n\n## Sorts / pouvoirs\n\n${bullets(f.powers)}\n\n## Équipement et richesse\n\n${bullets(f.equipment)}\n\n## Histoire et liens\n\n- **Origine :** ${inline(f.origin)}\n- **Liens avec les PNJ :** ${inline(f.npcLinks)}\n- **Liens avec les factions :** ${inline(f.factionLinks)}\n- **Motivation personnelle :** ${inline(f.motivation)}\n\n## Notes de jeu\n\n${bullets(f.notes)}\n\n---\n\nRetour: [[PJ/index_pj|Index PJ]]\n`;
}

function toMarkdown() {
  const course = form.querySelector('[data-derived="course"]')?.value || '';
  const data=collectData();
  const gained=isCreationLocked(data) ? Number(data.progression?.xp_points || 0)+Number(data.progression?.learning_points || 0) : 0;
  const markdown = toMarkdownWithLegacyHeader()
    .replace(/(\*\*Points restants :\*\* )(-?\d+)/,(_,prefix,remaining)=>prefix+(Number(remaining)+gained))
    .replace('\n\n## Armes',isCreationLocked(data) ? `\n\n## Progression\n\n- **XP acquis :** ${data.progression?.xp_points || 0}\n- **XP disponibles dans la session :** ${data.progression?.session?.remaining || 0}\n\n## Armes` : '\n\n## Armes')
    .replace('\n\n## Compétences', `\n- **Jet de Course :** (DEX + MOV) × 3 = ${course}\n\n## Compétences`)
    .replace('| Arme | % | Dégâts | Portée | PA |', '| Arme | % | Dégâts |')
    .replace('|------|---|--------|--------|----|', '|------|---|--------|')
    .replace("Bonus d'expérience", 'Pool d’XP par session (arrondi supérieur)');
  if (!isCreationLocked(data)) return markdown;
  return markdown
    .replace(/- \*\*Total disponible :\*\*[^\n]*\n- \*\*Points répartis :\*\*[^\n]*\n- \*\*Points restants :\*\*[^\n]*/, '- **Attributions acquises :** verrouillées ; les points initiaux ne sont plus redistribuables.')
    .replace('| Compétence | Base | Points répartis | Score final | Coche |', '| Compétence | Base | Points acquis | Score final | Coche |')
    .replace('- **XP acquis :**', `- **Points réservés aux sorts appris :** ${data.progression?.learning_points || 0}\n- **XP acquis :**`);
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
  }));
  data.derived = Object.fromEntries(['hp', 'pp', 'damage', 'experience', 'course'].map(key => [
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
  const room = currentRoom();
  const selectedCharacterId = window.SUPABASE_CONFIG?.characterV2 && room
    ? localStorage.getItem(`diceforge_character:${room.userId}:${room.code}`) : null;
  const characterId = data.character_id || selectedCharacterId;
  data.printInventory = data.character_id && selectedCharacterId && data.character_id !== selectedCharacterId
    ? null : readPrintInventory(localStorage, room, characterId);
  try {
    // Preserve edits made immediately before clicking Export; the debounce may still be pending.
    clearTimeout(saveTimer);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(collectData()));
    storePrintSnapshot(sessionStorage, data);
  } catch {
    document.getElementById('pj-save-state').textContent = 'Impossible de préparer le PDF : le stockage de cet onglet est indisponible ou plein. Exportez la fiche en Markdown pour conserver vos données.';
    return;
  }
  if (IS_EMBEDDED && window.top !== window) window.top.location.href = 'pj-print.html';
  else window.location.href = 'pj-print.html';
}

function valueAfter(label, text) {
  const match = text.match(new RegExp(`\\*\\*${label}[ \\t]*:\\*\\*[ \\t]*([^\\r\\n]*)`));
  return match ? match[1].trim().replace(/  $/, '').replace(/<br\s*\/?>/gi, '\n') : '';
}
function section(text, title) {
  const match = text.match(new RegExp(`## ${title}\\s*\\n([\\s\\S]*?)(?=\\n## |\\n---|$)`)); return match ? match[1].trim() : '';
}
function listText(text) { return text.split(/\r?\n/).map(line => line.replace(/^-\s*/, '')).filter(Boolean).join('\n'); }

function parseMarkdown(text) {
  const data = { fields: {}, stats: {}, skills: [], spells: [], weapons: [] };
  data.fields.name = (text.match(/^# (.+)$/m) || [])[1] || '';
  data.fields.player = valueAfter('Joueur', text); data.fields.profession = valueAfter('Profession', text); data.fields.race = valueAfter('Race', text); data.fields.age = valueAfter('Âge', text);
  data.fields.genre = normalizeGenre(valueAfter('Genre', text) || valueAfter('Sexe', text));
  const statSection = section(text, 'Caractéristiques');
  STATS.forEach(([code, key]) => { const m = statSection.match(new RegExp(`\\|\\s*${code}\\s*\\|\\s*([^|]*)`)); data.stats[key] = m ? m[1].trim() : ''; });
  const derived = section(text, 'Attributs dérivés');
  data.fields.movement = (derived.match(/\*\*Mouvement\s*:\*\*\s*([^\n]*)/) || [])[1]?.trim() || '10';
  const skillSection = section(text, 'Compétences');
  data.fields.skillProfessionalPool = (skillSection.match(/\*\*Points professionnels\s*:\*\*\s*(\d+)/) || [])[1] || '325';
  data.skills = SKILLS.map(([name]) => {
    if (!name) return {};
    const importedNames = name === 'Intimidation/Persuasion'
      ? [name, 'Persuasion']
      : name === 'Alchimie' ? [name, 'Science (divers)']
      : name === 'Défense' ? [name, 'Esquive']
        : ['Art', 'Artillerie', 'Artisanat', 'Conduite', 'Arme de mêlée', 'Arme de jet', 'Pilotage', 'Réparation'].includes(name)
          ? [name, `${name} (divers)`] : [name];
    const row = skillSection.split(/\r?\n/).find(line => importedNames.includes(line.split('|')[1]?.trim())), cells = row?.split('|') || [];
    const modern = cells.length >= 7;
    return modern
      ? { base: cells[2]?.trim() || '', points: cells[3]?.trim() || '0', score: cells[4]?.trim() || '', checked: /^\[x\]$/i.test(cells[5]?.trim() || '') }
      : { score: cells[3]?.trim() || '', checked: /^\[x\]$/i.test(cells[4]?.trim() || '') };
  });
  const legacyShieldRow = skillSection.split(/\r?\n/).find(line => line.split('|')[1]?.trim() === 'Bouclier');
  if (legacyShieldRow) {
    const cells = legacyShieldRow.split('|');
    const modern = cells.length >= 7;
    data.skills[LEGACY_SHIELD_SKILL_INDEX] = modern
      ? { points: cells[3]?.trim() || '0', score: cells[4]?.trim() || '', checked: /^\[x\]$/i.test(cells[5]?.trim() || '') }
      : { score: cells[3]?.trim() || '', checked: /^\[x\]$/i.test(cells[4]?.trim() || '') };
  }
  const spellNames = new Set(SPELLS.map(([name]) => name));
  data.spells = skillSection.split(/\r?\n/).filter(line => {
    const name = line.split('|')[1]?.trim();
    return spellNames.has(name);
  }).map(line => {
    const cells = line.split('|');
    return { name: cells[1]?.trim() || '', base:Number(cells[2]?.trim() || 0), points: cells[3]?.trim() || '0', checked: /^\[x\]$/i.test(cells[5]?.trim() || '') };
  });
  const weaponSection = section(text, 'Armes');
  data.weapons = weaponSection.split(/\r?\n/).filter(line => /^\|/.test(line) && !/Arme|---/.test(line)).map(line => {
    const c = line.split('|').slice(1); return { name:c[0]?.trim(),score:c[1]?.trim(),damage:c[2]?.trim() };
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

const sheetTabs = Array.from(document.querySelectorAll('.pj-tabs [role="tab"]'));
const progression = mountProgression({
 panel:document.getElementById('pj-progression-panel'),client:supabase,
 getSheet:collectData,getRoom:currentRoom,save:saveSheetToSupabase,confirm:showConfirm,
 getSaveError:()=>document.getElementById('pj-save-state').textContent,
 lock:value=>{form.inert=value;document.querySelector('.pj-toolbar').inert=value;},
 apply:data=>{clearTimeout(saveTimer);spellSheetContext=structuredClone(data);applyData(data);localStorage.setItem(STORAGE_KEY,JSON.stringify(data));}
});
function selectSheetTab(tab) {
  sheetTabs.forEach(button => {
    const selected = button === tab;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
    document.getElementById(button.getAttribute('aria-controls')).hidden = !selected;
  });
  document.querySelector('.pj-section-nav').hidden = tab.id !== 'pj-main-tab';
  document.querySelector('.pj-toolbar').hidden = ['pj-magic-tab','pj-progression-tab'].includes(tab.id);
  if(tab.id==='pj-progression-tab')progression.render();
  if (tab.id === 'pj-inventory-tab') {
    const frame = document.getElementById('pj-inventory-frame');
    if (!frame.getAttribute('src')) frame.src = frame.dataset.src;
    frame.contentWindow?.postMessage({ type: 'diceforge:inventory-refresh' }, location.origin);
  }
}
sheetTabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectSheetTab(tab));
  tab.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? sheetTabs.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + sheetTabs.length) % sheetTabs.length;
    selectSheetTab(sheetTabs[next]);
    sheetTabs[next].focus();
  });
});

renderBaseFields();
try { const draft = JSON.parse(localStorage.getItem(STORAGE_KEY)); if (draft) applyData(draft); } catch (error) { console.warn('Brouillon illisible', error); }
updateDerived(); updateFilename();
localStorage.setItem(STORAGE_KEY, JSON.stringify(collectData()));
function formChanged(event) {
  const allocationWarning = event.target.matches('[data-skill-points], [data-spell-points]') ? constrainPointInput(event.target) : null;
  if (event.target.matches('[data-skill-check], [data-spell-check]') && !event.target.checked) {
    const kind = event.target.hasAttribute('data-spell-check') ? 'spell' : 'skill';
    const index = Number(event.target.getAttribute(`data-${kind}-check`));
    try {
      const key = `${STORAGE_KEY}.experience`;
      const pending = JSON.parse(localStorage.getItem(key));
      if (Array.isArray(pending?.checks)) {
        pending.checks = pending.checks.filter(check => check.kind !== kind || check.index !== index);
        localStorage.setItem(key, JSON.stringify(pending));
      }
    } catch { /* Aucune coche en attente. */ }
  }
  if (event.target.matches('[data-weapon="name"]')) applyWeaponSelection(event.target);
  if (event.target.matches('[data-field="profession"]')) {
    syncSpellSlotsFromForm();
    renderSpellRows();
  }
  if (event.target.closest('#pj-magic-panel')) magicEditRevision += 1;
  changed();
  if (allocationWarning) setStatus(allocationWarning);
}
form.addEventListener('input', formChanged);
form.addEventListener('change', formChanged);
form.addEventListener('pointerdown', event => {
  if (event.target.matches('[data-skill-points], [data-spell-points]')) event.target.step = event.ctrlKey ? '10' : '1';
});
form.addEventListener('keydown', event => {
  if (event.target.matches('[data-skill-points], [data-spell-points]') && ['ArrowUp','ArrowDown'].includes(event.key)) event.target.step = event.ctrlKey ? '10' : '1';
});
document.addEventListener('pointerup', () => form.querySelectorAll('[data-skill-points], [data-spell-points]').forEach(input => { input.step = '1'; }));

async function loadArmorOptions() {
  const select = form.querySelector('[data-field="armorType"]');
  const response = await fetch('inventaire.html');
  if (!response.ok) return;
  const catalog = new DOMParser().parseFromString(await response.text(), 'text/html');
  const table = catalog.querySelector('#armures');
  const section = table?.tagName === 'TABLE' ? table : table?.closest('section') || table?.parentElement;
  for (const row of section?.querySelectorAll('tbody tr') || []) {
    const cells = Array.from(row.querySelectorAll('td')).map(cell => cell.textContent.trim());
    if (!cells[0] || Array.from(select.options).some(option => option.value === cells[0])) continue;
    const option = new Option(cells[0], cells[0]); option.dataset.protection = cells[3] || ''; select.add(option);
  }
}
loadArmorOptions().catch(error => console.warn('Catalogue des armures indisponible', error));
form.querySelector('[data-field="armorType"]').addEventListener('change', event => {
  if (!event.target.value) { form.querySelector('[data-field="armorPoints"]').value = ''; changed(); return; }
  const protection = event.target.selectedOptions[0]?.dataset.protection;
  if (protection !== undefined) { form.querySelector('[data-field="armorPoints"]').value = protection; changed(); }
});
document.getElementById('pj-add-weapon').addEventListener('click', () => { addWeaponRow(); changed(); });
document.getElementById('pj-clear-skill-checks').addEventListener('click', clearAllSkillChecks);
document.getElementById('pj-save-spells').addEventListener('click', saveSpells);
document.getElementById('pj-validate-creation').addEventListener('click', validateCreation);
document.getElementById('pj-add-spell').addEventListener('click', () => {
  refreshNewSpellOptions();
  document.getElementById('pj-spell-add-panel').hidden = false;
  document.getElementById('pj-new-spell').focus();
});
document.getElementById('pj-cancel-spell').addEventListener('click', () => {
  document.getElementById('pj-spell-add-panel').hidden = true;
  document.getElementById('pj-new-spell-points').value = '';
  setSpellStatus('');
});
document.getElementById('pj-confirm-spell').addEventListener('click', addSpell);
document.getElementById('pj-learning-retry').addEventListener('click',()=>learnSpell(true));
document.getElementById('pj-download').addEventListener('click', downloadMarkdown);
document.getElementById('pj-pdf').addEventListener('click', openPdfPreview);
document.getElementById('pj-cloud-save').addEventListener('click', saveSheetToSupabase);
document.getElementById('pj-cloud-load').addEventListener('click', refreshSheetFromSupabase);
document.getElementById('pj-transfer-open').addEventListener('click', openTransferDialog);
document.getElementById('pj-transfer-submit').addEventListener('click', transferSheetToRoom);
document.getElementById('pj-transfer-code').addEventListener('input', event => { event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); });
document.getElementById('pj-transfer-code').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); transferSheetToRoom(); } });
document.getElementById('pj-open').addEventListener('click', () => document.getElementById('pj-file').click());
document.getElementById('pj-file').addEventListener('change', event => { const file = event.target.files[0]; if (file) openMarkdown(file).catch(() => alert('Ce fichier Markdown ne peut pas être ouvert.')); event.target.value = ''; });
document.getElementById('pj-reset').addEventListener('click', async () => {
  const confirmed = await showConfirm('Attention : créer une nouvelle fiche effacera le brouillon actuel et ses modifications non sauvegardées. Une sauvegarde en ligne de la nouvelle fiche remplacera la fiche actuelle dans cette partie. Exportez votre personnage en Markdown ou PDF avant de continuer.', { confirmLabel: 'Créer une nouvelle fiche' });
  if (!confirmed) return;
  localStorage.removeItem(STORAGE_KEY); form.reset(); loadedSheetData = {}; spellSlots = []; spellSheetContext = null; document.getElementById('pj-spell-add-panel').hidden = true; setSpellStatus(''); renderSpellRows(); weaponsBody.innerHTML = ''; addWeaponRow(); updateDerived(); updateFilename(); changed();
});

window.diceForgeSheet = { setSkillChecked, getData: collectData, adoptCloudRevision(data) {
  if (loadedSheetData?.state_id === data.state_id) loadedSheetData.revision = data.revision;
} };
// Les autres onglets du navigateur reçoivent aussi les coches du lanceur.
window.addEventListener('storage', event => {
  if (event.key !== STORAGE_KEY || !event.newValue) return;
  let data;
  try { data = JSON.parse(event.newValue); } catch { return; }
  if (data?.fields?.name !== fieldValue('name') || data?.fields?.player !== fieldValue('player')) return;
  for (const [collection, kind] of [['skills', 'skill'], ['spells', 'spell']]) {
    if (!Array.isArray(data[collection])) continue;
    data[collection].forEach((entry, index) => {
      if (kind === 'spell' && entry?.name !== spellSlots[index]?.name) return;
      const checkbox = form.querySelector(`[data-${kind}-check="${index}"]`);
      if (checkbox) checkbox.checked = !!entry?.checked;
      if (kind === 'spell' && spellSlots[index]) spellSlots[index].checked = !!entry?.checked;
    });
  }
  localEditRevision += 1;
  setStatus('Coches d’expérience synchronisées. Pense à sauvegarder en ligne.');
});
mountCharacterRoster(document.getElementById('pj-character-roster'), {
 room: currentRoom(),
 beforeSelect: async () => {
  if (!await showConfirm('Changer de PJ ? Les modifications locales de cette fiche restent dans son brouillon. Sauvegardez-les en ligne avant de changer si nécessaire.')) return false;
  clearTimeout(saveTimer); localStorage.setItem(STORAGE_KEY, JSON.stringify(collectData())); return true;
 },
 onSelect: character => { window.top.location.href = `index.html?room=${encodeURIComponent(currentRoom().code)}${character.character_id ? '#fiche-personnage' : '#creation-personnage'}`; }
});
if (SYNC_FROM_GENERATOR) {
  setStatus('Caractéristiques et mouvement synchronisés depuis le personnage généré.');
} else {
  autoLoadSheetFromSupabase();
}
