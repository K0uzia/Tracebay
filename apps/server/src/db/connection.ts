import sqlite3 from 'sqlite3';
import config from '../config/env.js';
import logger from '../config/logger.js';

/**
 * Database connection wrapper with promises
 */
export class DatabaseConnection {
  private db: sqlite3.Database | null = null;

  constructor(private path: string) {}

  /**
   * Open database connection
   */
  async open(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.path, (err: Error | null) => {
        if (err) {
          logger.error('Failed to open database', { error: err.message });
          reject(err);
        } else {
          logger.info('Database connection opened', { path: this.path });
          resolve();
        }
      });
    });
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      this.db!.close((err: Error | null) => {
        if (err) {
          logger.error('Failed to close database', { error: err.message });
          reject(err);
        } else {
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
  async all<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    if (!this.db) throw new Error('Database not connected');

    return new Promise((resolve, reject) => {
      this.db!.all(sql, params, (err: Error | null, rows: unknown[]) => {
        if (err) {
          logger.error('Query failed', { sql, error: err.message });
          reject(err);
        } else {
          resolve(rows as T[]);
        }
      });
    });
  }

  /**
   * Execute a query that returns a single row
   */
  async get<T = unknown>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    if (!this.db) throw new Error('Database not connected');

    return new Promise((resolve, reject) => {
      this.db!.get(sql, params, (err: Error | null, row: unknown) => {
        if (err) {
          logger.error('Query failed', { sql, error: err.message });
          reject(err);
        } else {
          resolve(row as T | undefined);
        }
      });
    });
  }

  /**
   * Execute a query that modifies data (INSERT, UPDATE, DELETE)
   */
  async run(sql: string, params: unknown[] = []): Promise<{ lastID: number; changes: number }> {
    if (!this.db) throw new Error('Database not connected');

    return new Promise((resolve, reject) => {
      this.db!.run(sql, params, function (this: sqlite3.RunResult, err: Error | null) {
        if (err) {
          logger.error('Query failed', { sql, error: err.message });
          reject(err);
        } else {
          resolve({
            lastID: this.lastID,
            changes: this.changes
          });
        }
      });
    });
  }

  /**
   * Execute multiple queries in a transaction
   */
  async transaction(queries: Array<{ sql: string; params?: unknown[] }>): Promise<void> {
    if (!this.db) throw new Error('Database not connected');

    await this.run('BEGIN TRANSACTION');

    try {
      for (const query of queries) {
        await this.run(query.sql, query.params || []);
      }
      await this.run('COMMIT');
    } catch (error) {
      await this.run('ROLLBACK');
      throw error;
    }
  }
}

/**
 * Create a new database connection
 */
export function createConnection(path?: string): DatabaseConnection {
  return new DatabaseConnection(path || config.database.path);
}
