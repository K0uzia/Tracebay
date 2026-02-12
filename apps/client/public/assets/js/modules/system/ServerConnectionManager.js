/**
 * ServerConnectionManager - Gestion de connexion au serveur (local ou Proxmox)
 * Ping /health, gestion de reconnexion, affichage d'état
 */

import api from '../../config/api.js';

class ServerConnectionManager {
    constructor(config) {
        this.config = config;
        this.isConnected = false;
        this.lastPing = null;
        this.pingInterval = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = config.maxReconnectAttempts || 5;
        this.reconnectDelay = config.reconnectDelay || 3000;
        this.healthCheckInterval = config.healthCheckInterval || 30000;
        this.listeners = [];
    }

    /**
     * Démarre la surveillance de connexion
     */
    start() {
        console.log('🔌 ServerConnectionManager démarré');
        this.checkConnection();
        this.pingInterval = setInterval(() => {
            this.checkConnection();
        }, this.healthCheckInterval);
    }

    /**
     * Arrête la surveillance
     */
    stop() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    /**
     * Vérifie la connexion au serveur
     */
    async checkConnection() {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);

            const response = await api.get('health', {
                signal: controller.signal
            });

            clearTimeout(timeout);

            if (response.ok) {
                const data = await response.json();
                this.onConnectionSuccess(data);
            } else {
                this.onConnectionError(new Error(`HTTP ${response.status}`));
            }
        } catch (error) {
            this.onConnectionError(error);
        }
    }

    /**
     * Gestion connexion réussie
     */
    onConnectionSuccess(data) {
        const wasDisconnected = !this.isConnected;
        this.isConnected = true;
        this.lastPing = new Date();
        this.reconnectAttempts = 0;

        if (wasDisconnected) {
            console.log('✅ Connecté au serveur:', this.config.url);
            this.notifyListeners('connected', { 
                url: this.config.url,
                data 
            });
        }
    }

    /**
     * Gestion erreur de connexion
     */
    onConnectionError(error) {
        const wasConnected = this.isConnected;
        this.isConnected = false;

        if (wasConnected) {
            console.warn('❌ Déconnecté du serveur:', error.message);
            this.notifyListeners('disconnected', { 
                error: error.message 
            });
        }

        // Tentative de reconnexion
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`🔄 Tentative de reconnexion ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
            
            setTimeout(() => {
                this.checkConnection();
            }, this.reconnectDelay);
        } else {
            console.error('❌ Échec de reconnexion après', this.maxReconnectAttempts, 'tentatives');
            this.notifyListeners('failed', { 
                error: 'Max reconnection attempts reached' 
            });
        }
    }

    /**
     * Enregistre un listener pour les changements d'état
     */
    onStatusChange(callback) {
        this.listeners.push(callback);
    }

    /**
     * Notifie tous les listeners
     */
    notifyListeners(status, data) {
        this.listeners.forEach(callback => {
            try {
                callback(status, data);
            } catch (error) {
                console.error('Erreur listener:', error);
            }
        });
    }

    /**
     * Récupère l'état actuel
     */
    getStatus() {
        return {
            connected: this.isConnected,
            url: this.config.url,
            lastPing: this.lastPing,
            reconnectAttempts: this.reconnectAttempts
        };
    }

    /**
     * Force une vérification immédiate
     */
    forceCheck() {
        this.checkConnection();
    }
}

export default ServerConnectionManager;
