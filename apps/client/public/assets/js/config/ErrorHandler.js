/**
 * @fileoverview Gestion centralisée des erreurs avec affichage utilisateur-friendly
 * @module ErrorHandler
 */

import getLogger from './Logger.js';

/**
 * Classe ErrorHandler pour la gestion centralisée des erreurs
 * @class
 */
class ErrorHandler {
    /**
     * Crée une instance de ErrorHandler
     * @constructor
     */
    constructor() {
        this.logger = getLogger();
        this.notificationCallbacks = [];
        this.monitoringEnabled = false;
        this.clientId = null;
        this.clientVersion = null;
        this.platform = null;
        this.serverUrl = null;
        this.initMonitoring();
    }

    /**
     * Initialise le système de monitoring
     * @private
     * @returns {void}
     */
    async initMonitoring() {
        try {
            // Obtenir les informations du client
            if (typeof window !== 'undefined' && window.electron) {
                const config = await window.electron.invoke('get-app-config');
                if (config) {
                    this.clientVersion = config.appVersion || '1.0.0';
                    this.platform = config.platform || navigator.platform;
                    this.serverUrl = config.serverUrl;
                }
            }

            // Générer un ID client unique (stocké dans localStorage)
            if (typeof localStorage !== 'undefined') {
                this.clientId = localStorage.getItem('workspace_client_id');
                if (!this.clientId) {
                    this.clientId = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                    localStorage.setItem('workspace_client_id', this.clientId);
                }
            }

            // Activer le monitoring si on a une URL serveur
            if (this.serverUrl) {
                this.monitoringEnabled = true;
                this.logger.info('Monitoring des erreurs activé');
            }
        } catch (error) {
            this.logger.warn('Impossible d\'initialiser le monitoring:', error);
        }
    }

