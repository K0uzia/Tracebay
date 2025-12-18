import sqlite3 from 'sqlite3';
import config from '../config/env.js';
import logger from '../config/logger.js';
/**
 * Database connection wrapper with promises
 */
export class DatabaseConnection {
    constructor(path) {
        this.path = path;
        this.db = null;
    }
    /**
     * Open database connection
     */
    async open() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.path, (err) => {
                if (err) {
                    logger.error('Failed to open database', { error: err.message });
                    reject(err);
                }
                else {
                    logger.info('Database connection opened', { path: this.path });
                    resolve();
                }
            });
        });
    }
    /**
     * Close database connection
     */
    async close() {
        if (!this.db)
            return;
        return new Promise((resolve, reject) => {
            this.db.close((err) => {
                if (err) {
                    logger.error('Failed to close database', { error: err.message });
                    reject(err);
                }
                else {
                    logger.info('Database connection closed');
                    this.db = null;
                    resolve();
                }
            });
        });
    }
    /**
     * Execute a query that returns multiple rows
     */
    async all(sql, params = []) {
        if (!this.db)
            throw new Error('Database not connected');
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    logger.error('Query failed', { sql, error: err.message });
                    reject(err);
                }
                else {
                    resolve(rows);
                }
            });
        });
    }
    /**
     * Execute a query that returns a single row
     */
    async get(sql, params = []) {
        if (!this.db)
            throw new Error('Database not connected');
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) {
                    logger.error('Query failed', { sql, error: err.message });
                    reject(err);
                }
                else {
                    resolve(row);
                }
            });
        });
    }
    /**
     * Execute a query that modifies data (INSERT, UPDATE, DELETE)
     */
    async run(sql, params = []) {
        if (!this.db)
            throw new Error('Database not connected');
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function (err) {
                if (err) {
                    logger.error('Query failed', { sql, error: err.message });
                    reject(err);
                }
                else {
                    resolve({
                        lastID: this.lastID,
                        changes: this.changes,
                    });
                }
            });
        });
    }
    /**
     * Execute multiple queries in a transaction
     */
    async transaction(queries) {
        if (!this.db)
            throw new Error('Database not connected');
        await this.run('BEGIN TRANSACTION');
        try {
            for (const query of queries) {
                await this.run(query.sql, query.params || []);
            }
            await this.run('COMMIT');
        }
        catch (error) {
            await this.run('ROLLBACK');
            throw error;
        }
    }
}
/**
 * Create a new database connection
 */
export function createConnection(path) {
    return new DatabaseConnection(path || config.database.path);
}
//# sourceMappingURL=connection.js.map