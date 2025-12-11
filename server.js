/**
 * SERVER.JS - Serveur Express pour Workspace
 * Gère l'API et la base de données SQLite3
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const agendaRoutes = require('./routes/agenda.js');
const db = require('./database.js');
const { closeDatabase } = require('./database.js');
const logger = require('./logger.js');
const chatLogger = require('./chat-logger.js');

const app = express();
// Toujours utiliser 8060 sauf si explicitement fourni ET différent de 3000 (npm défaut)
const PORT = process.env.PORT && process.env.PORT !== '3000' ? process.env.PORT : 8060;
const isDev = process.argv.includes('--dev');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Routes API
app.use('/api/agenda', agendaRoutes);

/**
 * API - Informations système
 */
app.get('/api/system', (req, res) => {
    const os = require('os');
    const dns = require('dns');
    
    try {
        // Récupérer les informations RAM
        const totalRAM = os.totalmem();
        const freeRAM = os.freemem();
        const usedRAM = totalRAM - freeRAM;
        
        // Convertir en Go
        const totalRAMGB = (totalRAM / (1024 ** 3)).toFixed(2);
        const usedRAMGB = (usedRAM / (1024 ** 3)).toFixed(2);
        const freeRAMGB = (freeRAM / (1024 ** 3)).toFixed(2);
        
        // Récupérer les interfaces réseau
        const networkInterfaces = os.networkInterfaces();
        let ipAddress = 'Non disponible';
        let hasConnection = false;
        let connectionType = 'none'; // 'wifi', 'ethernet', 'none'
        
        // Trouver l'IP locale (non loopback, IPv4) et le type de connexion
        for (const interfaceName in networkInterfaces) {
            const interfaces = networkInterfaces[interfaceName];
            const nameLower = interfaceName.toLowerCase();
            
            for (const iface of interfaces) {
                if (iface.family === 'IPv4' && !iface.internal) {
                    ipAddress = iface.address;
                    hasConnection = true;
                    
                    // Détecter le type de connexion selon le nom de l'interface
                    if (nameLower.includes('wi-fi') || nameLower.includes('wifi') || 
                        nameLower.includes('wlan') || nameLower.includes('wireless')) {
                        connectionType = 'wifi';
                    } else if (nameLower.includes('ethernet') || nameLower.includes('eth') || 
                               nameLower.includes('lan') || nameLower.includes('en0')) {
                        connectionType = 'ethernet';
                    } else {
                        // Par défaut, considérer comme ethernet si connecté
                        connectionType = 'ethernet';
                    }
                    break;
                }
            }
            if (hasConnection) break;
        }
        
        // Vérifier la connexion Internet
        dns.lookup('google.com', (err) => {
            const isOnline = !err;
            
            res.json({
                success: true,
                data: {
                    ip: ipAddress,
                    ram: {
                        total: parseFloat(totalRAMGB),
                        used: parseFloat(usedRAMGB),
                        free: parseFloat(freeRAMGB),
                        usedPercent: ((usedRAM / totalRAM) * 100).toFixed(1)
                    },
                    network: {
                        hasConnection: hasConnection,
                        isOnline: isOnline,
                        connectionType: connectionType
                    },
                    uptime: Math.floor(os.uptime()),
                    platform: os.platform(),
                    hostname: os.hostname()
                }
            });
        });
    } catch (error) {
        logger.error('❌ Erreur récupération infos système:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des informations système'
        });
    }
});

/**
 * CHAT - WebSocket uniquement (voir la configuration WebSocket plus bas)
 */

