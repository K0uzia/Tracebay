import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import websocket from '@fastify/websocket';
import dotenv from 'dotenv';
import { registerMonitoringRoutes, incrementMessageCount } from './api/monitoring';
import { registerCompression } from './middleware/compression';
import { registerRateLimit } from './middleware/rate-limit';
import { registerMonitoring } from './middleware/monitoring';
import { globalMetrics } from './utils/metrics';
import { globalCache } from './utils/cache';
import { testConnection, initializeDatabase } from './db';

// Load environment variables
dotenv.config();

// Configuration
const nodeEnv = (process.env.NODE_ENV || 'development') as 'development' | 'production';
const proxmoxConfig = {
  port: parseInt(process.env.API_PORT || '4000', 10),
  host: process.env.SERVER_HOST || '0.0.0.0',
  wsPort: parseInt(process.env.WS_PORT || '4000', 10)
};

// Initialize Fastify
const fastify: FastifyInstance = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname'
      }
    }
  },
  bodyLimit: 1048576 // 1MB
});

// Type definitions for WebSocket context
interface WebSocketUser {
  id: string;
  username: string;
  socket: any;
  connectedAt: Date;
}

// Global state
const connectedUsers = new Map<string, WebSocketUser>();
let messageCount = 0;
const messageStartTime = Date.now();


