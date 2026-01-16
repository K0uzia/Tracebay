import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import config from './config/env.js';
import logger from './config/logger.js';
import { initializePool, closePool, getPool } from './db/pool.js';
import { errorHandler } from './middleware/errorHandler.js';
import { loggerMiddleware } from './middleware/logger.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
/**
 * Initialize database schema
 */
async function initializeDatabase() {
    const schemaPath = join(__dirname, 'db', 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    const pool = getPool();
    const statements = schema
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    for (const statement of statements) {
        await pool.execute(async (conn) => {
            return conn.run(statement);
        });
    }
    logger.info('Database schema initialized');
}
/**
 * Create and configure Fastify server
 */
async function createServer() {
    const fastify = Fastify({
        logger: false // Using custom logger
    });
    // Security middleware
    await fastify.register(helmet, {
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                scriptSrc: ["'self'"],
                imgSrc: ["'self'", 'data:', 'https:']
            }
        }
    });
    // CORS
    await fastify.register(cors, {
        origin: config.env === 'development' ? true : ['http://localhost:8060'],
        credentials: true
    });
    // Custom middleware
    fastify.addHook('onRequest', loggerMiddleware);
    // Error handler
    fastify.setErrorHandler(errorHandler);
    // Health check route
    fastify.get('/health', async () => {
        return { status: 'ok', timestamp: new Date().toISOString() };
    });
    // API routes placeholder
    fastify.get('/api', async () => {
        return {
            message: 'Workspace API v2.0',
            version: '2.0.0'
        };
    });
    return fastify;
}
/**
 * Start the server
 */
async function start() {
    try {
        // Initialize database pool
        logger.info('Initializing database pool...');
        await initializePool();
        await initializeDatabase();
        // Create and start server
        logger.info('Starting server...');
        const fastify = await createServer();
        await fastify.listen({ port: config.port, host: '0.0.0.0' });
        logger.info(`Server listening on http://localhost:${config.port}`);
    }
    catch (error) {
        logger.error('Failed to start server', { error });
        process.exit(1);
    }
}
/**
 * Graceful shutdown
 */
async function shutdown() {
    logger.info('Shutting down...');
    await closePool();
    process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
// Start the server
start();
//# sourceMappingURL=main.js.map