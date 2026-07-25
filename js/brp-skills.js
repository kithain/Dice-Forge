export const BRP_SKILL_GROUPS = ['Combat', 'Physique', 'Magie & pouvoirs', 'Social & mental', 'Connaissances', 'Pratique & divers'];

// Les emplacements vides conservent les index des anciennes sauvegardes.
export const BRP_SKILLS = [
  ['Estimation', '15 %', 'Pratique & divers'], ['Art (divers)', '05 %', 'Pratique & divers'], ['Artillerie (divers)', "Selon la spécialité d'arme", 'Combat'],
  ['Marchandage', '05 %', 'Social & mental'], ['Bagarre', '25 %', 'Combat'], ['Escalade', '40 %', 'Physique'], ['Commandement', '05 %', 'Social & mental'],
  ['Artisanat (divers)', '05 %', 'Pratique & divers'], ['Démolition', '01 %', 'Pratique & divers'], ['Déguisement', '01 %', 'Social & mental'], ['Défense', 'DEX×2', 'Combat'],
  ['Conduite (divers)', '20 % ou 01 %', 'Physique'], ['Arme à énergie (divers)', "Selon la spécialité d'arme", 'Combat'],
  ['Étiquette (divers)', '05 %', 'Social & mental'], ['Baratin', '05 %', 'Social & mental'], ['Manipulation fine', '05 %', 'Pratique & divers'],
  ['Arme à feu (divers)', "Selon la spécialité d'arme", 'Combat'], ['Premiers secours', '30 %', 'Pratique & divers'],
  ['Vol', '½ DEX', 'Magie & pouvoirs'], ['Jeux', 'INT+POU', 'Social & mental'], ['Lutte', '25 %', 'Combat'], ['', '', ''],
  ['Arme lourde (divers)', "Selon la spécialité d'arme", 'Combat'], ['Se cacher', '10 %', 'Physique'], ['Intuition', '05 %', 'Social & mental'],
  ['Saut', '25 %', 'Physique'], ['Connaissance (divers)', '05 % ou 00 %', 'Connaissances'], ['Langue (divers)', 'INT (ou ÉDU)×5 ou 00 %', 'Connaissances'],
  ['Écouter', '25 %', 'Social & mental'], ['Alphabétisation (option)', 'Selon profession', 'Connaissances'], ['', '', ''],
  ['Médecine', '05 %', 'Connaissances'], ['Arme de mêlée (divers)', "Selon la spécialité d'arme", 'Combat'],
  ['Arme de jet (divers)', "Selon la spécialité d'arme", 'Combat'], ['Navigation', '10 %', 'Pratique & divers'],
  ['', '', ''], ['Représentation', '05 %', 'Social & mental'], ['Intimidation/Persuasion', '15 %', 'Social & mental'],
  ['Pilotage (divers)', '01 %', 'Physique'], ['', '', ''], ['Psychothérapie', '01 % ou 00 %', 'Social & mental'],
  ['Réparation (divers)', '15 %', 'Pratique & divers'], ['Recherche', '25 %', 'Connaissances'], ['Équitation (divers)', '05 %', 'Physique'],
  ['Science (divers)', '01 %', 'Connaissances'], ['Sens', '10 %', 'Social & mental'], ['', '', ''],
  ['Tour de main', '05 %', 'Pratique & divers'], ['Observation', '25 %', 'Social & mental'], ['Statut', '15 % ou variable', 'Social & mental'], ['Discrétion', '10 %', 'Physique'],
  ['Stratégie', '01 %', 'Connaissances'], ['Nage', '25 %', 'Physique'], ['Enseignement', '10 %', 'Connaissances'],
  ['Compétence technique (divers)', '05 %', 'Connaissances'], ['Lancer', '25 %', 'Physique'], ['Pistage', '10 %', 'Pratique & divers']
];

export const BRP_NON_MEDFAN_SKILLS = new Set([
  'Démolition',
  'Arme à énergie (divers)',
  'Arme à feu (divers)',
  'Arme lourde (divers)',
  'Psychothérapie',
  'Compétence technique (divers)'
]);

export const BRP_ACTIVE_SKILLS = BRP_SKILLS
  .map((skill, index) => ({ skill, index }))
  .filter(({ skill }) => skill[0] && !BRP_NON_MEDFAN_SKILLS.has(skill[0]));
