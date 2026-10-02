import { BRP_SKILLS } from './brp-skills.js?v=20260925-medfan';
import { createVerbalObs } from './verbal-obs-control.js?v=20261002-v1';

export const WORD_TABLES = {
  "Persuasion": ["Raison", "Honneur", "Avenir", "Casuistique", "Verite", "Alliance", "Justice", "Confiance", "Logique", "Devoir", "Espoir", "Syllogisme", "Preuve", "Fait", "Stabilite", "Coherence", "Respect", "Bon sens", "Evidence", "Exegese", "Cause", "Legitimite", "Destin", "Serment", "Foi juree", "Parole donnee", "Peroraison", "Loyaute", "Droiture", "Equite", "Plaidoyer", "Temoignage", "Exorde", "Argument", "Precepte", "Doctrine", "Coutume", "Droit", "Sceau", "Sophisme", "Charte", "Traite", "Hommage", "Investiture", "Vassalite", "Jurisprudence", "Heritage", "Lignee", "Preseance", "Anatheme"],
  "Intimidation": ["Ombre", "Ruine", "Sang", "Consequence", "Estrapade", "Silence", "Cendres", "Force", "Menace", "Ordalie", "Limite", "Supplice", "Violence", "Fatalite", "Soumission", "Calvaire", "Chevalet", "Isolement", "Terreur", "Perte", "Chatiment", "Geole", "Brodequin", "Cachot", "Entraves", "Gibet", "Pilori", "Potence", "Echafaud", "Bourreau", "Lame", "Carcan", "Feu", "Fleau", "Roue", "Guerre", "Siege", "Pillage", "Devastation", "Desolation", "Autodafe", "Abime", "Tenebres", "Ostracisme", "Courroux", "Vengeance", "Sentence", "Ecorchement", "Proscription", "Bannissement"],
  "Séduction": ["Regard", "Mystere", "Frisson", "Fin'amor", "Promesse", "Flatterie", "Desir", "Chuchotement", "Charme", "Grace", "Tenson", "Intimite", "Complicite", "Parfum", "Trouble", "Caresse", "Aubade", "Vertige", "Emoi", "Etreinte", "Pastourelle", "Tentation", "Mirage", "Emprise", "Oeillade", "Sourire", "Soupir", "Virelai", "Murmure", "Confidence", "Courtoisie", "Galanterie", "Reverdie", "Louange", "Eloge", "Compliment", "Baiser", "Madrigal", "Tendresse", "Langueur", "Nonchalance", "Canso", "Elegance", "Parure", "Voile", "Faveur", "Deference", "Serenade", "Idylle", "Parangon"],
  "Négociation": ["Compromis", "Valeur", "Echange", "Interet", "Usure", "Marge", "Accord", "Garantie", "Profit", "Contrat", "Equilibre", "Concession", "Arrhes", "Echeance", "Partage", "Termes", "Nantissement", "Avantage", "Clause", "Evaluation", "Transaction", "Recul", "Pacte", "Tonlieu", "Marche", "Denier", "Ecu", "Bourse", "Hanse", "Prix", "Tarif", "Taxe", "Peage", "Aune", "Dime", "Tribut", "Setier", "Rancon", "Marchandise", "Denree", "Etal", "Lettre de change", "Halle", "Foire", "Caravane", "Guilde", "Amodiation", "Registre", "Affermage", "Quittance"],
  "Bluff / Duperie": ["Masque", "Malentendu", "Simulacre", "Illusion", "Alibi", "Omission", "Palimpseste", "Faux-semblant", "Rumeur", "Inattention", "Leurre", "Apocryphe", "Fabulation", "Sosie", "Coincidence", "Quiproquo", "Fourberie", "Diversion", "Distraction", "Truquage", "Perfidie", "Imposture", "Inversion", "Subterfuge", "Apparence", "Supercherie", "Miroir", "Reflet", "Voile", "Deguisement", "Mystification", "Costume", "Travestissement", "Comedie", "Charlatanisme", "Pantomime", "Comedien", "Saltimbanque", "Bateleur", "Jongleur", "Feinte", "Prestidigitation", "Tour", "Passe-passe", "Escamotage", "Aplomb", "Stratageme", "Audace", "Bagou", "Verve"],
  "Chantage / Pression": ["Secret", "Dossier", "Dette", "Lese-majeste", "Scandale", "Faute", "Proche", "Decheance", "Sacrilege", "Aveu", "Passe", "Risque", "Vulnerabilite", "Simonie", "Levier", "Compromission", "Represailles", "Decouverte", "Temoin", "Delation", "Ombrage", "Ultimatum", "Revelation", "Capture", "Forfaiture", "Otage", "Lettre", "Missive", "Sceau brise", "Archive", "Prevarication", "Parchemin", "Confession", "Adultere", "Batard", "Concussion", "Illegitimite", "Usurpation", "Peculat", "Complot", "Conjuration", "Cabale", "Parricide", "Delit", "Crime", "Meurtre", "Regicide", "Empoisonnement", "Duel", "Parjure"],
  "Provocation / Moquerie": ["Orgueil", "Faiblesse", "Pitie", "Amphigouri", "Lachete", "Ridicule", "Insulte", "Galimatias", "Suffisance", "Incompetence", "Ignorance", "Mepris", "Defi", "Logorrhee", "Temerite", "Echec", "Humiliation", "Arrogance", "Lapalissade", "Honte", "Heresie", "Trahison", "Faillite", "Truisme", "Insolence", "Sarcasme", "Ironie", "Beotisme", "Raillerie", "Moquerie", "Quolibet", "Insinuation", "Rictus", "Cuistrerie", "Derision", "Brimade", "Couardise", "Pedantisme", "Poltronnerie", "Vantardise", "Fanfaronnade", "Niaiserie", "Fatuite", "Pretention", "Outrecuidance", "Ineptie", "Presomption", "Betise", "Sottise", "Balourdise"],
  "Rassurer / Apaisement": ["Paix", "Calme", "Protection", "Refuge", "Onction", "Securite", "Ecoute", "Temperance", "Patience", "Viatique", "Ancrage", "Bienveillance", "Pardon", "Clemence", "Litanies", "Serenite", "Soutien", "Tolerance", "Douceur", "Vepres", "Harmonie", "Respiration", "Comprehension", "Repos", "Matines", "Foyer", "Atre", "Berceau", "Epaule", "Complies", "Main tendue", "Embrassade", "Veillee", "Chant", "Angelus", "Berceuse", "Conte du soir", "Onguent", "Oremus", "Baume", "Remede", "Infusion", "Tisane", "Kyrie", "Feu de camp", "Couverture", "Abri", "Sanctuaire", "Hospice", "Te Deum"]
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
  const skillIndex = BRP_SKILLS.findIndex(([name]) => name === 'Intimidation/Persuasion');
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
    let sheet;
    try {
      sheet = document.getElementById('character-sheet-frame')?.contentWindow?.diceForgeSheet?.getData()
        || JSON.parse(localStorage.getItem('dice-forge.pj-markdown.v1'));
    } catch { sheet = null; }
    const raw = sheet?.skills?.[skillIndex]?.score;
    const next = raw !== '' && raw != null && Number.isFinite(Number(raw)) && Number(raw) >= 0 ? Number(raw) : null;
    const nextCharacter = sheet?.fields?.name || 'Personnage';
    if (next !== score || nextCharacter !== character) reset();
    character = nextCharacter;
    score = next;
    document.getElementById('verbal-score').textContent = score === null
      ? 'Aucun score disponible. Ouvre la fiche complète et renseigne Intimidation/Persuasion.'
      : `${sheet?.fields?.name || 'Personnage'} · Intimidation/Persuasion : ${score} %`;
    rollButton.disabled = score === null;
    experienceButton.disabled = score === null;
    experienceStatus.textContent = sheet?.skills?.[skillIndex]?.checked ? 'La case d’expérience Intimidation/Persuasion est cochée.' : '';
    document.getElementById('verbal-level').textContent = score === null ? ''
      : `${levelFor(score).name} · ${levelFor(score).count} tirages sur 50 · 5 mots à conserver · ${levelFor(score).count - 5} joker(s). Les doublons sont relancés.`;
  }

  function render() {
    words.replaceChildren();
    const discarded = drawn.filter(entry => entry.discarded).length;
    progress.textContent = `${drawn.filter(entry => entry.used).length}/5 mots placés · ${discarded}/${jokers} joker(s) utilisé(s) · Repère de jeu, sans verdict automatique.`;
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
    syncObs({ character, approach: approach.value, words: drawn.map(({ word, discarded, used }) => ({ word, discarded, used })) });
  }

  rollButton.addEventListener('click', () => {
    refresh();
    if (score === null) return;
    const level = levelFor(score);
    jokers = level.count - 5;
    drawn = drawWords(WORD_TABLES[approach.value], level.count);
    render();
  });
  approach.addEventListener('change', reset);
  document.getElementById('verbal-refresh').addEventListener('click', refresh);
  experienceButton.addEventListener('click', () => {
    refresh();
    if (score === null) return;
    window.markBrpSkillExperience(skillIndex);
    document.getElementById('character-sheet-frame')?.contentWindow?.diceForgeSheet?.setSkillChecked(skillIndex, true);
    experienceStatus.textContent = 'Case d’expérience Intimidation/Persuasion cochée après validation du MJ. Pense à sauvegarder ta fiche en ligne.';
  });
  new MutationObserver(() => { if (panel.classList.contains('active')) refresh(); }).observe(panel, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('storage', event => { if (event.key === 'dice-forge.pj-markdown.v1') refresh(); });
  refresh();
}
