import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import websocket from '@fastify/websocket';
import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import nodemailer from 'nodemailer';
import { registerMonitoringRoutes, incrementMessageCount } from './api/monitoring';
import { registerClientErrorsRoutes } from './api/client-errors';
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
fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
  const { method, url, ip } = request as any;
  const statusCode = reply.statusCode;
  const responseTime = (reply as any).getResponseTime ? (reply as any).getResponseTime() : (reply as any).elapsedTime || '-';
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
const activeSessions = new Set<string>(); // usernames with an active session (one poste per compte)
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
    
    // Register client errors monitoring routes
    await registerClientErrorsRoutes(fastify);

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

    // Auth routes (un seul poste par compte : refus si déjà connecté)
    fastify.post('/api/auth/login', async (request: FastifyRequest, reply: FastifyReply) => {
      const { username, password } = request.body as { username: string; password: string };

      if (!username || !password) {
        reply.statusCode = 400;
        return { error: 'Username and password required' };
      }

      const normalizedUsername = String(username).trim().toLowerCase();
      if (activeSessions.has(normalizedUsername)) {
        reply.statusCode = 200;
        return {
          success: false,
          code: 'ALREADY_LOGGED_IN',
          message: 'Compte déjà connecté sur un autre poste.'
        };
      }

      const userId = `user_${Date.now()}`;
      const token = `jwt_${Buffer.from(JSON.stringify({ userId, username: normalizedUsername, iat: Date.now() })).toString('base64')}`;
      activeSessions.add(normalizedUsername);

      return {
        success: true,
        token,
        user: {
          id: userId,
          username: normalizedUsername,
          createdAt: new Date().toISOString()
        }
      };
    });

    fastify.post('/api/auth/logout', async (request: FastifyRequest, reply: FastifyReply) => {
      const token = request.headers.authorization?.replace('Bearer ', '');
      if (token && token.startsWith('jwt_')) {
        try {
          const decoded = JSON.parse(Buffer.from(token.replace('jwt_', ''), 'base64').toString());
          const username = decoded.username && String(decoded.username).trim().toLowerCase();
          if (username) activeSessions.delete(username);
        } catch {
          // ignore invalid token
        }
      }
      const userId = (request as any).userId;
      if (userId) connectedUsers.delete(userId);
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
      // Récupérer l'userId du token ou query
      const userId = (request.query as any).userId || (request as any).userId || null;
      try {
        const result = await query(
          'SELECT id, user_id, username, title, start, "end", description, location, created_at FROM events WHERE user_id = $1 ORDER BY start DESC',
          [userId]
        );
        return { success: true, events: result.rows };
      } catch (error) {
        console.error('Error fetching events:', error);
        reply.statusCode = 500;
        return { error: 'Database error' };
      }
    });

    fastify.post('/api/events', async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = (request as any).userId || null;
      const username = (request as any).username || null;
      const { title, start, end, description, location } = request.body as any;
      if (!title || !start || !end) {
        reply.statusCode = 400;
        return { error: 'Title, start, and end are required' };
      }
      try {
        const result = await query(
          'INSERT INTO events (user_id, username, title, start, "end", description, location, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) RETURNING id, user_id, username, title, start, "end", description, location, created_at',
          [userId, username, title, start, end, description || null, location || null]
        );
        return { success: true, event: result.rows[0] };
      } catch (error) {
        console.error('Error creating event:', error);
        reply.statusCode = 500;
        return { error: 'Database error' };
      }
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

    // Agenda routes (stockage en BDD, même table events que /api/events)
    fastify.get('/api/agenda/events', async (request: FastifyRequest, reply: FastifyReply) => {
      const { start: startParam, end: endParam } = request.query as { start?: string; end?: string };
      try {
        let sql = 'SELECT id, user_id, username, title, start, "end", description, location, color, created_at FROM events WHERE 1=1';
        const params: any[] = [];
        let paramIndex = 1;
        if (startParam) {
          sql += ` AND "end" >= $${paramIndex}`;
          params.push(startParam);
          paramIndex++;
        }
        if (endParam) {
          sql += ` AND start <= $${paramIndex}`;
          params.push(endParam);
          paramIndex++;
        }
        sql += ' ORDER BY start ASC';
        const result = await query(sql, params);
        const events = (result.rows as any[]).map((row: any) => ({
          id: String(row.id),
          title: row.title,
          start: row.start,
          end: row.end,
          description: row.description || '',
          location: row.location || '',
          color: row.color || '',
          created_at: row.created_at
        }));
        return { success: true, data: events };
      } catch (err: any) {
        fastify.log.error({ err }, 'GET /api/agenda/events error');
        reply.statusCode = 500;
        return { success: false, error: 'Database error', message: err?.message };
      }
    });

    fastify.post('/api/agenda/events', async (request: FastifyRequest, reply: FastifyReply) => {
      const body = (request.body as any) || {};
      const title = body.title;
      const start = body.start || body.startTime;
      const end = body.end || body.endTime;
      const description = body.description || null;
      const location = body.location || null;
      const color = body.color || null;
      const userId = (request as any).userId || null;
      const username = (request as any).username || null;

      if (!title || !start || !end) {
        reply.statusCode = 400;
        return { success: false, error: 'Title, start and end are required' };
      }
      try {
        const result = await query(
          'INSERT INTO events (user_id, username, title, start, "end", description, location, color, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW()) RETURNING id, title, start, "end", description, location, color, created_at',
          [userId, username, title, start, end, description, location, color]
        );
        const row = result.rows[0] as any;
        const event = {
          id: String(row.id),
          title: row.title,
          start: row.start,
          end: row.end,
          description: row.description || '',
          location: row.location || '',
          color: row.color || '',
          created_at: row.created_at
        };
        return { success: true, data: event };
      } catch (err: any) {
        fastify.log.error({ err }, 'POST /api/agenda/events error');
        reply.statusCode = 500;
        return { success: false, error: 'Database error', message: err?.message };
      }
    });

    fastify.get('/api/agenda/events/:id', async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      if (!id) {
        reply.statusCode = 400;
        return { success: false, error: 'Invalid event id' };
      }
      try {
        const result = await query(
          'SELECT id, user_id, username, title, start, "end", description, location, color, created_at FROM events WHERE id = $1',
          [id]
        );
        if (result.rowCount === 0) {
          reply.statusCode = 404;
          return { success: false, error: 'Event not found' };
        }
        const row = result.rows[0] as any;
        return {
          success: true,
          data: {
            id: String(row.id),
            title: row.title,
            start: row.start,
            end: row.end,
            description: row.description || '',
            location: row.location || '',
            color: row.color || '',
            created_at: row.created_at
          }
        };
      } catch (err: any) {
        fastify.log.error({ err }, 'GET /api/agenda/events/:id error');
        reply.statusCode = 500;
        return { success: false, error: 'Database error', message: err?.message };
      }
    });

    fastify.put('/api/agenda/events/:id', async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = (request.body as any) || {};
      if (!id) {
        reply.statusCode = 400;
        return { success: false, error: 'Invalid event id' };
      }
      const updates: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;
      if (body.title !== undefined) { updates.push(`title = $${paramIndex++}`); params.push(body.title); }
      if (body.start !== undefined) { updates.push(`start = $${paramIndex++}`); params.push(body.start); }
      if (body.end !== undefined) { updates.push(`"end" = $${paramIndex++}`); params.push(body.end); }
      if (body.description !== undefined) { updates.push(`description = $${paramIndex++}`); params.push(body.description); }
      if (body.location !== undefined) { updates.push(`location = $${paramIndex++}`); params.push(body.location); }
      if (body.color !== undefined) { updates.push(`color = $${paramIndex++}`); params.push(body.color); }
      if (updates.length === 0) {
        reply.statusCode = 400;
        return { success: false, error: 'No fields to update' };
      }
      params.push(id);
      try {
        const result = await query(
          `UPDATE events SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING id, title, start, "end", description, location, color, created_at`,
          params
        );
        if (result.rowCount === 0) {
          reply.statusCode = 404;
          return { success: false, error: 'Event not found' };
        }
        const row = result.rows[0] as any;
        return {
          success: true,
          data: {
            id: String(row.id),
            title: row.title,
            start: row.start,
            end: row.end,
            description: row.description || '',
            location: row.location || '',
            color: row.color || '',
            created_at: row.created_at
          }
        };
      } catch (err: any) {
        fastify.log.error({ err }, 'PUT /api/agenda/events/:id error');
        reply.statusCode = 500;
        return { success: false, error: 'Database error', message: err?.message };
      }
    });

    fastify.delete('/api/agenda/events/:id', async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      if (!id) {
        reply.statusCode = 400;
        return { success: false, error: 'Invalid event id' };
      }
      try {
        const result = await query('DELETE FROM events WHERE id = $1', [id]);
        if (result.rowCount === 0) {
          reply.statusCode = 404;
          return { success: false, error: 'Event not found' };
        }
        return { success: true, message: 'Event deleted' };
      } catch (err: any) {
        fastify.log.error({ err }, 'DELETE /api/agenda/events/:id error');
        reply.statusCode = 500;
        return { success: false, error: 'Database error', message: err?.message };
      }
    });

    // Lots routes (Réception)
    fastify.get('/api/lots', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { status: statusFilter, embed } = request.query as { status?: string; embed?: string };
        const selectSql = `
          SELECT 
            l.id, l.name, l.status, l.item_count, l.description, 
            l.received_at, l.created_at, l.updated_at, l.finished_at, l.recovered_at, l.pdf_path
          FROM lots l
        `;
        let whereClause = '';
        const queryParams: any[] = [];
        if (statusFilter === 'active') {
          whereClause = " WHERE (l.status IS NULL OR l.status != 'finished')";
        } else if (statusFilter === 'finished') {
          whereClause = " WHERE l.status = 'finished'";
        }
        // status=all or no filter: return all lots
        const orderSql = ' ORDER BY l.received_at DESC';
        const result = await query(selectSql + whereClause + orderSql, queryParams);
        const lots = (result.rows as any[]).map((row: any) => ({
          ...row,
          lot_name: row.name ?? null
        }));

        if (embed === 'items' && lots.length > 0) {
          const lotIds = lots.map((l: any) => l.id);
          const placeholders = lotIds.map((_: any, i: number) => `$${i + 1}`).join(',');
          const itemsResult = await query(`
            SELECT 
              li.lot_id, li.id, li.serial_number, li.type, li.entry_type, li.entry_date, li.entry_time,
              li.marque_id, li.modele_id, li.state, li.technician, li.state_changed_at,
              m.name as marque_name,
              mo.name as modele_name
            FROM lot_items li
            LEFT JOIN marques m ON li.marque_id = m.id
            LEFT JOIN modeles mo ON li.modele_id = mo.id
            WHERE li.lot_id IN (${placeholders}) AND (li.deleted_at IS NULL)
            ORDER BY li.lot_id ASC, li.id ASC
          `, lotIds);

          const itemsByLotId: Record<number, any[]> = {};
          for (const row of itemsResult.rows as any[]) {
            const lotId = row.lot_id;
            if (!itemsByLotId[lotId]) itemsByLotId[lotId] = [];
            itemsByLotId[lotId].push({
              id: row.id,
              serial_number: row.serial_number,
              type: row.type,
              marque_name: row.marque_name,
              modele_name: row.modele_name,
              marque_id: row.marque_id,
              modele_id: row.modele_id,
              state: row.state || null,
              technician: row.technician || null,
              state_changed_at: row.state_changed_at || null,
              entry_type: row.entry_type,
              entry_date: row.entry_date,
              entry_time: row.entry_time
            });
          }

          const lotsWithItems = lots.map((lot: any) => ({
            ...lot,
            items: itemsByLotId[lot.id] || []
          }));
          return { success: true, lots: lotsWithItems };
        }

        return {
          success: true,
          lots
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

    // Get a specific lot with its items
    fastify.get('/api/lots/:id', async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      try {
        // Get lot details
        const lotResult = await query(`
          SELECT 
            l.id, l.name, l.status, l.item_count, l.description, 
            l.received_at, l.created_at, l.updated_at, l.finished_at, l.recovered_at, l.pdf_path
          FROM lots l
          WHERE l.id = $1
        `, [id]);

        if (lotResult.rowCount === 0) {
          reply.statusCode = 404;
          return { error: 'Lot not found' };
        }

        const lot = lotResult.rows[0];

        // Get lot items with all columns
        const itemsResult = await query(`
          SELECT 
            li.id, li.serial_number, li.type, li.entry_type, li.entry_date, li.entry_time,
            li.marque_id, li.modele_id, li.state, li.technician, li.state_changed_at,
            m.name as marque_name,
            mo.name as modele_name
          FROM lot_items li
          LEFT JOIN marques m ON li.marque_id = m.id
          LEFT JOIN modeles mo ON li.modele_id = mo.id
          WHERE li.lot_id = $1 AND (li.deleted_at IS NULL)
          ORDER BY li.id ASC
        `, [id]);

        const items = itemsResult.rows.map((item: any) => ({
          id: item.id,
          serial_number: item.serial_number,
          type: item.type,
          marque_name: item.marque_name,
          modele_name: item.modele_name,
          marque_id: item.marque_id,
          modele_id: item.modele_id,
          state: item.state || null,
          technician: item.technician || null,
          state_changed_at: item.state_changed_at || null,
          entry_type: item.entry_type,
          entry_date: item.entry_date,
          entry_time: item.entry_time
        }));

        // Calculate totals based on item states
        const total = items.length || lot.item_count || 0;
        const recond = items.filter((item: any) => item.state === 'Reconditionnés').length;
        const hs = items.filter((item: any) => item.state === 'HS').length;
        const pieces = items.filter((item: any) => item.state === 'Pour pièces').length;
        const pending = items.filter((item: any) =>
          !item.state || String(item.state || '').trim() === '' ||
          !item.technician || String(item.technician || '').trim() === ''
        ).length;

        return {
          success: true,
          item: {
            ...lot,
            lot_name: lot.name ?? null,
            items,
            total,
            recond,
            hs,
            pieces,
            pending
          }
        };
      } catch (error: any) {
        console.error('Error fetching lot:', error);
        reply.statusCode = 500;
        return { 
          error: 'Database error', 
          message: error.message,
          details: error.stack 
        };
      }
    });

    // Update a lot
    fastify.put('/api/lots/:id', async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const { lot_name, recovered_at, status, finished_at } = request.body as any;

      try {
        const updates: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (lot_name !== undefined) {
          updates.push(`name = $${paramIndex++}`);
          values.push(lot_name);
        }

        if (recovered_at !== undefined) {
          updates.push(`recovered_at = $${paramIndex++}`);
          const recoveredDate = recovered_at === true || recovered_at === 'true'
            ? new Date().toISOString()
            : (recovered_at || new Date().toISOString());
          values.push(recoveredDate);
        }

        if (status !== undefined) {
          updates.push(`status = $${paramIndex++}`);
          values.push(status);
        }

        if (finished_at !== undefined) {
          updates.push(`finished_at = $${paramIndex++}`);
          values.push(typeof finished_at === 'string' ? finished_at : new Date().toISOString());
        }

        // Always update updated_at timestamp
        updates.push(`updated_at = NOW()`);

        if (updates.length <= 1) {
          reply.statusCode = 400;
          return { error: 'No fields to update' };
        }

        values.push(id);
        const result = await query(
          `UPDATE lots SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
          values
        );

        if (result.rowCount === 0) {
          reply.statusCode = 404;
          return { error: 'Lot not found' };
        }

        return {
          success: true,
          item: result.rows[0]
        };
      } catch (error: any) {
        console.error('Error updating lot:', error);
        reply.statusCode = 500;
        return { 
          error: 'Database error', 
          message: error.message,
          details: error.stack 
        };
      }
    });

    // Update a lot item
    fastify.put('/api/lots/items/:id', async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const { state, technician, recovered_at } = request.body as any;

      try {
        const updates: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (state !== undefined) {
          if (state === null || (typeof state === 'string' && state.trim() === '')) {
            // Permettre de définir state à null explicitement
            updates.push(`state = NULL`);
            updates.push(`state_changed_at = NOW()`);
          } else {
            // state a une valeur valide
            updates.push(`state = $${paramIndex++}`);
            values.push(typeof state === 'string' ? state.trim() : state);
            updates.push(`state_changed_at = NOW()`);
          }
        }

        if (technician !== undefined) {
          updates.push(`technician = $${paramIndex++}`);
          values.push(technician || null);
        }

        // Always update updated_at
        updates.push(`updated_at = NOW()`);

        // Valider que nous avons des mises à jour
        if (updates.length === 0) {
          reply.statusCode = 400;
          return { error: 'No fields to update' };
        }

        // Construire la requête SQL de manière sécurisée
        const setClause = updates.join(', ');
        // Ajouter l'ID à la fin des valeurs et utiliser le bon index pour la clause WHERE
        values.push(id);
        const whereParamIndex = values.length; // L'index du paramètre WHERE est la longueur du tableau après avoir ajouté id
        const sqlQuery = `UPDATE lot_items SET ${setClause} WHERE id = $${whereParamIndex} RETURNING *`;
        const result = await query(sqlQuery, values);

        if (result.rowCount === 0) {
          reply.statusCode = 404;
          return { error: 'Lot item not found' };
        }

        const updatedItem = result.rows[0];
        const lotId = updatedItem.lot_id;
        let lotFinished = false;

        if (lotId != null && (state !== undefined || technician !== undefined)) {
          const itemsResult = await query(
            `SELECT id, state, technician FROM lot_items WHERE lot_id = $1 AND (deleted_at IS NULL)`,
            [lotId]
          );
          const allComplete = itemsResult.rows.length > 0 && itemsResult.rows.every(
            (row: any) =>
              row.state != null && String(row.state).trim() !== '' &&
              row.technician != null && String(row.technician).trim() !== ''
          );
          if (allComplete) {
            await query(
              `UPDATE lots SET status = 'finished', finished_at = NOW(), updated_at = NOW() WHERE id = $1`,
              [lotId]
            );
            lotFinished = true;
          }
        }

        return {
          success: true,
          item: updatedItem,
          lotFinished
        };
      } catch (error: any) {
        fastify.log.error({ err: error }, 'PUT /api/lots/items/:id error');
        reply.statusCode = 500;
        return { 
          error: 'Database error', 
          message: error.message || 'Unknown error',
          code: error.code,
          detail: error.detail,
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        };
      }
    });

    // Réception du PDF : le client envoie le contenu (base64) pour stockage côté serveur + backup local côté client
    const pdfStorageDir = process.env.PDF_STORAGE_PATH || path.join(process.cwd(), 'data', 'pdfs');
    fastify.post('/api/lots/:id/pdf', async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const body = (request.body as any) || {};
      const pdfBase64 = body.pdf_base64;
      const lotName = (body.lot_name && String(body.lot_name).trim()) || `Lot_${id}`;
      const dateStr = body.date && /^\d{4}-\d{2}-\d{2}$/.test(String(body.date))
        ? String(body.date)
        : new Date().toISOString().slice(0, 10);

      if (!id || id === 'null' || id === 'undefined') {
        reply.statusCode = 400;
        return { error: 'Invalid lot id' };
      }
      if (!pdfBase64 || typeof pdfBase64 !== 'string') {
        reply.statusCode = 400;
        return { error: 'pdf_base64 is required', message: 'Le client doit envoyer le contenu du PDF en base64.' };
      }

      let buffer: Buffer;
      try {
        buffer = Buffer.from(pdfBase64, 'base64');
      } catch (_) {
        reply.statusCode = 400;
        return { error: 'Invalid base64', message: 'Contenu PDF invalide.' };
      }
      if (buffer.length === 0) {
        reply.statusCode = 400;
        return { error: 'Empty PDF', message: 'Le PDF est vide.' };
      }

      try {
        const lotResult = await query('SELECT id FROM lots WHERE id = $1', [id]);
        if (lotResult.rowCount === 0) {
          reply.statusCode = 404;
          return { error: 'Lot not found' };
        }
        const year = dateStr.slice(0, 4);
        const month = dateStr.slice(5, 7);
        const dirPath = path.join(pdfStorageDir, year, month);
        fs.mkdirSync(dirPath, { recursive: true });
        const sanitizedName = lotName.replace(/[\s]+/g, '_').replace(/[\\/:*?"<>|]/g, '').trim() || `Lot_${id}`;
        const fileName = `${sanitizedName}_${dateStr}.pdf`;
        const serverFilePath = path.join(dirPath, fileName);
        fs.writeFileSync(serverFilePath, buffer);
        const resolvedPath = path.resolve(serverFilePath);

        await query(
          'UPDATE lots SET pdf_path = $1, updated_at = NOW() WHERE id = $2',
          [resolvedPath, id]
        );
        reply.statusCode = 200;
        return {
          success: true,
          pdf_path: resolvedPath,
          generatedAt: new Date().toISOString(),
          message: 'PDF enregistré ; « Voir le PDF » affichera cette version.'
        };
      } catch (err: any) {
        fastify.log.error({ err }, 'POST /api/lots/:id/pdf error');
        reply.statusCode = 500;
        return { error: 'Failed to save PDF', message: err?.message || String(err) };
      }
    });

    fastify.get('/api/lots/:id/pdf', async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      if (!id || id === 'null' || id === 'undefined') {
        reply.statusCode = 400;
        return { error: 'Invalid lot id' };
      }
      try {
        const result = await query('SELECT pdf_path FROM lots WHERE id = $1', [id]);
        if (result.rowCount === 0 || !(result.rows[0] as any)?.pdf_path) {
          reply.statusCode = 404;
          return { error: 'PDF not found for this lot' };
        }
        let filePath = (result.rows[0] as any).pdf_path;
        // Ne pas utiliser un chemin API comme chemin disque (sécurité / cohérence)
        if (typeof filePath !== 'string' || filePath.startsWith('/api/') || filePath.startsWith('http')) {
          reply.statusCode = 404;
          return { error: 'PDF path invalid' };
        }
        filePath = path.resolve(filePath);
        if (!fs.existsSync(filePath)) {
          fastify.log.warn({ filePath, lotId: id }, 'GET /api/lots/:id/pdf file not found on disk');
          reply.statusCode = 404;
          return { error: 'PDF file not found' };
        }
        reply.header('Content-Type', 'application/pdf');
        reply.header('Content-Disposition', 'inline; filename="lot-' + id + '.pdf"');
        reply.header('Cache-Control', 'no-store, no-cache, must-revalidate');
        return reply.send(fs.createReadStream(filePath));
      } catch (err: any) {
        fastify.log.error({ err }, 'GET /api/lots/:id/pdf error');
        reply.statusCode = 500;
        return { error: 'Failed to serve PDF' };
      }
    });

    fastify.post('/api/lots/:id/email', async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      if (!id || id === 'null' || id === 'undefined') {
        reply.statusCode = 400;
        return { error: 'Invalid lot id', message: 'Identifiant de lot invalide.' };
      }
      const body = (request.body as any) || {};
      const email = body.email && String(body.email).trim();
      const subject = body.subject || `Lot #${id} - PDF`;
      const message = body.message || '';

      if (!email) {
        reply.statusCode = 400;
        return { error: 'email is required', message: 'Veuillez entrer une adresse email' };
      }

      try {
        const result = await query('SELECT pdf_path FROM lots WHERE id = $1', [id]);
        if (result.rowCount === 0 || !(result.rows[0] as any)?.pdf_path) {
          reply.statusCode = 404;
          return { error: 'PDF not found for this lot', message: 'Générez d\'abord le PDF du lot.' };
        }
        let filePath = (result.rows[0] as any).pdf_path;
        if (typeof filePath !== 'string' || filePath.startsWith('/api/') || filePath.startsWith('http')) {
          reply.statusCode = 404;
          return { error: 'PDF path invalid', message: 'Chemin PDF invalide.' };
        }
        filePath = path.resolve(filePath);
        if (!fs.existsSync(filePath)) {
          fastify.log.warn({ filePath, lotId: id }, 'POST /api/lots/:id/email PDF file not found on disk');
          reply.statusCode = 404;
          return { error: 'PDF file not found', message: 'Fichier PDF introuvable.' };
        }

        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || 'localhost',
          port: parseInt(process.env.SMTP_PORT || '25', 10),
          secure: process.env.SMTP_SECURE === 'true',
          auth: process.env.SMTP_USER ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS || ''
          } : undefined
        });
        const fileName = path.basename(filePath);
        // Lire le fichier en buffer pour éviter problèmes de stream avec nodemailer
        const pdfBuffer = fs.readFileSync(filePath);
        await transporter.sendMail({
          from: process.env.MAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@localhost',
          to: email,
          subject,
          text: message || `PDF du lot #${id} en pièce jointe.`,
          attachments: [{ filename: fileName, content: pdfBuffer }]
        });

        return { success: true, message: 'Email envoyé' };
      } catch (err: any) {
        const msg = err?.message || String(err);
        const isSmtp = /ECONNREFUSED|ETIMEDOUT|EAUTH|ESOCKET|ECONNRESET|Invalid login/i.test(msg);
        fastify.log.error({ err }, 'POST /api/lots/:id/email error');
        reply.statusCode = 500;
        return {
          error: 'Email send failed',
          message: isSmtp ? `Erreur envoi (SMTP): ${msg}` : `Erreur: ${msg}`
        };
      }
    });

    // WebSocket routes (client connects to ws://host:4000/ or ws://host:4000/ws)
    fastify.register(async (fastify: any) => {
      const wsHandler = (socket: any, request: any) => {
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

        const sendUserCount = () => {
          const users = [...new Set(Array.from(connectedUsers.values()).map(u => u.username))];
          const count = users.length;
          const payload = JSON.stringify({ type: 'userCount', count, users });
          for (const user of connectedUsers.values()) {
            try {
              user.socket.socket.send(payload);
            } catch {
              // ignore
            }
          }
        };

        // Send welcome message
        socket.socket.send(JSON.stringify({
          type: 'connected',
          userId,
          username,
          timestamp: new Date().toISOString(),
          connectedUsers: connectedUsers.size
        }));
        sendUserCount();

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

            case 'clearChat':
              broadcast({ type: 'chatCleared' });
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
          const normalizedUsername = String(username).trim().toLowerCase();
          const connectionsForUser = Array.from(connectedUsers.values()).filter(
            (u) => String(u.username).trim().toLowerCase() === normalizedUsername
          );
          const wasOnlyConnectionForUser = connectionsForUser.length === 1;
          connectedUsers.delete(userId);
          if (wasOnlyConnectionForUser) {
            activeSessions.delete(normalizedUsername);
            fastify.log.info(`Session libérée pour ${normalizedUsername} (déconnexion WebSocket)`);
          }
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
          sendUserCount();
        });

        // Handle errors
        socket.on('error', (error: any) => {
          fastify.log.error(`WebSocket error for ${username}: ${error.message}`);
        });

        // Handle pong response
        socket.on('pong', heartbeat);
      };
      fastify.get('/ws', { websocket: true }, wsHandler);
      fastify.get('/', { websocket: true }, wsHandler);
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
      const { title, description, url, category_id, categoryId } = request.body as any;
      const userId = (request.query as any).userId || 1; // Default user if not provided

      // Support both category_id and categoryId for compatibility
      const finalCategoryId = category_id || categoryId;

      if (!title || !title.trim() || !url || !url.trim()) {
        reply.statusCode = 400;
        return { error: 'Title and URL are required' };
      }

      try {
        // Validate category ownership if provided
        if (finalCategoryId) {
          const categoryCheck = await query(
            'SELECT 1 FROM shortcut_categories WHERE id = $1 AND user_id = $2',
            [finalCategoryId, userId]
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
          [userId, title.trim(), description || null, url.trim(), finalCategoryId || null]
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
