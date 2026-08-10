# -*- coding: utf-8 -*-
"""
battlemap.py

Module de la Battle Map VTT intégré au serveur Flask du Webtracker.

Auparavant, la Battle Map était une application séparée (aiohttp + python-socketio)
tournant sur les ports 8000/9000 et se connectant à l'API du Webtracker via HTTP.
Ce module fusionne cette fonctionnalité directement dans le serveur Flask-SocketIO
unique du Webtracker (port 5000), supprimant ainsi le besoin de plusieurs serveurs
et des communications inter-applications (CORS / double port).

Responsabilités :
1.  Maintenir l'état partagé de la carte de bataille et des tokens.
2.  Synchroniser en temps réel cet état entre tous les clients via Socket.IO.
3.  Persister la carte et les tokens sur disque (dossier ``data/``).
4.  Servir les pages de la Battle Map (vue MJ et vue Observateur) ainsi que les
    images de cartes et de portraits.
"""

import base64
import json
import os
import threading
import time
import uuid

from flask import jsonify, render_template, request, send_from_directory
from flask_socketio import emit

from app import app, socketio


# --- Chemins et dossiers ---

# Racine du package 'app'.
_APP_DIR = os.path.dirname(os.path.abspath(__file__))

# Dossier 'data' du projet (au même niveau que 'app'), partagé avec le tracker.
DATA_DIR = os.path.join(_APP_DIR, '..', 'data')

# Les images de cartes et les portraits sont servis depuis le dossier static existant
# du Webtracker, ce qui permet de réutiliser les portraits déjà gérés par le tracker.
MAPS_DIR = os.path.join(app.static_folder, 'maps')
PORTRAITS_DIR = os.path.join(app.static_folder, 'portraits')

# Fichiers de persistance de la Battle Map.
MAP_SAVE_FILE = os.path.join(DATA_DIR, 'battlemap_map.json')
TOKENS_SAVE_FILE = os.path.join(DATA_DIR, 'battlemap_tokens.json')

MAX_MAP_BYTES = 50 * 1024 * 1024

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(MAPS_DIR, exist_ok=True)
os.makedirs(PORTRAITS_DIR, exist_ok=True)


# --- État partagé ---

# Dictionnaire id->token pour un accès O(1), plus la carte courante.
shared_state = {
    'tokens': {},
    'map': None,
}


def tokens_list():
    """Retourne la liste des tokens (pour sérialisation JSON et émission aux clients)."""
    return list(shared_state['tokens'].values())


def find_token(token_id):
    """Recherche un token par son ID en O(1)."""
    return shared_state['tokens'].get(token_id)


# --- Persistance ---

def save_tokens():
    """Sauvegarde l'état de tous les tokens dans un fichier JSON."""
    try:
        tokens = tokens_list()
        with open(TOKENS_SAVE_FILE, 'w', encoding='utf-8') as f:
            json.dump({'tokens': tokens}, f, indent=4)
        return True
    except Exception as exc:
        print(f"[BATTLEMAP] Erreur de sauvegarde des tokens : {exc}")
        return False


