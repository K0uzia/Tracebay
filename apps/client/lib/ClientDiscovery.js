/**
 * ClientDiscovery.js
 * Système de détection du serveur Workspace par les clients
 * Écoute les beacons UDP du serveur
 */

const dgram = require('dgram');
const net = require('net');

const DISCOVERY_PORT = 8061;  // Même port que le serveur
const WORKSPACE_MAGIC = 'WORKSPACE_SERVER_BEACON';  // Signature attendue
const DISCOVERY_TIMEOUT = 10000;  // 10 secondes timeout

class ClientDiscovery {
  constructor() {
    this.socket = null;
    this.servers = new Map();  // Map des serveurs découverts
    this.discoveryTimeout = null;
  }

  /**
     * Découvrir les serveurs disponibles
     */
  async discover(timeout = DISCOVERY_TIMEOUT) {
    return new Promise((resolve) => {
      this.servers.clear();

      try {
        this.socket = dgram.createSocket('udp4');

        this.socket.on('message', (msg, rinfo) => {
          try {
            const beacon = JSON.parse(msg.toString());

            // Vérifier la signature du serveur
            if (beacon.magic === WORKSPACE_MAGIC) {
              const serverId = `${beacon.serverIP}:${beacon.serverPort}`;

              this.servers.set(serverId, {
                ip: beacon.serverIP,
                port: beacon.serverPort,
                name: beacon.name,
                timestamp: beacon.timestamp,
                lastSeen: Date.now()
              });

              console.log(`🎯 Serveur découvert: ${beacon.name} sur ${beacon.serverIP}:${beacon.serverPort}`);
            }
          } catch (err) {
            // Ignorer les messages non-valides
          }
        });

        this.socket.on('error', (err) => {
          console.error('❌ Discovery error:', err.message);
          this.closeSocket();
        });

        // Bind au port de découverte
        this.socket.bind(DISCOVERY_PORT, '0.0.0.0', () => {
          try {
            // Rejoindre le groupe multicast (optionnel, pour mDNS compatible)
            this.socket.addMembership('224.0.0.1');
          } catch (err) {
            // Pas grave si multicast ne fonctionne pas
          }

          console.log(`🔍 Discovery listening on port ${DISCOVERY_PORT}...`);
        });

        // Timeout pour arrêter l'écoute
        this.discoveryTimeout = setTimeout(() => {
          this.closeSocket();
          const serversList = Array.from(this.servers.values());
          resolve(serversList);
        }, timeout);

      } catch (err) {
        console.error('❌ Failed to start discovery:', err.message);
        resolve([]);
      }
    });
  }

  /**
     * Trouver le premier serveur disponible
     */
  async findServer(timeout = DISCOVERY_TIMEOUT) {
    const servers = await this.discover(timeout);

    if (servers.length > 0) {
      const server = servers[0];
      console.log(`✅ Serveur sélectionné: ${server.ip}:${server.port}`);
      return {
        url: `http://${server.ip}:${server.port}`,
        ws: `ws://${server.ip}:${server.port}`
      };
    }

    console.warn('⚠️  Aucun serveur trouvé');
    return null;
  }

  /**
     * Fermer le socket de découverte
     */
  closeSocket() {
    if (this.discoveryTimeout) {
      clearTimeout(this.discoveryTimeout);
      this.discoveryTimeout = null;
    }

    if (this.socket) {
      try {
        this.socket.close();
        this.socket = null;
      } catch (err) {
        // Ignorer les erreurs de fermeture
      }
    }
  }

  /**
     * Arrêter la découverte
     */
  stop() {
    this.closeSocket();
    this.servers.clear();
  }
}

module.exports = ClientDiscovery;
