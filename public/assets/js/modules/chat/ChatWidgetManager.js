/**
 * ChatWidgetManager - Gestion du widget chat flottant
 * 
 * Responsabilités:
 * - Gérer l'ouverture/fermeture du panel
 * - Afficher le modal de sélection du pseudo
 * - Intégrer avec ChatManager pour les messages
 * - Gérer les notifications
 * - Animations et transitions
 */

import ChatManager from './ChatManager.js';

class ChatWidgetManager {
    constructor(options = {}) {
        // IDs des éléments
        this.wrapperElement = document.getElementById(options.wrapperId || 'chat-widget-wrapper');
        this.buttonElement = document.getElementById(options.buttonId || 'chat-widget-btn');
        this.panelElement = document.getElementById(options.panelId || 'chat-widget-panel');
        this.closeButtonElement = document.getElementById(options.closeButtonId || 'chat-widget-close');
        this.pseudoModalElement = document.getElementById(options.pseudoModalId || 'chat-widget-pseudo-modal');
        this.notificationBadgeElement = document.getElementById(options.notificationBadgeId || 'chat-notification-badge');
        
        // État
        this.isOpen = false;
        this.unreadCount = 0;
        this.lastReadCount = 0;  // Nombre de messages lus la dernière fois qu'on a ouvert le panel
        
        // Initialiser ChatManager
        this.chatManager = new ChatManager({
            pseudoWrapperId: 'chat-widget-pseudo-area',
            pseudoDisplayId: 'chat-widget-pseudo-display',
            pseudoInputId: 'chat-widget-pseudo-input',
            pseudoConfirmId: 'chat-widget-pseudo-confirm',
            pseudoErrorId: 'chat-widget-pseudo-error',
            messagesContainerId: 'chat-widget-messages',
            inputId: 'chat-widget-input',
            sendButtonId: 'chat-widget-send',
            clearChatBtnId: 'chat-widget-clear',
            securityConfig: options.securityConfig || {}
        });
        
        this.init();
    }

    /**
     * Initialiser le widget
     */
    init() {
        // Vérifier que les éléments existent
        if (!this.buttonElement || !this.panelElement) {
            console.error('❌ Éléments widget introuvables');
            return;
        }

        // Attacher les écouteurs d'événements
        this.attachEventListeners();
        
        // Afficher le modal de pseudo si nécessaire
        this.checkAndShowPseudoModal();
        
        // Syncer les messages
        this.syncMessages();
    }

