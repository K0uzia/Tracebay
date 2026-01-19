/**
 * Rate Limiting Middleware
 * Phase 5: Protect API from abuse and DDoS
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { performanceConfig } from '../config/performance.config';

export async function registerRateLimit(fastify: FastifyInstance) {
  const { rateLimit: rateLimitConfig } = performanceConfig;

  // Exempt health and metrics endpoints from rate limiting
  fastify.register(async (fastify) => {
    await fastify.register(rateLimit, {
      global: true,
      max: rateLimitConfig.global.max,
      timeWindow: rateLimitConfig.global.timeWindow,
      cache: 10000, // Store 10k IPs
      allowList: ['127.0.0.1', '::1'], // Localhost exempted
      redis: undefined, // Can add Redis later for distributed
      nameSpace: 'rate-limit-',
      continueExceeding: false,
      skipOnError: true, // Don't fail if rate limit service fails
      keyGenerator: (request: FastifyRequest) => {
        // Bypass rate limit for health/metrics if from localhost
        if ((request.url === '/api/health' || request.url === '/api/metrics') && 
            (request.ip === '127.0.0.1' || request.ip === '::1')) {
          return 'localhost-exempt';
        }
        // Use IP + User-Agent for better accuracy
        return `${request.ip}-${request.headers['user-agent'] || 'unknown'}`;
      },
      errorResponseBuilder: (request: FastifyRequest, context: any) => {
        return {
          statusCode: 429,
          error: 'Too Many Requests',
          message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
          retryAfter: context.ttl,
        };
      },
      onExceeding: (request: FastifyRequest, key: string) => {
        fastify.log.warn({
          ip: request.ip,
          path: request.url,
        }, `Rate limit exceeded for ${key}`);
      },
    });
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
