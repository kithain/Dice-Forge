# Reprise personnages v2

Livraison du 3 octobre 2026 : les migrations incrémentales de création,
progression, roster et corrections de recette sont installées en production.
Le bilan et le retour arrière correspondant sont dans
[MISE_EN_PRODUCTION.md](../../MISE_EN_PRODUCTION.md).
Les mentions « local, non déployé » ci-dessous documentent les étapes de préparation.

## Étape 7 : sélection, disponibilité et décès — local, non déployé

Si l’écran signale `PGRST202` pour `df_character_roster`, vérifier dans l’éditeur
SQL du serveur concerné, sans modifier les données :

```sql
select to_regprocedure('public.df_character_roster(text,text,uuid,uuid)');
```

Un résultat NULL signifie que cette signature n’est pas installée. Préparer
la sauvegarde et vérifier les migrations précédentes avant d’appliquer le lot.
Si la fonction existe déjà avec ces paramètres et les permissions documentées,
rafraîchir le cache PostgREST avec `NOTIFY pgrst, 'reload schema';`, puis réessayer.
Le SQL de migration comporte déjà cette notification. L’écran affiche désormais
l’indisponibilité avec un bouton de reprise ; il ne simule pas une sélection ni
un accès aux fiches d’autres joueurs.

Appliquer `character-roster.sql` **après** `spell-learning.sql`, avec les étapes
précédentes déjà installées. Ne pas réinstaller `api.sql` sur cette base.
La migration conserve les états, scores, attributions et inventaires existants.
Elle rend les PJ vivants de campagne disponibles et reprend automatiquement une
sélection uniquement lorsqu'un propriétaire possède une seule fiche vivante.
Les sélections ultérieures sont conservées côté serveur, par campagne et compte.

`df_character_roster(p_room,p_operation,p_character,p_reserved_user)` expose
`list`, `select`, `new`, `attach`, `offer`, `withdraw`, `preset` et `dead`.
`new` ouvre une nouvelle création sans modifier les PJ existants ; le brouillon
est séparé, et un brouillon de création antérieur est archivé localement.
Disponibilité, propriété et statut de vie sont distincts. Seul le MJ explicite,
propriétaire de la campagne, peut proposer, retirer ou déclarer un décès.
Un joueur sélectionne ses propres PJ disponibles ou un prétiré libre/réservé à
son compte. Une sélection ne transfère jamais la fiche d'un autre joueur.

Un prétiré doit appartenir au MJ, sans autre état de campagne ni session jouée.
Le MJ prépare son brouillon et le propose ; son premier choix attribue
atomiquement le personnage au joueur, qui valide ensuite sa création.
Deux choix concurrents ne peuvent donner deux propriétaires. Un PJ déjà joué
ou attribué ne peut être remis en circulation comme prétiré. La réservation
se fait dans l'interface par nom de membre de la campagne.

`attach` reprend les caractéristiques enregistrées d'un personnage généré et
crée explicitement sa fiche de campagne en brouillon, sans points acquis inventés.
Les requêtes, brouillons et inventaires sont liés à l'identité permanente : deux
PJ d'un compte, même homonymes, restent séparés. Une opération d'inventaire déjà
en cours garde sa cible d'origine. Les lectures MJ ne démarrent pas une session
pour les fiches qu'il consulte.

`dead` conserve les données, retire les disponibilités et sélections, clôture
les pools ouverts et perd leur reliquat. Les sauvegardes de fiche/inventaire,
la validation, les XP et l'apprentissage sont refusés après décès. La lecture
historique explicite reste autorisée au propriétaire et au MJ. Aucun bouton de
disponibilité ne peut rétablir la vie. Les événements de cycle de vie sont privés
et immuables. La mort concerne le personnage permanent, dans toutes ses campagnes.

```text
node scripts/test_character_roster_sql.mjs <embedded-postgres-runtime> [private-campaign-live.json]
node scripts/test_character_roster_browser.cjs <playwright-module> [screenshot]
node scripts/test_obsidian_character_identity.cjs <obsidian-plugin-main.js>
```