// Initialiser table chat de manière synchrone
try {
    db.exec(`
        CREATE TABLE IF NOT EXISTS chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pseudo TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    logger.info('✅ Table chat_messages prête');
} catch (err) {
    logger.error('❌ Erreur création table chat:', err);
}

/**
 * Health Check
 */
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

/**
 * Route racine
 */
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

/**
 * Servir les pages
 */
app.get('/:page', (req, res) => {
    const { page } = req.params;
    const filePath = path.join(__dirname, `public/pages/${page}.html`);
    res.sendFile(filePath, (err) => {
        if (err) {
            res.status(404).send('Page not found');
        }
    });
});

/**
 * 404 Handler
 */
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route non trouvée',
        path: req.path
    });
});

/**
 * Error Handler
 */
app.use((err, req, res, next) => {
    logger.error('❌ Erreur serveur:', err);
    res.status(500).json({
        success: false,
        message: isDev ? err.message : 'Une erreur est survenue'
    });
});

/**
 * Démarrer le serveur avec WebSocket
 */
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Stocker les clients WebSocket - un par poste/pseudo
const chatClients = new Map(); // Map de pseudo -> ws

// WebSocket connection handler
wss.on('connection', (ws) => {
    logger.info('✅ Nouvelle connexion WebSocket établie');
    chatLogger.logEvent('CONNECTION', 'Nouvelle connexion WebSocket');
    
    let userPseudo = null;

    // Envoyer l'historique des messages au nouveau client
    db.all(
        'SELECT id, pseudo, message, created_at FROM chat_messages ORDER BY created_at DESC LIMIT 50',
        (err, rows) => {
            if (!err && rows) {
                ws.send(JSON.stringify({
                    type: 'history',
                    messages: rows.reverse()
                }));
            }
        }
    );

    // Gérer les messages
    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data);
            
            if (msg.type === 'setPseudo') {
                // L'utilisateur définit son pseudo
                const oldPseudo = userPseudo;
                const newPseudo = msg.pseudo;
                
                // Retirer l'ancienne connexion si elle existe
                if (oldPseudo && chatClients.has(oldPseudo)) {
                    const oldWs = chatClients.get(oldPseudo);
                    if (oldWs !== ws) {
                        oldWs.close();
                    }
                }
                
                // Ajouter/remplacer la connexion avec le nouveau pseudo
                if (chatClients.has(newPseudo)) {
                    const existingWs = chatClients.get(newPseudo);
                    if (existingWs !== ws) {
                        existingWs.close();
                        chatLogger.logPseudoChange(newPseudo, newPseudo, 'remplacement');
                    }
                }
                
                userPseudo = newPseudo;
                chatClients.set(newPseudo, ws);
                
                // Logger la connexion de l'utilisateur
                chatLogger.logConnection(newPseudo);
                chatLogger.logWebSocketAction('PSEUDO_SET', newPseudo, `Total: ${chatClients.size} utilisateur(s)`);
                logger.info(`✅ Utilisateur connecté: ${newPseudo} (Total: ${chatClients.size})`);
                
                // Notifier tous les clients du nombre d'utilisateurs
                broadcastUserCount();
            } 
            else if (msg.type === 'chat') {
                const { pseudo, message } = msg;
                
                if (!pseudo || !message) {
                    ws.send(JSON.stringify({ type: 'error', text: 'Pseudo et message requis' }));
                    return;
                }
                
                // Sauvegarder en BD
                db.run(
                    'INSERT INTO chat_messages (pseudo, message) VALUES (?, ?)',
                    [pseudo, message],
                    function(err) {
                        if (err) {
                            logger.error('❌ Erreur insertion:', err);
                            chatLogger.logError(err.message, 'DB_INSERT_FAILED', `pseudo: ${pseudo}`);
                            ws.send(JSON.stringify({ type: 'error', text: 'Erreur BD' }));
                            return;
                        }
                        
                        // Logger le message
                        chatLogger.logMessage(pseudo, message);
                        chatLogger.logWebSocketAction('MESSAGE', pseudo, `"${message.substring(0, 50)}${message.length > 50 ? '...' : ''}"`);
                        
                        // Broadcaster à tous les clients
                        const chatMsg = {
                            type: 'newMessage',
                            id: this.lastID,
                            pseudo,
                            message,
                            created_at: new Date().toISOString()
                        };
                        
                        chatClients.forEach(client => {
                            if (client.readyState === WebSocket.OPEN) {
                                client.send(JSON.stringify(chatMsg));
                            }
                        });
                    }
                );
            }
            else if (msg.type === 'clearChat') {
                // Supprimer tous les messages du chat
                const { pseudo } = msg;
                
                if (!pseudo) {
                    ws.send(JSON.stringify({ type: 'error', text: 'Pseudo requis pour supprimer le chat' }));
                    return;
                }
                
                // Supprimer tous les messages de la BD
                db.run('DELETE FROM chat_messages', (err) => {
                    if (err) {
                        logger.error('❌ Erreur suppression chat:', err);
                        chatLogger.logError(err.message, 'DB_DELETE_FAILED', `pseudo: ${pseudo}`);
                        ws.send(JSON.stringify({ type: 'error', text: 'Erreur suppression BD' }));
                        return;
                    }
                    
                    // Logger l'action
                    chatLogger.logEvent('CLEAR_CHAT', `Chat supprimé par ${pseudo}`);
                    chatLogger.logWebSocketAction('CLEAR_CHAT', pseudo, 'Tous les messages supprimés');
                    logger.info(`🗑️  Chat vidé par ${pseudo}`);
                    
                    // Broadcaster l'action de suppression à tous les clients
                    const clearMsg = {
                        type: 'chatCleared',
                        clearedBy: pseudo,
                        timestamp: new Date().toISOString()
                    };
                    
                    chatClients.forEach(client => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify(clearMsg));
                        }
                    });
                    
                    // Confirmer au client
                    ws.send(JSON.stringify({ type: 'success', text: 'Chat supprimé avec succès' }));
                });
            }
        } catch (err) {
            logger.error('❌ Erreur WebSocket:', err);
        }
    });

    // Gérer la déconnexion
    ws.on('close', () => {
        if (userPseudo && chatClients.get(userPseudo) === ws) {
            chatClients.delete(userPseudo);
            chatLogger.logDisconnection(userPseudo);
            chatLogger.logWebSocketAction('DISCONNECT', userPseudo, `Total: ${chatClients.size} utilisateur(s)`);
            logger.info(`❌ Utilisateur déconnecté: ${userPseudo} (Total: ${chatClients.size})`);
            
            // Notifier tous les clients du nombre d'utilisateurs
            broadcastUserCount();
        }
    });
    
    ws.on('error', (err) => {
        logger.error('❌ Erreur WebSocket client:', err);
        chatLogger.logError(err.message, 'WEBSOCKET_ERROR', userPseudo || 'unknown');
    });
});

/**
 * Broadcaster le nombre d'utilisateurs connectés
 */
function broadcastUserCount() {
    const userCount = chatClients.size;
    const userList = Array.from(chatClients.keys());
    
    const message = {
        type: 'userCount',
        count: userCount,
        users: userList
    };
    
    chatClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}

// Lancer le serveur HTTP
server.listen(PORT, () => {
    logger.info(`🚀 Workspace 1.0 - Serveur lancé`);
    logger.info(`📍 Accès: http://localhost:${PORT}`);
    logger.info(`🔧 Mode: ${isDev ? 'développement (node server.js)' : 'production'}`);
    logger.info(`💬 WebSocket: ws://localhost:${PORT}`);
    logger.info(`✨ Serveur prêt à recevoir les connexions`);
});

