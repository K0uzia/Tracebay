/**
 * ChatWebSocket - Communication en temps réel via WebSocket
 * Remplace le polling HTTP par WebSocket pour plus de réactivité
 */

import getLogger from '../../config/Logger.js';
import getErrorHandler from '../../config/ErrorHandler.js';

const logger = getLogger();
const errorHandler = getErrorHandler();

let sharedInstance = null;

function getSharedChatWebSocket(options = {}) {
    // #region agent log
    try {
        fetch('http://127.0.0.1:7358/ingest/69ea8e5d-a460-4f0f-88de-271ea6ec34a1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b1c6ff'},body:JSON.stringify({sessionId:'b1c6ff',location:'ChatWebSocket.js:getShared',message:'getSharedChatWebSocket',data:{reuse:!!sharedInstance},hypothesisId:'H4',timestamp:Date.now()})}).catch(()=>{});
    } catch (_) {}
    // #endregion
    if (sharedInstance) return sharedInstance;
    sharedInstance = new ChatWebSocket(options);
    return sharedInstance;
}

class ChatWebSocket {
    constructor(options = {}) {
        if (sharedInstance && sharedInstance !== this) {
            logger.warn('ChatWebSocket: réutilisation de l’instance partagée');
            return sharedInstance;
        }
        this.wsUrl = options.wsUrl || (window.APP_CONFIG && window.APP_CONFIG.serverWsUrl) || this.getWebSocketUrl();
        this.ws = null;
        this.messageHandlers = [];
        this.errorHandlers = [];
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 3000;
        this.authToken = null;
        // #region agent log
        try {
            fetch('http://127.0.0.1:7358/ingest/69ea8e5d-a460-4f0f-88de-271ea6ec34a1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b1c6ff'},body:JSON.stringify({sessionId:'b1c6ff',location:'ChatWebSocket.js:constructor',message:'ChatWebSocket constructed',data:{wsUrl:this.wsUrl},hypothesisId:'H4',timestamp:Date.now()})}).catch(()=>{});
        } catch (_) {}
        // #endregion
        logger.info(`ChatWebSocket initialisé avec: ${this.wsUrl}`);
        this.connect();
    }

    /**
     * Déterminer l'URL WebSocket à partir de l'URL actuelle (fallback)
     */
    getWebSocketUrl() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        return `${protocol}//${host}`;
    }

    /**
     * Connecter au serveur WebSocket
     */
    connect() {
        try {
            // #region agent log
            try {
                fetch('http://127.0.0.1:7358/ingest/69ea8e5d-a460-4f0f-88de-271ea6ec34a1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b1c6ff'},body:JSON.stringify({sessionId:'b1c6ff',location:'ChatWebSocket.js:connect',message:'WebSocket connect() called',data:{wsUrl:this.wsUrl},hypothesisId:'H1',timestamp:Date.now()})}).catch(()=>{});
            } catch (_) {}
            // #endregion
            this.ws = new WebSocket(this.wsUrl);
            
            this.ws.addEventListener('open', () => {
                logger.info('WebSocket connecté');
                this.reconnectAttempts = 0;
                // Si on a déjà un token, l'envoyer pour authentifier
                if (this.authToken) {
                    this.authenticate(this.authToken).catch(() => {});
                }
            });
            
            this.ws.addEventListener('message', (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleMessage(data);
                } catch (err) {
                    logger.error('Erreur parsing WebSocket', err);
                }
            });
            
            this.ws.addEventListener('close', () => {
                // #region agent log
                try {
                    fetch('http://127.0.0.1:7358/ingest/69ea8e5d-a460-4f0f-88de-271ea6ec34a1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b1c6ff'},body:JSON.stringify({sessionId:'b1c6ff',location:'ChatWebSocket.js:close listener',message:'WS close event',data:{skipReconnect:!!this._skipReconnect},hypothesisId:'H5',timestamp:Date.now()})}).catch(()=>{});
                } catch (_) {}
                // #endregion
                if (this._skipReconnect) {
                    logger.info('WebSocket fermé (déconnexion volontaire), pas de reconnexion');
                    return;
                }
                logger.warn('WebSocket fermé, reconnexion...');
                this.reconnect();
            });
            
            this.ws.addEventListener('error', (err) => {
                errorHandler.handleWebSocketError(err);
                this.errorHandlers.forEach(handler => handler(err));
            });
        } catch (err) {
            logger.error('Erreur connexion WebSocket', err);
            this.reconnect();
        }
    }

    /**
     * Reconnecter après déconnexion
     */
    reconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            logger.error('Impossible de se reconnecter');
            return;
        }
        
        this.reconnectAttempts++;
        logger.info(`Tentative de reconnexion ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
        
        setTimeout(() => {
            this.connect();
        }, this.reconnectDelay);
    }

    /**
     * Authentifier la connexion WebSocket avec un token JWT
     */
    async authenticate(token) {
        if (!token) return;
        this.authToken = token;
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        try {
            this.ws.send(JSON.stringify({ type: 'auth', token }));
        } catch (err) {
            logger.error('Erreur envoi auth WS', err);
        }
    }

    /**
     * Gérer les messages reçus
     */
    handleMessage(data) {
        if (data.type === 'message') {
            const payload = data.message || data;
            // #region agent log
            try {
                fetch('http://127.0.0.1:7358/ingest/69ea8e5d-a460-4f0f-88de-271ea6ec34a1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b1c6ff'},body:JSON.stringify({sessionId:'b1c6ff',location:'ChatWebSocket.js:handleMessage:message',message:'message (legacy) received',data:{pseudo:payload?.pseudo,textLen:(payload?.text||payload?.message||'').length},hypothesisId:'H2',timestamp:Date.now()})}).catch(()=>{});
            } catch (_) {}
            // #endregion
            this.messageHandlers.forEach(handler => handler({
                type: 'newMessage',
                message: payload
            }));
        } else if (data.type === 'message:new') {
            const d = data.data || data;
            const payload = {
                id: d.id,
                pseudo: d.username || d.pseudo,
                text: d.text,
                message: d.text,
                created_at: d.createdAt || d.created_at
            };
            const n = this.messageHandlers.length;
            const textPreview = (payload.text || payload.message || '').substring(0, 30);
            console.log('📩 message:new reçu → affichage à', n, 'handler(s) | id=', payload.id, '|', (payload.pseudo || '?') + ':', textPreview + ((payload.text || payload.message || '').length > 30 ? '…' : ''));
            // #region agent log
            try {
                fetch('http://127.0.0.1:7358/ingest/69ea8e5d-a460-4f0f-88de-271ea6ec34a1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b1c6ff'},body:JSON.stringify({sessionId:'b1c6ff',location:'ChatWebSocket.js:handleMessage:message:new',message:'message:new received (broadcast)',data:{pseudo:payload.pseudo,textLen:(payload.text||'').length},hypothesisId:'H2',timestamp:Date.now()})}).catch(()=>{});
            } catch (_) {}
            // #endregion
            this.messageHandlers.forEach(handler => handler({
                type: 'newMessage',
                message: payload
            }));
        } else if (data.type === 'history') {
            // Historique au démarrage
            this.messageHandlers.forEach(handler => handler({
                type: 'history',
                messages: data.messages
            }));
        } else if (data.type === 'newMessage') {
            const payload = data.message || data;
            // #region agent log
            try {
                fetch('http://127.0.0.1:7358/ingest/69ea8e5d-a460-4f0f-88de-271ea6ec34a1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b1c6ff'},body:JSON.stringify({sessionId:'b1c6ff',location:'ChatWebSocket.js:handleMessage:newMessage',message:'newMessage received (broadcast)',data:{pseudo:payload?.pseudo,textLen:(payload?.text||payload?.message||'').length},hypothesisId:'H2',timestamp:Date.now()})}).catch(()=>{});
            } catch (_) {}
            // #endregion
            // Nouveau message (depuis le serveur via broadcast)
            this.messageHandlers.forEach(handler => handler({
                type: 'newMessage',
                message: payload
            }));
        } else if (data.type === 'userCount') {
            // #region agent log
            try {
                fetch('http://127.0.0.1:7358/ingest/69ea8e5d-a460-4f0f-88de-271ea6ec34a1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b1c6ff'},body:JSON.stringify({sessionId:'b1c6ff',location:'ChatWebSocket.js:handleMessage:userCount',message:'userCount received',data:{count:data.count,users:data.users},hypothesisId:'H1',timestamp:Date.now()})}).catch(()=>{});
            } catch (_) {}
            // #endregion
            // Mise à jour du nombre d'utilisateurs
            this.messageHandlers.forEach(handler => handler({
                type: 'userCount',
                count: data.count,
                users: data.users
            }));
        } else if (data.type === 'chatCleared') {
            // Chat supprimé par quelqu'un
            this.messageHandlers.forEach(handler => handler({
                type: 'chatCleared',
                clearedBy: data.clearedBy,
                timestamp: data.timestamp
            }));
        } else if (data.type === 'error') {
            // Erreur du serveur
            const msg = data.message || data.text || 'Erreur inconnue';
            this.errorHandlers.forEach(handler => handler(msg));
        } else if (data.type === 'success') {
            // Message de succès du serveur
            logger.info(`Succès serveur: ${data.message || data.text}`);
        }
    }

    /**
     * Envoyer un message
     */
    sendMessage(pseudo, message) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            logger.error('WebSocket non connecté');
            return Promise.reject(new Error('WebSocket non connecté'));
        }
        
        return new Promise((resolve, reject) => {
            try {
                this.ws.send(JSON.stringify({
                    type: 'message',
                    text: message
                }));
                resolve();
            } catch (err) {
                reject(err);
            }
        });
    }

    /**
     * Envoyer le pseudo (connexion utilisateur)
     */
    setPseudo(pseudo) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            logger.error('WebSocket non connecté, impossible d\'envoyer le pseudo');
            return Promise.reject(new Error('WebSocket non connecté'));
        }
        
        return new Promise((resolve, reject) => {
            try {
                this.ws.send(JSON.stringify({
                    type: 'setPseudo',
                    pseudo
                }));
                resolve();
            } catch (err) {
                reject(err);
            }
        });
    }

    /**
     * Enregistrer un handler pour les messages
     */
    onMessage(handler) {
        this.messageHandlers.push(handler);
    }

    /**
     * Enregistrer un handler pour les erreurs
     */
    onError(handler) {
        this.errorHandlers.push(handler);
    }

    /**
     * Vérifier si connecté
     */
    isConnected() {
        return this.ws && this.ws.readyState === WebSocket.OPEN;
    }

    /**
     * Fermer la connexion
     * @param {boolean} [skipReconnect=false] - Si true, ne pas tenter de reconnexion (ex: logout)
     */
    close(skipReconnect = false) {
        // #region agent log
        try {
            fetch('http://127.0.0.1:7358/ingest/69ea8e5d-a460-4f0f-88de-271ea6ec34a1',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b1c6ff'},body:JSON.stringify({sessionId:'b1c6ff',location:'ChatWebSocket.js:close',message:'close() called',data:{skipReconnect},hypothesisId:'H5',timestamp:Date.now()})}).catch(()=>{});
        } catch (_) {}
        // #endregion
        this._skipReconnect = skipReconnect;
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        if (sharedInstance === this) {
            sharedInstance = null;
        }
    }

    /**
     * Alias pour close()
     */
    disconnect() {
        this.close();
    }
}

export { getSharedChatWebSocket };
export default ChatWebSocket;
