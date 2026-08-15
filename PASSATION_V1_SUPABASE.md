# Passation vers la V1 — mise à niveau Supabase et récupération de la V2

## Destinataire

Ce document est destiné à l’agent qui travaille sur la V1 de Dice Forge.

L’objectif n’est pas de fusionner la branche V2 dans `main`. Il faut conserver la V1 publiée sur GitHub Pages, puis y reporter progressivement les améliorations compatibles avec un hébergement statique.

## Résultat attendu

- La V1 reste accessible à l’adresse `https://kithain.github.io/Dice-Forge/`.
- La V1 continue de fonctionner sans serveur Node, Python ou Fastify pour ses fonctions en ligne.
- Supabase reste le backend distant unique pour l’authentification, les rooms, les jets, les personnages, les fiches et les inventaires.
- Les données existantes ne sont ni supprimées ni recréées.
- Les jets cachés ne sont jamais calculés ni révélés dans le navigateur du joueur.
- Le MJ conserve l’accès autorisé aux données des joueurs appartenant à ses rooms.
- Les fonctions strictement locales — coffre Obsidian, fichiers du tracker, cartes locales et intégration OBS locale — restent séparées du site GitHub Pages.

## État Git observé le 13 août 2026

- Dépôt : `https://github.com/kithain/Dice-Forge.git`
- V1 publiée : branche `main`, commit observé `69db581`
- Travail V2 : branche `codex/v2-development`, commit observé `69438a1`
- La branche V2 contient une réécriture TypeScript dans `app-v2/`.
- Ne pas fusionner `codex/v2-development` directement dans `main` : cette branche supprime plusieurs pages et scripts statiques de la V1 et les remplace par une application dépendant d’un serveur Node.

Avant toute modification de la V1, créer un tag de sauvegarde, par exemple `v1.0.0`, puis travailler sur une branche dédiée issue de `main`.

## Limite de cet état Supabase

L’état décrit ci-dessous est l’état **attendu par les fichiers SQL du dépôt**. Aucun accès au tableau de bord ou à la base Supabase distante n’était disponible pendant cette passation. Il ne faut donc pas affirmer que toutes les migrations V2 ont déjà été exécutées en production.

Avant d’adapter le JavaScript de la V1, vérifier la base distante avec les requêtes d’audit fournies plus bas. Si les nouvelles tables ou fonctions sont absentes, appliquer les migrations dans un environnement de sauvegarde/test avant la production.

## État Supabase attendu

### Authentification

- Les joueurs utilisent Supabase Auth.
- Le nom du joueur est transformé en adresse interne : `nom.normalise@diceforge.app`.
- Les données sont rattachées à `auth.users.id`, jamais uniquement au nom affiché.
- La clé présente dans `supabase-config.js` est une clé cliente `anon/publishable`. Elle peut être publique si les politiques RLS sont correctement appliquées.
- Ne jamais placer de clé `service_role` dans le dépôt ou dans le navigateur.

### Tables métier existantes

| Table | Rôle | Identité/accès attendu |
| --- | --- | --- |
| `rooms` | Sessions de jeu | `owner_id` désigne le MJ propriétaire |
| `room_members` | Membres d’une room | clé `(room_code, user_id)` |
| `rolls` | Historique privé complet | réservé au MJ pour la lecture ; insertion visible par un membre authentifié |
| `obs_rolls` | Flux public filtré | contient uniquement les jets non cachés |
| `personnages` | Personnage principal | rattaché à `user_id` |
| `pj_sheets` | Fiches complètes par room | rattachées à `user_id`, unicité historique `(room_code, player_name)` |
| `pj_inventory` | Inventaires par room | rattachés à `user_id`, unicité historique `(room_code, player_name)` |

### Ajouts présents dans le SQL V2

Le dernier `supabase-auth.sql` de la branche V2 ajoute :

