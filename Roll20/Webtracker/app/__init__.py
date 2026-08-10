# --- Initialisation de l'application Flask ---

import os
from flask import Flask
from flask_socketio import SocketIO

# Crée une instance de l'application Flask.
# '__name__' est une variable spéciale en Python qui obtient le nom du module actuel.
# Flask l'utilise pour savoir où trouver les ressources comme les templates et les fichiers statiques.
app = Flask(__name__)

# Définit une clé secrète pour l'application. C'est nécessaire pour sécuriser les sessions
# et autres fonctionnalités de Flask liées à la sécurité. 'os.urandom(24)' génère une clé
# aléatoire et sécurisée à chaque démarrage de l'application.
app.secret_key = os.urandom(24)

# Initialise l'extension SocketIO avec les threads natifs de Python.
# Ce mode évite Eventlet et son monkey-patching tout en conservant les WebSockets.
# Les écrans sont maintenant servis depuis une origine locale unique.
socketio = SocketIO(app, async_mode='threading')

# --- Context processor : expose le mapping des icônes de statut à tous les templates ---
@app.context_processor
def inject_status_icon_map():
    from app import models
    return dict(
        status_icon_map=models.STATUS_ICON_MAP,
        get_status_icon_name=models.get_status_icon_name,
    )

# --- Importation des modules de l'application ---

# On importe le module 'routes' APRÈS avoir créé et configuré 'app' et 'socketio'.
# Cela évite les problèmes d'importation circulaire, car le module 'routes' a besoin
# d'importer 'app' pour définir les routes.
from app import routes

# Importe le module de la Battle Map VTT (fusionnée dans ce serveur Flask unique).
# Cet import enregistre ses routes HTTP et ses gestionnaires d'événements Socket.IO.
from app import battlemap

# NOTE: La route ci-dessous est également définie dans 'app/routes.py'.
# Avoir deux gestionnaires pour la même route peut entraîner un comportement inattendu.
# Celle-ci devrait probablement être supprimée pour centraliser toutes les routes
# dans le fichier 'routes.py'.
#
# # API endpoint pour récupérer les participants
# @app.route('/api/participants', methods=['GET'])
# def get_participants():
#     from app import models
#     participants_list = [p.to_dict() for p in models.initiative_data]
#     return jsonify({'participants': participants_list})