L'import Obsidian utilise les identités permanentes dans les deux vues MJ.
Deux fichiers de même nom reçoivent un suffixe d'identité ; les chemins des noms
uniques existants sont conservés. Le code du plugin a été modifié localement,
sans exécuter de synchronisation ni écraser les fiches du coffre.

Décisions utilisateur : personnage permanent ; progression ET inventaire par campagne ; séances partageant cet état ; salle **4SSU** faisant autorité ; IDs stables pour compétences et sorts ; contrôle complet de la reprise.

La reprise hors ligne, l'intégration applicative et les scripts de bascule sont disponibles. `schema.sql` définit un schéma parallèle administrateur, sans accès applicatif. Sa création, son remplissage et son retour arrière ont été exécutés sur PostgreSQL 17.10 local avec les données sauvegardées. Le numéro de version, les archives et les valeurs brutes permettent de contrôler la reprise avant l'intégration.

## Exécution

```powershell
python migrations/character-v2/prepare.py --backup D:/script/Dice-Forge-backups/2026-10-02/export-original.json --output D:/script/Dice-Forge-backups/2026-10-02/v2
python -B -m unittest discover -s migrations/character-v2 -p test_prepare.py -v
```

Les exports réels restent hors dépôt Git. `catalog.json` est un registre figé et versionné : on peut modifier un libellé ou ajouter des alias, mais jamais régénérer ou réattribuer ses IDs. `legacy_index` est une provenance de conversion, pas une identité à utiliser pour les nouveaux jets/coches.

## Garanties vérifiées

- Les lignes de `personnages`, `pj_sheets` et `pj_inventory` sont archivées intégralement, avec leurs valeurs, types JSON et empreinte SHA-256. Les générations initiales sont conservées séparément.
- Les quatre fiches de 4SSU et leurs inventaires sont les états actifs ; aucune sélection par date globale ou par nom de joueur. Les autres états ne sont pas fusionnés.
- Chaque champ libre, caractéristique, point, score stocké, coche, sort nommé, élément d'inventaire et montant de monnaie de référence est contrôlé après relecture du fichier écrit.
- Les anonymes et champs inconnus sont préservés dans les sources et signalés. Les compétences ambiguës dans l'état actif interrompent la conversion au lieu d'être ignorées.
- Les éléments d'inventaire conservent toutes leurs propriétés ; le conteneur de potions et les descriptions multilignes ne sont pas aplatis.
- Les scores/budgets incohérents ne sont pas corrigés silencieusement. Les armes/armures historiques de fiche sont encore conservées pour comparaison avec l'inventaire canonique.

## Bascule applicative

Le site active `characterV2` dans sa configuration. `character-store.js` adapte les lectures/écritures des écrans à des RPC transactionnelles : personnage permanent, état par campagne, compétences/sorts avec leurs IDs, objets et bourse. Les séances liées par le MJ partagent les mêmes state_id et character_id. Créer un salon depuis une campagne le rattache à cette campagne ; sans salon source, une nouvelle campagne est créée. Les salons historiques ne sont pas fusionnés automatiquement.

Les données sources restent intégralement dans archives et dans les anciennes tables, préservées pour le retour arrière. Les tableaux JSON des formulaires sont une projection de compatibilité ; les tables relationnelles sont utilisées pour les compétences, sorts, objets et monnaie. Les indices servent seulement à dessiner les formulaires anciens. Les caches sont isolés par compte et salon, et les coches en attente portent aussi l'ID stable. Une révision périmée refuse la sauvegarde.

`build_deployment.py` produit un SQL contenant les données privées : écrire ce fichier hors Git. Ce script crée une sauvegarde des tables publiques et des métadonnées (fonctions, triggers, vues, contraintes, index, permissions, politiques), vérifie que les sources n'ont pas changé, importe puis compare les contenus. Le commutateur reste désactivé jusqu'à activation séparée. Aucun compte Auth ou historique de jets n'est transformé. Les paramètres internes Auth/Supabase ne sont pas un export intégral du projet.

