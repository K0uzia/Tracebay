/**
 * MODELS/EVENTS.JS - Modèle pour les événements
 * Opérations CRUD pour la table events
 */

const { dbPromise } = require('../database.js');

const EventsModel = {
    /**
     * Créer un nouvel événement
     */
    async create(eventData) {
        const {
            user_id,
            title,
            description,
            start_time,
            end_time,
            color = '#3788d8',
            all_day = false,
            category
        } = eventData;

        if (!title || !start_time || !end_time) {
            throw new Error('Titre, date début et date fin sont obligatoires');
        }

        const sql = `
            INSERT INTO events (
                user_id, title, description, start_time, end_time, 
                color, all_day, category, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `;

        const result = await dbPromise.run(sql, [
            user_id,
            title,
            description,
            start_time,
            end_time,
            color,
            all_day ? 1 : 0,
            category
        ]);

        return { id: result.id, ...eventData };
    },

    /**
     * Récupérer un événement par ID
     */
    async getById(id) {
        const sql = `
            SELECT * FROM events WHERE id = ? AND deleted_at IS NULL
        `;
        return await dbPromise.get(sql, [id]);
    },

    /**
     * Récupérer les événements par plage de dates
     */
    async getByRange(startDate, endDate, userId = null) {
        let sql = `
            SELECT * FROM events 
            WHERE deleted_at IS NULL 
            AND start_time >= ? 
            AND end_time <= ?
        `;
        const params = [startDate, endDate];

        if (userId) {
            sql += ` AND user_id = ?`;
            params.push(userId);
        }

        sql += ` ORDER BY start_time ASC`;
        return await dbPromise.all(sql, params);
    },

    /**
     * Récupérer tous les événements d'un utilisateur
     */
    async getByUserId(userId) {
        const sql = `
            SELECT * FROM events 
            WHERE user_id = ? AND deleted_at IS NULL
            ORDER BY start_time DESC
        `;
        return await dbPromise.all(sql, [userId]);
    },

    /**
     * Récupérer tous les événements (admin)
     */
    async getAll(limit = 100, offset = 0) {
        const sql = `
            SELECT * FROM events 
            WHERE deleted_at IS NULL
            ORDER BY start_time DESC
            LIMIT ? OFFSET ?
        `;
        return await dbPromise.all(sql, [limit, offset]);
    },

    /**
     * Mettre à jour un événement
     */
    async update(id, eventData) {
        const {
            title,
            description,
            start_time,
            end_time,
            color,
            all_day,
            category
        } = eventData;

        const updates = [];
        const values = [];

        if (title !== undefined) {
            updates.push('title = ?');
            values.push(title);
        }
        if (description !== undefined) {
            updates.push('description = ?');
            values.push(description);
        }
        if (start_time !== undefined) {
            updates.push('start_time = ?');
            values.push(start_time);
        }
        if (end_time !== undefined) {
            updates.push('end_time = ?');
            values.push(end_time);
        }
        if (color !== undefined) {
            updates.push('color = ?');
            values.push(color);
        }
        if (all_day !== undefined) {
            updates.push('all_day = ?');
            values.push(all_day ? 1 : 0);
        }
        if (category !== undefined) {
            updates.push('category = ?');
            values.push(category);
        }

        if (updates.length === 0) {
            return { id, ...eventData };
        }

        updates.push('updated_at = CURRENT_TIMESTAMP');
        values.push(id);

        const sql = `
            UPDATE events 
            SET ${updates.join(', ')} 
            WHERE id = ? AND deleted_at IS NULL
        `;

        await dbPromise.run(sql, values);
        return await this.getById(id);
    },

    /**
     * Supprimer un événement (soft delete)
     */
    async delete(id) {
        const sql = `
            UPDATE events 
            SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND deleted_at IS NULL
        `;
        const result = await dbPromise.run(sql, [id]);
        return result.changes > 0;
    },

    /**
     * Supprimer définitivement un événement (hard delete - admin seulement)
     */
    async hardDelete(id) {
        const sql = `DELETE FROM events WHERE id = ?`;
        const result = await dbPromise.run(sql, [id]);
        return result.changes > 0;
    },

    /**
     * Récupérer les événements par catégorie
     */
    async getByCategory(category, userId = null) {
        let sql = `
            SELECT * FROM events 
            WHERE category = ? AND deleted_at IS NULL
        `;
        const params = [category];

        if (userId) {
            sql += ` AND user_id = ?`;
            params.push(userId);
        }

        sql += ` ORDER BY start_time DESC`;
        return await dbPromise.all(sql, params);
    },

    /**
     * Chercher des événements
     */
    async search(query, userId = null) {
        let sql = `
            SELECT * FROM events 
            WHERE (title LIKE ? OR description LIKE ?) 
            AND deleted_at IS NULL
        `;
        const params = [`%${query}%`, `%${query}%`];

        if (userId) {
            sql += ` AND user_id = ?`;
            params.push(userId);
        }

        sql += ` ORDER BY start_time DESC`;
        return await dbPromise.all(sql, params);
    },

    /**
     * Récupérer les statistiques
     */
    async getStats(userId = null) {
        let sql = `
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN all_day = 1 THEN 1 ELSE 0 END) as all_day_count,
                COUNT(DISTINCT DATE(start_time)) as days_with_events
            FROM events 
            WHERE deleted_at IS NULL
        `;
        const params = [];

        if (userId) {
            sql += ` AND user_id = ?`;
            params.push(userId);
        }

        return await dbPromise.get(sql, params);
    }
};

module.exports = EventsModel;
