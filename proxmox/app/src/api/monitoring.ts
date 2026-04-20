import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ActivityLog } from '../models/ActivityLog';
import { Message } from '../models/Message';
import { Event } from '../models/Event';
import { User } from '../models/User';
import { getServerLogs } from '../utils/server-log-buffer';
import { query } from '../db';
import { checkAdminAuth } from './admin';

/**
 * Monitoring statistics interface
 */
export interface MonitoringStats {
  connectedUsers: number;
  totalUsers: number;
  messagesPerMinute: number;
  totalMessages: number;
  totalEvents: number;
  systemHealth: {
    status: 'healthy' | 'degraded' | 'down';
    uptime: number;
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
    cpu: {
      usage: number;
    };
  };
  timestamp: string;
}

/**
 * Activity log entry interface
 */
export interface ActivityLogEntry {
  id: number;
  userId: number;
  action: string;
  details: string;
  ipAddress: string;
  userAgent: string;
  timestamp: Date;
}

/**
 * Message rate tracking
 */
let messageCount = 0;
const messageStartTime = Date.now();

/**
 * Increment message count (call this when a message is sent)
 */
export function incrementMessageCount(): void {
  messageCount++;
}

/**
 * Get messages per minute rate
 */
export function getMessageRate(): number {
  const elapsedMinutes = (Date.now() - messageStartTime) / 60000;
  return elapsedMinutes > 0 ? Math.round(messageCount / elapsedMinutes) : 0;
}

/**
 * Get current connected user count (authenticated only, excludes anonymous WS connections)
 */
export function getConnectedUserCount(connectedUsers: Map<string, any>): number {
  return Array.from(connectedUsers.values()).filter(u => !String(u.username).startsWith('anon_')).length;
}

/**
 * Get system health metrics
 */
export function getSystemHealth(): MonitoringStats['systemHealth'] {
  const memoryUsage = process.memoryUsage();
  const totalMemory = memoryUsage.heapTotal;
  const usedMemory = memoryUsage.heapUsed;
  const uptime = process.uptime();

  return {
    status: 'healthy',
    uptime,
    memory: {
      used: usedMemory,
      total: totalMemory,
      percentage: Math.round((usedMemory / totalMemory) * 100)
    },
    cpu: {
      usage: 0 // Would need additional library for real CPU usage
    }
  };
}

/**
 * Get total user count (mock for now - will use database)
 */
export async function getTotalUserCount(): Promise<number> {
  try {
    const users = await (User as any).getAll();
    return Array.isArray(users) ? users.length : 0;
  } catch {
    return 0;
  }
}

/**
 * Get total message count (mock for now - will use database)
 */
export async function getTotalMessageCount(): Promise<number> {
  try {
    const messages = await (Message as any).getRecent(1000);
    return Array.isArray(messages) ? messages.length : 0;
  } catch {
    return 0;
  }
}

/**
 * Get total event count (mock for now - will use database)
 */
export async function getTotalEventCount(): Promise<number> {
  try {
    const events = await (Event as any).getAll();
    return Array.isArray(events) ? events.length : 0;
  } catch {
    return 0;
  }
}

/**
 * Get recent activity logs (mock for now - will use database)
 */
export async function getRecentActivityLogs(limit: number = 50, offset: number = 0): Promise<ActivityLogEntry[]> {
  try {
    const logs = await (ActivityLog as any).getAll();
    return Array.isArray(logs) ? logs.slice(offset, offset + limit) : [];
  } catch {
    return [];
  }
}

/**
 * Register monitoring routes
 */
