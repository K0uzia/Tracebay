/**
 * ChatManager - Gestion des messages du chat
 * 
 * Responsabilités:
 * - Gérer le pseudo de l'utilisateur
 * - Persister les messages en localStorage
 * - Valider les messages (sécurité)
 * - Intégrer avec ChatSecurityManager
 */

import ChatSecurityManager from './ChatSecurityManager.js';

class ChatManager {
    constructor(options = {}) {
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
        
        // État
        this.pseudo = this.loadPseudo();
        this.messages = this.loadMessages();
        this.securityConfig = options.securityConfig || {};
        
        // Initialiser ChatSecurityManager
        this.securityManager = new ChatSecurityManager(this.securityConfig);
        
        console.log('🚀 ChatManager créé');
        this.init();
    }

    /**
     * Initialiser le ChatManager
     */
    init() {
        console.log('🎯 Initialisation ChatManager');
        
        // Afficher le pseudo
        this.displayPseudo();
        
        // Afficher les messages
        this.renderMessages();
        
        // Attacher les écouteurs d'événements
        this.attachEventListeners();
        
        console.log('✅ ChatManager initialisé');
    }

    /**
     * Attacher les écouteurs d'événements
     */
    attachEventListeners() {
        console.log('🔗 Attachement des écouteurs ChatManager');
        
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
        
        console.log('✅ Écouteurs attachés');
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
        
        // Valider : pas de caractères dangereux simples (XSS basique)
        if (!/^[a-zA-Z0-9_\-\.àâäéèêëïîôöùûüœæçñ\s]+$/.test(pseudo)) {
            if (errorDisplay) {
                errorDisplay.textContent = 'Le pseudo contient des caractères non autorisés';
            }
            return;
        }
        
        // Effacer le message d'erreur
        if (errorDisplay) {
            errorDisplay.textContent = '';
        }
        
        // Sauvegarder le pseudo
        this.savePseudo(pseudo);
        
        // Effacer l'input
        input.value = '';
        
        // Afficher le pseudo
        this.displayPseudo();
        
        // Dispacher un événement pour notifier ChatWidgetManager
        window.dispatchEvent(new CustomEvent('pseudoChanged', { detail: { pseudo } }));
        
        console.log('✅ Pseudo confirmé:', pseudo);
    }

    /**
     * Afficher le pseudo actuel
     */
    displayPseudo() {
        const display = document.getElementById(this.pseudoDisplayId);
        if (display) {
            if (this.pseudo) {
                display.innerHTML = `<i class="fas fa-user-circle"></i> ${this.pseudo}`;
            } else {
                display.innerHTML = '';
            }
        }
    }

    /**
     * Charger les messages depuis localStorage
     */
    loadMessages() {
        const stored = localStorage.getItem('chat_messages');
        if (!stored) return [];
        
        try {
            return JSON.parse(stored);
        } catch (e) {
            console.error('❌ Erreur lors du chargement des messages:', e);
            return [];
        }
    }

    /**
     * Sauvegarder les messages
     */
    saveMessages() {
        localStorage.setItem('chat_messages', JSON.stringify(this.messages));
    }

    /**
     * Envoyer un message
     */
    sendMessage() {
        const input = document.getElementById(this.inputId);
        if (!input) return;
        
        const text = input.value.trim();
        
        if (!text) return;
        if (!this.pseudo) {
            console.warn('⚠️ Pseudo non défini');
            return;
        }
        
        // Simple validation : pas vide, longueur max
        if (text.length > 500) {
            console.warn('⚠️ Message trop long');
            return;
        }
        
        // Créer le message
        const message = {
            id: Date.now(),
            pseudo: this.pseudo,
            text: text,
            timestamp: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
            own: true  // C'est un message que j'envoie
        };
        
        // Ajouter le message
        this.messages.push(message);
        
        // Sauvegarder
        this.saveMessages();
        
        // Effacer l'input
        input.value = '';
        
        // Afficher les messages
        this.renderMessages();
        
        // Scroll vers le bas
        this.scrollToBottom();
        
        console.log('✅ Message envoyé');
    }

    /**
     * Afficher les messages
     */
    renderMessages() {
        const container = document.getElementById(this.messagesContainerId);
        if (!container) return;
        
        if (this.messages.length === 0) {
            container.innerHTML = '<div class="chat-widget-empty">Aucun message pour le moment</div>';
            return;
        }
        
        container.innerHTML = this.messages.map(msg => {
            const className = msg.own ? 'chat-message own' : 'chat-message other';
            const sanitized = this.sanitizeMessage(msg.text);
            return `
                <div class="${className}">
                    <div class="chat-message-pseudo">${msg.pseudo}</div>
                    <div class="chat-message-content">
                        <div class="chat-message-text">${sanitized}</div>
                    </div>
                    <div class="chat-message-time">${msg.timestamp}</div>
                </div>
            `;
        }).join('');
        
        // Scroll vers le bas
        this.scrollToBottom();
    }

    /**
     * Afficher la modal de confirmation du clear
     */
    showClearModal() {
        console.log('🗑️ Affichage modal de confirmation du clear');
        const clearModal = document.getElementById('chat-widget-clear-modal');
        if (clearModal) {
            clearModal.classList.add('show');
        }
    }

    /**
     * Masquer la modal de confirmation du clear
     */
    hideClearModal() {
        console.log('❌ Fermeture modal de clear');
        const clearModal = document.getElementById('chat-widget-clear-modal');
        if (clearModal) {
            clearModal.classList.remove('show');
        }
    }

    /**
     * Confirmer et exécuter le clear du chat
     */
    confirmClearChat() {
        console.log('✅ Suppression de tous les messages...');
        this.messages = [];
        this.saveMessages();
        this.renderMessages();
        this.hideClearModal();
        console.log('🗑️ Chat complètement nettoyé');
    }

    /**
     * Scroll vers le bas du chat
     */
    scrollToBottom() {
        const container = document.getElementById(this.messagesContainerId);
        if (container) {
            container.scrollTop = container.scrollHeight;
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
     * Ajouter un message reçu (pour simulation ou intégration avec backend)
     */
    addReceivedMessage(pseudo, text) {
        const message = {
            id: Date.now(),
            pseudo: pseudo,
            text: text,
            timestamp: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
            own: false  // C'est un message reçu
        };
        
        this.messages.push(message);
        this.saveMessages();
        this.renderMessages();
        
        console.log('✅ Message reçu de', pseudo);
    }

    /**
     * Mettre à jour tous les messages du pseudo changé
     * Si l'utilisateur change de pseudo, on met à jour les anciens messages
     */
    updateMessagesWithNewPseudo(newPseudo) {
        // Chercher les anciens pseudos de l'utilisateur
        // On identifie les messages avec own: true et pseudo différent du nouveau
        const oldPseudos = new Set();
        
        this.messages.forEach(msg => {
            if (msg.own === true && msg.pseudo !== newPseudo) {
                oldPseudos.add(msg.pseudo);
            }
        });
        
        // Mettre à jour les messages avec les anciens pseudos
        let updatedCount = 0;
        oldPseudos.forEach(oldPseudo => {
            this.messages.forEach(msg => {
                if (msg.own === true && msg.pseudo === oldPseudo) {
                    msg.pseudo = newPseudo;
                    updatedCount++;
                }
            });
        });
        
        // Sauvegarder et re-afficher
        this.saveMessages();
        this.renderMessages();
        
        console.log(`✅ ${updatedCount} messages mis à jour avec le nouveau pseudo "${newPseudo}"`);
    }
}

export default ChatManager;
