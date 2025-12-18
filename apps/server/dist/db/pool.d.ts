import { DatabaseConnection } from './connection.js';
/**
 * Connection pool for SQLite database
 */
export declare class ConnectionPool {
    private poolSize;
    private dbPath;
    private connections;
    private available;
    private inUse;
    private waitQueue;
    constructor(poolSize: number, dbPath: string);
    /**
     * Initialize the connection pool
     */
    initialize(): Promise<void>;
    /**
     * Get a connection from the pool
     */
    acquire(): Promise<DatabaseConnection>;
    /**
     * Return a connection to the pool
     */
    release(conn: DatabaseConnection): void;
    /**
     * Execute a query with automatic connection management
     */
    execute<T>(callback: (conn: DatabaseConnection) => Promise<T>): Promise<T>;
    /**
     * Close all connections in the pool
     */
    close(): Promise<void>;
    /**
     * Get pool statistics
     */
    getStats(): {
        total: number;
        available: number;
        inUse: number;
        waiting: number;
    };
}
/**
 * Initialize the global connection pool
 */
export declare function initializePool(): Promise<ConnectionPool>;
/**
 * Get the global connection pool
 */
export declare function getPool(): ConnectionPool;
/**
 * Close the global connection pool
 */
export declare function closePool(): Promise<void>;
