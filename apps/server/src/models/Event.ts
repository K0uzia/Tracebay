import { getPool } from '../db/pool.js';
import type { Event } from '../types/database.js';
import { NotFoundError } from '../lib/errors.js';

/**
 * Event model with CRUD operations
 */
export class EventModel {
  /**
   * Create a new event
   */
  static async create(
    title: string,
    userId: number,
    startDate: string,
    description?: string,
    endDate?: string
  ): Promise<Event> {
    const pool = getPool();

    const result = await pool.execute(async (conn) => {
      return conn.run(
        'INSERT INTO events (title, description, start_date, end_date, user_id) VALUES (?, ?, ?, ?, ?)',
        [title, description, startDate, endDate, userId]
      );
    });

    return this.findById(result.lastID);
  }

  /**
   * Find event by ID
   */
  static async findById(id: number): Promise<Event> {
    const pool = getPool();

    const event = await pool.execute(async (conn) => {
      return conn.get<Event>('SELECT * FROM events WHERE id = ?', [id]);
    });

    if (!event) {
      throw new NotFoundError('Event not found');
    }

    return event;
  }

  /**
   * Get all events for a user
   */
  static async findByUserId(userId: number): Promise<Event[]> {
    const pool = getPool();

    return pool.execute(async (conn) => {
      return conn.all<Event>(
        'SELECT * FROM events WHERE user_id = ? ORDER BY start_date DESC',
        [userId]
      );
    });
  }

  /**
   * Get events in a date range
   */
  static async findByDateRange(userId: number, startDate: string, endDate: string): Promise<Event[]> {
    const pool = getPool();

    return pool.execute(async (conn) => {
      return conn.all<Event>(
        'SELECT * FROM events WHERE user_id = ? AND start_date >= ? AND start_date <= ? ORDER BY start_date',
        [userId, startDate, endDate]
      );
    });
  }

  /**
   * Update event
   */
  static async update(id: number, data: Partial<Event>): Promise<Event> {
    const pool = getPool();
    const updates: string[] = [];
    const params: unknown[] = [];

    if (data.title) {
      updates.push('title = ?');
      params.push(data.title);
    }

    if (data.description !== undefined) {
      updates.push('description = ?');
      params.push(data.description);
    }

    if (data.start_date) {
      updates.push('start_date = ?');
      params.push(data.start_date);
    }

    if (data.end_date !== undefined) {
      updates.push('end_date = ?');
      params.push(data.end_date);
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    await pool.execute(async (conn) => {
      return conn.run(`UPDATE events SET ${updates.join(', ')} WHERE id = ?`, params);
    });

    return this.findById(id);
  }

  /**
   * Delete event
   */
  static async delete(id: number): Promise<void> {
    const pool = getPool();

    const result = await pool.execute(async (conn) => {
      return conn.run('DELETE FROM events WHERE id = ?', [id]);
    });

    if (result.changes === 0) {
      throw new NotFoundError('Event not found');
    }
  }
}