/**
 * Gestion de l'arrêt gracieux
 */
process.on('SIGINT', async () => {
    logger.info('⏹️  ARRÊT DU SERVEUR - Ctrl+C reçu');
    logger.info(`🚪 Poste déconnecté de http://localhost:${PORT}`);
    logger.info(`🔌 Fermeture des connexions WebSocket`);
    server.close(async () => {
        logger.info('✅ Serveur HTTP fermé');
        await closeDatabase();
        logger.info('✅ Base de données fermée');
        logger.info('✅ SERVEUR ARRÊTÉ - Fin de session');
        logger.info('============================================================');
        process.exit(0);
    });
});

process.on('SIGTERM', async () => {
    logger.info('⏹️  ARRÊT DU SERVEUR (SIGTERM reçu)');
    logger.info(`🚪 Poste déconnecté de http://localhost:${PORT}`);
    logger.info(`🔌 Fermeture des connexions WebSocket`);
    server.close(async () => {
        logger.info('✅ Serveur HTTP fermé');
        await closeDatabase();
        logger.info('✅ Base de données fermée');
        logger.info('✅ SERVEUR ARRÊTÉ - Fin de session');
        logger.info('============================================================');
        process.exit(0);
    });
});

/**
 * Fonction pour arrêter le serveur proprement (appelée par Electron)
 */
function shutdownServer() {
    return new Promise((resolve) => {
        logger.info('🚪 Fermeture du serveur HTTP/WebSocket');
        server.close(async () => {
            logger.info('✅ Serveur HTTP fermé');
            await closeDatabase();
            logger.info('✅ Base de données fermée');
            resolve();
        });
    });
}

// Exporter l'app ET la fonction de shutdown
module.exports = app;
module.exports.shutdown = shutdownServer;