    /**
     * Attacher les écouteurs d'événements
     */
    attachEventListeners() {
        // Bouton flottant
        if (this.buttonElement) {
            this.buttonElement.addEventListener('click', () => this.togglePanel());
        }

        // Bouton fermeture
        if (this.closeButtonElement) {
            this.closeButtonElement.addEventListener('click', () => this.closePanel());
        }

        // Bouton changement pseudo (quand pseudo est confirmé)
        const pseudoChangeBtn = document.getElementById('chat-widget-pseudo-change');
        if (pseudoChangeBtn) {
            pseudoChangeBtn.addEventListener('click', () => this.showPseudoModal());
        }

        // Clavier - Entrée pour envoyer message
        const inputElement = document.getElementById('chat-widget-input');
        if (inputElement) {
            inputElement.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.chatManager.sendMessage();
                }
            });
        }

        // Clavier - Échap pour fermer le panel
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.closePanel();
            }
        });

        // Événement de changement de pseudo
        window.addEventListener('pseudoChanged', (e) => {
            const newPseudo = e.detail.pseudo;
            this.hidePseudoModal();
            this.showPseudoChangeButton();
            
            // Mettre à jour les messages avec le nouveau pseudo
            this.chatManager.updateMessagesWithNewPseudo(newPseudo);
        });

        // Clic en dehors du panel pour fermer
        document.addEventListener('click', (e) => {
            if (this.isOpen) {
                // Vérifier si le clic est en dehors du panel et du bouton
                const clickedInsidePanel = this.panelElement && this.panelElement.contains(e.target);
                const clickedOnButton = this.buttonElement && this.buttonElement.contains(e.target);
                
                if (!clickedInsidePanel && !clickedOnButton) {
                    this.closePanel();
                }
            }
        });
    }

    /**
     * Toggler l'ouverture/fermeture du panel
     */
    togglePanel() {
        if (this.isOpen) {
            this.closePanel();
        } else {
            this.openPanel();
        }
    }

    /**
     * Ouvrir le panel
     */
    openPanel() {
        if (this.isOpen) return;
        
        this.isOpen = true;
        this.panelElement.classList.add('open');
        
        // Marquer tous les messages comme lus au moment de l'ouverture
        if (this.chatManager.messages) {
            this.lastReadCount = this.chatManager.messages.length;
        }
        
        // Réinitialiser les notifications
        this.clearNotifications();
        
        // Mettre à jour les messages à l'affichage du panel
        this.chatManager.renderMessages();
        
        // Focus sur l'input si pseudo confirmé
        if (this.chatManager.pseudo) {
            setTimeout(() => {
                const input = document.getElementById('chat-widget-input');
                if (input) input.focus();
            }, 300);
        } else {
            // Focus sur input pseudo du modal si pseudo pas encore défini
            setTimeout(() => {
                const input = document.getElementById('chat-widget-pseudo-input');
                if (input) input.focus();
            }, 300);
        }
    }

    /**
     * Fermer le panel
     */
    closePanel() {
        if (!this.isOpen) return;
        
        this.isOpen = false;
        this.panelElement.classList.remove('open');
    }

    /**
     * Vérifier et afficher le modal de pseudo si nécessaire
     */
    checkAndShowPseudoModal() {
        if (!this.chatManager.pseudo) {
            this.showPseudoModal();
            this.openPanel();
        } else {
            this.hidePseudoModal();
            this.showPseudoChangeButton();
        }
    }

    /**
     * Afficher le modal de pseudo
     */
    showPseudoModal() {
        // Masquer le bouton de changement de pseudo
        this.hidePseudoChangeButton();
        
        if (this.pseudoModalElement) {
            this.pseudoModalElement.classList.add('show');
            
            // Force le focus avec un délai court
            setTimeout(() => {
                const input = document.getElementById('chat-widget-pseudo-input');
                if (input) {
                    input.focus();
                    input.click(); // Assurer le focus
                    input.select(); // Sélectionner le texte s'il y en a
                }
            }, 100);
        }
    }

    /**
     * Masquer le modal de pseudo
     */
    hidePseudoModal() {
        if (this.pseudoModalElement) {
            this.pseudoModalElement.classList.remove('show');
        }
    }

    /**
     * Afficher le bouton de changement de pseudo
     */
    showPseudoChangeButton() {
        const btn = document.getElementById('chat-widget-pseudo-change');
        if (btn) {
            btn.classList.add('show');
        }
    }

    /**
     * Masquer le bouton de changement de pseudo
     */
    hidePseudoChangeButton() {
        const btn = document.getElementById('chat-widget-pseudo-change');
        if (btn) {
            btn.classList.remove('show');
        }
    }

    /**
     * Syncer les messages depuis ChatManager
     */
    syncMessages() {
        // Le ChatManager gère déjà la synchronisation
        // On peut ajouter une logique de notification ici si besoin
        
        // Rappeler la synchro régulièrement
        setInterval(() => {
            this.updateNotificationBadge();
        }, 1000);
    }

    /**
     * Mettre à jour le badge de notification
     * Compte les nouveaux messages reçus (own: false) depuis la dernière ouverture
     */
    updateNotificationBadge() {
        if (!this.chatManager.messages) return;
        
        if (this.isOpen) {
            // Panel ouvert = pas de badge
            this.clearNotifications();
            return;
        }
        
        // Panel fermé = compter les nouveaux messages reçus non lus
        // Les messages reçus ont la propriété own: false
        // On compte seulement depuis la dernière fois qu'on a ouvert le panel
        const newMessages = this.chatManager.messages.slice(this.lastReadCount);
        const unreadCount = newMessages.filter(msg => msg.own === false).length;
        
        if (unreadCount > 0) {
            if (this.notificationBadgeElement) {
                this.notificationBadgeElement.textContent = unreadCount;
                this.notificationBadgeElement.classList.add('show');
            }
        } else {
            this.clearNotifications();
        }
    }

    /**
     * Effacer les notifications
     */
    clearNotifications() {
        if (this.notificationBadgeElement) {
            this.notificationBadgeElement.classList.remove('show');
            this.notificationBadgeElement.textContent = '0';
        }
        // Marquer comme lu
        this.unreadCount = 0;
    }

    /**
     * Obtenir le ChatManager
     */
    getChatManager() {
        return this.chatManager;
    }

    /**
     * Afficher une notification toast (optionnel)
     */
    showNotification(message, type = 'info') {
        // A implementer si besoin
    }
}

export default ChatWidgetManager;
