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
- Timer dramatique de 5, 2 ou 1 minute, piloté depuis le cockpit et synchronisé avec OBS.
- Livret du joueur, inventaire, écrans joueur/MJ et règles BRP-ORC consultables depuis le menu.

## Démarrage rapide

### Version en ligne

Rendez-vous sur **[kithain.github.io/Dice-Forge](https://kithain.github.io/Dice-Forge/)** avec un navigateur récent et connectez-vous à votre compte. Les lancers en solo ne demandent pas de rejoindre un salon.

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
2. Le MJ crée le salon avec **Créer** ; les joueurs entrent le code reçu puis cliquent sur **Rejoindre**.
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

### Supprimer un personnage depuis le suivi MJ

Le créateur du salon ouvre **Suivi MJ**, puis **Disponibilité et attribution des PJ**.
Le bouton **Supprimer** demande confirmation et retire le personnage des listes
et des fiches accessibles en ligne. **Corbeille MJ → Restaurer** récupère sa fiche,
son inventaire et son état précédent ; un personnage mort reste mort. Le joueur
doit le sélectionner à nouveau. Les notes du carnet sont conservées pour la restauration.
Pour un personnage partagé entre plusieurs campagnes, la suppression et la
restauration demandent d'être le MJ de toutes ces campagnes.

**Retirer du carnet local**, dans une fiche du carnet, enlève seulement la note
de ce navigateur et ne supprime pas le personnage en ligne.

## Pages et références

Les [aides de jeu](aides-jeu.html) regroupent les livrets, écrans joueur/MJ,
le catalogue et le guide de l’application. Chaque aide propose un sommaire,
une recherche sans distinction d’accents et une impression A4 portrait ;
les détails repliés sont ouverts pour l’impression puis restaurés.
L’économie d’encre est activée par défaut. Le texte BRP complet conserve
ses règles d’origine ; son annexe Dice Forge et les aides de campagne
précisent les adaptations prioritaires.

« Créer le PDF » prépare un instantané dans le stockage de l’onglet :
compétences, tous les sorts connus, inventaire local du personnage choisi,
monnaies, potions (transport/stock, effets et contrecoups), histoire et notes.
Ouvrir l’onglet Inventaire et attendre son chargement avant l’export pour
inclure ses données. Un inventaire absent est signalé dans l’aperçu.
L’export ne sauvegarde rien en ligne. Dans la boîte d’impression, choisir
A4 portrait, échelle 100 %, sans en-têtes ni pieds de page du navigateur.

Le livret joueur présente les règles essentielles. Les listes et tables détaillées sont regroupées dans `livret_reference.html`. L’ancien lien `livret_joueurV2.html` redirige vers le livret principal.

La fiche propose trois onglets : Fiche, Inventaire, Sorts et Pouvoirs. Dans Inventaire, l’onglet Potions démarre vide. Choisir l’une des 16 préparations du catalogue remplit son effet et son contrecoup. Chaque ligne distingue les doses transportées des doses en stock ; le total transporté est limité à 4. Les modifications sont sauvegardées avec l’inventaire ; les consommables existants sont conservés. Au chargement d’une sauvegarde incohérente, les doses transportées excédentaires sont conservées dans le stock.

« Sorts et Pouvoirs » affiche tous les sorts de la fiche Supabase, sans limite de six lignes, avec leur nom fixe et leurs points répartis. « Ajouter un sort » propose les sorts autorisés pour la profession enregistrée, en excluant ceux déjà présents ; il faut attribuer des points avant l’ajout. « Sauvegarder les sorts » actualise seulement les sorts, leurs coches et les notes de magie dans la fiche existante. Les autres champs sont conservés depuis la dernière version Supabase, avec contrôle du budget commun et protection contre une écriture concurrente. Les lignes de sorts et leurs totaux dérivés sont également actualisés dans le Markdown enregistré. Sans partie connectée, la sauvegarde reste locale.

Les règles d’alchimie retenues sont celles du référentiel Obsidian : catégories de réactifs, recettes de degrés I/II, critique doublant les doses et limite de quatre doses transportées. Les références contiennent les 16 recettes et leurs contrecoups ; les écrans joueur/MJ et la fiche renvoient à ce même chapitre.

L’inventaire conserve un historique local des modifications par compte et salon.
Les changements en attente sont envoyés dans l’ordre, un par un ; une erreur
réseau conserve la file pour une reprise lors du prochain chargement, du retour
en ligne ou d’un clic sur « Sauvegarder en ligne ». Les modifications faites
pendant un chargement sont conservées et rejouées sur les données reçues. Un
conflit sur un même champ bloque la file : « Résoudre le conflit » permet de
confirmer l’application de ses changements, sans modifier les autres champs.
Les listes d’équipement sont comparées dans leur ensemble pour éviter une
fusion ambiguë. « Exporter l’historique » fournit les changements en attente et
les 100 derniers envois réussis. Cet historique reste dans le navigateur et
n’est pas un journal partagé dans Supabase.

Les compétences inutilisées sont retirées de la fiche active ; leurs anciennes
valeurs sont conservées dans `retiredSkills` pour compatibilité. Une
caractéristique laissée vide signifie N/A. Les corrections SQL pour une base
de campagne v2 déjà installée sont dans
[`migrations/character-v2/save-fixes.sql`](migrations/character-v2/save-fixes.sql).

Pour les mettre à jour, modifier le fichier Obsidian `50 - OUTILS/52 - Regles/alchimie.md`, puis l’importer avec `python scripts/sync_alchemy_rules.py --source "chemin/vers/alchimie.md"`. Le script conserve sa copie dans `data/alchimie.md`, génère la section `#alchimie` de `livret_reference.html` et le catalogue `js/alchemy-potions.js`. Ne pas modifier ces sorties séparément : `python scripts/validate_project.py` vérifie leur synchronisation, également dans GitHub Actions. Sans `--source`, le script régénère ces sorties depuis la copie du dépôt. Les sauvegardes historiques ne sont pas des règles actives.

| Page | Description |
|---|---|
| [`index.html`](https://kithain.github.io/Dice-Forge/) | Lanceur de dés, salons et génération de personnage |
| [`pj.html`](https://kithain.github.io/Dice-Forge/pj.html) | Fiche de personnage complète |
| [`help.html`](https://kithain.github.io/Dice-Forge/help.html) | Guide d'utilisation destiné aux joueurs |
| [`livret_joueur.html`](https://kithain.github.io/Dice-Forge/livret_joueur.html) | Livret du joueur |
| [`livret_reference.html`](https://kithain.github.io/Dice-Forge/livret_reference.html) | Création détaillée, compétences, sorts et recettes |
| [`inventaire.html`](https://kithain.github.io/Dice-Forge/inventaire.html) | Armes, armures et équipement |
| [`ecran_joueur_BRP_ORC.html`](https://kithain.github.io/Dice-Forge/ecran_joueur_BRP_ORC.html) | Écran de référence joueur |
| [`ecran_MJ_BRP_ORC.html`](https://kithain.github.io/Dice-Forge/ecran_MJ_BRP_ORC.html) | Écran de référence meneur de jeu |
| [`BRP_ORC_traduction_FR_complete.html`](https://kithain.github.io/Dice-Forge/BRP_ORC_traduction_FR_complete.html) | Traduction française complète des règles |

## Overlays OBS

### Aide à la confrontation verbale

Dans l’onglet **Confrontation verbale**, tire les mots puis clique sur **Afficher dans OBS**. L’overlay affiche le personnage, l’approche, les mots, les jokers et les repères « placé », sans verdict automatique. Les changements sont synchronisés ; **Masquer dans OBS** efface l’affichage. Un changement d’approche ou de personnage masque également l’aide. Une seule aide est affichée à la fois par salon : le dernier affichage demandé remplace le précédent.

Depuis le cockpit local, utilise la carte **Confrontation verbale**, ou ajoute cette source Navigateur à OBS (dimensions conseillées : **700 × 550**) :

```text
http://127.0.0.1:5000/overlays/verbal?room=ABCD
```

Pour la prévisualisation locale autonome, lance `python scripts/serve_local.py` à la racine du dépôt puis ouvre `http://127.0.0.1:8765/`. L’URL OBS est `http://127.0.0.1:8765/obs-verbal.html?room=ABCD`, ou `?room=LOCAL` sans salon. **Copier l’URL OBS** dans l’onglet fournit le lien adapté. Ajoute `&bg=1` pour tester avec un fond visible.

Cette V1 transmet l’état au serveur local, ce qui permet à OBS de le recevoir dans son propre navigateur, sans compte ni stockage navigateur partagé. Le lanceur et la source OBS doivent utiliser le même serveur local et le même code de salon. Les joueurs utilisant uniquement le site en ligne ne transmettent pas encore leurs mots au serveur du MJ. L’état est conservé en mémoire jusqu’au masquage ou au redémarrage du serveur ; aucun schéma Supabase n’est modifié.

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

Le timer se pilote depuis `http://127.0.0.1:5000/timer`. Ajoutez cette URL comme source navigateur dans OBS :

```text
http://127.0.0.1:5000/overlays/timer
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
