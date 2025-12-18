import logger from '../config/logger.js';
/**
 * HTTP request logging middleware
 */
export async function loggerMiddleware(request, reply) {
    const start = Date.now();
    reply.raw.on('finish', () => {
        const duration = Date.now() - start;
        logger.info(`${request.method} ${request.url} - ${reply.statusCode} - ${duration}ms`);
    });
}
//# sourceMappingURL=logger.js.map