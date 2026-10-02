// Généré depuis data/alchimie.md par scripts/sync_alchemy_rules.py.
export const ALCHEMY_POTIONS = [
  {
    "name": "Liqueur de courtoisie",
    "effect": "Dissimulée dans une boisson ou administrée directement.\n\nLa cible effectue un test de CON×5.\n\n- Réussite : La cible résiste à l'effet.\n\n- Échec : Somnolence pendant 1D4 heures. -20% à Observation, Intuition et aux actions.\n  La cible s'endort si elle n'est pas régulièrement stimulée.",
    "backlash": "Aucun contrecoup indiqué."
  },
  {
    "name": "Brume de léthargie",
    "effect": "Libère un nuage dans un rayon de 3 mètres.\n\nLes créatures présentes effectuent un test de CON×5 −20 points.\n\n- Réussite : La créature résiste à l'effet.\n\n- Échec : Endormissement immédiat pendant 1D6 rounds.\n\nUne blessure infligeant une perte de PV ou un contact  violent met immédiatement fin à ce sommeil.",
    "backlash": "Aucun contrecoup indiqué."
  },
  {
    "name": "Huile du dernier argument",
    "effect": "Quantité : Permet d'enduire 1 arme ou 2 projectiles. Chaque enduit est consommé au premier coup infligeant des dégâts tranchants ou perforants.\n\nLe poison s'active lors du premier coup infligeant des dégâts tranchants ou perforants.\n\nLa cible effectue un test de CON×5.\n\n- Réussite : La cible résiste au poison.\n\n- Échec : Subit 1D4 PV de dégâts supplémentaires par round pendant 3 rounds.\n\nLe même poison ne se cumule pas sur une cible : une nouvelle exposition pendant ces 3 rounds n'ajoute aucun dégât, ne prolonge pas la durée et ne déclenche pas de nouveau test. Une fois l'effet terminé, une nouvelle exposition se résout normalement.",
    "backlash": "Aucun contrecoup indiqué."
  },
  {
    "name": "Larmes de veuve",
    "effect": "Propriété : Inodore et incolore.\n\nLe poison agit environ 10 minutes après ingestion.\n\nLa cible effectue un test de CON×5 −20 points.\n\n- Réussite : La cible résiste au poison.\n\n- Échec : Subit 2D6 PV de dégâts. -1D4 FOR pendant 24 heures.",
    "backlash": "Aucun contrecoup indiqué."
  },
  {
    "name": "Poudre d'éclat du mage",
    "effect": "La fiole est utilisée avec la compétence Lancer.\n\nZone d'effet : rayon de 2 mètres.\n\n- Inflige 1D8 PV de dégâts de choc.\n\n- Ignore 2 PA d'armure.",
    "backlash": "Aucun contrecoup indiqué."
  },
  {
    "name": "Bouche d'enfer",
    "effect": "Produit une violente déflagration.\n\nZone d'effet : rayon de 4 mètres.\n\n- Inflige 3D6 PV de dégâts.\n\n- Ignore la moitié des PA d'armure.\n\n- Les créatures touchées effectuent un test de DEX.\n\n- Échec au test de DEX : La créature tombe à terre.",
    "backlash": "Aucun contrecoup indiqué."
  },
  {
    "name": "Feu d'alchimiste",
    "effect": "Zone d'effet : rayon de 2 mètres.\n\n- Inflige 2D6 PV à l'impact.\n\n- Les créatures touchées prennent feu.\n\n- Inflige ensuite 1D4 PV par round pendant 3 rounds.\n\nUne action permet d'éteindre les flammes.",
    "backlash": "Aucun contrecoup indiqué."
  },
  {
    "name": "Linceul de naphte",
    "effect": "Produit des flammes alchimiques extrêmement difficiles à étouffer. Toutes les créatures dans la zone subissent les effets, sans distinction : PJ, PNJ, alliés et utilisateur compris. Ce produit est volontairement destructeur et doit être utilisé avec précaution.\n\nZone d'effet : rayon de 3 mètres.\n\n- Inflige 2D6 PV à l'impact.\n\n- Inflige ensuite 1D6 PV par round pendant 3 rounds.\n\n- Ignore l'armure.",
    "backlash": "Aucun contrecoup indiqué."
  },
  {
    "name": "Sang de ver pourpre",
    "effect": "- Corrode une serrure ordinaire en 1D6 minutes.\n\n- Inflige 1D6 PV de dégâts.\n\n- Réduit de 1 PA l'armure touchée.",
    "backlash": "Aucun contrecoup indiqué."
  },
  {
    "name": "Bave de rouille",
    "effect": "- Réduit de 1D4 PA la protection de l'armure touchée.\n\n- Dégrade des chaînes, barreaux ou grosses serrures en 1D4 rounds.",
    "backlash": "Aucun contrecoup indiqué."
  },
  {
    "name": "Brume d'ombre",
    "effect": "Crée une fumée opaque dans un rayon de 5 mètres.\n\nDurée : 1D6 rounds.\n\n- -30% aux attaques à distance.\n\n- -30% à la Observation.",
    "backlash": "Aucun contrecoup indiqué."
  },
  {
    "name": "Poussière d'éclat solaire",
    "effect": "Produit une violente détonation lumineuse et sonore dans un rayon de 4 mètres.\n\nLes créatures présentes effectuent un test de CON×5 −20 points.\n\n- Réussite : La créature résiste à l'éblouissement.\n\n- Échec : Aveuglée et étourdie pendant 1D4 rounds. -40% aux Actions.\n  Esquive divisée par 2.",
    "backlash": "Aucun contrecoup indiqué."
  },
  {
    "name": "Sang de berserker",
    "effect": "Durée : 1D6 rounds.\n\n- +20% aux attaques de corps à corps.\n\n- +1D4 dégâts.\n\n- Ignore les malus liés aux blessures.",
    "backlash": "à la fin de l'effet, test de CON×5.\n\n- Réussite (Épuisement musculaire) : -20 % aux actions physiques pendant 1d4 demi-heures, impossible de sprinter pendant cette durée.\n- Échec (Effondrement) : chute à terre, incapable d'agir ou de se défendre pendant 1D4 rounds,  perte de 1D4 PV. Ensuite, -30 % aux actions physiques et impossibilité de sprinter jusqu'à un repos long.\nConséquences RP\nmains tremblantes, sueurs abondantes et mâchoire crispée pendant la récupération. En cas d'échec, des courbatures empêchent toutes action physique autre que la marche."
  },
  {
    "name": "Œil de Lyncée",
    "effect": "Durée : 1D6 × 10 minutes.\n\n- Permet de voir dans l'obscurité.\n\n- +20% à la Observation.\n\n- +20% aux tests de Tir et de Lancer.",
    "backlash": "à la fin de l'effet, test de CON×5.\n\n- Réussite  (Photophobie) : -20 % aux actions reposant sur la vue pendant 1d4 demi-heures, porté à -30 % sous une lumière vive.\n- Échec  (Crise oculaire) : cécité pendant 10 minutes. Ensuite, -30 % aux actions reposant sur la vue jusqu'à un repos long.\nConséquences RP\nyeux rougis, larmoiement et besoin de pénombre pendant la récupération. Lors de la cécité, se déplacer exige un guide ou progresser à tâtons."
  },
  {
    "name": "Cuirasse de titan",
    "effect": "Durée : 1D6+2 rounds.\n\n- +4 PA naturels.\n\n- +20% aux tests de FOR.",
    "backlash": "à la fin de l'effet, test de CON×5 −20 points.\n\n- Réussite (Raideur musculaire) : -3 DEX, -20 % en Esquive et déplacement réduit de moitié pendant 1d4 demi-heures.\n- Échec  (Pétrification partielle) : perte de 2D4 PV, incapable de se déplacer, d'agir ou de se défendre pendant 1D6 rounds. Ensuite, -3 DEX, -30 % aux actions physiques et déplacement réduit de moitié jusqu'à un repos long.\nConséquences RP\npeau marbrée, articulations craquantes et démarche raide pendant la récupération. En cas d'échec, paralysie suivit d'une sensation de raideur dans les membres."
  },
  {
    "name": "Souffle de djinn",
    "effect": "Durée : 1D4+2 rounds.\n\n- +20% DEX.\n\n- +20% Esquive.\n\n- Initiative doublée.\n\n- +1 action par round.",
    "backlash": "à la fin de l'effet, test de CON×5 −20 points.\n\n- Réussite  (Épuisement nerveux) : incapable d'agir ou de se défendre pendant 1 round. Ensuite, -30 % aux actions physiques, déplacement réduit de moitié et impossibilité de sprinter pendant 4 heures.\n- Échec  (Effondrement nerveux) : perte de 1D6 PV et perte de connaissance pendant 1D6 minutes. Au réveil, -40 % aux actions physiques, déplacement réduit de moitié et impossibilité de sprinter jusqu'à un repos long. Pendant la première heure suivant le réveil, le personnage ne peut marcher qu'avec l'aide d'une autre personne.\nConséquences RP\ntremblements visibles, souffle court et parole hachée pendant la récupération. Impossible de soutenir un discours, chanter ou réciter un long texte sans pauses fréquentes. En cas d'échec, le personnage doit être protégé et transporté pendant son inconscience, ses compagnons doivent adapter la fuite ou la poursuite à son état."
  }
];
