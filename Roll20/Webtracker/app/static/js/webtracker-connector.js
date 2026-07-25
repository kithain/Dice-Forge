// -*- coding: utf-8 -*-
/**
 * @file webtracker-connector.js
 * @description
 * Ce module JavaScript gère la connexion à une API Webtracker externe pour récupérer
 * les données des participants (joueurs, alliés, PNJ, monstres) et les synchroniser
 * automatiquement avec l'application Battle Map VTT en créant et gérant les tokens correspondants.
 * Il fournit un mécanisme de rafraîchissement périodique et une logique de gestion des erreurs
 * avec un mode de démonstration.
 */

/**
 * @class WebTrackerConnector
 * @description
 * Classe responsable de l'interface avec l'API Webtracker.
 * Elle se connecte à un endpoint d'API, récupère la liste des participants,
 * et utilise le TokenManager pour créer, mettre à jour ou supprimer les tokens
 * sur la carte en fonction des données reçues.
 */
class WebTrackerConnector {
    /**
     * @constructor
     * @param {TokenManager} tokenManager - Instance du TokenManager pour manipuler les tokens sur la carte.
     */
    constructor(tokenManager) {
        this.tokenManager = tokenManager;    // Gère la création et la suppression des tokens visuels.
        // Le Webtracker est désormais servi par le même serveur que la Battle Map :
        // on cible donc la même origine (même hôte + même port).
        this.webtrackerUrl = window.location.origin; // URL par défaut de l'API Webtracker.
        this.isConnected = false;            // État de la connexion à l'API.
        this.isConnecting = false;           // Flag pour éviter les tentatives de connexion multiples.
        this.participantsData = [];          // Cache les dernières données des participants reçues.
        this.statusDiv = document.getElementById('webtracker-status'); // Élément DOM pour afficher le statut de connexion.
        this.refreshInterval = null;         // ID de l'intervalle de rafraîchissement (fallback si WebSocket indisponible).
        this.webtrackerSocket = null;        // Instance Socket.IO vers le Webtracker pour les mises à jour temps réel.
    }

    /**
     * Initialise la connexion à l'API Webtracker.
     * Met à jour le statut de l'interface utilisateur, tente de récupérer les participants,
     * et met en place un intervalle de rafraîchissement en cas de succès.
     */
    async connect() {
        if (this.isConnecting) return; // Empêche des tentatives de connexion multiples simultanées.

        this.isConnecting = true;    // Définit le flag de connexion en cours.
        this.isConnected = false;    // Réinitialise l'état de connexion.
        this.statusDiv.textContent = 'Connexion...'; // Met à jour le texte du statut.
        this.statusDiv.className = 'connecting';   // Applique la classe CSS pour le statut "connexion".

        // Lit dynamiquement l'URL de l'API Webtracker depuis le champ de l'interface utilisateur.
        const urlField = document.getElementById('webtracker-url');
        if (urlField && urlField.value) {
            this.webtrackerUrl = urlField.value.trim(); // Met à jour l'URL à utiliser.
        }

        try {
            // Effectue une requête HTTP GET pour récupérer la liste des participants.
            const response = await fetch(`${this.webtrackerUrl}/api/participants`);
            if (!response.ok) { // Vérifie si la réponse HTTP est un succès (statut 2xx).
                throw new Error(`Erreur HTTP: ${response.status}`);
            }
            const participants = await response.json(); // Parse la réponse JSON.
            console.log('[WEBTRACKER] Participants chargés via API REST:', participants);

            this.isConnected = true;             // Marque la connexion comme réussie.
            this.statusDiv.textContent = 'Connecté (API)'; // Met à jour le statut.
            this.statusDiv.className = 'connected';     // Applique la classe CSS "connecté".

            this.processParticipants(participants); // Traite les données des participants.

            // Tente de se connecter au WebSocket du Webtracker pour des mises à jour temps réel.
            // Si ça échoue, fallback sur le polling REST toutes les 5 secondes.
            this.connectWebSocket();

        } catch (error) {
            console.error("[WEBTRACKER] Impossible de se connecter à l'API de Webtracker.", error);
            this.handleConnectionError(error.message); // Gère l'erreur de connexion.
        } finally {
            this.isConnecting = false; // Réinitialise le flag de connexion en cours.
        }
    }

    /**
     * Établit une connexion WebSocket vers le Webtracker pour recevoir les mises à jour
     * en temps réel via l'événement 'update_data' (déjà émis par Flask-SocketIO).
     * Si la connexion WebSocket échoue, bascule automatiquement sur le polling REST.
     */
    connectWebSocket() {
        // Arrête un éventuel polling de secours en cours.
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }

