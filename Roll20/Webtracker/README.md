# Compagnon MJ Dice Forge

Le compagnon regroupe dans un seul serveur local le cockpit MJ, Dice Forge, le tracker de combat, la Battle Map, l'import Obsidian et les vues OBS.

## Accès

- cockpit : `http://127.0.0.1:5000/`
- Dice Forge : `http://127.0.0.1:5000/dice/index.html`
- tracker : `http://127.0.0.1:5000/tracker`
- Battle Map : `http://127.0.0.1:5000/battlemap`
- historique OBS : `http://127.0.0.1:5000/overlays/rolls?room=ABCD`
- dés OBS : `http://127.0.0.1:5000/overlays/dice?room=ABCD`
- carte OBS : `http://127.0.0.1:5000/overlays/map`
- portrait actif : `http://127.0.0.1:5000/portrait_view`

Le tracker sert d'aide visuelle pendant les combats DICE-FORGE. Il ne résout
aucune règle : les jets, dégâts, armures, blessures et soins sont entièrement
calculés dans DICE-FORGE.

## Tracker de combat

L'écran principal suit uniquement :

- l'ordre d'attaque par DEX décroissante ;
- le round et le combattant actif ;
- les PV actuels et maximums ;
- les états, avec une durée facultative en rounds.

Le bouton **Attaquant suivant** passe au combattant actif suivant. Après le
dernier combattant capable d'agir, le tracker commence automatiquement un
nouveau round. Les états `Unconscious`, `Dying`, `Dead` et `Incapacitated`
retirent le participant de l'ordre d'attaque tant qu'ils sont présents.

Les boutons `− PV` et `+ PV` appliquent directement la valeur déjà calculée
dans DICE-FORGE. Aucune armure, blessure ou conséquence automatique n'est
appliquée par le tracker.

## Import depuis Obsidian

La section **Importer depuis Obsidian** lit directement les fiches Markdown des
dossiers `PJ`, `PNJ` et `Bestiaire` du coffre :

`D:\kitha\Documents\JDR - BRP\Obsidian_Ombre_de_la_Spirale`

La recherche affiche le nom, la DEX et les PV détectés. Avant l'ajout, le rôle
peut être choisi (`PJ`, `Allié` ou `Monstre`) ainsi qu'une quantité de 1 à 20.
Les portraits déjà présents dans le tracker sont réutilisés ; sinon, l'image
Obsidian de la fiche est copiée dans `app/static/portraits/Imported`.

Le coffre peut être déplacé en définissant la variable d'environnement
`DICE_FORGE_VAULT` avant le lancement du serveur.

Les anciennes sauvegardes DICE-FORGE-BRP et les rencontres existantes restent
lisibles. Les données de résolution historiques sont simplement ignorées.

Les combats sauvegardés peuvent être chargés ou supprimés depuis la section
**Sauvegardes et rencontres**. La suppression demande une confirmation et ne
modifie pas le combat actuellement chargé.

La vue **Portrait actif** limite l'image à 310 px sur son côté le plus grand en
CSS. Le fichier portrait d'origine n'est jamais redimensionné ni réécrit.

## Battle Map

La Battle Map et sa vue OBS restent intégrées au même serveur Flask :

- cockpit MJ : `http://127.0.0.1:5000/`
- tracker MJ : `http://127.0.0.1:5000/tracker`
- vue joueurs : `http://127.0.0.1:5000/view`
- Battle Map : `http://127.0.0.1:5000/battlemap`
- vue OBS de la carte : `http://127.0.0.1:5000/overlays/map`

L'import des cartes utilise une requête HTTP multipart afin d'accepter les
images jusqu'à 50 Mo sans dépendre de la limite des messages Socket.IO. Les
formats PNG, JPEG, GIF et WebP sont validés par leur signature. La nouvelle
carte est écrite atomiquement : l'ancienne n'est supprimée qu'après réussite.

La barre d'outils de la Battle Map affiche les dimensions naturelles exactes de
la carte en pixels. La route `/obs` affiche la carte et les tokens synchronisés,
sans menu ni contrôles, afin de créer une source navigateur OBS aux mêmes
dimensions.

Le bouton **Générer une carte** ouvre un atelier procédural intégré. Il propose
quatre environnements (donjon, forêt, caverne et ruines), des dimensions en cases,
une taille de case, une densité d'éléments et une graine reproductible. L'aperçu
peut être téléchargé en PNG ou envoyé directement à la Battle Map ; dans ce dernier
cas, la carte est persistée et immédiatement synchronisée avec la vue OBS.

## Lancement

```powershell
python run.py
```

Les dépendances manquantes sont vérifiées au démarrage à partir de
`requirements.txt`.

Flask-SocketIO utilise le mode `threading` et `simple-websocket`. Eventlet et son
`monkey_patch()` ne sont pas utilisés.
