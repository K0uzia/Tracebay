import { getPool } from '../db/pool.js';
import type { User } from '../types/database.js';
import { hashPassword, comparePassword } from '../lib/password.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';

/**
 * User model with CRUD operations
 */
export class UserModel {
  /**
   * Create a new user
   */
  static async create(username: string, password: string, email?: string): Promise<User> {
    const pool = getPool();
    const hashedPassword = await hashPassword(password);

    const result = await pool.execute(async (conn) => {
      return conn.run(
        'INSERT INTO users (username, password, email) VALUES (?, ?, ?)',
        [username, hashedPassword, email]
      );
    });

    return this.findById(result.lastID);
  }

  /**
   * Find user by ID
   */
  static async findById(id: number): Promise<User> {
    const pool = getPool();

    const user = await pool.execute(async (conn) => {
      return conn.get<User>('SELECT * FROM users WHERE id = ?', [id]);
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    return user;
  }

  /**
   * Find user by username
   */
  static async findByUsername(username: string): Promise<User | undefined> {
    const pool = getPool();

    return pool.execute(async (conn) => {
      return conn.get<User>('SELECT * FROM users WHERE username = ?', [username]);
    });
  }

  /**
   * Authenticate user with username and password
   */
  static async authenticate(username: string, password: string): Promise<User> {
    const user = await this.findByUsername(username);

    if (!user) {
      throw new ValidationError('Invalid credentials');
    }

    const isValid = await comparePassword(password, user.password);

    if (!isValid) {
      throw new ValidationError('Invalid credentials');
    }

    return user;
  }

  /**
   * Get all users
   */
  static async findAll(): Promise<User[]> {
    const pool = getPool();

    return pool.execute(async (conn) => {
      return conn.all<User>('SELECT id, username, email, created_at, updated_at FROM users');
    });
  }

  /**
   * Update user
   */
  static async update(id: number, data: Partial<User>): Promise<User> {
    const pool = getPool();
    const updates: string[] = [];
    const params: unknown[] = [];

    if (data.username) {
      updates.push('username = ?');
      params.push(data.username);
    }

    if (data.email !== undefined) {
      updates.push('email = ?');
      params.push(data.email);
    }

    if (data.password) {
      updates.push('password = ?');
      params.push(await hashPassword(data.password));
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);

    await pool.execute(async (conn) => {
      return conn.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    });

    return this.findById(id);
  }

  /**
   * Delete user
   */
  static async delete(id: number): Promise<void> {
    const pool = getPool();

    const result = await pool.execute(async (conn) => {
      return conn.run('DELETE FROM users WHERE id = ?', [id]);
    });

    if (result.changes === 0) {
      throw new NotFoundError('User not found');
    }
  }
}
