# Archive de l’audit initial V1 → V2

> Ce document décrit l’état historique avant la réécriture. L’architecture active et les commandes officielles sont désormais documentées dans `README.md` et `app-v2/README.md`. Python et Flask ont été retirés du produit.

Dernière mise à jour : 12 août 2026.

## Décision d'architecture V2

La vraie V2 repart sur une application autonome dans `app-v2/` :

- TypeScript côté navigateur et serveur ;
- Fastify pour l'API et le serveur local ;
- WebSocket pour le temps réel ;
- Vite pour construire une interface native sans iframe ni framework UI lourd ;
- contrats partagés pour la session, les services et les futurs modules ;
- Supabase/PostgreSQL conservé comme source officielle des données distantes ;
- lecture non destructive des données locales V1 pendant leur migration.

Le dossier historique reste temporairement présent comme référence de compatibilité. Le lanceur `DiceForge.bat` compile et démarre désormais `app-v2/` avec Node.js.

## But de ce document

Ce fichier est le point de départ officiel de Dice Forge V2. Il résume l'état fonctionnel hérité de la V1, les décisions déjà prises, les données à préserver et le travail restant.

- **V1 stable, à ne plus modifier :** `D:\script\Dice-Forge`
- **Projet V2, seul dossier à modifier désormais :** `D:\script\Dice-Forge V2`
- La V2 doit simplifier l'utilisation et l'architecture sans retirer de fonctionnalité.
- Les données existantes doivent rester lisibles : Supabase, personnages, fiches, inventaires, rooms, jets, rencontres, combat, carte, tokens et imports Obsidian.

## Résultat de l'audit initial

Le dossier V2 est une copie autonome de la V1 nettoyée, avec une première interface unifiée déjà préparée.

État vérifié le 12 août 2026 :

- 36 tests Python réussis ;
- validation du projet réussie : 10 fichiers publics et 28 scripts JavaScript contrôlés ;
- syntaxe de `js/v2.js` valide ;
- aucune erreur de format détectée dans les changements Git préparés ;
- la copie contient les données locales existantes du tracker et de la Battle Map ;
- la configuration Supabase cliente est présente ;
- le coffre Obsidian configuré est détecté par l'application.

### Attention avant le premier commit V2

Le dossier V2 possède son propre dossier `.git`, mais il est actuellement :

- sur la branche `main` ;
- relié au même dépôt distant que la V1 : `https://github.com/kithain/Dice-Forge.git` ;
- basé sur le commit V1 `69db581` ;
- avec neuf fichiers V2 déjà préparés dans l'index Git, soit 517 lignes ajoutées et 12 supprimées.

Il faudra donc, avant de publier la suite, choisir explicitement l'une de ces stratégies :

1. créer une branche dédiée comme `v2` ou `codex/v2` dans le dépôt actuel ;
2. ou créer un dépôt GitHub séparé et changer l'URL de `origin`.

Ne pas pousser directement la V2 sur `main` tant que ce choix n'a pas été fait.

## Fonctionnalités héritées et à conserver

### Authentification et comptes

- Connexion par nom de joueur et mot de passe via Supabase Auth.
- Le nom saisi est converti en adresse interne de type `nom@diceforge.app`.
- Aucun mot de passe n'est enregistré dans le dépôt.
- Le mot de passe initial est défini dans Supabase, puis chaque joueur peut le modifier depuis **Mon compte**.
- Un compte ne doit pas être supprimé pour changer un nom ou un mot de passe, car les données sont rattachées à son identifiant Auth permanent.

### Rooms et propriété MJ

- Le code de room représente une session de jeu et peut changer à chaque partie.
- L'identité d'un joueur et ses personnages ne doivent pas dépendre du code de room.
- Chaque room possède un `owner_id` Supabase.
- Le propriétaire de la room est le MJ.
- Les membres authentifiés peuvent rejoindre une room existante.
- L'historique des jets reste attaché au code de la room concernée.

### Jets publics et jets cachés

