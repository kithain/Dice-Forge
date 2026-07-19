export const BRP_SPECIES = [
  {
    name: 'Humain',
    modifierText: 'Aucun modificateur',
    mov: 10,
    modifiers: {},
    suggestedProfessions: 'Toutes',
    culturalSkills: '',
    traits: 'Ambitieux, adaptable, déterminé',
    special: '',
    ageBands: [
      { min: 0, max: 15, label: 'Trop jeune' },
      { min: 16, max: 25, label: 'Jeune adulte' },
      { min: 26, max: 35, label: 'Adulte' },
      { min: 36, max: 50, label: 'Vétéran' },
      { min: 51, max: 70, label: 'Ancien' },
      { min: 71, max: 999, label: 'Vénérable' }
    ]
  },
  {
    name: 'Nain',
    modifierText: '+1D6 CON, +1D6 FOR, -1D6 DEX, -1D6 CHA',
    mov: 8,
    modifiers: {
      force: { sign: 1, count: 1, type: 6 },
      constitution: { sign: 1, count: 1, type: 6 },
      dexterite: { sign: -1, count: 1, type: 6 },
      charisme: { sign: -1, count: 1, type: 6 }
    },
    suggestedProfessions: 'Guerrier, Artisan, Soldat, Chasseur, Érudit, Prêtre',
    culturalSkills: 'Artisanat (Forge ou Maçonnerie) +10%, Connaissance (Géologie) +10%, Observation (Souterrains) +10%',
    traits: 'Rancunier, loyal, travailleur, têtu',
    special: 'Vision nocturne 30 m.',
    ageBands: [
      { min: 0, max: 24, label: 'trop jeune' },
      { min: 25, max: 69, label: 'Jeune Barbe' },
      { min: 70, max: 119, label: 'Adulte' },
      { min: 120, max: 149, label: 'Vétéran' },
      { min: 150, max: 199, label: 'Ancien' },
      { min: 200, max: 399, label: 'Longue-barbe' },
      { min: 400, max: 9999, label: 'Vénérable-ancien' }
    ]
  },
  {
    name: 'Elfe',
    modifierText: '+1D6 DEX, +1D6 CHA, -1D6 CON, -1D6 TAI',
    mov: 12,
    modifiers: {
      constitution: { sign: -1, count: 1, type: 6 },
      taille: { sign: -1, count: 1, type: 6 },
      dexterite: { sign: 1, count: 1, type: 6 },
      charisme: { sign: 1, count: 1, type: 6 }
    },
    suggestedProfessions: 'Sorcier, Érudit, Guerrier, Chasseur, Amuseur, Prêtre',
    culturalSkills: 'Arme de mêlée (Épée ou Arc) +10%, Discrétion (Forêt) +10%, Connaissance (Histoire) +10%',
    traits: 'Serein, mélancolique, élégant, distant',
    special: 'Vision nocturne 60 m. Peut apprendre la magie. Sorcier elfe : 1 sort supplémentaire.',
    ageBands: [
      { min: 0, max: 39, label: 'trop jeune' },
      { min: 40, max: 99, label: 'Jeune Asrai' },
      { min: 100, max: 299, label: 'Adulte' },
      { min: 300, max: 999, label: 'Vétéran' },
      { min: 1000, max: 5999, label: 'Ancien' },
      { min: 6000, max: 99999, label: 'Mémoire de la forêt' }
    ]
  },
  {
    name: 'Demi-Elfe',
    modifierText: '+1D6 DEX, +1D6 CHA, -1D6 CON',
    mov: 11,
    modifiers: {
      constitution: { sign: -1, count: 1, type: 6 },
      dexterite: { sign: 1, count: 1, type: 6 },
      charisme: { sign: 1, count: 1, type: 6 }
    },
    suggestedProfessions: 'Toutes, surtout Sorcier, Guerrier, Voleur, Érudit, Explorateur',
    culturalSkills: 'Une compétence au choix +10%',
    traits: 'Indépendant, charismatique, entre-deux-mondes',
    special: 'Vision nocturne 30 m. Sorcier demi-elfe : 1 sort supplémentaire.',
    ageBands: [
      { min: 0, max: 15, label: 'trop jeune' },
      { min: 16, max: 25, label: 'Jeune adulte' },
      { min: 26, max: 50, label: 'Adulte' },
      { min: 51, max: 90, label: 'Vétéran' },
      { min: 91, max: 150, label: 'Ancien' },
      { min: 151, max: 250, label: 'Relique' },
      { min: 251, max: 999, label: 'Âge presque impossible' }
    ]
  },
  {
    name: 'Demi-Orc',
    modifierText: '+1D6 FOR, +1D6 CON, -1D6 INT, -1D6 CHA',
    mov: 10,
    modifiers: {
      force: { sign: 1, count: 1, type: 6 },
      constitution: { sign: 1, count: 1, type: 6 },
      intelligence: { sign: -1, count: 1, type: 6 },
      charisme: { sign: -1, count: 1, type: 6 }
    },
    suggestedProfessions: 'Guerrier, Soldat, Chasseur, Tribal, Assassin, Voleur',
    culturalSkills: 'Bagarre +10%, Pistage +10%, Intimidation/Persuasion +10%',
    traits: 'Brutal, direct, marginal, colérique',
    special: 'Vision nocturne 15 m.',
    ageBands: [
      { min: 0, max: 11, label: 'trop jeune' },
      { min: 12, max: 17, label: 'Jeune brute' },
      { min: 18, max: 30, label: 'Adulte' },
      { min: 31, max: 45, label: 'Vétéran' },
      { min: 46, max: 60, label: 'Ancien' },
      { min: 61, max: 999, label: 'Survivant' }
    ]
  }
];