Le sort anonyme à 59 points de test3 reste préservé sans attribution arbitraire. Les dépassements de budget historiques sont signalés. Testeur sans propriétaire reste archivé.

## Correctifs de sauvegarde du 3 octobre 2026

Pour une base v2 déjà installée, exécuter `save-fixes.sql` dans le SQL Editor
Supabase. Cette migration transactionnelle peut être réexécutée ; elle ne
change pas le commutateur d'activation et conserve les données ainsi que les
autorisations des fonctions existantes. `api.sql` contient les mêmes corrections
pour les nouvelles installations. Ne pas réexécuter `api.sql` sur une base déjà
installée.

La fiche et l'inventaire ont désormais leurs propres révisions. Un conflit sur
la même ressource est toujours refusé. Le générateur actualise les
caractéristiques de sa campagne actuelle, sans modifier celles des autres
campagnes. Une caractéristique vide est enregistrée comme N/A (`null`) ; une
valeur renseignée doit être un entier entre 0 et 999.

Les tests SQL utilisent uniquement des données synthétiques et leur propre
serveur PostgreSQL local :

```text
node scripts/test_campaign_save_sql.mjs <répertoire-du-runtime-embedded-postgres>
```

Après la migration et la publication du site, recharger les écrans pour adopter
les nouvelles révisions. Le chantier de gestion des personnages, notamment la
reprise d'un personnage généré sans fiche de campagne, reste différé dans
`IDEA.md`.

## Retour applicatif immédiat

Exécuter `switch-legacy.sql` dans Supabase remet les requêtes du site sur les anciennes tables, sans attendre un redéploiement. Les changements v2 sont volontairement abandonnés, conformément à la décision utilisateur. Pour remettre le site exact d'avant refonte, utiliser le commit `c283eb1959ebabb5537f44d90f779da7c7482f37` ; ne pas réécrire l'historique distant. `rollback.sql` peut ensuite retirer le schéma v2 après armement explicite.

## Retour arrière testé le 2 octobre 2026

`test_rollback.mjs` crée son propre serveur PostgreSQL sur localhost, sans accepter de connexion distante. Dix contrôles passent : restauration exacte des 20 sources ; création et import SQL v2 ; relecture des valeurs ; conservation des anciennes données et structures ; refus du rollback sans armement ; exécution de `rollback.sql` ; comparaison après rollback ; corruption volontaire de la copie puis restauration ; séquences sans collision. Huit tests de conversion passent également. Le test SQL a permis de corriger le catalogue : 38 sorts réels uniques, sans professions ni IDs répétés. Les IDs des sorts réels ont été conservés.

```powershell
npm.cmd install --prefix D:/script/Dice-Forge-backups/2026-10-02/rollback-runtime embedded-postgres@17.10.0-beta.17 --no-audit --no-fund
node migrations/character-v2/test_rollback.mjs D:/script/Dice-Forge-backups/2026-10-02/rollback-runtime D:/script/Dice-Forge-backups/2026-10-02/export-original.json D:/script/Dice-Forge-backups/2026-10-02/v2/character-v2.json D:/script/Dice-Forge-backups/2026-10-02/rollback-test
```

Preuve : `D:/script/Dice-Forge-backups/2026-10-02/rollback-test/rollback-verification.json`. Empreinte des données avant/après : `82d9edc48d62a0ae33dcc4eb4a638756975bcaa306fbdc9c8af83e7b4b552349`.

Le commutateur applicatif et les RPC ont été testés sur PostgreSQL local : 15 contrôles passent. Le SQL de déploiement complet est exécuté par la répétition, puis le retour ancien et la restauration sont vérifiés. La politique acceptée par l'utilisateur est de revenir à la sauvegarde avant bascule, sans conserver les changements ultérieurs v2. Les anciennes tables doivent rester disponibles jusqu'à validation ; réactiver l'application ancienne avant de retirer le schéma v2. Le rollback SQL est transactionnel et demande `SET diceforge.allow_v2_rollback = 'yes'` dans la même session. Conserver la sauvegarde externe et le schéma de sauvegarde pendant la période de recette.

## Étape 2 — Création verrouillée et provenance des points (3 octobre 2026)

