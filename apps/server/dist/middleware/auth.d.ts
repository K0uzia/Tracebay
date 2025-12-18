import { FastifyRequest, FastifyReply } from 'fastify';
/**
 * Authentication middleware
 */
export declare function authMiddleware(request: FastifyRequest, reply: FastifyReply): Promise<void>;
