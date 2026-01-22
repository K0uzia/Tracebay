/**
 * Rate Limiting Middleware
 * Phase 5: Protect API from abuse and DDoS
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { performanceConfig } from '../config/performance.config';

export async function registerRateLimit(fastify: FastifyInstance) {
  const { rateLimit: rateLimitConfig } = performanceConfig;

  // Simple rate limit with localhost exemption
  await fastify.register(rateLimit, {
    global: true,
    max: rateLimitConfig.global.max,
    timeWindow: rateLimitConfig.global.timeWindow,
    cache: 10000,
    allowList: ['127.0.0.1', '::1'],
    skipOnError: true,
  });

  fastify.log.info({
    max: rateLimitConfig.global.max,
    timeWindow: rateLimitConfig.global.timeWindow,
  }, 'Rate limiting middleware registered');
}

/**
 * Stricter rate limit for authentication endpoints
 */
export async function registerAuthRateLimit(fastify: FastifyInstance) {
  const { rateLimit: rateLimitConfig } = performanceConfig;

  await fastify.register(rateLimit, {
    max: rateLimitConfig.auth.max,
    timeWindow: rateLimitConfig.auth.timeWindow,
    cache: 5000,
    nameSpace: 'auth-rate-limit-',
    keyGenerator: (request: FastifyRequest) => {
      return `auth-${request.ip}`;
    },
    errorResponseBuilder: (request: FastifyRequest, context: any) => {
      return {
        statusCode: 429,
        error: 'Too Many Authentication Attempts',
        message: `Too many login attempts. Try again in ${Math.ceil(context.ttl / 1000 / 60)} minutes.`,
        retryAfter: context.ttl,
      };
    },
  });

  fastify.log.info({
    max: rateLimitConfig.auth.max,
    timeWindow: rateLimitConfig.auth.timeWindow,
  }, 'Auth rate limiting registered');
}
