import { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '../lib/errors.js';
import logger from '../config/logger.js';

/**
 * Global error handler middleware
 */
export async function errorHandler(
  error: FastifyError | AppError,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  logger.error('Error occurred', {
    method: request.method,
    url: request.url,
    error: error.message,
    stack: error.stack,
  });

  if (error instanceof AppError) {
    reply.status(error.statusCode).send({
      success: false,
      error: {
        message: error.message,
        code: error.code,
      },
    });
  } else {
    // Handle Fastify validation errors
    if (error.statusCode === 400) {
      reply.status(400).send({
        success: false,
        error: {
          message: error.message,
          code: 'VALIDATION_ERROR',
        },
      });
    } else {
      // Generic error
      reply.status(error.statusCode || 500).send({
        success: false,
        error: {
          message: 'Internal server error',
          code: 'INTERNAL_ERROR',
        },
      });
    }
  }
}
