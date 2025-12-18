import type { Event } from '../types/database.js';
/**
 * Event model with CRUD operations
 */
export declare class EventModel {
    /**
     * Create a new event
     */
    static create(title: string, userId: number, startDate: string, description?: string, endDate?: string): Promise<Event>;
    /**
     * Find event by ID
     */
    static findById(id: number): Promise<Event>;
    /**
     * Get all events for a user
     */
    static findByUserId(userId: number): Promise<Event[]>;
    /**
     * Get events in a date range
     */
    static findByDateRange(userId: number, startDate: string, endDate: string): Promise<Event[]>;
    /**
     * Update event
     */
    static update(id: number, data: Partial<Event>): Promise<Event>;
    /**
     * Delete event
     */
    static delete(id: number): Promise<void>;
}
