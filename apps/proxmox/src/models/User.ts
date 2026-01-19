/**
 * User Model
 * Handles user database operations with PostgreSQL
 */

import { query } from '../db';

export interface IUser {
  id: number;
  username: string;
  passwordHash: string;
  email?: string;
  createdAt: Date;
  updatedAt: Date;
  lastLogin?: Date;
}

export class User {
  /**
   * Get all users
   */
  async getAll(): Promise<IUser[]> {
    const result = await query<IUser>(
      'SELECT id, username, password_hash as "passwordHash", email, created_at as "createdAt", updated_at as "updatedAt", last_login as "lastLogin" FROM users ORDER BY created_at DESC'
    );
    return result.rows;
  }

  /**
   * Get user by ID
   */
  async getById(id: number): Promise<IUser | null> {
    const result = await query<IUser>(
      'SELECT id, username, password_hash as "passwordHash", email, created_at as "createdAt", updated_at as "updatedAt", last_login as "lastLogin" FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Get user by username
   */
  async getByUsername(username: string): Promise<IUser | null> {
    const result = await query<IUser>(
      'SELECT id, username, password_hash as "passwordHash", email, created_at as "createdAt", updated_at as "updatedAt", last_login as "lastLogin" FROM users WHERE username = $1',
      [username]
    );
    return result.rows[0] || null;
  }

  /**
   * Create new user
   */
  async create(data: Omit<IUser, 'id' | 'createdAt' | 'updatedAt'>): Promise<IUser> {
    const result = await query<IUser>(
      'INSERT INTO users (username, password_hash, email) VALUES ($1, $2, $3) RETURNING id, username, password_hash as "passwordHash", email, created_at as "createdAt", updated_at as "updatedAt"',
      [data.username, data.passwordHash, data.email]
    );
    return result.rows[0];
  }

  /**
   * Update user
   */
  async update(id: number, data: Partial<Omit<IUser, 'id' | 'createdAt'>>): Promise<IUser | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.username !== undefined) {
      fields.push(`username = $${paramIndex++}`);
      values.push(data.username);
    }
    if (data.passwordHash !== undefined) {
      fields.push(`password_hash = $${paramIndex++}`);
      values.push(data.passwordHash);
    }
    if (data.email !== undefined) {
      fields.push(`email = $${paramIndex++}`);
      values.push(data.email);
    }

    if (fields.length === 0) return null;

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const result = await query<IUser>(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING id, username, password_hash as "passwordHash", email, created_at as "createdAt", updated_at as "updatedAt"`,
      values
    );
    return result.rows[0] || null;
  }

  /**
   * Delete user
   */
  async delete(id: number): Promise<boolean> {
    const result = await query('DELETE FROM users WHERE id = $1', [id]);
    return (result.rowCount || 0) > 0;
  }

  /**
   * Update last login
   */
  async updateLastLogin(id: number): Promise<void> {
    await query('UPDATE users SET last_login = NOW() WHERE id = $1', [id]);
  }
}

export default new User();
