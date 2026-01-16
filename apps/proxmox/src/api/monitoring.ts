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
let messageStartTime = Date.now();

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
        User.count(),
        Message.count(),
        Event.count()
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
    } catch (error) {
      fastify.log.error('Error fetching monitoring stats:', error);
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

      const logs = await ActivityLog.findAll({
        limit: Number(limit),
        offset: Number(offset),
        order: [['createdAt', 'DESC']]
      });

      return {
        logs,
        total: await ActivityLog.count(),
        limit: Number(limit),
        offset: Number(offset)
      };
    } catch (error) {
      fastify.log.error('Error fetching activity logs:', error);
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
    } catch (error) {
      fastify.log.error('Error fetching connected users:', error);
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

      const messages = await Message.findAll({
        limit: Number(limit),
        order: [['createdAt', 'DESC']]
      });

      return {
        messages,
        count: messages.length
      };
    } catch (error) {
      fastify.log.error('Error fetching recent messages:', error);
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

      const events = await Event.findAll({
        where: {
          startTime: {
            // @ts-ignore - Sequelize operator
            [require('sequelize').Op.gte]: new Date()
          }
        },
        limit: Number(limit),
        order: [['startTime', 'ASC']]
      });

      return {
        events,
        count: events.length
      };
    } catch (error) {
      fastify.log.error('Error fetching upcoming events:', error);
      reply.statusCode = 500;
      return { error: 'Failed to fetch upcoming events' };
    }
  });

  fastify.log.info('✅ Monitoring routes registered');
}
