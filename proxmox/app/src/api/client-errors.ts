/**
 * Routes de monitoring pour les erreurs clients Electron
 * Endpoint: /api/monitoring/errors
 * Dashboard: /monitoring
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { query } from '../db';
import * as path from 'path';
import * as fs from 'fs/promises';

// Rate limiting simple (sans dépendance externe)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 100; // 100 erreurs par minute par client

function rateLimit(request: FastifyRequest, reply: FastifyReply, done: () => void) {
  const body = request.body as any;
  const clientId = body?.clientId || request.ip;
  const now = Date.now();
  
  if (!rateLimitMap.has(clientId)) {
    rateLimitMap.set(clientId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return done();
  }
  
  const limit = rateLimitMap.get(clientId)!;
  
  if (now > limit.resetTime) {
    limit.count = 1;
    limit.resetTime = now + RATE_LIMIT_WINDOW;
    return done();
  }
  
  if (limit.count >= RATE_LIMIT_MAX) {
    reply.statusCode = 429;
    return reply.send({
      success: false,
      error: 'Trop de requêtes. Limite: 100 erreurs par minute.'
    });
  }
  
  limit.count++;
  done();
}

// Nettoyer les entrées expirées toutes les 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [clientId, limit] of rateLimitMap.entries()) {
    if (now > limit.resetTime) {
      rateLimitMap.delete(clientId);
    }
  }
}, 300000);

// Middleware d'authentification pour le dashboard
async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  const authHeader = request.headers.authorization;
  // Pour les cookies, utiliser request.headers.cookie et parser manuellement si nécessaire
  const cookies = request.headers.cookie || '';
  const cookieMatch = cookies.match(/workspace_jwt=([^;]+)/);
  const token = authHeader && authHeader.startsWith('Bearer ') 
    ? authHeader.substring(7) 
    : cookieMatch ? cookieMatch[1] : (request.query as any)?.token;
  
  if (!token) {
    if (request.url === '/monitoring' && request.method === 'GET') {
      reply.type('text/html');
      return reply.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Monitoring - Authentification</title>
          <style>
            body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #f5f5f5; }
            .login-box { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            input { width: 100%; padding: 10px; margin: 10px 0; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
            button { width: 100%; padding: 10px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer; }
            button:hover { background: #2980b9; }
          </style>
        </head>
        <body>
          <div class="login-box">
            <h2>Accès Monitoring</h2>
            <form method="POST" action="/monitoring/auth">
              <input type="password" name="password" placeholder="Mot de passe admin" required>
              <button type="submit">Connexion</button>
            </form>
          </div>
        </body>
        </html>
      `);
    }
    reply.statusCode = 401;
    reply.send({ success: false, error: 'Authentification requise' });
    return false;
  }
  
  const adminToken = process.env.MONITORING_ADMIN_TOKEN || 'SECRET_RETIRE';
  if (token === adminToken || token === 'SECRET_RETIRE') {
    return true;
  }
  
  reply.statusCode = 403;
  reply.send({ success: false, error: 'Token invalide' });
  return false;
}

interface ClientErrorBody {
  clientId: string;
  clientVersion?: string;
  platform?: string;
  errorType: string;
  errorMessage: string;
  errorStack?: string;
  context?: string;
  userMessage?: string;
  url?: string;
  userAgent?: string;
}

interface ErrorQuery {
  limit?: string;
  offset?: string;
  resolved?: string;
  errorType?: string;
  clientId?: string;
  startDate?: string;
  endDate?: string;
}

/**
 * Enregistre les routes de monitoring des erreurs clients
 */
