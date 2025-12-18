import type { Message } from '../types/database.js';
/**
 * Message model with CRUD operations
 */
export declare class MessageModel {
    /**
     * Create a new message
     */
    static create(content: string, userId: number): Promise<Message>;
    /**
     * Find message by ID
     */
    static findById(id: number): Promise<Message>;
    /**
     * Get recent messages with limit
     */
    static findRecent(limit?: number): Promise<Message[]>;
    /**
     * Get messages by user
     */
    static findByUserId(userId: number, limit?: number): Promise<Message[]>;
    /**
     * Delete message
     */
    static delete(id: number): Promise<void>;
    /**
     * Delete old messages
     */
    static deleteOlderThan(date: string): Promise<number>;
}
