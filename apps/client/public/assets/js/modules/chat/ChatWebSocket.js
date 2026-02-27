/**
 * ChatWebSocket - Communication temps réel avec le serveur chat
 * Pseudo = username du compte (auth via token). Pas de setPseudo.
 */
console.log('[Chat WS] Module chargé (auth + retry activés)');

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
        const base = options.wsUrl || (window.APP_CONFIG && window.APP_CONFIG.serverWsUrl) || this.getWebSocketUrl();
        this.wsUrl = this.normalizeWsUrl(base);
        this.ws = null;
        this.messageHandlers = [];
        this.errorHandlers = [];
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 3000;
        this.authToken = null;
        this._authAcked = false;
        this._authRetryCount = 0;
        this._authRetryTimer = null;
        this._authLogged = false;
        logger.info(`ChatWebSocket initialisé avec: ${this.wsUrl}`);
        this.connect();
    }

    getWebSocketUrl() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        return `${protocol}//${host}/ws`;
    }

    /** S'assurer que l'URL pointe vers la route /ws du backend */
    normalizeWsUrl(url) {
        if (!url || typeof url !== 'string') return this.getWebSocketUrl();
        const u = url.trim().replace(/\/+$/, '');
        return u.endsWith('/ws') ? u : `${u}/ws`;
    }

    connect() {
        this._skipReconnect = false;
        try {
            this.ws = new WebSocket(this.wsUrl);

            this.ws.addEventListener('open', () => {
                console.log('[Chat WS] Connecté à', this.wsUrl);
                logger.info('WebSocket connecté');
                this.reconnectAttempts = 0;
                this._authAcked = false;
                this._authRetryCount = 0;
                this._authLogged = false;
                this._trySendAuth();
                this._startAuthRetry();
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
                this._stopAuthRetry();
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

    _trySendAuth() {
        const token = this.authToken || (typeof localStorage !== 'undefined' && localStorage.getItem('workspace_jwt'));
        if (this._authAcked) return;
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        if (!token) {
            if (this._authRetryCount === 1) {
                console.warn('[Chat WS] Pas de token (workspace_jwt vide). Connectez-vous pour envoyer des messages.');
                logger.warn('Auth WebSocket: pas de token dans localStorage (workspace_jwt)');
            }
            return;
        }
        try {
            this.ws.send(JSON.stringify({ type: 'auth', token }));
            if (!this._authLogged) {
                this._authLogged = true;
                console.log('[Chat WS] Auth envoyée au serveur (token jwt_...)');
            }
            logger.info('Auth WebSocket envoyée (token présent)');
        } catch (err) {
            console.error('[Chat WS] Erreur envoi auth:', err);
            logger.error('Erreur envoi auth WS', err);
        }
    }

    _startAuthRetry() {
        this._stopAuthRetry();
        const maxAttempts = 15;
        this._authRetryTimer = setInterval(() => {
            if (this._authAcked || this._authRetryCount >= maxAttempts) {
                this._stopAuthRetry();
                return;
            }
            this._authRetryCount++;
            this._trySendAuth();
        }, 2000);
    }

    _stopAuthRetry() {
        if (this._authRetryTimer) {
            clearInterval(this._authRetryTimer);
            this._authRetryTimer = null;
        }
    }

    async authenticate(token) {
        if (!token) return;
        this.authToken = token;
        if (this._authAcked) return;
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        try {
            this.ws.send(JSON.stringify({ type: 'auth', token }));
            console.log('[Chat WS] Auth envoyée (authenticate)');
            logger.info('Auth WebSocket envoyée (authenticate)');
        } catch (err) {
            console.error('[Chat WS] Erreur envoi auth:', err);
            logger.error('Erreur envoi auth WS', err);
        }
    }

    handleMessage(data) {
        if (data.type === 'auth:ack') {
            this._authAcked = true;
            this._stopAuthRetry();
            this.messageHandlers.forEach(handler => handler({ type: 'auth:ack', ok: data.ok }));
            console.log('[Chat WS] Auth confirmée par le serveur – vous pouvez envoyer des messages');
            logger.info('Auth WebSocket confirmée par le serveur');
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
                text: d.text || d.message,
                message: d.text || d.message,
                created_at: d.createdAt || d.created_at,
                replyTo: d.replyTo ?? d.reply_to ?? d.parentId ?? null,
                replyToPseudo: d.replyToPseudo ?? d.reply_to_pseudo ?? null,
                replyToText: d.replyToText ?? d.reply_to_text ?? null
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
                created_at: payload.createdAt || payload.created_at,
                replyTo: payload.replyTo ?? payload.reply_to ?? payload.parentId ?? null,
                replyToPseudo: payload.replyToPseudo ?? payload.reply_to_pseudo ?? null,
                replyToText: payload.replyToText ?? payload.reply_to_text ?? null
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
            // _trySendAuth et _startAuthRetry sont déjà lancés depuis l'event 'open'
            return;
        }
        if (data.type === 'success') {
            logger.info(`Succès serveur: ${data.message || data.text}`);
        }
    }

    /**
     * Envoyer un message (le pseudo est celui du compte côté serveur)
     * @param {string} text
     * @param {string|number|null} [replyToId] - id du message auquel on répond
     */
    sendMessage(text, replyToId = null) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            logger.error('WebSocket non connecté');
            return Promise.reject(new Error('WebSocket non connecté'));
        }
        return new Promise((resolve, reject) => {
            try {
                const payload = { type: 'message', text };
                if (replyToId != null && replyToId !== '') payload.replyTo = String(replyToId);
                this.ws.send(JSON.stringify(payload));
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
        if (!skipReconnect && sharedInstance === this) {
            sharedInstance = null;
        }
    }

    disconnect() {
        this.close(true);
    }
}

// Permettre à AuthManager (login) d'authentifier le WebSocket dans le même onglet
if (typeof window !== 'undefined') {
    window.workspaceChatAuthenticate = (token) => {
        const ws = getSharedChatWebSocket();
        if (ws && token) ws.authenticate(token);
    };
}

export { getSharedChatWebSocket };
export default ChatWebSocket;
