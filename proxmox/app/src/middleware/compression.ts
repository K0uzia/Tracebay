/**
 * Compression Middleware
 * Phase 5: Response compression for better performance
 */

import { FastifyInstance } from 'fastify';
import compress from '@fastify/compress';
import { performanceConfig } from '../config/performance.config';

export async function registerCompression(fastify: FastifyInstance) {
  const { compression } = performanceConfig;

  if (!compression.enabled) {
    fastify.log.info('Compression disabled for stability');
    return;
  }

  await fastify.register(compress, {
    global: true,
    threshold: compression.threshold,
    encodingPriority: compression.encodingPriority,
    brotliOptions: compression.brotli,
    zlibOptions: compression.gzip,
  } as any);

  fastify.log.info({ threshold: compression.threshold, encodings: compression.encodingPriority }, 'Compression middleware registered');
}
