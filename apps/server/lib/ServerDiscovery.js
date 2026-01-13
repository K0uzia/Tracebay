/**
 * ServerDiscovery.js
 * Système de découverte du serveur par les clients via UDP broadcast
 * Le serveur annonce sa présence et son adresse IP
 */

const dgram = require('dgram');
const os = require('os');
const net = require('net');

const DISCOVERY_PORT = 8061;  // Port UDP pour la découverte
const BROADCAST_INTERVAL = 5000;  // Toutes les 5 secondes
const WORKSPACE_MAGIC = 'WORKSPACE_SERVER_BEACON';  // Signature du serveur

class ServerDiscovery {
    constructor(serverPort = 8060) {
        this.serverPort = serverPort;
        this.socket = null;
        this.broadcastInterval = null;
        this.broadcastAddress = null;
        this.myIP = null;
    }

    /**
     * Obtenir l'adresse IP locale du serveur
     */
    getLocalIP() {
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                // IPv4, non-interne
                if (iface.family === 'IPv4' && !iface.internal) {
                    return iface.address;
                }
            }
        }
        return 'localhost';
    }

    /**
     * Obtenir l'adresse broadcast du réseau
     */
    getBroadcastAddress() {
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    // Calculer l'adresse broadcast (255 sur le dernier octet)
                    const parts = iface.address.split('.');
                    return `${parts[0]}.${parts[1]}.${parts[2]}.255`;
                }
            }
        }
        return '255.255.255.255';
    }

    /**
     * Démarrer le service de découverte
     */
    start() {
        try {
            this.myIP = this.getLocalIP();
            this.broadcastAddress = this.getBroadcastAddress();

            console.log(`🔍 ServerDiscovery started`);
            console.log(`   📍 Local IP: ${this.myIP}`);
            console.log(`   📡 Broadcast Address: ${this.broadcastAddress}`);
            console.log(`   🔌 Discovery Port: ${DISCOVERY_PORT}`);

            // Créer le socket UDP
            this.socket = dgram.createSocket('udp4');

            this.socket.on('error', (err) => {
                console.error('❌ Discovery socket error:', err.message);
                this.socket.close();
                this.socket = null;
            });

            this.socket.on('listening', () => {
                try {
                    this.socket.setBroadcast(true);
                    console.log('✅ Discovery socket ready for broadcasting');
                    
                    // Commencer le broadcast
                    this.startBroadcasting();
                } catch (err) {
                    console.error('❌ Error setting broadcast option:', err.message);
                }
            });

            this.socket.bind(0, () => {
                // Bind successful
            });

        } catch (err) {
            console.error('❌ Failed to start ServerDiscovery:', err.message);
        }
    }

    /**
     * Commencer à broadcaster la présence du serveur
     */
    startBroadcasting() {
        // Broadcaster immédiatement
        this.broadcast();

        // Puis toutes les 5 secondes
        this.broadcastInterval = setInterval(() => {
            this.broadcast();
        }, BROADCAST_INTERVAL);
    }

    /**
     * Envoyer un message de découverte
     */
    broadcast() {
        if (!this.socket) return;

        const beaconData = {
            magic: WORKSPACE_MAGIC,
            serverIP: this.myIP,
            serverPort: this.serverPort,
            timestamp: Date.now(),
            name: 'Workspace Server'
        };

        const message = Buffer.from(JSON.stringify(beaconData));

        try {
            this.socket.send(message, 0, message.length, DISCOVERY_PORT, this.broadcastAddress, (err) => {
                if (err) {
                    console.error('❌ Broadcast error:', err.message);
                } else {
                    // Silencieux en production, verbose en debug
                    if (process.env.DEBUG_DISCOVERY) {
                        console.log(`📡 Beacon sent to ${this.broadcastAddress}:${DISCOVERY_PORT}`);
                    }
                }
            });
        } catch (err) {
            console.error('❌ Failed to broadcast:', err.message);
        }
    }

    /**
     * Arrêter le service de découverte
     */
    stop() {
        if (this.broadcastInterval) {
            clearInterval(this.broadcastInterval);
            this.broadcastInterval = null;
        }

        if (this.socket) {
            try {
                this.socket.close();
                this.socket = null;
                console.log('✅ ServerDiscovery stopped');
            } catch (err) {
                console.error('❌ Error stopping discovery:', err.message);
            }
        }
    }
}

module.exports = ServerDiscovery;
