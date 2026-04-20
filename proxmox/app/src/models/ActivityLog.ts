/**
 * ActivityLog Model
 * Handles activity logging for monitoring and audit with PostgreSQL
 */

import { query } from '../db';

export interface IActivityLog {
  id: number;
  userId: number | null;
  action: string;
  details?: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

export class ActivityLog {
  /**
   * Log an activity
   */
  async log(
    userId: number | null,
    action: string,
    metadata?: Record<string, any>,
    ipAddress?: string,
    userAgent?: string
  ): Promise<IActivityLog> {
    const result = await query<IActivityLog>(
      'INSERT INTO activity_logs (user_id, action, metadata, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5) RETURNING id, user_id as "userId", action, details, metadata, ip_address as "ipAddress", user_agent as "userAgent", created_at as "createdAt"',
      [userId, action, JSON.stringify(metadata || {}), ipAddress, userAgent]
    );
    return result.rows[0];
  }

  /**
   * Get recent activities
   */
  async getRecent(limit: number = 100): Promise<IActivityLog[]> {
    const result = await query<IActivityLog>(
      'SELECT id, user_id as "userId", action, details, metadata, ip_address as "ipAddress", user_agent as "userAgent", created_at as "createdAt" FROM activity_logs ORDER BY created_at DESC LIMIT $1',
      [limit]
    );
    return result.rows;
  }

  /**
   * Get activities by user
   */
  async getByUser(userId: number, limit: number = 50): Promise<IActivityLog[]> {
    const result = await query<IActivityLog>(
      'SELECT id, user_id as "userId", action, details, metadata, ip_address as "ipAddress", user_agent as "userAgent", created_at as "createdAt" FROM activity_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
      [userId, limit]
    );
    return result.rows;
  }

  /**
   * Get activities by action
   */
  async getByAction(action: string, limit: number = 50): Promise<IActivityLog[]> {
    const result = await query<IActivityLog>(
      'SELECT id, user_id as "userId", action, details, metadata, ip_address as "ipAddress", user_agent as "userAgent", created_at as "createdAt" FROM activity_logs WHERE action = $1 ORDER BY created_at DESC LIMIT $2',
      [action, limit]
    );
    return result.rows;
  }

  /**
   * Get activities in date range
   */
  async getRange(fromDate: Date, toDate: Date, limit: number = 100): Promise<IActivityLog[]> {
    const result = await query<IActivityLog>(
      'SELECT id, user_id as "userId", action, details, metadata, ip_address as "ipAddress", user_agent as "userAgent", created_at as "createdAt" FROM activity_logs WHERE created_at >= $1 AND created_at <= $2 ORDER BY created_at DESC LIMIT $3',
      [fromDate, toDate, limit]
    );
    return result.rows;
  }

  /**
   * Get activity count
   */
  async count(): Promise<number> {
    const result = await query<{ count: string }>(
      'SELECT COUNT(*) as count FROM activity_logs'
    );
    return parseInt(result.rows[0]?.count || '0');
  }

  /**
   * Get all activities (for monitoring)
   */
  async getAll(): Promise<IActivityLog[]> {
    const result = await query<IActivityLog>(
      'SELECT id, user_id as "userId", action, details, metadata, ip_address as "ipAddress", user_agent as "userAgent", created_at as "createdAt" FROM activity_logs ORDER BY created_at DESC LIMIT 1000'
    );
    return result.rows;
  }
}

export default new ActivityLog();
