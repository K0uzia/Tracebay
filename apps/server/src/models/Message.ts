import { getPool } from '../db/pool.js';
import type { Message } from '../types/database.js';
import { NotFoundError } from '../lib/errors.js';

/**
 * Message model with CRUD operations
 */
export class MessageModel {
  /**
   * Create a new message
   */
  static async create(content: string, userId: number): Promise<Message> {
    const pool = getPool();

    const result = await pool.execute(async (conn) => {
      return conn.run('INSERT INTO messages (content, user_id) VALUES (?, ?)', [content, userId]);
    });

    return this.findById(result.lastID);
  }

  /**
   * Find message by ID
   */
  static async findById(id: number): Promise<Message> {
    const pool = getPool();

    const message = await pool.execute(async (conn) => {
      return conn.get<Message>('SELECT * FROM messages WHERE id = ?', [id]);
    });

    if (!message) {
      throw new NotFoundError('Message not found');
    }

    return message;
  }

  /**
   * Get recent messages with limit
   */
  static async findRecent(limit: number = 50): Promise<Message[]> {
    const pool = getPool();

    return pool.execute(async (conn) => {
      return conn.all<Message>(
        'SELECT * FROM messages ORDER BY created_at DESC LIMIT ?',
        [limit]
      );
    });
  }

  /**
   * Get messages by user
   */
  static async findByUserId(userId: number, limit: number = 50): Promise<Message[]> {
    const pool = getPool();

    return pool.execute(async (conn) => {
      return conn.all<Message>(
        'SELECT * FROM messages WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
        [userId, limit]
      );
    });
  }

  /**
   * Delete message
   */
  static async delete(id: number): Promise<void> {
    const pool = getPool();

    const result = await pool.execute(async (conn) => {
      return conn.run('DELETE FROM messages WHERE id = ?', [id]);
    });

    if (result.changes === 0) {
      throw new NotFoundError('Message not found');
    }
  }

  /**
   * Delete old messages
   */
  static async deleteOlderThan(date: string): Promise<number> {
    const pool = getPool();

    const result = await pool.execute(async (conn) => {
      return conn.run('DELETE FROM messages WHERE created_at < ?', [date]);
    });

    return result.changes;
  }
}
