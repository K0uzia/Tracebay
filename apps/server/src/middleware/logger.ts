import { FastifyRequest, FastifyReply } from 'fastify';
import logger from '../config/logger.js';

/**
 * HTTP request logging middleware
 */
export async function loggerMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const start = Date.now();

  reply.raw.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(`${request.method} ${request.url} - ${reply.statusCode} - ${duration}ms`);
  });
}
