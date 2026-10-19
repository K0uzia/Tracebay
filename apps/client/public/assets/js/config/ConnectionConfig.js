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
     * Découverte du serveur via beacon UDP
     * Nécessite un module serveur qui envoie des beacons UDP
     */
    async discoverServer() {
        try {
            // Essayer une requête locale d'abord (plus rapide)
            const health = await this.testServerHealth('http://localhost:8060');
            if (health) {
                return {
                    url: 'http://localhost:8060',
                    ws: 'ws://localhost:8060'
                };
            }

            // Scanner les adresses locales courantes
            const commonIPs = [
                'http://192.168.1.1:4000',
                'http://192.168.1.62:4000',
                'http://192.168.0.1:4000',
                'http://10.0.0.1:4000'
            ];

            for (const url of commonIPs) {
                const health = await this.testServerHealth(url);
                if (health) {
                    return {
                        url,
                        ws: url.replace('http', 'ws')
                    };
                }
            }

            return null;
        } catch (error) {
            console.error('❌ Erreur découverte serveur:', error);
            return null;
        }
    }

    /**
     * Tester la santé d'un serveur
     */
    async testServerHealth(baseUrl) {
        try {
            const healthEndpoint = '/api/health';
            const response = await fetch(`${baseUrl}${healthEndpoint}`, {
                method: 'GET',
                timeout: 2000
            });

            if (response.ok) {
                const data = await response.json();
                if (data.status === 'ok') {
                    return true;
                }
            }
        } catch (error) {
            // Erreur attendue si le serveur n'est pas disponible
        }
        return false;
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
