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
        
        // WebSocket
        this.webSocket = new ChatWebSocket();
        
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
                console.log('💬 Nouveau message:', msg);
                this.messages.push({
                    id: msg.id,
                    pseudo: msg.pseudo,
                    text: msg.message,
                    timestamp: this.formatTime(msg.created_at),
                    own: msg.pseudo === this.pseudo,
                    created_at: msg.created_at
                });
                console.log('📝 Messages après ajout:', this.messages.length);
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

    /**
     * Attacher les écouteurs d'événements
     */
    attachEventListeners() {
        // Bouton de confirmation du pseudo
        const confirmBtn = document.getElementById(this.pseudoConfirmId);
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => this.confirmPseudo());
        }
        
        // Clavier - Entrée pour confirmer pseudo
        const pseudoInput = document.getElementById(this.pseudoInputId);
        if (pseudoInput) {
            pseudoInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.confirmPseudo();
                }
            });
        }
        
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
     * Charger le pseudo depuis localStorage
     */
    loadPseudo() {
        const stored = localStorage.getItem('chatPseudo');
        return stored || null;
    }

    /**
     * Sauvegarder le pseudo
     */
    savePseudo(pseudo) {
        localStorage.setItem('chatPseudo', pseudo);
        this.pseudo = pseudo;
    }

    /**
     * Confirmer le pseudo
     */
    confirmPseudo() {
        const input = document.getElementById(this.pseudoInputId);
        if (!input) return;
        
        const pseudo = input.value.trim();
        const errorDisplay = document.getElementById(this.pseudoErrorId);
        
        // Valider le pseudo
        if (!pseudo) {
            if (errorDisplay) {
                errorDisplay.textContent = 'Le pseudo ne peut pas être vide';
            }
            return;
        }
        
        if (pseudo.length < 2) {
            if (errorDisplay) {
                errorDisplay.textContent = 'Le pseudo doit faire au moins 2 caractères';
            }
            return;
        }
        
        if (pseudo.length > 20) {
            if (errorDisplay) {
                errorDisplay.textContent = 'Le pseudo ne peut pas dépasser 20 caractères';
            }
            return;
        }
        
        // Valider : pas de caractères dangereux
        if (!/^[a-zA-Z0-9_\-\.àâäéèêëïîôöùûüœæçñ\s]+$/.test(pseudo)) {
            if (errorDisplay) {
                errorDisplay.textContent = 'Le pseudo contient des caractères non autorisés';
            }
            return;
        }
        
        // Sauvegarder et fermer modal
        this.savePseudo(pseudo);
        
        // Envoyer le pseudo au serveur pour notifier la connexion
        if (this.webSocket.isConnected()) {
            this.webSocket.setPseudo(pseudo).catch(err => {
                console.error('❌ Erreur lors de l\'envoi du pseudo:', err);
            });
        } else {
            console.warn('⚠️ WebSocket non connecté, le pseudo sera envoyé à la reconnexion');
        }
        
        // Recalculer msg.own pour tous les messages avec l'ancien pseudo
        this.messages.forEach(msg => {
            msg.own = msg.pseudo === this.pseudo;
        });
        
        this.displayPseudo();
        this.renderMessages();
        
        // Nettoyer l'erreur
        if (errorDisplay) {
            errorDisplay.textContent = '';
        }
    }

    /**
     * Afficher le pseudo avec compteur d'utilisateurs
     */
    displayPseudo() {
        const pseudoModal = document.getElementById('chat-widget-pseudo-modal');
        const pseudoDisplay = document.getElementById(this.pseudoDisplayId);
        const changeBtn = document.getElementById('chat-widget-pseudo-change');
        
        if (!pseudoDisplay) return;
        
        if (this.pseudo) {
            // Utiliser le nombre d'utilisateurs connectés du serveur
            const displayCount = this.userCount > 0 ? this.userCount : 0;
            
            // Pseudo confirmé avec icône et compteur aligné à droite
            pseudoDisplay.innerHTML = `
                <div class="chat-pseudo-confirmed">
                    <div class="chat-pseudo-left">
                        <i class="fas fa-user-circle"></i>
                        <span class="chat-pseudo-text">${this.pseudo}</span>
                    </div>
                    <div class="chat-pseudo-right">
                        <span class="chat-user-count">${displayCount} utilisateur(s)</span>
                    </div>
                </div>
            `;
            
            // Fermer le modal
            if (pseudoModal) {
                pseudoModal.classList.remove('show');
            }
            
            // Afficher et attacher l'écouteur au bouton de changement
            if (changeBtn) {
                changeBtn.classList.add('show');
                changeBtn.removeEventListener('click', this.boundChangeHandler);
                this.boundChangeHandler = () => this.showPseudoModal();
                changeBtn.addEventListener('click', this.boundChangeHandler);
            }
        } else {
            // Pseudo non confirmé - afficher le modal
            if (changeBtn) {
                changeBtn.classList.remove('show');
            }
            this.showPseudoModal();
        }
    }

    /**
     * Afficher le modal de pseudo
     */
    showPseudoModal() {
        const pseudoModal = document.getElementById('chat-widget-pseudo-modal');
        if (pseudoModal) {
            pseudoModal.classList.add('show');
            const input = document.getElementById(this.pseudoInputId);
            if (input) {
                input.focus();
            }
        }
    }

    /**
     * Charger les messages du serveur
     */
    /**
     * Envoyer un message via WebSocket
     */
    async sendMessage() {
        const input = document.getElementById(this.inputId);
        if (!input) return;
        
        const text = input.value.trim();
        
        if (!text) return;
        if (!this.pseudo) {
            console.warn('⚠️ Pseudo non défini');
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
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Formater l'heure
     */
    formatTime(isoString) {
        try {
            const date = new Date(isoString);
            return date.toLocaleTimeString('fr-FR', { 
                hour: '2-digit', 
                minute: '2-digit' 
            });
        } catch (e) {
            return new Date().toLocaleTimeString('fr-FR', { 
                hour: '2-digit', 
                minute: '2-digit' 
            });
        }
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
}

export default ChatManager;
