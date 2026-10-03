# Base de test Supabase

Projet hébergé **base test**, créé le 3 octobre 2026 dans `kithain's Org`,
offre gratuite, région Frankfurt (`eu-central-1`).

- [Ouvrir base test dans Supabase](https://supabase.com/dashboard/project/edmojqwjfyzeyewhkeah)
- Référence : `edmojqwjfyzeyewhkeah`.
- API : `https://edmojqwjfyzeyewhkeah.supabase.co`.
- Configuration cliente : [supabase-config.test.js](supabase-config.test.js).

## Installation effectuée

Installation atomique confirmée par le SQL Editor le 3 octobre 2026 à
**09 h 59, heure de Paris**. Tables historiques, catalogues, schéma v2, RPC,
verrouillage de création, progression par session, apprentissage des sorts,
sélection, disponibilité et décès des personnages sont installés.
Le cache API a été rechargé et les appels distants répondent.

Les salons **TEST** et **TST2** sont deux sessions de la même campagne.
**Apprenti Test**, INT 18, appartient à Joueur Test : sa fiche est un
brouillon à compléter et valider, avec un pool attendu de 9 XP par session
après validation. Les données sont synthétiques.

## Comptes de recette

| Rôle | Nom | Connexion |
|---|---|---|
| MJ autorisé | MJ Test | `mj.test@diceforge.app` |
| Joueur J1 | Joueur Test | `joueur.test@diceforge.app` |
| Joueur J2 | Joueur Deux | `joueur.deux@diceforge.app` |

Les mots de passe sont dans le fichier privé
`D:/script/Dice-Forge-backups/2026-10-03/base-test-bootstrap/accounts.json`,
hors dépôt Git. Les adresses sont des identifiants synthétiques déjà confirmés ;
elles ne servent pas à recevoir des courriels.

## Brancher une version de recette

Depuis la mise en production du 3 octobre, le cockpit utilise la production
par défaut. Sur `127.0.0.1`, `localhost` ou `[::1]`, ouvrir
[le salon TEST](http://127.0.0.1:5000/dice/index.html?room=TEST&environment=test), puis se connecter
avec **Joueur Test** ou **MJ Test** et le mot de passe du fichier privé.
La session de connexion Supabase de production ne vaut pas pour les comptes
de cette nouvelle base. Le salon `4SSU` est celui de la production ; les salons
de recette sont `TEST` et `TST2`. Un bandeau « Base test Supabase » distingue
la recette sur toutes les pages. Le choix est conservé pour cet onglet pendant
la navigation. Pour revenir à la campagne réelle, ouvrir
[le salon 4SSU](http://127.0.0.1:5000/dice/index.html?room=4SSU&environment=production).

Dans une copie dédiée du site destinée à la recette, remplacer le contenu de
`supabase-config.js` par celui de `supabase-config.test.js` avant publication.
Sur un domaine publié, la configuration par défaut utilise toujours le
projet de production d'origine. Aucune version du site de recette n'a été publiée par cette
création de base ; les pages déjà publiées gardent leur configuration actuelle.

## Vérifications réelles sur Supabase

### Prétirés déjà validés mais inutilisés — 3 octobre 2026

`unplayed-presets.sql` installée sur **base test**, après les migrations de
budget. Le pool automatiquement ouvert à la validation ne bloque plus une
fiche encore inutilisée. Les jets de jeu, tentatives de progression, gains,
dépenses et sessions clôturées restent bloquants. 345 contrôles SQL réussis,
trois fiches réelles de référence conservées ; journal privé
`base-test-recipe/unplayed-presets-sql.log`.

Sur Supabase, proposition réservée de Mark, sélection et changement de
propriétaire vérifiés dans une transaction **annulée**. Scores et pool
strictement conservés. Mark reste au MJ et peut être proposé : aucun PJ
n'a été mis à disposition automatiquement. Preuves privées :
`unplayed-presets-hosted-rollback.sql`, `unplayed-presets-hosted.png`.

Pour donner un PJ du MJ à un joueur : ouvrir **Suivi MJ**, room **TEST**,
puis **Disponibilité et attribution des PJ**. Choisir le destinataire ou
« Tout joueur de la campagne » et cliquer **Proposer comme prétiré**.
Le joueur choisit ensuite le PJ dans sa fiche ; la première attribution
transfère sa gestion. **Rendre disponible** seul conserve le propriétaire.

### Validation complète de la création — 3 octobre 2026

`complete-creation-budget.sql` installée après `checked-save.sql`.
La validation exige zéro point restant ; une sauvegarde partielle en brouillon
reste possible. Neuf contrôles API hébergée réussis : refus avec 110 puis
1 point restant sans changer les valeurs ni ouvrir de pool XP, validation à
zéro, répétition sans second pool. 334 contrôles SQL réussis, trois fiches
réelles de référence conservées. Preuves privées :
`base-test-recipe/complete-creation-api.json`, `complete-creation-sql.log` et
`validation-110-bloquee.png` dans le dossier de sauvegardes du 3 octobre.

Mark (MJ Test, salon TEST) a été rouvert à la demande du joueur : 335 points
conservés sur 445, soit 110 à répartir. Aucun XP dépensé, apprentissage ni
tentative depuis sa validation. Les caractéristiques, scores, équipements,
historique et session XP existante sont identiques avant/après ; aucune
nouvelle dotation XP. Sauvegarde privée `mark-before.json`, comparaison
`mark-after.json` et sauvegarde récupérable réservée à l'administrateur dans
`diceforge_v2.creation_recovery_backups`. Le gel des attributions sera recréé
à la prochaine validation. Recharger la page puis utiliser **Actualiser depuis
Supabase** pour remplacer le brouillon local périmé.

### Corrections de recette du 3 octobre 2026

La migration `recipe-corrections.sql` est installée dans **base test** :
répartition professionnelle contrôlée à la validation, D100 des compétences
et sorts tiré par Supabase, coches réservées aux réussites, transfert unique
de l'ancien équipement dans l'inventaire. Les scores, budgets acquis et
monnaies historiques sont conservés. Cette migration devra également être
appliquée lors du futur déploiement de production.

Le frontend de recette sépare **Création de personnage** et **Fiche personnage**.
L'aide d'âge utilise les tranches actuelles de la race sélectionnée, comme
confirmé par le MJ. La richesse est une liste libre, modifiable dans
l'inventaire ; les suggestions de profession ne verrouillent pas le RP.
La fiche affiche l'âge, les étoiles de profession, des coches automatiques
et des menus d'armure. Ctrl avec les flèches de répartition fait varier
les points par dix. L'ancien bloc équipement/richesse a quitté la fiche.

Preuves complémentaires : dix contrôles d'intégration sur Supabase pour
la création, les coches, les jets, la reprise réseau et le changement de session ;
quatre contrôles de reprise d'inventaire (texte, richesse, import répété,
refus d'un autre propriétaire). Fichiers privés dans
`D:/script/Dice-Forge-backups/2026-10-03/base-test-recipe/`.
La fixture **Recette Protection** appartient à **Joueur Deux** et est disponible
pour inspection par le MJ ; elle est passée à la session TST2 pendant le test.

Le banc PostgreSQL vérifie également **270 contrôles**, incluant la
conservation des trois fiches réelles et des objets/monnaies déjà présents,
ainsi que l'absence de doublon à la réexécution de la migration.

Le 3 octobre 2026 à 10 h 03, huit contrôles ont réussi contre l'API hébergée :
connexion des trois comptes, liste des PJ pour chacun, lecture de la fiche
Apprenti Test, et refus `42501` de création de salon par J1. La RPC
`df_character_roster` répond HTTP 200 avec les quatre paramètres du navigateur.

Le branchement du cockpit a ensuite été vérifié dans son navigateur : connexion
de Joueur Test, salon TEST rejoint, fiche Apprenti Test chargée et sélecteur
« Choisir un personnage » affiché avec Apprenti Test. Aucune API simulée.
Le bouton « Choisir ce PJ » a également été utilisé et confirmé ; la fiche
du personnage sélectionné est rechargée depuis Supabase. Preuve :
`D:/script/Dice-Forge-backups/2026-10-03/base-test-bootstrap/pj-selection-connected.jpg`.

Preuve et journal privé :
`D:/script/Dice-Forge-backups/2026-10-03/base-test-bootstrap/base-test-supabase.jpg`
et `hosted-checks.json` dans le même dossier.

La recette fonctionnelle complète reste à consigner dans
[CAHIER_DE_TEST.md](CAHIER_DE_TEST.md). Ces huit contrôles ne valident pas tous
ses scénarios. Le script `scripts/build_supabase_test.py` prépare une installation
pour un nouveau projet vide ; l'export SQL contenant les identifiants reste privé.

## Génération et nouvelle fiche — 3 octobre 2026

`character-generation.sql` est installé sur **base test**. Les tirages et
ajustements sont désormais contrôlés côté Supabase. Le brouillon de fiche
affiche les caractéristiques en lecture seule. Le bouton « Nouveau personnage »
dans le salon conserve le brouillon de la fiche actuelle et ouvre une création
vide ; le sélecteur permet de reprendre le personnage précédent.

Preuves : 18 contrôles contre l'API hébergée, 294 contrôles SQL avec préservation
des trois fiches réelles, et parcours navigateur création → génération → fiche.
Journaux privés `base-test-recipe/generation-api.json` et `generation-sql.log`
dans le dossier de sauvegarde du 3 octobre. Le PJ synthétique « Recette Navigation »
a été créé avec Joueur Test ; Apprenti Test reste disponible et conservé.
Production : migration préparée, non installée.

## Répartition des budgets — 3 octobre 2026

`creation-budget.sql` est installé sur **base test**. Le formulaire affiche
en permanence les deux compteurs, dans la fiche et le grimoire, et limite les
augmentations à la réserve utilisable et au score maximal de 100 %. Les points
personnels peuvent compléter les compétences professionnelles ; les points
professionnels ne financent pas les compétences sans étoile.

Preuves : 312 contrôles SQL avec les trois fiches réelles préservées, 12 contrôles
contre l'API Supabase, tests de calcul et parcours navigateur : saisie excessive,
réserve personnelle épuisée, Ctrl + flèche ±10, changement de profession,
refus de sauvegarde et validation désactivée sur un brouillon invalide. Journaux
privés `base-test-recipe/budget-sql.log` et `budget-api.json`.

**Tapamilacetico** a été retrouvée en brouillon : 496 points pour un budget de
445, dont 387 hors profession pour 120 personnels disponibles. Dépassements :
51 au total et 267 personnels. Ses valeurs ont été conservées ; le MJ/joueur
doit décider de la nouvelle répartition. Production : migration non installée.

## Sauvegarde des coches et dés de progression — 3 octobre 2026

`checked-save.sql` est installé sur **base test**. Une sauvegarde conserve les
coches déjà accordées par un jet serveur ; leur ajout manuel et leur retrait
pendant une session restent interdits. Le blocage venait du déclencheur exécuté
avant l'insertion, même lors de la mise à jour d'une compétence existante.

Le déverrouillage utilise le moteur 3D de « Lancer de dés », avec un dé des
dizaines et un dé des unités. L'animation affiche le D100 enregistré par Supabase,
puis révèle la tentative et permet la dépense. Le double clic reste bloqué et la
récupération après une coupure conserve la même requête. Un refus de sauvegarde
affiche sa cause précise, sans consommer de tentative. OBS reconnaît ces jets.

Vérifications : 320 contrôles SQL, trois fiches réelles préservées, tests du
retour de sauvegarde, du résultat animé, du double clic et de la récupération.
La recette navigateur sur « Recette Dés XP 8a8f5a » conserve les jets 19, 28 et
71 pour un seuil de 50 %. Le canevas 3D est chargé. Une attribution de 1 XP a
ensuite donné Médecine 51 %, pool 5/6, sans nouveau jet. Journaux et capture
privés dans `base-test-recipe/checked-save-sql.log` et `progression-des-visuels.jpg`.
Production : migration non installée.

Le cadre de progression reprend maintenant la grille `dice-layout` du lanceur :
commandes à gauche, `dice-output` à droite, cadre `dice-stage` et cartouche
de résultat commun. L'icône supplémentaire et les styles propres à l'ancien
encart sont supprimés. Cette correction d'affichage ne nécessite pas de migration.
Recette sur « Recette Dés XP cc5813 » : deux lancers 3D successifs, résultats
100 et 79 conservés dans Supabase, un seul canevas et aucune icône SVG ajoutée.
Captures privées `progression-cadre-animation-2.jpg` et `progression-cadre-resultat.jpg`.
