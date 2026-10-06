import { BRP_SKILLS } from './brp-skills.js?v=20260925-medfan';
import { createVerbalObs } from './verbal-obs-control.js?v=20261006-cloud';
import { characterDraftKey } from './character-store.js?v=20261003-roster';

export const APPROACH_SKILLS = {
  Persuader: 'Intimidation/Persuasion',
  Intimider: 'Intimidation/Persuasion',
  'Séduire': 'Représentation',
  'Négocier': 'Marchandage',
  Bluffer: 'Baratin',
  Contraindre: 'Intimidation/Persuasion',
  Railler: 'Représentation',
  Apaiser: 'Intimidation/Persuasion'
};

export const WORD_TABLES = {
  "Persuader": [
    // Courants & MedFan (37)
    "Avenir", "Alliance", "Argument", "Bon sens", "Cause", "Charte", "Coherence", "Coutume", "Devoir", "Doctrine",
    "Droit", "Droiture", "Equite", "Espoir", "Evidence", "Fait", "Foi juree", "Heritage", "Hommage", "Honneur",
    "Justice", "Legitimite", "Lignee", "Logique", "Loyaute", "Parole donnee", "Plaidoyer", "Precepte", "Preuve", "Raison",
    "Respect", "Sceau", "Serment", "Stabilite", "Temoignage", "Traite", "Verite",
    // 25% Rares & MedFan (13)
    "Anatheme", "Casuistique", "Exegese", "Exorde", "Irenisme", "Investiture", "Jurisprudence", "Oratorie", "Peroraison", "Preseance",
    "Syllogisme", "Vassalite", "Veneris"
  ],

  "Intimider": [
    // Courants & MedFan (37)
    "Abime", "Bourreau", "Cachot", "Carnage", "Cendres", "Chatiment", "Desolation", "Devastation", "Echafaud", "Entraves",
    "Fatalite", "Feu", "Fleau", "Force", "Geole", "Gibet", "Guerre", "Lame", "Lethalite", "Limite",
    "Menace", "Ombre", "Perte", "Pilori", "Pillage", "Potence", "Ruine", "Sang", "Sentence", "Siege",
    "Silence", "Soumission", "Tenebres", "Terreur", "Tombeau", "Vengeance", "Violence",
    // 25% Rares & MedFan (13)
    "Autodafe", "Brodequin", "Calvaire", "Carcan", "Chevalet", "Courroux", "Ecorchement", "Estrapade", "Ostracisme", "Ordalie",
    "Proscription", "Supplice", "Thanatos"
  ],

  "Séduire": [
    // Courants & MedFan (37)
    "Baiser", "Caresse", "Charme", "Chuchotement", "Compliment", "Complicite", "Confidence", "Courtoisie", "Desir", "Elegance",
    "Eloge", "Emoi", "Emprise", "Etreinte", "Faveur", "Flatterie", "Galanterie", "Grace", "Idylle", "Intimite",
    "Langueur", "Louange", "Mirage", "Murmure", "Mystere", "Nonchalance", "Oeillade", "Parfum", "Parure", "Promesse",
    "Regard", "Serenade", "Sourire", "Soupir", "Tendresse", "Tentation", "Trouble",
    // 25% Rares & MedFan (13)
    "Aubade", "Ribaudie", "Polissonnerie", "Deference", "Gaudriole", "Madrigal", "Parangon", "Pastourelle", "Bacchanale", "Sortilege",
    "Concupiscence", "Vertige", "Badinage"
  ],

  "Négocier": [
    // Courants & MedFan (37)
    "Accord", "Avantage", "Bourse", "Caravane", "Clause", "Compromis", "Concession", "Contrat", "Denier", "Denree",
    "Echange", "Echeance", "Ecu", "Equilibre", "Etal", "Evaluation", "Foire", "Garantie", "Guilde", "Halle",
    "Interet", "Lettre de change", "Marchandise", "Marche", "Marge", "Pacte", "Partage", "Peage", "Prix", "Profit",
    "Quittance", "Rancon", "Tarif", "Taxe", "Termes", "Transaction", "Tribut",
    // 25% Rares & MedFan (13)
    "Affermage", "Amodiation", "Aune", "Composition", "Dime", "Hanse", "Nantissement", "Octroi", "Setier", "Tonlieu",
    "Tretel", "Usure", "Venteage"
  ],

  "Bluffer": [
    // Courants & MedFan (37)
    "Alibi", "Aplomb", "Apparence", "Artifice", "Audace", "Bagou", "Comedie", "Costume", "Deguisement", "Diversion",
    "Duperie", "Esbroufe", "Escamotage", "Fabulation", "Faux-semblant", "Feinte", "Fourberie", "Illusion", "Imposture", "Leurre",
    "Malentendu", "Masque", "Miroir", "Mystification", "Dissimulation", "Passe-passe", "Quiproquo", "Reflet", "Ruse", "Rumeur",
    "Simulacre", "Sosie", "Stratageme", "Subterfuge", "Supercherie", "Tour", "Verve",
    // 25% Rares & MedFan (13)
    "Apocha", "Apocryphe", "Bateleur", "Charlatanisme", "Grimoire", "Jongleur", "Palimpseste", "Pantomime", "Prestidigitation", "Saltimbanque",
    "Tergiversation", "Travestissement", "Thaumaturgie"
  ],

  "Contraindre": [
    // Courants & MedFan (Chantage, Secrets & Religion/Politique) (37)
    "Adultere", "Archive", "Aveu", "Batard", "Cabale", "Capture", "Complot", "Compromission", "Confession", "Conjuration",
    "Crime", "Decheance", "Delation", "Delit", "Dette", "Dossier", "Duel", "Faute", "Lettre", "Levier",
    "Meurtre", "Missive", "Omission", "Otage", "Parjure", "Passe", "Pression", "Proche", "Represailles", "Revelation",
    "Risque", "Sacrilege", "Scandale", "Secret", "Sous-entendu", "Temoin", "Vulnerabilite",
    // 25% Rares & MedFan (13)
    "Concussion", "Forfaiture", "Illegitimite", "Lese-majeste", "Ombrage", "Parricide", "Peculat", "Prevarication", "Regicide", "Simonie",
    "Sorcellerie", "Ultimatum", "Usurpation"
  ],

  "Railler": [
    // Courants & MedFan (37)
    "Arrogance", "Balourdise", "Betise", "Brimade", "Couardise", "Defi", "Derision", "Echec", "Faiblesse", "Fanfaronnade",
    "Fatuite", "Honte", "Humiliation", "Ignorance", "Incompetence", "Ineptie", "Insinuation", "Insolence", "Insulte", "Ironie",
    "Lachete", "Mepris", "Moquerie", "Niaiserie", "Orgueil", "Outrecuidance", "Pitie", "Poltronnerie", "Presomption", "Pretention",
    "Quolibet", "Raillerie", "Rictus", "Ridicule", "Sarcasme", "Sottise", "Suffisance",
    // 25% Rares & MedFan (13)
    "Amphigouri", "Beotisme", "Cuistrerie", "Galimatias", "Heresie", "Invective", "Lapalissade", "Logorrhee", "Pedantisme", "Satyre",
    "Temerite", "Truisme", "Vantardise"
  ],

  "Apaiser": [
    // Courants & MedFan (37)
    "Abri", "Ancrage", "Atre", "Baume", "Berceuse", "Berceau", "Bienveillance", "Calme", "Chant", "Clemence",
    "Comprehension", "Conte du soir", "Couverture", "Douceur", "Ecoute", "Embrassade", "Epaule", "Feu de camp", "Foyer", "Harmonie",
    "Hospice", "Infusion", "Main tendue", "Onguent", "Paix", "Pardon", "Patience", "Protection", "Refuge", "Remede",
    "Repos", "Respiration", "Sanctuaire", "Securite", "Serenite", "Soutien", "Tolerance",
    // 25% Rares & MedFan (13)
    "Angelus", "Complies", "Kyrie", "Litanies", "Matines", "Onction", "Oremus", "Relique", "Te Deum", "Temperance",
    "Tisane", "Veillee", "Viatique"
  ]
};

