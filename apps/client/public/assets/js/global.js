/**
 * GLOBAL.JS - Point d'entrée de l'application
 * Importe et initialise tous les modules
 */

import NavManager from './modules/nav/NavManager.js';
import TimeManager from './modules/time/TimeManager.js';
import ChatWidgetManager from './modules/chat/ChatWidgetManager.js';

// Initialiser après le chargement complet du DOM
document.addEventListener('DOMContentLoaded', () => {
    // Ajouter un délai pour laisser le temps à app.js de charger le header
    setTimeout(() => {
        const navBurger = document.getElementById('navBurger');
        const navLinks = document.getElementById('navLinks');
        
        if (navBurger && navLinks) {
            window.navManager = new NavManager();
        } else {
            console.warn('⚠️ Header pas trouvé');
        }
    }, 500);

    // Initialiser TimeManager
    const currentDate = document.getElementById('current-date');
    const currentTime = document.getElementById('current-time');
    
    if (currentDate && currentTime) {
        window.timeManager = new TimeManager({
            dateElementId: 'current-date',
            timeElementId: 'current-time',
            updateInterval: 1000
        });
    }

    // Initialiser ChatWidgetManager (widget flottant)
    try {
        const serverUrl = window.APP_CONFIG?.serverUrl || 'http://localhost:8060';
        window.chatWidgetManager = new ChatWidgetManager({
            wrapperId: 'chat-widget-wrapper',
            buttonId: 'chat-widget-btn',
            panelId: 'chat-widget-panel',
            closeButtonId: 'chat-widget-close',
            pseudoModalId: 'chat-widget-pseudo-modal',
            notificationBadgeId: 'chat-notification-badge',
            serverUrl: serverUrl
        });
    } catch (error) {
        console.error('❌ Erreur initialisation ChatWidgetManager:', error);
    }
    
    // NOTE: ChatManager sera initialisé par app.js après le chargement de la page
    // NOTE: Les éléments page-spécifiques seront initialisés par app.js
});

