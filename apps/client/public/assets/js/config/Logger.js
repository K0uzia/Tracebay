/**
 * @fileoverview Système de logging centralisé avec niveaux de log
 * Remplace console.log pour un meilleur contrôle en production
 * @module Logger
 */

const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    NONE: 4
};

const LOG_LEVEL_NAMES = {
    0: 'DEBUG',
    1: 'INFO',
    2: 'WARN',
    3: 'ERROR',
    4: 'NONE'
};

/**
 * Classe Logger pour la gestion centralisée des logs
 * @class
 */
class Logger {
    /**
     * Crée une instance de Logger
     * @constructor
     * @param {string} [logLevel='INFO'] - Niveau de log initial (DEBUG, INFO, WARN, ERROR, NONE)
     */
    constructor() {
        // Déterminer le niveau de log depuis l'environnement ou la config
        // En production, utiliser WARN par défaut, sinon INFO
        let defaultLevel = 'INFO';
        
        // En Node.js (main process), utiliser process.env directement
        if (typeof process !== 'undefined' && process.env) {
            if (process.env.NODE_ENV === 'production') {
                defaultLevel = 'WARN';
            }
        }
        
        // Pour le renderer process, on utilisera une méthode d'initialisation
        // qui sera appelée après que window.electron soit disponible
        const envLevel = process.env.LOG_LEVEL || defaultLevel;
        this.level = this.getLevelFromString(envLevel);
        this.enabled = true;
        this._initialized = false;
    }

    /**
     * Initialise le logger avec la configuration de l'app (pour renderer process)
     * À appeler après que window.electron soit disponible
     * @async
     * @returns {Promise<void>}
     */
    async initializeFromAppConfig() {
        if (this._initialized) return;
        
        if (typeof window !== 'undefined' && window.electron) {
            try {
                const config = await window.electron.invoke('get-app-config');
                if (config && config.nodeEnv === 'production') {
                    this.setLevel('WARN');
                }
                this._initialized = true;
            } catch (e) {
                // Si erreur, garder niveau par défaut
                this._initialized = true;
            }
        }
    }

    /**
     * Convertit une string en niveau de log numérique
     * @param {string} level - Niveau de log (DEBUG, INFO, WARN, ERROR, NONE)
     * @returns {number} Niveau de log numérique
     * @private
     */
    getLevelFromString(level) {
        const upper = level.toUpperCase();
        return LOG_LEVELS[upper] !== undefined ? LOG_LEVELS[upper] : LOG_LEVELS.INFO;
    }

    /**
     * Vérifie si un niveau de log doit être affiché selon la configuration
     * @param {number} level - Niveau de log à vérifier
     * @returns {boolean} true si le log doit être affiché
     * @private
     */
    shouldLog(level) {
        if (!this.enabled) return false;
        return level >= this.level;
    }

    /**
     * Formate le préfixe du message de log avec timestamp et niveau
     * @param {number} level - Niveau de log
     * @returns {string} Préfixe formaté (ex: '[2026-02-12T10:00:00Z] [INFO]')
     * @private
     */
    formatPrefix(level) {
        const timestamp = new Date().toISOString();
        const levelName = LOG_LEVEL_NAMES[level];
        return `[${timestamp}] [${levelName}]`;
    }

    /**
     * Log un message de niveau DEBUG (développement uniquement)
     * @param {string} message - Message à logger
     * @param {*} [data=null] - Données supplémentaires à logger
     * @example
     * logger.debug('Chargement des données', { userId: 123 });
     */
    debug(message, data = null) {
        if (this.shouldLog(LOG_LEVELS.DEBUG)) {
            const prefix = this.formatPrefix(LOG_LEVELS.DEBUG);
            if (data) {
                console.debug(`${prefix} ${message}`, data);
            } else {
                console.debug(`${prefix} ${message}`);
            }
        }
    }

    /**
     * Log un message de niveau INFO
     * @param {string} message - Message à logger
     * @param {*} [data=null] - Données supplémentaires à logger
     * @example
     * logger.info('Utilisateur connecté', { username: 'john' });
     */
    info(message, data = null) {
        if (this.shouldLog(LOG_LEVELS.INFO)) {
            const prefix = this.formatPrefix(LOG_LEVELS.INFO);
            if (data) {
                console.info(`${prefix} ${message}`, data);
            } else {
                console.info(`${prefix} ${message}`);
            }
        }
    }

    /**
     * Log un message de niveau WARN
     * @param {string} message - Message à logger
     * @param {*} [data=null] - Données supplémentaires à logger
     * @example
     * logger.warn('Tentative de reconnexion', { attempts: 3 });
     */
    warn(message, data = null) {
        if (this.shouldLog(LOG_LEVELS.WARN)) {
            const prefix = this.formatPrefix(LOG_LEVELS.WARN);
            if (data) {
                console.warn(`${prefix} ${message}`, data);
            } else {
                console.warn(`${prefix} ${message}`);
            }
        }
    }

    /**
     * Log un message de niveau ERROR
     * @param {string} message - Message à logger
     * @param {Error} [error=null] - Objet Error à logger
     * @param {*} [data=null] - Données supplémentaires à logger
     * @example
     * logger.error('Erreur API', error, { endpoint: 'auth.login' });
     */
    error(message, error = null, data = null) {
        if (this.shouldLog(LOG_LEVELS.ERROR)) {
            const prefix = this.formatPrefix(LOG_LEVELS.ERROR);
            const errorData = error ? {
                message: error.message,
                stack: error.stack,
                ...data
            } : data;
            
            if (errorData) {
                console.error(`${prefix} ${message}`, errorData);
            } else {
                console.error(`${prefix} ${message}`);
            }
        }
    }

    /**
     * Désactive complètement le logging
     * @returns {void}
     */
    disable() {
        this.enabled = false;
    }

    /**
     * Active le logging
     * @returns {void}
     */
    enable() {
        this.enabled = true;
    }

    /**
     * Définit le niveau de log
     * @param {string|number} level - Niveau de log (string ou nombre)
     * @returns {void}
     * @example
     * logger.setLevel('WARN');
     * logger.setLevel(2); // WARN
     */
    setLevel(level) {
        if (typeof level === 'string') {
            this.level = this.getLevelFromString(level);
        } else {
            this.level = level;
        }
    }
}

// Singleton
let loggerInstance = null;

/**
 * Obtient l'instance singleton du Logger
 * @returns {Logger} Instance du Logger
 * @example
 * const logger = getLogger();
 * logger.info('Message');
 */
export default function getLogger() {
    if (!loggerInstance) {
        loggerInstance = new Logger();
    }
    return loggerInstance;
}

// Export aussi la classe pour utilisation directe
export { Logger };
