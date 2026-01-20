import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import websocket from '@fastify/websocket';
import dotenv from 'dotenv';
import { getConfig } from '../../../config/network.config';

// Load environment variables
dotenv.config();

// Configuration
const nodeEnv = (process.env.NODE_ENV || 'development') as 'development' | 'production';
const config = getConfig(nodeEnv);
const proxmoxConfig = config.proxmox;

// Initialize Fastify
const fastify: FastifyInstance = Fastify({
  logger: process.env.NODE_ENV === 'production' ? true : {
    level: process.env.LOG_LEVEL || 'info'
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

    // Health check endpoint
    fastify.get('/api/health', async (request: FastifyRequest, reply: FastifyReply) => {
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: nodeEnv,
        version: '2.0.0'
      };
    });

    // Auth routes
    fastify.post('/api/auth/login', async (request: FastifyRequest, reply: FastifyReply) => {
      const { username, password } = request.body as { username: string; password: string };
      
      if (!username || !password) {
        reply.statusCode = 400;
        return { error: 'Username and password required' };
      }

      // Mock authentication for development
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

    // Events routes (Agenda)
    fastify.get('/api/events', async (request: FastifyRequest, reply: FastifyReply) => {
      // Mock events for development
      return {
        success: true,
        events: [
          {
            id: 'evt_1',
            title: 'Team Meeting',
            start: new Date().toISOString(),
            end: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            createdAt: new Date().toISOString()
          }
        ]
      };
    });

    fastify.post('/api/events', async (request: FastifyRequest, reply: FastifyReply) => {
      const { title, start, end } = request.body as any;

      if (!title || !start || !end) {
        reply.statusCode = 400;
        return { error: 'Title, start, and end are required' };
      }

      return {
        success: true,
        event: {
          id: `evt_${Date.now()}`,
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

      return {
        success: true,
        messages: [
          {
            id: 'msg_1',
            userId: 'user_1',
            text: 'Welcome to Workspace!',
            createdAt: new Date().toISOString()
          }
        ],
        total: 1
      };
    });

    fastify.post('/api/messages', async (request: FastifyRequest, reply: FastifyReply) => {
      const { text, userId } = request.body as any;

      if (!text || !userId) {
        reply.statusCode = 400;
        return { error: 'Text and userId are required' };
      }

      messageCount++;
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
      return {
        success: true,
        shortcuts: [
          {
            id: 'sc_1',
            name: 'Meeting',
            description: 'Schedule a meeting',
            icon: 'calendar'
          }
        ]
      };
    });

    fastify.post('/api/shortcuts', async (request: FastifyRequest, reply: FastifyReply) => {
      const { name, description, icon } = request.body as any;

      if (!name) {
        reply.statusCode = 400;
        return { error: 'Name is required' };
      }

      return {
        success: true,
        shortcut: {
          id: `sc_${Date.now()}`,
          name,
          description,
          icon,
          createdAt: new Date().toISOString()
        }
      };
    });

    // Lots routes (Réception)
    fastify.get('/api/lots', async (request: FastifyRequest, reply: FastifyReply) => {
      return {
        success: true,
        lots: [
          {
            id: 'lot_1',
            status: 'received',
            itemCount: 5,
            receivedAt: new Date().toISOString()
          }
        ]
      };
    });

    fastify.post('/api/lots', async (request: FastifyRequest, reply: FastifyReply) => {
      const { itemCount, description } = request.body as any;

      if (!itemCount) {
        reply.statusCode = 400;
        return { error: 'itemCount is required' };
      }

      return {
        success: true,
        lot: {
          id: `lot_${Date.now()}`,
          itemCount,
          description,
          status: 'received',
          receivedAt: new Date().toISOString()
        }
      };
    });

    // Monitoring stats
    fastify.get('/api/monitoring/stats', async (request: FastifyRequest, reply: FastifyReply) => {
      const uptime = process.uptime();
      const memUsage = process.memoryUsage();
      const messagesPerMinute = (messageCount / (uptime / 60)).toFixed(2);

      return {
        success: true,
        stats: {
          connectedUsers: connectedUsers.size,
          messagesPerMinute: parseFloat(messagesPerMinute as any),
          memoryUsage: {
            rss: (memUsage.rss / 1024 / 1024).toFixed(2) + ' MB',
            heapUsed: (memUsage.heapUsed / 1024 / 1024).toFixed(2) + ' MB',
            heapTotal: (memUsage.heapTotal / 1024 / 1024).toFixed(2) + ' MB'
          },
          uptime: (uptime / 60).toFixed(2) + ' minutes'
        }
      };
    });

    // WebSocket routes
    fastify.register(async (fastify: any) => {
      fastify.get('/ws', { websocket: true }, (socket: any, request: any) => {
        const userId = `ws_user_${Date.now()}`;
        const username = request.query?.username as string || `User_${Math.random().toString(36).substr(2, 9)}`;

        // Store connected user
        connectedUsers.set(userId, {
          id: userId,
          username,
          socket,
          connectedAt: new Date()
        });

        fastify.log.info(`✅ WebSocket connected: ${username} (${userId})`);

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

        // Handle incoming messages
        socket.on('message', (data: any) => {
          try {
            const message = JSON.parse(data.toString());

            switch (message.type) {
              case 'message:send':
                messageCount++;
                // Broadcast to all users
                for (const user of connectedUsers.values()) {
                  try {
                    user.socket.send(JSON.stringify({
                      type: 'message:new',
                      data: {
                        id: `msg_${Date.now()}`,
                        userId,
                        username,
                        text: message.text,
                        createdAt: new Date().toISOString()
                      }
                    }));
                  } catch (e) {
                    // Socket might be closed
                  }
                }
                break;

              case 'typing:indicator':
                // Broadcast typing status
                for (const user of connectedUsers.values()) {
                  if (user.id !== userId) {
                    try {
                      user.socket.send(JSON.stringify({
                        type: 'typing:indicator',
                        data: {
                          userId,
                          username,
                          isTyping: message.isTyping
                        }
                      }));
                    } catch (e) {
                      // Socket might be closed
                    }
                  }
                }
                break;

              case 'presence:update':
                // Broadcast presence update
                for (const user of connectedUsers.values()) {
                  if (user.id !== userId) {
                    try {
                      user.socket.send(JSON.stringify({
                        type: 'presence:update',
                        data: {
                          userId,
                          username,
                          status: message.status
                        }
                      }));
                    } catch (e) {
                      // Socket might be closed
                    }
                  }
                }
                break;

              default:
                fastify.log.warn(`Unknown message type: ${message.type}`);
            }
          } catch (e) {
            fastify.log.error(`Error parsing message: ${e}`);
          }
        });

        // Handle disconnection
        socket.on('close', () => {
          connectedUsers.delete(userId);
          fastify.log.info(`❌ WebSocket disconnected: ${username} (${userId})`);

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
