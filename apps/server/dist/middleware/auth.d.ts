import { FastifyRequest, FastifyReply } from 'fastify';
/**
 * Authentication middleware
 */
export declare function authMiddleware(request: FastifyRequest, _reply: FastifyReply): Promise<void>;
