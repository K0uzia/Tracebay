import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken } from '../lib/jwt.js';
import { AuthenticationError } from '../lib/errors.js';

/**
 * Authentication middleware
 */
export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('No token provided');
    }

    const token = authHeader.substring(7);
    const payload = verifyToken(token);

    // Attach user info to request
    (request as any).user = payload;
  } catch (error) {
    throw new AuthenticationError('Invalid token');
  }
}