export function levelFor(score) {
  return score >= 90 ? { name: 'Maître', count: 8 } : score >= 70 ? { name: 'Expert', count: 7 }
    : score >= 40 ? { name: 'Intermédiaire', count: 6 } : { name: 'Novice', count: 5 };
}

function randomIndex(size) {
  const limit = Math.floor(4294967296 / size) * size;
  const values = new Uint32Array(1);
  do { crypto.getRandomValues(values); } while (values[0] >= limit);
  return values[0] % size + 1;
}

export function drawWords(table, count, roll = () => randomIndex(table.length)) {
  if (!Number.isInteger(count) || count < 0 || count > new Set(table).size) throw new RangeError("Nombre de mots à tirer invalide");
  const drawn = new Map();
  while (drawn.size < count) {
    const die = roll();
    if (!Number.isInteger(die) || die < 1 || die > table.length) throw new RangeError("Indice de mot invalide");
    drawn.set(table[die - 1], { die, word: table[die - 1], discarded: false, used: false });
  }
  return [...drawn.values()];
}

const panel = document.getElementById('panel-verbal');
if (panel) {
  const approach = document.getElementById('verbal-approach');
  const rollButton = document.getElementById('verbal-roll');
  const words = document.getElementById('verbal-words');
  const progress = document.getElementById('verbal-progress');
  const experienceButton = document.getElementById('verbal-experience');
  const experienceStatus = document.getElementById('verbal-experience-status');
  let skillIndex = -1;
  const syncObs = createVerbalObs();
  let character = 'Personnage';
  let score = null;
  let drawn = [];
  let jokers = 0;
  for (const name of Object.keys(WORD_TABLES)) approach.add(new Option(name, name));

  function reset() {
    drawn = [];
    words.replaceChildren();
    progress.textContent = '';
    syncObs(null);
  }

  function refresh() {
    const draftKey = characterDraftKey();
    let sheet = null;
    try {
      sheet = JSON.parse(localStorage.getItem(draftKey));
    } catch { /* Aucun brouillon pour ce PJ. */ }
    try {
      const frame = document.getElementById('character-sheet-frame')?.contentWindow;
      const frameKey = frame?.location?.href ? new URL(frame.location.href).searchParams.get('context') : null;
      // Une ancienne fiche peut rester visible pendant le changement de PJ.
      if (!frameKey || frameKey === draftKey) sheet = frame?.diceForgeSheet?.getData() || sheet;
    } catch { /* La fiche peut être en cours de chargement. */ }
    const skillName = APPROACH_SKILLS[approach.value];
    const nextSkillIndex = BRP_SKILLS.findIndex(([name]) => name === skillName);
    const raw = sheet?.skills?.[nextSkillIndex]?.score;
    const next = raw !== '' && raw != null && Number.isFinite(Number(raw)) && Number(raw) >= 0 ? Number(raw) : null;
    const nextCharacter = sheet?.fields?.name || 'Personnage';
    if (next !== score || nextCharacter !== character || nextSkillIndex !== skillIndex) reset();
    skillIndex = nextSkillIndex;
    character = nextCharacter;
    score = next;
    rollButton.disabled = score === null;
    experienceButton.disabled = score === null;
    experienceStatus.textContent = sheet?.skills?.[skillIndex]?.checked ? 'Expérience cochée.' : '';
    const level = levelFor(score);
    document.getElementById('verbal-level').textContent = score === null
      ? `${skillName} : score indisponible. Actualise depuis ta fiche.`
      : `${skillName} : Rang : ${level.name} · ${level.count}/5 mots à conserver · ${level.count - 5} joker(s).`;
  }

  function render(newDraw = false) {
    words.replaceChildren();
    const discarded = drawn.filter(entry => entry.discarded).length;
    progress.textContent = `${drawn.filter(entry => entry.used).length}/5 mots placés · ${discarded}/${jokers} joker(s) utilisé(s).`;
    drawn.forEach(entry => {
      const card = document.createElement('div');
      card.className = `verbal-word${entry.discarded ? ' discarded' : ''}${entry.used ? ' used' : ''}`;
      const title = document.createElement('strong');
      title.textContent = `${String(entry.die).padStart(2, '0')} · ${entry.word}`;
      card.append(title);
      if (jokers > 0) {
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'room-btn';
        toggle.textContent = entry.discarded ? 'Remettre le mot' : 'Écarter (joker)';
        toggle.disabled = !entry.discarded && discarded >= jokers;
        toggle.setAttribute('aria-pressed', String(entry.discarded));
        toggle.addEventListener('click', () => {
          entry.discarded = !entry.discarded;
          if (entry.discarded) entry.used = false;
          render();
        });
        card.append(toggle);
      }
      if (!entry.discarded) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'room-btn';
        button.textContent = entry.used ? '✓ Placé' : 'Marquer placé';
        button.setAttribute('aria-pressed', String(entry.used));
        button.addEventListener('click', () => {
          entry.used = !entry.used;
          render();
        });
        card.append(button);
      }
      words.append(card);
    });
    syncObs({ character, approach: approach.value, words: drawn.map(({ word, discarded, used }) => ({ word, discarded, used })) }, newDraw);
  }

  rollButton.addEventListener('click', () => {
    refresh();
    if (score === null) return;
    const level = levelFor(score);
    jokers = level.count - 5;
    drawn = drawWords(WORD_TABLES[approach.value], level.count);
    render(true);
  });
  approach.addEventListener('change', () => { reset(); refresh(); });
  document.getElementById('verbal-refresh').addEventListener('click', refresh);
  experienceButton.addEventListener('click', () => {
    refresh();
    if (score === null) return;
    window.markBrpSkillExperience(skillIndex);
    document.getElementById('character-sheet-frame')?.contentWindow?.diceForgeSheet?.setSkillChecked(skillIndex, true);
    experienceStatus.textContent = 'Expérience cochée. Pense à sauvegarder ta fiche.';
  });
  new MutationObserver(() => { if (panel.classList.contains('active')) refresh(); }).observe(panel, { attributes: true, attributeFilter: ['class'] });
  document.getElementById('character-sheet-frame')?.addEventListener('load', refresh);
  window.addEventListener('diceforge:character-loaded', refresh);
  window.addEventListener('storage', event => {
    if (event.key === characterDraftKey() || event.key === 'diceforge_room' || event.key?.startsWith('diceforge_character:')) refresh();
  });
  refresh();
}