// Register plugins
(async () => {
  try {
    // Initialize database connection
    console.log('🔄 Connecting to PostgreSQL...');
    const dbConnected = await testConnection();
    if (!dbConnected) {
      throw new Error('Failed to connect to database');
    }

    // Initialize database schema
    await initializeDatabase();

    // Phase 5: Performance optimization middlewares
    await registerCompression(fastify);
    await registerRateLimit(fastify);
    await registerMonitoring(fastify);

    // Security
    await fastify.register(helmet, {
      contentSecurityPolicy: false
    });

    // CORS
    await fastify.register(cors, {
      origin: true, // Allow all origins for development
      credentials: true
    });

    // WebSocket
    await fastify.register(websocket);

    // Register monitoring routes
    await registerMonitoringRoutes(fastify, connectedUsers);

    // Health check endpoint
    fastify.get('/api/health', async (request: FastifyRequest, reply: FastifyReply) => {
      const cacheStats = globalCache.stats();
      
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: nodeEnv,
        version: '2.0.0',
        cache: {
          size: cacheStats.size,
          maxSize: cacheStats.maxSize,
        },
        memory: {
          heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        },
      };
    });

    // Metrics endpoint (Phase 5)
    fastify.get('/api/metrics', async (request: FastifyRequest, reply: FastifyReply) => {
      const metrics = globalMetrics.getMetrics();
      const cacheStats = globalCache.stats();
      
      return {
        ...metrics,
        cache: cacheStats,
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString(),
      };
    });

    // Auth routes
    fastify.post('/api/auth/login', async (request: FastifyRequest, reply: FastifyReply) => {
      const { username, password } = request.body as { username: string; password: string };

      if (!username || !password) {
        reply.statusCode = 400;
        return { error: 'Username and password required' };
      }

      // TODO: Vérifier les credentials dans la base de données et générer JWT
      return {
        success: true,
        token: 'jwt_token_todo',
        user: {
          id: 1,
          username,
          createdAt: new Date().toISOString()
        }
      };
    });

    fastify.post('/api/auth/logout', async (request: FastifyRequest, reply: FastifyReply) => {
      // Remove user from connected users if exists
      const userId = (request as any).userId;
      if (userId) {
        connectedUsers.delete(userId);
      }

      return { success: true, message: 'Logged out successfully' };
    });

    fastify.post('/api/auth/verify', async (request: FastifyRequest, reply: FastifyReply) => {
      const token = request.headers.authorization?.replace('Bearer ', '');

      if (!token || !token.startsWith('mock_token_')) {
        reply.statusCode = 401;
        return { error: 'Invalid token' };
      }

      const userId = token.replace('mock_token_', '');
      return {
        valid: true,
        userId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      };
    });

    // Mock register endpoint to avoid 404
    fastify.post('/api/auth/register', async (request: FastifyRequest, reply: FastifyReply) => {
      const { username, password } = request.body as { username: string; password: string };

      if (!username || !password) {
        reply.statusCode = 400;
        return { error: 'Username and password required' };
      }

      const userId = `user_${Date.now()}`;
      const token = `mock_token_${userId}`;

      return {
        success: true,
        token,
        user: {
          id: userId,
          username,
          createdAt: new Date().toISOString()
        }
      };
    });

    // Events routes (Agenda)
    fastify.get('/api/events', async (request: FastifyRequest, reply: FastifyReply) => {
      // TODO: Charger les événements depuis la base de données
      return {
        success: true,
        events: []
      };
    });

    fastify.post('/api/events', async (request: FastifyRequest, reply: FastifyReply) => {
      const { title, start, end } = request.body as any;

      if (!title || !start || !end) {
        reply.statusCode = 400;
        return { error: 'Title, start, and end are required' };
      }

      // TODO: Insérer l'événement dans la base de données
      return {
        success: true,
        event: {
          id: 1,
          title,
          start,
          end,
          createdAt: new Date().toISOString()
        }
      };
    });

    // Messages routes (Chat)
    fastify.get('/api/messages', async (request: FastifyRequest, reply: FastifyReply) => {
      const limit = (request.query as any).limit || 50;

      // TODO: Charger les messages depuis la base de données avec limite
      return {
        success: true,
        messages: [],
        total: 0
      };
    });

    fastify.post('/api/messages', async (request: FastifyRequest, reply: FastifyReply) => {
      const { text, userId } = request.body as any;

      if (!text || !userId) {
        reply.statusCode = 400;
        return { error: 'Text and userId are required' };
      }

      messageCount++;
      incrementMessageCount();
      const message = {
        id: `msg_${Date.now()}`,
        userId,
        text,
        createdAt: new Date().toISOString()
      };

      // Broadcast to all connected users
      for (const user of connectedUsers.values()) {
        try {
          user.socket.send(JSON.stringify({
            type: 'message:new',
            data: message
          }));
        } catch (e) {
          // Socket might be closed
        }
      }

      return { success: true, message };
    });

    // Shortcuts routes
    fastify.get('/api/shortcuts', async (request: FastifyRequest, reply: FastifyReply) => {
      // TODO: Charger les raccourcis depuis la base de données
      return {
        success: true,
        shortcuts: []
      };
    });

    fastify.post('/api/shortcuts', async (request: FastifyRequest, reply: FastifyReply) => {
      const { name, description, icon } = request.body as any;

      if (!name) {
        reply.statusCode = 400;
        return { error: 'Name is required' };
      }

      // TODO: Insérer le raccourci dans la base de données
      return {
        success: true,
        shortcut: {
          id: 1,
          name,
          description,
          icon,
          createdAt: new Date().toISOString()
        }
      };
    });

    // Marques & Modèles (Réception)
    fastify.get('/api/marques', async () => {
      // TODO: Charger depuis la base de données
      return { success: true, items: [] };
    });

    fastify.get('/api/marques/all', async () => {
      // TODO: Charger depuis la base de données
      return { success: true, items: [] };
    });

    fastify.post('/api/marques', async (request: FastifyRequest, reply: FastifyReply) => {
      const { name } = request.body as any;
      if (!name) {
        reply.statusCode = 400;
        return { error: 'Name is required' };
      }

      // TODO: Insérer dans la base de données
      return { success: true, id: 1, name };
    });

    fastify.post('/api/marques/:marqueId/modeles', async (request: FastifyRequest, reply: FastifyReply) => {
      const { name } = request.body as any;
      const marqueId = parseInt((request.params as any).marqueId, 10);

      if (!name || Number.isNaN(marqueId)) {
        reply.statusCode = 400;
        return { error: 'Name and marqueId are required' };
      }

      // TODO: Insérer dans la base de données
      return { success: true, id: 1, name, marque_id: marqueId };
    });

    // Lots routes (Réception)
    fastify.get('/api/lots', async (request: FastifyRequest, reply: FastifyReply) => {
      // TODO: Charger les lots depuis la base de données
      return {
        success: true,
        lots: []
      };
    });

    fastify.post('/api/lots', async (request: FastifyRequest, reply: FastifyReply) => {
      const { itemCount, description, items, lotName } = request.body as any;

      // Support both legacy shape (itemCount) and new client shape (items array)
      const computedItemCount = Array.isArray(items) ? items.length : Number(itemCount);

      if (!computedItemCount || Number.isNaN(computedItemCount)) {
        reply.statusCode = 400;
        return { error: 'itemCount or items[] is required' };
      }

      const lotId = `lot_${Date.now()}`;

      // TODO: Insérer le lot dans la base de données
      return {
        success: true,
        id: lotId,
        lot: {
          id: lotId,
          itemCount: computedItemCount,
          description,
          name: lotName || null,
          status: 'received',
          receivedAt: new Date().toISOString()
        }
      };
    });

    // PDF generation stub
    fastify.post('/api/lots/:id/pdf', async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      return {
        success: true,
        id,
        pdf: `Lot ${id} PDF generation stub`,
        generatedAt: new Date().toISOString()
      };
    });

    // WebSocket routes
    fastify.register(async (fastify: any) => {
      fastify.get('/ws', { websocket: true }, (socket: any, request: any) => {
        const userId = `ws_user_${Date.now()}`;
        let username = request.query?.username as string || `User_${Math.random().toString(36).substr(2, 9)}`;
        let isAlive = true;

        const heartbeat = () => { isAlive = true; };

        // Store connected user
        connectedUsers.set(userId, {
          id: userId,
          username,
          socket,
          connectedAt: new Date()
        });

        fastify.log.info(`✅ WebSocket connected: ${username} (${userId})`);

        // Heartbeat to keep connections alive and detect dead sockets
        const pingInterval = setInterval(() => {
          if (!isAlive) {
            fastify.log.warn(`⏱️ Closing stale WebSocket for ${username} (${userId})`);
            try {
              socket.terminate?.();
            } catch {
              try { socket.close(); } catch { /* ignore */ }
            }
            return;
          }
          isAlive = false;
          try {
            socket.ping();
          } catch {
            // Ignore ping failures
          }
        }, 30000);

        // Send welcome message
        socket.send(JSON.stringify({
          type: 'connected',
          userId,
          username,
          timestamp: new Date().toISOString(),
          connectedUsers: connectedUsers.size
        }));

        // Broadcast user joined
        for (const user of connectedUsers.values()) {
          if (user.id !== userId) {
            try {
              user.socket.send(JSON.stringify({
                type: 'presence:update',
                data: {
                  userId,
                  username,
                  status: 'online'
                }
              }));
            } catch (e) {
              // Socket might be closed
            }
          }
        }

        // Helper for broadcasting
        const broadcast = (payload: any, excludeId?: string) => {
          for (const user of connectedUsers.values()) {
            if (excludeId && user.id === excludeId) continue;
            try {
              user.socket.send(JSON.stringify(payload));
            } catch {
              // Ignore send failures
            }
          }
        };

        // Handle incoming messages
        socket.on('message', (data: any) => {
          try {
            const message = JSON.parse(data.toString());

            switch (message.type) {
            case 'auth':
              // Mock auth acknowledgement
              socket.send(JSON.stringify({ type: 'auth:ack', ok: true }));
              break;

            case 'message':
            case 'message:send': {
              const text = message.text || message.data?.text;
              if (!text || !text.toString().trim()) {
                socket.send(JSON.stringify({ type: 'error', message: 'Message text is required' }));
                return;
              }

              messageCount++;
              incrementMessageCount();

              const outbound = {
                type: 'message:new',
                data: {
                  id: `msg_${Date.now()}`,
                  userId,
                  username,
                  text,
                  createdAt: new Date().toISOString()
                }
              };

              broadcast(outbound);
              break;
            }

            case 'setPseudo': {
              if (message.pseudo && typeof message.pseudo === 'string') {
                username = message.pseudo;
                const existing = connectedUsers.get(userId);
                if (existing) {
                  existing.username = username;
                }

                broadcast({
                  type: 'presence:update',
                  data: {
                    userId,
                    username,
                    status: 'online'
                  }
                }, userId);

                socket.send(JSON.stringify({ type: 'success', message: 'Pseudo updated' }));
              }
              break;
            }

            case 'typing':
            case 'typing:indicator':
              broadcast({
                type: 'typing:indicator',
                data: {
                  userId,
                  username,
                  isTyping: Boolean(message.isTyping)
                }
              }, userId);
              break;

            case 'presence:update':
              broadcast({
                type: 'presence:update',
                data: {
                  userId,
                  username,
                  status: message.status || 'online'
                }
              }, userId);
              break;

            default:
              fastify.log.warn(`Unknown message type: ${message.type}`);
            }
          } catch (e) {
            fastify.log.error(`Error parsing message: ${e}`);
            try {
              socket.send(JSON.stringify({ type: 'error', message: 'Invalid message payload' }));
            } catch {
              // Ignore send failures
            }
          }
        });

        // Handle disconnection
        socket.on('close', (code?: number, reason?: Buffer) => {
          connectedUsers.delete(userId);
          fastify.log.info(`❌ WebSocket disconnected: ${username} (${userId}) code=${code} reason=${reason?.toString() || ''}`);

          clearInterval(pingInterval);

          // Broadcast user left
          for (const user of connectedUsers.values()) {
            try {
              user.socket.send(JSON.stringify({
                type: 'presence:update',
                data: {
                  userId,
                  username,
                  status: 'offline'
                }
              }));
            } catch (e) {
              // Socket might be closed
            }
          }
        });

        // Handle errors
        socket.on('error', (error: any) => {
          fastify.log.error(`WebSocket error for ${username}: ${error.message}`);
        });

        // Handle pong response
        socket.on('pong', heartbeat);
      });
    });

    // Start server
    await fastify.listen({ port: proxmoxConfig.port, host: '0.0.0.0' });

    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║ 🚀 PROXMOX BACKEND RUNNING                                    ║
╠═══════════════════════════════════════════════════════════════╣
║ Environment: ${nodeEnv.padEnd(28)} ║
║ URL:         http://0.0.0.0:${proxmoxConfig.port.toString().padEnd(22)} ║
║ Health:      http://0.0.0.0:${proxmoxConfig.port}/api/health ${' '.repeat(10)} ║
║ WebSocket:   ws://0.0.0.0:${proxmoxConfig.port}/ws ${' '.repeat(21)} ║
║ Docs:        Postman/curl ready                               ║
╚═══════════════════════════════════════════════════════════════╝
    `);
  } catch (error) {
    fastify.log.error(error);
    process.exit(1);
  }
})();

export default fastify;
