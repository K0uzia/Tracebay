import { FastifyRequest, FastifyReply } from 'fastify';
/**
 * HTTP request logging middleware
 */
export declare function loggerMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void>;
