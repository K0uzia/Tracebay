/**
 * ApiClient.js
 * Client API centralisé pour toutes les requêtes HTTP vers le serveur
 * Utilise ServerConfig pour obtenir les URLs et endpoints
 */

class ApiClient {
    constructor() {
        this.serverConfig = null;
    }

    /**
     * Initialiser le client API
     */
    async initialize() {
        if (!this.serverConfig) {
            const { default: getServerConfig } = await import('./ServerConfig.js');
            this.serverConfig = await getServerConfig();
        }
    }

    /**
     * Obtenir l'URL complète d'un endpoint
     */
    getUrl(endpointPath) {
        if (!this.serverConfig) {
            const serverUrl = window.SERVER_CONFIG?.serverUrl || window.APP_CONFIG?.serverUrl || 'http://localhost:8060';
            return endpointPath.startsWith('http') ? endpointPath : `${serverUrl}${endpointPath.startsWith('/') ? endpointPath : '/' + endpointPath}`;
        }
        return this.serverConfig.getFullUrl(this.serverConfig.getEndpoint(endpointPath) || endpointPath);
    }

    /**
     * Effectuer une requête GET
     */
    async get(endpointPath, options = {}) {
        await this.initialize();
        const url = this.getUrl(endpointPath);
        return fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });
    }

    /**
     * Effectuer une requête POST
     */
    async post(endpointPath, data = null, options = {}) {
        await this.initialize();
        const url = this.getUrl(endpointPath);
        return fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            body: data ? JSON.stringify(data) : undefined,
            ...options
        });
    }

    /**
     * Effectuer une requête PUT
     */
    async put(endpointPath, data = null, options = {}) {
        await this.initialize();
        const url = this.getUrl(endpointPath);
        return fetch(url, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            body: data ? JSON.stringify(data) : undefined,
            ...options
        });
    }

    /**
     * Effectuer une requête DELETE
     */
    async delete(endpointPath, options = {}) {
        await this.initialize();
        const url = this.getUrl(endpointPath);
        return fetch(url, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });
    }

    /**
     * Obtenir l'URL du serveur
     */
    getServerUrl() {
        return this.serverConfig?.getServerUrl() || window.SERVER_CONFIG?.serverUrl || window.APP_CONFIG?.serverUrl || 'http://localhost:8060';
    }

    /**
     * Obtenir l'URL WebSocket
     */
    getWsUrl() {
        return this.serverConfig?.getServerWsUrl() || window.SERVER_CONFIG?.serverWsUrl || window.APP_CONFIG?.serverWsUrl || 'ws://localhost:8060';
    }
}

// Singleton
let apiClientInstance = null;

export default async function getApiClient() {
    if (!apiClientInstance) {
        apiClientInstance = new ApiClient();
        await apiClientInstance.initialize();
    }
    return apiClientInstance;
}

// Export aussi la classe pour utilisation directe
export { ApiClient };
