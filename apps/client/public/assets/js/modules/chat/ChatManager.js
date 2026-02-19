/**
 * ChatManager - Gestion des messages du chat
 * 
 * Responsabilités:
 * - Gérer le pseudo de l'utilisateur (localStorage)
 * - Communiquer via WebSocket en temps réel
 * - Valider les messages (sécurité)
 * - Intégrer avec ChatSecurityManager
 */

import ChatSecurityManager from './ChatSecurityManager.js';
import ChatWebSocket from './ChatWebSocket.js';
import api from '../../config/api.js';
import getLogger from '../../config/Logger.js';
import getErrorHandler from '../../config/ErrorHandler.js';

const logger = getLogger();
const errorHandler = getErrorHandler();

class ChatManager {
    constructor(options = {}) {
        logger.debug('ChatManager: Construction en cours...');
        // IDs des éléments
        this.pseudoWrapperId = options.pseudoWrapperId || 'chat-widget-pseudo-area';
        this.pseudoDisplayId = options.pseudoDisplayId || 'chat-widget-pseudo-display';
        this.pseudoInputId = options.pseudoInputId || 'chat-widget-pseudo-input';
        this.pseudoConfirmId = options.pseudoConfirmId || 'chat-widget-pseudo-confirm';
        this.pseudoErrorId = options.pseudoErrorId || 'chat-widget-pseudo-error';
        this.messagesContainerId = options.messagesContainerId || 'chat-widget-messages';
        this.inputId = options.inputId || 'chat-widget-input';
        this.sendButtonId = options.sendButtonId || 'chat-widget-send';
        this.clearChatBtnId = options.clearChatBtnId || 'chat-widget-clear';
        
        // WebSocket avec serverUrl depuis api.js
        const wsUrl = options.wsUrl || api.getWsUrl();
        this.webSocket = new ChatWebSocket({ wsUrl });
        
        // État
        this.pseudo = this.loadPseudo();
        this.messages = [];
        this.userCount = 0;
        this.connectedUsers = [];
        this.securityConfig = options.securityConfig || {};
        
        // Initialiser ChatSecurityManager
        this.securityManager = new ChatSecurityManager(this.securityConfig);
        
        logger.debug('ChatManager: Construction finie, init()...');
        this.init();
    }

