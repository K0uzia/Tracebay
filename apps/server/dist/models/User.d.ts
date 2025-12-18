import type { User } from '../types/database.js';
/**
 * User model with CRUD operations
 */
export declare class UserModel {
    /**
     * Create a new user
     */
    static create(username: string, password: string, email?: string): Promise<User>;
    /**
     * Find user by ID
     */
    static findById(id: number): Promise<User>;
    /**
     * Find user by username
     */
    static findByUsername(username: string): Promise<User | undefined>;
    /**
     * Authenticate user with username and password
     */
    static authenticate(username: string, password: string): Promise<User>;
    /**
     * Get all users
     */
    static findAll(): Promise<User[]>;
    /**
     * Update user
     */
    static update(id: number, data: Partial<User>): Promise<User>;
    /**
     * Delete user
     */
    static delete(id: number): Promise<void>;
}