Implémentation locale, non déployée : `creation-lock.sql` s'applique après
`save-fixes.sql` sur une base v2 existante. Pour une installation nouvelle,
installer schéma et API, importer les sources, puis appliquer ce correctif.
Le script est transactionnel et réexécutable. Il ne change pas le commutateur
v2 et ne crée aucun pool de session ni gain de sort.

Avant la production, conserver un export frais des données, fonctions,
permissions et politiques effectivement déployées. Ne pas réexécuter
`api.sql` ni `save-fixes.sql` après ce correctif sans réappliquer ensuite
`creation-lock.sql`, car ces scripts rétablissent la projection antérieure.

### Reprise sans réinterprétation

- Les états existants deviennent des références héritées : mêmes scores,
  points, coches, sorts et inventaires. Leur origine création/progression
  n'est pas devinée et aucun écart du pool professionnel ne devient de l'XP.
- Les incohérences historiques sont conservées et signalées dans
  `creation.review_issues`, avec phase `legacy_review`. Le MJ doit trancher ;
  aucun correctif de score ni déclassement automatique n'est effectué.
- Une nouvelle fiche reste en phase `draft` après ses sauvegardes.
  `df_validate_creation(state_id, room, expected_revision)` vérifie les droits,
  le budget et les scores avant une validation explicite. La répétition de
  cette validation ne crée pas de nouveau crédit ou événement.

### Contrôles serveur et interface

`creation_states` conserve budget et référence de création ;
`initial_allocations` conserve la provenance des valeurs initiales ;
`point_events` réserve un historique séparé pour création, XP et apprentissage.
Les tables privées sont sous RLS et sans droits d'écriture applicatifs directs.
L'historique est immuable. Les opérations d'XP et d'acquisition seront ajoutées
aux étapes 3 et 5 ; les nouveaux montants exposés sont encore à zéro.

Les triggers protègent les points, bases, scores, caractéristiques, profession,
espèce et budget après validation, y compris via fiche entière, onglet sorts,
import ou générateur. Les coches, notes, ressources et inventaire restent
modifiables. Les caractéristiques sont figées par la sauvegarde ordinaire ;
une future progression de caractéristique, notamment POU, devra passer par
une opération dédiée pour ne pas rouvrir la création.

La projection ajoute `creation`, `progression` et `allocation` depuis le serveur,
à la place des éventuelles métadonnées forgées dans le JSON du client.
La fiche propose « Valider la création » uniquement pour un brouillon v2
sauvegardé. Dès validation, les colonnes de répartition initiale sont masquées,
les scores historiques sont conservés et les lignes absentes de l'interface
ne sont pas supprimées par une sauvegarde de notes.

### Vérification

```text
node scripts/test_creation_form.cjs
node scripts/test_creation_lock_sql.mjs <embedded-postgres-runtime-directory>
node scripts/test_creation_browser.cjs <playwright-module> <optional-screenshot-path>
```

Le test SQL accepte en troisième argument un export privé de l'audit
`campaign-live.json` pour vérifier, uniquement sur PostgreSQL local isolé,
la conservation des trois fiches réellement lues. Aucun export privé n'est
commité ni envoyé dans la CI. La CI exécute les contrôles synthétiques.

Le 3 octobre : 33 contrôles SQL passent avec les trois fiches réelles conservées ;
le formulaire et le parcours navigateur sauvegarde/validation passent également.
Les tests existants de campagne, grimoire, coches et sauvegarde SQL restent verts.

### Retour arrière du lot

La mise en production de ce lot reste à préparer avec la sauvegarde serveur.
Ne pas retirer les tables de références héritées ni l'historique des points
pour simplement masquer le bouton dans le client. Tant que ce lot n'est pas
déployé, la production reste sur son API actuelle. L'étape 8 doit préparer
la restauration complète de la version effectivement déployée avant activation.

## Étape 3 — Progression par room (préparée localement)