| Élément | Rôle |
| --- | --- |
| `room_invitations` | Invitation d’un personnage connu du MJ vers une nouvelle room |
| `pending_experience` | Réussites cachées à révéler seulement en fin de partie |
| `roll_hidden_dice(...)` | Génère un jet caché dans PostgreSQL sans transmettre le résultat au joueur |
| `join_room_with_character(...)` | Rejoint une room et copie la dernière fiche/inventaire si nécessaire |
| `list_invitable_characters(...)` | Liste les personnages que le MJ peut inviter |
| `invite_character(...)` | Crée ou renouvelle une invitation |
| `pending_character_invitations()` | Liste les invitations du joueur connecté |
| `accept_character_invitation(...)` | Accepte l’invitation et copie les données vers la room cible |
| `reveal_hidden_experience(...)` | Révèle et coche les gains d’expérience à la fin de la partie |
| `can_access_player_data(...)` | Autorise le joueur ou le MJ d’une room commune à lire les données concernées |

Les fonctions internes `copy_character_to_room(...)` et `reset_sheet_experience(...)` ne doivent pas être exécutables directement par le navigateur.

### Sécurité attendue

- RLS activé sur toutes les tables métier.
- Aucun accès anonyme à `rooms`, `room_members`, `rolls`, `personnages`, `pj_sheets`, `pj_inventory`, `room_invitations` ou `pending_experience`.
- `obs_rolls` est la seule source publique des jets visibles pour les overlays.
- Un joueur peut insérer uniquement un jet **non caché**, avec son propre `user_id`, dans une room dont il est membre.
- Un jet caché passe obligatoirement par `roll_hidden_dice(...)`.
- Seul le propriétaire de la room lit le contenu complet de `rolls` et peut supprimer son historique.
- Un joueur lit et modifie ses propres personnages, fiches et inventaires.
- Le MJ peut lire les données d’un joueur lorsqu’ils partagent une room dont il est propriétaire.

## Ordre d’application SQL

Ne jamais vider les tables et ne jamais recréer les comptes Auth.

Sur une base neuve, l’ordre attendu est :

1. schéma initial des jets/rooms déjà utilisé par la V1 ;
2. `supabase-personnages.sql` ;
3. `supabase-pj-sheets.sql` ;
4. `supabase-inventory.sql` ;
5. le dernier `supabase-auth.sql` provenant de la branche V2 ;
6. vérification des tables, fonctions, droits, RLS et données historiques.

`supabase-stats-joueurs.sql` est une requête de rapport, pas une migration obligatoire.

Sur la base existante, faire d’abord une sauvegarde et exécuter uniquement le dernier `supabase-auth.sql` après avoir confirmé que les quatre tables historiques existent. Le script est conçu avec de nombreux `if not exists`, `add column if not exists` et `create or replace`, mais il faut tout de même le tester avant la production.

## Requêtes d’audit de la base distante

À exécuter dans Supabase SQL Editor avant le travail client :

```sql
-- Tables attendues
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'rooms', 'room_members', 'room_invitations', 'pending_experience',
    'rolls', 'obs_rolls', 'personnages', 'pj_sheets', 'pj_inventory'
  )
order by table_name;

-- Fonctions attendues
select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'is_room_member', 'is_room_owner', 'can_access_player_data',
    'roll_hidden_dice', 'join_room_with_character',
    'list_invitable_characters', 'invite_character',
    'pending_character_invitations', 'accept_character_invitation',
    'reveal_hidden_experience'
  )
order by routine_name;

-- RLS attendu
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'rooms', 'room_members', 'room_invitations', 'pending_experience',
    'rolls', 'obs_rolls', 'personnages', 'pj_sheets', 'pj_inventory'
  )
order by tablename;

-- Politiques actives
select tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- Lignes historiques qui ne sont pas encore rattachées à Auth
select 'rolls' as source, count(*) as missing_user_id from public.rolls where user_id is null
union all
select 'personnages', count(*) from public.personnages where user_id is null
union all
select 'pj_sheets', count(*) from public.pj_sheets where user_id is null
union all
select 'pj_inventory', count(*) from public.pj_inventory where user_id is null;

-- Vérifie qu’aucun jet caché n’a fui dans le flux OBS
select count(*) as hidden_rolls_exposed
from public.obs_rolls
where is_hidden is true;
```