    /**
     * Envoie une erreur au serveur de monitoring
     * @param {Object} errorData - Données de l'erreur à envoyer
     * @private
     * @returns {Promise<void>}
     */
    async sendToMonitoring(errorData) {
        if (!this.monitoringEnabled || !this.serverUrl) {
            return;
        }

        try {
            const endpoint = `${this.serverUrl}/api/monitoring/errors`;
            
            const payload = {
                clientId: this.clientId,
                clientVersion: this.clientVersion,
                platform: this.platform || navigator.platform,
                ...errorData
            };

            // Utiliser sendBeacon pour les erreurs critiques (plus fiable)
            if (navigator.sendBeacon) {
                const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
                navigator.sendBeacon(endpoint, blob);
            } else {
                // Fallback sur fetch avec keepalive
                await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload),
                    keepalive: true
                });
            }
        } catch (error) {
            // Ne pas logger l'erreur de monitoring pour éviter les boucles infinies
            console.warn('Impossible d\'envoyer l\'erreur au monitoring:', error);
        }
    }

    /**
     * Enregistre un callback pour recevoir les notifications d'erreur
     * @param {Function} callback - Fonction appelée lors d'une notification (message, type)
     * @returns {void}
     * @example
     * errorHandler.onNotification((message, type) => {
     *   showToast(message, type);
     * });
     */
    onNotification(callback) {
        this.notificationCallbacks.push(callback);
    }

    /**
     * Notifie tous les callbacks enregistrés
     * @param {string} message - Message à notifier
     * @param {string} [type='error'] - Type de notification (error, success, info, warn)
     * @returns {void}
     * @private
     */
    notify(message, type = 'error') {
        this.notificationCallbacks.forEach(callback => {
            try {
                callback(message, type);
            } catch (error) {
                console.error('Erreur dans callback de notification:', error);
            }
        });
    }

    /**
     * Gère une erreur API et retourne un message utilisateur-friendly
     * @param {Error|Object} error - Objet d'erreur (peut être une erreur fetch ou axios)
     * @param {string} [context=''] - Contexte de l'erreur pour le log
     * @returns {Object} Objet avec userMessage, logMessage et error
     * @example
     * try {
     *   await api.get('endpoint');
     * } catch (error) {
     *   const handled = errorHandler.handleApiError(error, 'chargement données');
     *   // handled.userMessage contient le message pour l'utilisateur
     * }
     */
    handleApiError(error, context = '') {
        let userMessage = 'Une erreur est survenue';
        let logMessage = `Erreur API${context ? ` (${context})` : ''}`;
        let errorType = 'api';
        let errorStack = null;
        let url = null;

        if (error.response) {
            // Erreur HTTP avec réponse
            const status = error.response.status;
            const data = error.response.data || {};

            logMessage += `: HTTP ${status}`;
            url = error.response.config?.url || error.response.url || null;
            
            switch (status) {
                case 400:
                    userMessage = data.message || 'Requête invalide';
                    break;
                case 401:
                    userMessage = 'Vous devez être connecté';
                    break;
                case 403:
                    userMessage = 'Accès refusé';
                    break;
                case 404:
                    userMessage = 'Ressource non trouvée';
                    break;
                case 500:
                    userMessage = 'Erreur serveur. Veuillez réessayer plus tard';
                    break;
                default:
                    userMessage = data.message || `Erreur ${status}`;
            }
        } else if (error.request) {
            // Requête envoyée mais pas de réponse
            logMessage += ': Pas de réponse du serveur';
            userMessage = 'Impossible de contacter le serveur. Vérifiez votre connexion';
            errorType = 'network';
            url = error.config?.url || error.url || null;
        } else {
            // Erreur lors de la configuration de la requête
            logMessage += `: ${error.message}`;
            userMessage = 'Erreur de connexion';
            url = error.config?.url || error.url || null;
        }

        // Récupérer la stack trace si disponible
        if (error.stack) {
            errorStack = error.stack;
        }

        this.logger.error(logMessage, error);
        this.notify(userMessage, 'error');

        // Envoyer au monitoring
        this.sendToMonitoring({
            errorType,
            errorMessage: error.message || logMessage,
            errorStack,
            context: context || 'API Error',
            userMessage,
            url
        });

        return {
            userMessage,
            logMessage,
            error
        };
    }

    /**
     * Gère une erreur de validation
     * @param {string} message - Message d'erreur de validation
     * @param {string} [field=null] - Nom du champ en erreur
     * @returns {void}
     */
    handleValidationError(message, field = null) {
        const logMessage = `Erreur de validation${field ? ` (${field})` : ''}: ${message}`;
        this.logger.warn(logMessage);
        this.notify(message, 'error');

        // Envoyer au monitoring (niveau warn, mais quand même enregistré)
        this.sendToMonitoring({
            errorType: 'validation',
            errorMessage: message,
            errorStack: null,
            context: field ? `Validation Error (${field})` : 'Validation Error',
            userMessage: message,
            url: window.location?.href || null
        });
    }

    /**
     * Gère une erreur réseau
     * @param {Error} error - Objet d'erreur réseau
     * @returns {void}
     */
    handleNetworkError(error) {
        const message = 'Erreur de connexion réseau. Vérifiez votre connexion internet';
        this.logger.error('Erreur réseau', error);
        this.notify(message, 'error');

        // Envoyer au monitoring
        this.sendToMonitoring({
            errorType: 'network',
            errorMessage: error.message || 'Network error',
            errorStack: error.stack || null,
            context: 'Network Error',
            userMessage: message,
            url: window.location?.href || null
        });
    }

    /**
     * Gère une erreur WebSocket
     * @param {Error} error - Objet d'erreur WebSocket
     * @returns {void}
     */
    handleWebSocketError(error) {
        const message = 'Connexion WebSocket interrompue. Reconnexion en cours...';
        this.logger.warn('Erreur WebSocket', error);
        this.notify(message, 'warn');
    }

    /**
     * Gère une erreur générique
     * @param {Error|*} error - Objet d'erreur ou message
     * @param {string} [userMessage=null] - Message personnalisé pour l'utilisateur
     * @param {string} [context=''] - Contexte de l'erreur
     * @returns {void}
     */
    handleError(error, userMessage = null, context = '') {
        const message = userMessage || 'Une erreur inattendue est survenue';
        const logMessage = `Erreur${context ? ` (${context})` : ''}: ${error.message || error}`;
        
        this.logger.error(logMessage, error);
        this.notify(message, 'error');

        // Envoyer au monitoring
        const errorStack = error.stack || (error instanceof Error ? error.stack : null);
        this.sendToMonitoring({
            errorType: 'generic',
            errorMessage: error.message || String(error),
            errorStack,
            context: context || 'Generic Error',
            userMessage: message,
            url: window.location?.href || null
        });
    }

    /**
     * Affiche un message de succès à l'utilisateur
     * @param {string} message - Message de succès
     * @returns {void}
     */
    showSuccess(message) {
        this.notify(message, 'success');
    }

    /**
     * Affiche un message d'information à l'utilisateur
     * @param {string} message - Message d'information
     * @returns {void}
     */
    showInfo(message) {
        this.notify(message, 'info');
    }

    /**
     * Affiche un avertissement à l'utilisateur
     * @param {string} message - Message d'avertissement
     * @returns {void}
     */
    showWarning(message) {
        this.logger.warn(message);
        this.notify(message, 'warn');
    }
}

// Singleton
let errorHandlerInstance = null;

/**
 * Obtient l'instance singleton de l'ErrorHandler
 * @returns {ErrorHandler} Instance de l'ErrorHandler
 * @example
 * const errorHandler = getErrorHandler();
 * errorHandler.handleApiError(error, 'contexte');
 */
export default function getErrorHandler() {
    if (!errorHandlerInstance) {
        errorHandlerInstance = new ErrorHandler();
    }
    return errorHandlerInstance;
}

// Export aussi la classe pour utilisation directe
export { ErrorHandler };
