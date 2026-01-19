/**
 * Monitoring Middleware
 * Phase 5: Request/Response monitoring and logging
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { globalMetrics } from '../utils/metrics';

export async function registerMonitoring(fastify: FastifyInstance) {
  // Request timing and metrics
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    request.startTime = Date.now();
  });

  fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const responseTime = Date.now() - (request.startTime || Date.now());
    
    // Record metrics
    globalMetrics.recordRequest(
      request.url,
      reply.statusCode,
      responseTime
    );

    // Log slow requests (>1s)
    if (responseTime > 1000) {
      fastify.log.warn({
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        responseTime: `${responseTime}ms`,
      }, 'Slow request detected');
    }
  });

  // Periodic cache cleanup (every 5 minutes)
  setInterval(() => {
    const { globalCache } = require('../utils/cache');
    const cleaned = globalCache.cleanup();
    if (cleaned > 0) {
      fastify.log.info(`Cache cleanup: removed ${cleaned} expired entries`);
    }
  }, 5 * 60 * 1000);

  fastify.log.info('Monitoring middleware registered');
}

// Extend FastifyRequest type
declare module 'fastify' {
  interface FastifyRequest {
    startTime?: number;
  }
}
