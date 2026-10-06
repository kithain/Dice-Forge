# Évolutions de Dice Forge

## Évolution future — Adapter les caractéristiques au personnage souhaité

Date : 5 octobre 2026. **Statut : proposition mise de côté, non implémentée.**

### Besoin

Un bon total de caractéristiques peut masquer un tirage mal adapté à la
profession. Exemple : un assassin humain avec FOR 9, CON 12, TAI 15, INT 12,
POU 12, DEX 8 et CHA 14 totalise 82 points, mais reste peu agile, même après
avoir déplacé les 3 points autorisés vers la DEX (DEX 11).

### Proposition de règle de campagne

- Autoriser **une permutation entre deux caractéristiques**, avant la
  redistribution des 3 points et la validation des caractéristiques.
- Conserver les tirages actuels : 3D6 pour FOR, CON, POU, DEX et CHA ;
  2D6+6 pour TAI et INT.
- Refuser une permutation qui ferait descendre INT ou TAI sous 8.
- Exemple : échanger DEX 8 et CHA 14 donne DEX 14 et CHA 8 ; les 3 points
  déplacés peuvent ensuite porter la DEX à 17, en diminuant d'autres valeurs.
- Présenter explicitement cette possibilité comme une **règle de campagne**.
  L'option officielle BRP d'attribution libre utilise sept tirages à 3D6,
  avec INT et TAI au minimum à 8 ; elle diffère de cette proposition.

### Interface envisagée

- Dans l'étape **Caractéristiques**, avant le choix des compétences, ajouter
  un bouton **« ⇄ Échanger »** à chaque carte, près des boutons − et +.
- Au premier clic, sélectionner la carte source et afficher
  **« Choisis la caractéristique à échanger avec DEX »** (nom adapté à la source).
- Rendre les cartes cibles sélectionnables ; griser les échanges interdits
  avec une explication, par exemple **« INT doit rester à 8 minimum »**.
- Au choix de la cible, permuter les valeurs et recalculer les scores dérivés.
- Afficher deux compteurs distincts : **« Échange disponible : 1 / 1 »** et
  **« Points à déplacer : 3 / 3 »**.
- Après permutation, afficher un récapitulatif tel que
  **« DEX 8 → 14 · CHA 14 → 8 »**, avec **« Annuler l'échange »**.
- Conserver le détail et la provenance des tirages d'origine.
- Permettre l'annulation jusqu'à la validation des caractéristiques, puis
  verrouiller la permutation et les ajustements.
- Ajouter éventuellement un conseil discret lié à la profession :
  **« Assassin : privilégie la DEX »**.
- Mention visible : **« Règle de campagne : une permutation autorisée »**.

### Complément discuté, à décider

Un seuil contre les tirages globalement très faibles reste une piste séparée :
si la somme des sept valeurs tirées, avant modificateurs d'espèce et
redistribution, est **strictement inférieure à 65**, permettre une nouvelle
série sans consommer l'une des deux relances. Cela correspond à une moyenne
inférieure à 9,3 par caractéristique et concerne environ 3 % des tirages
actuels, dont le total moyen est 78,5. Ce seuil ne mesure pas à lui seul la
jouabilité ; une alerte au MJ pour des caractéristiques très basses reste à
étudier, sans rejet automatique d'une faiblesse isolée.

Avant réalisation, préciser le traitement des modificateurs d'espèce lors
de la permutation et son interaction avec les points déjà déplacés. Prévoir
l'enregistrement et le contrôle côté serveur, cohérents avec le générateur
actuel, et préserver les personnages déjà créés.

