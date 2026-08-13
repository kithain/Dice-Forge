# Dice Forge V2

Application de table virtuelle légère pour BRP-ORC, écrite entièrement en TypeScript.

## Démarrage

Prérequis : Node.js 22 ou plus récent.

Sous Windows, lancez simplement :

```text
DiceForge.bat
```

Le lanceur installe les dépendances locales au premier démarrage, compile l'application, démarre le serveur et ouvre <http://127.0.0.1:5000/>.

Pour arrêter le serveur :

```text
DiceForge_Stop.bat
```

## Fonctionnalités

- cockpit MJ unifié sans iframe ;
- dés sécurisés avec expressions, animation 3D locale et historique Supabase ;
- jets publics ou cachés ;
- authentification, rooms et membres Supabase ;
- personnage BRP, caractéristiques et fiche complète ;
- inventaire et monnaie ;
- tracker d'initiative, PV, états et rounds ;
- sauvegarde automatique et rencontres ;
- recherche et import depuis Obsidian ;
- Battle Map, cartes, portraits et tokens ;
- synchronisation WebSocket ;
- vue joueurs, portrait actif et overlays OBS.

## Architecture

```text
app-v2/
├── src/client/       interface et vues
├── src/server/       API, stockage et WebSocket
├── src/shared/       contrats et règles métier
├── tests/            tests TypeScript
└── data/             état local ignoré par Git
```

Le navigateur et le serveur utilisent les mêmes types. Supabase/PostgreSQL reste la source officielle des comptes et données distantes. Les fichiers JSON dans `app-v2/data/` contiennent l'état local du MJ.

Au premier lancement, les anciennes données locales sont copiées automatiquement depuis `Roll20/Webtracker/data/` si ce dossier existe encore sur la machine.

## Développement

```powershell
cd app-v2
npm.cmd install
npm.cmd run dev
```

Vérification complète :

```powershell
npm.cmd run check
```

Cette commande contrôle le typage strict, exécute les tests puis compile le client et le serveur.

## Configuration Supabase

La configuration cliente reste dans `supabase-config.js`. La clé publishable/anon peut être utilisée dans le navigateur. Ne placez jamais de clé `service_role` dans le dépôt.

Ordre des scripts SQL pour une nouvelle installation :

1. `supabase-personnages.sql`
2. `supabase-pj-sheets.sql`
3. `supabase-inventory.sql`
4. `supabase-auth.sql`

`supabase-auth.sql` est idempotent et doit être réexécuté après une mise à jour des règles de room ou des jets cachés.

Les politiques RLS garantissent que les données privées restent liées à l'utilisateur authentifié et que les jets cachés ne sont jamais envoyés aux overlays publics.

## Affichages dédiés

```text
/view                       vue joueurs
/portrait_view              portrait du tour actif
/overlays/map               carte sans contrôles
/overlays/dice?room=ABCD    animation des dés OBS
/overlays/history?room=ABCD historique des jets publics OBS
/overlays/rolls?room=ABCD   ancien alias de l’historique
```

## Données conservées

Les EPUB, DOCX, Markdown, règles BRP-ORC et scripts SQL sont des contenus de référence et ne font pas partie du runtime applicatif.
