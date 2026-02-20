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
import api from '../../config/api.js';
import getLogger from '../../config/Logger.js';
const logger = getLogger();


class ChatWidgetManager {
    constructor(options = {}) {
        // IDs des éléments
        this.wrapperElement = document.getElementById(options.wrapperId || 'chat-widget-wrapper');
        this.buttonElement = document.getElementById(options.buttonId || 'chat-widget-btn');
        this.panelElement = document.getElementById(options.panelId || 'chat-widget-panel');
        this.closeButtonElement = document.getElementById(options.closeButtonId || 'chat-widget-close');
        this.notificationBadgeElement = document.getElementById(options.notificationBadgeId || 'chat-notification-badge');

        // État
        this.isOpen = false;
        this.unreadCount = 0;
        this.lastReadCount = 0;  // Nombre de messages lus la dernière fois qu'on a ouvert le panel
        this.badgeUpdateInterval = null; // Stocker l'intervalle pour le nettoyage
        
        const wsUrl = options.wsUrl || api.getWsUrl();
        if (window.chatManager) {
            this.chatManager = window.chatManager;
        } else {
            this.chatManager = new ChatManager({
                wsUrl,
                pseudoDisplayId: 'chat-widget-pseudo-display',
                messagesContainerId: 'chat-widget-messages',
                inputId: 'chat-widget-input',
                sendButtonId: 'chat-widget-send',
                securityConfig: options.securityConfig || {}
            });
            window.chatManager = this.chatManager;
        }
        this.init();
    }

    /**
     * Initialiser le widget
     */
    init() {
        // Vérifier que les éléments existent
        if (!this.buttonElement || !this.panelElement) {
            logger.error('❌ Éléments widget introuvables');
            return;
        }

        // Attacher les écouteurs d'événements
        this.attachEventListeners();
        
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

        // Clic en dehors du panel pour fermer
        document.addEventListener('click', (e) => {
            if (this.isOpen) {
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
        
        if (this.chatManager.pseudo) {
            setTimeout(() => {
                const input = document.getElementById('chat-widget-input');
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
        // Plus besoin de modal, le username vient de la session
        if (!this.chatManager.pseudo) {
            this.openPanel();
        }
    }

    /**
     * Syncer les messages depuis ChatManager
     */
    syncMessages() {
        // Le ChatManager gère déjà la synchronisation
        // On peut ajouter une logique de notification ici si besoin
        
        // Nettoyer l'intervalle précédent s'il existe
        if (this.badgeUpdateInterval) {
            clearInterval(this.badgeUpdateInterval);
        }
        
        // Rappeler la synchro régulièrement
        this.badgeUpdateInterval = setInterval(() => {
            this.updateNotificationBadge();
        }, 1000);
    }

    /**
     * Nettoie les ressources et arrête les timers
     * @returns {void}
     */
    destroy() {
        if (this.badgeUpdateInterval) {
            clearInterval(this.badgeUpdateInterval);
            this.badgeUpdateInterval = null;
        }
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

    /**
     * Nettoie les ressources et arrête les timers
     * @returns {void}
     */
    destroy() {
        if (this.badgeUpdateInterval) {
            clearInterval(this.badgeUpdateInterval);
            this.badgeUpdateInterval = null;
        }
    }
}

export default ChatWidgetManager;
