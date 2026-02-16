/**
 * ChatWebSocket - Communication en temps réel via WebSocket
 * Remplace le polling HTTP par WebSocket pour plus de réactivité
 */

class ChatWebSocket {
  constructor(options = {}) {
    // Utiliser l'URL WebSocket depuis APP_CONFIG si disponible (le backend expose la route /ws)
    let base = options.wsUrl || (window.APP_CONFIG && window.APP_CONFIG.serverWsUrl) || this.getWebSocketUrl();
    this.wsUrl = this.normalizeWsUrl(base);
    this.ws = null;
    this.messageHandlers = [];
    this.errorHandlers = [];
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10; // Augmenté de 5 à 10
    this.baseReconnectDelay = 1000; // Délai de base pour exponential backoff
    this.maxReconnectDelay = 30000; // Délai max 30s
    this.authToken = null;
    this.reconnectTimeout = null;
    this.heartbeatInterval = null;

    console.log('🔌 ChatWebSocket initialisé avec:', this.wsUrl);
    this.connect();
  }

  /**
   * S'assurer que l'URL WebSocket pointe vers la route /ws (backend Fastify)
   */
  normalizeWsUrl(url) {
    if (!url || typeof url !== 'string') return this.getWebSocketUrl();
    const u = url.trim().replace(/\/+$/, '');
    return u.endsWith('/ws') ? u : `${u}/ws`;
  }

  /**
   * Déterminer l'URL WebSocket à partir de l'URL actuelle (fallback)
   */
  getWebSocketUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}/ws`;
  }

  /**
     * Connecter au serveur WebSocket
     */
  connect() {
    try {
      // Ajouter le username en query param (requis par le serveur Proxmox)
      const username = localStorage.getItem('workspace_username') || `Guest_${Math.random().toString(36).substr(2, 9)}`;
      const wsUrlWithParams = `${this.wsUrl}?username=${encodeURIComponent(username)}`;
      
      console.log(`🔗 Tentative de connexion à ${wsUrlWithParams}...`);
      this.ws = new WebSocket(wsUrlWithParams);

      this.ws.addEventListener('open', () => {
        console.log('✅ WebSocket connecté');
        this.reconnectAttempts = 0;
        this.startHeartbeat();
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

      this.ws.addEventListener('close', (event) => {
        console.warn(`⚠️ WebSocket fermé (code: ${event.code}), reconnexion dans ${this.getReconnectDelay()}ms...`);
        this.stopHeartbeat();
        this.reconnect();
      });

      this.ws.addEventListener('error', (err) => {
        console.error('❌ Erreur WebSocket:', err);
        this.errorHandlers.forEach(handler => handler(err));
      });
    } catch (err) {
      console.error('❌ Erreur création WebSocket:', err);
      this.reconnect();
    }
  }

  /**
     * Calculer le délai de reconnexion avec exponential backoff
     */
  getReconnectDelay() {
    // Exponential backoff: délai = base * 2^tentatives (avec max)
    const delay = this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    return Math.min(delay, this.maxReconnectDelay);
  }

  /**
     * Reconnecter après déconnexion
     */
  reconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`❌ Impossible de se reconnecter après ${this.maxReconnectAttempts} tentatives`);
      this.errorHandlers.forEach(handler => handler('Reconnexion échouée'));
      return;
    }

    this.reconnectAttempts++;
    const delay = this.getReconnectDelay();
    console.log(`🔄 Tentative de reconnexion ${this.reconnectAttempts}/${this.maxReconnectAttempts} dans ${delay}ms`);

    // Annuler le timeout précédent s'il existe
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
     * Démarrer un heartbeat pour détecter les connexions mortes
     */
  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: 'ping' }));
        } catch (err) {
          console.warn('⚠️ Erreur envoi heartbeat:', err);
        }
      }
    }, 30000); // Ping toutes les 30s
  }

  /**
     * Arrêter le heartbeat
     */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
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
    console.log('📨 Message WebSocket reçu:', data.type);
    
    if (data.type === 'connected') {
      // Bienvenue du serveur
      console.log('✅ Connecté au serveur WebSocket:', data.userId, data.username);
      return;
    } else if (data.type === 'auth:ack') {
      // Authentification OK
      console.log('✅ Authentifié');
      return;
    } else if (data.type === 'message:new') {
      // Nouveau message reçu
      const payload = data.data || data;
      this.messageHandlers.forEach(handler => handler({
        type: 'newMessage',
        message: payload
      }));
    } else if (data.type === 'message' || data.type === 'message:send') {
      // Message de chat (anciens formats)
      const payload = data.message || data.data || data;
      this.messageHandlers.forEach(handler => handler({
        type: 'newMessage',
        message: payload
      }));
    } else if (data.type === 'presence:update') {
      // Changement de présence utilisateur
      const payload = data.data || data;
      this.messageHandlers.forEach(handler => handler({
        type: 'presence:update',
        user: payload
      }));
    } else if (data.type === 'userCount') {
      // Mise à jour du nombre d'utilisateurs
      this.messageHandlers.forEach(handler => handler({
        type: 'userCount',
        count: data.count,
        users: data.users
      }));
    } else if (data.type === 'error') {
      // Erreur du serveur
      const msg = data.message || data.text || 'Erreur inconnue';
      console.error('❌ Erreur serveur:', msg);
      this.errorHandlers.forEach(handler => handler(msg));
    } else if (data.type === 'ping') {
      // Heartbeat - répondre avec pong
      try {
        this.ws.send(JSON.stringify({ type: 'pong' }));
      } catch (err) {
        console.warn('⚠️ Erreur réponse pong:', err);
      }
    } else {
      console.log('📌 Message WebSocket non géré:', data.type, data);
    }
  }

  /**
     * Envoyer un message (type 'message:send' pour Proxmox)
     */
  sendMessage(message) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('❌ WebSocket non connecté');
      return Promise.reject(new Error('WebSocket non connecté'));
    }

    return new Promise((resolve, reject) => {
      try {
        const payload = {
          type: 'message:send', // Type attendu par le serveur Proxmox
          text: message,
          timestamp: Date.now(),
          username: localStorage.getItem('workspace_username') || 'Guest'
        };
        console.log('📤 Envoi message:', payload.type, message.substring(0, 50));
        this.ws.send(JSON.stringify(payload));
        resolve();
      } catch (err) {
        console.error('❌ Erreur envoi message:', err);
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
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.stopHeartbeat();
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
