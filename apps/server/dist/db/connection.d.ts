/**
 * Database connection wrapper with promises
 */
export declare class DatabaseConnection {
    private path;
    private db;
    constructor(path: string);
    /**
     * Open database connection
     */
    open(): Promise<void>;
    /**
     * Close database connection
     */
    close(): Promise<void>;
    /**
     * Execute a query that returns multiple rows
     */
    all<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
    /**
     * Execute a query that returns a single row
     */
    get<T = unknown>(sql: string, params?: unknown[]): Promise<T | undefined>;
    /**
     * Execute a query that modifies data (INSERT, UPDATE, DELETE)
     */
    run(sql: string, params?: unknown[]): Promise<{
        lastID: number;
        changes: number;
    }>;
    /**
     * Execute multiple queries in a transaction
     */
    transaction(queries: Array<{
        sql: string;
        params?: unknown[];
    }>): Promise<void>;
}
/**
 * Create a new database connection
 */
export declare function createConnection(path?: string): DatabaseConnection;
