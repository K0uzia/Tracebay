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
import { testConnection, initializeDatabase, query } from './db';

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


// Log every HTTP request (method, url, status, ms, ip)
fastify.addHook('onResponse', async (request, reply) => {
  const { method, url, ip } = request;
  const statusCode = reply.statusCode;
  const responseTime = reply.getResponseTime ? reply.getResponseTime() : (reply as any).elapsedTime || '-';
  fastify.log.info({ method, url, statusCode, responseTime, ip }, `HTTP ${method} ${url} ${statusCode} (${responseTime}ms) from ${ip}`);
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
    const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',').map(o => o.trim());
    
    await fastify.register(cors, {
      origin: allowedOrigins.length === 1 && allowedOrigins[0] === '*' 
        ? true 
        : allowedOrigins,
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

      // Mock: génère un token temporaire avec timestamp
      const userId = `user_${Date.now()}`;
      const token = `jwt_${Buffer.from(JSON.stringify({ userId, username, iat: Date.now() })).toString('base64')}`;

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

    fastify.get('/api/auth/verify', async (request: FastifyRequest, reply: FastifyReply) => {
      const token = request.headers.authorization?.replace('Bearer ', '');

      if (!token || !token.startsWith('jwt_')) {
        reply.statusCode = 401;
        return { error: 'Invalid token' };
      }

      try {
        // Decode simple token
        const decoded = JSON.parse(Buffer.from(token.replace('jwt_', ''), 'base64').toString());
        return {
          valid: true,
          userId: decoded.userId,
          username: decoded.username,
          expiresAt: new Date(decoded.iat + 7 * 24 * 60 * 60 * 1000).toISOString()
        };
      } catch (e) {
        reply.statusCode = 401;
        return { error: 'Invalid token format' };
      }
    });

    fastify.post('/api/auth/verify', async (request: FastifyRequest, reply: FastifyReply) => {
      const token = request.headers.authorization?.replace('Bearer ', '');

      if (!token || !token.startsWith('jwt_')) {
        reply.statusCode = 401;
        return { error: 'Invalid token' };
      }

      try {
        // Decode simple token
        const decoded = JSON.parse(Buffer.from(token.replace('jwt_', ''), 'base64').toString());
        return {
          valid: true,
          userId: decoded.userId,
          username: decoded.username,
          expiresAt: new Date(decoded.iat + 7 * 24 * 60 * 60 * 1000).toISOString()
        };
      } catch (e) {
        reply.statusCode = 401;
        return { error: 'Invalid token format' };
      }
    });

    // Mock register endpoint to avoid 404
    fastify.post('/api/auth/register', async (request: FastifyRequest, reply: FastifyReply) => {
      const { username, password } = request.body as { username: string; password: string };

      if (!username || !password) {
        reply.statusCode = 400;
        return { error: 'Username and password required' };
      }

      if (username.length < 3 || username.length > 20) {
        reply.statusCode = 400;
        return { error: 'Username must be between 3 and 20 characters' };
      }

      if (password.length < 6) {
        reply.statusCode = 400;
        return { error: 'Password must be at least 6 characters' };
      }

      const userId = `user_${Date.now()}`;
      const token = `jwt_${Buffer.from(JSON.stringify({ userId, username, iat: Date.now() })).toString('base64')}`;

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
      const limit = Math.min(Number((request.query as any).limit) || 50, 200);

      try {
        const result = await query(
          'SELECT id, user_id, username, text, conversation_id, created_at FROM messages ORDER BY created_at DESC LIMIT $1',
          [limit]
        );

        return {
          success: true,
          messages: result.rows.map((m: any) => ({
            id: m.id,
            user_id: m.user_id,
            pseudo: m.username,
            message: m.text,
            conversation_id: m.conversation_id,
            created_at: m.created_at
          })),
          total: result.rows.length
        };
      } catch (error) {
        console.error('Error fetching messages:', error);
        reply.statusCode = 500;
        return { error: 'Database error' };
      }
    });

    fastify.post('/api/messages', async (request: FastifyRequest, reply: FastifyReply) => {
      const { text, pseudo, userId } = request.body as any;

      if (!text || !pseudo) {
        reply.statusCode = 400;
        return { error: 'Text and pseudo are required' };
      }

      try {
        const result = await query(
          'INSERT INTO messages (user_id, username, text, conversation_id, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING id, username, text, created_at',
          [userId || null, pseudo, text, null]
        );

        const msg = result.rows[0];

        messageCount++;
        incrementMessageCount();

        // Broadcast to all connected users
        for (const user of connectedUsers.values()) {
          try {
            user.socket.socket.send(JSON.stringify({
              type: 'message:new',
              data: {
                id: msg.id,
                pseudo: msg.username,
                message: msg.text,
                created_at: msg.created_at
              }
            }));
          } catch (e) {
            // Socket might be closed
          }
        }

        return { success: true, message: msg };
      } catch (error) {
        console.error('Error creating message:', error);
        reply.statusCode = 500;
        return { error: 'Database error' };
      }
    });

    // Shortcuts categories routes
    fastify.get('/api/shortcuts/categories', async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = (request.query as any).userId || 1; // Default user if not provided

      try {
        const result = await query(
          'SELECT id, name, order_index, created_at FROM shortcut_categories WHERE user_id = $1 ORDER BY order_index ASC',
          [userId]
        );

        return {
          success: true,
          categories: result.rows
        };
      } catch (error) {
        console.error('Error fetching shortcut categories:', error);
        reply.statusCode = 500;
        return { error: 'Database error' };
      }
    });

    fastify.post('/api/shortcuts/categories', async (request: FastifyRequest, reply: FastifyReply) => {
      const { name } = request.body as any;
      const userId = (request.query as any).userId || 1; // Default user if not provided

      if (!name || !name.trim()) {
        reply.statusCode = 400;
        return { error: 'Category name is required' };
      }

      try {
        const result = await query(
          'INSERT INTO shortcut_categories (user_id, name, order_index) VALUES ($1, $2, (SELECT COALESCE(MAX(order_index) + 1, 0) FROM shortcut_categories WHERE user_id = $1)) RETURNING id, name, order_index, created_at',
          [userId, name.trim()]
        );

        const category = result.rows[0];
        return {
          success: true,
          category
        };
      } catch (error: any) {
        console.error('Error creating shortcut category:', error);
        if (error.code === '23505') {
          reply.statusCode = 409;
          return { error: 'Category already exists for this user' };
        }
        reply.statusCode = 500;
        return { error: 'Database error' };
      }
    });


    // Marques & Modèles (Réception)
    fastify.get('/api/marques', async () => {
      try {
        const result = await query('SELECT id, name FROM marques ORDER BY name');
        return { success: true, items: result.rows };
      } catch (error) {
        console.error('Error fetching marques:', error);
        return { success: false, error: 'Database error' };
      }
    });

    fastify.get('/api/marques/all', async () => {
      try {
        // Retourner toutes les marques avec leurs modèles
        const marquesResult = await query('SELECT id, name FROM marques ORDER BY name');
        const marques = marquesResult.rows;
        
        // Pour chaque marque, charger ses modèles
        const marquesAvecModeles = await Promise.all(marques.map(async (marque: { id: number; name: string }) => {
          const modelesResult = await query(
            'SELECT id, name, marque_id FROM modeles WHERE marque_id = $1 ORDER BY name',
            [marque.id]
          );
          return {
            ...marque,
            modeles: modelesResult.rows
          };
        }));
        
        return { success: true, items: marquesAvecModeles };
      } catch (error) {
        console.error('Error fetching marques/all:', error);
        return { success: false, error: 'Database error' };
      }
    });

    fastify.get('/api/marques/:marqueId/modeles', async (request: FastifyRequest, reply: FastifyReply) => {
      const { marqueId } = request.params as { marqueId: string };
      
      if (!marqueId) {
        reply.statusCode = 400;
        return { error: 'MarqueId is required' };
      }

      try {
        const marqueIdNum = parseInt(marqueId, 10);
        if (isNaN(marqueIdNum)) {
          reply.statusCode = 400;
          return { error: 'Invalid marqueId' };
        }
        
        const result = await query(
          'SELECT id, name, marque_id FROM modeles WHERE marque_id = $1 ORDER BY name',
          [marqueIdNum]
        );
        return {
          success: true,
          marqueId,
          modeles: result.rows
        };
      } catch (error) {
        console.error('Error fetching modeles:', error);
        reply.statusCode = 500;
        return { error: 'Database error' };
      }
    });

    fastify.post('/api/marques', async (request: FastifyRequest, reply: FastifyReply) => {
      const { name } = request.body as any;
      if (!name || !name.trim()) {
        reply.statusCode = 400;
        return { error: 'Name is required' };
      }

      try {
        const result = await query(
          'INSERT INTO marques (name) VALUES ($1) RETURNING id, name',
          [name.trim()]
        );
        
        if (result.rows.length > 0) {
          return { success: true, ...result.rows[0] };
        } else {
          reply.statusCode = 500;
          return { error: 'Failed to create marque' };
        }
      } catch (error: any) {
        console.error('Error creating marque:', error);
        if (error.code === '23505') {
          reply.statusCode = 409;
          return { error: 'Marque already exists' };
        }
        reply.statusCode = 500;
        return { error: 'Database error' };
      }
    });

    fastify.post('/api/marques/:marqueId/modeles', async (request: FastifyRequest, reply: FastifyReply) => {
      const { name } = request.body as any;
      const { marqueId } = request.params as any;

      if (!name || !name.trim() || !marqueId) {
        reply.statusCode = 400;
        return { error: 'Name and marqueId are required' };
      }

      try {
        const marqueIdNum = parseInt(marqueId, 10);
        if (isNaN(marqueIdNum)) {
          reply.statusCode = 400;
          return { error: 'Invalid marqueId' };
        }
        
        const result = await query(
          'INSERT INTO modeles (marque_id, name) VALUES ($1, $2) RETURNING id, name, marque_id',
          [marqueIdNum, name.trim()]
        );
        
        if (result.rows.length > 0) {
          return { success: true, ...result.rows[0] };
        } else {
          reply.statusCode = 500;
          return { error: 'Failed to create modele' };
        }
      } catch (error) {
        console.error('Error creating modele:', error);
        reply.statusCode = 500;
        return { error: 'Database error' };
      }
    });

    // Agenda routes
    fastify.get('/api/agenda/events', async (request: FastifyRequest, reply: FastifyReply) => {
      // Mock: return empty events
      return { success: true, events: [] };
    });

    fastify.post('/api/agenda/events', async (request: FastifyRequest, reply: FastifyReply) => {
      const { title, startTime, endTime, description } = request.body as any;

      if (!title || !startTime || !endTime) {
        reply.statusCode = 400;
        return { error: 'Title, startTime, and endTime are required' };
      }

      const eventId = `event_${Date.now()}`;
      return {
        success: true,
        event: {
          id: eventId,
          title,
          description,
          startTime,
          endTime,
          createdAt: new Date().toISOString()
        }
      };
    });

    fastify.get('/api/agenda/events/:id', async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      return {
        success: true,
        event: { id, title: 'Mock Event' }
      };
    });

    fastify.put('/api/agenda/events/:id', async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      return { success: true, event: { id } };
    });

    fastify.delete('/api/agenda/events/:id', async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      return { success: true, message: 'Event deleted' };
    });

    // Lots routes (Réception)
    fastify.get('/api/lots', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const result = await query(`
          SELECT 
            l.id, l.name, l.status, l.item_count, l.description, 
            l.received_at, l.created_at
          FROM lots l
          ORDER BY l.received_at DESC
        `);
        return {
          success: true,
          lots: result.rows
        };
      } catch (error) {
        console.error('Error fetching lots:', error);
        reply.statusCode = 500;
        return { error: 'Database error' };
      }
    });

    fastify.post('/api/lots', async (request: FastifyRequest, reply: FastifyReply) => {
      const { itemCount, description, items, lotName } = request.body as any;

      // Support both legacy shape (itemCount) and new client shape (items array)
      const computedItemCount = Array.isArray(items) ? items.length : Number(itemCount);

      if (!computedItemCount || Number.isNaN(computedItemCount)) {
        reply.statusCode = 400;
        return { error: 'itemCount or items[] is required' };
      }

      try {
        // Insert lot
        const lotResult = await query(
          'INSERT INTO lots (name, item_count, description, status) VALUES ($1, $2, $3, $4) RETURNING *',
          [lotName || null, computedItemCount, description || null, 'received']
        );

        const lot = lotResult.rows[0];

        // Insert lot items if provided
        if (Array.isArray(items) && items.length > 0) {
          for (const item of items) {
            await query(
              `INSERT INTO lot_items 
               (lot_id, serial_number, type, marque_id, modele_id, entry_type, entry_date, entry_time)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [
                lot.id,
                item.serialNumber || null,
                item.type || null,
                item.marqueId || null,
                item.modeleId || null,
                item.entryType || 'manual',
                item.date || null,
                item.time || null
              ]
            );
          }
        }

        return {
          success: true,
          id: lot.id,
          lot: {
            id: lot.id,
            name: lot.name,
            itemCount: lot.item_count,
            description: lot.description,
            status: lot.status,
            receivedAt: lot.received_at
          }
        };
      } catch (error) {
        console.error('Error creating lot:', error);
        reply.statusCode = 500;
        return { error: 'Database error' };
      }
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
        socket.socket.send(JSON.stringify({
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
              user.socket.socket.send(JSON.stringify({
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
              user.socket.socket.send(JSON.stringify(payload));
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
              socket.socket.send(JSON.stringify({ type: 'auth:ack', ok: true }));
              break;

            case 'message':
            case 'message:send': {
              const text = message.text || message.data?.text;
              if (!text || !text.toString().trim()) {
                socket.socket.send(JSON.stringify({ type: 'error', message: 'Message text is required' }));
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

                socket.socket.send(JSON.stringify({ type: 'success', message: 'Pseudo updated' }));
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
              socket.socket.send(JSON.stringify({ type: 'error', message: 'Invalid message payload' }));
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
              user.socket.socket.send(JSON.stringify({
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

    // Shortcuts routes
    fastify.get('/api/shortcuts', async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = (request.query as any).userId || 1; // Default user if not provided

      try {
        const result = await query(
          `SELECT id, title, description, url, category_id, order_index, created_at
           FROM shortcuts
           WHERE user_id = $1
           ORDER BY category_id ASC NULLS FIRST, order_index ASC`,
          [userId]
        );

        return {
          success: true,
          shortcuts: result.rows
        };
      } catch (error) {
        console.error('Error fetching shortcuts:', error);
        reply.statusCode = 500;
        return { error: 'Database error' };
      }
    });

    fastify.post('/api/shortcuts', async (request: FastifyRequest, reply: FastifyReply) => {
      const { title, description, url, categoryId } = request.body as any;
      const userId = (request.query as any).userId || 1; // Default user if not provided

      if (!title || !title.trim() || !url || !url.trim()) {
        reply.statusCode = 400;
        return { error: 'Title and URL are required' };
      }

      try {
        // Validate category ownership if provided
        if (categoryId) {
          const categoryCheck = await query(
            'SELECT 1 FROM shortcut_categories WHERE id = $1 AND user_id = $2',
            [categoryId, userId]
          );

          if (categoryCheck.rowCount === 0) {
            reply.statusCode = 404;
            return { error: 'Category not found' };
          }
        }

        const result = await query(
          `INSERT INTO shortcuts (user_id, title, description, url, category_id, order_index)
           VALUES ($1, $2, $3, $4, $5, (SELECT COALESCE(MAX(order_index) + 1, 0) FROM shortcuts WHERE user_id = $1 AND (category_id = $5 OR (category_id IS NULL AND $5 IS NULL))))
           RETURNING id, title, description, url, category_id, order_index, created_at`,
          [userId, title.trim(), description || null, url.trim(), categoryId || null]
        );

        const shortcut = result.rows[0];
        return {
          success: true,
          shortcut
        };
      } catch (error: any) {
        console.error('Error creating shortcut:', error);
        reply.statusCode = 500;
        return { error: 'Database error' };
      }
    });
    // Start server
    await fastify.listen({ port: proxmoxConfig.port, host: '0.0.0.0' });

    // Get server IP for banner
    const os = require('os');
    const interfaces = os.networkInterfaces();
    let serverIP = 'localhost';
    for (const name of Object.keys(interfaces)) {
      const ifaceList = interfaces[name];
      if (!ifaceList) continue;

      for (const iface of ifaceList) {
        if (iface.family === 'IPv4' && !iface.internal) {
          serverIP = iface.address;
          break;
        }
      }

      if (serverIP !== 'localhost') break;
    }

    const banner = `
╔════════════════════════════════════════════════════════════════════════════╗
║                                                                            ║
║               🚀 PROXMOX BACKEND API - RUNNING                             ║
║                                                                            ║
╠════════════════════════════════════════════════════════════════════════════╣
║                                                                            ║
║ 📍 SERVER INFORMATION                                                      ║
║   Environment:      ${nodeEnv.padEnd(54)} ║
║   Server IP:        ${serverIP.padEnd(54)} ║
║   Port:             ${proxmoxConfig.port.toString().padEnd(54)} ║
║                                                                            ║
║ 🌐 ENDPOINTS                                                               ║
║   HTTP API:         http://${serverIP}:${proxmoxConfig.port}${' '.repeat(Math.max(0, 42 - serverIP.length - proxmoxConfig.port.toString().length))} ║
║   WebSocket:        ws://${serverIP}:${proxmoxConfig.port}/ws${' '.repeat(Math.max(0, 45 - serverIP.length - proxmoxConfig.port.toString().length))} ║
║   Health Check:     http://${serverIP}:${proxmoxConfig.port}/api/health${' '.repeat(Math.max(0, 29 - serverIP.length - proxmoxConfig.port.toString().length))} ║
║                                                                            ║
║ 📊 AVAILABLE ROUTES                                                        ║
║   GET    /api/health              - Health check                          ║
║   GET    /api/monitoring          - Server monitoring                     ║
║   GET    /api/users               - List users                            ║
║   POST   /api/users/login         - User login                            ║
║   GET    /api/messages            - List messages                         ║
║   WS     /ws                      - WebSocket connection                  ║
║   GET    /api/agenda/events       - List events                           ║
║   POST   /api/agenda/events       - Create event                          ║
║   GET    /api/lots                - List reception lots                   ║
║   POST   /api/lots                - Create lot                            ║
║                                                                            ║
║ 💻 MANAGEMENT COMMANDS (on host)                                          ║
║   proxmox status                  - Show service status                   ║
║   proxmox logs                    - View live logs                        ║
║   proxmox stop                    - Stop backend services                 ║
║   proxmox restart                 - Restart backend                       ║
║   proxmox rebuild                 - Update and rebuild                    ║
║                                                                            ║
║ 🔗 DOCUMENTATION                                                           ║
║   Docs:              See proxmox/docs/ for detailed API docs              ║
║   WebSocket:         See docs/WEBSOCKET.md                                ║
║   Database:          See docs/DATABASE.md                                 ║
║                                                                            ║
╚════════════════════════════════════════════════════════════════════════════╝
    `;
    console.log(banner);
  } catch (error) {
    fastify.log.error(error);
    process.exit(1);
  }
})();

export default fastify;
