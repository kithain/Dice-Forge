# Cahier de test — Évolution des fiches Dice Forge

Version du cahier : 3 octobre 2026. Référence fonctionnelle : [EVOLUTIONS.md](EVOLUTIONS.md).

Recette acceptée et mise en production autorisée par l'utilisateur le
3 octobre 2026 : « ok je pense que la recette est faites on peux passer en prod ».
Le bilan de livraison, la sauvegarde fraîche et le retour arrière sont consignés
dans [MISE_EN_PRODUCTION.md](MISE_EN_PRODUCTION.md). Les mentions antérieures
de préparation ci-dessous restent le registre historique de la recette.

## 1. Fiche de recette

| Information | Préremplissage / complément attendu |
|---|---|
| Version du code / commit / date de copie | État de travail local du 3 octobre 2026, branche `main`, dépôt `D:/script/Dice-Forge`. Commit de base : `7a368c3f284fad90fa68e2713f439659320c86c6`. Les évolutions sont des modifications locales non commitées : ce commit seul ne représente pas la version testée. Figer une copie ou un commit pour la recette finale. |
| Version et liste des migrations installées | Supabase **base test**, installation confirmée le 3 octobre 2026 à 09 h 59 (Paris) : tables historiques et catalogues, puis `schema.sql` → `api.sql` → `save-fixes.sql` → `creation-lock.sql` → `progression.sql` → `progression-publication.sql` → `spell-learning.sql` → `character-roster.sql`. Aucune installation de cette refonte en production déclarée. |
| Environnement / URL de test | Base de recette hébergée sur Supabase : [base test](https://supabase.com/dashboard/project/edmojqwjfyzeyewhkeah), API `https://edmojqwjfyzeyewhkeah.supabase.co`. Frontend de recette du cockpit branché sur cette API : `http://127.0.0.1:5000/dice/index.html?room=TEST`. Configuration et comptes dans [BASE_TEST.md](BASE_TEST.md). Site de recette public : publication à effectuer. Les tests navigateur précédents utilisaient des données simulées locales. |
| Campagne et salons de test | Référence réelle en lecture : campagne liée au salon `4SSU`, fiches Ilya, Gram et Thokk. Banc synthétique : salons `TEST`, `DEST` et salons créés par les scénarios ; `DEST` sert notamment au refus d’accès à une autre campagne. Les campagnes A/B et salons S1/S2 de la recette manuelle restent à créer dans l’environnement isolé. |
| Date de la sauvegarde utilisée | Snapshot privé des données réelles : 3 octobre 2026, fichier `campaign-live.json` dans `D:/script/Dice-Forge-backups/2026-10-03/evolution-audit-02/`. Dernière écriture relevée : 03 h 19, heure de Paris. Sauvegardes locales et empreintes dans ce même dossier. Ce snapshot ne remplace pas une sauvegarde fraîche des fonctions, permissions et politiques de production ; celle-ci reste à obtenir avant activation. |
| Testeur / navigateur / appareil | Contrôles automatisés locaux exécutés par Codex ; Playwright en navigateur Chromium/Chrome sans interface, sous Windows. Version exacte du navigateur non relevée. Nom du testeur humain, navigateur/version et appareil de recette manuelle : à renseigner. |
| Début et fin de la recette | Vérifications de développement : 3 octobre 2026. Début et fin de la recette manuelle complète : non commencée / à renseigner. |
| Décision finale du MJ | Non examinée |

### Références déjà disponibles

| Élément | État connu |
|---|---|
| Base Supabase de recette | **Prête : base test**. Trois comptes, salons TEST/TST2 liés et brouillon Apprenti Test (INT 18). Huit contrôles distants OK : connexions, listes PJ, lecture de fiche et refus de création d'un salon par un joueur. Journal privé `D:/script/Dice-Forge-backups/2026-10-03/base-test-bootstrap/hosted-checks.json`. |
| Retours de recette sur l'interface | Séparation création/jeu, âge, richesse libre, étoiles de profession, Ctrl ±10, coches automatiques, armures et reprise d'équipement : implémentés dans le frontend de recette. `recipe-corrections.sql` installée sur base test. Dix contrôles distants de création/jets/coches/session et quatre contrôles d'inventaire réussis. Le MJ confirme l'affichage des tranches d'âge actuelles de chaque race. |
| Dernier passage SQL complet | **OK : 160 contrôles**, trois fixtures réelles conservées. Journal privé : `D:/script/Dice-Forge-backups/2026-10-03/roster-sql-test.log`. |
| Tests navigateur | Création, progression, apprentissage, sélection/prétirés et lecture seule après décès : passages locaux OK. Ces tests utilisent des données simulées. |
| Import Obsidian | Identités permanentes, plusieurs PJ par joueur et protection des homonymes : test du code local OK. Aucune synchronisation réelle lancée pour cette étape. |
| Référence des fiches réelles | Ilya : 513 points utilisés sur 513, aucun sort ; Gram : 502 sur 502, six sorts ; Thokk : 435 sur 435, aucun sort. Relevé initial détaillé dans `EVOLUTIONS.md` et le rapport privé de l’audit. |
| Écart historique connu | Alchimie à 1 % pour Gram et Thokk dans les données structurées, ligne absente de leurs anciens Markdown. Le MJ a confirmé l’ajout ultérieur de la compétence : aucune régularisation à effectuer pour cet écart. |
| Publication | Non effectuée. Les scénarios du cahier restent à consigner dans le registre de recette ; ces preuves de développement ne les marquent pas automatiquement OK. |

**Priorités :** P0 = indispensable avant publication ; P1 = parcours et affichage
à valider avant livraison de la fonctionnalité concernée.

**Résultats :** À faire, OK, KO, Bloqué, Non applicable. Un test non applicable
doit avoir une justification. Un test bloqué ou non exécuté ne vaut pas un succès.

Pour chaque test, noter le résultat réel et joindre une preuve : capture,
export, message d’erreur, journal de test ou comparaison de données. Ne pas
inclure de mots de passe, de jetons de session ou de clés privées.

### Régression des budgets — 3 octobre 2026

Prétirés : un PJ créé puis validé par le MJ, sans action de jeu et avec son
pool initial intact, peut être proposé à un joueur. Vérifier ensuite que le
joueur peut le sélectionner, reçoit la même fiche et le même pool, et que le
PJ n'est plus attribuable à un second joueur. Un jet de jeu, même raté et sans
XP dépensé, une tentative de progression, des XP dépensés ou une session
clôturée doivent empêcher de proposer la fiche comme prétiré. Migration
`unplayed-presets.sql` installée sur base test ; 345 contrôles SQL et parcours
RPC Supabase de Mark vérifié puis annulé, propriétaire MJ conservé.

Contrôle des armes : le « % jet » reprend **Arme de jet**, le « % contact »
reprend **Arme de mêlée**. Vérification navigateur sur Recette Navigation,
sans sauvegarde serveur : dague 42/37, arc court —/37, rapière 42/— ; le jet
se met à jour à 47 lorsque la compétence change. Les modes non applicables
affichent désormais « — » et une explication au survol, distincts d'un score
applicable de 0 %. Preuve privée `base-test-recipe/armes-pourcentage-jet.png`.
Les valeurs temporaires du brouillon de recette sont ensuite restaurées
depuis Supabase. Tests automatisés inclus dans `test_creation_form.cjs`.

Complément : `complete-creation-budget.sql` installée après `checked-save.sql`.
Neuf contrôles API hébergée et 334 contrôles SQL réussis. Dans le navigateur,
« Recette 110 points b2f01c » affiche 110 points restants, le motif visible et
« Valider la création » désactivé ; « Sauvegarder en ligne » reste disponible.
Mark rouvert sur décision du joueur ; comparaison avant/après conforme.

| Scénario complémentaire | Résultat attendu |
|---|---|
| Sauvegarder avec 110 points restants | Brouillon sauvegardé, création non validée. |
| Valider avec 110, puis 1 point restant | Bouton désactivé et motif visible ; appel direct à la RPC refusé sans changer fiche, révision ou session XP. |
| Répartir exactement tous les points | Validation disponible puis acceptée ; allocations figées. |
| Répéter la validation | Même fiche validée, aucun pool XP supplémentaire. |
| Actualiser Mark après réouverture | Brouillon, 335 points attribués, 110 restants, caractéristiques et inventaire conservés. |

Migration `creation-budget.sql` installée sur **base test**, après
`recipe-corrections.sql` et `character-generation.sql`.

| Vérification | Résultat / preuve |
|---|---|
| Budget total et personnel refusés à la sauvegarde Supabase | OK, 12 contrôles API hébergée, journal privé `base-test-recipe/budget-api.json`. Les révisions et valeurs restent identiques après refus. |
| Budget professionnel fixe, scores ≤ 100, redistribution atomique et validation correcte | OK, inclus dans les 312 contrôles SQL ; trois fiches réelles préservées. Journal `base-test-recipe/budget-sql.log`. |
| Deux compteurs visibles et personnels limités à 120 | OK, navigateur réel : Estimation 85, tentative Médecine 90 limitée à 35 ; Alchimie 10 limitée à 0. Les points professionnels restants financent les compétences étoilées. |
| Changement de profession rendant un brouillon invalide | OK, validation désactivée, sauvegarde refusée et erreur explicite. Diminution progressive toujours possible ; valeurs de la fiche de recette restaurées après test. |
| Ctrl + flèche | OK, Défense augmente de 10 ; valeur de recette restaurée. |
| Brouillon antérieur incohérent | Tapamilacetico conservée : total 496/445, hors profession 387/120. Décision de répartition laissée au joueur/MJ ; phase serveur `draft`. |

Ces résultats couvrent ce correctif ; ils ne marquent pas les autres scénarios
du cahier comme exécutés.

## 2. Préparation et données de test

Effectuer les modifications, décès, attaques de sauvegarde et coupures réseau
sur une **copie isolée de la campagne**, avec des comptes et des PJ de test.
Les contrôles des fiches réelles avant publication sont des lectures et des
comparaisons. Aucun décès ni apprentissage de test sur Ilya, Gram ou Thokk.

Préparer :

- Un compte MJ explicitement autorisé, propriétaire de la campagne A.
- Deux comptes joueurs J1 et J2, membres d’un salon de A ; un compte extérieur J3.
- Une campagne B distincte, pour tester les refus entre campagnes.
- Deux salons S1 et S2 créés par le MJ et liés à A : chacun représente une session.
- Un PJ neuf de J1, INT 18, caractéristiques complètes et valides, sans sort appris.
  Son pool par session doit être **9 XP**. Conserver une copie avant validation.
- Un budget initial entièrement attribué. Avec 325 points professionnels et
  INT 18, les points personnels valent 180 et le budget commun vaut **505**.
  Conserver également un brouillon avec quelques points encore disponibles.
- Un second PJ vivant de J1 et un PJ de J2. Prévoir deux PJ homonymes pour J1.
- Un personnage généré sans fiche de campagne et deux prétirés en brouillon,
  appartenant au MJ, sans autre campagne ni session jouée.
- Une copie des fiches et inventaires d’Ilya, Gram et Thokk, avec leurs identités,
  révisions, points, scores, sorts et coches avant migration.

Pour les résultats de dés précis, utiliser le banc de test isolé qui fournit
des dés déterministes. Ne pas modifier les scores ou le générateur aléatoire de
production pour obtenir un résultat. Un essai manuel à dés aléatoires complète
le contrôle déterministe, mais ne remplace pas les cas d’égalité et de plafond.

## 3. Ordre d’exécution

1. Vérifier la sauvegarde, les versions et la conservation des fiches (lot A).
2. Tester la création et le verrouillage (lot B).
3. Tester le pool, les coches, les tentatives et les dépenses (lot C).
4. Tester l’apprentissage et le lancement des sorts (lot D).
5. Tester les droits, la sélection, les prétirés et les décès (lot E).
6. Tester les incidents réseau, la concurrence et les imports modifiés (lot F).
7. Vérifier les exports, Obsidian et les vues MJ (lot G).
8. Répéter le retour arrière sur la copie et examiner la décision de livraison (lot H).

Réinitialiser les fixtures entre les cas indépendants. Pour les scénarios en
chaîne, conserver l’état du test précédent et noter cette dépendance.

## 4. Scénarios et résultats attendus

### Lot A — Sauvegarde et conservation des données

| ID | Prio | Manipulation | Résultat attendu |
|---|---|---|---|
| A01 | P0 | Exporter la base de recette avant migration, fonctions, politiques et permissions comprises. Restaurer cet export dans une autre base isolée. | Sauvegarde restaurable ; identités, fiches et inventaires retrouvés. Les seuls fichiers SQL locaux ne remplacent pas la sauvegarde des fonctions réellement déployées. |
| A02 | P0 | Appliquer les migrations incrémentales dans l’ordre documenté, sur la copie. Comparer Ilya, Gram et Thokk avant/après. | Aucun changement des caractéristiques, scores, points, sorts, coches, objets ou monnaies. Les métadonnées de provenance ajoutées sont distinguées des valeurs de jeu. Aucun XP gratuit. |
| A03 | P0 | Réappliquer la dernière migration installée, selon sa procédure de reprise. | Aucun doublon, score modifié, décès annulé, disponibilité retirée rétablie ou sélection existante remplacée. Ne pas réinstaller toute l’API ancienne par-dessus les nouvelles migrations. |
| A04 | P0 | Présenter une fiche historique incohérente dans la copie : attribution inconnue ou score hors plafond. | Incohérence signalée et fiche conservée ; aucune correction automatique ni transformation de l’écart en points disponibles. Remonter au MJ pour arbitrage. |

### Lot B — Création et verrouillage

| ID | Prio | Manipulation | Résultat attendu |
|---|---|---|---|
| B01 | P1 | Ouvrir le brouillon INT 18 et consulter compétences, sorts et origine du budget. | Un budget commun de 505 points pour compétences et sorts. Origine consultable : 325 + 180. Une dépense dans un onglet réduit le même solde dans l’autre. |
| B02 | P0 | Attribuer les points, sauvegarder, puis confirmer la validation de création. Recharger. | Création validée une seule fois ; valeurs initiales conservées et verrouillées. Les colonnes de création et le budget libre disparaissent en jeu. |
| B03 | P0 | Après B02, tenter une baisse de points, une suppression de sort initial, un changement du budget ou des caractéristiques, puis une modification via le générateur ou un import. | Refus côté serveur, même avec une requête directe. Aucun point récupérable ; aucune modification partielle. Relecture identique des valeurs protégées. |
| B04 | P1 | Après B02, modifier les notes, les coches et l’équipement, sauvegarder et recharger. | Modifications autorisées conservées. Les valeurs numériques protégées ne changent pas. |
| B05 | P0 | Valider une création dépassant le budget ou comportant un score supérieur à 100 ; rejouer une validation déjà réussie. | Création invalide refusée. Revalidation réussie sans seconde allocation, second événement de validation ni renouvellement du pool. |
| B06 | P0 | En brouillon, tenter de changer INT depuis la fiche ou par les anciennes requêtes du générateur. Déplacer 1 point, puis essayer 4 points ou un transfert non équilibré. Rejouer une demande réseau et utiliser une troisième relance. | Caractéristiques de la fiche en lecture seule ; modifications forgées refusées côté serveur. Transfert équilibré de trois points au maximum accepté. Deux relances au maximum. Reprise réseau sans nouveau tirage. Preuves de développement : 18 contrôles Supabase OK et tests SQL ; recette manuelle à consigner. |
| B07 | P1 | Depuis la fiche, cliquer « Nouveau personnage », générer un PJ, ouvrir sa fiche et reprendre le précédent dans le sélecteur. | Création vide ouverte sans quitter le salon ; brouillon précédent conservé. Identités distinctes même à nom identique. Ancien PJ toujours sélectionnable. Parcours création/génération/fiche vérifié sur TEST avec Recette Navigation et Apprenti Test. |

### Lot C — Progression par session

Recette du 3 octobre sur **base test** : sauvegarde préalable débloquée,
jets conservés 19 et 28 (échecs), 71 (déverrouillé) contre 50 %, puis
1 XP attribué : Médecine 51 %, pool 5/6. Le moteur 3D existant est chargé.
Tests automatiques : double clic, résultat serveur révélé après animation,
réponse perdue reprise avec la même requête, refus précis avant toute tentative.
320 contrôles SQL, dont conservation des coches de compétences et sorts,
refus des coches forgées et préservation des trois fiches réelles.

Complément visuel vérifié sur base test : cadre identique au lanceur, commandes
à gauche, scène 3D à droite, cartouche commun sans icône supplémentaire.
Deux jets successifs sur « Recette Dés XP cc5813 » : 100 puis 79, chacun
enregistré une seule fois ; le même canevas reste présent après les deux jets.

Contrôle visuel à refaire à la livraison : activer les animations dans
« Lancer de dés », déverrouiller une cible cochée et observer les deux D10.
Le résultat final doit correspondre à celui publié dans le salon ; les boutons
restent bloqués jusqu'à la fin du jet. Vérifier également deux jets successifs
et le réglage animations désactivées.

| ID | Prio | Manipulation | Résultat attendu |
|---|---|---|---|
| C01 | P0 | Entrer pour la première fois avec le PJ validé INT 18 dans S1. Recharger et se reconnecter plusieurs fois. | Un seul pool de 9 XP pour ce PJ et S1. Le solde et les tentatives sont conservés ; aucune recharge à la reconnexion. |
| C02 | P0 | Réussir un usage utile d’une compétence puis d’un sort ; faire ensuite un échec sur une cible non cochée. Sauvegarder et recharger. | Les réussites utiles donnent les coches classiques ; l’échec ne donne aucune coche. Aucune dépense ni hausse automatique du score. |
| C03 | P0 | Sur une cible cochée à 32 %, effectuer une tentative avec D100 = 32, sans malus. Tenter à nouveau dans S1. | Égalité : échec du déverrouillage. Aucune dépense autorisée pour cette cible. Deuxième tentative refusée dans cette session. |
| C04 | P0 | Sur une autre cible cochée à 32 %, effectuer D100 = 33. Comparer avec INT et modificateurs du lanceur. | Déverrouillage réussi car 33 > 32. Aucun bonus d’INT, aucun malus de difficulté sur ce test de progression. Le score n’augmente pas encore. |
| C05 | P0 | Avec un pool intact de 9, dépenser 2 XP sur un sort déverrouillé à 32 %, puis 3 sur une compétence déverrouillée. Recharger. | Sort à 34 %, compétence +3 ; solde commun de 4 XP. Chaque point est dépensé une seule fois. La provenance initiale du sort reste inchangée. |
| C06 | P0 | Tenter une dépense sur une cible non déverrouillée, une valeur nulle/négative/fractionnaire, un montant supérieur au solde et un score final >100. | Toutes les dépenses invalides sont refusées. Le solde, le score, l’historique et les autres cibles restent inchangés. |
| C07 | P0 | Déverrouiller une cible à 99 %, lui attribuer 1 XP puis essayer d’en attribuer davantage. | Score plafonné à 100 %. Aucun point retiré pour une augmentation refusée ; le reliquat reste dans le pool jusqu’à clôture. |
| C08 | P0 | Depuis un solde connu de 4 dans S1, rejoindre S2 créé par le MJ. Retourner dans S1. | S1 clôturée : 4 XP perdus. S2 ouvre une fois son nouveau pool de 9. Coches et tentatives de la nouvelle session repartent selon les règles ; S1 ne restitue pas ses XP et reste non modifiable. |
| C09 | P0 | Confirmer la clôture de la session active avec un reliquat connu ; réessayer après rechargement. | Reliquat perdu une seule fois, solde disponible zéro, dépenses et nouvelles tentatives refusées. L’historique reste lisible. |
| C10 | P1 | Consulter plusieurs fiches en tant que MJ, dont un prétiré en préparation. | La consultation MJ ne démarre ni ne renouvelle les sessions des personnages consultés. |

### Lot D — Apprentissage et utilisation des sorts

| ID | Prio | Manipulation | Résultat attendu |
|---|---|---|---|
| D01 | P1 | Ouvrir l’apprentissage en jeu et lire les indications d’étude. | Source ou maître, étude de 1D6 jours ; Alphabétisation avec texte ou (INT + POU) % avec maître. Échec : +1D3 jours ; échec critique : maître ou autre source. Le joueur atteste l’étude, le test réussi et l’accord oral du MJ. |
| D02 | P0 | Tenter un apprentissage sans source, sans confirmation, avec zéro jour, un sort inconnu ou une session clôturée. | Refus sans tirage acquis, nouveau sort, débit du pool ni crédit libre. Il n’existe pas de validation numérique obligatoire du MJ à ajouter au parcours. |
| D03 | P0 | Avec INT 18, budget initial restant 0 et pool de 9, apprendre un sort autorisé avec dés 3, 4, 5. | Score exact **32 % = 20 + 3 + 4 + 5**, base 0 ; 32 points intégralement réservés à ce sort. Pool toujours 9, XP acquis inchangés, aucun point libre créé. Le résultat ne vaut pas 50 %. |
| D04 | P0 | Après D03, baisser à 20, supprimer le sort, ajouter le même sort avec une nouvelle requête, ou falsifier son attribution via un import. | Refus côté serveur ; tirage et score acquis conservés. Aucun remboursement ni second tirage. |
| D05 | P0 | Déverrouiller le sort de D03 et dépenser 2 XP. Dans le banc isolé seulement, vérifier ensuite une hausse administrative d’INT de 18 à 22. | Score 34 %, attribution d’apprentissage 32 et XP +2 séparés. Pool 9 →7. Le changement administratif d’INT ne transforme pas ce score en 56 %, ne refait pas les dés et ne crée pas de budget libre. |
| D06 | P1 | Consulter tous les sorts connus et sélectionner différents sorts dans le lanceur. Vérifier les conditions et PP requis. | Pas de quota de préparation ou de mémorisation. Tous les sorts connus sont accessibles ; PP et conditions de lancement restent nécessaires. Les règles d’alchimie ne sont pas modifiées. |
| D07 | P0 | Tester un score effectif 100 : D100 = 99 puis 00/100. Appliquer ensuite un malus ramenant le score effectif à 50 et lancer 80. | 99 réussit à 100 effectifs ; 00 est un échec critique. Avec le malus et 50 effectifs, 80 échoue : le plafond initial n’annule pas les difficultés de lancement. |

### Lot E — Droits, sélection, prétirés et décès

| ID | Prio | Manipulation | Résultat attendu |
|---|---|---|---|
| E01 | P0 | Créer S2 comme MJ ; tenter comme J1, puis par requête directe avec le compte joueur. | Seul le MJ autorisé crée le salon. Le joueur ne devient pas MJ en tentant cette action et aucun salon partiel ne subsiste. |
| E02 | P0 | Comme J1, choisir alternativement ses deux PJ, dont les homonymes, et recharger. Modifier leurs notes et inventaires. | Sélection explicite et persistante. Chaque fiche, brouillon, inventaire et pool reste attaché à son identité. Aucun choix implicite du premier PJ et aucune fusion par nom du joueur ou du personnage. |
| E03 | P0 | Comme J1, demander directement la fiche de J2 ou tenter de la sélectionner. Comme J3, utiliser les identités de la campagne A. | Refus d’accès ou absence de fiche selon le contrat de lecture. Aucun transfert de propriété ni divulgation des données de J2. L’autorisation se vérifie au serveur. |
| E04 | P1 | Comme MJ, retirer puis rétablir la disponibilité d’un PJ vivant de A. Tenter la même action comme joueur ou sur un PJ d’une campagne extérieure. | Disponibilité modifiée uniquement par le MJ de A pour les PJ autorisés. Fiche et valeurs conservées ; disponibilité ne donne pas la propriété à un autre joueur. |
| E05 | P0 | Proposer un prétiré libre, puis un autre réservé à J1. Faire choisir ce dernier par J2 puis J1. | J2 ne peut pas prendre le prétiré réservé. J1 reçoit la fiche et la gère lui-même ; valeurs de génération conservées. Un PJ déjà attribué ou joué ne redevient pas un prétiré libre. |
| E06 | P1 | Créer explicitement la fiche du personnage généré sans état de campagne ; ouvrir ensuite « Créer un nouveau PJ ». | Caractéristiques reprises sans scores acquis inventés ; nouvelle fiche en brouillon. La création suivante ne remplace aucun ancien PJ ; le précédent brouillon de nouvelle création est conservé en archive locale. |
| E07 | P0 | Comme MJ, confirmer le décès d’un PJ de test avec 8 XP restants. Tenter ensuite disponibilité, sélection, sauvegarde, apprentissage et progression. | PJ mort absent des choix, sélection directe refusée, pools ouverts clôturés et 8 XP perdus. Fiche et historique conservés en lecture seule. Pas de résurrection par disponibilité. Le décès concerne l’identité permanente, y compris ses autres campagnes. |
| E08 | P0 | Après E07, faire choisir à son joueur un autre PJ disponible. Valider sa création si nécessaire et consulter les deux historiques. | Le remplacement reçoit uniquement ses propres droits, attributions et pool. Aucun point ni reliquat du mort récupéré. L’ancienne fiche reste conservée. |
| E09 | P0 | Se déconnecter/expirer l’authentification avant une sauvegarde ou dépense ; utiliser un salon non autorisé ou une autre campagne. | Refus sans modification. Le message distingue l’accès/connexion du manque d’XP. Après reconnexion, une lecture permet de connaître l’état réel. |

### Lot F — Concurrence, réseau et requêtes modifiées

Ces essais nécessitent deux fenêtres/comptes, les outils réseau du navigateur
ou le banc technique. Une modification visuellement bloquée ne suffit pas :
vérifier aussi le refus par la requête directe et relire les données serveur.

| ID | Prio | Manipulation | Résultat attendu |
|---|---|---|---|
| F01 | P0 | Double-cliquer ou rejouer exactement la même tentative de progression et le même apprentissage, avec le même identifiant de requête. | Un seul tirage, une seule acquisition ou tentative ; même reçu retourné. Un nouvel identifiant ne permet pas de contourner l’unicité du sort ou de la tentative par session. |
| F02 | P0 | Couper la réponse réseau après validation serveur d’une tentative, dépense ou acquisition. Recharger puis récupérer le résultat. | L’interface indique le résultat incertain et reprend la même requête. Aucun nouveau dé ni double débit. Une erreur de publication/export n’annule pas un gain déjà confirmé. |
| F03 | P0 | Depuis deux fenêtres, dépenser simultanément le dernier XP ; tenter aussi deux acquisitions du même sort et deux attributions du même prétiré. | Aucun solde négatif. Une seule opération incompatible peut gagner ; l’autre reçoit un refus ou doit recharger. Un seul sort/tirage et un seul propriétaire du prétiré. |
| F04 | P0 | Conserver une ancienne révision, modifier ailleurs, puis sauvegarder cette ancienne fiche. Modifier les notes pendant un chargement ou une dépense. | Révision périmée refusée sans écrasement silencieux. Les notes/coches saisies pendant les parcours qui les préservent restent présentes ; toute action de remplacement explicite annonce la perte des modifications locales. |
| F05 | P0 | Importer ou envoyer une fiche avec faux XP, faux crédits d’apprentissage, phase « brouillon » fabriquée, baisse de score, suppression ou nouvel identifiant. | Le serveur utilise sa provenance et ses droits, refuse les modifications numériques interdites et ne crée aucun point libre. La fiche d’origine demeure intacte. |
| F06 | P0 | Pendant une sauvegarde d’inventaire en attente pour PJ A, sélectionner PJ B dans un autre onglet. | La sauvegarde conserve sa cible A ; aucune opération de A ne modifie B. Brouillons et journaux locaux restent séparés. |
| F07 | P0 | Lancer une tentative XP réussie puis rejouer sa requête. Simuler ensuite un échec de publication du jet dans le banc isolé. | Un seul jet publié pour la tentative. Si la publication transactionnelle échoue, la tentative et sa révision ne sont pas validées partiellement. |

### Lot G — Affichages, exports et Obsidian

| ID | Prio | Manipulation | Résultat attendu |
|---|---|---|---|
| G01 | P1 | Comparer la fiche en jeu, le lanceur, la progression, le PDF, le Markdown et la vue MJ après D03 puis D05. | Même score : 32 puis 34 %. En jeu, fiche/PDF montrent score et coche ; le Markdown conserve la provenance nécessaire aux imports. Aucun affichage ne suggère des points initiaux redistribuables. |
| G02 | P1 | Exporter puis relire un Markdown de sort appris, base 0 ; comparer avec un sort historique. | Le sort appris ne reçoit pas INT une seconde fois. Les valeurs et origines historiques restent préservées ; l’import ne donne pas de droits supplémentaires ni de crédits libres. |
| G03 | P0 | Dans un coffre de test, importer deux PJ d’un même joueur, puis deux PJ de même nom. Examiner les deux vues MJ et les fichiers. | Deux identités et deux fiches distinctes. Les homonymes ont des fichiers avec suffixe d’identité ; aucun écrasement. Les fichiers existants à nom unique conservent leur chemin. Sans identité permettant de distinguer des homonymes, l’import s’arrête. |
| G04 | P0 | Lire les copies d’Ilya, Gram et Thokk dans Dice Forge et Obsidian ; comparer avec le relevé avant migration. | Scores, sorts et inventaires inchangés. Les différences historiques connues restent documentées. Aucun PJ synthétique importé dans le coffre réel. |
| G05 | P1 | Actualiser une fiche dans le suivi MJ après avoir ajouté une note MJ ou corrigé une valeur locale. Consulter un PJ mort. | Notes et corrections locales conservées ; données source actualisées selon le mécanisme de suivi. Le statut mort reste identifiable et sa fiche historique est présente. |
| G06 | P1 | Lire l’aide, les livrets et les libellés de la fiche. Tester un affichage mobile et l’aperçu A4. | Terminologie par session ; pool d’XP distinct d’un bonus au D100. Aide cohérente avec accord oral, 20+3D6, plafond, disponibilité et décès. Contrôles utilisables, scores et coches lisibles. |

### Lot H — Retour arrière et mise en service

| ID | Prio | Manipulation | Résultat attendu |
|---|---|---|---|
| H01 | P0 | Répéter le retour arrière sur la copie de recette, avec les versions de code et de base correspondantes. Comparer au relevé sauvegardé. | Fiches, inventaires et accès restaurés de façon cohérente. Procédure et durée consignées. Les nouvelles données créées pendant l’essai sont exportées avant restauration ; aucun simple changement d’API supposé suffisant. |
| H02 | P0 | Avant publication, contrôler la liste des migrations, les fichiers à publier, la sauvegarde fraîche et le rapport d’anomalies. | Lot cohérent identifié et retour arrière prêt. Aucune anomalie P0 ouverte ; réserves et cas non applicables examinés par le MJ. |
| H03 | P0 | **Après autorisation distincte de mise en service**, installer le lot puis vérifier une lecture et une écriture contrôlée. Relire Ilya, Gram et Thokk et contrôler Obsidian. | Version publiée et serveur compatibles ; droits et sauvegarde vérifiés. Valeurs réelles conservées. Les décès/apprentissages destructifs ne servent pas de vérification de production. Noter la version effectivement livrée. |

## 5. Registre d’exécution

Dupliquer la ligne ci-dessous pour **chaque ID** du cahier. Les résultats
attendus du lot restent la référence ; décrire ici ce qui a réellement eu lieu.

| ID | Version / environnement | Date / testeur | Résultat | Résultat réel / preuve | Anomalie |
|---|---|---|---|---|---|
| À renseigner | | | À faire | | |

### Fiche d’anomalie

```text
Anomalie : ANO-___
Test concerné :
Priorité : P0 / P1
Version et environnement :
Compte / PJ / salon de test :
Étapes pour reproduire :
Résultat attendu :
Résultat observé :
Données modifiées ou perdues :
Preuve (capture, export ou journal privé) :
Décision du MJ si une ancienne fiche est incohérente :
Correction / version corrigée :
Test rejoué le / par :
Statut : Ouverte / Corrigée à retester / Fermée / Réserve acceptée
```

## 6. Preuves automatisées disponibles

État constaté pendant le développement local, **distinct du registre de recette** :
160 contrôles SQL ont passé avec les trois fixtures réelles conservées.
Des tests navigateur ont vérifié création, progression, apprentissage, sélection,
réservation des prétirés et lecture seule des PJ morts. L’import Obsidian a été
testé sur les identités et les collisions de noms, sans synchronisation réelle.
La validation générale du projet a également passé.

Les commandes de référence, exécutées depuis le dépôt, sont :

```text
node scripts/test_character_roster_sql.mjs <runtime-postgres-isolé> [snapshot-privé]
node scripts/test_character_roster_browser.cjs <module-playwright>
node scripts/test_dead_character_browser.cjs <module-playwright>
node scripts/test_progression_browser.cjs <module-playwright>
node scripts/test_spell_learning_browser.cjs <module-playwright>
node scripts/test_obsidian_character_identity.cjs <chemin-plugin-obsidian-main.js>
node scripts/test_character_store.cjs
node scripts/test_inventory_load.cjs
node scripts/test_inventory_sync.cjs
node scripts/test_creation_form.cjs
node scripts/test_pj_magic.cjs
node scripts/test_mj_room.cjs
python scripts/validate_project.py
git diff --check
```

Le test SQL complet installe les migrations dans un PostgreSQL temporaire et
inclut les contrôles des étapes précédentes. Il ne doit pas viser la base réelle.
Pour une nouvelle recette, joindre les nouveaux journaux avec la version testée.

## 7. Décision de livraison

- [ ] Tous les tests P0 de la fonctionnalité livrée ont été exécutés et sont OK.
- [ ] Aucun incident de droits, perte de données, double attribution ou point gratuit ouvert.
- [ ] Les tests P1 ont été exécutés ; chaque réserve éventuelle est documentée et arbitrée par le MJ.
- [ ] Les fiches historiques et les inventaires sont conservés ; toute incohérence a été remontée au MJ.
- [ ] La sauvegarde des données et métadonnées serveur est fraîche et restaurable.
- [ ] Le retour arrière a été répété et la version de code associée est identifiée.
- [ ] Le périmètre et l’autorisation de mise en service sont consignés.
- [ ] Après livraison : vérifications contrôlées faites et version notée dans EVOLUTIONS.md.

Décision : **Livraison acceptée**, confirmée par l'utilisateur le 3 octobre 2026.

MJ : ____________________ Date : ____________________

Réserves ou motifs du refus :

____________________________________________________________
