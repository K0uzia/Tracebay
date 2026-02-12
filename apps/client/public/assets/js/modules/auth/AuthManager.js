/**
 * @fileoverview Gestionnaire d'authentification utilisateur
 * @module AuthManager
 */

import api from '../../config/api.js';
import getLogger from '../../config/Logger.js';
import getErrorHandler from '../../config/ErrorHandler.js';

const logger = getLogger();
const errorHandler = getErrorHandler();

/**
 * Classe AuthManager pour la gestion de l'authentification
 * @class
 */
class AuthManager {
    /**
     * Crée une instance de AuthManager
     * @constructor
     */
    constructor() {
        this.user = null;
        this.listeners = [];
        this.tokenKey = 'workspace_jwt';
        this.init();
    }

    /**
     * Initialise l'AuthManager en vérifiant la session existante
     * @returns {void}
     * @private
     */
    init() {
        const userId = localStorage.getItem('workspace_user_id');
        const username = localStorage.getItem('workspace_username');
        const token = localStorage.getItem(this.tokenKey);

        if (userId && username && token) {
            this.user = {
                id: parseInt(userId),
                username: username
            };
            this.verifySession(token);
        }
    }

    /**
     * Vérifie la validité d'une session avec le serveur
     * @async
     * @param {string} token - Token JWT à vérifier
     * @returns {Promise<void>}
     * @private
     */
    async verifySession(token) {
        try {
            const response = await api.get('auth.verify', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            const data = await response.json();

            if (!data.success) {
                this.clearSession();
            } else {
                this.emit('auth-change', this.user);
            }
        } catch (error) {
            errorHandler.handleApiError(error, 'vérification session');
            this.clearSession();
        }
    }

    /**
     * Inscrit un nouvel utilisateur
     * @async
     * @param {string} username - Nom d'utilisateur
     * @param {string} password - Mot de passe
     * @returns {Promise<Object>} Résultat de l'inscription avec success et message
     * @example
     * const result = await authManager.register('john', 'password123');
     * if (result.success) {
     *   console.log('Inscription réussie');
     * }
     */
    async register(username, password) {
        try {
            const response = await api.post('auth.register', { username, password });
            const data = await response.json();

            if (data.success) {
                this.setSession(data.user, data.token);
            }

            return data;
        } catch (error) {
            const handled = errorHandler.handleApiError(error, 'inscription');
            return {
                success: false,
                message: handled.userMessage
            };
        }
    }

    /**
     * Connecte un utilisateur
     * @async
     * @param {string} username - Nom d'utilisateur
     * @param {string} password - Mot de passe
     * @returns {Promise<Object>} Résultat de la connexion avec success, user et token
     * @example
     * const result = await authManager.login('john', 'password123');
     * if (result.success) {
     *   console.log('Connecté:', result.user);
     * }
     */
    async login(username, password) {
        try {
            const response = await api.post('auth.login', { username, password });

            const data = await response.json();

            if (data.success) {
                this.setSession(data.user, data.token);
            }

            return data;
        } catch (error) {
            const handled = errorHandler.handleApiError(error, 'connexion');
            return {
                success: false,
                message: handled.userMessage
            };
        }
    }

    /**
     * Déconnecte l'utilisateur actuel
     * @returns {Object} Résultat de la déconnexion
     */
    logout() {
        this.clearSession();
        window.location.reload();
        return {
            success: true,
            message: 'Déconnexion réussie'
        };
    }

    /**
     * Définit la session utilisateur
     * @param {Object} user - Objet utilisateur avec id et username
     * @param {string} token - Token JWT
     * @returns {void}
     * @private
     */
    setSession(user, token) {
        this.user = user;
        localStorage.setItem('workspace_user_id', user.id);
        localStorage.setItem('workspace_username', user.username);
        if (token) {
            localStorage.setItem(this.tokenKey, token);
        }
        this.emit('auth-change', this.user);
        
        // Émettre un événement global pour ChatManager
        window.dispatchEvent(new CustomEvent('auth-change', { detail: { user, token } }));
    }

    clearSession() {
        this.user = null;
        localStorage.removeItem('workspace_user_id');
        localStorage.removeItem('workspace_username');
        localStorage.removeItem(this.tokenKey);
        this.emit('auth-change', null);
        
        // Émettre un événement global pour ChatManager
        window.dispatchEvent(new CustomEvent('auth-change', { detail: { user: null } }));
    }

    getToken() {
        return localStorage.getItem(this.tokenKey) || null;
    }

    isAuthenticated() {
        return this.user !== null;
    }

    getCurrentUser() {
        return this.user;
    }

    on(event, callback) {
        this.listeners.push({ event, callback });
    }

    emit(event, data) {
        this.listeners.forEach(listener => {
            if (listener.event === event) {
                listener.callback(data);
            }
        });
    }

    destroy() {
        this.listeners = [];
        this.user = null;
    }
}

export default AuthManager;