- Jets 3D et expressions de dés.
- Historique Supabase en temps réel.
- Gestion des réussites, échecs, critiques et maladresses.
- Un jet caché est lisible uniquement par le propriétaire/MJ de la room.
- Les autres joueurs ne doivent pas pouvoir savoir si ce jet a réussi ou échoué.
- Les overlays OBS utilisent la table filtrée `obs_rolls` et ne reçoivent jamais les jets cachés.

### Personnages et fiches

- Création et génération de caractéristiques BRP-ORC.
- Deux relances possibles et transfert limité de points entre caractéristiques.
- Fiche complète éditable avec caractéristiques, compétences, armes, sorts, armure, équipement, histoire et liens.
- Sauvegarde locale et Supabase.
- Export Markdown et impression/PDF.
- Les personnages, fiches et inventaires sont liés au `user_id` Auth, pas à la room.
- Le joueur peut modifier ses propres données.
- Le MJ propriétaire d'une room commune peut consulter les données des joueurs en lecture seule.

### Inventaire

- Inventaire individuel, équipement, monnaie et notes.
- Sauvegarde locale de secours.
- Synchronisation avec `pj_inventory` dans Supabase.
- Compatibilité avec les anciennes données d'inventaire et de fiche.

### Tracker de combat

- Ajout, édition et suppression de participants.
- Initiative par DEX.
- Tours, rounds et passage automatique au combattant suivant.
- Points de vie, dégâts et soins bornés.
- États temporaires avec durée.
- Gestion distincte de *Dying* et *Dead*.
- Numéros et couleurs de tokens stables.
- Autosauvegarde du combat.
- Sauvegarde, chargement et suppression de rencontres.
- Vue joueurs et portrait actif.

### Import Obsidian

- Source locale par défaut : `D:\kitha\Documents\JDR - BRP\Obsidian_Ombre_de_la_Spirale`.
- Surcharge possible avec la variable `DICE_FORGE_VAULT`.
- Import des PJ, PNJ et créatures du bestiaire.
- Lecture des tableaux de caractéristiques, blocs de statistiques et portraits liés.
- Recherche dans les fiches disponibles.
- Les fichiers de documentation, modèles ou notes sans DEX sont ignorés volontairement lorsqu'ils ne représentent pas un combattant importable.
- Lors du dernier contrôle fonctionnel, 64 fiches importables étaient détectées.

### Battle Map

- Carte courante persistante.
- Ajout, déplacement et suppression de tokens.
- Synchronisation temps réel avec Flask-SocketIO.
- Réutilisation des participants du tracker.
- Générateur de carte.
- Overlay OBS de la carte seule.

### Références et affichages

- Livret du joueur.
- Équipement et inventaire de référence.
- Écran MJ et écran joueur.
- Règles BRP-ORC complètes.
- Aide intégrée.
- EPUB, DOCX, Markdown et scripts SQL conservés dans le projet.
- Overlays de jets, dés 3D, portrait actif et Battle Map.

## Sécurité déjà mise en place

Le fichier SQL de référence final est `supabase-auth.sql`. Il doit être exécuté après les scripts de création des tables.

Il met notamment en place :

- l'authentification Supabase ;
- les propriétaires et membres des rooms ;
- les politiques RLS basées sur `auth.uid()` ;
- l'accès aux jets limité aux membres de la room ;
- l'accès aux jets cachés limité au propriétaire ;
- l'accès du joueur à ses propres personnages, fiches et inventaires ;
- l'accès en lecture du MJ aux données des membres de ses rooms ;
- un flux OBS public séparé ne contenant que les jets visibles ;
- la révocation des anciens accès anonymes aux tables privées.

La clé présente dans `supabase-config.js` est une clé cliente *publishable/anon*. Elle est prévue pour être visible dans le navigateur. Une clé `service_role` ne doit jamais être placée dans ce fichier.

## Données existantes et emplacements

### Données distantes officielles

Supabase reste la source officielle pour :

