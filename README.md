# Dice Forge

Lanceur de dés et boîte à outils web pour les parties de jeu de rôle **BRP-ORC**. Dice Forge réunit des dés 3D, des tests de compétence, des salons multijoueurs, des fiches de personnage et plusieurs références de jeu dans une application statique, sans installation ni étape de compilation.

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

### En local sous Windows

Prérequis : [Python 3](https://www.python.org/downloads/) accessible avec la commande `python` ou `py`.

1. Clonez ou téléchargez le dépôt.
2. Lancez `Run.bat`.
3. L'application s'ouvre sur `http://127.0.0.1:8000/`.
4. Utilisez `Stop.bat` pour arrêter le serveur.

Il n'y a aucune dépendance à installer et aucun build à exécuter. Un serveur HTTP local est toutefois nécessaire, car l'application utilise des modules JavaScript ES.

Sous macOS ou Linux, lancez l'équivalent depuis la racine du projet :

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

Puis ouvrez `http://127.0.0.1:8000/`.

> Une connexion Internet reste nécessaire pour charger Three.js, Supabase et les polices distribuées par CDN.

## Utilisation

### Lancer des dés

Utilisez un bouton rapide ou composez une expression en choisissant jusqu'à dix dés de chaque type. Ajoutez éventuellement un modificateur, puis cliquez sur **Lancer les dés**. Par exemple : `2D6 + 1D8 + 5`.

Pour un test BRP, renseignez un score et choisissez la difficulté : automatique, facile, moyenne, difficile ou impossible. Dice Forge lance le `D100` et indique le niveau de réussite.

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

## Overlay OBS

Sous Windows, exécutez :

```bat
Run_OBS.bat ABCD
```

Remplacez `ABCD` par le code du salon, puis ajoutez cette URL comme source **Navigateur** dans OBS :

```text
http://127.0.0.1:8010/obs.html?room=ABCD
```

Paramètres facultatifs :

- `&limit=3` limite le nombre de jets affichés ;
- `&bg=1` ajoute un fond de test, utile hors OBS.

Lancez `Stop_OBS.bat` pour arrêter le serveur de l'overlay.

## Configuration Supabase

Supabase est facultatif pour les lancers en solo, mais nécessaire pour les salons, l'historique partagé et les fiches en ligne.

### 1. Créer la table des jets

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

drop policy if exists "Allow anon read rolls" on public.rolls;
create policy "Allow anon read rolls"
  on public.rolls for select to anon using (true);
drop policy if exists "Allow anon insert rolls" on public.rolls;
create policy "Allow anon insert rolls"
  on public.rolls for insert to anon with check (true);
drop policy if exists "Allow anon delete rolls" on public.rolls;
create policy "Allow anon delete rolls"
  on public.rolls for delete to anon using (true);

grant select, insert, delete on public.rolls to anon;
grant usage, select on sequence public.rolls_id_seq to anon;

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

> Les politiques ci-dessus sont volontairement permissives et conviennent à une instance personnelle ou de démonstration. Pour un déploiement public sensible, ajoutez une authentification et des règles RLS adaptées.

### 2. Créer les tables de fiches

Exécutez ensuite, dans cet ordre :

1. [`supabase-personnages.sql`](supabase-personnages.sql) pour les personnages générés ;
2. [`supabase-pj-sheets.sql`](supabase-pj-sheets.sql) pour les fiches complètes.

Le premier script sert aussi de migration : vous pouvez le réexécuter après une mise à jour de Dice Forge.

### 3. Renseigner la configuration

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
├── index.html                    # Application principale
├── pj.html                       # Fiche complète
├── obs.html                      # Overlay OBS
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
├── audio/                        # Effets sonores
└── img/                          # Illustrations d'équipement
```

L'interface est écrite en HTML, CSS et JavaScript natifs. Three.js `0.160.0` assure le rendu WebGL et `@supabase/supabase-js` `2.39.3` la synchronisation temps réel. Les dépendances sont chargées par import map depuis des CDN.

## Dépannage

| Problème | Piste de résolution |
|---|---|
| La page locale reste vide ou les modules sont bloqués | Utilisez `Run.bat` ou un serveur HTTP au lieu d'ouvrir directement `index.html` |
| Le son ne démarre pas | Cliquez une fois dans la page avant le premier lancer et vérifiez l'option **Son MP3** |
| Les dés 3D ne s'affichent pas | Vérifiez WebGL et l'accès au CDN, ou désactivez les animations |
| Impossible de rejoindre un salon | Vérifiez `supabase-config.js`, les politiques RLS et la présence d'au moins un jet dans le salon |
| Les jets n'apparaissent pas en direct | Vérifiez que `rolls` appartient à la publication `supabase_realtime` |
| Une sauvegarde de personnage échoue | Réexécutez `supabase-personnages.sql` pour appliquer les migrations |
| Une fiche complète en ligne est introuvable | Rejoignez le bon salon avec le même nom de joueur et exécutez `supabase-pj-sheets.sql` |

## Crédits et licence

Projet personnel. Les icônes de dés provenant de [Game-icons.net](https://game-icons.net/) sont distribuées sous licence [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).
