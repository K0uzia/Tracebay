/**
 * ConnectionConfig.js
 * Gestion centralisée de la connexion client au serveur
 * Supporte la découverte automatique via beacon UDP ou scan réseau
 */

class ConnectionConfig {
  constructor() {
    this.serverUrl = null;
    this.serverWsUrl = null;
    this.serverConnected = false;
    this.discovered = false;
    this.config = {
      mode: 'local', // 'local', 'proxmox', 'production', 'auto'
      local: {
        url: 'http://localhost:8060',
        ws: 'ws://localhost:8060'
      },
      proxmox: {
        url: 'http://192.168.1.141:8060',
        ws: 'ws://192.168.1.141:8060',
        host: 'proxmox-ws.local'
      },
      production: {
        url: 'https://workspace.example.com',
        ws: 'wss://workspace.example.com',
        host: 'workspace.example.com'
      },
      healthCheckInterval: 30000,
      reconnectDelay: 3000,
      maxReconnectAttempts: 5,
      beaconTimeout: 5000,
      healthEndpoint: '/api/health'
    };
  }

  /**
     * Initialiser la configuration
     */
  async initialize() {
    try {
      // Charger la config depuis le fichier config.json local
      const response = await fetch('./config/connection-config.json');
      if (response.ok) {
        const userConfig = await response.json();
        this.config = { ...this.config, ...userConfig };
        console.log('✅ Configuration de connexion chargée');
      }
    } catch (error) {
      console.warn('⚠️ Impossible de charger connection-config.json, utilisation des valeurs par défaut');
    }

    // Déterminer le mode
    const mode = this.config.mode || 'local';

    if (mode === 'auto') {
      console.log('🔍 Mode auto: tentative de découverte du serveur...');
      const discovered = await this.discoverServer();
      if (discovered) {
        this.serverUrl = discovered.url;
        this.serverWsUrl = discovered.ws;
        this.discovered = true;
        console.log(`✅ Serveur découvert: ${this.serverUrl}`);
        return;
      }
      console.warn('⚠️ Découverte échouée, utilisation de la config par défaut (localhost)');
    }

    // Utiliser la config du mode spécifié
    if (this.config[mode]) {
      this.serverUrl = this.config[mode].url;
      this.serverWsUrl = this.config[mode].ws;
    } else {
      // Fallback à localhost
      this.serverUrl = 'http://localhost:8060';
      this.serverWsUrl = 'ws://localhost:8060';
    }

    console.log(`🔗 Configuration: Mode="${mode}", URL="${this.serverUrl}"`);

    // Exposer globalement
    window.APP_CONFIG = {
      serverUrl: this.serverUrl,
      serverWsUrl: this.serverWsUrl,
      serverConnected: this.serverConnected,
      healthCheckInterval: this.config.healthCheckInterval,
      reconnectDelay: this.config.reconnectDelay,
      maxReconnectAttempts: this.config.maxReconnectAttempts
    };
  }

  /**
     * Découverte du serveur via beacon UDP
     * Nécessite un module serveur qui envoie des beacons UDP
     */
  async discoverServer() {
    try {
      // Essayer une requête locale d'abord (plus rapide)
      const health = await this.testServerHealth('http://localhost:8060');
      if (health) {
        return {
          url: 'http://localhost:8060',
          ws: 'ws://localhost:8060'
        };
      }

      // Scanner les adresses locales courantes
      const commonIPs = [
        'http://192.168.1.1:8060',
        'http://192.168.1.141:8060',
        'http://192.168.0.1:8060',
        'http://10.0.0.1:8060'
      ];

      for (const url of commonIPs) {
        const health = await this.testServerHealth(url);
        if (health) {
          return {
            url: url,
            ws: url.replace('http', 'ws')
          };
        }
      }

      return null;
    } catch (error) {
      console.error('❌ Erreur découverte serveur:', error);
      return null;
    }
  }

  /**
     * Tester la santé d'un serveur
     */
  async testServerHealth(baseUrl) {
    try {
      const response = await fetch(`${baseUrl}${this.config.healthEndpoint}`, {
        method: 'GET',
        timeout: 2000
      });

      if (response.ok) {
        const data = await response.json();
        if (data.status === 'ok') {
          return true;
        }
      }
    } catch (error) {
      // Erreur attendue si le serveur n'est pas disponible
    }
    return false;
  }

  /**
     * Mettre à jour l'état de connexion
     */
  setConnected(connected) {
    this.serverConnected = connected;
    if (window.APP_CONFIG) {
      window.APP_CONFIG.serverConnected = connected;
    }
  }

  /**
     * Obtenir l'URL du serveur
     */
  getServerUrl() {
    return this.serverUrl || 'http://localhost:8060';
  }

  /**
     * Obtenir l'URL WebSocket
     */
  getServerWsUrl() {
    return this.serverWsUrl || 'ws://localhost:8060';
  }
}

export default ConnectionConfig;
