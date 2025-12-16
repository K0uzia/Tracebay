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

class ChatManager {
    constructor(options = {}) {
        console.log('🔧 ChatManager: Construction en cours...');
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
        
        // WebSocket avec serverUrl
        const serverUrl = options.serverUrl || 'http://localhost:8060';
        const wsUrl = serverUrl.replace('http://', 'ws://').replace('https://', 'wss://');
        this.webSocket = new ChatWebSocket({ wsUrl });
        
        // État
        this.pseudo = this.loadPseudo();
        this.messages = [];
        this.userCount = 0;
        this.connectedUsers = [];
        this.securityConfig = options.securityConfig || {};
        
        // Initialiser ChatSecurityManager
        this.securityManager = new ChatSecurityManager(this.securityConfig);
        
        console.log('🔧 ChatManager: Construction finie, init()...');
        this.init();
    }

    /**
     * Initialiser le ChatManager
     */
    async init() {
        console.log('🚀 ChatManager: init() appelé');
        
        // Écouter les changements d'authentification
        window.addEventListener('auth-change', (e) => {
            const user = e.detail?.user;
            const token = e.detail?.token;
            console.log('🔄 ChatManager: Auth changed:', user);
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
        console.log('📊 Avant renderMessages:', { container: !!document.getElementById(this.messagesContainerId), messages: this.messages.length });
        this.renderMessages();
        
        // Attacher les écouteurs d'événements
        this.attachEventListeners();
        
        // Attendre que le WebSocket soit connecté, puis envoyer le pseudo s'il existe
        const connectAndRestoreSession = () => {
            if (this.webSocket.isConnected()) {
                const token = this.getStoredToken();
                if (token) {
                    this.webSocket.authenticate(token);
                }
                if (this.pseudo) {
                    console.log('✨ Reconnexion automatique avec pseudo:', this.pseudo);
                    this.webSocket.setPseudo(this.pseudo).catch(err => {
                        console.error('❌ Erreur reconnexion:', err);
                    });
                }
            } else {
                // Attendre un peu et réessayer
                setTimeout(connectAndRestoreSession, 500);
            }
        };
        
        // Vérifier la connexion
        connectAndRestoreSession();
        
        // Écouter les messages WebSocket
        this.webSocket.onMessage((data) => {
            console.log('📨 Message WebSocket reçu:', data.type, data);
            if (data.type === 'history') {
                console.log('📜 Historique reçu:', data.messages?.length || 0, 'messages');
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
                console.log('💬 Nouveau message complet data:', JSON.stringify(data, null, 2));
                console.log('💬 msg.message:', msg.message, 'Type:', typeof msg.message);
                console.log('💬 msg.pseudo:', msg.pseudo);
                console.log('💬 msg.created_at:', msg.created_at);
                
                // Extraire le texte correctement
                const messageText = typeof msg.message === 'string' ? msg.message : (msg.text || '');
                
                this.messages.push({
                    id: msg.id || Date.now(),
                    pseudo: msg.pseudo || 'Anonyme',
                    text: messageText,
                    timestamp: this.formatTime(msg.created_at),
                    own: msg.pseudo === this.pseudo,
                    created_at: msg.created_at
                });
                console.log('📝 Message ajouté:', this.messages[this.messages.length - 1]);
                this.renderMessages();
                this.scrollToBottom();
            } else if (data.type === 'userCount') {
                console.log('👥 Mise à jour utilisateurs:', data.count, data.users);
                this.userCount = data.count;
                this.connectedUsers = data.users;
                // Mettre à jour l'affichage du compteur d'utilisateurs
                this.displayPseudo();
            } else if (data.type === 'chatCleared') {
                console.log('🗑️ Chat supprimé par:', data.clearedBy);
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
            console.error('❌ Erreur chat:', err);
        });
    }

    getStoredToken() {
        return localStorage.getItem('workspace_jwt');
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
            console.warn('⚠️ Aucun utilisateur connecté');
            return;
        }
        
        this.savePseudo(username);
        
        if (this.webSocket.isConnected()) {
            this.webSocket.setPseudo(username).catch(err => {
                console.error('❌ Erreur lors de l\'envoi du pseudo:', err);
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
            console.warn('⚠️ Message trop long');
            return;
        }
        
        try {
            if (!this.webSocket.isConnected()) {
                console.error('❌ WebSocket non connecté');
                return;
            }
            
            await this.webSocket.sendMessage(this.pseudo, text);
            input.value = '';
        } catch (error) {
            console.error('❌ Erreur envoi message:', error);
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
        console.log('🎨 renderMessages appelé', { container: !!container, messagesCount: this.messages.length, containerId: this.messagesContainerId });
        if (!container) {
            console.error('❌ Container pas trouvé:', this.messagesContainerId);
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
        
        console.log('✅ Messages rendus:', this.messages.length);
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
            const pseudo = this.chatWebSocket?.userPseudo || localStorage.getItem('userPseudo') || 'Unknown';
            
            // Envoyer le message WebSocket pour supprimer le chat
            this.chatWebSocket?.ws?.send(JSON.stringify({
                type: 'clearChat',
                pseudo: pseudo
            }));
            
            logger.info(`✅ Demande de suppression du chat envoyée`);
            this.hideClearModal();
        } catch (error) {
            console.error('❌ Erreur suppression chat:', error);
            logger.error(`❌ Erreur lors de la suppression: ${error.message}`);
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
