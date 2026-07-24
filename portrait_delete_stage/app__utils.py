import os
import json
import time
from app.models import Participant

# --- Constantes pour la gestion des fichiers ---

# Chemin vers le dossier 'data' qui stocke toutes les données JSON de l'application.
# os.path.dirname(os.path.abspath(__file__)) donne le chemin du dossier 'app'.
# '..' remonte au dossier parent (la racine du projet).
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')
os.makedirs(DATA_DIR, exist_ok=True) # Crée le dossier 'data' s'il n'existe pas.

# Chemin complet vers le fichier JSON stockant les informations des joueurs.
PLAYERS_FILE = os.path.join(DATA_DIR, 'players.json')

# Chemin vers le dossier où les rencontres (groupes de PNJ) sont sauvegardées.
ENCOUNTERS_DIR = os.path.join(DATA_DIR, 'encounters')
os.makedirs(ENCOUNTERS_DIR, exist_ok=True) # Crée le dossier 'encounters' s'il n'existe pas.

# --- Fonctions de gestion des données (Sauvegarde et Chargement) ---

def save_players(initiative_data):
    """
    Sauvegarde les participants de type 'joueur' dans le fichier players.json.
    
    Args:
        initiative_data (list): La liste complète des participants de la rencontre actuelle.
    
    Returns:
        bool: True si la sauvegarde a réussi, False sinon.
    """
    try:
        players = [p.to_dict() for p in initiative_data if p.role == 'player']
        with open(PLAYERS_FILE, 'w', encoding='utf-8') as f:
            json.dump(players, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f"[ERREUR] Impossible de sauvegarder les joueurs: {e}")
        return False

def load_players(initiative_data):
    """
    Charge les joueurs depuis le fichier players.json et les ajoute à la liste d'initiative.
    
    Args:
        initiative_data (list): La liste actuelle des participants.

    Returns:
        tuple: Un tuple contenant la liste d'initiative mise à jour et un booléen indiquant si le chargement a réussi.
    """
    if os.path.exists(PLAYERS_FILE):
        with open(PLAYERS_FILE, 'r', encoding='utf-8') as f:
            players_data = json.load(f)
            # Conserver les non-joueurs et y ajouter les joueurs chargés du fichier.
            initiative_data = [p for p in initiative_data if p.role != 'player']
            initiative_data.extend([Participant.from_dict(p_data) for p_data in players_data])
            return initiative_data, True
    return initiative_data, False

def save_encounter(name, initiative_data):
    """
    Sauvegarde une rencontre (monstres et alliés PNJ) dans un fichier JSON dédié.
    
    Args:
        name (str): Le nom de la rencontre, utilisé pour le nom du fichier.
        initiative_data (list): La liste des participants de la rencontre.

    Returns:
        str|None: Le nom du fichier où la rencontre a été sauvegardée, ou None en cas d'erreur.
    """
    try:
        encounter = {
            'name': name,
            'monsters': [p.to_dict() for p in initiative_data if p.role == 'monster'],
            'allies': [p.to_dict() for p in initiative_data if p.role == 'ally'],
            'date_created': time.strftime('%Y-%m-%d %H:%M:%S')
        }
        filename = os.path.join(ENCOUNTERS_DIR, f"{name.replace(' ', '_')}.json")
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(encounter, f, ensure_ascii=False, indent=2)
        return filename
    except Exception as e:
        print(f"[ERREUR] Impossible de sauvegarder la rencontre '{name}': {e}")
        return None

def load_encounter(filename, initiative_data):
    """
    Charge une rencontre depuis un fichier JSON et ajoute ses PNJ à la liste d'initiative.
    
    Args:
        filename (str): Le nom du fichier de la rencontre à charger.
        initiative_data (list): La liste actuelle des participants.

    Returns:
        tuple: Un tuple contenant la liste d'initiative mise à jour et un booléen indiquant le succès.
    """
    if os.path.exists(filename):
        with open(filename, 'r', encoding='utf-8') as f:
            encounter = json.load(f)
            monsters = [Participant.from_dict(m) for m in encounter.get('monsters', [])]
            allies = [Participant.from_dict(a) for a in encounter.get('allies', [])]
            
            initiative_data.extend(monsters)
            initiative_data.extend(allies)
            return initiative_data, True
    return initiative_data, False

def list_encounters():
    """
    Liste toutes les rencontres sauvegardées dans le dossier 'encounters'.
    
    Returns:
        list: Une liste de dictionnaires, chaque dictionnaire représentant une rencontre
              avec ses métadonnées (nom, nom de fichier, date, nombre de PNJ).
    """
    encounters = []
    if not os.path.exists(ENCOUNTERS_DIR):
        return encounters
    for filename in os.listdir(ENCOUNTERS_DIR):
        if filename.endswith('.json'):
            file_path = os.path.join(ENCOUNTERS_DIR, filename)
            with open(file_path, 'r', encoding='utf-8') as f:
                try:
                    encounter = json.load(f)
                    encounters.append({
                        'name': encounter.get('name', 'Sans nom'),
                        'filename': filename,
                        'date_created': encounter.get('date_created', ''),
                        'monster_count': len(encounter.get('monsters', [])),
                        'ally_count': len(encounter.get('allies', []))
                    })
                except json.JSONDecodeError:
                    print(f"Erreur de décodage JSON dans le fichier: {filename}")
    return encounters
