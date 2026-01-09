const express = require('express');
const router = express.Router();
const { dbPromise } = require('../database.js');

/**
 * GET /api/marques - Récupérer toutes les marques
 */
router.get('/', async (req, res) => {
  try {
    const marques = await dbPromise.all(`
      SELECT id, name FROM marques ORDER BY name ASC
    `);
    res.json({ success: true, items: marques });
  } catch (error) {
    console.error('❌ GET /api/marques error:', error);
    res.status(500).json({ success: false, message: 'Erreur récupération marques' });
  }
});

/**
 * GET /api/marques/:marqueId/modeles - Récupérer les modèles d'une marque
 */
router.get('/:marqueId/modeles', async (req, res) => {
  try {
    const marqueId = parseInt(req.params.marqueId);
    const modeles = await dbPromise.all(`
      SELECT id, name, marque_id FROM modeles 
      WHERE marque_id = ? 
      ORDER BY name ASC
    `, [marqueId]);
    res.json({ success: true, items: modeles });
  } catch (error) {
    console.error('❌ GET /api/marques/:id/modeles error:', error);
    res.status(500).json({ success: false, message: 'Erreur récupération modèles' });
  }
});

/**
 * GET /api/modeles - Récupérer tous les modèles
 */
router.get('/all', async (req, res) => {
  try {
    const modeles = await dbPromise.all(`
      SELECT mod.id, mod.name, mod.marque_id, m.name as marque_name
      FROM modeles mod
      LEFT JOIN marques m ON mod.marque_id = m.id
      ORDER BY m.name ASC, mod.name ASC
    `);
    res.json({ success: true, items: modeles });
  } catch (error) {
    console.error('❌ GET /api/modeles error:', error);
    res.status(500).json({ success: false, message: 'Erreur récupération modèles' });
  }
});

/**
 * POST /api/marques - Créer une nouvelle marque
 */
router.post('/', async (req, res) => {
  try {
    const { name } = req.body;
    
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Nom de marque requis' });
    }

    // Vérifier l'unicité
    const existing = await dbPromise.get(
      `SELECT id FROM marques WHERE LOWER(name) = LOWER(?)`,
      [name.trim()]
    );

    if (existing) {
      return res.status(409).json({ success: false, message: 'Cette marque existe déjà' });
    }

    const result = await dbPromise.run(
      `INSERT INTO marques (name) VALUES (?)`,
      [name.trim()]
    );

    res.json({ 
      success: true, 
      id: result.id, 
      name: name.trim(),
      message: 'Marque créée avec succès'
    });
  } catch (error) {
    console.error('❌ POST /api/marques error:', error);
    res.status(500).json({ success: false, message: 'Erreur création marque' });
  }
});

/**
 * POST /api/marques/:marqueId/modeles - Créer un nouveau modèle
 */
router.post('/:marqueId/modeles', async (req, res) => {
  try {
    const marqueId = parseInt(req.params.marqueId);
    const { name } = req.body;
    
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Nom de modèle requis' });
    }

    // Vérifier que la marque existe
    const marque = await dbPromise.get(
      `SELECT id FROM marques WHERE id = ?`,
      [marqueId]
    );

    if (!marque) {
      return res.status(404).json({ success: false, message: 'Marque non trouvée' });
    }

    // Vérifier l'unicité du modèle pour cette marque
    const existing = await dbPromise.get(
      `SELECT id FROM modeles WHERE LOWER(name) = LOWER(?) AND marque_id = ?`,
      [name.trim(), marqueId]
    );

    if (existing) {
      return res.status(409).json({ success: false, message: 'Ce modèle existe déjà pour cette marque' });
    }

    const result = await dbPromise.run(
      `INSERT INTO modeles (marque_id, name) VALUES (?, ?)`,
      [marqueId, name.trim()]
    );

    res.json({ 
      success: true, 
      id: result.id, 
      name: name.trim(),
      marque_id: marqueId,
      message: 'Modèle créé avec succès'
    });
  } catch (error) {
    console.error('❌ POST /api/marques/:id/modeles error:', error);
    res.status(500).json({ success: false, message: 'Erreur création modèle' });
  }
});

module.exports = router;