Appliquer `progression.sql` **après** `save-fixes.sql`, puis `creation-lock.sql`.
Le lot doit être publié avec ses changements JavaScript ; aucun SQL de ce lot
n'a été exécuté sur la production. Ne pas réexécuter les migrations antérieures
par-dessus ce lot : elles remplaceraient les protections et projections.
La réapplication de `progression.sql` seul est testée et conserve les données.

`xp_sessions` conserve par état de campagne et room le pool `ceil(INT / 2)`,
les coches, la dépense, la clôture et les points perdus. Une seule session peut
être ouverte à la fois pour un état. `xp_attempts` conserve chaque D100 et son
verdict. Les gains numériques sont des événements `point_events.kind = xp` ;
la référence initiale reste intacte et les sauvegardes ordinaires ne peuvent
ni augmenter ni diminuer les points acquis.

L'accès à sa propre fiche ou à son personnage dans le salon ouvre la session
une seule fois. La validation d'une nouvelle création ouvre aussi sa session
dans la même transaction. Pour la première reprise, les coches historiques
auditées sont conservées ; les sessions suivantes démarrent sans coche.
Lire la fiche d'un autre joueur en tant que MJ n'ouvre pas sa session.
Passer dans une nouvelle room ferme l'ancienne réserve et perd le reliquat ;
revenir dans une ancienne room n'en recrée pas et rend la fiche en lecture seule
dans ce salon. La progression affichée par la lecture de fiche correspond au
salon demandé ; les scores restent ceux de l'état de campagne partagé.

RPC joueur :

```text
df_progression(p_state, p_room, p_operation,
               p_resource, p_id, p_amount, p_request, p_expected_revision)
```

Opérations : `open`, `status`, `unlock`, `spend`, `close`.
`unlock` exige une coche et une tentative disponible pour cette cible dans cette
room. Le serveur tire le D100, compare strictement au score enregistré et
consomme la tentative, même si elle échoue. `spend` exige un déverrouillage,
un entier positif, un solde suffisant et un score final au plus égal à 100.
Chaque mutation verrouille l'état et vérifie sa révision ; gain et débit sont
transactionnels. Un UUID `p_request` identifie un déverrouillage ou une dépense :
rejouer la même requête renvoie son reçu sans nouveau tirage ni gain ; réutiliser
l'identité pour une autre cible, un autre montant ou une autre opération est refusé.
Les résultats se trouvent dans `receipt`, `session` et `sheet_data`.

`df_create_session_room(p_source, p_code, p_name)` crée le salon, l'adhésion du MJ
et le lien de campagne dans une transaction. `mj_users` est un rôle explicite
privé, initialisé à partir des propriétaires de campagnes existantes.
Un nouveau MJ doit être inscrit administrativement après vérification de son
identité ; un joueur ne peut pas s'attribuer ce rôle. La création directe d'une
room et son rattachement sont aussi protégés. Le rôle MJ autorise une nouvelle
campagne ; une session d'une campagne existante exige son propre MJ.
Avant déploiement, vérifier la liste des propriétaires existants avec le MJ,
sauvegarder les fonctions et droits effectivement déployés et préparer le retour
arrière complet, notamment des RPC publics déplacés derrière une façade privée.

L'interface affiche le solde et les points perdus. Les boutons de déverrouillage, de répartition et de clôture sont réalisés
localement à l’étape 4, avec affichage du D100 serveur et publication transactionnelle. Les sorts appris via `20 + 3D6` restent l'étape 5.

```text
node scripts/test_progression_sql.mjs <embedded-postgres-runtime> [private-campaign-live.json]
node scripts/test_creation_browser.cjs <playwright-module> [screenshot]
node scripts/test_brp_malus.cjs
```

Vérifié le 3 octobre : **92 contrôles SQL**, dont la conservation des trois fiches
réelles, les accès, budgets, coches, tentatives, rejouements, clôtures,
concurrence entre deux connexions indépendantes et plafonds. Le parcours navigateur
et les tests existants de grimoire, coches et formulaire passent également.
À 100 % effectif en jeu, 01–99 réussissent et 00 est une maladresse ; les difficultés
et malus qui abaissent le score restent appliqués avant la résolution.

## Étape 4 — Onglet de progression (local)

