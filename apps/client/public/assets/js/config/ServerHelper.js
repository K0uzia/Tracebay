/**
 * ServerHelper.js
 * Helper global pour obtenir l'URL du serveur et les endpoints
 * Utilise SERVER_CONFIG ou APP_CONFIG en fallback
 */

/**
 * Obtenir l'URL du serveur
 */
export function getServerUrl() {
    return window.SERVER_CONFIG?.serverUrl || window.APP_CONFIG?.serverUrl || 'http://localhost:8060';
}

/**
 * Obtenir l'URL WebSocket
 */
export function getServerWsUrl() {
    return window.SERVER_CONFIG?.serverWsUrl || window.APP_CONFIG?.serverWsUrl || 'ws://localhost:8060';
}

/**
 * Obtenir l'URL complète d'un endpoint
 */
export function getEndpointUrl(endpointPath) {
    const serverUrl = getServerUrl();
    
    // Si SERVER_CONFIG est disponible, utiliser getEndpoint
    if (window.SERVER_CONFIG?.getEndpoint) {
        const endpoint = window.SERVER_CONFIG.getEndpoint(endpointPath);
        if (endpoint) {
            return `${serverUrl}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
        }
    }
    
    // Fallback : utiliser le chemin tel quel
    if (endpointPath.startsWith('http://') || endpointPath.startsWith('https://')) {
        return endpointPath;
    }
    
    return `${serverUrl}${endpointPath.startsWith('/') ? endpointPath : '/' + endpointPath}`;
}

/**
 * Obtenir un endpoint par chemin (ex: 'auth.login' -> '/api/auth/login')
 */
export function getEndpoint(path) {
    if (window.SERVER_CONFIG?.getEndpoint) {
        return window.SERVER_CONFIG.getEndpoint(path) || '';
    }
    return '';
}
