/**
 * Message Model
 * Handles message/chat database operations with PostgreSQL
 */

import { query } from '../db';

export interface IMessage {
  id: number;
  userId: number;
  username: string;
  text: string;
  conversationId?: string;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class Message {
  /**
   * Create new message
   */
  async create(userId: number, text: string, username: string, conversationId?: string): Promise<IMessage> {
    const result = await query<IMessage>(
      'INSERT INTO messages (user_id, username, text, conversation_id) VALUES ($1, $2, $3, $4) RETURNING id, user_id as "userId", username, text, conversation_id as "conversationId", is_read as "isRead", created_at as "createdAt", updated_at as "updatedAt"',
      [userId, username, text, conversationId]
    );
    return result.rows[0];
  }

  /**
   * Get messages by conversation
   */
  async getByConversation(conversationId: string, limit: number = 50): Promise<IMessage[]> {
    const result = await query<IMessage>(
      'SELECT id, user_id as "userId", username, text, conversation_id as "conversationId", is_read as "isRead", created_at as "createdAt", updated_at as "updatedAt" FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT $2',
      [conversationId, limit]
    );
    return result.rows;
  }

  /**
   * Get recent messages
   */
  async getRecent(limit: number = 100): Promise<IMessage[]> {
    const result = await query<IMessage>(
      'SELECT id, user_id as "userId", username, text, conversation_id as "conversationId", is_read as "isRead", created_at as "createdAt", updated_at as "updatedAt" FROM messages ORDER BY created_at DESC LIMIT $1',
      [limit]
    );
    return result.rows;
  }

  /**
   * Mark message as read
   */
  async markAsRead(id: number): Promise<boolean> {
    const result = await query(
      'UPDATE messages SET is_read = true, updated_at = NOW() WHERE id = $1',
      [id]
    );
    return (result.rowCount || 0) > 0;
  }

  /**
   * Get unread message count for user
   */
  async getUnreadCount(userId: number): Promise<number> {
    const result = await query<{ count: string }>(
      'SELECT COUNT(*) as count FROM messages WHERE user_id = $1 AND is_read = false',
      [userId]
    );
    return parseInt(result.rows[0]?.count || '0');
  }

  /**
   * Delete message
   */
  async delete(id: number): Promise<boolean> {
    const result = await query('DELETE FROM messages WHERE id = $1', [id]);
    return (result.rowCount || 0) > 0;
  }
}

export default new Message();
