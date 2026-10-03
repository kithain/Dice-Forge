# Livraison 2026.10.03

Recette acceptée et production autorisée par l'utilisateur le 3 octobre 2026.
Version : tag Git `diceforge-release-20261003`. Publication depuis `main` par
GitHub Pages : https://kithain.github.io/Dice-Forge/.
Cette livraison remplace les mentions historiques « local, non déployé » des
documents de préparation. Le cockpit local utilise aussi la production par
défaut ; l'accès explicite à la recette reste décrit dans [BASE_TEST.md](BASE_TEST.md).

Le lot comprend création protégée, budgets, progression par session,
apprentissage des sorts, sélection et disponibilité des personnages, décès,
prétirés inutilisés, reprise d'équipement historique, PDF A4 et aides de jeu.
Aucun compte ni PJ synthétique de la base de recette n'est importé.

## Base de données

Production : Supabase `bwrylcvkplonkfhnegvm`. Le socle v2 était déjà actif :
ni `schema.sql` ni `api.sql` n'ont été réinstallés. Douze migrations ont été
appliquées dans une transaction unique, dans cet ordre :

`save-fixes.sql` → `creation-lock.sql` → `progression.sql` →
`progression-publication.sql` → `spell-learning.sql` → `character-roster.sql` →
`recipe-corrections.sql` → `character-generation.sql` → `creation-budget.sql` →
`checked-save.sql` → `complete-creation-budget.sql` → `unplayed-presets.sql`.

La transaction compare les sources à la sauvegarde avant installation et les
valeurs historiques avant validation. Résultat serveur : **4 états de campagne,
184 compétences, 11 sorts, 42 objets**. Les 21 objets initiaux sont conservés ;
21 éléments supplémentaires proviennent de la reprise unique des saisies
historiques. Caractéristiques, scores, points, coches, sorts, notes, identités
permanentes et monnaies existantes sont conservés.

## Sauvegarde et vérifications

Sauvegarde fraîche capturée le 3 octobre à **19 h 54 min 39 s (Paris)** :
22 tables applicatives, séquences, fonctions, droits, politiques, triggers,
vues, index et contraintes. Les comptes Auth restent inchangés ; leurs secrets
ne sont pas exportés.

Fichiers privés hors Git :
`D:/script/Dice-Forge-backups/2026-10-03/production-release/` :
`before/server-snapshot.json`, SQL dans `sql/`, empreintes `sql/manifest.json`,
`rehearsal-report.json`, captures et journaux de publication.
La copie serveur `diceforge_release_20261003` est privée et protégée par RLS.
La sauvegarde initiale `diceforge_backup_20261002` est conservée.

- Répétition du SQL exact sur copie fraîche : **77 contrôles réussis**, dont
  restauration exacte des données, fonctions et permissions des fonctions.
- Tests SQL métier avec les trois fiches réelles, tests JavaScript, **40 tests
  du cockpit**, validation du site et parcours navigateur PDF/aides réussis.
- En production, lectures et sauvegardes authentifiées d'Ilya, Gram et Thokk
  vérifiées dans une transaction terminée par `ROLLBACK`. Aucune modification
  de fiche ni nouvelle session XP n'est laissée par ces vérifications.

## Retour à la version précédant cette livraison

Le SQL privé `sql/restore-before-release.sql` restaure le schéma v2 et les
fonctions publics tels qu'ils étaient juste avant cette livraison. Ce retour
abandonne les changements v2 postérieurs à la sauvegarde. Il a été répété sur
copie locale ; il n'a pas été exécuté en production.

Pour l'armer, exécuter dans la même session SQL :

```sql
SET diceforge.allow_release_restore = 'yes';
```

Puis exécuter le SQL privé de restauration. Pour remettre le frontend précédent,
annuler le commit du tag `diceforge-release-20261003` par `git revert`, puis
publier sur `main` sans réécrire l'historique. Base et frontend doivent revenir
ensemble à la version précédente. Le rollback du 2 octobre ne correspond pas
à l'annulation de cette livraison incrémentale.

## Ajout : suppression depuis le suivi MJ

Le 3 octobre 2026, `character-deletion.sql` est ajouté après les douze lots
précédents. Le suivi MJ propose **Supprimer**, avec confirmation, et une
**Corbeille MJ** pour restaurer une erreur. Les joueurs n'accèdent pas à la
corbeille ; un personnage partagé exige les droits MJ sur toutes ses campagnes.
La restauration conserve son statut précédent, sa fiche, ses objets et ses XP.
Les notes locales du carnet sont masquées puis retrouvées à la restauration.

Sauvegarde préalable : **22 h 18 min 07 s (Paris)**, 36 tables applicatives,
dans `D:/script/Dice-Forge-backups/2026-10-03/character-deletion-release/`.
Copie privée serveur : `diceforge_deletion_20261003`. Les sauvegardes précédentes
restent conservées. L'installation ne supprime ni ne modifie aucun PJ existant.

Vérification : 368 contrôles SQL métier ; parcours navigateur du carnet et de la
corbeille ; répétition exacte sur copie fraîche, avec **107 contrôles réussis**
et restauration des données, fonctions, droits, triggers, politiques, vues et
contraintes. Les essais de production, y compris un personnage temporaire
supprimé puis restauré, sont terminés par `ROLLBACK`.

Pour annuler cet ajout, utiliser `sql/restore-before-release.sql` de ce nouveau
dossier privé, avec le même armement explicite décrit plus haut. Cette restauration
revient à la livraison `diceforge-release-20261003` et abandonne les changements
postérieurs à la sauvegarde. Le frontend correspondant est identifié par le tag
`diceforge-character-deletion-20261003` ; annuler ce commit sans réécrire l'historique.

## Correction : doublons du carnet MJ

Les notes issues des anciennes fiches numériques n'étaient pas reconnues lors
du chargement de leur nouvel état de campagne (UUID). Le rafraîchissement ajoutait
une carte au lieu de reprendre la note. Le carnet utilise désormais une
correspondance historique réservée au MJ, fournie par `mj-notebook-sources.sql`.
Cette migration ajoute une seule RPC de lecture, sans modifier les données ni
les fonctions existantes ; elle s'applique après `character-deletion.sql`.

Les copies déjà présentes sont regroupées, avec sauvegarde préalable exportable.
Les valeurs contradictoires sont consultables dans « Autres notes conservées ».
Les notes manuelles et les personnages homonymes distincts restent séparés.
Tests du carnet, parcours navigateur et 373 contrôles SQL réussis. Sur la copie
fraîche du serveur (22 h 43 min 35 s, Paris), 43 contrôles confirment les quatre
correspondances historiques et la conservation intégrale des 37 tables.
Les fichiers
privés de vérification sont dans
`D:/script/Dice-Forge-backups/2026-10-03/notebook-duplicates/`.

Pour revenir au comportement précédent, annuler le commit frontend puis retirer
uniquement `public.df_mj_notebook_sources(text)` ; aucun retour des données de
campagne n'est nécessaire. Le carnet original reste disponible par export.
