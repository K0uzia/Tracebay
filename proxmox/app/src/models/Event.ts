/**
 * Event Model
 * Handles event/agenda database operations with PostgreSQL
 */

import { query } from '../db';

export interface IEvent {
  id: number;
  userId: number;
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  location?: string;
  attendees?: string[];
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export class Event {
  /**
   * Create new event
   */
  async create(data: Omit<IEvent, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>): Promise<IEvent> {
    const result = await query<IEvent>(
      'INSERT INTO events (user_id, title, description, start_time, end_time, location, attendees) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, user_id as "userId", title, description, start_time as "startTime", end_time as "endTime", location, attendees, created_at as "createdAt", updated_at as "updatedAt"',
      [data.userId, data.title, data.description, data.startTime, data.endTime, data.location, data.attendees]
    );
    return result.rows[0];
  }

  /**
   * Get event by ID
   */
  async getById(id: number): Promise<IEvent | null> {
    const result = await query<IEvent>(
      'SELECT id, user_id as "userId", title, description, start_time as "startTime", end_time as "endTime", location, attendees, created_at as "createdAt", updated_at as "updatedAt", deleted_at as "deletedAt" FROM events WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Get events in date range
   */
  async getRange(userId: number, fromDate: Date, toDate: Date): Promise<IEvent[]> {
    const result = await query<IEvent>(
      'SELECT id, user_id as "userId", title, description, start_time as "startTime", end_time as "endTime", location, attendees, created_at as "createdAt", updated_at as "updatedAt" FROM events WHERE user_id = $1 AND start_time >= $2 AND end_time <= $3 AND deleted_at IS NULL ORDER BY start_time ASC',
      [userId, fromDate, toDate]
    );
    return result.rows;
  }

  /**
   * Get user events
   */
  async getByUser(userId: number): Promise<IEvent[]> {
    const result = await query<IEvent>(
      'SELECT id, user_id as "userId", title, description, start_time as "startTime", end_time as "endTime", location, attendees, created_at as "createdAt", updated_at as "updatedAt" FROM events WHERE user_id = $1 AND deleted_at IS NULL ORDER BY start_time DESC',
      [userId]
    );
    return result.rows;
  }

  /**
   * Update event
   */
  async update(id: number, data: Partial<Omit<IEvent, 'id' | 'createdAt' | 'deletedAt'>>): Promise<IEvent | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.title !== undefined) {
      fields.push(`title = $${paramIndex++}`);
      values.push(data.title);
    }
    if (data.description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      values.push(data.description);
    }
    if (data.startTime !== undefined) {
      fields.push(`start_time = $${paramIndex++}`);
      values.push(data.startTime);
    }
    if (data.endTime !== undefined) {
      fields.push(`end_time = $${paramIndex++}`);
      values.push(data.endTime);
    }
    if (data.location !== undefined) {
      fields.push(`location = $${paramIndex++}`);
      values.push(data.location);
    }
    if (data.attendees !== undefined) {
      fields.push(`attendees = $${paramIndex++}`);
      values.push(data.attendees);
    }

    if (fields.length === 0) return null;

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const result = await query<IEvent>(
      `UPDATE events SET ${fields.join(', ')} WHERE id = $${paramIndex} AND deleted_at IS NULL RETURNING id, user_id as "userId", title, description, start_time as "startTime", end_time as "endTime", location, attendees, created_at as "createdAt", updated_at as "updatedAt"`,
      values
    );
    return result.rows[0] || null;
  }

  /**
   * Delete event (soft delete)
   */
  async delete(id: number): Promise<boolean> {
    const result = await query(
      'UPDATE events SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    return (result.rowCount || 0) > 0;
  }

  /**
   * Get all events (for monitoring)
   */
  async getAll(): Promise<IEvent[]> {
    const result = await query<IEvent>(
      'SELECT id, user_id as "userId", title, description, start_time as "startTime", end_time as "endTime", location, attendees, created_at as "createdAt", updated_at as "updatedAt" FROM events WHERE deleted_at IS NULL ORDER BY created_at DESC'
    );
    return result.rows;
  }

  /**
   * Count total events
   */
  async count(): Promise<number> {
    const result = await query<{ count: string }>(
      'SELECT COUNT(*) as count FROM events WHERE deleted_at IS NULL'
    );
    return parseInt(result.rows[0]?.count || '0');
  }
}

export default new Event();