export async function registerMonitoringRoutes(
  fastify: FastifyInstance,
  connectedUsers: Map<string, any>
): Promise<void> {

  /**
   * GET /api/monitoring/stats
   * Returns real-time system statistics
   */
  fastify.get('/api/monitoring/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const [totalUsers, totalMessages, totalEvents] = await Promise.all([
        getTotalUserCount(),
        getTotalMessageCount(),
        getTotalEventCount()
      ]);

      const stats: MonitoringStats = {
        connectedUsers: getConnectedUserCount(connectedUsers),
        totalUsers,
        messagesPerMinute: getMessageRate(),
        totalMessages,
        totalEvents,
        systemHealth: getSystemHealth(),
        timestamp: new Date().toISOString()
      };

      return stats;
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      fastify.log.error({ msg: 'Error fetching monitoring stats', error: errorMsg });
      reply.statusCode = 500;
      return { error: 'Failed to fetch monitoring stats' };
    }
  });

  /**
   * GET /api/monitoring/server-logs
   * Returns last 250 lines of server stdout/stderr for the monitoring page
   */
  fastify.get('/api/monitoring/server-logs', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const lines = getServerLogs();
      return { lines, total: lines.length };
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      fastify.log.error({ msg: 'Error fetching server logs', error: errorMsg });
      reply.statusCode = 500;
      return { error: 'Failed to fetch server logs' };
    }
  });

  /**
   * GET /api/monitoring/logs
   * Returns recent activity logs
   */
  fastify.get('/api/monitoring/logs', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { limit = 50, offset = 0 } = request.query as { limit?: number; offset?: number };

      const logs = await getRecentActivityLogs(Number(limit), Number(offset));
      const allLogs = await (ActivityLog as any).getAll();

      return {
        logs,
        total: Array.isArray(allLogs) ? allLogs.length : 0,
        limit: Number(limit),
        offset: Number(offset)
      };
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      fastify.log.error({ msg: 'Error fetching activity logs', error: errorMsg });
      reply.statusCode = 500;
      return { error: 'Failed to fetch activity logs' };
    }
  });

  /**
   * GET /api/monitoring/users
   * Returns list of connected users
   */
  fastify.get('/api/monitoring/users', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const now = Date.now();
      const authenticated = Array.from(connectedUsers.values())
        .filter(user => !String(user.username).startsWith('anon_'))
        .map(user => ({
          id: user.id,
          username: user.username,
          ip: user.ip || null,
          connectedAt: user.connectedAt,
          connectedDuration: now - user.connectedAt.getTime()
        }));

      const anonymous = Array.from(connectedUsers.values())
        .filter(user => String(user.username).startsWith('anon_'))
        .map(user => ({
          id: user.id,
          ip: user.ip || null,
          connectedAt: user.connectedAt,
          connectedDuration: now - user.connectedAt.getTime()
        }));

      return {
        connectedUsers: authenticated,
        anonymousConnections: anonymous,
        count: authenticated.length,
        anonymousCount: anonymous.length
      };
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      fastify.log.error({ msg: 'Error fetching connected users', error: errorMsg });
      reply.statusCode = 500;
      return { error: 'Failed to fetch connected users' };
    }
  });

  /**
   * GET /api/monitoring/messages/recent
   * Returns recent messages
   */
  fastify.get('/api/monitoring/messages/recent', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { limit = 20 } = request.query as { limit?: number };

      const messages = await (Message as any).getRecent(Number(limit));
      const recentMessages = Array.isArray(messages) ? messages : [];

      return {
        messages: recentMessages,
        count: recentMessages.length
      };
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      fastify.log.error({ msg: 'Error fetching recent messages', error: errorMsg });
      reply.statusCode = 500;
      return { error: 'Failed to fetch recent messages' };
    }
  });

  /**
   * GET /api/monitoring/events/upcoming
   * Returns upcoming events
   */
  fastify.get('/api/monitoring/events/upcoming', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { limit = 10 } = request.query as { limit?: number };

      const events = await (Event as any).getAll();
      const now = new Date();
      const upcomingEvents = Array.isArray(events)
        ? events
          .filter((event: any) => new Date(event.startTime) >= now)
          .slice(0, Number(limit))
        : [];

      return {
        events: upcomingEvents,
        count: upcomingEvents.length
      };
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      fastify.log.error({ msg: 'Error fetching upcoming events', error: errorMsg });
      reply.statusCode = 500;
      return { error: 'Failed to fetch upcoming events' };
    }
  });

  // ─────────────────────────────────────────────
  // Issues (client_errors) — admin only
  // ─────────────────────────────────────────────

  fastify.get<{ Querystring: { limit?: string; offset?: string; status?: string; errorType?: string } }>(
    '/api/monitoring/issues',
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!checkAdminAuth(request, reply)) return;
      try {
        const q = request.query as { limit?: string; offset?: string; status?: string; errorType?: string };
        const { limit = '100', offset = '0', status, errorType } = q;
        let sql = 'SELECT id, client_id, client_version, platform, error_type, error_message, context, user_message, url, user_agent, timestamp, resolved, resolved_at, notes FROM client_errors WHERE 1=1';
        const params: any[] = [];
        let i = 1;
        if (status === 'resolved') { sql += ` AND resolved = true`; }
        else if (status === 'unresolved') { sql += ` AND resolved = false`; }
        if (errorType) { sql += ` AND error_type = $${i++}`; params.push(errorType); }
        sql += ` ORDER BY timestamp DESC LIMIT $${i++} OFFSET $${i++}`;
        params.push(Math.min(parseInt(limit, 10) || 100, 500), Math.max(0, parseInt(offset, 10) || 0));
        const result = await query(sql, params);
        let countSql = 'SELECT COUNT(*) AS total FROM client_errors WHERE 1=1';
        const countParams: any[] = [];
        let ci = 1;
        if (status === 'resolved') { countSql += ` AND resolved = true`; }
        else if (status === 'unresolved') { countSql += ` AND resolved = false`; }
        if (errorType) { countSql += ` AND error_type = $${ci++}`; countParams.push(errorType); }
        const countResult = await query<{ total: string }>(countSql, countParams);
        const total = parseInt(countResult.rows[0]?.total || '0', 10);
        return { success: true, data: result.rows, pagination: { total, limit: parseInt(limit, 10), offset: parseInt(offset, 10), hasMore: result.rows.length + (parseInt(offset, 10) || 0) < total } };
      } catch (err: any) {
        fastify.log.error({ err }, 'GET /api/monitoring/issues');
        reply.statusCode = 500;
        return { error: 'Database error' };
      }
    }
  );

  fastify.get<{ Params: { id: string } }>('/api/monitoring/issues/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkAdminAuth(request, reply)) return;
    const { id } = request.params as { id: string };
    try {
      const result = await query(
        'SELECT * FROM client_errors WHERE id = $1',
        [id]
      );
      if (result.rowCount === 0) {
        reply.statusCode = 404;
        return { error: 'Issue introuvable' };
      }
      return { success: true, issue: result.rows[0] };
    } catch (err: any) {
      fastify.log.error({ err }, 'GET /api/monitoring/issues/:id');
      reply.statusCode = 500;
      return { error: 'Database error' };
    }
  });

  fastify.delete<{ Params: { id: string } }>('/api/monitoring/issues/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkAdminAuth(request, reply)) return;
    const { id } = request.params as { id: string };
    try {
      const result = await query('DELETE FROM client_errors WHERE id = $1', [id]);
      if (result.rowCount === 0) {
        reply.statusCode = 404;
        return { error: 'Issue introuvable' };
      }
      return { success: true };
    } catch (err: any) {
      fastify.log.error({ err }, 'DELETE /api/monitoring/issues/:id');
      reply.statusCode = 500;
      return { error: 'Database error' };
    }
  });

  type IssuePatchBody = { status?: string; resolved?: boolean; notes?: string };
  fastify.patch<{ Params: { id: string }; Body: IssuePatchBody }>(
    '/api/monitoring/issues/:id',
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!checkAdminAuth(request, reply)) return;
      const { id } = request.params as { id: string };
      const body = (request.body || {}) as IssuePatchBody;
      const resolved = body.resolved ?? (body.status === 'resolved');
      const notes = body.notes;
      const updates: string[] = [];
      const values: any[] = [];
      let i = 1;
      if (typeof resolved === 'boolean') {
        updates.push(`resolved = $${i++}`, `resolved_at = $${i++}`);
        values.push(resolved, resolved ? new Date().toISOString() : null);
      }
      if (notes !== undefined) {
        updates.push(`notes = $${i++}`);
        values.push(notes || null);
      }
      if (updates.length === 0) {
        reply.statusCode = 400;
        return { error: 'Aucun champ à mettre à jour (resolved ou notes)' };
      }
      values.push(id);
      try {
        await query(`UPDATE client_errors SET ${updates.join(', ')} WHERE id = $${i}`, values);
        const row = await query('SELECT * FROM client_errors WHERE id = $1', [id]);
        if (row.rowCount === 0) {
          reply.statusCode = 404;
          return { error: 'Issue introuvable' };
        }
        return { success: true, issue: row.rows[0] };
      } catch (err: any) {
        fastify.log.error({ err }, 'PATCH /api/monitoring/issues/:id');
        reply.statusCode = 500;
        return { error: 'Database error' };
      }
    }
  );

  fastify.log.info('✅ Monitoring routes registered');
}
