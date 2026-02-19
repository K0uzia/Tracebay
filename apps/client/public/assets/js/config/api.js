/**
 * @fileoverview Module API unique et simplifié pour toutes les connexions au serveur
 * Point d'entrée centralisé pour toutes les requêtes HTTP et WebSocket
 * @module api
 */

import getLogger from './Logger.js';
import getApiCache from './ApiCache.js';

const logger = getLogger();
const cache = getApiCache();

let config = null;
let initialized = false;

/**
 * Initialise la configuration API en chargeant connection.json
 * Appelé automatiquement au premier usage de l'API
 * @async
 * @function init
 * @returns {Promise<void>}
 * @throws {Error} Si le chargement de la configuration échoue
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
        logger.info(`API Config initialisé: ${mode} -> ${env.url}`);
    } catch (error) {
        logger.error('Erreur chargement config', error);
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
 * Obtient le chemin d'un endpoint depuis la configuration
 * @param {string} path - Chemin de l'endpoint (ex: 'auth.login')
 * @returns {string} Chemin complet de l'endpoint (ex: '/api/auth/login') ou chaîne vide si non trouvé
 * @example
 * getEndpointPath('auth.login') // '/api/auth/login'
 * getEndpointPath('shortcuts.categories.list') // '/api/shortcuts/categories'
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
 * Obtient l'URL complète d'un endpoint
 * @param {string} endpointPath - Chemin de l'endpoint (ex: 'auth.login' ou '/api/auth/login')
 * @returns {string} URL complète (ex: 'http://server:4000/api/auth/login')
 * @example
 * getUrl('auth.login') // 'http://192.168.1.62:4000/api/auth/login'
 * getUrl('/api/health') // 'http://192.168.1.62:4000/api/health'
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
 * Obtient le token JWT d'authentification depuis localStorage
 * @returns {string|null} Token JWT ou null si non présent
 */
function getAuthToken() {
    return localStorage.getItem('workspace_jwt');
}

/**
 * Crée les headers HTTP avec authentification si disponible
 * @param {Object} [customHeaders={}] - Headers personnalisés à ajouter
 * @returns {Object} Headers HTTP avec Content-Type et Authorization si token présent
 * @example
 * createHeaders() // { 'Content-Type': 'application/json' }
 * createHeaders({ 'X-Custom': 'value' }) // { 'Content-Type': 'application/json', 'X-Custom': 'value', 'Authorization': 'Bearer token' }
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
 * Effectue une requête HTTP vers le serveur avec cache pour les GET
 * @async
 * @param {string} method - Méthode HTTP (GET, POST, PUT, DELETE, PATCH)
 * @param {string} endpointPath - Chemin de l'endpoint (ex: 'auth.login')
 * @param {Object|null} [data=null] - Données à envoyer (pour POST/PUT/PATCH)
 * @param {Object} [options={}] - Options supplémentaires pour fetch
 * @param {boolean} [options.useCache=true] - Utiliser le cache pour les GET (défaut: true)
 * @param {number} [options.cacheTTL] - Durée de vie du cache en ms (défaut: 60000)
 * @returns {Promise<Response>} Réponse fetch
 * @throws {Error} Si la requête échoue
 * @example
 * await request('GET', 'health')
 * await request('POST', 'auth.login', { username: 'user', password: 'pass' })
 */
async function request(method, endpointPath, data = null, options = {}) {
    await init();
    
    const url = getUrl(endpointPath);
    const headers = createHeaders(options.headers);
    
    // Vérifier le cache pour les requêtes GET
    const useCache = options.useCache !== false && method === 'GET';
    const cacheKey = useCache ? cache.generateKey(endpointPath, { method, body: null }) : null;
    
    if (useCache && cacheKey && cache.has(cacheKey)) {
        const cachedData = cache.get(cacheKey);
        logger.debug(`Cache hit pour ${endpointPath}`);
        
        // Retourner une réponse mockée avec les données en cache
        return new Response(JSON.stringify(cachedData), {
            status: 200,
            statusText: 'OK',
            headers: { 'Content-Type': 'application/json' }
        });
    }
    
    const fetchOptions = {
        method,
        headers,
        ...options
    };
    
    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        fetchOptions.body = JSON.stringify(data);
    }
    
    const response = await fetch(url, fetchOptions);

    if (response.status === 401 && endpointPath !== 'auth.login' && endpointPath !== 'auth.register') {
        window.dispatchEvent(new CustomEvent('session-expired', { detail: { status: 401 } }));
    }
    
    // Mettre en cache les réponses GET réussies
    if (useCache && cacheKey && response.ok) {
        try {
            // Cloner la réponse pour pouvoir la lire deux fois
            const clonedResponse = response.clone();
            const responseData = await clonedResponse.json();
            cache.set(cacheKey, responseData, options.cacheTTL);
            logger.debug(`Cache mis à jour pour ${endpointPath}`);
        } catch (error) {
            // Si ce n'est pas du JSON, ne pas mettre en cache
            logger.debug(`Impossible de mettre en cache ${endpointPath}: ${error.message}`);
        }
    }
    
    return response;
}