        // Le Webtracker et la Battle Map étant servis par le même serveur, on réutilise
        // la connexion Socket.IO principale de la battle map au lieu d'en ouvrir une seconde.
        const sharedSocket = window.syncSocket || null;

        if (sharedSocket) {
            this.webtrackerSocket = sharedSocket;
            this.usingSharedSocket = true;

            // Retire un éventuel ancien écouteur pour éviter les doublons (reconnexions).
            sharedSocket.off('update_data');

            // L'événement 'update_data' du serveur transporte désormais directement la liste
            // des participants : on l'utilise sans refaire de requête REST (sinon fallback fetch).
            sharedSocket.on('update_data', (data) => {
                console.log('[WEBTRACKER] Événement update_data reçu via le socket partagé.');
                if (data && Array.isArray(data.participants)) {
                    if (JSON.stringify(this.participantsData) !== JSON.stringify(data.participants)) {
                        this.processParticipants(data.participants);
                    }
                } else {
                    this.refreshData();
                }
            });

            if (sharedSocket.connected) {
                this.statusDiv.textContent = 'Connecté (WebSocket)';
                this.statusDiv.className = 'connected';
            }
            return;
        }

        // --- Fallback : aucune connexion partagée disponible ---
        // On ouvre une connexion dédiée (cas où le connecteur serait utilisé hors battle map).
        if (this.webtrackerSocket && !this.usingSharedSocket) {
            this.webtrackerSocket.disconnect();
        }
        this.webtrackerSocket = null;
        this.usingSharedSocket = false;