Résultats obligatoires : toutes les tables et fonctions listées doivent être présentes, `rowsecurity` doit être vrai partout, et `hidden_rolls_exposed` doit valoir zéro.

Les lignes historiques avec `user_id is null` ne doivent pas être supprimées. Elles doivent être rapprochées prudemment des comptes existants, avec une vérification manuelle des noms ambigus.

## Adaptations prioritaires de la V1

### 1. Conserver une application statique

La V1 doit rester composée de HTML, CSS et JavaScript exécutables sur GitHub Pages. Ne pas importer :

- `app-v2/src/server/` ;
- Fastify ;
- le stockage JSON du serveur V2 ;
- les routes `/api/...` ;
- le WebSocket `/ws` de la V2.

Le TypeScript client V2 peut être réutilisé seulement s’il est compilé en fichiers statiques avant le déploiement, ou transposé proprement dans les modules JavaScript existants de la V1.

### 2. Mettre à niveau `js/supabase-room.js`

Le fichier V1 utilise encore des insertions/upserts directs qui ne correspondent plus au modèle sécurisé V2.

#### Création et connexion aux rooms

- Conserver la création directe de `rooms` avec `owner_id = auth.uid()` lorsque la room n’existe pas.
- Remplacer l’upsert direct dans `room_members` par :

```js
await supabase.rpc('join_room_with_character', {
  requested_room: roomCode,
  requested_player: playerName,
});
```

- Utiliser la même RPC dans `restoreSession()` afin que la restauration et la connexion normale aient le même comportement.
- L’identité persistante est `user_id`. Le `player_name` reste un libellé modifiable, pas une clé d’autorisation.

#### Jets visibles

- Un jet visible peut continuer à être calculé dans le navigateur.
- Avant l’insertion, confirmer que l’utilisateur est authentifié et membre de la room.
- Insérer dans `rolls` avec `user_id = auth.uid()` et `is_hidden = false`.
- Ne jamais accepter un `user_id` fourni par un champ de formulaire ou par `localStorage`.

#### Jets cachés

Supprimer le chemin V1 qui calcule le résultat puis insère `is_hidden = true` depuis le navigateur. Ce chemin est incompatible avec la nouvelle RLS et divulgue potentiellement le résultat au joueur.

Pour un jet caché, parser seulement l’expression dans le navigateur puis appeler :

```js
const { data, error } = await supabase.rpc('roll_hidden_dice', {
  requested_room: roomCode,
  requested_player: playerName,
  requested_expression: label,
  requested_terms: diceTerms,
  requested_modifier: modifier,
  requested_experience_skill: skillName || '',
  requested_difficulty: difficulty || 'normal',
});
```

Le joueur non propriétaire doit recevoir seulement une confirmation d’acceptation. Il ne faut ni simuler l’animation avec les vraies valeurs ni reconstruire le succès/échec côté client. Le MJ propriétaire peut recevoir les valeurs retournées par la RPC.

#### Historique et temps réel

- Le MJ propriétaire peut lire/surveiller `rolls` pour voir l’historique complet, y compris les jets cachés.
- Les joueurs et overlays doivent lire/surveiller `obs_rolls`, qui ne contient que les jets visibles.
- Ne pas tenter de filtrer les jets cachés uniquement en JavaScript : la séparation doit être garantie par Supabase.
- Conserver une seule souscription Realtime active par room et la désabonner lors d’un changement de room ou d’une déconnexion.

### 3. Ajouter les invitations de personnages

Reporter depuis `app-v2/src/client/cloud.ts` les appels suivants :

- `list_invitable_characters` pour la liste visible du MJ ;
- `invite_character` pour inviter ;
- `pending_character_invitations` après connexion du joueur ;
- `accept_character_invitation` pour accepter et rejoindre la room cible.

