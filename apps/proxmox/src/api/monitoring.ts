import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ActivityLog } from '../models/ActivityLog';
import { Message } from '../models/Message';
import { Event } from '../models/Event';
import { User } from '../models/User';

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
 * Get current connected user count
 */
export function getConnectedUserCount(connectedUsers: Map<string, any>): number {
  return connectedUsers.size;
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
      const connectedUsersList = Array.from(connectedUsers.values()).map(user => ({
        id: user.id,
        username: user.username,
        connectedAt: user.connectedAt,
        connectedDuration: Date.now() - user.connectedAt.getTime()
      }));

      return {
        connectedUsers: connectedUsersList,
        count: connectedUsersList.length
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

  fastify.log.info('✅ Monitoring routes registered');
}
