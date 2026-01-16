/**
 * SERVER.JS - Express Server with WebSocket
 * Configuration main du serveur API
 */

try { require('dotenv').config(); } catch (_) {}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

// Import discovery service
const ServerDiscovery = require('./lib/ServerDiscovery.js');

// Import routes
const authRouter = require('./routes/auth.js');
const agendaRouter = require('./routes/agenda.js');
const shortcutsRouter = require('./routes/shortcuts.js');
const healthRouter = require('./routes/health.js');
const monitoringRouter = require('./routes/monitoring.js');
const lotsRouter = require('./routes/lots.js');
const marquesModelesRouter = require('./routes/marques-modeles.js');
const serverLogger = require('./lib/ServerLogger.js');

// Import middleware
const httpRequestTracker = require('./middleware/httpRequestTracker.js');

// Import database
const db = require('./database.js');

// Configuration
const SERVER_HOST = process.env.SERVER_HOST || 'localhost';
const SERVER_PORT = parseInt(process.env.SERVER_PORT) || 8060;
const NODE_ENV = process.env.NODE_ENV || 'development';

console.log('\n🚀 Starting Workspace Server...');
console.log(`   Environment: ${NODE_ENV}`);
console.log(`   Host: ${SERVER_HOST}`);
console.log(`   Port: ${SERVER_PORT}\n`);

// Initialiser le service de découverte
let discoveryService = null;

// Create Express app
const app = express();

// Create HTTP server for WebSocket
const server = http.createServer(app);

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'file://',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Track HTTP requests (pour le dashboard)
app.use(httpRequestTracker());

// Servir les fichiers publics (dashboard UI)
app.use(express.static(path.join(__dirname, 'public')));

// Route spécifique pour servir les PDFs avec le bon Content-Type
app.get('/pdfs/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, 'public', 'pdfs', filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: 'PDF non trouvé' });
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.sendFile(filePath);
});

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check early
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// Routes
app.use('/api/auth', authRouter);
app.use('/api/agenda', agendaRouter);
app.use('/api/shortcuts', shortcutsRouter);
app.use('/api/health', healthRouter);
app.use('/api/monitoring', monitoringRouter);
app.use('/api/lots', lotsRouter);
app.use('/api/marques', marquesModelesRouter);

// Simplified log feed for the game terminal
app.get('/api/logs', (req, res) => {
  const limit = parseInt(req.query.limit) || 200;
  const logs = serverLogger.getRequestLogs(limit).map((log) => {
    const ts = log.timestamp ? new Date(log.timestamp) : new Date();
    let level = 'INFO';
    if (log.status >= 500) level = 'ERROR';
    else if (log.status >= 400) level = 'WARN';

    const duration = typeof log.duration === 'number' ? `${log.duration}ms` : '0ms';
    const statusText = log.statusText ? ` ${log.statusText}` : '';
    return {
      time: ts.toLocaleTimeString('fr-FR'),
      level,
      msg: `[${log.method}] ${log.path} → ${log.status}${statusText} (${duration})`
    };
  });

  res.json(logs);
});

// Dashboard UI (optional, for monitoring)
app.use(express.static(path.join(__dirname, 'public')));

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

// WebSocket server setup
const wss = new WebSocket.Server({ server });

console.log('📡 WebSocket server initialized');

// Track connected clients
const connectedClients = new Map();