export const BRP_PROFESSIONS = [
  {
    name: 'Guerrier',
    tag: 'Combat',
    richesse: 'Pauvre à Moyen',
    skills: 'Bagarre, Défense, Lutte, Arme de mêlée (au choix), Arme de jet (au choix) + 5 parmi : Escalade, Arme de jet (Arc), Se cacher, Écouter, Saut, Langue (Autre), Équitation, Observation, Discrétion, Nage, Lancer, Pistage',
    special: ''
  },
  {
    name: 'Sorcier',
    tag: 'Magie',
    richesse: 'Aisé',
    skills: 'Artisanat (au choix), Intuition, Connaissance (Occulte), 2 autres Connaissances, Langue (Autre), Écouter, Représentation (Rituels), Intimidation/Persuasion, Recherche',
    special: 'Magie arcane. 6 sorts au niveau Héroïque. Sorts exclusifs : Déflagration, Foudre, Métamorphose, Invisibilité, Téléportation, Illusion, Émoussement, Affûtage.'
  },
  {
    name: 'Prêtre',
    tag: 'Magie',
    richesse: 'Moyen',
    skills: 'Baratin, Intuition, Connaissance (Histoire), Connaissance (Philosophie), Connaissance (Religion), Langue (Natale), Représentation (Rituels), Intimidation/Persuasion + 2 parmi : Connaissance (Occulte), Langue (Autre), Écouter, Alphabétisation, Représentation (Éloquence), Recherche, Statut, Enseignement',
    special: 'Magie divine. 6 sorts au niveau Héroïque. Utilise l’allégeance divine.'
  },
  {
    name: 'Voleur',
    tag: 'Ruse',
    richesse: 'Variable',
    skills: 'Estimation, Défense, Baratin, Se cacher, Discrétion + 5 parmi : Marchandage, Bagarre, Escalade, Déguisement, Manipulation Fine, Lutte, Intuition, Écouter, Saut, Connaissance (Droit), Intimidation/Persuasion, Observation',
    special: ''
  },
  {
    name: 'Chasseur',
    tag: '',
    richesse: 'Pauvre à Moyen',
    skills: 'Escalade, Défense, Se cacher, Connaissance (Histoire Naturelle), Écouter, Observation, Pistage, Arme de jet (Arc), Discrétion + 1 parmi : Bagarre, Premiers Secours, Saut, Équitation, Nage',
    special: ''
  },
  {
    name: 'Artisan',
    tag: '',
    richesse: 'Moyen',
    skills: 'Estimation, Art (au choix), Marchandage, 2 Artisanats (au choix), Observation, Recherche, Statut, Manipulation Fine et Réparation (au choix)',
    special: ''
  },
  {
    name: 'Noble',
    tag: '',
    richesse: 'Aisé à Riche',
    skills: 'Marchandage, Étiquette, Baratin, Intuition, Connaissance (Histoire), Intimidation/Persuasion, Statut, Arme de mêlée (au choix) + 2 parmi : Connaissance (Droit), Écouter, Langue (Autre), Représentation (Éloquence), Recherche, Équitation',
    special: ''
  },
  {
    name: 'Chaman',
    tag: 'Magie',
    richesse: 'Pauvre',
    skills: 'Art (au choix), Intuition, Connaissance (Histoire), Connaissance (Occulte), Langue (Natale), Écouter, Représentation (Rituels), Intimidation/Persuasion + 2 parmi : Artisanat, Baratin, Premiers Secours, Se cacher, Connaissance (Anthropologie), Langue (Autre), Médecine, Statut',
    special: 'Magie spirituelle. 6 sorts au niveau Héroïque. Sorts exclusifs : Transe, Esprit Gardien.'
  },
  {
    name: 'Érudit',
    tag: '',
    richesse: 'Moyen',
    skills: 'Langue (Autre), Langue (Natale), Intimidation/Persuasion, Recherche, Enseignement + 5 compétences de Connaissance ou Science appropriées',
    special: ''
  },
  {
    name: 'Assassin',
    tag: '',
    richesse: 'Aisé',
    skills: 'Défense, Se cacher, Écouter, Observation, Discrétion + 5 parmi : Bagarre, Déguisement, Lutte, Arme de mêlée (au choix), Arme de jet (au choix), Équitation, Lancer, Pistage',
    special: ''
  },
  {
    name: 'Soldat',
    tag: '',
    richesse: 'Pauvre à Moyen',
    skills: 'Bagarre, Escalade, Défense, Premiers Secours + 6 parmi : Commandement, Arme de mêlée (au choix), Arme de jet (au choix), Se cacher, Écouter, Saut, Équitation, Observation, Discrétion, Lancer',
    special: ''
  },
  {
    name: 'Amuseur',
    tag: '',
    richesse: 'Pauvre à Aisé',
    skills: 'Art (au choix), Déguisement, Baratin, Manipulation Fine, Intuition, Langue (Autre), Écouter, Représentation (au choix), Intimidation/Persuasion + 1 au choix',
    special: ''
  },
  {
    name: 'Explorateur',
    tag: '',
    richesse: 'Moyen',
    skills: 'Escalade, Langue (Autre), Intimidation/Persuasion, Recherche, Observation + 4 parmi : Connaissance (Histoire, Monde Naturel, ou Région), Baratin, Arme de jet (au choix), Navigation, Équitation, Nage, Pistage',
    special: ''
  },
  {
    name: 'Fermier',
    tag: '',
    richesse: 'Pauvre à Moyen',
    skills: 'Marchandage, Artisanat (au choix), Connaissance (Histoire Naturelle), Écouter, Observation + 5 parmi : Bagarre, Premiers Secours, Connaissance (Histoire), Équitation, Pistage, Arme de mêlée (au choix), Arme de jet (au choix)',
    special: ''
  },
  {
    name: 'Tribal',
    tag: '',
    richesse: 'Indigent à Pauvre',
    skills: 'Artisanat (au choix), Défense, Lutte, Se cacher, Connaissance (Histoire Naturelle), Observation, Lancer, Pistage + 2 parmi : Bagarre, Escalade, Premiers Secours, Écouter, Saut, Arme de mêlée (Lance ou Matraque), Arme de jet (Arc), Équitation, Discrétion, Nage',
    special: ''
  },
  {
    name: 'Marchand',
    tag: '',
    richesse: 'Moyen à Riche',
    skills: 'Estimation, Marchandage, Baratin, Intuition, Langue (Autre), Langue (Natale), Intimidation/Persuasion, Statut, Observation + 1 au choix',
    special: ''
  },
  {
    name: 'Étudiant',
    tag: 'Magie',
    richesse: 'Pauvre à Moyen',
    skills: 'Langue (Natale), Recherche + 8 au choix parmi : Art, Artisanat, Premiers Secours, Intuition, Connaissance (au choix), Langue (Autre), Écouter, Médecine, Représentation, Intimidation/Persuasion, Science (au choix)',
    special: 'Accès limité à la magie. 6 sorts au niveau Héroïque.'
  }
];

export function speciesByName(name) {
  return BRP_SPECIES.find(species => species.name === name) || BRP_SPECIES[0];
}

export function professionByName(name) {
  return BRP_PROFESSIONS.find(profession => profession.name === name) || null;
}