/**
 * API simplifiée - Point d'entrée unique pour tous les modules
 * @namespace api
 */
const api = {
    /**
     * Effectue une requête GET avec cache automatique
     * @async
     * @param {string} endpointPath - Chemin de l'endpoint (ex: 'health', 'lots.list')
     * @param {Object} [options={}] - Options supplémentaires pour fetch
     * @param {boolean} [options.useCache=true] - Utiliser le cache (défaut: true)
     * @param {number} [options.cacheTTL] - Durée de vie du cache en ms
     * @returns {Promise<Response>} Réponse fetch
     * @example
     * const response = await api.get('health');
     * const data = await response.json();
     * 
     * // Désactiver le cache pour cette requête
     * const response = await api.get('health', { useCache: false });
     */
    async get(endpointPath, options = {}) {
        return request('GET', endpointPath, null, options);
    },
    
    /**
     * Effectue une requête POST
     * @async
     * @param {string} endpointPath - Chemin de l'endpoint
     * @param {Object|null} [data=null] - Données à envoyer
     * @param {Object} [options={}] - Options supplémentaires pour fetch
     * @returns {Promise<Response>} Réponse fetch
     * @example
     * const response = await api.post('auth.login', { username: 'user', password: 'pass' });
     */
    async post(endpointPath, data = null, options = {}) {
        return request('POST', endpointPath, data, options);
    },
    
    /**
     * Effectue une requête PUT
     * @async
     * @param {string} endpointPath - Chemin de l'endpoint
     * @param {Object|null} [data=null] - Données à envoyer
     * @param {Object} [options={}] - Options supplémentaires pour fetch
     * @returns {Promise<Response>} Réponse fetch
     * @example
     * const response = await api.put('lots.items.123', { etat: 'reconditionne' });
     */
    async put(endpointPath, data = null, options = {}) {
        return request('PUT', endpointPath, data, options);
    },
    
    /**
     * Effectue une requête DELETE
     * @async
     * @param {string} endpointPath - Chemin de l'endpoint
     * @param {Object} [options={}] - Options supplémentaires pour fetch
     * @returns {Promise<Response>} Réponse fetch
     * @example
     * const response = await api.delete('shortcuts.123');
     */
    async delete(endpointPath, options = {}) {
        return request('DELETE', endpointPath, null, options);
    },
    
    /**
     * Obtient l'URL du serveur depuis la configuration
     * @returns {string} URL du serveur (ex: 'http://192.168.1.62:4000')
     */
    getServerUrl() {
        return window.SERVER_CONFIG?.serverUrl || window.APP_CONFIG?.serverUrl || 'http://localhost:8060';
    },
    
    /**
     * Obtient l'URL WebSocket depuis la configuration
     * @returns {string} URL WebSocket (ex: 'ws://192.168.1.62:4000')
     */
    getWsUrl() {
        return window.SERVER_CONFIG?.serverWsUrl || window.APP_CONFIG?.serverWsUrl || 'ws://localhost:8060';
    },
    
    /**
     * Obtient l'URL complète d'un endpoint
     * @param {string} endpointPath - Chemin de l'endpoint
     * @returns {string} URL complète
     */
    getUrl(endpointPath) {
        return getUrl(endpointPath);
    },
    
    /**
     * Initialise manuellement l'API (normalement appelé automatiquement)
     * @async
     * @returns {Promise<void>}
     */
    async init() {
        await init();
    },
    
    /**
     * Vide le cache API
     * @returns {void}
     * @example
     * api.clearCache(); // Vide tout le cache
     */
    clearCache() {
        cache.clear();
    },
    
    /**
     * Obtient les statistiques du cache
     * @returns {Object} Statistiques du cache
     */
    getCacheStats() {
        return cache.getStats();
    }
};

export default api;