Ordre du lot : `save-fixes.sql` → `creation-lock.sql` → `progression.sql` →
`progression-publication.sql`, puis les fichiers du site correspondants.
La dernière migration ajoute un déclencheur sur chaque nouvelle tentative.
Le D100, le verdict et le jet public dans `rolls` sont enregistrés ensemble.
Si la publication échoue, aucune tentative n'est consommée. Les répétitions de
requêtes et de migration ne republient pas les jets. Les anciennes tentatives
ne sont pas publiées rétroactivement.

L'onglet de la fiche affiche chaque compétence et sort coché, son score actuel,
son éventuel jet consommé, son autorisation de dépense et le solde commun.
Le joueur répartit des entiers positifs, dans la limite du solde et de 100 %.
La clôture demande confirmation de la perte du reliquat et interdit la dépense.
Les notes et coches locales sont sauvegardées avant la mutation ; après un gain,
l'export Markdown est actualisé à partir des scores canoniques, sans recréer
de crédit dans le budget initial. L'échec de cet export ne remet pas en cause
un gain déjà confirmé, et l'interface demande alors une sauvegarde ultérieure.

Une requête en attente conserve ses paramètres et son UUID dans le brouillon,
par utilisateur, personnage et room. Si le réseau laisse son résultat incertain,
le joueur récupère cette même opération, y compris après un rechargement.
Aucune nouvelle opération n'est proposée tant que ce résultat reste à récupérer.
Les erreurs explicites du serveur ne consomment pas de tentative supplémentaire.

```text
node scripts/test_progression_browser.cjs <playwright-module> [screenshot]
node scripts/test_progression_sql.mjs <embedded-postgres-runtime> [private-campaign-live.json]
```

Vérifié localement : **94 contrôles SQL** et parcours navigateur réel avec
réponse réseau perdue après enregistrement, rechargement, récupération du même
UUID, gain dans une compétence et un sort, égalité échouée, refus de seconde
tentative, conservation des notes et clôture. Les trois fiches de l'audit sont
préservées. Aucun changement n'est déployé sur la base ou le site public.

## Étape 5 — Apprentissage des sorts (local)

Ajouter `spell-learning.sql` après `progression-publication.sql`, puis publier
ensemble les fichiers de la fiche, des jets et du carnet MJ correspondants.
Ne pas réappliquer les migrations antérieures sur ce lot : elles remplaceraient
les fonctions de projection des attributions. La réapplication de la migration
d'apprentissage seule est testée sans modification des acquisitions.

```text
df_learn_spell(p_state, p_room, p_spell, p_source, p_method,
               p_study_days, p_confirmed, p_request, p_expected_revision)
```

Le propriétaire d'une fiche validée, dans sa session active, indique le sort du
catalogue, sa source, la méthode `text` ou `mentor` et les jours d'étude effectués.
Il confirme avoir terminé l'étude, réussi le test requis et obtenu l'accord oral
du MJ. Cette confirmation du joueur est une attestation de jeu, sans nouvelle
validation numérique du MJ. L'interface rappelle 1D6 jours, Alphabétisation avec
un texte ou `(INT + POU) %` avec un maître, et les conséquences d'un échec.

Le serveur tire les trois D6 et enregistre ensemble leur résultat, le sort et
l'événement `spell_learning`. Le tirage exact `20 + 3D6` constitue sa référence
initiale : base zéro, provenance `learning`, attribution de 23 à 38 points.
Les points s'ajoutent au total utilisé, exclusivement sur ce sort, sans débit
du pool d'XP et sans crédit libre dans le budget initial. Les sauvegardes
ordinaires ne peuvent ni abaisser ni supprimer cette attribution, ni créer
un sort supplémentaire sans opération autorisée.

Le reçu contient les dés, le score, la source, la méthode et la durée.
L'UUID de requête est partagé avec les autres opérations de points : un retour
réseau incertain se récupère avec les mêmes paramètres, même après rechargement.
Un autre UUID ne permet pas de relancer l'acquisition d'un sort déjà connu.
Les écritures concurrentes sont sérialisées ; deux reprises du même UUID
retrouvent un seul événement et un seul tirage.