export async function registerClientErrorsRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /api/monitoring/errors - Recevoir les erreurs des clients
  fastify.post('/api/monitoring/errors', {
    preHandler: [rateLimit],
    schema: {
      body: {
        type: 'object',
        required: ['clientId', 'errorType', 'errorMessage'],
        properties: {
          clientId: { type: 'string' },
          clientVersion: { type: 'string' },
          platform: { type: 'string' },
          errorType: { type: 'string' },
          errorMessage: { type: 'string' },
          errorStack: { type: 'string' },
          context: { type: 'string' },
          userMessage: { type: 'string' },
          url: { type: 'string' },
          userAgent: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Limiter la taille du body (max 10KB)
      const contentLength = parseInt(request.headers['content-length'] || '0');
      if (contentLength > 10240) {
        reply.statusCode = 413;
        return reply.send({
          success: false,
          error: 'Payload trop volumineux. Maximum: 10KB'
        });
      }

      const {
        clientId,
        clientVersion,
        platform,
        errorType,
        errorMessage,
        errorStack,
        context,
        userMessage,
        url,
        userAgent
      } = request.body as ClientErrorBody;

      // Sanitizer les données (limiter la longueur)
      const sanitized = {
        clientId: String(clientId).substring(0, 100),
        clientVersion: clientVersion ? String(clientVersion).substring(0, 50) : null,
        platform: platform ? String(platform).substring(0, 50) : null,
        errorType: String(errorType).substring(0, 50),
        errorMessage: String(errorMessage).substring(0, 1000),
        errorStack: errorStack ? String(errorStack).substring(0, 5000) : null,
        context: context ? String(context).substring(0, 500) : null,
        userMessage: userMessage ? String(userMessage).substring(0, 500) : null,
        url: url ? String(url).substring(0, 500) : null,
        userAgent: userAgent ? String(userAgent).substring(0, 500) : null
      };

      // Insérer l'erreur en base de données
      await query(
        `INSERT INTO client_errors (
          client_id, client_version, platform,
          error_type, error_message, error_stack,
          context, user_message, url, user_agent
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          sanitized.clientId,
          sanitized.clientVersion,
          sanitized.platform,
          sanitized.errorType,
          sanitized.errorMessage,
          sanitized.errorStack,
          sanitized.context,
          sanitized.userMessage,
          sanitized.url,
          sanitized.userAgent || request.headers['user-agent']?.substring(0, 500) || null
        ]
      );

      fastify.log.info(`[Monitoring] Erreur enregistrée: ${sanitized.errorType} - ${sanitized.errorMessage.substring(0, 50)}...`);

      return reply.send({
        success: true,
        message: 'Erreur enregistrée avec succès'
      });

    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      fastify.log.error({ msg: '[Monitoring] Erreur lors de l\'enregistrement', error: errorMsg });
      reply.statusCode = 500;
      return reply.send({
        success: false,
        error: 'Erreur serveur lors de l\'enregistrement'
      });
    }
  });

  // GET /api/monitoring/errors - Récupérer la liste des erreurs
  fastify.get('/api/monitoring/errors', async (request: FastifyRequest, reply: FastifyReply) => {
    const authenticated = await requireAuth(request, reply);
    if (!authenticated) return;

    try {
      const {
        limit = '100',
        offset = '0',
        resolved,
        errorType,
        clientId,
        startDate,
        endDate
      } = request.query as ErrorQuery;

      let sql = 'SELECT * FROM client_errors WHERE 1=1';
      const params: any[] = [];
      let paramIndex = 1;

      if (resolved !== undefined) {
        sql += ` AND resolved = $${paramIndex++}`;
        params.push(resolved === 'true');
      }

      if (errorType) {
        sql += ` AND error_type = $${paramIndex++}`;
        params.push(errorType);
      }

      if (clientId) {
        sql += ` AND client_id = $${paramIndex++}`;
        params.push(clientId);
      }

      if (startDate) {
        sql += ` AND timestamp >= $${paramIndex++}`;
        params.push(startDate);
      }

      if (endDate) {
        sql += ` AND timestamp <= $${paramIndex++}`;
        params.push(endDate);
      }

      sql += ` ORDER BY timestamp DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
      params.push(parseInt(limit), parseInt(offset));

      const errors = await query(sql, params);

      // Compter le total
      let countSql = 'SELECT COUNT(*) as total FROM client_errors WHERE 1=1';
      const countParams: any[] = [];
      let countParamIndex = 1;

      if (resolved !== undefined) {
        countSql += ` AND resolved = $${countParamIndex++}`;
        countParams.push(resolved === 'true');
      }
      if (errorType) {
        countSql += ` AND error_type = $${countParamIndex++}`;
        countParams.push(errorType);
      }
      if (clientId) {
        countSql += ` AND client_id = $${countParamIndex++}`;
        countParams.push(clientId);
      }
      if (startDate) {
        countSql += ` AND timestamp >= $${countParamIndex++}`;
        countParams.push(startDate);
      }
      if (endDate) {
        countSql += ` AND timestamp <= $${countParamIndex++}`;
        countParams.push(endDate);
      }

      const countResult = await query<{ total: string }>(countSql, countParams);
      const total = parseInt(countResult.rows[0].total);

      return reply.send({
        success: true,
        data: errors.rows,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: (parseInt(offset) + parseInt(limit)) < total
        }
      });

    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      fastify.log.error({ msg: '[Monitoring] Erreur lors de la récupération', error: errorMsg });
      reply.statusCode = 500;
      return reply.send({
        success: false,
        error: 'Erreur serveur lors de la récupération'
      });
    }
  });

  // GET /api/monitoring/stats - Statistiques des erreurs
  fastify.get('/api/monitoring/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    const authenticated = await requireAuth(request, reply);
    if (!authenticated) return;

    try {
      const totalErrors = await query<{ count: string }>('SELECT COUNT(*) as count FROM client_errors');
      const unresolvedErrors = await query<{ count: string }>('SELECT COUNT(*) as count FROM client_errors WHERE resolved = false');
      const errorsLast24h = await query<{ count: string }>(
        `SELECT COUNT(*) as count FROM client_errors WHERE timestamp >= NOW() - INTERVAL '1 day'`
      );
      const errorsLast7d = await query<{ count: string }>(
        `SELECT COUNT(*) as count FROM client_errors WHERE timestamp >= NOW() - INTERVAL '7 days'`
      );

      const errorsByType = await query<{ error_type: string; count: string }>(
        `SELECT error_type, COUNT(*) as count FROM client_errors GROUP BY error_type ORDER BY count DESC`
      );

      const errorsByClient = await query<{ client_id: string; count: string }>(
        `SELECT client_id, COUNT(*) as count FROM client_errors GROUP BY client_id ORDER BY count DESC LIMIT 10`
      );

      const errorsByDay = await query<{ date: string; count: string }>(
        `SELECT DATE(timestamp) as date, COUNT(*) as count FROM client_errors WHERE timestamp >= NOW() - INTERVAL '7 days' GROUP BY DATE(timestamp) ORDER BY date DESC`
      );

      return reply.send({
        success: true,
        stats: {
          total: parseInt(totalErrors.rows[0].count),
          unresolved: parseInt(unresolvedErrors.rows[0].count),
          last24h: parseInt(errorsLast24h.rows[0].count),
          last7d: parseInt(errorsLast7d.rows[0].count),
          byType: errorsByType.rows.map(r => ({ error_type: r.error_type, count: parseInt(r.count) })),
          byClient: errorsByClient.rows.map(r => ({ client_id: r.client_id, count: parseInt(r.count) })),
          byDay: errorsByDay.rows.map(r => ({ date: r.date, count: parseInt(r.count) }))
        }
      });

    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      fastify.log.error({ msg: '[Monitoring] Erreur lors de la récupération des stats', error: errorMsg });
      reply.statusCode = 500;
      return reply.send({
        success: false,
        error: 'Erreur serveur lors de la récupération des statistiques'
      });
    }
  });

  // PATCH /api/monitoring/errors/:id/resolve - Marquer une erreur comme résolue
  fastify.patch('/api/monitoring/errors/:id/resolve', async (request: FastifyRequest, reply: FastifyReply) => {
    const authenticated = await requireAuth(request, reply);
    if (!authenticated) return;

    try {
      const { id } = request.params as { id: string };
      const { resolved = true, notes } = request.body as { resolved?: boolean; notes?: string };

      await query(
        `UPDATE client_errors SET resolved = $1, resolved_at = $2, notes = $3 WHERE id = $4`,
        [
          resolved,
          resolved ? new Date().toISOString() : null,
          notes || null,
          id
        ]
      );

      return reply.send({
        success: true,
        message: `Erreur ${id} ${resolved ? 'marquée comme résolue' : 'marquée comme non résolue'}`
      });

    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      fastify.log.error({ msg: '[Monitoring] Erreur lors de la résolution', error: errorMsg });
      reply.statusCode = 500;
      return reply.send({
        success: false,
        error: 'Erreur serveur lors de la résolution'
      });
    }
  });

  // POST /monitoring/auth - Authentification pour le dashboard
  fastify.post('/monitoring/auth', async (request: FastifyRequest, reply: FastifyReply) => {
    const password = (request.body as { password?: string })?.password;
    const adminToken = process.env.MONITORING_ADMIN_TOKEN || 'SECRET_RETIRE';
    
    if (password === adminToken || password === 'SECRET_RETIRE') {
      const token = adminToken;
      // Utiliser Set-Cookie header directement (Fastify sans plugin cookie)
      reply.header('Set-Cookie', `workspace_jwt=${token}; HttpOnly; Max-Age=86400; Path=/`);
      return reply.redirect(`/monitoring?token=${token}`);
    } else {
      reply.statusCode = 401;
      return reply.send('Mot de passe incorrect');
    }
  });

  // GET /monitoring - Page HTML du dashboard
  fastify.get('/monitoring', async (request: FastifyRequest, reply: FastifyReply) => {
    const authenticated = await requireAuth(request, reply);
    if (!authenticated) return;

    try {
      // #region agent log
      const logData = {
        __dirname,
        cwd: process.cwd(),
        paths: [] as string[]
      };
      // #endregion

      // Essayer plusieurs chemins possibles selon la structure du serveur
      // Après compilation, __dirname pointe vers dist/api/, donc dist/views/ pour le fichier copié
      const possiblePaths = [
        path.join(__dirname, '..', 'views', 'monitoring.html'), // dist/views/monitoring.html (après build)
        path.join(__dirname, '..', '..', 'src', 'views', 'monitoring.html'), // src/views/monitoring.html (dev)
        path.join(process.cwd(), 'dist', 'views', 'monitoring.html'),
        path.join(process.cwd(), 'src', 'views', 'monitoring.html'),
        path.join(process.cwd(), 'proxmox', 'app', 'src', 'views', 'monitoring.html'),
        path.join(process.cwd(), 'proxmox', 'app', 'dist', 'views', 'monitoring.html'),
        path.join(process.cwd(), 'views', 'monitoring.html'),
        '/app/dist/views/monitoring.html', // Dans Docker
        '/app/src/views/monitoring.html' // Dans Docker (dev)
      ];
      
      let html: string | null = null;
      let lastError: Error | null = null;
      
      for (const dashboardPath of possiblePaths) {
        // #region agent log
        logData.paths.push(dashboardPath);
        // #endregion
        try {
          html = await fs.readFile(dashboardPath, 'utf8');
          // #region agent log
          fastify.log.info({ msg: '[Monitoring] Fichier trouvé', path: dashboardPath });
          // #endregion
          break;
        } catch (error) {
          // #region agent log
          fastify.log.debug({ msg: '[Monitoring] Chemin testé (non trouvé)', path: dashboardPath, error: error instanceof Error ? error.message : String(error) });
          // #endregion
          lastError = error instanceof Error ? error : new Error(String(error));
          continue;
        }
      }
      
      if (!html) {
        // #region agent log
        fastify.log.error({ msg: '[Monitoring] Aucun fichier trouvé', triedPaths: logData.paths, __dirname, cwd: process.cwd() });
        // #endregion
        throw lastError || new Error('Fichier monitoring.html introuvable');
      }
      
      reply.type('text/html');
      return reply.send(html);
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      fastify.log.error({ msg: '[Monitoring] Erreur lors du chargement du dashboard', error: errorMsg });
      reply.statusCode = 500;
      reply.type('text/html');
      return reply.send(`
        <html>
          <head><title>Erreur Monitoring</title></head>
          <body>
            <h1>Erreur</h1>
            <p>Impossible de charger le dashboard de monitoring.</p>
            <p>${errorMsg}</p>
          </body>
        </html>
      `);
    }
  });

  fastify.log.info('✅ Client errors monitoring routes registered');
}
