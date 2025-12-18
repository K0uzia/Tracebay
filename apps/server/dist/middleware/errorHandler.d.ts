import { FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '../lib/errors.js';
/**
 * Global error handler middleware
 */
export declare function errorHandler(error: FastifyError | AppError, request: FastifyRequest, reply: FastifyReply): Promise<void>;
