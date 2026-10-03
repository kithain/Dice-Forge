> Plan de réalisation priorisé : [EVOLUTIONS.md](EVOLUTIONS.md). Ce plan fait référence pour les décisions du 3 octobre 2026 ; les formulations historiques ci-dessous peuvent décrire un cadrage antérieur.

Un lancer de dés pour le système Basic Roleplaying créé par Steve Perrin, Steve
Henderson, Warren James, Greg Stafford, Sandy Petersen, Ray Turney, Lynn
Willis.

## Chantier à prévoir : gestion des personnages

Revoir le parcours de création, de sélection et de reprise des personnages,
ainsi que leur rattachement aux campagnes. Définir une seule source de vérité
entre le générateur et la fiche complète, et un comportement explicite pour
un personnage généré qui n'a pas encore de fiche de campagne. Ce chantier est
différé ; les corrections de sauvegarde du 3 octobre 2026 ne remplacent pas
cette refonte.

## Besoins de la refonte — 3 octobre 2026

### Plusieurs personnages par compte

- Prévoir plusieurs personnages pour un joueur, leur sélection explicite et
  leur rattachement à une campagne par leur identifiant permanent.
- Prendre en charge les personnages morts et leur remplacement sans perdre
  leur fiche ni leur historique. Proposition : conserver un statut de décès
  dans la campagne, distinct de l'archivage du personnage permanent.
- Prévoir des personnages prétirés préparés par le MJ et attribués aux joueurs
  pour un scénario. Le MJ rend des PJ déjà créés disponibles dans le menu ;
  le joueur gère la fiche après attribution, avec un accès contrôlé côté serveur.
- Ne plus sélectionner implicitement une fiche par nom ou par dernière date.
- Permettre de reprendre un personnage généré qui n'a pas encore de fiche de
  campagne, et de créer explicitement cette première fiche.

### Séparer création et jeu

- Un parcours de création regroupe le générateur, les choix initiaux et la
  répartition des points ; la fiche de jeu sert ensuite pendant la partie.
- La première sauvegarde validée de création verrouille les points à répartir
  et les budgets initiaux. Un brouillon automatique ne vaut pas validation.
- Dans la répartition des compétences, seules les coches restent modifiables
  librement pendant le jeu ; une réussite au jet de compétence coche celle-ci
  et la rend disponible pour un jet d'apprentissage. La réussite de ce jet
  de déverrouillage pendant la session autorise la dépense du pool commun
  dans cette compétence ou ce sort. La répartition initiale reste verrouillée.
  Ce verrouillage ne concerne pas les ressources courantes,
  l'inventaire ou les notes de jeu.
- Appliquer le verrouillage aussi côté serveur, y compris aux imports et aux
  écritures venant du générateur ; un champ désactivé dans l'écran ne suffit pas.
- Retirer de la fiche le texte « Alchimie : règles de fabrication, réactifs et
  recettes ». La compétence Alchimie et les règles du livret restent présentes.

### Affichage et progression des compétences

- Abandonner l'augmentation du pool professionnel comme moyen de progression.
- Fusionner à l'affichage le pool professionnel et les points personnels en
  un budget unique ; conserver la provenance du calcul dans les données.
  Les joueurs n'ont pas besoin du détail de calcul dans la fiche de jeu.
- Après création, privilégier les scores de compétences et les coches plutôt
  que les colonnes de répartition initiale.
- Ajouter une case de points d'expérience disponibles dès le début de partie :
  attribution égale à INT ÷ 2, arrondi au supérieur (INT 13 donne 7 points).
- Pendant la session, le joueur répartit ces points sur les compétences et
  sorts déverrouillés par un jet D100 strictement supérieur à leur score. Les points inutilisés sont perdus ; aucun
  report dans la réserve de la partie suivante.
- Distinguer les points initiaux, les gains de progression et les coches
  d'expérience ; ne pas recalculer rétroactivement le budget de création quand
  INT change pendant la campagne.
- Les points restants ne doivent jamais devenir négatifs : refuser une dépense
  supérieure au solde dans l'interface et côté serveur, sans simplement masquer
  un dépassement en affichant zéro. Une ancienne fiche incohérente doit être
  signalée et régularisée explicitement, sans perte silencieuse de ses valeurs.

### Décisions confirmées

