# Reprise personnages v2

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
