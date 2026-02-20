/**
 * ChatWebSocket - Communication temps réel avec le serveur chat
 * Pseudo = username du compte (auth via token). Pas de setPseudo.
 */

import getLogger from '../../config/Logger.js';
import getErrorHandler from '../../config/ErrorHandler.js';

const logger = getLogger();
const errorHandler = getErrorHandler();

let sharedInstance = null;

function getSharedChatWebSocket(options = {}) {
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
        logger.info(`ChatWebSocket initialisé avec: ${this.wsUrl}`);
        this.connect();
    }

    getWebSocketUrl() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        return `${protocol}//${host}`;
    }

    connect() {
        try {
            this.ws = new WebSocket(this.wsUrl);

            this.ws.addEventListener('open', () => {
                logger.info('WebSocket connecté');
                this.reconnectAttempts = 0;
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

    reconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            logger.error('Impossible de se reconnecter');
            return;
        }
        this.reconnectAttempts++;
        logger.info(`Tentative de reconnexion ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
        setTimeout(() => this.connect(), this.reconnectDelay);
    }

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

    handleMessage(data) {
        if (data.type === 'auth:ack') {
            this.messageHandlers.forEach(handler => handler({ type: 'auth:ack', ok: data.ok }));
            return;
        }
        if (data.type === 'error') {
            const code = data.code || null;
            const msg = data.message || data.text || 'Erreur inconnue';
            this.errorHandlers.forEach(handler => handler({ code, message: msg }));
            return;
        }
        if (data.type === 'message:new') {
            const d = data.data || data;
            const payload = {
                id: d.id,
                pseudo: d.username || d.pseudo,
                text: d.text,
                message: d.text,
                created_at: d.createdAt || d.created_at
            };
            this.messageHandlers.forEach(handler => handler({
                type: 'newMessage',
                message: payload
            }));
            return;
        }
        if (data.type === 'message' || data.type === 'newMessage') {
            const payload = data.message || data.data || data;
            const normalized = {
                id: payload.id,
                pseudo: payload.username || payload.pseudo,
                text: payload.text || payload.message,
                message: payload.text || payload.message,
                created_at: payload.createdAt || payload.created_at
            };
            this.messageHandlers.forEach(handler => handler({
                type: 'newMessage',
                message: normalized
            }));
            return;
        }
        if (data.type === 'history') {
            this.messageHandlers.forEach(handler => handler({
                type: 'history',
                messages: data.messages || []
            }));
            return;
        }
        if (data.type === 'userCount') {
            this.messageHandlers.forEach(handler => handler({
                type: 'userCount',
                count: data.count,
                users: data.users
            }));
            return;
        }
        if (data.type === 'chatCleared') {
            this.messageHandlers.forEach(handler => handler({
                type: 'chatCleared',
                clearedBy: data.clearedBy,
                timestamp: data.timestamp
            }));
            return;
        }
        if (data.type === 'connected') {
            this.messageHandlers.forEach(handler => handler({
                type: 'userCount',
                count: typeof data.connectedUsers === 'number' ? data.connectedUsers : data.count,
                users: data.users || []
            }));
            return;
        }
        if (data.type === 'success') {
            logger.info(`Succès serveur: ${data.message || data.text}`);
        }
    }

    /**
     * Envoyer un message (le pseudo est celui du compte côté serveur)
     */
    sendMessage(text) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            logger.error('WebSocket non connecté');
            return Promise.reject(new Error('WebSocket non connecté'));
        }
        return new Promise((resolve, reject) => {
            try {
                this.ws.send(JSON.stringify({ type: 'message', text }));
                resolve();
            } catch (err) {
                reject(err);
            }
        });
    }

    onMessage(handler) {
        this.messageHandlers.push(handler);
    }

    onError(handler) {
        this.errorHandlers.push(handler);
    }

    isConnected() {
        return this.ws && this.ws.readyState === WebSocket.OPEN;
    }

    close(skipReconnect = false) {
        this._skipReconnect = skipReconnect;
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        if (sharedInstance === this) {
            sharedInstance = null;
        }
    }

    disconnect() {
        this.close();
    }
}

export { getSharedChatWebSocket };
export default ChatWebSocket;