- les comptes Auth ;
- `rooms` et `room_members` ;
- `rolls` et `obs_rolls` ;
- `personnages` ;
- `pj_sheets` ;
- `pj_inventory`.

La V2 doit continuer à utiliser le même projet Supabase afin de retrouver les données V1 sans copie manuelle.

### Données locales du compagnon MJ

Le dossier `Roll20/Webtracker/data/` contient ou peut contenir :

- `combat_autosave.json` ;
- `players.json` ;
- `battlemap_map.json` ;
- `battlemap_tokens.json` ;
- `encounters/`.

Ces fichiers sont volontairement ignorés par Git, car ils représentent l'état local de la partie. Ils doivent néanmoins être conservés lors des migrations de machine ou de dossier.

Les cartes courantes et portraits importés sont également des données locales ignorées par Git.

## Architecture héritée conservée pour la migration

```text
Dice-Forge V2/
├── v2.html, v2.css              Interface unifiée initiale
├── index.html, styles.css       Application de dés et création de personnage
├── login.html, account.html     Authentification et changement de mot de passe
├── pj.html                      Fiche complète
├── inventory-sheet.html        Inventaire du personnage
├── obs*.html                    Overlays OBS Supabase
├── livret_joueur.html           Référence joueur
├── ecran_*.html                 Écrans MJ et joueur
├── BRP_ORC_*.html / .epub       Règles complètes
├── js/
│   ├── v2.js                    Navigation de l'interface V2
│   ├── supabase-client.js       Client Supabase partagé
│   ├── auth-*.js                Authentification et garde de pages
│   ├── supabase-room.js         Rooms, jets et personnages
│   ├── pj-sheet.js              Fiche complète
│   └── inventory-sheet.js       Inventaire
├── supabase-*.sql               Schémas, migrations et politiques RLS
└── Roll20/Webtracker/
    ├── run.py                   Serveur local unique
    ├── app/routes.py            Tracker, vues et API
    ├── app/battlemap.py         Battle Map et Socket.IO
    ├── app/markdown_importer.py Import Obsidian
    ├── data/                    État local non versionné
    └── tests/                   Tests Python
```

Le serveur local est une application Flask-SocketIO unique. Il sert les pages Dice Forge, le tracker, la Battle Map, les vues joueurs et les overlays locaux sur la même origine.

## Ancienne ébauche de transition retirée

L'ébauche à base d'iframes décrite ci-dessous a servi à valider le périmètre, puis a été retirée au profit de `app-v2/` :

- `/v2` comme nouvelle page d'entrée locale ;
- une barre de navigation unique ;
- la room active dans l'en-tête ;
- un tableau de diagnostic Supabase, Obsidian, tracker et Battle Map ;
- l'ouverture à la demande des outils dans un espace central ;
- la conservation de l'état d'un outil lors d'un changement d'onglet ;
- des raccourcis pour les vues joueurs et les sources OBS ;
- l'ouverture automatique de la V2 par `DiceForge.bat` et `run.py` ;
- un test de disponibilité de la page et de l'API de statut.

Ces fichiers et routes de transition ne font plus partie de la V2 active.

## Nettoyage déjà effectué avant la séparation V2

- Suppression des anciens lanceurs et scripts devenus inutiles.
- Centralisation du lancement autour de `DiceForge.bat` et `DiceForge_Stop.bat`.
- Réduction des journaux de débogage côté client.
- Exclusion Git des données locales, journaux, environnements Python, cartes courantes et portraits importés.
- Conservation demandée des fichiers EPUB, DOCX, Markdown et SQL.
- Déplacement des anciennes archives hors du dépôt vers `D:\kitha\Documents\JDR - BRP\backup\Dice-Forge-archives`.

## Points techniques à améliorer dans la vraie V2

### Priorité haute

