/**
 * ChatWebSocket - Communication en temps réel via WebSocket
 * Remplace le polling HTTP par WebSocket pour plus de réactivité
 */

class ChatWebSocket {
    constructor(options = {}) {
        // Utiliser l'URL WebSocket depuis APP_CONFIG si disponible
        this.wsUrl = options.wsUrl || (window.APP_CONFIG && window.APP_CONFIG.serverWsUrl) || this.getWebSocketUrl();
        this.ws = null;
        this.messageHandlers = [];
        this.errorHandlers = [];
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 3000;
        this.authToken = null;
        
        console.log('🔌 ChatWebSocket initialisé avec:', this.wsUrl);
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
            this.ws = new WebSocket(this.wsUrl);
            
            this.ws.addEventListener('open', () => {
                console.log('✅ WebSocket connecté');
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
                    console.error('❌ Erreur parsing WebSocket:', err);
                }
            });
            
            this.ws.addEventListener('close', () => {
                console.warn('⚠️ WebSocket fermé, reconnexion...');
                this.reconnect();
            });
            
            this.ws.addEventListener('error', (err) => {
                console.error('❌ Erreur WebSocket:', err);
                this.errorHandlers.forEach(handler => handler(err));
            });
        } catch (err) {
            console.error('❌ Erreur connexion WebSocket:', err);
            this.reconnect();
        }
    }

    /**
     * Reconnecter après déconnexion
     */
    reconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('❌ Impossible de se reconnecter');
            return;
        }
        
        this.reconnectAttempts++;
        console.log(`🔄 Tentative de reconnexion ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
        
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
            console.error('❌ Erreur envoi auth WS:', err);
        }
    }

    /**
     * Gérer les messages reçus
     */
    handleMessage(data) {
        if (data.type === 'message') {
            // Message de chat (compat) -> normaliser en newMessage avec payload direct
            const payload = data.message || data;
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
            // Nouveau message (depuis le serveur via broadcast)
            const payload = data.message || data;
            this.messageHandlers.forEach(handler => handler({
                type: 'newMessage',
                message: payload
            }));
        } else if (data.type === 'userCount') {
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
            console.log('✅ Succès serveur:', data.message || data.text);
        }
    }

    /**
     * Envoyer un message
     */
    sendMessage(pseudo, message) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.error('❌ WebSocket non connecté');
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
            console.error('❌ WebSocket non connecté, impossible d\'envoyer le pseudo');
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
     */
    close() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    /**
     * Alias pour close()
     */
    disconnect() {
        this.close();
    }
}

export default ChatWebSocket;
