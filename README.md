# Dice Forge

[![Qualité](https://github.com/kithain/Dice-Forge/actions/workflows/quality.yml/badge.svg)](https://github.com/kithain/Dice-Forge/actions/workflows/quality.yml)

**Les outils de la table BRP-ORC, du premier jet de dés au suivi de campagne.**

Dice Forge réunit un lanceur de dés 3D, des personnages et inventaires en ligne, des aides de jeu en français et un suivi MJ. Son compagnon local ajoute un cockpit, un tracker de combat, une Battle Map, l’import de fiches Obsidian et des vues pour OBS.

**[Ouvrir Dice Forge](https://kithain.github.io/Dice-Forge/)** · [Guide des joueurs](https://kithain.github.io/Dice-Forge/help.html) · [Aides de jeu](https://kithain.github.io/Dice-Forge/aides-jeu.html)

[Premiers pas](#premiers-pas) · [Jouer et gérer ses personnages](#jouer-et-gérer-ses-personnages) · [Outils du MJ](#outils-du-mj) · [OBS](#diffuser-dans-obs) · [Développement](#développement-et-maintenance) · [Dépannage](#dépannage)

## Ce que propose Dice Forge

| Outil | Usage |
| --- | --- |
| **Dés et tests BRP** | D4, D6, D8, D10, D12, D20 et D100, expressions combinées, bonus et malus, tests de caractéristiques, de compétences et de sorts. Animations 3D, sons et niveaux de réussite. |
| **Salons et campagnes** | Comptes joueurs, codes de partie, jets partagés avec le MJ, jets cachés et reprise de session. Plusieurs salons peuvent suivre la même campagne. |
| **Création de personnage** | Identité, espèce, profession, caractéristiques, deux relances au maximum et répartition contrôlée des points de création. |
| **Fiche de personnage** | Compétences, grimoire, notes, coches d’expérience et progression par session. Brouillon local, sauvegarde en ligne, fichiers Markdown et export PDF A4. |
| **Inventaire** | Équipement, armes, armures, monnaies et potions, avec doses transportées et en stock. Reprise des sauvegardes en attente après une coupure réseau. |
| **Joute verbale** | Tirage de mots selon l’approche et le score du personnage, mots placés ou écartés et jokers pour accompagner le jeu de rôle. |
| **Suivi MJ** | Vue du groupe, carnet local, disponibilité des PJ, attribution des prétirés, décès et corbeille avec restauration. |
| **Aides de jeu** | Livret joueur, références détaillées, catalogue d’équipement, écrans joueur et MJ, règles BRP en français, recherche et impression. |
| **Compagnon MJ local** | Cockpit Windows, tracker de combat, Battle Map avec génération procédurale, import Obsidian, portraits, timer dramatique et overlays OBS. |

L’application web est servie par **GitHub Pages**. **Supabase** assure l’authentification et les données en ligne. Le **serveur local Python/Flask** regroupe les outils du MJ sur son ordinateur.

## Premiers pas

### Jouer depuis le navigateur

1. Ouvrez [Dice Forge](https://kithain.github.io/Dice-Forge/) dans un navigateur récent.
2. Connectez-vous avec le nom et le mot de passe du compte fourni par l’administrateur.
3. Lancez des dés immédiatement, ou entrez le code donné par le MJ et cliquez sur **Rejoindre**.
4. Pour utiliser votre personnage, ouvrez **Fiche personnage** et choisissez le PJ de la campagne.

**Un compte est nécessaire pour accéder à l’application, y compris pour lancer des dés sans salon.** Les inscriptions sont gérées par l’administrateur. Le mot de passe peut ensuite être changé depuis **Menu → Mon compte**.

Une connexion Internet est nécessaire pour l’authentification, les services en ligne et les dépendances chargées depuis les CDN. Les animations nécessitent WebGL ; elles peuvent être désactivées dans le menu.

### Lancer le cockpit MJ sous Windows

Prérequis : **Python 3**, accessible avec `python` ou `py`, et une connexion Internet au premier lancement pour installer les dépendances manquantes.

Téléchargez le dépôt depuis GitHub, ou clonez-le :

```powershell
git clone https://github.com/kithain/Dice-Forge.git
cd Dice-Forge
.\DiceForge.bat
```

Le lanceur démarre le compagnon sur **[http://127.0.0.1:5000/](http://127.0.0.1:5000/)**. Ouvrez cette adresse pour accéder au cockpit, renseignez le code du salon puis utilisez ses cartes pour ouvrir les outils et copier les URL OBS.

Pour arrêter le compagnon, lancez `DiceForge_Stop.bat`.

> Le cockpit utilise la base de production par défaut. Les modalités d’accès à la base de recette sont décrites dans [BASE_TEST.md](BASE_TEST.md).

## Jouer et gérer ses personnages

### Lancer des dés et effectuer un test

Dans **Lancer de dés**, composez une expression avec les dés proposés, ajoutez un modificateur puis cliquez sur **Lancer les Dés**. Par exemple : `2D6 + 1D8 + 5`. Le compositeur accepte jusqu’à dix dés de chaque type.

Pour un **test BRP**, sélectionnez une compétence ou un sort de la fiche, ou saisissez un score libre. Choisissez la difficulté et le malus demandé par le MJ, puis cliquez sur **Tester**. L’application affiche le D100 et le niveau de réussite : critique, spéciale, normale, échec ou maladresse.

Les boutons de caractéristiques utilisent les valeurs du personnage lié. **Jet de Course** calcule `(DEX + MOV) × 3`, avec un seuil maximal de 95 %.

Les tirages génériques utilisent la Web Crypto API. Les jets de compétences, de sorts et de progression liés à la fiche en ligne sont contrôlés côté Supabase.

### Rejoindre un salon et retrouver sa campagne

Le MJ crée un salon avec **Créer** et partage son code. Les joueurs saisissent ce code puis utilisent **Rejoindre**. Le nom affiché est lié au compte connecté ; la connexion au salon est mémorisée dans le navigateur.

Le MJ dispose du flux **Jets en direct** et peut purger l’historique du salon. Un **jet caché** réserve son résultat complet au propriétaire/MJ du salon.

Un personnage possède une **identité permanente**. Ses compétences, ses sorts, sa progression et son inventaire sont suivis **par campagne**. Lorsque le MJ crée un nouveau salon depuis une campagne dont il est propriétaire, les deux salons partagent cet état. Changer de code de salon ne signifie donc pas nécessairement changer de campagne.

### Créer un personnage

1. Rejoignez un salon, puis ouvrez **Création de personnage** ou utilisez **Nouveau personnage**.
2. Renseignez le nom, l’espèce, le genre, l’âge et la profession.
3. Générez les caractéristiques : `3D6` pour FOR, CON, POU, DEX et CHA ; `2D6 + 6` pour TAI et INT, avec les modificateurs de l’espèce.
4. Ajustez le tirage : deux relances au maximum et jusqu’à trois points déplacés entre caractéristiques.
5. Enregistrez la génération, puis complétez les compétences et les sorts dans la fiche.
6. Répartissez les points professionnels et personnels, puis validez la création lorsque tous les points sont attribués.

Un brouillon peut être sauvegardé avant la fin de la répartition. La validation contrôle les budgets et les contraintes de profession côté serveur, puis verrouille les éléments de création. Les compteurs de la fiche et du grimoire indiquent les réserves restantes.

L’import/export **JSON** concerne les données de génération. Il ne remplace pas la sauvegarde de la fiche complète et de son inventaire.

### Suivre la fiche, les sorts et l’expérience

La fiche rassemble les onglets **Fiche**, **Inventaire**, **Sorts et Pouvoirs** et **Progression**. Elle propose un brouillon local, la sauvegarde dans Supabase et l’import/export Markdown.

Une réussite sur une compétence ou un sort sélectionné peut accorder sa coche d’expérience en ligne. La progression utilise ensuite les tentatives et le pool de points de la session ; une coche seule n’attribue pas de points.

Le grimoire affiche les sorts connus. Pendant la création, les sorts proposés dépendent de la profession. Après validation, l’apprentissage d’un nouveau sort demande une étude et l’accord oral du MJ ; un tirage unique de `20 + 3D6` détermine son score initial, sans dépense d’XP.

Les modifications d’inventaire en attente restent dans le navigateur et sont renvoyées dans l’ordre après reprise du réseau. Si deux versions modifient le même champ, **Résoudre le conflit** permet de traiter le désaccord. **Exporter l’historique** fournit la file en attente et les derniers envois réussis.

Le catalogue propose **16 potions** avec effets et contrecoups. Chaque potion distingue les doses transportées du stock ; le total transporté est limité à **quatre doses**.

### Exporter une fiche en PDF

**Créer le PDF** prépare un aperçu A4 avec les compétences, les sorts, l’inventaire disponible, les monnaies, les potions, l’histoire et les notes.

Avant l’export, ouvrez l’onglet **Inventaire** et attendez son chargement. Dans la boîte d’impression du navigateur, choisissez **A4 portrait**, une échelle de **100 %** et désactivez les en-têtes et pieds de page. La préparation du PDF ne sauvegarde pas la fiche en ligne.

Les parcours détaillés sont disponibles dans le [guide des joueurs](https://kithain.github.io/Dice-Forge/help.html).

## Outils du MJ

### Suivi du groupe en ligne

La page [Suivi MJ](https://kithain.github.io/Dice-Forge/suivi-mj.html) permet au propriétaire du salon de consulter les personnages de la campagne et de gérer leur disponibilité, les prétirés et leur attribution.

Le **carnet MJ** conserve ses notes dans le navigateur. **Retirer du carnet local** enlève uniquement une note locale. **Supprimer**, dans la gestion des PJ, retire le personnage des listes en ligne après confirmation ; la **Corbeille MJ** permet de retrouver sa fiche, son inventaire et son statut précédent. Restaurer un personnage mort ne le rend pas vivant. Pour un PJ partagé entre plusieurs campagnes, la suppression et la restauration exigent les droits MJ dans toutes ces campagnes.

### Cockpit et outils locaux

| Outil | Adresse locale |
| --- | --- |
| Cockpit MJ | `http://127.0.0.1:5000/` |
| Application Dice Forge | `http://127.0.0.1:5000/dice/index.html` |
| Tracker de combat | `http://127.0.0.1:5000/tracker` |
| Vue joueurs du tracker | `http://127.0.0.1:5000/view` |
| Battle Map | `http://127.0.0.1:5000/battlemap` |
| Commandes du timer | `http://127.0.0.1:5000/timer` |

Le **tracker** suit l’ordre d’attaque par DEX, le combattant actif, les rounds, les PV et les états. Les boutons de PV appliquent les valeurs saisies ; le tracker marque automatiquement un participant mort à zéro PV. Les dégâts et l’armure restent à calculer lors de la résolution du combat.

La **Battle Map** permet d’importer une image, de placer des tokens et de synchroniser la vue OBS. Son générateur procédural propose des donjons, forêts, cavernes et ruines, avec une graine reproductible et un export PNG.

L’**import Obsidian** lit les fiches Markdown des dossiers PJ, PNJ et Bestiaire pour ajouter des participants au tracker. Configurez le chemin du coffre avant le lancement :

```powershell
$env:DICE_FORGE_VAULT = "C:\chemin\vers\MonCoffre"
.\DiceForge.bat
```

Les fichiers sources du coffre sont consultés en lecture seule.

Le **timer dramatique** propose des durées de cinq, deux ou une minute, synchronisées avec sa vue OBS.

Consultez le [guide du compagnon MJ](Roll20/Webtracker/README.md) pour les détails de ces outils.

## Diffuser dans OBS

Ajoutez une **source Navigateur** dans OBS. Pour les outils locaux, démarrez d’abord le compagnon, saisissez le code du salon dans le cockpit puis utilisez **Copier l’URL** sur la carte souhaitée.

Remplacez `ABCD` par le code de votre salon :

| Source | URL du compagnon local |
| --- | --- |
| Résultats des jets | `http://127.0.0.1:5000/overlays/rolls?room=ABCD` |
| Animation 3D des dés | `http://127.0.0.1:5000/overlays/dice?room=ABCD` |
| Joute verbale | `http://127.0.0.1:5000/overlays/verbal?room=ABCD` |
| Battle Map | `http://127.0.0.1:5000/overlays/map` |
| Portrait actif | `http://127.0.0.1:5000/portrait_view` |
| Timer | `http://127.0.0.1:5000/overlays/timer` |

Les résultats et les animations de dés disposent aussi de sources hébergées sur GitHub Pages, sans compagnon local :

```text
https://kithain.github.io/Dice-Forge/obs.html?room=ABCD
https://kithain.github.io/Dice-Forge/obs-dice.html?room=ABCD
```

Ces deux overlays lisent un flux Supabase public dédié et ne demandent pas de connexion. **Le résultat d’un jet caché n’est jamais diffusé** : l’historique peut afficher une indication masquée, et l’overlay 3D ignore ces jets.

Paramètres facultatifs :

- `&limit=3` : limiter le nombre de résultats affichés dans l’historique ;
- `&bg=1` : afficher un fond de test sur les overlays de jets, de dés et de joute verbale ;
- `&hold=400` : conserver les dés à l’écran pendant 400 ms après l’animation.

### Joute verbale : fonctionnement local

Dans l’onglet **Joute verbale**, choisissez l’approche puis utilisez **Tirer les mots**. L’overlay affiche **le nom du PJ et ses mots sur une seule ligne**, ajustée à la largeur de la source. Les mots placés sont cochés en vert ; les mots écartés sont barrés. L’outil accompagne le jeu de rôle sans produire de verdict automatique.

Le dernier tirage reste affiché jusqu’au suivant. Un nouveau tirage remplace celui du salon ; le changement de personnage ou la fermeture de la page du joueur n’efface pas l’affichage.

**La page de jeu et OBS doivent utiliser le même serveur local et le même code de salon.** Les joueurs qui utilisent uniquement GitHub Pages ne transmettent pas leurs mots au serveur du MJ. L’état de cet overlay est conservé en mémoire jusqu’au prochain tirage ou au redémarrage du serveur.

Pour une prévisualisation avec le serveur léger :

```powershell
python scripts/serve_local.py
```

Ouvrez `http://127.0.0.1:8765/`, puis utilisez dans OBS `http://127.0.0.1:8765/obs-verbal.html?room=ABCD`. Sans salon connecté, utilisez `?room=LOCAL`. Ce serveur fournit l’application web et le relais verbal ; les outils du cockpit restent sur le compagnon Flask.

## Livrets et références

| Page | Contenu |
| --- | --- |
| [Aides de jeu](https://kithain.github.io/Dice-Forge/aides-jeu.html) | Point d’entrée vers les livrets, écrans et guides |
| [Livret du joueur](https://kithain.github.io/Dice-Forge/livret_joueur.html) | Règles essentielles et déroulement du jeu |
| [Références du joueur](https://kithain.github.io/Dice-Forge/livret_reference.html) | Création détaillée, compétences, sorts et alchimie |
| [Catalogue d’équipement](https://kithain.github.io/Dice-Forge/inventaire.html) | Armes, armures et matériel ; l’inventaire personnel se trouve dans la fiche |
| [Écran joueur](https://kithain.github.io/Dice-Forge/ecran_joueur_BRP_ORC.html) | Repères rapides pour les joueurs |
| [Écran MJ](https://kithain.github.io/Dice-Forge/ecran_MJ_BRP_ORC.html) | Tables et repères pour le meneur de jeu |
| [Règles BRP complètes en français](https://kithain.github.io/Dice-Forge/BRP_ORC_traduction_FR_complete.html) | Texte de référence et annexe Dice Forge |

Les aides proposent un sommaire, une recherche sans distinction d’accents et une impression A4 avec économie d’encre. Les adaptations de campagne sont précisées dans les aides et l’annexe Dice Forge. L’ancien lien `livret_joueurV2.html` redirige vers le livret principal.

## Développement et maintenance

### Organisation du dépôt

```text
Dice-Forge/
├── index.html, pj.html          # Lanceur, création et fiche personnage
├── inventory-sheet.html        # Inventaire du personnage
├── suivi-mj.html                # Suivi du groupe et carnet MJ
├── obs*.html                    # Sources navigateur pour OBS
├── js/                         # Modules JavaScript de l’application
├── data/alchimie.md             # Copie du référentiel d’alchimie
├── scripts/                    # Validation, tests et synchronisation des règles
├── supabase-*.sql               # Socle historique Supabase et autorisations
├── supabase-config.js           # Configuration cliente et choix d’environnement
├── migrations/character-v2/     # Schéma v2, API et migrations de campagne
├── Roll20/Webtracker/           # Serveur Flask et outils locaux du MJ
├── DiceForge.bat                # Lanceur Windows du compagnon
└── DiceForge_Stop.bat           # Arrêt du compagnon
```

Le site utilise **HTML, CSS et JavaScript natifs**, avec Three.js pour la 3D et le client Supabase pour les services en ligne. Il n’a pas d’étape de compilation npm. Le compagnon utilise Flask et Flask-SocketIO ; ses dépendances sont déclarées dans `Roll20/Webtracker/requirements.txt`.

Pour lancer manuellement le compagnon depuis la racine :

```powershell
python -m pip install -r Roll20/Webtracker/requirements.txt
python Roll20/Webtracker/run.py
```

Pour la prévisualisation du site et du relais verbal, utilisez `python scripts/serve_local.py`. Servez les pages en HTTP pour charger les modules JavaScript.

### Supabase et comptes joueurs

La version actuelle active **`characterV2: true`** dans `supabase-config.js`. Elle dépend du schéma v2, de ses fonctions RPC et de leur activation côté serveur, en plus de Supabase Auth, des salons et des jets. Les seuls scripts `supabase-*.sql` à la racine ne suffisent pas à reproduire cette installation.

Pour administrer une instance :

- renseignez l’URL du projet et sa clé cliente `anon` dans `supabase-config.js` ; cette clé est visible dans le navigateur, tandis que `service_role` doit rester côté serveur ;
- créez les comptes dans **Supabase → Authentication → Users**, avec une adresse confirmée au format `nom.du.joueur@diceforge.app` ; le nom est normalisé en minuscules, sans accents, et les séparateurs deviennent des points ;
- désactivez les inscriptions publiques si seuls les comptes préparés par l’administrateur doivent accéder à la table ;
- dans le modèle v2, les comptes autorisés à créer des campagnes sont enregistrés par leur identifiant Auth dans la table privée `diceforge_v2.mj_users` ; un nom de joueur « MJ » ne suffit pas à accorder ce rôle.

La préparation des environnements et les migrations sont documentées dans :

| Document | Rôle |
| --- | --- |
| [Migrations personnages v2](migrations/character-v2/README.md) | Modèle de données, ordre des migrations, contrôles et retour arrière |
| [Base de test](BASE_TEST.md) | Accès à la recette et préparation d’un projet Supabase neuf réservé aux tests |
| [Mise en production](MISE_EN_PRODUCTION.md) | Livraison de référence, migrations appliquées et restauration |
| [Cahier de test](CAHIER_DE_TEST.md) | Scénarios de recette fonctionnelle |
| [Évolutions](EVOLUTIONS.md) | Historique des changements du projet |

Ces documents conservent aussi des étapes de préparation historiques ; leur statut est précisé en introduction. Le générateur `scripts/build_supabase_test.py` prépare une **base de recette vide**, avec des comptes synthétiques. Ses fichiers SQL et identifiants doivent être conservés hors du dépôt.

### Vérifications

Avec Python 3 et Node.js disponibles, depuis la racine :

```powershell
python scripts/validate_project.py
python -B -m unittest discover -s Roll20/Webtracker/tests -v
```

La validation contrôle les fichiers publics, la syntaxe JavaScript et la cohérence du référentiel d’alchimie. Le workflow [Qualité](.github/workflows/quality.yml) exécute également les tests métier JavaScript, les scénarios SQL sur PostgreSQL isolé et les tests de reprise des personnages.

### Mettre à jour les règles d’alchimie

Le référentiel provient de la note Obsidian `50 - OUTILS/52 - Regles/alchimie.md`. Pour importer une nouvelle version :

```powershell
python scripts/sync_alchemy_rules.py --source "chemin/vers/alchimie.md"
```

Le script met à jour `data/alchimie.md`, la section alchimie de `livret_reference.html` et le catalogue `js/alchemy-potions.js`. Modifiez le référentiel puis régénérez ces sorties ensemble. Sans `--source`, le script utilise la copie du dépôt.

## Dépannage

| Symptôme | Vérification |
| --- | --- |
| Connexion refusée | Vérifiez le compte créé par l’administrateur, le nom normalisé, le mot de passe et la configuration Supabase. |
| Salon introuvable | Vérifiez le code et l’environnement sélectionné : production et recette ont des salons distincts. |
| Une fiche ou un inventaire semble absent | Vérifiez le compte, la campagne et le PJ sélectionné, puis rechargez les données en ligne. |
| Une sauvegarde est bloquée | Lisez le message : budget invalide, création verrouillée, PJ indisponible ou conflit de révision demandent des corrections différentes. |
| Une fonction Supabase est introuvable | Vérifiez les migrations v2 de l’instance et le cache de schéma PostgREST avec l’administrateur. |
| Le cockpit ne répond pas | Vérifiez Python, les messages de démarrage et la disponibilité du port 5000. |
| L’import Obsidian ne trouve rien | Vérifiez `DICE_FORGE_VAULT` et les dossiers de fiches dans le coffre. |
| Les dés 3D ou le son sont absents | Vérifiez WebGL, l’accès aux CDN et les réglages du menu ; cliquez dans la page pour autoriser le son. |
| OBS ne montre pas les jets | Vérifiez le code du salon, la source Navigateur et le flux Supabase Realtime `obs_rolls`. |
| La joute verbale reste vide dans OBS | Ouvrez le jeu et l’overlay sur le même serveur local, avec le même code de salon. Un tirage depuis GitHub Pages seul ne l’alimente pas. |
| Le PDF n’inclut pas l’inventaire | Chargez l’onglet Inventaire avant de préparer à nouveau le PDF. |

## Crédits

Projet personnel destiné aux parties BRP-ORC et aux besoins de la table.

Les icônes de dés provenant de [Game-icons.net](https://game-icons.net/) sont distribuées sous licence [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Cette mention concerne ces ressources graphiques.