        try {
            if (typeof io === 'undefined') {
                console.warn('[WEBTRACKER] Bibliothèque Socket.IO non disponible, fallback sur polling.');
                this.startPollingFallback();
                return;
            }

            this.webtrackerSocket = io(this.webtrackerUrl, {
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionDelay: 2000,
                timeout: 5000
            });

            this.webtrackerSocket.on('connect', () => {
                console.log('[WEBTRACKER] WebSocket connecté au Webtracker (temps réel).');
                this.statusDiv.textContent = 'Connecté (WebSocket)';
                this.statusDiv.className = 'connected';
                if (this.refreshInterval) {
                    clearInterval(this.refreshInterval);
                    this.refreshInterval = null;
                }
            });

            this.webtrackerSocket.on('update_data', (data) => {
                if (data && Array.isArray(data.participants)) {
                    if (JSON.stringify(this.participantsData) !== JSON.stringify(data.participants)) {
                        this.processParticipants(data.participants);
                    }
                } else {
                    this.refreshData();
                }
            });

            this.webtrackerSocket.on('disconnect', () => {
                console.warn('[WEBTRACKER] WebSocket déconnecté, passage en mode polling.');
                this.statusDiv.textContent = 'Connecté (polling)';
                this.startPollingFallback();
            });

            this.webtrackerSocket.on('connect_error', (err) => {
                console.warn('[WEBTRACKER] Erreur WebSocket, fallback sur polling:', err.message);
                this.startPollingFallback();
            });

        } catch (error) {
            console.warn('[WEBTRACKER] Impossible d\'initialiser le WebSocket, fallback sur polling:', error);
            this.startPollingFallback();
        }
    }

    /**
     * Démarre le polling REST comme mécanisme de secours si le WebSocket n'est pas disponible.
     */
    startPollingFallback() {
        if (!this.refreshInterval) {
            this.refreshInterval = setInterval(() => this.refreshData(), 5000);
            console.log('[WEBTRACKER] Polling REST activé (toutes les 5s).');
        }
    }

    /**
     * Rafraîchit les données des participants depuis l'API REST Webtracker.
     * Appelé soit par le WebSocket (temps réel) soit par le polling (fallback).
     */
    async refreshData() {
        try {
            const response = await fetch(`${this.webtrackerUrl}/api/participants`);
            if (!response.ok) return;
            const participants = await response.json();

            // Compare les nouvelles données avec les données précédentes pour détecter les changements.
            if (JSON.stringify(this.participantsData) !== JSON.stringify(participants)) {
                console.log('[WEBTRACKER] Mise à jour des participants détectée.');
                this.processParticipants(participants);
            }
        } catch (error) {
            // Les erreurs de rafraîchissement sont ignorées pour ne pas être trop intrusives.
        }
    }

    /**
     * Traite la liste des participants reçue de l'API Webtracker.
     * Assigne des IDs stables, standardise les chemins de portraits et met à jour les tokens.
     * @param {Array<object>} participants - La liste brute des participants de l'API.
     */
    processParticipants(participants) {
        this.participantsData = participants.map(p => {
            // Assure que chaque participant a un ID valide pour le suivi.
            if (p.id === undefined || p.id === null || p.id === '') {
                // Génère un ID stable basé sur le nom et le rôle.
                // Cela garantit que le même participant aura toujours le même ID.
                const role = p.role || 'unknown';
                const name = p.name || 'unnamed';
                p.id = `gen_${role}_${name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')}`; // Nettoie le nom pour l'ID.
                console.log(`[WEBTRACKER] ID stable généré pour ${name}: ${p.id}`);
            }
            
            // Normalise le chemin du portrait pour qu'il soit servi par la route /portraits/.
            // Le Webtracker stocke un chemin relatif au dossier static/portraits
            // (ex: "Male/x.png", "PNJ/goblin.png" ou simplement "x.png"), éventuellement
            // déjà préfixé. On se contente donc d'ajouter le préfixe /portraits/ sans
            // supposer de sous-dossier par défaut (qui produisait des chemins erronés).
            if (p.portrait && !/^https?:\/\//i.test(p.portrait)) {
                // Retire tout préfixe existant (/static/portraits/ ou /portraits/) pour repartir du chemin relatif.
                const relative = p.portrait
                    .replace(/^\/?static\/portraits\//i, '')
                    .replace(/^\/?portraits\//i, '')
                    .replace(/^\/+/, '');
                p.portrait = `/portraits/${relative}`;
                console.log(`[WEBTRACKER] Chemin de portrait normalisé pour ${p.name}: ${p.portrait}`);
            }
            return p; // Retourne le participant modifié.
        });

        this.updateTokens(); // Met à jour les tokens sur la carte en fonction des participants traités.
    }



    /**
     * Met à jour les tokens sur la carte en fonction de la liste `participantsData` actuelle.
     * Supprime les tokens qui ne sont plus dans la liste et ajoute les nouveaux participants.
     */
    updateTokens() {
        const webtrackerParticipants = this.participantsData;
        if (!webtrackerParticipants || !webtrackerParticipants.length) {
            // Liste vide reçue : on ne supprime PAS les tokens existants pour éviter
            // une perte de données si Webtracker est temporairement indisponible ou en cours de redémarrage.
            console.warn('[WEBTRACKER] Liste de participants vide reçue — tokens existants conservés.');
            return;
        }

        // Récupère les IDs de tous les participants valides du Webtracker.
        const webtrackerIds = webtrackerParticipants.map(p => p && p.id ? p.id.toString() : null)
                                                    .filter(id => id !== null);

        // Récupère les IDs de tous les tokens actuellement affichés sur la carte.
        const existingTokenIds = this.tokenManager.tokens.map(token => token.id);

        // Met a jour les couleurs des tokens deja presents et les synchronise avec OBS.
        webtrackerParticipants.forEach(participant => {
            if (!participant || !participant.id) return;
            const id = participant.id.toString();
            if (document.getElementById(id)) {
                this.tokenManager.updateTokenAppearance(
                    id,
                    participant.token_color || '#D9534F',
                    participant.name || 'Sans nom',
                    participant.portrait || null,
                    participant.token_number || '?',
                    participant.hp_percent || 100
                );
            }
        });

        // 1. Supprime les tokens qui ne sont plus présents dans la liste du Webtracker.
        const tokensToRemove = existingTokenIds.filter(id => !webtrackerIds.includes(id));
        if (tokensToRemove.length > 0) {
            console.log('[WEBTRACKER] Suppression des participants absents du Webtracker:', tokensToRemove);
            tokensToRemove.forEach(tokenId => {
                this.tokenManager.removeToken(tokenId);
            });
        }

        // 2. Ajoute les nouveaux participants qui ne sont pas encore sur la carte.
        const newParticipants = webtrackerParticipants.filter(p => {
            return p && p.id && !document.getElementById(p.id.toString());
        });

        if (newParticipants.length > 0) {
            console.log(`[WEBTRACKER] Ajout de ${newParticipants.length} nouveaux participants depuis le Webtracker.`);
            
            // Sépare les nouveaux participants par rôle pour un positionnement groupé.
            const playerTokens = newParticipants.filter(p => p.role === 'player');
            const allyTokens = newParticipants.filter(p => p.role === 'ally');
            const monsterTokens = newParticipants.filter(p => p.role === 'monster');

            // Crée les tokens pour chaque groupe, en les positionnant séquentiellement.
            this.createTokensForGroup(playerTokens, 'player', 0);
            this.createTokensForGroup(allyTokens, 'ally', 1);
            this.createTokensForGroup(monsterTokens, 'monster', 2);
        }
    }

    /**
     * Crée des tokens pour un groupe de participants spécifié.
     * Gère le positionnement initial des tokens, en utilisant des positions personnalisées si disponibles.
     * @param {Array<object>} participants - La liste des participants du groupe.
     * @param {string} groupName - Le nom du groupe (ex: 'player', 'ally', 'monster').
     * @param {number} groupIndex - L'index du groupe, utilisé pour le décalage vertical.
     */
    createTokensForGroup(participants, groupName, groupIndex) {
        const tokenSize = 50; // Taille fixe des badges.
        const padding = 10;   // Espacement entre les tokens.
        const tokensPerRow = 10; // Nombre de tokens par ligne avant de passer à la suivante.
        // Calcule le décalage vertical pour chaque groupe, pour qu'ils ne se chevauchent pas.
        const yOffset = groupIndex * (tokenSize + padding + 40);

        participants.forEach((participant, index) => {
            if (!participant) return;
            
            // Assigne des valeurs par défaut si certaines propriétés sont manquantes.
            const name = participant.name || 'Sans nom';
            const id = participant.id ? participant.id.toString() : `gen_${groupName}_${index}`;
            
            // Détermine la position X et Y du token.
            // Priorise les positions personnalisées sauvegardées localement.
            let x, y;
            if (window.customTokenPositions && window.customTokenPositions[id]) {
                console.log(`[WEBTRACKER] Utilisation de la position personnalisée pour ${name}: ${JSON.stringify(window.customTokenPositions[id])}`);
                x = window.customTokenPositions[id].x;
                y = window.customTokenPositions[id].y;
            } else {
                // Si pas de position personnalisée, calcule une position basée sur la grille.
                x = (index % tokensPerRow) * (tokenSize + padding);
                y = yOffset + Math.floor(index / tokensPerRow) * (tokenSize + padding);
            }
            
            // Assigne une couleur de token basée sur le rôle.
            const color = participant.token_color || '#D9534F';
            const marker = participant.token_number || '?';

            // Crée le token via le TokenManager. Le flag `window.receivingServerUpdate`
            // est géré par TokenManager.createToken pour éviter les boucles de synchronisation.
            this.tokenManager.createToken(x, y, tokenSize, color, name, participant.portrait || null, id, marker);
        });
    }

    /**
     * Gère une erreur de connexion à l'API Webtracker.
     * Met à jour le statut de l'interface utilisateur et bascule en mode démo.
     * @param {string} message - Le message d'erreur à afficher.
     */
    handleConnectionError(message) {
        this.isConnecting = false;
        this.isConnected = false;
        this.statusDiv.textContent = `Erreur: ${message}`;
        this.statusDiv.className = 'error'; // Utilise la classe CSS 'error'.
        this.showDemoMode(); // Active le mode démo en cas d'erreur de connexion.
    }

    /**
     * Active le mode de démonstration, fournissant des données de participants factices
     * pour permettre à l'application de fonctionner sans connexion au Webtracker.
     */
    showDemoMode() {
        this.isConnecting = false;
        this.isConnected = false;
        this.statusDiv.textContent = 'Mode Démo actif'; // Met à jour le texte du statut.
        this.statusDiv.className = 'demo';            // Applique la classe CSS 'demo'.
        
        // Données de démonstration.
        const demoData = [
            { id: 'demo-hero1', name: 'Héros 1', role: 'player', portrait: '/portraits/Players/hero1.png' },
            { id: 'demo-ally1', name: 'Allié 1', role: 'ally', portrait: '/portraits/Allies/ally1.png' },
            { id: 'demo-goblin', name: 'Gobelin', role: 'monster', portrait: '/portraits/PNJ/goblin.png' }
        ];
        
        // Traite les données de démonstration pour créer les tokens.
        this.processParticipants(demoData);
    }
}

// Exporte la classe `WebTrackerConnector` pour qu'elle soit accessible globalement
// ou par d'autres modules JavaScript qui l'importent.
window.WebTrackerConnector = WebTrackerConnector;
