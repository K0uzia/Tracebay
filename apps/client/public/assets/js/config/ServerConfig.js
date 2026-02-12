/**
 * ServerConfig.js
 * Configuration centralisée du serveur et des endpoints API
 * Charge la config depuis connection.json et la rend accessible globalement
 */

class ServerConfig {
    constructor() {
        this.config = null;
        this.currentEnvironment = null;
        this.serverUrl = null;
        this.serverWsUrl = null;
        this.endpoints = null;
        this.initialized = false;
    }

    /**
     * Initialiser la configuration
     */
    async initialize() {
        if (this.initialized) {
            return this;
        }

        try {
            // Charger la config depuis le fichier JSON
            const response = await fetch('./config/connection.json');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            this.config = await response.json();
            
            // Déterminer l'environnement actuel
            const mode = this.config.mode || 'local';
            this.currentEnvironment = this.config.environments[mode] || this.config.environments.local;
            
            if (!this.currentEnvironment) {
                throw new Error(`Environnement "${mode}" non trouvé dans la configuration`);
            }

            // Extraire les URLs
            this.serverUrl = this.currentEnvironment.url;
            this.serverWsUrl = this.currentEnvironment.ws;
            this.endpoints = this.config.endpoints;

            // Exposer globalement
            window.SERVER_CONFIG = {
                serverUrl: this.serverUrl,
                serverWsUrl: this.serverWsUrl,
                environment: mode,
                endpoints: this.endpoints,
                connection: this.config.connection,
                getEndpoint: (path) => this.getEndpoint(path),
                getFullUrl: (endpoint) => this.getFullUrl(endpoint),
                getWsUrl: () => this.serverWsUrl
            };

            // Compatibilité avec APP_CONFIG existant
            window.APP_CONFIG = {
                ...window.APP_CONFIG,
                serverUrl: this.serverUrl,
                serverWsUrl: this.serverWsUrl,
                healthCheckInterval: this.config.connection.healthCheckInterval,
                reconnectDelay: this.config.connection.reconnectDelay,
                maxReconnectAttempts: this.config.connection.maxReconnectAttempts
            };

            this.initialized = true;
            console.log(`✅ ServerConfig initialisé: Mode="${mode}", URL="${this.serverUrl}"`);
            
            return this;
        } catch (error) {
            console.error('❌ Erreur chargement ServerConfig:', error);
            // Fallback vers valeurs par défaut
            this.serverUrl = 'http://localhost:8060';
            this.serverWsUrl = 'ws://localhost:8060';
            this.endpoints = {};
            this.initialized = true;
            
            window.SERVER_CONFIG = {
                serverUrl: this.serverUrl,
                serverWsUrl: this.serverWsUrl,
                environment: 'local',
                endpoints: {},
                getEndpoint: () => '',
                getFullUrl: (endpoint) => `${this.serverUrl}${endpoint}`,
                getWsUrl: () => this.serverWsUrl
            };
            
            return this;
        }
    }

    /**
     * Obtenir un endpoint par chemin (supporte les chemins imbriqués)
     * Exemple: getEndpoint('auth.login') -> '/api/auth/login'
     */
    getEndpoint(path) {
        if (!this.endpoints) return '';
        
        const parts = path.split('.');
        let current = this.endpoints;
        
        for (const part of parts) {
            if (current && typeof current === 'object' && part in current) {
                current = current[part];
            } else {
                return '';
            }
        }
        
        return typeof current === 'string' ? current : '';
    }

    /**
     * Obtenir l'URL complète d'un endpoint
     */
    getFullUrl(endpoint) {
        if (!endpoint) return this.serverUrl;
        if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
            return endpoint;
        }
        return `${this.serverUrl}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
    }

    /**
     * Obtenir l'URL du serveur
     */
    getServerUrl() {
        return this.serverUrl || 'http://localhost:8060';
    }

    /**
     * Obtenir l'URL WebSocket
     */
    getServerWsUrl() {
        return this.serverWsUrl || 'ws://localhost:8060';
    }

    /**
     * Obtenir la configuration de connexion
     */
    getConnectionConfig() {
        return this.config?.connection || {
            healthCheckInterval: 30000,
            reconnectDelay: 3000,
            maxReconnectAttempts: 5,
            beaconTimeout: 5000
        };
    }
}

// Singleton
let serverConfigInstance = null;

export default async function getServerConfig() {
    if (!serverConfigInstance) {
        serverConfigInstance = new ServerConfig();
        await serverConfigInstance.initialize();
    }
    return serverConfigInstance;
}

// Export aussi la classe pour utilisation directe
export { ServerConfig };
