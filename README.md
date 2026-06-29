# ⚔️ Dice Forge

**Lanceur de dés 3D pour jeux de rôle (JDR) — 100 % navigateur, sans installation.**

Dice Forge est une application web monopage qui permet de simuler des lancers de dés pour vos parties de jeux de rôle. Elle propose des dés 3D animés, un générateur aléatoire cryptographique, des effets sonores, et un mode multijoueur en temps réel via Supabase.

🔗 **Site en ligne :** [https://kithain.github.io/Dice-Forge/](https://kithain.github.io/Dice-Forge/)

---

## ✨ Fonctionnalités

- **7 types de dés** : D4, D6, D8, D10, D12, D20, D100
- **Lancer rapide** : boutons pré-configurés (D20, D6, D100, 3D6, 1D20 + 2D6, etc.)
- **Compositeur de jet** : sélectionnez le nombre de dés de chaque type, ajoutez un modificateur (+/−)
- **Animation 3D** : dés en trois dimensions avec tumbling physique (Three.js)
- **Affichage SVG** : rendu vectoriel des dés avec ombrage et couleurs par état
- **Aléatoire cryptographique** : utilise `crypto.getRandomValues()` pour un tirage truly random
- **Critiques & échecs** : détection automatique des coups critiques (20) et échecs critiques (1) sur D20
- **Effets sonores** : son de lancer (MP3), jingle de critique, son d'échec (Web Audio API)
- **Toggles** : activation/désactivation des animations et du son
- **Multijoueur en temps réel** : création/rejoindre de salles de partie avec flux live des jets via Supabase
- **Sauvegarde de session** : reconnexion automatique à la dernière salle (localStorage)
- **Design responsive** : s'adapte aux mobiles et tablettes

---

## 🎲 Utilisation

### Lancer rapide

Cliquez sur l'un des boutons de la section **Lancer rapide** pour effectuer un jet immédiat :

| Bouton | Jet |
|--------|-----|
| D20 | 1 × D20 |
| D6 | 1 × D6 |
| D100 | 1 × D100 |
| D4 / D8 / D10 / D12 | 1 dé du type correspondant |
| 3D6 | 3 × D6 |
| 1D20 + 2D6 | 1 × D20 + 2 × D6 |
| 2D8 | 2 × D8 |

### Composer un jet personnalisé

1. Dans la section **Composer votre jet**, utilisez les boutons **+** et **−** sous chaque type de dé pour définir la quantité (1 à 10).
2. Saisissez un **modificateur** dans le champ prévu (ex. `+5` pour Force, `−2` pour un malus).
3. L'expression s'affiche en temps réel dans la barre d'aperçu (ex. `2D6 + 1D8 + 5`).
4. Cliquez sur **⚔️ Lancer les Dés**.

### Lire les résultats

- Chaque dé s'affiche individuellement avec sa valeur.
- Le **total** calculé (somme des dés + modificateur) s'affiche en grand.
- Un **détail** du calcul est visible sous le total (ex. `3 + 5 + 1 + 2 = 11`).
- Les états spéciaux sont mis en évidence :
  - **⭐ Coup Critique** : un D20 affiche 20 (effet sonore + animation dorée)
  - **💀 Échec Critique** : un D20 affiche 1 (effet sonore + animation rouge)

### Paramètres

- **Animations** : active/désactive l'animation 3D des dés
- **Son MP3** : active/désactive les effets sonores

---

## 🌐 Mode multijoueur (Supabase)

Dice Forge permet de créer ou rejoindre une **salle de partie** pour partager vos jets en temps réel avec d'autres joueurs.

### Configuration Supabase

1. Créer un projet gratuit sur [supabase.com](https://supabase.com).
2. Dans le tableau de bord, créer une table `rolls` avec le schéma suivant :

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

3. Renseigner vos identifiants dans `supabase-config.js` :

   ```javascript
   window.SUPABASE_CONFIG = {
     url: 'https://VOTRE-PROJET.supabase.co',
     anonKey: 'VOTRE_CLE_ANON'
   };
   ```

   > ⚠️ **Sécurité** : `supabase-config.js` contient votre clé anon (publique). Ne committez **jamais** votre clé `service_role`. La clé anon est conçue pour être exposée côté client, mais pensez à configurer les **Row Level Security (RLS)** policies sur votre table `rolls` selon vos besoins.

4. Activer le **Realtime** sur la table `rolls` dans Supabase (Dashboard → Database → Replication → activer `rolls`).

### Créer une salle

1. Saisissez votre **nom de joueur**.
2. Cliquez sur **Créer**.
3. Un code à 4 caractères est généré automatiquement (ex. `ABCD`).
4. Partagez ce code avec vos joueurs.

### Rejoindre une salle

1. Saisissez votre **nom de joueur**.
2. Saisissez le **code de la partie** fourni par le créateur.
3. Cliquez sur **Rejoindre**.

### Flux en direct

- Tous les jets effectués par les joueurs de la salle s'affichent en temps réel dans la section **Jets en direct**.
- Les 20 derniers jets sont chargés automatiquement à la connexion.
- Vos propres jets sont mis en évidence.
- La session est sauvegardée : vous êtes automatiquement reconnecté à la même salle au prochain chargement.

### Quitter une salle

Cliquez sur **Quitter** dans le panneau de salle pour vous déconnecter.

---

## �️ Structure du projet

```text
dice-forge/
├── index.html              # Application complète (HTML + CSS + JS)
├── supabase-config.js      # Configuration Supabase (URL + clé anon)
├── audio/
│   └── dice.mp3            # Son de lancer de dés
└── README.md
```

---

## 🔧 Problèmes fréquents

| Problème | Solution |
|----------|----------|
| Le son ne se lance pas | Cliquez une fois dans la page avant de lancer un dé (politique autoplay des navigateurs) |
| Les dés 3D ne s'affichent pas | Vérifiez que WebGL est activé dans votre navigateur, ou désactivez les animations |
| Le mode multijoueur ne fonctionne pas | Vérifiez que `supabase-config.js` est correctement renseigné et que Realtime est activé |

---

## 🛠️ Technologies utilisées

- **HTML5 / CSS3 / JavaScript (ES Modules)** — application monopage
- **Three.js** (v0.160) — rendu 3D des dés via WebGL
- **Supabase** (v2.39) — backend temps réel pour le multijoueur
- **Web Crypto API** — génération aléatoire cryptographique
- **Web Audio API** — synthèse sonore pour critiques et échecs
- **Google Fonts** — typographie Cinzel / Cinzel Decorative

---

## 📄 Licence

Projet personnel. Ajoutez une licence si le dépôt doit être partagé ou réutilisé publiquement.