def load_saved_tokens():
    """Charge les tokens sauvegardés depuis le fichier JSON (dict id->token)."""
    try:
        if os.path.exists(TOKENS_SAVE_FILE):
            with open(TOKENS_SAVE_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
            tokens_dict = {}
            for token in data.get('tokens', []):
                tid = token.get('id')
                if tid:
                    tokens_dict[tid] = token
            print(f"[BATTLEMAP] {len(tokens_dict)} tokens chargés depuis la sauvegarde.")
            return tokens_dict
    except json.JSONDecodeError:
        print(f"[BATTLEMAP] Fichier de tokens corrompu : {TOKENS_SAVE_FILE}")
    except Exception as exc:
        print(f"[BATTLEMAP] Erreur de chargement des tokens : {exc}")
    return {}


def save_map(map_url):
    """Sauvegarde l'URL de la carte courante dans un fichier JSON."""
    try:
        with open(MAP_SAVE_FILE, 'w', encoding='utf-8') as f:
            json.dump({'map': map_url}, f, indent=4)
        return True
    except Exception as exc:
        print(f"[BATTLEMAP] Erreur de sauvegarde de la carte : {exc}")
        return False


def load_saved_map():
    """Charge l'URL de la dernière carte sauvegardée."""
    try:
        if os.path.exists(MAP_SAVE_FILE):
            with open(MAP_SAVE_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
            map_url = data.get('map')
            if map_url and map_url.startswith('/maps/'):
                filename = os.path.basename(map_url.split('?', 1)[0])
                if os.path.isfile(os.path.join(MAPS_DIR, filename)):
                    return f'/maps/{filename}'
                print(f"[BATTLEMAP] Carte sauvegardée introuvable : {filename}")
                return None
            return map_url
    except json.JSONDecodeError:
        print(f"[BATTLEMAP] Fichier de carte corrompu : {MAP_SAVE_FILE}")
    except Exception as exc:
        print(f"[BATTLEMAP] Erreur de chargement de la carte : {exc}")
    return None


def load_state():
    """Charge l'état complet de la Battle Map (carte + tokens) au démarrage."""
    shared_state['map'] = load_saved_map()
    shared_state['tokens'] = load_saved_tokens()


# --- Sauvegarde des tokens "débouncée" ---
# Évite des écritures disque excessives lors des déplacements rapides de tokens.
# Le minuteur utilise directement les threads natifs de Python.

_save_timer = None
_save_lock = threading.Lock()


def _schedule_save_tokens(delay=2.0):
    """Programme une sauvegarde des tokens après ``delay`` secondes (annule la précédente)."""
    global _save_timer
    with _save_lock:
        if _save_timer is not None:
            _save_timer.cancel()
        _save_timer = threading.Timer(delay, save_tokens)
        _save_timer.daemon = True
        _save_timer.start()


# --- Traitement des images de carte ---

def _detect_image_extension(image_bytes):
    """Détecte les formats raster autorisés à partir de leur signature binaire."""
    if image_bytes.startswith(b'\x89PNG\r\n\x1a\n'):
        return 'png'
    if image_bytes.startswith(b'\xff\xd8\xff'):
        return 'jpeg'
    if image_bytes.startswith((b'GIF87a', b'GIF89a')):
        return 'gif'
    if len(image_bytes) >= 12 and image_bytes[:4] == b'RIFF' and image_bytes[8:12] == b'WEBP':
        return 'webp'
    return None


def _save_map_bytes(image_bytes):
    """Valide et sauvegarde une carte de façon atomique, sans perdre l'ancienne."""
    if not image_bytes:
        return None, 'Le fichier est vide.'
    if len(image_bytes) > MAX_MAP_BYTES:
        return None, 'La carte dépasse la limite de 50 Mo.'
    extension = _detect_image_extension(image_bytes)
    if not extension:
        return None, 'Format non reconnu. Utilisez PNG, JPEG, GIF ou WebP.'

    new_map_filename = f'current_map.{extension}'
    new_map_path = os.path.join(MAPS_DIR, new_map_filename)
    temporary_path = os.path.join(MAPS_DIR, f'.map-upload-{uuid.uuid4().hex}.tmp')
    try:
        with open(temporary_path, 'wb') as file:
            file.write(image_bytes)
            file.flush()
            os.fsync(file.fileno())
        os.replace(temporary_path, new_map_path)

        # L'ancienne carte n'est supprimée qu'après la réussite de la nouvelle écriture.
        for old_file in os.listdir(MAPS_DIR):
            if old_file.startswith('current_map.') and old_file != new_map_filename:
                try:
                    os.remove(os.path.join(MAPS_DIR, old_file))
                except OSError as error:
                    print(f"[BATTLEMAP] Impossible de supprimer {old_file} : {error}")
        return f'/maps/{new_map_filename}', None
    except OSError as error:
        print(f"[BATTLEMAP] Erreur d'écriture de la carte : {error}")
        return None, "Impossible d'enregistrer la carte."
    finally:
        if os.path.exists(temporary_path):
            try:
                os.remove(temporary_path)
            except OSError:
                pass

def extract_and_save_map_image(map_data_url):
    """
    Extrait une image encodée en Base64 (data URL) et la sauvegarde sur disque.

    Returns:
        str | None: Le chemin relatif (/maps/...) de l'image sauvegardée, ou None.
    """
    try:
        if not map_data_url or not map_data_url.startswith('data:image/'):
            return None

        _, encoded = map_data_url.split(',', 1)
        image_bytes = base64.b64decode(encoded, validate=True)
        relative_url, error = _save_map_bytes(image_bytes)
        if error:
            print(f"[BATTLEMAP] Import Base64 refusé : {error}")
            return None
        print(f"[BATTLEMAP] Image de carte sauvegardée : {relative_url}")
        return relative_url
    except Exception as exc:
        print(f"[BATTLEMAP] Erreur d'extraction de l'image : {exc}")
        return None


def _store_map(map_data):
    """
    Met à jour l'état de la carte à partir des données reçues (data URL ou chemin).

    Returns:
        str | None: Le chemin relatif de la carte à diffuser, ou None en cas d'échec.
    """
    if not map_data:
        return None

    if map_data.startswith('data:image/'):
        relative_url = extract_and_save_map_image(map_data)
        if not relative_url:
            return None
    else:
        relative_url = map_data

    shared_state['map'] = relative_url
    save_map(relative_url)
    return relative_url


# --- Routes HTTP (pages et ressources) ---

@app.route('/battlemap')
def battlemap_view():
    """Vue principale de la Battle Map (Maître de Jeu)."""
    return render_template('battlemap.html')


@app.route('/obs')
@app.route('/overlays/map')
def obs_view():
    """Vue Observateur de la Battle Map (affichage sans interaction)."""
    return render_template('obs.html')


@app.route('/maps/<path:filename>')
def serve_map(filename):
    """Sert les images de cartes depuis le dossier static/maps."""
    return send_from_directory(MAPS_DIR, filename)


@app.route('/api/battlemap/map', methods=['GET', 'POST'])
def battlemap_map_api():
    """Retourne la carte courante ou importe un fichier raster en multipart."""
    if request.method == 'GET':
        map_url = shared_state.get('map')
        if not map_url:
            return jsonify({'success': False, 'message': 'Aucune carte chargée.'}), 404
        filename = os.path.basename(map_url.split('?', 1)[0])
        if not os.path.isfile(os.path.join(MAPS_DIR, filename)):
            shared_state['map'] = None
            return jsonify({'success': False, 'message': 'Le fichier de carte est introuvable.'}), 404
        return jsonify({'success': True, 'map': f"/maps/{filename}?t={time.time_ns()}"})

    uploaded = request.files.get('map')
    if not uploaded:
        return jsonify({'success': False, 'message': 'Aucun fichier reçu.'}), 400
    image_bytes = uploaded.stream.read(MAX_MAP_BYTES + 1)
    relative_url, error = _save_map_bytes(image_bytes)
    if error:
        status = 413 if len(image_bytes) > MAX_MAP_BYTES else 400
        return jsonify({'success': False, 'message': error}), status

    shared_state['map'] = relative_url
    if not save_map(relative_url):
        return jsonify({'success': False, 'message': "La carte est enregistrée, mais son état n'a pas pu être sauvegardé."}), 500
    cache_busted_url = f'{relative_url}?t={time.time_ns()}'
    socketio.emit('map_changed', {'map': cache_busted_url})
    print(f"[BATTLEMAP] Carte importée par HTTP : {relative_url} ({len(image_bytes)} octets)")
    return jsonify({'success': True, 'map': cache_busted_url})


@app.route('/portraits/<path:filename>')
def serve_portrait(filename):
    """Sert les images de portraits depuis le dossier static/portraits."""
    return send_from_directory(PORTRAITS_DIR, filename)


# --- Gestionnaires d'événements Socket.IO ---

@socketio.on('request_initial_state')
def on_request_initial_state():
    """Envoie l'état initial (carte + tokens) au client demandeur uniquement."""
    map_url = shared_state['map']
    if map_url:
        map_url = f"{map_url}?t={int(time.time())}"
    emit('initial_state', {'tokens': tokens_list(), 'map': map_url})


@socketio.on('request_current_map')
def on_request_current_map():
    """Envoie la carte courante au client demandeur, ou signale l'absence de carte."""
    map_url = shared_state.get('map')
    if map_url:
        emit('map_changed', {'map': f"{map_url}?t={int(time.time())}"})
    else:
        emit('no_map_available', {})


@socketio.on('move_token')
def on_move_token(data):
    """Déplace un token et diffuse le mouvement aux autres clients."""
    token_id = data.get('id')
    token = find_token(token_id)

    if token:
        token['x'] = data.get('x')
        token['y'] = data.get('y')
        emit('token_moved', data, broadcast=True, include_self=False)
        _schedule_save_tokens()
    else:
        # Auto-récupération : le token est inconnu côté serveur (ex: après redémarrage).
        new_token = {
            'id': token_id,
            'x': data.get('x'),
            'y': data.get('y'),
            'size': data.get('size', 50),
            'color': data.get('color', 'blue'),
            'name': data.get('name', 'Token'),
            'portraitUrl': data.get('portraitUrl'),
        }
        shared_state['tokens'][token_id] = new_token
        emit('token_added', new_token, broadcast=True, include_self=False)
        emit('token_moved', data, broadcast=True, include_self=False)
        _schedule_save_tokens()


@socketio.on('add_token')
def on_add_token(data):
    """Ajoute un nouveau token (ou met à jour ses propriétés s'il existe déjà)."""
    if not data or not data.get('id'):
        return

    token_id = data.get('id')
    existing = find_token(token_id)

    if existing:
        existing.update(data)
        emit('token_updated', data, broadcast=True, include_self=False)
    else:
        shared_state['tokens'][token_id] = data
        emit('token_added', data, broadcast=True, include_self=False)
    _schedule_save_tokens()


@socketio.on('remove_token')
def on_remove_token(data):
    """Supprime un token et diffuse la suppression aux autres clients."""
    token_id = data.get('id')
    if shared_state['tokens'].pop(token_id, None):
        emit('token_removed', data, broadcast=True, include_self=False)
        _schedule_save_tokens()


@socketio.on('clear_all_tokens')
def on_clear_all_tokens():
    """Efface tous les tokens et notifie les autres clients."""
    shared_state['tokens'] = {}
    save_tokens()
    emit('all_tokens_cleared', {}, broadcast=True, include_self=False)


@socketio.on('change_map')
def on_change_map(data):
    """Change la carte courante et diffuse le changement à tous les clients."""
    relative_url = _store_map(data.get('map'))
    if relative_url:
        emit('map_changed', {'map': f"{relative_url}?t={int(time.time())}"}, broadcast=True)