wss.on('connection', (ws, req) => {
  const clientIp = (req.socket.remoteAddress || '').replace('::ffff:', '');
  console.log(`✅ WebSocket client connected: ${clientIp}`);

  // Marquer le type de client (par défaut: client normal)
  ws.clientType = 'client';

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'connected',
    message: 'Connected to Workspace server'
  }));

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data);
      console.log('📨 WebSocket message:', message.type);

      if (message.type === 'monitor' && message.action === 'subscribe') {
        // Dashboard se connecte
        ws.clientType = 'monitor';
        console.log('📊 Dashboard monitor connected');

        // Envoyer immédiatement les stats au dashboard
        const users = Array.from(connectedClients.values());
        const userList = users.map(u => ({ username: u.username, ip: u.ip }));
        ws.send(JSON.stringify({
          type: 'userCount',
          count: users.length,
          users: userList
        }));
        return;
      }

      if (message.type === 'auth') {
        // Authenticate client with JWT
        const token = message.token;
        if (!token) {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Token required'
          }));
          return;
        }

        try {
          const { verifyToken } = require('./lib/jwt.js');
          const decoded = verifyToken(token);

          connectedClients.set(ws, {
            userId: decoded.id,
            username: decoded.username,
            ip: clientIp,
            connectedAt: new Date()
          });

          ws.send(JSON.stringify({
            type: 'authenticated',
            user: { id: decoded.id, username: decoded.username }
          }));

          broadcastUserCount();
          console.log(`✅ Client authenticated: ${decoded.username}`);
        } catch (error) {
          console.error('❌ Auth error:', error.message);
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Authentication failed'
          }));
        }
      }
      else if (message.type === 'message') {
        // Chat message
        const client = connectedClients.get(ws);

        if (!client) {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Not authenticated'
          }));
          return;
        }

        // Save message to database
        try {
          const { dbPromise } = require('./database.js');
          await dbPromise.run(
            'INSERT INTO chat_messages (user_id, pseudo, message) VALUES (?, ?, ?)',
            [client.userId, client.username, message.text]
          );

          // Broadcast message to all connected clients
          const broadcastMsg = {
            type: 'newMessage',
            message: {
              id: Date.now(),
              user_id: client.userId,
              pseudo: client.username,
              message: message.text,
              created_at: new Date().toISOString()
            }
          };

          wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify(broadcastMsg));
            }
          });

          console.log(`💬 Message broadcast from ${client.username}`);
        } catch (error) {
          console.error('❌ Message save error:', error);
        }
      }
    } catch (error) {
      console.error('❌ WebSocket parse error:', error.message);
    }
  });

  ws.on('close', () => {
    const client = connectedClients.get(ws);
    if (client) {
      console.log(`❌ Client disconnected: ${client.username}`);
      connectedClients.delete(ws);
      broadcastUserCount();
    }
  });

  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
  });
});

/**
 * Broadcast connected user count to all clients
 */
function broadcastUserCount() {
  const users = Array.from(connectedClients.values());
  const userList = users.map(u => ({ username: u.username, ip: u.ip }));

  const message = JSON.stringify({
    type: 'userCount',
    count: users.length,
    users: userList
  });

  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });

  console.log(`📊 Broadcast userCount: ${users.length} utilisateur(s) connecté(s)`);
}

// Start server
server.listen(SERVER_PORT, SERVER_HOST, () => {
  console.log(`\n✅ Workspace Server running on http://${SERVER_HOST}:${SERVER_PORT}`);
  console.log(`📡 WebSocket available at ws://${SERVER_HOST}:${SERVER_PORT}`);
  console.log('\n🟢 Ready to accept connections\n');

  // Démarrer le service de découverte
  if (SERVER_HOST === '0.0.0.0' || SERVER_HOST === 'localhost') {
    discoveryService = new ServerDiscovery(SERVER_PORT);
    discoveryService.start();
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n📛 Shutting down gracefully...');

  // Arrêter le service de découverte
  if (discoveryService) {
    discoveryService.stop();
  }

  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('❌ Force shutdown');
    process.exit(1);
  }, 5000);
});

/**
 * Fonction pour arrêter le serveur proprement
 */
function shutdown() {
  return new Promise((resolve, reject) => {
    console.log('⏹️  SHUTDOWN SERVEUR');
    server.close(() => {
      console.log('✅ Serveur fermé');
      resolve();
    });

    setTimeout(() => {
      console.error('❌ Fermeture forcée');
      reject(new Error('Shutdown timeout'));
    }, 5000);
  });
}

module.exports = {
  shutdown,
  server,
  app
};


