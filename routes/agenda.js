/**
 * ROUTES/AGENDA.JS - Routes API pour les événements
 */

const express = require('express');
const EventsModel = require('../models/events.js');

const router = express.Router();

/**
 * GET /api/agenda/events
 * Récupérer les événements par plage de dates
 * Query params: start, end, user_id
 */
router.get('/events', async (req, res) => {
    try {
        const { start, end, user_id } = req.query;

        if (!start || !end) {
            return res.status(400).json({
                success: false,
                message: 'Les paramètres start et end sont obligatoires'
            });
        }

        const events = await EventsModel.getByRange(start, end, user_id);
        
        res.json({
            success: true,
            data: events
        });
    } catch (error) {
        console.error('❌ Erreur GET /events:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * GET /api/agenda/events/:id
 * Récupérer un événement spécifique
 */
router.get('/events/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const event = await EventsModel.getById(id);

        if (!event) {
            return res.status(404).json({
                success: false,
                message: 'Événement non trouvé'
            });
        }

        res.json({
            success: true,
            data: event
        });
    } catch (error) {
        console.error('❌ Erreur GET /events/:id:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * POST /api/agenda/events
 * Créer un nouvel événement
 */
router.post('/events', async (req, res) => {
    try {
        const {
            user_id,
            title,
            description,
            start_time,
            end_time,
            color,
            all_day,
            category
        } = req.body;

        if (!title || !start_time || !end_time) {
            return res.status(400).json({
                success: false,
                message: 'Titre et dates sont obligatoires'
            });
        }

        const newEvent = await EventsModel.create({
            user_id,
            title,
            description,
            start_time,
            end_time,
            color,
            all_day,
            category
        });

        res.status(201).json({
            success: true,
            message: 'Événement créé avec succès',
            data: newEvent
        });
    } catch (error) {
        console.error('❌ Erreur POST /events:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * PUT /api/agenda/events/:id
 * Mettre à jour un événement
 */
router.put('/events/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        // Vérifier que l'événement existe
        const event = await EventsModel.getById(id);
        if (!event) {
            return res.status(404).json({
                success: false,
                message: 'Événement non trouvé'
            });
        }

        const updatedEvent = await EventsModel.update(id, updateData);

        res.json({
            success: true,
            message: 'Événement modifié avec succès',
            data: updatedEvent
        });
    } catch (error) {
        console.error('❌ Erreur PUT /events/:id:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * DELETE /api/agenda/events/:id
 * Supprimer un événement (soft delete)
 */
router.delete('/events/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // Vérifier que l'événement existe
        const event = await EventsModel.getById(id);
        if (!event) {
            return res.status(404).json({
                success: false,
                message: 'Événement non trouvé'
            });
        }

        const deleted = await EventsModel.delete(id);

        if (!deleted) {
            return res.status(400).json({
                success: false,
                message: 'Impossible de supprimer l\'événement'
            });
        }

        res.json({
            success: true,
            message: 'Événement supprimé avec succès'
        });
    } catch (error) {
        console.error('❌ Erreur DELETE /events/:id:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * GET /api/agenda/search
 * Chercher des événements
 */
router.get('/search', async (req, res) => {
    try {
        const { query, user_id } = req.query;

        if (!query) {
            return res.status(400).json({
                success: false,
                message: 'Le paramètre query est obligatoire'
            });
        }

        const results = await EventsModel.search(query, user_id);

        res.json({
            success: true,
            data: results
        });
    } catch (error) {
        console.error('❌ Erreur GET /search:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * GET /api/agenda/stats
 * Récupérer les statistiques
 */
router.get('/stats', async (req, res) => {
    try {
        const { user_id } = req.query;
        const stats = await EventsModel.getStats(user_id);

        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('❌ Erreur GET /stats:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;
