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
    fastify.log.info('Compression disabled');
    return;
  }

  await fastify.register(compress, {
    global: true,
    threshold: compression.threshold,
    encodingPriority: compression.encodingPriority,
    brotliOptions: compression.brotli,
    zlibOptions: compression.gzip,
    // Don't compress if already compressed
    onUnsupportedEncoding: (encoding: string, request: any, reply: any) => {
      reply.code(406);
      return 'Unsupported encoding';
    },
  } as any);

  fastify.log.info({ threshold: compression.threshold, encodings: compression.encodingPriority }, 'Compression middleware registered');
}