- Simplifier immédiatement l'affichage de la fiche de jeu.
- D100 > score actuel sans bonus ni malus ; INT ne sert qu'à la réserve d'XP.
- Aucun niveau : une room = une session = un nouveau pool automatique.
- Plafond de score 100 %. À score effectif 100, 01–99 réussissent ; 00/100
  est une maladresse. Aucun point ne peut être dépensé au-delà de 100.
- Les sorts partagent le pool d'XP avec les compétences déverrouillées.
- Remonter toute incohérence historique au MJ ; lui seul tranche les
  régularisations. Ne pas réduire automatiquement les valeurs existantes.
- Le joueur gère sa fiche et enregistre un apprentissage après accord oral
  du MJ ; aucune validation numérique du MJ n'est imposée.
- Seul le MJ crée les rooms de sa campagne et peut rendre des PJ déjà créés
  disponibles dans le menu de sélection. Les PJ morts sont indisponibles.

### Rooms et rôle MJ

- Première entrée du personnage dans une nouvelle room de la campagne :
  réserve d'XP égale à ceil(INT / 2), coches effacées, compétences verrouillées
  pour la dépense d'XP et nouvelles tentatives d'apprentissage disponibles.
  La répartition de création reste figée et les scores acquis sont conservés.
- Reconnexion à une room déjà visitée : conserver le solde d'XP de cette room,
  ses coches, ses déverrouillages et ses tests consommés ; ne pas réattribuer
  la réserve ni réinitialiser les tentatives. Conserver cet état côté serveur
  par personnage et room, indépendamment du navigateur utilisé.
- Passage à la partie suivante : les XP inutilisés sont perdus et les
  augmentations acquises restent conservées dans la campagne. L'historique
  d'une ancienne room ne doit pas permettre de redépenser son reliquat perdu.
- Seul le MJ peut créer une room. Contrôler ce droit côté serveur, en plus de
  l'interface ; le rôle MJ doit être défini indépendamment du fait d'avoir créé
  une room, pour éviter une définition circulaire.

### Règles actuellement présentes dans les livrets

- `livret_reference.html`, section « Amélioration par l'expérience », et
  `livret_joueur.html#experience` décrivent une réserve de INT/2 arrondi au
  supérieur, répartie sur les compétences admissibles après un jet
  de déverrouillage D100 sans bonus ni malus, strictement supérieur au score actuel.
- Le coût décrit par les exemples est de 1 point de réserve pour +1 point de
  compétence, dans la limite du score maximal de 100 %. Aucun surcoût
  au-delà de 90 % n'est indiqué dans cette règle.
- La limite de 90 % du niveau héroïque concerne la création, pas une limite
  générale de progression. Les points non attribués sont déjà déclarés perdus.
- Le nouveau parcours demandé avance l'attribution au début de partie et
  permet la dépense pendant la session, avec une tentative par room ;
  conserver solde et tentatives à la reconnexion et perdre le reliquat ensuite.

### Onglet Apprentissage

- Ajouter un onglet distinct pour les jets d'apprentissage ; réutiliser le
  sélecteur de compétences du « Test BRP — Compétence ou sort » et le moteur
  existant de lancer D100, d'animation et de publication du résultat au salon.
- Afficher uniquement les compétences cochées après une réussite en jeu et
  encore disponibles pour le déverrouillage. Les sorts suivent le même
  système que les compétences et sont inclus.
- Lire le score actuel et INT sur la fiche du personnage sélectionné ; ces
  valeurs ne sont pas librement saisies dans cet onglet. Aucun choix de
  difficulté ni de malus du test BRP ordinaire ne s'applique.
- Réussite si et seulement si D100 > score actuel, sans bonus ni malus. L'égalité
  échoue. Ne pas appliquer les critiques, spéciales ou maladresses du test
  BRP ordinaire : seul ce comparatif détermine le résultat d'apprentissage.
- Exemple : compétence 95 % ; D100 95 échoue, D100 96 déverrouille
  la dépense d’XP. Aucun bonus d’INT ne s’ajoute au résultat.
- Un jet réussi rend la compétence admissible à la dépense d'XP sur la fiche.
  Il n'augmente pas son score automatiquement et ne rouvre pas sa répartition
  initiale. Un jet échoué ne la déverrouille pas.
- Une seule tentative d'apprentissage par personnage, compétence et room,
  réussie ou échouée. Dès le premier jet, verrouiller ce test et retirer la
  compétence des choix disponibles ; conserver son résultat consultable.