Référence : [BRP Universal Game Engine / ORC, chapitre 2, pages 6 et 10](https://www.chaosium.com/content/orclicense/BasicRoleplaying-ORC-Content-Document.pdf#page=6).

Prétirés du 3 octobre 2026 : un pool initial automatiquement ouvert ne vaut
plus une session jouée. `unplayed-presets.sql` installée sur base test permet
de proposer un PJ validé mais inutilisé. Vérification : 345 contrôles SQL et
proposition/attribution de Mark sur Supabase dans une transaction annulée,
sans changement de propriétaire, de scores ni d'XP. Le MJ passe par
« Proposer comme prétiré » dans le Suivi MJ pour transférer ensuite la gestion.

Correctif du 3 octobre 2026 : une création doit avoir **zéro point restant**
pour être validée. Le brouillon peut être sauvegardé avant d'avoir tout réparti.
`complete-creation-budget.sql` est installée sur **base test**, après
`checked-save.sql` : refus atomique côté serveur avec 110 ou 1 point restant,
sans ouvrir de session XP. 334 contrôles SQL, neuf contrôles API hébergée et
vérification du bouton désactivé dans le navigateur. À la demande du joueur,
Mark est rouvert en brouillon avec ses 335 points attribués et 110 restants ;
caractéristiques, compétences, inventaire et historique conservés.

Affichage du 3 octobre 2026 : la progression reprend aussi le cadre du lanceur,
avec ses commandes à gauche et ses dés à droite. Le cartouche de résultat est
partagé avec « Lancer de dés » ; l'encart personnalisé et son icône sont retirés.
Recette sur base test : deux lancers 3D successifs (100, puis 79), sans perte du
canevas ni seconde tentative. Aucune migration supplémentaire.

Correctif du 3 octobre 2026 : sauvegarde des coches serveur débloquée dans
**base test** avec `checked-save.sql`. Les jets de déverrouillage réutilisent
le moteur 3D de « Lancer de dés » et le résultat Supabase. Cause précise des
refus, sauvegarde confirmée avec révision à jour, double clic bloqué et reprise
de la même tentative après une coupure. 320 contrôles SQL et recette navigateur.
Production non modifiée.

Correctif de recette du 3 octobre 2026 : `creation-budget.sql` installé sur
**base test**. Compteurs professionnel/personnel toujours visibles ; plafonds
à la saisie, sauvegarde et validation refusées en cas de dépassement. Les
compétences et sorts partagent le même budget initial. Vérification : 312
contrôles SQL, 12 contrôles API Supabase et parcours navigateur. Tapamilacetico
reste en brouillon avec ses allocations conservées (496/445 au total,
387/120 hors profession). Voir [BASE_TEST.md](BASE_TEST.md) et
[CAHIER_DE_TEST.md](CAHIER_DE_TEST.md). Production non modifiée.

Date : 3 octobre 2026. Statut : plan de réalisation, fonctionnalités à implémenter.

Ce document organise la refonte des personnages, de la progression et de la magie. Il fait référence pour les décisions récentes ; `IDEA.md` conserve l'historique des demandes. Les règles écrites ont été mises à jour, mais cela ne signifie pas que leur fonctionnement est implémenté ou publié.

## Priorités

- **P0 — Indispensable :** préserver les fiches, appliquer les règles définitives et garantir les écritures côté serveur.
- **P1 — Fonctionnement en partie :** création verrouillée, progression et apprentissage des sorts utilisables dans les écrans.
- **P1 — Affichage et sélection :** simplifier immédiatement la fiche et proposer les PJ disponibles.
- **P2 — Compléments :** compléter les parcours de gestion et les vues d'historique.

L'ordre des étapes indique les dépendances. Une interface P1 dépend des protections P0 ; une priorité ne permet pas de sauter une dépendance.

## Décisions retenues

| Sujet | Règle |
|---|---|
| Coche d'expérience | Réussite utile en jeu : coche. Échec : rien. Une coche en attente par compétence ou sort. |
| Jet de déverrouillage | Pendant la session, 1D100 sans bonus ni malus. Il faut strictement dépasser le score actuel. L'égalité échoue. |
| Points de la session | Pool commun à répartir uniquement entre les compétences et sorts déverrouillés. L'excédent non dépensé à la fin de session est perdu, sans report. |
| Coût de progression | Règle déjà décrite dans les livrets : 1 point d'XP pour +1 point de score, sans surcoût au-delà de 90 %. |
| Calcul du pool | Formule actuellement retenue dans les livrets : INT ÷ 2, arrondi au supérieur. Ce montant ne s'ajoute pas au D100. |
| Sorts disponibles | Tous les sorts connus sont disponibles sans préparation, mémorisation ou délai de changement. Les PP et les conditions de lancement restent applicables. |
| Nouveau sort | Source connue, 1D6 jours d'étude, test d'Alphabétisation pour un texte ou (INT + POU) % avec un maître. |
| Échec d'apprentissage | Nouvelle tentative après 1D3 jours supplémentaires ; maladresse : aide d'un maître ou autre source nécessaire. |
| Score du sort appris | Tirage unique de 20 + 3D6 %, soit 23 à 38 %. Ce résultat est le score initial exact ; ne pas ajouter INT. |
| Attribution du sort | Points ajoutés au total utilisé et intégralement réservés à ce sort, hors budget de création et hors pool d'XP. Aucun solde libre créé. |
| Verrouillage | Pas de suppression ou baisse du sort appris permettant de récupérer des points. Tirage et attribution enregistrés ensemble côté serveur. |
| Sorts existants | Conserver les valeurs actuelles ; aucune conversion automatique vers 20 + 3D6 %. |
| Alchimie | Conserver les règles actuelles. La présente évolution change la magie et le système de progression commun. |
| Unité de progression | Pas de niveaux : **1 room = 1 session = 1 nouveau pool** par personnage, attribué une seule fois à sa première entrée dans cette room. |
| Fin et changement de session | Les XP inutilisés sont perdus à la fin de la session et au plus tard lors du passage à la suivante. Revenir dans une ancienne room ne réactive pas son reliquat. |
| Tentative de déverrouillage | Une tentative par compétence ou sort coché, par personnage et par room ; reconnexion et nouvelle coche ne réarment pas une tentative consommée. |
| Acquisition du sort | Le joueur gère sa fiche et enregistre l'apprentissage après confirmation orale du MJ. Pas de validation numérique obligatoire du MJ. |
| Plafond des scores | Score maximal : 100 %. À score effectif 100 %, 01–99 réussissent et 00/100 est une maladresse. Les difficultés et malus continuent de s'appliquer avant la résolution. |
| Progression à 100 % | Aucun gain au-delà de 100 %. D100 > 100 est impossible ; ne pas proposer de dépense sur une cible au plafond. |
| Fiches incohérentes | Faire remonter les anomalies au MJ avec valeurs et provenance ; lui seul tranche. Aucune régularisation ou réduction automatique. |
| Affichage | Simplification immédiate dans la refonte, dès la fiche de jeu ; aucun délai jusqu'à la fin d'une première session. |
| Rooms | Création exclusivement réservée au MJ de la campagne, contrôlée côté serveur. |
| Sélection des PJ | Menu présentant les PJ disponibles. Le MJ peut rendre disponibles des PJ déjà créés. |
| Mort | Un PJ tué prend l'état mort et n'est plus disponible à la sélection ; conserver sa fiche et son historique. |

## Étape 1 — Cadrage et état des lieux · P0

### Travaux

- [x] Inventorier les trois PJ ciblés et leurs états de campagne avec `character_id`, `state_id` et `campaign_id` ; 4SSU confirmé. Les liens des rooms historiques sans fiche accessible ne sont pas établis par cette lecture.
- [x] Vérifier les trois fiches canoniques d’Ilya, Gram et Thokk : session MJ rétablie, lecture RPC réelle et corps Obsidian identiques aux exports serveur. Aucun remplacement nécessaire.
- [x] Relever scores, sorts, coches et budgets historiques ; absence des lignes Alchimie de Gram/Thokk expliquée par le MJ : compétence ajoutée après les fiches, écart normal. Provenance des augmentations historiques du pool professionnel non reconstituée.
- [ ] Terminer la sauvegarde serveur avant migration : export réel des trois PJ et inventaires réalisé, SQL locaux et fichiers actuels sauvegardés avec SHA-256. L’export frais des fonctions, permissions et politiques serveur reste requis ; les SQL locaux ne le remplacent pas.
- [x] Recueillir les décisions du MJ ci-dessous ; les opérations restent à implémenter.

### Cadrage confirmé par le MJ

Toutes les questions de cadrage listées précédemment ont reçu une réponse. Le cycle est celui des rooms, sans niveaux. Le joueur enregistre ses apprentissages après accord oral du MJ ; le MJ crée les rooms, rend des PJ disponibles et tranche les anomalies historiques. L'affichage doit être simplifié immédiatement.

La règle à 100 % est une exception de campagne à l'échec automatique sur 96–100 : à score effectif 100 %, seul 00/100 échoue de façon critique. Ce plafond concerne compétences et sorts, sans changer les caractéristiques. Les valeurs historiques hors plafond sont à signaler au MJ avant toute conversion.

### Validation de sortie

Les fiches et leurs identités sont contrôlées, la sauvegarde est disponible et les anomalies éventuelles ont été soumises au MJ avant leur régularisation.

## Étape 2 — Séparer les données et verrouiller la création · P0

Dépendance : étape 1 pour la reprise des données.

### Travaux

- [x] Distinguer le brouillon de création, la création validée et la fiche en jeu.
- [x] Figer le budget de création lors de sa validation explicite ; une sauvegarde automatique ne valide pas la création.
- [x] Séparer points de création, gains d'XP et attributions d'apprentissage des sorts.
- [x] Garder le personnage permanent et l'état de campagne comme références ; un salon lié retrouve le même état de campagne.
- [x] Conserver un historique serveur des acquisitions et dépenses, avec acteur, cible et montant.
- [x] Interdire les changements de points initiaux après validation par toutes les voies d'écriture : fiche entière, onglet sorts, générateur, import et transfert.
- [x] Préserver les modifications autorisées des notes, ressources et inventaire.
- [x] Conserver les scores historiques comme attributions héritées, sans déduire de nouveaux gains à partir d'un pool professionnel augmenté.
- [x] Maintenir les contrôles de révision et refuser les écrasements concurrents.

### Validation de sortie

Un import ou une modification directe de requête ne rouvre pas les points de création. Un changement d'INT ne recrée pas un budget initial. Les fiches existantes et l'inventaire conservent leurs valeurs.

## Étape 3 — Progression contrôlée côté serveur · P0

Dépendance : étape 2. Cycle confirmé : une room correspond à une session.

Réalisé localement : migration `progression.sql`, opérations serveur, ouverture automatique sur le personnage ou la fiche propre du joueur et affichage du solde. **92 contrôles SQL passent avec les trois fiches réelles conservées**, ainsi que le parcours navigateur. Non déployé ; les boutons de déverrouillage et de dépense sont réalisés localement à l’étape 4. Première reprise : les coches historiques sont conservées, puis effacées aux sessions suivantes.

### Travaux

- [x] Enregistrer par personnage et par room le pool de la session, les coches, les tentatives et les compétences/sorts déverrouillés.
- [x] Première entrée dans une nouvelle room : attribuer automatiquement ceil(INT / 2) XP, effacer les coches de la session précédente et initialiser ses tentatives et déverrouillages.
- [x] Attribuer une seule fois ce pool ; une reconnexion à la même room retrouve son état.
- [x] Lors du passage à la session suivante, fermer l'ancienne réserve et perdre son reliquat. Le retour dans une ancienne room ne doit pas restaurer une réserve utilisable.
- [x] Calculer le déverrouillage uniquement avec le D100 et le score enregistré : `D100 > score`.
- [x] Consommer la tentative et enregistrer son résultat dans la même transaction ; ne pas faire confiance à un verdict fourni par le navigateur.
- [x] Refuser les tentatives sans coche admissible et les nouvelles soumissions d'une tentative déjà consommée dans la même room.
- [x] Autoriser la dépense du pool uniquement sur les cibles déverrouillées ; 1 XP donne +1 au score, sans dépasser 100 %.
- [x] Enregistrer simultanément le gain et la réduction du pool ; refuser les montants négatifs, fractionnaires ou supérieurs au solde.
- [x] À la clôture, perdre les points non dépensés et fermer les autorisations de la session.
- [x] Ne pas attribuer un nouveau pool lors d'une reconnexion, d'un changement de navigateur ou du retour dans un ancien salon.

### Validation de sortie

Exemple : score 65, D100 65 = verrouillé ; D100 66 = déverrouillé. Un pool de 7 permet +4 dans une compétence et +3 dans un sort admissible, jamais +8 au total. Rejouer une requête ne donne ni nouveau jet ni nouveaux points.

## Étape 4 — Onglet de progression et dépense d'XP · P1

Dépendance : étape 3.

Réalisé localement : onglet « Progression », dés et verdict serveur, répartition du pool, clôture, reprise après interruption et rechargement. Publication transactionnelle via `progression-publication.sql`. Tests navigateur et 94 contrôles SQL passent, trois fiches réelles conservées. Non déployé.

### Travaux

- [x] Ajouter un onglet de progression avec les compétences et les sorts cochés encore disponibles pour le déverrouillage.
- [x] Lire les scores sur la fiche du personnage sélectionné ; aucun champ libre de score, de difficulté ou de malus.
- [x] Réutiliser le lancer D100, l'animation et la publication au salon ; afficher le résultat serveur, le score comparé et le verdict.
- [x] Distinguer visuellement coche d'utilisation, tentative consommée et autorisation de dépenser.
- [x] Afficher le pool disponible et permettre de répartir les points entre les cibles déverrouillées.
- [x] Montrer explicitement la perte des points non répartis lors de la clôture.
- [x] Retrouver le même résultat et le même solde après rechargement ou reconnexion.

### Validation de sortie

Un joueur peut répartir les XP de sa session depuis l'interface sans toucher au budget de création. Une tentative échouée ne déverrouille aucune dépense. Les sorts suivent le même parcours que les compétences.

## Étape 5 — Acquisition d'un sort et attribution réservée · P0 serveur, P1 interface

Dépendance : étape 2 ; utiliser les gains séparés de l'étape 3 pour la progression ultérieure. Le validateur numérique est le joueur qui gère la fiche, après accord oral du MJ.

Réalisé localement : `spell-learning.sql`, tirage serveur et attribution réservée, parcours après accord oral du MJ, scores communs à la fiche, aux jets, au Markdown, au PDF et au carnet MJ. **122 contrôles SQL** et tests navigateur passent, y compris reprise du même apprentissage après interruption et rechargement. Non déployé.

### Travaux serveur · P0

- [x] Vérifier que le joueur est autorisé à gérer le personnage/état de campagne ciblé. L'accord oral du MJ est une condition de jeu, pas une approbation serveur à inventer.
- [x] Enregistrer le tirage unique 20 + 3D6 et l'acquisition du sort dans une seule transaction.
- [x] Affecter intégralement le résultat au sort choisi, même si le budget initial restant vaut zéro.
- [x] Enregistrer ce crédit réservé séparément ; il compte dans les points utilisés mais n'est jamais dépensable ailleurs.
- [x] Refuser un sort acquis sans score, un second tirage pour la même acquisition et un crédit d'apprentissage fabriqué côté client.
- [x] Refuser sa suppression, la baisse de son attribution et la modification de son tirage par fiche entière, onglet sorts ou import.
- [x] Une hausse ultérieure utilise les dépenses d'XP autorisées ; elle ne modifie pas le tirage initial.
- [x] Conserver le score d'apprentissage si INT change et préserver les sorts historiques.

### Travaux interface · P1

- [x] Distinguer l'ajout pendant la création de l'apprentissage en jeu.
- [x] Présenter la source et la période d'étude ; le joueur confirme avoir obtenu l'accord oral du MJ, puis déclenche le tirage enregistré sur sa propre fiche.
- [x] Remplacer la saisie libre des points d'apprentissage par le tirage enregistré ; afficher son résultat et le score obtenu.
- [x] Afficher les points d'apprentissage séparément des points de création disponibles et du pool d'XP.
- [x] Afficher le même score dans la fiche, le sélecteur de jets, le Markdown, les impressions et la vue MJ.
- [x] Retirer les restrictions de mémorisation et de préparation des parcours de jeu.

### Validation de sortie

Avec INT 18, budget initial restant 0 et dés 3, 4, 5 : le nouveau sort vaut **32 %**, pas 50 %. Les 32 points sont intégralement attribués à ce sort ; aucun point libre n'est créé. Baisser à 20, supprimer le sort ou relancer la requête est refusé. Augmenter INT ne change pas le tirage acquis.

## Étape 6 — Simplifier immédiatement la fiche en jeu · P1

Dépendance : étape 2 pour le verrouillage ; intégrer les fonctions des étapes 3 à 5 au fur et à mesure. L'affichage simplifié est appliqué dès la fiche de jeu, sans attendre une fin de session.

- [x] En création, afficher un budget initial commun et garder sa provenance dans les données. Origine consultable séparément, mêmes crédits pour compétences et sorts (local).
- [x] Afficher le solde XP de la session (étape 3, local). Scores et coches seuls déjà affichés sur la fiche verrouillée ; colonnes de création masquées à l’étape 2.
- [x] Montrer les allocations d’apprentissage comme des attributions acquises, sans les présenter comme des points libres (étape 5, local).
- [x] Retirer le texte de fabrication d’alchimie de la fiche ; compétence et règles conservées dans le livret (réalisé localement à l’étape 2).
- [x] Harmoniser aide, export Markdown, impression, livrets et vues MJ avec les opérations réellement disponibles (local). PDF en jeu : score et coche ; Markdown : provenance conservée et attributions acquises verrouillées, sans compteur initial libre. Vue MJ : scores réels, y compris sorts appris et XP.

Validation : aucun affichage ne suggère qu'un point acquis ou verrouillé peut être récupéré et redistribué.

## Étape 7 — Sélection et disponibilité des PJ · P1 ; droits serveur P0 avant activation

Dépendance : identités et reprise de l'étape 2.

- [x] Ajouter un menu de sélection des PJ avec la liste des personnages disponibles ; identifier chaque PJ par son identité permanente, pas par le nom du joueur (local).
- [x] Permettre au MJ de rendre disponibles des PJ déjà créés ; conserver la fiche et ses valeurs (local).
- [x] Distinguer disponibilité à la sélection, joueur autorisé à gérer la fiche et état vivant/mort. Contrôler l'accès côté serveur et enregistrer l'affectation sans qu'une sélection permette de prendre la fiche d'un autre joueur (local).
- [x] Reprendre un personnage généré sans fiche de campagne et créer cette fiche explicitement. Nouvelle création distincte possible sans remplacer les PJ existants (local).
- [x] Ajouter l'état mort pour les PJ tués : retirer leur disponibilité et refuser leur sélection côté serveur, tout en conservant fiche et historique. Rendre un PJ disponible ne doit pas annuler implicitement son état mort (local).
- [x] Permettre au joueur de choisir un autre PJ disponible après le décès, sans récupérer les points ni les droits du PJ mort (local).
- [x] Préparer les personnages prétirés et leur attribution sous le contrôle du MJ, avec gestion de la fiche par le joueur après attribution (local). Brouillon MJ sans session jouée, attribution unique, réservation facultative par joueur.
- [x] Réserver exclusivement la création des salons au MJ de la campagne, avec un rôle explicite côté serveur ; un joueur ne devient pas MJ simplement en tentant de créer une room (étape 3, local).
- [x] Adapter l'import Obsidian pour conserver les identités et distinguer les personnages d'un même joueur dans la vue MJ et les fichiers (plugin local, sans lancer de synchronisation). Homonymes séparés par suffixe d'identité ; chemins uniques existants préservés.

Validation : un PJ mort est absent de la liste et non sélectionnable par une requête directe. Le MJ peut rendre un PJ vivant déjà créé disponible. Un joueur ne peut pas créer une room. Un changement de personnage ne récupère ni pool ni droits d'un autre.

## Étape 8 — Recette et mise en service · livraison du 3 octobre

Recette acceptée et passage en production autorisé par l'utilisateur le
3 octobre 2026. Migrations incrémentales installées sur production avec
sauvegarde fraîche et restauration répétée. Voir le bilan actuel dans
[MISE_EN_PRODUCTION.md](MISE_EN_PRODUCTION.md) ; les états locaux décrits
ci-dessous retracent les étapes antérieures à cette livraison.

Support d’exécution : [Cahier de test](CAHIER_DE_TEST.md), avec scénarios P0/P1,
résultats attendus, registre de passage, fiche d’anomalie et décision du MJ.

Étape 7 vérifiée localement : **160 contrôles SQL**, avec les trois fiches réelles
de l’audit conservées. Tests navigateur : sélection explicite, reprise d’un PJ
généré, nouvelle création indépendante, réservation d’un prétiré par joueur et
confirmation du décès. Deux choix concurrents ne peuvent attribuer un même
prétiré à deux comptes. Les homonymes restent distincts, y compris dans Obsidian.
Les tests couvrent le refus de sélection d’un mort, sa lecture historique,
la perte de son reliquat, les écritures refusées et un remplacement sans transfert
de points. Migration : `migrations/character-v2/character-roster.sql`, après
`spell-learning.sql`. **Aucune activation en production ni synchronisation des
fiches Obsidian effectuée.**

Dépendances : chaque fonctionnalité à livrer doit avoir passé sa validation de sortie. La livraison peut se faire par lots cohérents.

- [ ] Tester sur données synthétiques les dépenses concurrentes, doubles clics, imports modifiés, baisses de sorts et acquisitions rejouées.
- [ ] Tester le plafond à 100, son échec critique sur 00, les malus, la première entrée et les reconnexions à une room, le retour dans une ancienne session et la perte de son reliquat.
- [ ] Tester la liste des PJ disponibles, le décès, le remplacement et le refus serveur de création de room par un joueur.
- [ ] Vérifier les refus d'accès : autre compte, autre personnage, autre campagne, session expirée et validateur non autorisé.
- [ ] Répéter la migration sur une copie des données et comparer les scores, points, sorts, coches et inventaires avant/après.
- [ ] Vérifier les fiches d'Ilya, Gram et Thokk, puis leur lecture dans Obsidian ; exclure les fiches de test de cette récupération.
- [ ] Préparer le retour arrière et une sauvegarde avant activation ; ne pas réinstaller l'ensemble de l'API sur une base déjà migrée.
- [ ] Publier les écrans et appliquer la migration correspondante dans un même lot ; vérifier ensuite une lecture et une écriture réelles.
- [ ] Noter la version livrée et les étapes effectivement terminées dans ce document.

## Ordre conseillé des lots

| Lot | Étapes | Résultat |
|---|---|---|
| A — Données et verrouillage | 1 puis 2, socle serveur de 7 | Fiches préservées, création figée, rôle MJ et identités définis |
| B — Session et fiche | 3 puis 4, affichage de 6 et sélection de 7 | Pool par room, déverrouillage D100 et fiche immédiatement simplifiée |
| C — Nouveaux sorts | 5 | Acquisition hors budget initial, tirage unique et attribution verrouillée |
| D — Compléments | Compléments de 6 et 7 | Reprise des personnages générés, prétirés et harmonisation des vues |

Le lot C peut avancer après le lot A ; le joueur déclenche le tirage après accord oral du MJ et ses augmentations ultérieures restent dépendantes du lot B. Chaque lot passe la recette de l'étape 8 avant sa mise en service.

## Points d'entrée du code

- `js/pj-sheet.js`, `pj.html` : fiche, budgets, onglet sorts, export Markdown et impression.
- `js/pj-magic.js` : score des sorts, budget et validation des modifications.
- `js/app.js`, `js/experience-save.js` : jets et coches après réussite.
- `js/character-store.js` : adaptation des ressources aux RPC de campagne.
- `migrations/character-v2/` : données, RPC, permissions et migrations incrémentales.
- `livret_reference.html`, `livret_joueur.html`, `ecran_joueur_BRP_ORC.html`, `ecran_mj_BRP_ORC.html` : règles visibles.
- Coffre Obsidian : `50 - OUTILS/52 - Regles/Magie BRP.md` et `Resolution BRP.md`.

## État au 3 octobre 2026

- Retours de recette intégrés sur base test : génération séparée de l'utilisation, âge et aide par race, richesse libre dans l'inventaire, compétences professionnelles étoilées et budget personnel contrôlé, Ctrl ±10, coches uniquement après jet serveur réussi, armures et reprise unique des anciennes saisies. Migration `recipe-corrections.sql` installée sur la base de test ; contrôles serveur et navigateur réalisés.
- Génération protégée sur base test : tirages et deux relances côté serveur, trois points déplacés au maximum, caractéristiques du brouillon en lecture seule. Bouton Nouveau personnage accessible depuis la fiche et conservation des brouillons précédents. Migration `character-generation.sql` installée ; 18 contrôles API, 294 contrôles SQL et parcours navigateur vérifiés. Production non mise à jour.
- Base de recette hébergée **base test** créée sur Supabase et migrations des étapes 2 à 7 installées : [accès et configuration](BASE_TEST.md). Huit contrôles réels de connexion, liste, lecture et permission réussis. Publication du site de recette et recette complète de l'étape 8 restent à faire.
- Règles de magie et de progression mises à jour dans les notes et les livrets locaux.
- Import Obsidian adapté à la RPC et au salon 4SSU ; lecture réelle vérifiée le 3 octobre. Les trois corps de fiches Obsidian sont à jour, sans écrasement de leur présentation.
- Verrouillage de création, progression par session, apprentissage des sorts, affichages, sélection, disponibilité et décès : **implémentés et testés localement**, étapes 2 à 7. Recette et mise en service restent à réaliser à l’étape 8.
- Cadrage confirmé : joueur après accord oral du MJ, pool par room/session, plafond 100 %, affichage immédiat, création des rooms réservée au MJ, disponibilité et décès des PJ.
- Aucun déploiement de cette refonte n'est déclaré terminé.

## Audit de l’étape 1 — 3 octobre 2026

Lecture réelle par la session MJ du plushotin Obsidian, limitée aux trois joueurs de la campagne. Les exports privés restent hors Git.

| PJ | Budget actuel | Utilisé | Restant | Sorts connus |
|---|---:|---:|---:|---:|
| Ilya | 513 | 513 | 0 | 0 |
| Gram | 502 | 502 | 0 | 6 |
| Thokk | 435 | 435 | 0 | 0 |

- Identités, correspondance fiche/inventaire et révisions cohérentes ; aucun score hors 0–100 ni dépassement de budget.
- Alchimie : Gram et Thokk ont 1 % dans les données structurées, mais la ligne manque dans leur Markdown. Le MJ confirme que la compétence a été ajoutée après les fiches : écart historique normal, aucune régularisation requise. Aucune valeur changée.
- Pools professionnels 343/342/335, contre 325 par défaut : préserver les totaux acquis ; ne pas convertir l’écart en nouveaux XP sans établir sa provenance.
- Room 4SSU liée à la campagne confirmée. Les lectures des rooms 8QXJ, S3R4 et KP5Z ne renvoient aucune fiche ciblée ; leurs liens privés ne sont pas déduits de cette absence.
- Corps des trois fiches Obsidian identiques aux Markdown serveur ; présentation locale préservée. Aucun remplacement requis.
- Export et sauvegardes locales : `D:/script/Dice-Forge-backups/2026-10-03/evolution-audit-02/`.
- Rapport détaillé : [RAPPORT.md](../Dice-Forge-backups/2026-10-03/evolution-audit-02/RAPPORT.md).
- Avant une migration en production : obtenir une sauvegarde fraîche des fonctions, permissions et politiques réellement déployées. Aucune migration ni déploiement effectué par cet audit.

## Réalisation de l’étape 2 — locale, non déployée

- Migration incrémentale `migrations/character-v2/creation-lock.sql` : références héritées sans correction de score, budget validé, attributions initiales et historique séparés.
- Contrôles serveur : refus des réattributions, suppressions, faux crédits, changements via le générateur et révisions périmées ; validation explicite d’une nouvelle création par son propriétaire.
- Fiche : bouton de validation pour un brouillon sauvegardé, valeurs initiales protégées, colonnes de création masquées dès passage en jeu, coches et notes modifiables. Les compétences historiques masquées sont conservées dans les données.
- Vérification : 33 contrôles SQL sur PostgreSQL local, conservation des trois fiches de l’audit, tests du formulaire et test navigateur. Contrôles synthétiques ajoutés à la CI.
- Les nouvelles opérations XP et apprentissage ne sont pas encore exposées : le socle sépare et protège leurs données, sans attribuer de points à cette étape.
- Aucun changement de la production ni des fiches Obsidian. La sauvegarde fraîche des métadonnées serveur et le retour arrière de production restent requis à l’étape 8.
- Suite : étape 3, réserve par personnage et room, tentative D100 unique et dépense d’XP transactionnelle.
