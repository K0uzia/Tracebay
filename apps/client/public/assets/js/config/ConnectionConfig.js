/**
 * ConnectionConfig.js
 * Wrapper simplifié pour la configuration de connexion
 * Utilise le module api.js centralisé
 */

import api from './api.js';

class ConnectionConfig {
    constructor() {
        this.serverUrl = null;
        this.serverWsUrl = null;
        this.serverConnected = false;
        this.discovered = false;
    }

    /**
     * Initialiser la configuration
     */
    async initialize() {
        // Initialiser le module API (charge la config automatiquement)
        await api.init();
        
        // Récupérer les URLs depuis la config
        this.serverUrl = api.getServerUrl();
        this.serverWsUrl = api.getWsUrl();
        
        console.log(`🔗 Configuration: URL="${this.serverUrl}"`);

        // Exposer globalement (déjà fait par api.js)
        window.APP_CONFIG = {
            ...window.APP_CONFIG,
            serverUrl: this.serverUrl,
            serverWsUrl: this.serverWsUrl,
            serverConnected: this.serverConnected
        };
    }

    /**
     * Mettre à jour l'état de connexion
     */
    setConnected(connected) {
        this.serverConnected = connected;
        if (window.APP_CONFIG) {
            window.APP_CONFIG.serverConnected = connected;
        }
    }

    /**
     * Obtenir l'URL du serveur
     */
    getServerUrl() {
        return this.serverUrl || (this.serverConfig?.getServerUrl()) || 'http://localhost:8060';
    }

    /**
     * Obtenir l'URL WebSocket
     */
    getServerWsUrl() {
        return this.serverWsUrl || (this.serverConfig?.getServerWsUrl()) || 'ws://localhost:8060';
    }
}

export default ConnectionConfig;