- Sauvegarder le résultat et la consommation de la tentative ensemble côté
  serveur. Empêcher une deuxième tentative par double clic, rechargement,
  reconnexion ou autre onglet. Une nouvelle réussite en jeu ne réarme pas le
  test dans la même room ; revenir dans cette room conserve la tentative utilisée.
- Une autre room dispose de sa propre tentative d'apprentissage par compétence.
  L'initialisation et la reconnexion suivent les règles de room ci-dessus.
- Distinguer et sauvegarder la coche d'utilisation, la tentative
  d'apprentissage et l'admissibilité à la progression, par personnage et
  partie. Une modification manuelle de coche ne vaut pas réussite du jet.
- Montrer le D100, le score comparé et le verdict ;
  répercuter l'admissibilité sur la fiche ouverte et la conserver au rechargement.
- Les augmentations coûtent 1 XP pour +1 point de compétence selon la règle
  existante ; aucun surcoût au-delà de 90 % n'est ajouté. Le test supérieur au
  score assure la difficulté d'apprentissage des compétences élevées.

### Séparer les données de création et de progression

- Conserver les points répartis à la création comme valeurs initiales figées.
  Enregistrer les gains d'expérience séparément : une dépense ne doit pas
  modifier le pool professionnel ni les points personnels initiaux.
- Le score courant tient compte de la base, des points de création et des
  gains de progression. Le joueur voit ce score et son solde d'XP ; le détail
  historique du calcul reste conservé dans les données.
- La dépense cible une compétence admissible du personnage sélectionné,
  augmente son gain de progression et diminue la réserve du même montant.
  Ces deux changements sont enregistrés ensemble côté serveur ; un échec
  de sauvegarde ne doit ni accorder le gain ni consommer les points.
- Refuser les dépenses négatives, fractionnaires ou supérieures au solde,
  ainsi que les dépenses sur une compétence non admissible. Contrôler la
  révision pour qu'une double soumission ne dépense pas deux fois les mêmes XP.
- Les scores acquis restent conservés d'une partie à l'autre. Seuls le budget
  de partie et l'éligibilité à la progression suivent le cycle de room décrit
  ci-dessus.

Ces éléments cadrent le chantier ; ils ne constituent pas encore une
implémentation des nouveaux écrans ou des règles de progression.

## Magie : décisions du 3 octobre 2026

- Sorts connus disponibles sans préparation ni mémorisation. Seuls les PP et
  les règles de lancement limitent leur utilisation ; conserver les limites
  de niveau, d'action et de cible.
- Apprentissage en jeu séparé de la création : 1D6 jours d'étude, test
  d'Alphabétisation pour un texte ou (INT + POU) % avec un maître, puis score
  initial exact de 20 + 3D6 %. Échec : 1D3 jours supplémentaires ; maladresse :
  maître ou autre source nécessaire.
- Une réussite utile donne une coche ; un échec ne donne rien. Pendant la
  session, D100 sans modificateur doit dépasser strictement le score actuel.
  Répartir le pool commun uniquement entre les compétences/sorts déverrouillés.
  Perdre les points non répartis à la clôture, sans report.
- Acquisition d'un sort : tirage unique et attribution intégrale atomique côté
  serveur. Crédit réservé au seul sort concerné, ajouté aux points utilisés,
  jamais au solde libre du budget de création ou d'expérience. Ne pas ajouter
  INT au score tiré : le score appris vaut exactement 20 + 3D6 %.
- Conserver un registre serveur des acquisitions et des dépenses. Refuser la
  suppression d'un sort appris, la baisse de son attribution, l'altération de
  son tirage et les crédits fabriqués dans un import. Rejouer la requête ne doit
  ni relancer les dés ni attribuer un crédit supplémentaire. Couvrir toutes
  les sauvegardes : fiche complète, onglet sorts, imports et générateur.
- Un changement d'INT ne doit pas modifier rétroactivement le score tiré.
  Les sorts historiques gardent leurs valeurs, sans conversion silencieuse.
- À implémenter : le code actuel utilise encore INT + points, refuse l'ajout
  quand le budget initial est épuisé et permet de modifier les points des
  sorts. Un verrouillage du formulaire seul ne protège pas les sauvegardes.
- Droits confirmés : le joueur enregistre l'apprentissage de son PJ après
  accord oral du MJ. Le tirage et l'attribution restent contrôlés côté serveur.
- Gestion confirmée : menu des PJ disponibles, disponibilité proposée par le
  MJ pour des PJ déjà créés, état mort excluant la sélection et conservation
  de l'historique. Création des rooms exclusivement réservée au MJ.
