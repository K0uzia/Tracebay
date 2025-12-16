/**
 * HTTP Request Tracker Middleware
 * Enregistre automatiquement chaque requête HTTP
 */

const serverLogger = require('../lib/ServerLogger.js');

/**
 * Middleware pour tracker les requêtes HTTP automatiquement
 */
function httpRequestTracker() {
    return (req, res, next) => {
        const startTime = Date.now();
        const method = req.method;
        const path = req.path;

        // Intercepter la réponse
        const originalSend = res.send;
        const originalJson = res.json;

        // Override send pour tracker JSON responses
        res.json = function(data) {
            const duration = Date.now() - startTime;
            const status = res.statusCode;
            const statusText = statusCodeToText(status);

            // Log la requête (sauf pour les requêtes de monitoring lui-même pour éviter les boucles)
            if (!path.includes('/api/monitoring/')) {
                serverLogger.logRequest(method, path, status, statusText, duration);
            }

            return originalJson.call(this, data);
        };

        // Override send pour tracker autres responses
        res.send = function(data) {
            const duration = Date.now() - startTime;
            const status = res.statusCode;
            const statusText = statusCodeToText(status);

            if (!path.includes('/api/monitoring/')) {
                serverLogger.logRequest(method, path, status, statusText, duration);
            }

            return originalSend.call(this, data);
        };

        next();
    };
}

/**
 * Convertir un code de status en texte
 */
function statusCodeToText(code) {
    const statuses = {
        200: 'OK',
        201: 'Created',
        204: 'No Content',
        301: 'Moved Permanently',
        302: 'Found',
        304: 'Not Modified',
        400: 'Bad Request',
        401: 'Unauthorized',
        403: 'Forbidden',
        404: 'Not Found',
        409: 'Conflict',
        410: 'Gone',
        422: 'Unprocessable Entity',
        429: 'Too Many Requests',
        500: 'Internal Server Error',
        501: 'Not Implemented',
        502: 'Bad Gateway',
        503: 'Service Unavailable'
    };

    return statuses[code] || 'Unknown';
}

module.exports = httpRequestTracker;
