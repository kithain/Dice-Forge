# ⚔️ Dice Forge

Dice Forge est un lanceur de dés virtuel pour jeux de rôle (JDR), accessible directement dans un navigateur web. Il permet de simuler des lancers de dés avec des animations 3D, un générateur aléatoire cryptographique, des effets sonores, et un mode multijoueur en temps réel pour partager ses jets avec sa table.

🔗 **Site en ligne :** [https://kithain.github.io/Dice-Forge/](https://kithain.github.io/Dice-Forge/)

---

## 🛠️ Technologies

| Technologie | Rôle |
|-------------|------|
| **HTML5 / CSS3 / JavaScript (ES Modules)** | Application monopage, toute la logique est dans `index.html` |
| **Three.js** (v0.160) | Rendu 3D des dés via WebGL — polyèdres, textures de faces, animation de roulement |
| **Supabase** (v2.39) | Backend temps réel — stockage des jets et diffusion en direct via WebSockets |
| **Web Crypto API** | Génération aléatoire cryptographique (`crypto.getRandomValues()`) pour un tirage truly random |
| **Web Audio API** | Synthèse sonore pour les jingles de coup critique et d'échec critique |
| **Google Fonts** (Cinzel / Cinzel Decorative) | Typographie thématique fantasy |
| **Game-icons.net** | SVG 2D illustrés pour les dés du sélecteur |

---

## 🎲 Fonctionnement de l'application

### Lancer de dés

L'application supporte 7 types de dés : **D4, D6, D8, D10, D12, D20, D100**.

Deux façons de lancer :

- **Lancer rapide** — boutons pré-configurés pour les jets courants (`D20`, `D6`, `D100`) et les jets BRP-ORC (`Effort FOR`, `Endurance CON`, `Idée INT`, `Chance POU`, `Agilité DEX`, `Charme CHA`)
- **Test BRP** — champ générique pour compétences, sorts, résistances ou jets libres avec score en %, difficulté (`Automatique`, `Facile ×2`, `Moyen ×1`, `Difficile ÷2`, `Impossible`) et niveau de réussite automatique
- **Compositeur de jet** — sélectionnez le nombre de dés de chaque type (1 à 10) via les boutons +/−, ajoutez un modificateur (+/−), puis cliquez sur **Lancer les Dés**

L'expression du jet s'affiche en temps réel dans une barre d'aperçu (ex. `2D6 + 1D8 + 5`).

### Fiches de personnage

L'onglet **Fiche personnage** permet de créer une fiche BRP-ORC médiéval-fantastique avec les caractéristiques suivantes : **Force**, **Constitution**, **Taille**, **Intelligence**, **Pouvoir**, **Dextérité** et **Charisme**.

- **FOR**, **CON**, **POU**, **DEX** et **CHA** sont générées avec `3D6`
- **TAI** et **INT** sont générées avec `2D6 + 6`
- Les espèces du `livret_joueur.html` sont disponibles : Humain, Nain, Elfe, Demi-Elfe, Demi-Orc
- L'espèce choisie applique ses modificateurs raciaux après le tirage BRP standard et son `MOV`
- Les professions du `livret_joueur.html` sont disponibles en liste, avec richesse et compétences de profession affichées dans la fiche
- Un champ **Détail des calculs** récapitule les jets, les modificateurs d'espèce, les dérivées et les points de compétences
- Le joueur peut relancer la série jusqu'à **2 fois** ; chaque relance remplace la série précédente
- Le joueur peut déplacer jusqu'à **3 points** au total entre les caractéristiques, avec un plafond de départ à `21`
- La fiche calcule les dérivées BRP-ORC : bonus aux dégâts, points de vie, seuil de blessure majeure, points de pouvoir, bonus d'expérience, mouvement, fatigue optionnelle et santé mentale optionnelle
- La fiche finale est enregistrée dans Supabase dans la table `personnages`
- Une fiche peut être exportée en JSON puis importée dans une autre salle ; après import, le joueur clique sur **Enregistrer** pour l'associer à son `player_name` courant
- À la connexion d'un joueur dans une salle, l'application récupère automatiquement la fiche liée à son `player_name`
- Les boutons de test lancent `D100` contre `caractéristique × 5` et affichent réussite critique, réussite spéciale, échec ou maladresse
- Les tests BRP libres appliquent les mêmes niveaux de réussite aux compétences et aux sorts

### Animation et résultats

- Les dés s'animent en 3D avec un effet de tumbling physique (Three.js)
- Chaque dé s'affiche ensuite avec sa valeur finale
- Le **total** (somme des dés + modificateur) s'affiche en grand
- Un **détail** du calcul est visible sous le total (ex. `3 + 5 + 1 + 2 = 11`)
- États spéciaux détectés automatiquement sur le D20 :
  - **Coup Critique** (20) — animation dorée + jingle
  - **Échec Critique** (1) — animation rouge + son d'échec

### Paramètres

- **Animations** — active/désactive l'animation 3D des dés
- **Son MP3** — active/désactive les effets sonores

### Mode multijoueur

Dice Forge permet de créer ou rejoindre une **salle de partie** pour partager ses jets en temps réel avec les autres joueurs de la table.

**Créer une salle :**
1. Saisir un nom de joueur
2. Cliquer sur **Créer** — un code à 4 caractères est généré (ex. `ABCD`)
3. Partager le code avec les autres joueurs

**Rejoindre une salle :**
1. Saisir un nom de joueur
2. Saisir le code de la partie
3. Cliquer sur **Rejoindre**

**Flux en direct :**
- Tous les jets des joueurs de la salle s'affichent en temps réel (du plus récent au plus ancien)
- Les 20 derniers jets sont chargés à la connexion
- Ses propres jets sont mis en évidence
- La session est sauvegardée (localStorage) — reconnexion automatique au prochain chargement

**Purger une salle :**
- Le créateur de la salle dispose d'un bouton **Purger** qui supprime tous les jets de la room
- Ce bouton n'est visible que par le joueur qui a créé la partie

**Quitter une salle :**
- Cliquer sur **Quitter** pour se déconnecter de la salle

---

### Vue OBS

Une vue overlay dediee permet d'afficher les jets en direct dans OBS, sur un port different de l'application principale.

- Lancer le serveur OBS : `Run_OBS.bat`
- Lancer directement une salle : `Run_OBS.bat ABCD`
- URL OBS : `http://127.0.0.1:8010/obs.html?room=ABCD`
- Options utiles : `&limit=3` pour limiter le nombre de jets visibles, `&bg=1` pour afficher un fond de preview hors OBS
- Arreter le serveur OBS : `Stop_OBS.bat`

---

## 🗂️ Structure du projet

```text
Dice-Forge/
├── index.html              # Application complète (HTML + CSS + JS)
├── supabase-config.js      # Configuration Supabase (URL + clé anon)
├── audio/
│   └── dice.mp3            # Son de lancer de dés
└── README.md
```

---

## 🌐 Configuration Supabase

Le mode multijoueur nécessite un backend Supabase.

1. Créer un projet gratuit sur [supabase.com](https://supabase.com)
2. Créer une table `rolls` avec le schéma suivant :

   | Colonne | Type | Description |
   |---------|------|-------------|
   | `id` | `bigint` (PK, auto-increment) | Identifiant unique |
   | `created_at` | `timestamptz` (default: `now()`) | Horodatage du jet |
   | `room_code` | `text` | Code de la salle (4 caractères) |
   | `player_name` | `text` | Nom du joueur |
   | `expression` | `text` | Expression du jet (ex. `2D6 + 5`) |
   | `rolls_detail` | `text` | Détail des valeurs (ex. `[3, 5]`) |
   | `total` | `integer` | Total du jet |
   | `is_crit` | `boolean` (default: `false`) | Coup critique |
   | `is_fail` | `boolean` (default: `false`) | Échec critique |

3. Créer une table `personnages` pour les fiches de personnage. Le script prêt à exécuter est fourni dans [`supabase-personnages.sql`](supabase-personnages.sql).

   | Colonne | Type | Description |
   |---------|------|-------------|
   | `player_name` | `text` (PK) | Nom du joueur, identique à `rolls.player_name` |
   | `nom` | `text` | Nom du personnage |
   | `espece` | `text` | Espèce du personnage |
   | `genre` | `text` | Genre du personnage |
   | `age` | `integer` | Âge du personnage |
   | `profession` | `text` | Profession BRP-ORC |
   | `richesse` | `text` | Niveau de richesse |
   | `traits` | `text` | Traits distinctifs |
   | `notes` | `text` | Notes libres |
   | `force` | `integer` | Score de Force |
   | `constitution` | `integer` | Score de Constitution |
   | `taille` | `integer` | Score de Taille |
   | `intelligence` | `integer` | Score d'Intelligence |
   | `pouvoir` | `integer` | Score de Pouvoir |
   | `dexterite` | `integer` | Score de Dextérité |
   | `charisme` | `integer` | Score de Charisme |
   | `created_at` | `timestamptz` (default: `now()`) | Date de création |

   `player_name` est la clé primaire de `personnages`. La liaison avec les jets se fait par `personnages.player_name = rolls.player_name`. Le script crée aussi une vue `rolls_personnages` pour lire les jets avec la fiche associée.

   Une contrainte FK stricte `rolls.player_name -> personnages.player_name` n'est pas ajoutée par défaut, car elle empêcherait un joueur de créer une salle ou de lancer un jet tant qu'il n'a pas encore de fiche personnage.

4. Renseigner les identifiants dans `supabase-config.js` :

   ```javascript
   window.SUPABASE_CONFIG = {
     url: 'https://VOTRE-PROJET.supabase.co',
     anonKey: 'VOTRE_CLE_ANON'
   };
   ```

5. Activer le **Realtime** sur la table `rolls` :
   - **Option A (SQL)** — Dans **SQL Editor**, exécuter : `alter publication supabase_realtime add table rolls;`
   - **Option B (Interface)** — Dans **Database** → **Publications**, trouver `supabase_realtime`, cliquer sur `...` → **Add tables**, cocher `rolls` et valider

6. Configurer les **Row Level Security (RLS)** policies selon vos besoins. Exemple minimal pour autoriser lecture, insertion et suppression :

   ```sql
   create policy "Allow all on rolls" on rolls for all to anon using (true) with check (true);
   ```

   > ⚠️ La clé anon est publique par design (exposée côté client). Ne jamais committer la clé `service_role`.

---

## 🔧 Problèmes fréquents

| Problème | Solution |
|----------|----------|
| Le son ne se lance pas | Cliquer une fois dans la page avant de lancer un dé (politique autoplay des navigateurs) |
| Les dés 3D ne s'affichent pas | Vérifier que WebGL est activé dans le navigateur, ou désactiver les animations |
| Le mode multijoueur ne fonctionne pas | Vérifier que `supabase-config.js` est correctement renseigné et que Realtime est activé |
| Le bouton Purger ne fonctionne pas | Vérifier que la RLS policy autorise les `DELETE` sur la table `rolls` |

---

## 📄 Licence

Projet personnel.

Les icônes SVG 2D des dés proviennent de **Game-icons.net**, sous licence CC BY 3.0.