1. **Isoler Git avant tout nouveau développement.** La V2 utilise encore `main` et le même `origin` que la V1.
2. **Définir une seule source de vérité pour l'utilisateur et la room.** Aujourd'hui plusieurs modules lisent encore directement `localStorage`.
3. **Transformer progressivement les pages chargées en iframe en modules intégrés.** Les iframes préservent les fonctions mais dupliquent menus, styles et état.
4. **Documenter un ordre unique des migrations Supabase.** `supabase-auth.sql` doit rester la migration de sécurité exécutée en dernier.
5. **Préserver une compatibilité de lecture avec toutes les données V1.** Aucune migration destructive.

### Priorité moyenne

6. Regrouper la configuration de routes, fichiers locaux et coffre Obsidian.
7. Séparer clairement le domaine métier, le stockage Supabase et l'affichage.
8. Ajouter des tests de parcours navigateur : connexion, room, jet caché, fiche, inventaire, import et Battle Map.
9. Ajouter des tests d'intégration Supabase dans un environnement de test séparé.
10. Réduire la dépendance aux CDN ou prévoir un mode local pour les bibliothèques indispensables.
11. Remplacer progressivement les longues pages HTML autonomes par des composants réutilisables, sans casser GitHub Pages.

### Limites connues et acceptées pour le moment

- Le compagnon Flask est prévu pour une utilisation locale de petite taille : un MJ et environ quatre joueurs.
- Les routes de modification du tracker ne possèdent pas leur propre authentification locale ; elles font confiance à la machine du MJ et au réseau local. Ce choix doit être réévalué seulement si le serveur devient accessible depuis Internet.
- GitHub Pages continue actuellement à servir l'application joueur historique, tandis que les fonctions Python, Obsidian et Battle Map nécessitent le serveur local.
- Three.js, Supabase JS, les dés 3D et certaines polices nécessitent encore Internet.
- Le dossier `.venv` présent dans la copie est ignoré par Git et ne constitue pas une dépendance portable ; le lanceur doit pouvoir recréer l'environnement.

## Règles de développement V2

1. Ne plus modifier `D:\script\Dice-Forge`.
2. Effectuer tout nouveau travail dans `D:\script\Dice-Forge V2`.
3. Ne pas supprimer une fonction V1 sans validation explicite.
4. Ne jamais supprimer ou recréer un compte Supabase pour résoudre un problème d'affichage.
5. Ne jamais faire dépendre les personnages d'un nouveau code de room.
6. Ne jamais exposer les jets cachés aux joueurs ou aux overlays.
7. Ne jamais placer de clé `service_role` ou de mot de passe dans Git.
8. Conserver les formats de données V1 ou fournir une migration réversible et testée.
9. Exécuter les tests et le validateur avant chaque commit important.
10. Mettre à jour ce document après toute décision structurelle importante.

## Ordre de travail recommandé

1. Choisir la stratégie Git de la V2 et créer la branche ou le dépôt dédié.
2. Faire un premier commit contenant l'état initial V2 et ce document.
3. Définir les modules fonctionnels et le service central de session/authentification.
4. Stabiliser la coque V2 et ses routes sans toucher aux données.
5. Intégrer réellement un premier module, de préférence le tracker ou les dés.
6. Remplacer les autres iframes une par une, avec un test de non-régression à chaque étape.
7. Unifier les styles, la navigation, les messages d'erreur et les états de chargement.
8. Tester une session complète avec le MJ et les quatre joueurs avant de considérer la V2 comme remplaçante de la V1.

## Commandes de vérification

Depuis `D:\script\Dice-Forge V2` :

```powershell
cd app-v2
npm.cmd run check
cd ..
Roll20\Webtracker\.venv\Scripts\python.exe -B -m unittest discover -s Roll20\Webtracker\tests -v
Roll20\Webtracker\.venv\Scripts\python.exe -B scripts\validate_project.py
git diff --check
git diff --cached --check
```

## Critère de réussite de la V2

La V2 pourra remplacer la V1 lorsque le MJ et les joueurs pourront effectuer une session complète depuis une interface plus claire, sans perte de données ni de fonctionnalité : connexion, room, jets publics et cachés, historique, personnages, fiches, inventaires, initiative, états, Obsidian, Battle Map, vues joueurs et OBS.