Les XP ultérieurs utilisent la progression existante. Ils s'ajoutent au score
acquis et laissent les dés et les points d'apprentissage intacts. La fonction
commune `spellScore` est utilisée dans la fiche, le lanceur, l'onglet XP,
le Markdown, l'impression et le résumé MJ. Les imports Markdown conservent la
base inscrite dans la ligne du sort ; les données serveur restent la référence
pour les permissions et la provenance. Un changement administratif d'INT ne
modifie ni le score acquis ni le budget de création déjà validé.

```text
node scripts/test_spell_learning_sql.mjs <embedded-postgres-runtime> [private-campaign-live.json]
node scripts/test_spell_learning_browser.cjs <playwright-module> [screenshot]
node scripts/test_pj_magic.cjs
node scripts/test_mj_room.cjs
```

Vérifié localement : **122 contrôles SQL**, avec les trois fiches réelles
préservées. Le cas INT 18 / budget initial épuisé / dés 3,4,5 donne exactement
32 %. Baisse, suppression, doublon, requêtes falsifiées, accès d'un autre joueur
et réutilisation de requête sont refusés. Le navigateur vérifie l'attestation,
la reprise après rechargement, l'absence de second sort, les notes conservées,
les coches modifiables, le Markdown et l'aperçu PDF à 32 %. Aucun déploiement
ni aucune modification de la base réelle n'ont été effectués.

## Environnement de recette hébergé

Le projet Supabase **base test** (`edmojqwjfyzeyewhkeah`) contient désormais
les migrations décrites dans ce document et les catalogues, installés le 3 octobre 2026.
La RPC de sélection des PJ répond sur l'API réelle. Voir
[BASE_TEST.md](../../BASE_TEST.md) pour la configuration et les comptes.
Les mentions de vérification locale précédentes décrivent les contrôles de
développement ; elles sont distinctes de cette installation de recette.

### Corrections de recette

Après `character-roster.sql`, appliquer `recipe-corrections.sql` avant de
publier le frontend corrigé. Les RPC `df_roll_skill_test` et
`df_import_legacy_inventory` deviennent obligatoires pour les jets avec coche
et la reprise d'inventaire. Les jets de caractéristiques et les jets libres
gardent leur fonctionnement ; seuls les jets liés à une compétence ou un sort
peuvent poser une coche, avec le score lu dans la fiche serveur.

La migration refuse une coche ajoutée par une sauvegarde ordinaire. Elle
conserve les coches historiques et confie leur remise à zéro à l'ouverture
de session. Un reçu de jet identique renvoie le même D100 en cas de reprise.
Les points hors profession sont limités à INT × 10 lors de la validation d'un
nouveau brouillon ; les budgets des fiches déjà validées restent acquis.

L'ancien texte d'équipement, les armes, l'armure et la richesse sont recopiés
sans remplacer les objets existants ni les monnaies. La source reste conservée
dans la fiche et dans un registre privé d'import unique. L'inventaire reçoit
une nouvelle révision lorsqu'il est enrichi, pour refuser un écrasement par
un client périmé. Les nouveaux personnages passent par la même reprise lors
du premier chargement de leur inventaire.

Après ce lot, appliquer `character-generation.sql`. Les nouveaux tirages sont
produits par `df_generate_character` : formule et modificateurs raciaux actuels,
scores bornés à 3–21, deux relances, trois points au maximum déplacés à somme
nulle. Les requêtes possèdent un reçu pour éviter un second tirage après une
reprise réseau. Les caractéristiques du brouillon ne sont plus modifiables
par `df_character_query`, ni par l'ancienne écriture du générateur. Les fiches
antérieures restent inchangées ; elles ne reçoivent pas un nouveau tirage.

Puis appliquer `creation-budget.sql`. Toute sauvegarde de brouillon contrôle
le budget total compétences + sorts, le pool personnel hors profession et
les scores 0–100. Le contrôle différé porte sur la transaction complète pour
permettre une répartition valide sans refus au milieu des lignes. Le budget
professionnel ne peut plus être changé par une sauvegarde de fiche. Les
brouillons déjà incohérents restent conservés ; il faut corriger leur
répartition avant de les sauvegarder ou de les valider.