Ne jamais copier une fiche ou un inventaire uniquement dans le navigateur. La copie doit rester dans les fonctions SQL sécurisées afin de conserver le bon `user_id` et de vérifier que le demandeur est autorisé.

### 4. Mettre à niveau l’expérience cachée

- Lors d’un jet caché lié à une compétence, transmettre le nom de compétence et la difficulté à `roll_hidden_dice`.
- Ne pas cocher immédiatement la compétence dans la fiche du joueur.
- Ajouter au MJ une action explicite de fin de partie appelant :

```js
await supabase.rpc('reveal_hidden_experience', {
  requested_room: roomCode,
});
```

- Recharger ensuite les fiches concernées.
- Seul le propriétaire de la room doit pouvoir exécuter cette action.

### 5. Mettre à niveau personnages, fiches et inventaires

Fichiers V1 concernés :

- `js/pj-sheet.js` ;
- `js/inventory-sheet.js` ;
- `js/supabase-room.js` ;
- `js/app.js` pour la création de personnage.

Règles à respecter :

- Toutes les requêtes du joueur utilisent son `auth.uid()` réel.
- Les sauvegardes incluent systématiquement `user_id`.
- Les fiches et inventaires restent associés à une room, mais l’identité du propriétaire est `user_id`.
- Les personnages ne doivent pas devenir dépendants d’un nouveau code de room.
- Lors du passage vers une nouvelle room, laisser `join_room_with_character` ou les fonctions d’invitation copier les données.
- Conserver la compatibilité avec les anciennes lignes et les clés uniques `(room_code, player_name)` tant qu’une migration de clé n’a pas été conçue et validée séparément.
- Le MJ consulte les données d’un membre en lecture seule ; il ne doit pas pouvoir écraser sa fiche ou son inventaire.
- Conserver la sauvegarde locale de secours, mais Supabase reste la source distante officielle.

### 6. Reporter les modules V2 réutilisables

Ces fichiers V2 ne dépendent pas du serveur et peuvent guider ou fournir la logique du portage :

- `app-v2/src/shared/dice.ts` : parsing des expressions, jets et seuils BRP ;
- `app-v2/src/shared/sheet.ts` : calculs de fiche, compétences et Markdown ;
- `app-v2/src/shared/session.ts` : normalisation du joueur et de la room ;
- `app-v2/src/client/session-store.ts` : source de vérité centrale pour la session ;
- `app-v2/src/client/dice-animation.ts` : animation 3D ;
- `app-v2/src/client/cloud.ts` : appels Supabase récents ;
- `app-v2/tests/dice.test.ts`, `sheet.test.ts` et `session.test.ts` : cas de non-régression.

Ne pas copier `cloud.ts` tel quel : son initialisation appelle `/api/cloud-config`, absent sur GitHub Pages. Dans la V1, utiliser directement la configuration cliente existante de `supabase-config.js` et le client partagé de `js/supabase-client.js`.

### 7. Préserver le flux OBS public

- `obs.html`, `obs-dice.html` et leurs scripts doivent interroger uniquement `obs_rolls`.
- Ils peuvent rester anonymes si c’est bien le comportement voulu, car cette table est volontairement filtrée par le trigger `sync_obs_rolls`.
- Vérifier qu’aucun overlay ne lit directement `rolls`.
- Vérifier qu’un jet caché ajouté par RPC n’apparaît jamais dans un overlay, même brièvement.

## Fonctions à laisser locales

Les éléments suivants ne peuvent pas être rendus entièrement accessibles par GitHub Pages sans nouvelle source de données distante :

- lecture automatique du coffre Obsidian sur le disque du MJ ;
- sauvegardes directes dans des fichiers locaux ;
- import de cartes et portraits depuis des chemins locaux ;
- état JSON local du tracker et de la Battle Map ;
- relais OBS local.

Ils peuvent rester dans le compagnon local V1 existant. Ne pas exposer le serveur local sur Internet et ne pas faire dépendre le site joueur GitHub Pages de sa disponibilité.

