# Dice Forge - Refonte Audio MP3

Projet HTML jouable dans un navigateur, avec une refonte incluant des effets audio au format MP3.

## Lancer le projet en local

1. Télécharger ou cloner le projet.
2. Ouvrir le fichier `index.html` dans un navigateur moderne.
3. Cliquer dans la page si les sons ne se lancent pas automatiquement.

Les navigateurs bloquent souvent la lecture automatique des sons. Un clic utilisateur est généralement nécessaire avant de pouvoir jouer un fichier audio.

## Structure recommandée

```text
dice-forge/
├── index.html
├── audio/
│   ├── son-1.mp3
│   ├── son-2.mp3
│   └── son-3.mp3
└── README.md
```

Le fichier principal doit idéalement s'appeler `index.html`, car GitHub Pages le détecte automatiquement comme page d'accueil.

## Chemins audio

Les fichiers audio doivent utiliser des chemins relatifs :

```html
<audio src="audio/son-1.mp3"></audio>
```

Éviter les chemins locaux Windows, car ils ne fonctionneront pas une fois le projet publié :

```html
<audio src="D:/kitha/Téléchargements/son-1.mp3"></audio>
```

## Publier avec GitHub Pages

1. Créer un dépôt GitHub, par exemple `dice-forge`.
2. Ajouter `index.html`, le dossier `audio/` et ce `README.md`.
3. Aller dans `Settings` > `Pages`.
4. Dans `Build and deployment`, choisir `Deploy from a branch`.
5. Sélectionner la branche `main`.
6. Sélectionner le dossier `/root`.
7. Cliquer sur `Save`.

Après le déploiement, le site sera disponible à une adresse de ce type :

```text
https://TON-NOM-GITHUB.github.io/dice-forge/
```



## Problèmes fréquents

- Le son ne se lance pas : cliquer une fois dans la page avant de lancer l'audio.
- Un fichier MP3 ne charge pas : vérifier que le nom du fichier est exactement le même dans le code et dans le dossier `audio/`.
- Le site marche en local mais pas sur GitHub : vérifier que les chemins ne commencent pas par `D:/`, `C:/` ou `file:///`.
- GitHub Pages ne trouve pas la page : renommer le fichier HTML principal en `index.html`.

## Licence

Projet personnel. Ajouter une licence si le dépôt doit être partagé ou réutilisé publiquement.
