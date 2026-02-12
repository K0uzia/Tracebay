/**
 * api.js
 * Module API unique et simplifié pour toutes les connexions au serveur
 * Point d'entrée centralisé pour toutes les requêtes HTTP et WebSocket
 */

let config = null;
let initialized = false;

/**
 * Initialiser la configuration (appelé automatiquement au premier usage)
 */
async function init() {
    if (initialized) return;
    
    try {
        const response = await fetch('./config/connection.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        config = await response.json();
        const mode = config.mode || 'local';
        const env = config.environments[mode] || config.environments.local;
        
        // Exposer globalement pour compatibilité
        window.SERVER_CONFIG = {
            serverUrl: env.url,
            serverWsUrl: env.ws,
            environment: mode,
            getEndpoint: (path) => getEndpointPath(path),
            getFullUrl: (endpoint) => `${env.url}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`
        };
        
        window.APP_CONFIG = {
            serverUrl: env.url,
            serverWsUrl: env.ws,
            healthCheckInterval: config.connection?.healthCheckInterval || 30000,
            reconnectDelay: config.connection?.reconnectDelay || 3000,
            maxReconnectAttempts: config.connection?.maxReconnectAttempts || 5
        };
        
        initialized = true;
        console.log(`✅ API Config initialisé: ${mode} -> ${env.url}`);
    } catch (error) {
        console.error('❌ Erreur chargement config:', error);
        // Fallback
        const fallback = { url: 'http://localhost:8060', ws: 'ws://localhost:8060' };
        window.SERVER_CONFIG = {
            serverUrl: fallback.url,
            serverWsUrl: fallback.ws,
            getEndpoint: () => '',
            getFullUrl: (endpoint) => `${fallback.url}${endpoint}`
        };
        window.APP_CONFIG = {
            serverUrl: fallback.url,
            serverWsUrl: fallback.ws
        };
        initialized = true;
    }
}

/**
 * Obtenir le chemin d'un endpoint depuis la config (ex: 'auth.login' -> '/api/auth/login')
 */
function getEndpointPath(path) {
    if (!config?.endpoints) return '';
    
    const parts = path.split('.');
    let current = config.endpoints;
    
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
function getUrl(endpointPath) {
    const serverUrl = window.SERVER_CONFIG?.serverUrl || 'http://localhost:8060';
    
    // Si c'est déjà une URL complète
    if (endpointPath.startsWith('http://') || endpointPath.startsWith('https://')) {
        return endpointPath;
    }
    
    // Chercher dans la config
    const endpoint = getEndpointPath(endpointPath);
    if (endpoint) {
        return `${serverUrl}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
    }
    
    // Fallback : utiliser le chemin tel quel
    return `${serverUrl}${endpointPath.startsWith('/') ? endpointPath : '/' + endpointPath}`;
}

/**
 * Obtenir le token d'authentification depuis localStorage
 */
function getAuthToken() {
    return localStorage.getItem('workspace_jwt');
}

/**
 * Créer les headers avec authentification si disponible
 */
function createHeaders(customHeaders = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...customHeaders
    };
    
    const token = getAuthToken();
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    return headers;
}

/**
 * Effectuer une requête HTTP
 */
async function request(method, endpointPath, data = null, options = {}) {
    await init();
    
    const url = getUrl(endpointPath);
    const headers = createHeaders(options.headers);
    
    const fetchOptions = {
        method,
        headers,
        ...options
    };
    
    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        fetchOptions.body = JSON.stringify(data);
    }
    
    return fetch(url, fetchOptions);
}

/**
 * API simplifiée - Point d'entrée unique pour tous les modules
 */
const api = {
    /**
     * GET request
     */
    async get(endpointPath, options = {}) {
        return request('GET', endpointPath, null, options);
    },
    
    /**
     * POST request
     */
    async post(endpointPath, data = null, options = {}) {
        return request('POST', endpointPath, data, options);
    },
    
    /**
     * PUT request
     */
    async put(endpointPath, data = null, options = {}) {
        return request('PUT', endpointPath, data, options);
    },
    
    /**
     * DELETE request
     */
    async delete(endpointPath, options = {}) {
        return request('DELETE', endpointPath, null, options);
    },
    
    /**
     * Obtenir l'URL du serveur
     */
    getServerUrl() {
        return window.SERVER_CONFIG?.serverUrl || window.APP_CONFIG?.serverUrl || 'http://localhost:8060';
    },
    
    /**
     * Obtenir l'URL WebSocket
     */
    getWsUrl() {
        return window.SERVER_CONFIG?.serverWsUrl || window.APP_CONFIG?.serverWsUrl || 'ws://localhost:8060';
    },
    
    /**
     * Obtenir l'URL complète d'un endpoint
     */
    getUrl(endpointPath) {
        return getUrl(endpointPath);
    },
    
    /**
     * Initialiser manuellement (normalement appelé automatiquement)
     */
    async init() {
        await init();
    }
};

export default api;