Enfin appliquer `checked-save.sql`. Le contrôle des coches distingue une
nouvelle coche d'une coche serveur déjà présente lorsque `save_sheet` utilise
`INSERT ... ON CONFLICT DO UPDATE`. Il autorise la conservation de la coche
et refuse toujours son ajout manuel ou son retrait pendant une session ouverte.
La migration ne modifie aucune fiche et peut être rejouée.

Puis appliquer `complete-creation-budget.sql`. Le passage de brouillon en
jeu exige que les points de compétences et sorts correspondent exactement
au budget initial. Un reste, même d'un point, refuse la validation entière ;
aucune attribution initiale, événement ou session XP n'est créé par cet échec.
La sauvegarde partielle des brouillons reste autorisée. Les fiches déjà
validées ne sont pas régularisées automatiquement.

Appliquer ensuite `unplayed-presets.sql`. Un pool d'XP ouvert automatiquement
par la validation, encore intact, n'interdit plus au MJ de proposer son PJ
comme prétiré. Un jet de jeu, une tentative de progression, des points acquis
ou dépensés et une session clôturée maintiennent l'interdiction. Proposer puis
attribuer la fiche conserve ses scores et son pool ; aucun nouveau pool n'est
accordé. La migration ne propose ni ne transfère automatiquement aucun PJ.

### Suppression et corbeille MJ

Appliquer `character-deletion.sql` **après `unplayed-presets.sql`**, puis publier
le frontend correspondant. Sur une production déjà à jour, ce fichier est le seul
nouvel incrément ; ne pas réinstaller `schema.sql`, `api.sql` ni les anciens lots.
Il préserve toutes les fiches, inventaires, notes et registres XP existants.

`df_character_roster` accepte désormais `delete` et `restore`, réservés au MJ
de toutes les campagnes du personnage. Le statut `deleted` masque le PJ des
listes ordinaires, retire ses sélections et bloque les lectures et écritures des
fiches, inventaires, jets et génération. `deleted_characters` expose la corbeille
au MJ ; les joueurs reçoivent une liste vide. La restauration reprend le statut
et les disponibilités antérieurs sans modifier les XP ni sélectionner le PJ.
Un décès antérieur reste acquis. Les opérations répétées sont idempotentes.

Les anciennes RPC de roster et génération sont conservées derrière des fonctions
privées sans droit d'exécution client. Ne pas rejouer un ancien fichier qui
remplace ces RPC après ce lot : les protections de suppression seraient perdues.
Le fichier de suppression peut être rejoué lui-même sans vider la corbeille.

Tests : `node scripts/test_character_deletion_sql.mjs <runtime-postgres>`
(368 contrôles avec les lots antérieurs) et `test_character_roster_browser.cjs`
(confirmation, annulation, restauration et notes du carnet). La répétition sur
copie fraîche de production vérifie aussi les triggers, politiques et permissions
du retour à la version précédente.

### Identités du carnet MJ

Appliquer `mj-notebook-sources.sql` après la suppression, puis publier le frontend
du carnet. La RPC de lecture `df_mj_notebook_sources` est réservée au MJ de la
campagne : elle expose les correspondances entre états permanents et fiches
historiques archivées de la salle demandée, y compris pour les PJ supprimés.
Elle ne modifie aucune donnée ni aucune RPC existante. L'identité historique
est ancrée sur `source_sheet_id` et son archive ; les noms courants seuls ne
servent jamais à fusionner des notes. Les correspondances ambiguës sont ignorées.

Le carnet regroupe les cartes de même identité dans la même salle, sauvegarde
le carnet original avant la modification et conserve les champs contradictoires
dans « Autres notes conservées ». La sauvegarde initiale reste exportable dans
l'interface. Le client conserve les cartes existantes si la sauvegarde préalable
échoue. Les cartes manuelles et les homonymes d'identités différentes sont conservés.
