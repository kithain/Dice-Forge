# Web Combat Tracker + Battle Map

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

## Battle Map

La Battle Map et sa vue OBS restent intégrées au même serveur Flask :

- tracker MJ : `http://127.0.0.1:5000/`
- vue joueurs : `http://127.0.0.1:5000/view`
- Battle Map : `http://127.0.0.1:5000/battlemap`
- vue OBS de la carte : `http://127.0.0.1:5000/obs`

## Lancement

```powershell
python run.py
```

Les dépendances manquantes sont vérifiées au démarrage à partir de
`requirements.txt`.
