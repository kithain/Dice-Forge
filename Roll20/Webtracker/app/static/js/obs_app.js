// -*- coding: utf-8 -*-
/**
 * @file obs_app.js
 * @description
 * Ce script JavaScript est le cœur de l'application Battle Map VTT côté client (vue Observateur - OBS).
 * Il est responsable de l'affichage en temps réel des cartes de bataille et des tokens
 * sur un élément `<canvas>`, en se synchronisant avec le serveur via Socket.IO.
 *
 * Fonctionnalités principales:
 * - Rendu dynamique de la carte et des tokens sur un canvas HTML5.
 * - Synchronisation en temps réel des changements de carte et de la position des tokens.
 * - Gestion du redimensionnement de la fenêtre pour adapter le canvas.
 * - Chargement intelligent des images de carte et des portraits de token, incluant un système de cache
 *   et des logiques de fallback pour les portraits.
 */

document.addEventListener('DOMContentLoaded', () => {
    // Références à l'élément canvas et à son contexte de dessin 2D.
    const canvas = document.getElementById('map-canvas');
    const ctx = canvas.getContext('2d');

    // Détection intelligente de l'adresse du serveur de synchronisation.
    // Utilise le hostname actuel pour construire l'URL du serveur.
    // Servie par le même serveur Flask que le Webtracker : on utilise la même origine.
    const SYNC_SERVER_URL = window.location.origin;

    // État local de l'application OBS, contenant la carte et la liste des tokens.
    let state = {
        map: null,    // L'objet Image de la carte actuellement affichée.
        tokens: [],   // Liste des objets token, chacun avec ses propriétés et son image de portrait chargée.
    };

    // Cache pour les images de portrait afin d'éviter de recharger les mêmes images plusieurs fois.
    const portraitCache = {};

    function getContrastColor(color) {
    const value = String(color || '#FFFFFF').replace('#', '');
    const red = parseInt(value.slice(0, 2), 16);
    const green = parseInt(value.slice(2, 4), 16);
    const blue = parseInt(value.slice(4, 6), 16);
    const yiq = (red * 299 + green * 587 + blue * 114) / 1000;
    return yiq >= 130 ? '#111111' : '#FFFFFF';
}

    // --- Système de rendu batché via requestAnimationFrame ---
    // Évite les redessinages multiples dans le même frame lorsque plusieurs événements
    // Socket.IO arrivent simultanément (ex: 5 tokens bougent en même temps).
    let drawPending = false;

    /**
     * Programme un redessin au prochain frame du navigateur.
     * Si un redessin est déjà programmé, l'appel est ignoré (coalescence).
     */
    function scheduleDraw() {
        if (!drawPending) {
            drawPending = true;
            requestAnimationFrame(() => {
                draw();
                drawPending = false;
            });
        }
    }

    // =================================================================================
    // Fonctions de Rendu et Utilitaires
    // =================================================================================


    /**
     * Redimensionne le canvas pour qu'il corresponde à la taille actuelle de la fenêtre du navigateur.
     * Appelle `draw()` pour redessiner le contenu après le redimensionnement.
     */
    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        draw(); // Redessine immédiatement (resize est déjà throttled par le navigateur).
    }

    /**
     * Fonction principale de dessin qui efface le canvas et redessine la carte et tous les tokens.
     * Gère l'adaptation de la carte à la taille du canvas tout en conservant son ratio d'aspect.
     * Dessine les tokens avec leurs portraits ou leur couleur de fond, ainsi que leur nom.
     */
    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height); // Efface tout le contenu précédent du canvas.
        
        // Dessine la carte si elle est chargée.
        if (state.map && state.map.complete) {
            const mapAspectRatio = state.map.width / state.map.height;     // Ratio d'aspect de l'image de la carte.
            const canvasAspectRatio = canvas.width / canvas.height;        // Ratio d'aspect du canvas.
            
            let drawWidth, drawHeight, drawX, drawY;

            // Calcule les dimensions et la position de la carte pour qu'elle s'adapte au canvas
            // sans être déformée (comportement "contain").
            if (mapAspectRatio > canvasAspectRatio) {
                // La carte est plus large proportionnellement que le canvas, elle prendra toute la largeur.
                drawWidth = canvas.width;
                drawHeight = drawWidth / mapAspectRatio;
                drawX = 0;
                drawY = (canvas.height - drawHeight) / 2; // Centre verticalement.
            } else {
                // La carte est plus haute proportionnellement que le canvas, elle prendra toute la hauteur.
                drawHeight = canvas.height;
                drawWidth = drawHeight * mapAspectRatio;
                drawY = 0;
                drawX = (canvas.width - drawWidth) / 2; // Centre horizontalement.
            }
            
            // Dessine l'image de la carte sur le canvas.
            ctx.drawImage(state.map, drawX, drawY, drawWidth, drawHeight);

            // Dessine chaque token avec son portrait, sa couleur de rôle et son numéro.
            state.tokens.forEach(token => {
                // Calcule la position du token par rapport à la carte affichée et au canvas.
                const tokenX = drawX + (token.x / state.map.width) * drawWidth;
                const tokenY = drawY + (token.y / state.map.height) * drawHeight;
                const tokenSize = (token.size / state.map.width) * drawWidth;

                const color = token.color || '#D9534F';
                const contrast = getContrastColor(color);
                const badgeRadius = tokenSize / 2;
                const centerX = tokenX + badgeRadius;
                const centerY = tokenY + badgeRadius;

                ctx.save();
                
                // Fond de rôle et portrait recadré dans le badge circulaire.
                ctx.beginPath();
                ctx.arc(centerX, centerY, badgeRadius, 0, Math.PI * 2, false);
                ctx.fillStyle = color;
                ctx.fill();

                if (token.portraitImg?.complete && token.portraitImg.naturalWidth) {
                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(centerX, centerY, badgeRadius - 2, 0, Math.PI * 2, false);
                    ctx.clip();
                    const imageRatio = token.portraitImg.naturalWidth / token.portraitImg.naturalHeight;
                    let sourceWidth = token.portraitImg.naturalWidth;
                    let sourceHeight = token.portraitImg.naturalHeight;
                    let sourceX = 0;
                    let sourceY = 0;
                    if (imageRatio > 1) {
                        sourceWidth = sourceHeight;
                        sourceX = (token.portraitImg.naturalWidth - sourceWidth) / 2;
                    } else {
                        sourceHeight = sourceWidth;
                        sourceY = (token.portraitImg.naturalHeight - sourceHeight) / 2;
                    }
                    ctx.drawImage(token.portraitImg, sourceX, sourceY, sourceWidth, sourceHeight, tokenX, tokenY, tokenSize, tokenSize);
                    ctx.restore();
                }

                ctx.beginPath();
                ctx.arc(centerX, centerY, badgeRadius, 0, Math.PI * 2, false);
                ctx.lineWidth = 2;
                ctx.strokeStyle = contrast;
                ctx.stroke();
                
                // Indicateur de PV perdu (remplissage noir du haut)
                const hpPercent = token.hpPercent || 100;
                if (hpPercent < 100) {
                    const hpLost = Math.max(0, Math.min(100, 100 - hpPercent)) / 100;
                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(centerX, centerY, badgeRadius, 0, Math.PI * 2, false);
                    ctx.clip();
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                    ctx.fillRect(tokenX, tokenY, tokenSize, tokenSize * hpLost);
                    ctx.restore();
                }
                
                // Texte du numéro
                ctx.fillStyle = contrast;
                ctx.font = `bold ${Math.max(14, badgeRadius * 0.8)}px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(String(token.marker || '?'), centerX, centerY);
                
                ctx.restore();

            });
        }
    }

    /**
     * Charge une image de carte à partir d'une URL et la définit comme la carte actuelle dans l'état de l'application.
     * Met à jour le canvas après le chargement.
     *
     * @param {string|null} url - L'URL de l'image de la carte ou `null` pour effacer la carte.
     */
    function loadMap(url) {
        if (!url) {
            state.map = null; // Efface la carte si l'URL est nulle.
            draw();           // Redessine le canvas vide.
            return;
        }
        console.log('[MAP_OBS] Tentative de chargement de la carte:', url);
        
        // Vérifie si l'URL est relative (commence par /) ou absolue.
        let finalUrl = url;
        if (url.startsWith('/') && !url.startsWith('//')) {
            // Si l'URL est relative, la convertit en URL absolue en y ajoutant l'adresse du serveur de synchronisation.
            finalUrl = `${SYNC_SERVER_URL}${url}`;
            console.log('[MAP_OBS] URL convertie en absolue pour chargement:', finalUrl);
        }
        
        const mapImage = new Image();
        mapImage.crossOrigin = "Anonymous"; // Permet le chargement d'images depuis des origines différentes (nécessaire pour canvas).
        mapImage.src = finalUrl;
        mapImage.onload = () => {
            console.log('[MAP_OBS] Carte chargée avec succès:', finalUrl);
            state.map = mapImage; // Met à jour l'objet carte dans l'état.
            draw();               // Redessine la carte sur le canvas.
        };
        mapImage.onerror = (error) => {
            console.error("[MAP_OBS] Impossible de charger l'image de la carte:", finalUrl, error);
            
            // Logique de récupération: si la `finalUrl` a été construite (différente de l'originale),
            // tente de charger l'image avec l'URL originale au cas où la conversion aurait été incorrecte.
            if (finalUrl !== url) {
                console.log('[MAP_OBS] Tentative de chargement avec l\'URL originale:', url);
                const originalImage = new Image();
                originalImage.crossOrigin = "Anonymous";
                originalImage.src = url;
                originalImage.onload = () => {
                    console.log('[MAP_OBS] Carte chargée avec succès (URL originale):', url);
                    state.map = originalImage;
                    draw();
                };
                originalImage.onerror = () => {
                    console.error("[MAP_OBS] Échec du chargement avec les deux méthodes. Aucune carte ne sera affichée.");
                    state.map = null; // Efface la carte en cas d'échec définitif.
                    draw();
                };
            } else {
                // Si l'URL originale a déjà échoué, efface la carte.
                state.map = null;
                draw();
            }
        }
    }


    /**
     * Charge l'image de portrait d'un token. Utilise un cache pour éviter les rechargements inutiles.
     * Inclut une logique de fallback pour essayer différents répertoires si l'image n'est pas trouvée
     * dans le chemin spécifié (ex: PNJ, Male, Players, Allies).
     *
     * @param {object} token - L'objet token dont le portrait doit être chargé.
     * @returns {Promise<Image>} Une promesse qui résout avec l'objet Image du portrait chargé.
     */
    function loadTokenPortrait(token) {
        // Si l'URL du portrait n'est pas définie ou si l'image est déjà en cache, utilise l'image en cache.
        if (!token.portraitUrl || portraitCache[token.portraitUrl]) {
            token.portraitImg = portraitCache[token.portraitUrl]; // Assigne l'image mise en cache.
            return Promise.resolve(token.portraitImg);             // Résout immédiatement la promesse.
        }

        console.log('[PORTRAIT_OBS] Tentative de chargement du portrait:', token.portraitUrl);
        
        return new Promise((resolve, reject) => {
            // Liste des dossiers alternatifs à essayer si le chargement original échoue.
            const tryFolders = ['PNJ', 'Male', 'Players', 'Allies'];
            
            // Extrait des informations du chemin original du portrait.
            let originalUrl = token.portraitUrl;
            let fileName = originalUrl.split('/').pop(); // Obtient le nom de fichier (ex: "goblin.png").
            let isAbsolute = originalUrl.startsWith('http://') || originalUrl.startsWith('https://'); // Vérifie si l'URL est absolue.
            
            // Détermine l'URL de base du serveur pour construire les chemins relatifs.
            let baseServerUrl = isAbsolute ? '' : SYNC_SERVER_URL;
            
            /**
             * Fonction récursive pour essayer de charger l'image d'un portrait.
             * @param {string} url - L'URL à tenter de charger.
             * @param {Array<string>} remainingFolders - La liste des dossiers restants à essayer en cas d'échec.
             */
            const tryLoadImage = (url, remainingFolders) => {
                console.log('[PORTRAIT_OBS] Tentative de chargement du portrait depuis:', url);
                
                const portraitImg = new Image();
                portraitImg.crossOrigin = 'Anonymous'; // Nécessaire pour les images cross-origin sur canvas.
                portraitImg.src = url;
                
                portraitImg.onload = () => {
                    console.log('[PORTRAIT_OBS] Portrait chargé avec succès:', url);
                    portraitCache[token.portraitUrl] = portraitImg; // Ajoute l'image au cache.
                    token.portraitImg = portraitImg;                   // Assigne l'image au token.
                    resolve(portraitImg);                              // Résout la promesse.
                };
                
                portraitImg.onerror = () => {
                    console.error("[PORTRAIT_OBS] Échec du chargement du portrait:", url);
                    
                    // Si d'autres dossiers alternatifs sont disponibles, les essaie.
                    if (remainingFolders.length > 0) {
                        const nextFolder = remainingFolders.shift(); // Prend le prochain dossier.
                        // Construit un nouveau chemin en remplaçant le dossier actuel par le suivant.
                        let basePath = originalUrl;
                        if (basePath.includes('/portraits/')) {
                            // Extrait la partie de l'URL jusqu'à "portraits/", puis ajoute le nouveau dossier et le nom du fichier.
                            basePath = basePath.substring(0, basePath.indexOf('/portraits/') + '/portraits/'.length);
                            const nextUrl = baseServerUrl + basePath + nextFolder + '/' + fileName;
                            tryLoadImage(nextUrl, remainingFolders); // Tente de charger depuis le nouveau chemin.
                        } else {
                            // Fallback si la structure de l'URL n'est pas standard (ex: juste /portraits/fichier.png).
                            const nextUrl = baseServerUrl + '/portraits/' + nextFolder + '/' + fileName;
                            tryLoadImage(nextUrl, remainingFolders);
                        }
                    } else {
                        // Tous les essais ont échoué.
                        console.error("[PORTRAIT_OBS] Impossible de charger le portrait après tous les essais.");
                        portraitCache[token.portraitUrl] = null; // Marque le portrait comme non chargeable dans le cache.
                        reject(new Error(`Impossible de charger l'image de portrait: ${token.portraitUrl}`)); // Rejette la promesse.
                    }
                };
            };
            
            // Extrait le dossier actuel du chemin original pour éviter de le retenter.
            let currentFolder = '';
            const portraitsIndex = originalUrl.indexOf('/portraits/');
            if (portraitsIndex >= 0) {
                const afterPortraits = originalUrl.substring(portraitsIndex + '/portraits/'.length);
                const folderEndIndex = afterPortraits.indexOf('/');
                if (folderEndIndex >= 0) {
                    currentFolder = afterPortraits.substring(0, folderEndIndex);
                }
            }
            
            // Retire le dossier déjà présent dans l'URL originale de la liste `tryFolders` pour éviter des doublons.
            const folderIndex = tryFolders.indexOf(currentFolder);
            if (folderIndex >= 0) {
                tryFolders.splice(folderIndex, 1);
            }
            
            // Commence le processus de chargement en essayant d'abord l'URL originale.
            let portraitUrl = isAbsolute ? originalUrl : `${SYNC_SERVER_URL}${originalUrl}`;
            tryLoadImage(portraitUrl, tryFolders);
        });
    }


    // =================================================================================
    // Logique de Synchronisation Socket.IO
    // =================================================================================

    // Initialise le client Socket.IO pour se connecter au serveur de synchronisation.
    // Utilise 'websocket' comme transport pour une communication en temps réel.
    const socket = io(SYNC_SERVER_URL, { transports: ['websocket'] });
    let initialStateReceived = false; // Flag pour suivre si l'état initial a déjà été reçu.
    let reconnecting = false;         // Flag pour indiquer si le client est en cours de reconnexion.

    /**
     * Gère l'événement `connect` lorsque le client OBS se connecte au serveur.
     * Demande l'état initial uniquement lors de la première connexion pour éviter
     * de réinitialiser l'état local en cas de reconnexion.
     */
    socket.on('connect', () => {
        console.log('[SYNC_OBS] Connecté au serveur pour la vue OBS.');
        
        if (!initialStateReceived) {
            console.log('[SYNC_OBS] Première connexion, demande d\'état initial.');
            socket.emit('request_initial_state'); // Demande l'état complet (carte et tokens).
        } else {
            console.log('[SYNC_OBS] Reconnexion détectée, utilisation de l\'état existant.');
            reconnecting = true; // Définit le flag de reconnexion.
            socket.emit('request_current_map'); // Demande juste la carte courante pour s'assurer de sa présence.
        }
    });
    
    /**
     * Gère l'événement `disconnect` lorsque le client OBS est déconnecté du serveur.
     */
    socket.on('disconnect', () => {
        console.log('[SYNC_OBS] Déconnecté du serveur, en attente de reconnexion...');
    });

    /**
     * Gère l'événement `initial_state` reçu du serveur.
     * Met à jour la carte et la liste des tokens dans l'état local de l'OBS.
     * @param {object} data - Contient les données `map` et `tokens`.
     */
    socket.on('initial_state', (data) => {
        console.log('[SYNC_OBS] État initial reçu:', data);
        // N'applique l'état initial que si ce n'est pas une reconnexion, pour éviter les réinitialisations.
        if (!reconnecting) {
            loadMap(data.map);          // Charge la carte.
            state.tokens = data.tokens || []; // Met à jour la liste des tokens.
            state.tokens.forEach(token => {
                loadTokenPortrait(token).then(scheduleDraw).catch(scheduleDraw);
            });
            scheduleDraw();             // Programme le redessin.
        }
        initialStateReceived = true; // Marque que l'état initial a été reçu.
        reconnecting = false;        // Réinitialise le flag de reconnexion.
    });

    /**
     * Gère l'événement `map_changed` lorsqu'une nouvelle carte est définie par le Maître de Jeu.
     * @param {object} data - Contient l'URL de la nouvelle carte (`map`).
     */
    socket.on('map_changed', (data) => {
        console.log('[SYNC_OBS] Changement de carte reçu:', data.map);
        loadMap(data.map); // Charge la nouvelle carte.
    });

    /**
     * Gère l'événement `token_added` lorsqu'un nouveau token est ajouté.
     * Ajoute le token à l'état local de l'OBS et le dessine.
     * @param {object} tokenData - Les données du token ajouté.
     */
    socket.on('token_added', (tokenData) => {
        console.log('[SYNC_OBS] Token ajouté:', tokenData);
        // Vérifie si le token existe déjà (peut arriver en cas de reconnexion ou de latence).
        const existing = state.tokens.find(t => t.id === tokenData.id);
        if (!existing) {
            state.tokens.push(tokenData);
            loadTokenPortrait(tokenData).then(scheduleDraw).catch(scheduleDraw);
        }
    });

    /**
     * Gère l'événement `token_updated` lorsqu'un token existant est modifié (nom, portrait, couleur, etc.).
     * Met à jour les propriétés du token dans l'état local et recharge le portrait si nécessaire.
     * @param {object} tokenData - Les données mises à jour du token.
     */
    socket.on('token_updated', (tokenData) => {
        console.log('[SYNC_OBS] Token mis à jour:', tokenData);
        const token = state.tokens.find(t => t.id === tokenData.id);
        if (token) {
            const portraitChanged = token.portraitUrl !== tokenData.portraitUrl;
            Object.assign(token, tokenData);
            if (portraitChanged) {
                token.portraitImg = null;
                loadTokenPortrait(token).then(scheduleDraw).catch(scheduleDraw);
            } else {
                scheduleDraw();
            }
        }
    });

    /**
     * Gère l'événement `token_moved` lorsqu'un token est déplacé.
     * Met à jour la position du token dans l'état local et programme un redessin batché.
     * @param {object} tokenData - Les données du token déplacé (ID, x, y).
     */
    socket.on('token_moved', (tokenData) => {
        const token = state.tokens.find(t => t.id === tokenData.id);
        if (token) {
            token.x = tokenData.x; // Met à jour la position X.
            token.y = tokenData.y; // Met à jour la position Y.
            scheduleDraw();        // Programme un redessin batché.
        }
    });

    /**
     * Gère l'événement `token_removed` lorsqu'un token est supprimé.
     * Retire le token de l'état local et redessine.
     * @param {object} tokenData - Les données du token supprimé (ID).
     */
    socket.on('token_removed', (tokenData) => {
        console.log('[SYNC_OBS] Token supprimé:', tokenData.id);
        state.tokens = state.tokens.filter(t => t.id !== tokenData.id); // Filtre le token supprimé.
        scheduleDraw(); // Programme un redessin.
    });

    /**
     * Gère l'événement `all_tokens_cleared` lorsque tous les tokens sont effacés.
     * Vide la liste des tokens dans l'état local et redessine.
     */
    socket.on('all_tokens_cleared', () => {
        console.log('[SYNC_OBS] Tous les tokens ont été effacés.');
        state.tokens = []; // Vide la liste des tokens.
        scheduleDraw();    // Programme un redessin.
    });

    // =================================================================================
    // Initialisation de l'Application (Exécuté au chargement du DOM)
    // =================================================================================

    // Ajoute un écouteur d'événements pour le redimensionnement de la fenêtre.
    window.addEventListener('resize', resizeCanvas);
    // Appelle resizeCanvas() une fois au démarrage pour définir la taille initiale du canvas.
    resizeCanvas();
});