    /**
     * Initialiser le ChatManager
     */
    async init() {
        logger.debug('ChatManager: init() appelé');
        
        // Écouter les changements d'authentification
        window.addEventListener('auth-change', (e) => {
            const user = e.detail?.user;
            const token = e.detail?.token;
            logger.debug('ChatManager: Auth changed', { user: user?.username });
            this.pseudo = user ? user.username : null;
            this.displayPseudo();
            if (token) {
                this.webSocket.authenticate(token);
            }
            
            if (this.pseudo && this.webSocket.isConnected()) {
                this.webSocket.setPseudo(this.pseudo);
            }
        });
        
        // Afficher le pseudo
        this.displayPseudo();
        
        // Afficher les messages
        logger.debug('Avant renderMessages', { 
            container: !!document.getElementById(this.messagesContainerId), 
            messages: this.messages.length 
        });
        this.renderMessages();
        
        // Attacher les écouteurs d'événements
        this.attachEventListeners();
        
        // Attendre que le WebSocket soit connecté, puis envoyer le pseudo et charger l'historique
        const connectAndRestoreSession = () => {
            if (this.webSocket.isConnected()) {
                const token = this.getStoredToken();
                if (token) {
                    this.webSocket.authenticate(token);
                }
                if (this.pseudo) {
                    logger.info(`Reconnexion automatique avec pseudo: ${this.pseudo}`);
                    this.webSocket.setPseudo(this.pseudo).catch(err => {
                        logger.error('Erreur reconnexion', err);
                    });
                }
                this.fetchHistory();
            } else {
                // Attendre un peu et réessayer
                setTimeout(connectAndRestoreSession, 500);
            }
        };
        
        // Vérifier la connexion
        connectAndRestoreSession();
        
        // Écouter les messages WebSocket
        this.webSocket.onMessage((data) => {
            logger.debug('Message WebSocket reçu', { type: data.type });
            if (data.type === 'history') {
                logger.debug(`Historique reçu: ${data.messages?.length || 0} messages`);
                this.messages = data.messages.map(msg => ({
                    id: msg.id,
                    pseudo: msg.pseudo,
                    text: msg.message,
                    timestamp: this.formatTime(msg.created_at),
                    own: msg.pseudo === this.pseudo,
                    created_at: msg.created_at
                }));
                this.renderMessages();
                this.scrollToBottom();
            } else if (data.type === 'newMessage') {
                const msg = data.message;
                logger.debug('Nouveau message reçu', { 
                    pseudo: msg.pseudo, 
                    messageType: typeof msg.message 
                });
                
                const messageText = typeof msg.message === 'string' ? msg.message : (msg.text || '');
                const pseudo = msg.pseudo || 'Anonyme';
                const isOwn = pseudo === this.pseudo;
                // Éviter le doublon si on a déjà affiché ce message en "optimistic" (même pseudo + même texte récent)
                const recent = Date.now() - 15000;
                const isDuplicate = isOwn && this.messages.some(m => 
                    m.own && m.pseudo === pseudo && m.text === messageText && (m.created_at && new Date(m.created_at).getTime() > recent)
                );
                if (isDuplicate) {
                    const idx = this.messages.findIndex(m => 
                        m.own && m.pseudo === pseudo && m.text === messageText && (m.created_at && new Date(m.created_at).getTime() > recent)
                    );
                    if (idx !== -1 && this.messages[idx].id && String(this.messages[idx].id).startsWith('temp-')) {
                        this.messages[idx].id = msg.id || this.messages[idx].id;
                        this.messages[idx].created_at = msg.created_at;
                        this.messages[idx].timestamp = this.formatTime(msg.created_at);
                    }
                    this.renderMessages();
                    this.scrollToBottom();
                    return;
                }
                
                this.messages.push({
                    id: msg.id || Date.now(),
                    pseudo,
                    text: messageText,
                    timestamp: this.formatTime(msg.created_at),
                    own: isOwn,
                    created_at: msg.created_at
                });
                logger.debug('Message ajouté', { id: this.messages[this.messages.length - 1].id });
                this.renderMessages();
                this.scrollToBottom();
            } else if (data.type === 'userCount') {
                logger.debug(`Mise à jour utilisateurs: ${data.count}`, { users: data.users });
                this.connectedUsers = data.users || [];
                // Afficher le nombre d'utilisateurs uniques (évite de compter plusieurs connexions du même user)
                const pseudos = Array.isArray(this.connectedUsers)
                    ? this.connectedUsers.map(u => (typeof u === 'string' ? u : (u?.pseudo || u?.username || '')))
                    : [];
                this.userCount = new Set(pseudos.filter(Boolean)).size;
                this.displayPseudo();
            } else if (data.type === 'chatCleared') {
                logger.info(`Chat supprimé par: ${data.clearedBy}`);
                this.messages = [];
                this.renderMessages();
                // Afficher un message de notification
                const notifElement = document.getElementById(this.messagesContainerId);
                if (notifElement) {
                    const notif = document.createElement('div');
                    notif.className = 'chat-clear-notification';
                    notif.textContent = `🗑️ Chat supprimé par ${data.clearedBy}`;
                    notif.style.cssText = 'text-align: center; padding: 10px; background: #ffe6e6; color: #cc0000; border-radius: 4px; margin: 10px; font-weight: bold;';
                    notifElement.appendChild(notif);
                    setTimeout(() => notif.remove(), 3000);
                }
            }
        });
        
        this.webSocket.onError((err) => {
            logger.error('Erreur chat', err);
        });
    }

    getStoredToken() {
        return localStorage.getItem('workspace_jwt');
    }

