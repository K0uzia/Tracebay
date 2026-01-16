/**
 * ROUTES/AGENDA.JS - Routes API pour les événements
 */

const express = require('express');
const { verifyToken } = require('../middleware/auth.js');
const db = require('../database.js').dbPromise;

const router = express.Router();

/**
 * GET /api/agenda/events
 * Récupérer les événements de l'utilisateur par plage de dates
 * Query params: start, end
 */
router.get('/events', verifyToken, async (req, res) => {
  try {
    const { start, end } = req.query;
    const userId = req.user.id;

    if (!start || !end) {
      return res.status(400).json({
        success: false,
        message: 'Les paramètres start et end sont obligatoires'
      });
    }

    const events = await db.all(
      `SELECT * FROM events 
             WHERE user_id = ? 
             AND start_time >= ? 
             AND end_time <= ?
             AND deleted_at IS NULL
             ORDER BY start_time`,
      [userId, start, end]
    );

    res.json({
      success: true,
      events: events || []
    });
  } catch (error) {
    console.error('❌ Erreur GET /events:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur récupération événements'
    });
  }
});

/**
 * GET /api/agenda/events/:id
 * Récupérer un événement spécifique
 */
router.get('/events/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const event = await db.get(
      'SELECT * FROM events WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
      [id, userId]
    );

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Événement non trouvé'
      });
    }

    res.json({
      success: true,
      event: event
    });
  } catch (error) {
    console.error('❌ Erreur GET /events/:id:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur récupération événement'
    });
  }
});

/**
 * POST /api/agenda/events
 * Créer un nouvel événement
 */
router.post('/events', verifyToken, async (req, res) => {
  try {
    const {
      title,
      description,
      start,
      end,
      color,
      all_day
    } = req.body;

    const userId = req.user.id;

    if (!title || !start || !end) {
      return res.status(400).json({
        success: false,
        message: 'Titre et dates sont obligatoires'
      });
    }

    const result = await db.run(
      `INSERT INTO events (user_id, title, description, start_time, end_time, color, all_day)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, title, description || '', start, end, color || '#3788d8', all_day ? 1 : 0]
    );

    const event = await db.get('SELECT * FROM events WHERE id = ?', [result.id]);

    res.status(201).json({
      success: true,
      message: 'Événement créé avec succès',
      event: event
    });
  } catch (error) {
    console.error('❌ Erreur POST /events:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur création événement'
    });
  }
});

/**
 * PUT /api/agenda/events/:id
 * Mettre à jour un événement
 */
router.put('/events/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { title, description, start, end, color, all_day } = req.body;

    // Vérifier que l'événement existe et appartient à l'utilisateur
    const event = await db.get(
      'SELECT * FROM events WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Événement non trouvé'
      });
    }

    await db.run(
      `UPDATE events 
             SET title = ?, description = ?, start_time = ?, end_time = ?, color = ?, all_day = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
      [title || event.title, description || event.description, start || event.start_time,
        end || event.end_time, color || event.color, all_day !== undefined ? all_day : event.all_day, id]
    );

    const updated = await db.get('SELECT * FROM events WHERE id = ?', [id]);

    res.json({
      success: true,
      message: 'Événement modifié avec succès',
      event: updated
    });
  } catch (error) {
    console.error('❌ Erreur PUT /events/:id:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur modification événement'
    });
  }
});

/**
 * DELETE /api/agenda/events/:id
 * Supprimer un événement (soft delete)
 */
router.delete('/events/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Vérifier que l'événement existe et appartient à l'utilisateur
    const event = await db.get(
      'SELECT * FROM events WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Événement non trouvé'
      });
    }

    await db.run(
      'UPDATE events SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
      message: 'Événement supprimé avec succès'
    });
  } catch (error) {
    console.error('❌ Erreur DELETE /events/:id:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur suppression événement'
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