Si le tracker et la Battle Map doivent devenir entièrement en ligne plus tard, créer des tables Supabase et des politiques RLS dédiées dans une migration séparée. Ne pas stocker cet état dans `rolls` ou `room_members` par commodité.

## Ordre de travail recommandé pour l’agent V1

1. Sauvegarder/taguer la V1 actuelle et créer une branche de travail issue de `main`.
2. Auditer la base Supabase distante avec les requêtes ci-dessus.
3. Sauvegarder Supabase avant toute migration.
4. Appliquer et valider le dernier `supabase-auth.sql` de la branche V2 dans un environnement de test.
5. Adapter `js/supabase-room.js` : connexion RPC, jets visibles, jets cachés RPC, historique séparé.
6. Tester les politiques avec au minimum deux comptes : un MJ propriétaire et un joueur membre.
7. Adapter les invitations et la copie des personnages entre rooms.
8. Adapter l’expérience cachée et l’action de fin de partie.
9. Mettre à niveau les écrans personnage, fiche et inventaire.
10. Reporter ensuite seulement les améliorations d’interface et les modules purs de la V2.
11. Déployer sur une URL de prévisualisation ou un chemin de test avant de toucher à la page V1 publique.
12. Ne basculer la V1 publique qu’après validation d’une session complète.

## Matrice minimale de tests

### Authentification

- Connexion valide avec `nom@diceforge.app`.
- Échec propre avec mauvais mot de passe.
- Déconnexion supprimant les souscriptions Realtime et l’état sensible.
- Changement de mot de passe fonctionnel.

### Rooms

- Le premier utilisateur crée la room et en devient propriétaire.
- Un joueur rejoint une room existante via `join_room_with_character`.
- Un membre d’une autre room ne peut pas lire les données privées.
- Le nom affiché peut changer sans changer la propriété des données.

### Jets

- Un jet visible apparaît chez le MJ, les joueurs et l’overlay.
- Un jet caché n’affiche aucune valeur au joueur lanceur.
- Le MJ voit le jet caché.
- Les autres joueurs et les overlays ne voient ni le jet, ni son existence, ni son résultat.
- Un joueur ne peut pas insérer directement `is_hidden = true`.
- Un non-membre ne peut pas insérer de jet.

### Personnages et invitations

- Le joueur retrouve son personnage indépendamment de la room active.
- La fiche et l’inventaire sont copiés vers la nouvelle room via les RPC prévues.
- Les coches d’expérience sont réinitialisées lors de la copie prévue par le SQL.
- Le MJ peut inviter uniquement un personnage qu’il connaît via une room qu’il possède.
- Un joueur ne peut accepter que sa propre invitation.

### Fiches et inventaires

- Le joueur peut lire et modifier ses données.
- Le MJ peut lire les données d’un membre de sa room sans les modifier.
- Un autre joueur ne peut ni lire ni modifier ces données.
- Les anciennes données restent présentes après migration.

### Expérience cachée

- Une réussite cachée crée une attente sans cocher immédiatement la fiche.
- Seul le MJ propriétaire peut terminer la partie et révéler l’expérience.
- La compétence correcte est cochée après révélation.

### OBS

- Les overlays fonctionnent sans authentification si ce mode public est conservé.
- Seuls les jets visibles apparaissent.
- La suppression d’un jet visible par le MJ le retire aussi de `obs_rolls`.

## Critère de fin

La mise à niveau est terminée seulement lorsqu’une session complète fonctionne sur la version statique : connexion, création/jonction de room, jets publics, jets cachés sécurisés, historique filtré, invitations, personnages, fiches, inventaires, expérience de fin de partie et overlays OBS, sans serveur Node et sans perte de données V1.

Tout changement de schéma supplémentaire doit être ajouté sous forme de migration SQL versionnée et réversible. Ne jamais résoudre une incompatibilité en supprimant un compte, une room ou des données existantes.
