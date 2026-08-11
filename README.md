# Dice Forge

[![Qualité](https://github.com/kithain/Dice-Forge/actions/workflows/quality.yml/badge.svg)](https://github.com/kithain/Dice-Forge/actions/workflows/quality.yml)

Suite de jeu pour les parties **BRP-ORC**. Dice Forge réunit les dés 3D, les salons multijoueurs, les fiches, le tracker d'initiative, la Battle Map, l'import Obsidian et les overlays OBS. En local, tout est accessible depuis un cockpit MJ unique.

**[Ouvrir Dice Forge](https://kithain.github.io/Dice-Forge/)** · [Aide joueurs](https://kithain.github.io/Dice-Forge/help.html) · [Livret du joueur](https://kithain.github.io/Dice-Forge/livret_joueur.html)

## Fonctionnalités

- Lancers de `D4`, `D6`, `D8`, `D10`, `D12`, `D20` et `D100`, seuls ou combinés avec un modificateur.
- Génération aléatoire avec la Web Crypto API et animation des dés en 3D avec Three.js.
- Boutons de lancer rapide, tests BRP au `D100` et calcul automatique du niveau de réussite.
- Détection des réussites et échecs critiques sur le `D20`, avec effets visuels et sonores.
- Salons Supabase pour partager les jets en temps réel, restaurer une session et conserver l'historique récent.
- Jets cachés : le résultat complet reste réservé au créateur du salon.
- Générateur de personnage BRP-ORC avec espèces, professions, caractéristiques, valeurs dérivées et deux relances maximum.
- Fiche complète éditable, sauvegardée localement ou dans Supabase, exportable en Markdown et imprimable en PDF.
- Import et export JSON des personnages, ainsi que transfert d'une fiche complète vers un autre salon.
- Overlay temps réel pour OBS.
- Livret du joueur, inventaire, écrans joueur/MJ et règles BRP-ORC consultables depuis le menu.

## Démarrage rapide

### Version en ligne

Rendez-vous sur **[kithain.github.io/Dice-Forge](https://kithain.github.io/Dice-Forge/)** avec un navigateur récent. Aucun compte n'est nécessaire pour lancer des dés en solo.

### Cockpit MJ local sous Windows

Prérequis : [Python 3](https://www.python.org/downloads/) accessible avec la commande `python` ou `py`.

1. Clonez ou téléchargez le dépôt.
2. Lancez `DiceForge.bat`.
3. Le cockpit s'ouvre sur `http://127.0.0.1:5000/`.
4. Saisissez la room active puis ouvrez les outils depuis cette page.
5. Utilisez `DiceForge_Stop.bat` pour tout arrêter.

Le premier lancement installe automatiquement les dépendances Python manquantes.

> Une connexion Internet reste nécessaire pour charger Three.js, Supabase et les polices distribuées par CDN.

## Utilisation

### Lancer des dés

Utilisez un bouton rapide ou composez une expression en choisissant jusqu'à dix dés de chaque type. Ajoutez éventuellement un modificateur, puis cliquez sur **Lancer les dés**. Par exemple : `2D6 + 1D8 + 5`.

Pour un test BRP, renseignez un score et choisissez la difficulté : automatique, facile, moyenne, difficile ou impossible. Dice Forge lance le `D100` et indique le niveau de réussite.

Le bouton **Jet de Course** calcule automatiquement `(DEX + MOV) × 3`, avec un maximum de 95 %. Une réussite donne une progression de `MOV × 2` mètres par tour de six secondes ; une réussite spéciale ou critique ajoute respectivement un avantage ou un avantage majeur. Le jet convient aussi bien aux poursuites qu’aux fuites face à un danger.

### Jouer en salon

1. Saisissez votre nom.
2. Cliquez sur **Créer**, ou entrez le code reçu puis cliquez sur **Rejoindre**.
3. Partagez le code du salon avec la table.

Les jets sont synchronisés en temps réel et la session est restaurée après rechargement de la page. Le créateur du salon peut purger l'historique et consulter le résultat des jets cachés.

### Créer un personnage

Ouvrez l'onglet **Fiche personnage**, rejoignez d'abord un salon, puis renseignez l'identité, l'espèce et la profession du personnage. La génération utilise :

- `3D6` pour FOR, CON, POU, DEX et CHA ;
- `2D6 + 6` pour TAI et INT ;
- les modificateurs propres à l'espèce sélectionnée.

Le tirage initial et les deux relances possibles sont enregistrés dans Supabase. Vous pouvez ensuite déplacer jusqu'à trois points entre les caractéristiques, enregistrer le personnage et continuer vers la fiche complète.

La fiche complète permet notamment de gérer les compétences, les sorts, l'équipement et les notes. Elle conserve un brouillon local et propose :

- la synchronisation forcée de l’identité, des caractéristiques et du MOV depuis le personnage généré, sans effacer le reste de la fiche complète ;
- l'ouverture et l'enregistrement au format Markdown ;
- la sauvegarde et le chargement par salon dans Supabase ;
- le transfert vers un autre salon ;
- un aperçu A4 à imprimer ou enregistrer en PDF.

Pour un guide détaillé, consultez l'[aide joueurs](https://kithain.github.io/Dice-Forge/help.html).

## Pages et références

| Page | Description |
|---|---|
| [`index.html`](https://kithain.github.io/Dice-Forge/) | Lanceur de dés, salons et génération de personnage |
| [`pj.html`](https://kithain.github.io/Dice-Forge/pj.html) | Fiche de personnage complète |
| [`help.html`](https://kithain.github.io/Dice-Forge/help.html) | Guide d'utilisation destiné aux joueurs |
| [`livret_joueur.html`](https://kithain.github.io/Dice-Forge/livret_joueur.html) | Livret du joueur |
| [`inventaire.html`](https://kithain.github.io/Dice-Forge/inventaire.html) | Armes, armures et équipement |
| [`ecran_joueur_BRP_ORC.html`](https://kithain.github.io/Dice-Forge/ecran_joueur_BRP_ORC.html) | Écran de référence joueur |
| [`ecran_MJ_BRP_ORC.html`](https://kithain.github.io/Dice-Forge/ecran_MJ_BRP_ORC.html) | Écran de référence meneur de jeu |
| [`BRP_ORC_traduction_FR_complete.html`](https://kithain.github.io/Dice-Forge/BRP_ORC_traduction_FR_complete.html) | Traduction française complète des règles |

## Overlays OBS

Saisissez le code de la partie dans le cockpit puis utilisez **Copier l'URL** sur l'overlay souhaité. Les adresses ont désormais des noms explicites :

```text
http://127.0.0.1:5000/overlays/rolls?room=ABCD
```

Pour afficher uniquement l'animation 3D des dés sur fond transparent :

```text
http://127.0.0.1:5000/overlays/dice?room=ABCD
```

La carte et le portrait actif sont disponibles sur :

```text
http://127.0.0.1:5000/overlays/map
http://127.0.0.1:5000/portrait_view
```

Paramètres facultatifs :

- `&limit=3` limite le nombre de jets affichés ;
- `&bg=1` ajoute un fond de test, utile hors OBS.
- sur `obs-dice.html`, `&hold=400` règle en millisecondes la durée d'affichage des dés après l'animation.

Les overlays sont publics en lecture seule et ne demandent aucune connexion. Ils utilisent un flux séparé qui ne contient jamais les jets cachés. Le code de la room dans l'URL sélectionne uniquement les jets à afficher.

## Configuration Supabase

Supabase est facultatif pour les lancers en solo, mais nécessaire pour les salons, l'historique partagé et les fiches en ligne.

### 1. Créer les comptes joueurs

Dice Forge utilise Supabase Auth : le mot de passe est vérifié par Supabase et n'est jamais enregistré dans le code du site.

1. Dans **Supabase > Authentication > Users**, créez chaque joueur avec **Add user > Create new user**.
2. Transformez son nom en minuscules, sans accents, avec les espaces remplacés par des points, puis ajoutez `@diceforge.app`. Exemple : `Jean Pierre` devient `jean.pierre@diceforge.app`.
3. Attribuez votre mot de passe initial de test dans Supabase, sans l'enregistrer dans le dépôt, et marquez l'adresse comme confirmée.
4. Désactivez les inscriptions publiques dans les réglages Auth afin que seuls les comptes créés par l'administrateur puissent entrer.

Le joueur se connecte avec son nom, puis peut choisir son propre mot de passe depuis **Menu > Mon compte**.

Les personnages, fiches complètes et inventaires sont rattachés à l'identifiant permanent du compte Auth. Ils sont donc retrouvés après un changement de room. Le joueur peut modifier ses propres données ; le propriétaire/MJ d'une room commune peut les consulter en lecture seule.

### 2. Créer la table des jets

Dans le **SQL Editor** de votre projet Supabase, exécutez :

```sql
create table if not exists public.rolls (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  room_code text not null,
  player_name text not null,
  expression text not null,
  rolls_detail text not null default '',
  total integer not null default 0,
  is_crit boolean not null default false,
  is_fail boolean not null default false,
  is_hidden boolean not null default false
);

create index if not exists rolls_room_created_idx
  on public.rolls (room_code, created_at desc);

alter table public.rolls enable row level security;

drop policy if exists "Allow authenticated read rolls" on public.rolls;
create policy "Allow authenticated read rolls"
  on public.rolls for select to authenticated using (true);
drop policy if exists "Allow authenticated insert rolls" on public.rolls;
create policy "Allow authenticated insert rolls"
  on public.rolls for insert to authenticated with check (true);
drop policy if exists "Allow authenticated delete rolls" on public.rolls;
create policy "Allow authenticated delete rolls"
  on public.rolls for delete to authenticated using (true);

grant select, insert, delete on public.rolls to authenticated;
grant usage, select on sequence public.rolls_id_seq to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'rolls'
  ) then
    alter publication supabase_realtime add table public.rolls;
  end if;
end $$;
```

Si vous migrez une ancienne installation, vérifiez en particulier que la colonne `is_hidden` existe :

```sql
alter table public.rolls
  add column if not exists is_hidden boolean not null default false;
```

> Après l'exécution de `supabase-auth.sql`, chaque room possède un propriétaire Supabase. Seul le propriétaire peut lire le résultat d'un jet caché, y compris lorsque le jet a été lancé par un autre joueur. Les visiteurs non connectés ont uniquement accès au flux OBS filtré en lecture seule.

### 3. Créer les tables de fiches

Exécutez ensuite, dans cet ordre :

1. [`supabase-personnages.sql`](supabase-personnages.sql) pour les personnages générés ;
2. [`supabase-pj-sheets.sql`](supabase-pj-sheets.sql) pour les fiches complètes ;
3. [`supabase-inventory.sql`](supabase-inventory.sql) pour les inventaires.

Le premier script sert aussi de migration : vous pouvez le réexécuter après une mise à jour de Dice Forge.

Exécutez ensuite [`supabase-auth.sql`](supabase-auth.sql) afin de créer les propriétaires et membres des rooms, retirer les anciennes autorisations publiques et créer le flux OBS filtré. Les anciennes rooms sont automatiquement rattachées au compte Auth correspondant lorsque leur ancien nom de créateur correspond à l'adresse interne, par exemple `MJ` avec `mj@diceforge.app`. Toutes les nouvelles rooms ont automatiquement un propriétaire.

### 4. Renseigner la configuration

Complétez `supabase-config.js` avec l'URL du projet et sa clé anonyme :

```javascript
window.SUPABASE_CONFIG = {
  url: 'https://VOTRE-PROJET.supabase.co',
  anonKey: 'VOTRE_CLE_ANON'
};
```

La clé `anon` est destinée aux applications clientes et sera visible dans le navigateur. N'utilisez jamais la clé `service_role` dans ce fichier.

## Architecture

```text
Dice-Forge/
├── DiceForge.bat                 # Lance le compagnon local unique
├── index.html                    # Application web joueurs / GitHub Pages
├── pj.html                       # Fiche complète
├── obs.html                      # Overlay des résultats de jets
├── help.html                     # Aide joueurs
├── js/
│   ├── app.js                    # Dés, tests BRP et personnages
│   ├── dice3d*.js                # Rendu et animation 3D
│   ├── supabase-room.js          # Salons, jets et personnages en ligne
│   ├── pj-sheet.js               # Fiche complète et synchronisation
│   └── obs-overlay.js            # Flux OBS
├── supabase-config.js            # URL et clé anon Supabase
├── supabase-personnages.sql      # Schéma et migration des personnages
├── supabase-pj-sheets.sql        # Schéma des fiches complètes
├── Roll20/Webtracker/
│   ├── run.py                    # Serveur local unique, port 5000
│   └── app/                      # Cockpit, tracker et Battle Map
├── audio/                        # Effets sonores
└── img/                          # Illustrations d'équipement
```

Le serveur local Flask sert le cockpit, l'application Dice Forge, le tracker, la Battle Map et les overlays sur la même origine. La version GitHub Pages continue de servir l'application aux joueurs. Supabase reste la source officielle des comptes, rooms, jets et fiches ; Obsidian reste une source locale en lecture seule.

## Dépannage

| Problème | Piste de résolution |
|---|---|
| Le cockpit local ne s'ouvre pas | Lancez `DiceForge.bat` et vérifiez que le port 5000 est disponible |
| Le son ne démarre pas | Cliquez une fois dans la page avant le premier lancer et vérifiez l'option **Son MP3** |
| Les dés 3D ne s'affichent pas | Vérifiez WebGL et l'accès au CDN, ou désactivez les animations |
| Impossible de rejoindre un salon | Vérifiez `supabase-config.js`, les politiques RLS et la présence d'au moins un jet dans le salon |
| Les jets n'apparaissent pas en direct | Vérifiez que `rolls` appartient à la publication `supabase_realtime` |
| Une sauvegarde de personnage échoue | Réexécutez `supabase-personnages.sql` pour appliquer les migrations |
| Une fiche complète en ligne est introuvable | Vérifiez le compte connecté et exécutez les migrations Supabase à jour |

## Crédits et licence

Projet personnel. Les icônes de dés provenant de [Game-icons.net](https://game-icons.net/) sont distribuées sous licence [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).