    /**
     * Charger l'historique des messages via l'API (après connexion/reconnexion)
     */
    async fetchHistory() {
        try {
            const res = await api.get('messages.list', { useCache: false });
            if (!res.ok) return;
            const data = await res.json();
            const list = data.messages || [];
            if (list.length === 0) return;
            const mapped = list.map(msg => ({
                id: msg.id,
                pseudo: msg.pseudo || msg.username || 'Anonyme',
                text: msg.message || msg.text || '',
                timestamp: this.formatTime(msg.created_at),
                own: (msg.pseudo || msg.username) === this.pseudo,
                created_at: msg.created_at
            }));
            this.messages = mapped.reverse();
            this.renderMessages();
            this.scrollToBottom();
        } catch (e) {
            logger.debug('Historique chat non disponible', e);
        }
    }

    /**
     * Attacher les écouteurs d'événements
     */
    attachEventListeners() {
        // Bouton d'envoi de message
        const sendBtn = document.getElementById(this.sendButtonId);
        if (sendBtn) {
            sendBtn.addEventListener('click', () => this.sendMessage());
        }
        
        // Bouton de nettoyage du chat
        const clearBtn = document.getElementById(this.clearChatBtnId);
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.showClearModal());
        }
        
        // Bouton de confirmation du clear
        const clearConfirmBtn = document.getElementById('chat-widget-clear-confirm');
        if (clearConfirmBtn) {
            clearConfirmBtn.addEventListener('click', () => this.confirmClearChat());
        }
        
        // Bouton d'annulation du clear
        const clearCancelBtn = document.getElementById('chat-widget-clear-cancel');
        if (clearCancelBtn) {
            clearCancelBtn.addEventListener('click', () => this.hideClearModal());
        }
    }

    /**
     * Charger le pseudo depuis la session utilisateur
     */
    loadPseudo() {
        const username = localStorage.getItem('workspace_username');
        return username || null;
    }

    /**
     * Sauvegarder le pseudo (non utilisé, lecture seule depuis session)
     */
    savePseudo(pseudo) {
        this.pseudo = pseudo;
    }

    /**
     * Confirmer le pseudo (non utilisé, username vient de la session)
     */
    confirmPseudo() {
        const username = localStorage.getItem('workspace_username');
        if (!username) {
            logger.warn('Aucun utilisateur connecté');
            return;
        }
        
        this.savePseudo(username);
        
        if (this.webSocket.isConnected()) {
            this.webSocket.setPseudo(username).catch(err => {
                logger.error('Erreur lors de l\'envoi du pseudo', err);
            });
        }
        
        this.messages.forEach(msg => {
            msg.own = msg.pseudo === this.pseudo;
        });
        
        this.displayPseudo();
        this.renderMessages();
    }

    /**
     * Afficher le pseudo avec compteur d'utilisateurs
     */
    displayPseudo() {
        const pseudoDisplay = document.getElementById(this.pseudoDisplayId);
        
        if (!pseudoDisplay) return;
        
        if (this.pseudo) {
            const displayCount = this.userCount > 0 ? this.userCount : 0;
            pseudoDisplay.innerHTML = `
                <div class="chat-pseudo-confirmed">
                    <div class="chat-pseudo-info">
                        <i class="fas fa-user"></i>
                        <span>${this.escapeHtml(this.pseudo)}</span>
                    </div>
                    <div class="chat-user-count">
                        <i class="fas fa-users"></i>
                        <span>${displayCount}</span>
                    </div>
                </div>
            `;
        } else {
            pseudoDisplay.innerHTML = `
                <div class="chat-pseudo-required">
                    <i class="fas fa-exclamation-circle"></i>
                    <span>Connectez-vous pour utiliser le chat</span>
                </div>
            `;
        }
    }

    /**
     * Envoyer un message via WebSocket
     */
    async sendMessage() {
        const input = document.getElementById(this.inputId);
        if (!input) return;
        
        const text = input.value.trim();
        
        if (!text) return;
        if (!this.pseudo) {
            alert('Vous devez être connecté pour envoyer des messages');
            return;
        }
        
        if (text.length > 5000) {
            logger.warn('Message trop long');
            return;
        }
        
        try {
            if (!this.webSocket.isConnected()) {
                logger.error('WebSocket non connecté');
                return;
            }
            
            const now = new Date().toISOString();
            const tempId = 'temp-' + Date.now();
            this.messages.push({
                id: tempId,
                pseudo: this.pseudo,
                text,
                timestamp: this.formatTime(now),
                own: true,
                created_at: now
            });
            this.renderMessages();
            this.scrollToBottom();
            
            await this.webSocket.sendMessage(this.pseudo, text);
            input.value = '';
        } catch (error) {
            logger.error('Erreur envoi message', error);
            const idx = this.messages.findIndex(m => m.own && m.text === text && m.id && String(m.id).startsWith('temp-'));
            if (idx !== -1) this.messages.splice(idx, 1);
            this.renderMessages();
        }
    }

    /**
     * Démarrer le polling des nouveaux messages
     */
    /**
     * Afficher les messages
     */
    renderMessages() {
        const container = document.getElementById(this.messagesContainerId);
        logger.debug('renderMessages appelé', { 
            container: !!container, 
            messagesCount: this.messages.length, 
            containerId: this.messagesContainerId 
        });
        if (!container) {
            logger.error(`Container pas trouvé: ${this.messagesContainerId}`);
            return;
        }
        
        if (this.messages.length === 0) {
            container.innerHTML = '<div class="chat-widget-empty">Aucun message pour le moment</div>';
            container.className = 'chat-widget-empty';
            return;
        }
        
        // Retirer la classe empty si elle existe
        container.classList.remove('chat-widget-empty');
        
        container.innerHTML = this.messages.map(msg => {
            const className = msg.own ? 'chat-message own' : 'chat-message other';
            const sanitized = this.sanitizeMessage(msg.text);
            return `
                <div class="${className}">
                    <div class="chat-message-pseudo">${this.sanitizeMessage(msg.pseudo)}</div>
                    <div class="chat-message-content">
                        <div class="chat-message-text">${sanitized}</div>
                    </div>
                    <div class="chat-message-time">${msg.timestamp}</div>
                </div>
            `;
        }).join('');
        
        logger.debug(`Messages rendus: ${this.messages.length}`);
        // Scroll vers le bas
        this.scrollToBottom();
    }

    /**
     * Afficher la modal de confirmation du clear
     */
    showClearModal() {
        const clearModal = document.getElementById('chat-widget-clear-modal');
        if (clearModal) {
            clearModal.classList.add('show');
        }
    }

    /**
     * Masquer la modal de confirmation du clear
     */
    hideClearModal() {
        const clearModal = document.getElementById('chat-widget-clear-modal');
        if (clearModal) {
            clearModal.classList.remove('show');
        }
    }

    /**
     * Confirmer et exécuter le clear du chat
     */
    async confirmClearChat() {
        try {
            const pseudo = this.pseudo || localStorage.getItem('userPseudo') || 'Unknown';
            
            // Envoyer le message WebSocket pour supprimer le chat
            this.webSocket?.ws?.send(JSON.stringify({
                type: 'clearChat',
                pseudo: pseudo
            }));
            
            logger.info('Demande de suppression du chat envoyée');
            this.hideClearModal();
        } catch (error) {
            logger.error('Erreur suppression chat', error);
        }
    }

    /**
     * Scroll vers le bas du chat
     */
    scrollToBottom() {
        const container = document.getElementById(this.messagesContainerId);
        if (container) {
            setTimeout(() => {
                container.scrollTop = container.scrollHeight;
            }, 0);
        }
    }

    /**
     * Nettoyer les messages XSS
     */
    sanitizeMessage(text) {
        if (typeof text !== 'string') {
            text = String(text);
        }
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Formater l'heure
     */
    formatTime(isoString) {
        if (!isoString) return '00:00';
        const date = new Date(isoString);
        if (isNaN(date.getTime())) return '00:00';
        return date.toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    /**
     * Destructor - nettoyer quand le widget est fermé
     */
    destroy() {
        // WebSocket se ferme automatiquement
        if (this.webSocket) {
            this.webSocket.disconnect?.();
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

export default ChatManager;
