/**
 * @fileoverview Système de cache pour les requêtes API
 * Réduit les appels réseau répétés et améliore les performances
 * @module ApiCache
 */

/**
 * Classe ApiCache pour mettre en cache les réponses API
 * @class
 */
class ApiCache {
    /**
     * Crée une instance de ApiCache
     * @constructor
     * @param {Object} [options={}] - Options de configuration
     * @param {number} [options.defaultTTL=60000] - Durée de vie par défaut en ms (1 minute)
     * @param {number} [options.maxSize=100] - Nombre maximum d'entrées en cache
     */
    constructor(options = {}) {
        this.cache = new Map();
        this.defaultTTL = options.defaultTTL || 60000; // 1 minute par défaut
        this.maxSize = options.maxSize || 100;
        this.cleanupInterval = null;
        
        // Nettoyer le cache toutes les 5 minutes
        this.startCleanup();
    }

    /**
     * Génère une clé de cache à partir d'un endpoint et de ses options
     * @param {string} endpoint - Chemin de l'endpoint
     * @param {Object} [options={}] - Options de la requête
     * @returns {string} Clé de cache
     * @private
     */
    generateKey(endpoint, options = {}) {
        const method = options.method || 'GET';
        const body = options.body ? JSON.stringify(options.body) : '';
        return `${method}:${endpoint}:${body}`;
    }

    /**
     * Vérifie si une entrée existe et est valide dans le cache
     * @param {string} key - Clé de cache
     * @returns {boolean} true si l'entrée est valide
     */
    has(key) {
        const entry = this.cache.get(key);
        if (!entry) return false;
        
        // Vérifier si l'entrée a expiré
        if (Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            return false;
        }
        
        return true;
    }

    /**
     * Récupère une entrée du cache
     * @param {string} key - Clé de cache
     * @returns {*} Données en cache ou null
     */
    get(key) {
        if (!this.has(key)) {
            return null;
        }
        
        const entry = this.cache.get(key);
        return entry.data;
    }

    /**
     * Stocke une entrée dans le cache
     * @param {string} key - Clé de cache
     * @param {*} data - Données à mettre en cache
     * @param {number} [ttl] - Durée de vie en ms (utilise defaultTTL si non fourni)
     * @returns {void}
     */
    set(key, data, ttl = null) {
        // Si le cache est plein, supprimer la plus ancienne entrée
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        
        const expiresAt = Date.now() + (ttl || this.defaultTTL);
        this.cache.set(key, {
            data,
            expiresAt,
            createdAt: Date.now()
        });
    }

    /**
     * Supprime une entrée du cache
     * @param {string} key - Clé de cache
     * @returns {boolean} true si l'entrée a été supprimée
     */
    delete(key) {
        return this.cache.delete(key);
    }

    /**
     * Vide complètement le cache
     * @returns {void}
     */
    clear() {
        this.cache.clear();
    }

    /**
     * Supprime toutes les entrées expirées du cache
     * @returns {number} Nombre d'entrées supprimées
     */
    cleanup() {
        const now = Date.now();
        let removed = 0;
        
        for (const [key, entry] of this.cache.entries()) {
            if (now > entry.expiresAt) {
                this.cache.delete(key);
                removed++;
            }
        }
        
        return removed;
    }

    /**
     * Démarre le nettoyage automatique périodique
     * @returns {void}
     * @private
     */
    startCleanup() {
        if (this.cleanupInterval) return;
        
        // Nettoyer toutes les 5 minutes
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, 5 * 60 * 1000);
    }

    /**
     * Arrête le nettoyage automatique
     * @returns {void}
     */
    stopCleanup() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }

    /**
     * Obtient les statistiques du cache
     * @returns {Object} Statistiques (size, maxSize, entries)
     */
    getStats() {
        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            entries: Array.from(this.cache.entries()).map(([key, entry]) => ({
                key,
                age: Date.now() - entry.createdAt,
                expiresIn: entry.expiresAt - Date.now()
            }))
        };
    }

    /**
     * Détruit le cache et nettoie les ressources
     * @returns {void}
     */
    destroy() {
        this.stopCleanup();
        this.clear();
    }
}

// Singleton
let cacheInstance = null;

/**
 * Obtient l'instance singleton de l'ApiCache
 * @returns {ApiCache} Instance de l'ApiCache
 */
export default function getApiCache() {
    if (!cacheInstance) {
        cacheInstance = new ApiCache();
    }
    return cacheInstance;
}

// Export aussi la classe pour utilisation directe
export { ApiCache };
