import { DatabaseConnection, createConnection } from './connection.js';
import config from '../config/env.js';
import logger from '../config/logger.js';

/**
 * Connection pool for SQLite database
 */
export class ConnectionPool {
  private connections: DatabaseConnection[] = [];
  private available: DatabaseConnection[] = [];
  private inUse: Set<DatabaseConnection> = new Set();
  private waitQueue: Array<(conn: DatabaseConnection) => void> = [];

  constructor(
    private poolSize: number,
    private dbPath: string
  ) {}

  /**
   * Initialize the connection pool
   */
  async initialize(): Promise<void> {
    logger.info('Initializing connection pool', {
      size: this.poolSize,
      path: this.dbPath,
    });

    for (let i = 0; i < this.poolSize; i++) {
      const conn = createConnection(this.dbPath);
      await conn.open();
      this.connections.push(conn);
      this.available.push(conn);
    }

    logger.info('Connection pool initialized', { size: this.connections.length });
  }

  /**
   * Get a connection from the pool
   */
  async acquire(): Promise<DatabaseConnection> {
    return new Promise((resolve) => {
      if (this.available.length > 0) {
        const conn = this.available.pop()!;
        this.inUse.add(conn);
        resolve(conn);
      } else {
        // Queue the request
        this.waitQueue.push(resolve);
      }
    });
  }

  /**
   * Return a connection to the pool
   */
  release(conn: DatabaseConnection): void {
    if (!this.inUse.has(conn)) {
      logger.warn('Attempted to release a connection not in use');
      return;
    }

    this.inUse.delete(conn);

    // If there are waiting requests, give the connection to them
    if (this.waitQueue.length > 0) {
      const resolve = this.waitQueue.shift()!;
      this.inUse.add(conn);
      resolve(conn);
    } else {
      this.available.push(conn);
    }
  }

  /**
   * Execute a query with automatic connection management
   */
  async execute<T>(
    callback: (conn: DatabaseConnection) => Promise<T>
  ): Promise<T> {
    const conn = await this.acquire();
    try {
      return await callback(conn);
    } finally {
      this.release(conn);
    }
  }

  /**
   * Close all connections in the pool
   */
  async close(): Promise<void> {
    logger.info('Closing connection pool');

    for (const conn of this.connections) {
      await conn.close();
    }

    this.connections = [];
    this.available = [];
    this.inUse.clear();
    this.waitQueue = [];

    logger.info('Connection pool closed');
  }

  /**
   * Get pool statistics
   */
  getStats(): { total: number; available: number; inUse: number; waiting: number } {
    return {
      total: this.connections.length,
      available: this.available.length,
      inUse: this.inUse.size,
      waiting: this.waitQueue.length,
    };
  }
}

// Global pool instance
let pool: ConnectionPool | null = null;

/**
 * Initialize the global connection pool
 */
export async function initializePool(): Promise<ConnectionPool> {
  if (pool) {
    logger.warn('Connection pool already initialized');
    return pool;
  }

  pool = new ConnectionPool(config.database.poolSize, config.database.path);
  await pool.initialize();
  return pool;
}

/**
 * Get the global connection pool
 */
export function getPool(): ConnectionPool {
  if (!pool) {
    throw new Error('Connection pool not initialized');
  }
  return pool;
}

/**
 * Close the global connection pool
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.close();
    pool = null;
  }
}
