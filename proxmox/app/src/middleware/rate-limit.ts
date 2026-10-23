/**
 * Rate Limiting Middleware
 * Phase 5: Protect API from abuse and DDoS
 */

import { FastifyInstance, FastifyRequest } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { performanceConfig } from '../config/performance.config';

export const AUTH_ROUTES = ['/api/auth/login', '/api/auth/register', '/api/admin/auth/login'];

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
 * Limite stricte sur les routes de connexion et d'inscription, par adresse IP.
 * À appeler AVANT registerRateLimit : le plugin lit config.rateLimit dans son propre onRoute,
 * qui doit passer après celui-ci.
 */
export function registerAuthRateLimit(fastify: FastifyInstance) {
  const { rateLimit: rateLimitConfig } = performanceConfig;

  fastify.addHook('onRoute', (routeOptions) => {
    const methods = Array.isArray(routeOptions.method) ? routeOptions.method : [routeOptions.method];
    if (!methods.includes('POST') || !AUTH_ROUTES.includes(routeOptions.url)) return;
    routeOptions.config = {
      ...(routeOptions.config as object),
      rateLimit: {
        max: rateLimitConfig.auth.max,
        timeWindow: rateLimitConfig.auth.timeWindow,
        keyGenerator: (request: FastifyRequest) => `auth-${request.ip}`,
        errorResponseBuilder: (_request: FastifyRequest, context: any) => ({
          statusCode: 429,
          error: 'Trop de tentatives',
          message: `Trop de tentatives de connexion. Réessayez dans ${Math.ceil(context.ttl / 1000 / 60)} minute(s).`,
        }),
      },
    } as any;
  });

  fastify.log.info({
    max: rateLimitConfig.auth.max,
    timeWindow: rateLimitConfig.auth.timeWindow,
  }, 'Auth rate limiting registered');
}
