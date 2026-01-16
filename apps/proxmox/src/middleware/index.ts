import { FastifyRequest, FastifyReply } from 'fastify';

/**
 * JWT Middleware - Verify token validity
 */
export const verifyToken = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const token = request.headers.authorization?.split(' ')[1];

    if (!token) {
      return reply.status(401).send({
        error: 'Missing authorization token',
        statusCode: 401
      });
    }

    // TODO: Implement actual JWT verification
    // For now, mock verification
    const parts = token.split('.');
    if (parts.length !== 3) {
      return reply.status(401).send({
        error: 'Invalid token format',
        statusCode: 401
      });
    }

    // Extract user ID from token (mock)
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    (request as any).userId = payload.userId || 'mock_user';
    (request as any).user = {
      id: payload.userId || 'mock_user',
      username: payload.username || 'anonymous'
    };

  } catch (error) {
    return reply.status(401).send({
      error: 'Invalid token',
      statusCode: 401
    });
  }
};

/**
 * Request Logger Middleware
 */
export const logRequest = async (request: FastifyRequest, reply: FastifyReply) => {
  const startTime = Date.now();

  request.server.addHook('onSend', async (req: any, res: any, payload: any) => {
    const duration = Date.now() - startTime;
    const log = {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userId: (req as any).userId || 'anonymous'
    };

    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[${log.statusCode}] ${log.method} ${log.url} - ${log.duration} (${log.userId})`);
    }

    return payload;
  });
};

/**
 * Error Handler Middleware
 */
export const errorHandler = async (error: any, request: FastifyRequest, reply: FastifyReply) => {
  const timestamp = new Date().toISOString();
  const statusCode = error.statusCode || 500;
  const method = request.method;
  const url = request.url;

  const errorResponse = {
    error: error.message || 'Internal Server Error',
    statusCode,
    timestamp,
    path: url,
    method
  };

  // Log error
  if (statusCode >= 500) {
    console.error(`[ERROR] ${statusCode} ${method} ${url}`, {
      error: error.message,
      stack: error.stack,
      userId: (request as any).userId || 'anonymous'
    });
  } else {
    console.warn(`[WARN] ${statusCode} ${method} ${url} - ${error.message}`);
  }

  reply.status(statusCode).send(errorResponse);
};

/**
 * Request Validation Middleware
 */
export const validateRequest = (schema: any) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // TODO: Implement actual schema validation
      // For now, just validate JSON for POST requests
      if (request.method === 'POST' || request.method === 'PUT') {
        if (!request.body) {
          return reply.status(400).send({
            error: 'Request body required',
            statusCode: 400
          });
        }
      }
    } catch (error: any) {
      return reply.status(400).send({
        error: 'Invalid request data',
        statusCode: 400,
        details: error.message
      });
    }
  };
};

/**
 * Rate Limiter Middleware
 */
export const rateLimiter = (maxRequests: number = 100, windowMs: number = 15 * 60 * 1000) => {
  const requests: Map<string, number[]> = new Map();

  return async (request: FastifyRequest, reply: FastifyReply) => {
    const identifier = (request as any).userId || request.ip;
    const now = Date.now();
    const userRequests = requests.get(identifier) || [];

    // Remove old requests outside the window
    const recentRequests = userRequests.filter(time => now - time < windowMs);

    if (recentRequests.length >= maxRequests) {
      return reply.status(429).send({
        error: 'Too many requests',
        statusCode: 429,
        retryAfter: Math.ceil((recentRequests[0] + windowMs - now) / 1000)
      });
    }

    recentRequests.push(now);
    requests.set(identifier, recentRequests);
  };
};

/**
 * CORS Headers Middleware
 */
export const corsHeaders = async (request: FastifyRequest, reply: FastifyReply) => {
  reply.header('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  reply.header('Access-Control-Allow-Credentials', 'true');
};

/**
 * Security Headers Middleware
 */
export const securityHeaders = async (request: FastifyRequest, reply: FastifyReply) => {
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('X-XSS-Protection', '1; mode=block');
  reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
};
