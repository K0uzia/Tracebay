const express = require('express');
const { verifyToken } = require('../middleware/auth.js');
const { dbPromise } = require('../database.js');

const router = express.Router();

/**
 * GET /api/shortcuts/categories
 * Récupérer les catégories de raccourcis de l'utilisateur
 */
router.get('/categories', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const categories = await dbPromise.all(
            'SELECT * FROM shortcut_categories WHERE user_id = ? ORDER BY position ASC',
            [userId]
        );

        res.json({ 
            success: true, 
            categories: categories || []
        });
    } catch (error) {
        console.error('❌ Erreur récupération catégories:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur serveur' 
        });
    }
});

/**
 * POST /api/shortcuts/categories
 * Créer une nouvelle catégorie
 */
router.post('/categories', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { name } = req.body;

        if (!name || name.trim().length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Le nom de la catégorie est requis' 
            });
        }

        const row = await dbPromise.get(
            'SELECT MAX(position) as maxPos FROM shortcut_categories WHERE user_id = ?',
            [userId]
        );

        const position = (row?.maxPos || 0) + 1;

        const result = await dbPromise.run(
            'INSERT INTO shortcut_categories (user_id, name, position) VALUES (?, ?, ?)',
            [userId, name.trim(), position]
        );

        console.log(`✅ Catégorie créée: ${name} (ID: ${result.lastID})`);
        res.json({ 
            success: true, 
            category: {
                id: result.lastID,
                user_id: userId,
                name: name.trim(),
                position
            }
        });
    } catch (error) {
        console.error('❌ Erreur création catégorie:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur création catégorie' 
        });
    }
});

/**
 * PUT /api/shortcuts/categories/:id
 * Mettre à jour une catégorie
 */
router.put('/categories/:id', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const categoryId = req.params.id;
        const { name } = req.body;

        if (!name || name.trim().length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Le nom de la catégorie est requis' 
            });
        }

        // Verify ownership
        const category = await dbPromise.get(
            'SELECT id FROM shortcut_categories WHERE id = ? AND user_id = ?',
            [categoryId, userId]
        );

        if (!category) {
            return res.status(404).json({ 
                success: false, 
                message: 'Catégorie non trouvée' 
            });
        }

        await dbPromise.run(
            'UPDATE shortcut_categories SET name = ? WHERE id = ?',
            [name.trim(), categoryId]
        );

        console.log(`✅ Catégorie mise à jour: ID ${categoryId}`);
        res.json({ 
            success: true, 
            message: 'Catégorie mise à jour'
        });
    } catch (error) {
        console.error('❌ Erreur mise à jour catégorie:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur serveur' 
        });
    }
});

/**
 * DELETE /api/shortcuts/categories/:id
 * Supprimer une catégorie
 */
router.delete('/categories/:id', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const categoryId = req.params.id;

        // Verify ownership
        const category = await dbPromise.get(
            'SELECT id FROM shortcut_categories WHERE id = ? AND user_id = ?',
            [categoryId, userId]
        );

        if (!category) {
            return res.status(404).json({ 
                success: false, 
                message: 'Catégorie non trouvée' 
            });
        }

        await dbPromise.run(
            'DELETE FROM shortcut_categories WHERE id = ?',
            [categoryId]
        );

        console.log(`✅ Catégorie supprimée: ID ${categoryId}`);
        res.json({ 
            success: true, 
            message: 'Catégorie supprimée' 
        });
    } catch (error) {
        console.error('❌ Erreur suppression catégorie:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur serveur' 
        });
    }
});

/**
 * GET /api/shortcuts
 * Récupérer tous les raccourcis de l'utilisateur
 */
router.get('/', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        
        const shortcuts = await dbPromise.all(
            'SELECT * FROM shortcuts WHERE user_id = ? ORDER BY category_id, position ASC',
            [userId]
        );

        res.json({ 
            success: true, 
            shortcuts: shortcuts || []
        });
    } catch (error) {
        console.error('❌ Erreur récupération raccourcis:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur serveur' 
        });
    }
});

/**
 * POST /api/shortcuts
 * Créer un nouveau raccourci
 */
router.post('/', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { category_id, name, url } = req.body;

        if (!category_id || !name || !url) {
            return res.status(400).json({ 
                success: false, 
                message: 'Catégorie, nom et URL requis' 
            });
        }

        // Verify category ownership
        const category = await dbPromise.get(
            'SELECT id FROM shortcut_categories WHERE id = ? AND user_id = ?',
            [category_id, userId]
        );

        if (!category) {
            return res.status(404).json({ 
                success: false, 
                message: 'Catégorie non trouvée' 
            });
        }

        // Get next position
        const lastShortcut = await dbPromise.get(
            'SELECT MAX(position) as maxPos FROM shortcuts WHERE category_id = ?',
            [category_id]
        );
        const nextPosition = (lastShortcut?.maxPos ?? -1) + 1;

        const result = await dbPromise.run(
            'INSERT INTO shortcuts (user_id, category_id, name, url, position) VALUES (?, ?, ?, ?, ?)',
            [userId, category_id, name.trim(), url.trim(), nextPosition]
        );

        console.log(`✅ Raccourci créé: ${name} (ID: ${result.lastID})`);
        res.json({ 
            success: true, 
            shortcut: {
                id: result.lastID,
                user_id: userId,
                category_id,
                name: name.trim(),
                url: url.trim(),
                position: nextPosition
            }
        });
    } catch (error) {
        console.error('❌ Erreur création raccourci:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur serveur' 
        });
    }
});

/**
 * PUT /api/shortcuts/reorder
 * Réorganiser les raccourcis dans une catégorie
 */
router.put('/reorder', verifyToken, async (req, res) => {
    try {
        console.log('🔄 PUT /api/shortcuts/reorder - Requête reçue');
        const userId = req.user.id;
        const { category_id, shortcut_ids } = req.body;
        console.log('📊 reorder params:', { userId, category_id, shortcut_ids });

        if (!category_id || !Array.isArray(shortcut_ids)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Category ID et shortcut IDs requis' 
            });
        }

        // Verify category ownership
        const category = await dbPromise.get(
            'SELECT id FROM shortcut_categories WHERE id = ? AND user_id = ?',
            [category_id, userId]
        );

        if (!category) {
            return res.status(404).json({ 
                success: false, 
                message: 'Catégorie non trouvée' 
            });
        }

        // Update the order (position) for each shortcut
        for (let i = 0; i < shortcut_ids.length; i++) {
            const shortcutId = shortcut_ids[i];
            
            // Verify ownership
            const shortcut = await dbPromise.get(
                'SELECT id FROM shortcuts WHERE id = ? AND user_id = ? AND category_id = ?',
                [shortcutId, userId, category_id]
            );

            if (shortcut) {
                await dbPromise.run(
                    'UPDATE shortcuts SET position = ? WHERE id = ?',
                    [i, shortcutId]
                );
            }
        }

        console.log(`✅ Raccourcis réorganisés pour la catégorie ${category_id}`);
        res.json({ 
            success: true, 
            message: 'Raccourcis réorganisés'
        });
    } catch (error) {
        console.error('❌ Erreur réorganisation raccourcis:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur serveur' 
        });
    }
});

/**
 * PUT /api/shortcuts/:id
 * Mettre à jour un raccourci
 */
router.put('/:id', verifyToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const shortcutId = req.params.id;
        let { name, url, category_id } = req.body;

        // Trim values
        if (name) name = name.trim();
        if (url) url = url.trim();

        if (!name && !url && !category_id) {
            return res.status(400).json({ 
                success: false, 
                message: 'Au moins un champ à mettre à jour est requis' 
            });
        }

        // Verify ownership
        const shortcut = await dbPromise.get(
            'SELECT id FROM shortcuts WHERE id = ? AND user_id = ?',
            [shortcutId, userId]
        );

        if (!shortcut) {
            return res.status(404).json({ 
                success: false, 
                message: 'Raccourci non trouvé' 
            });
        }

        // If category_id is provided, verify it exists
        if (category_id) {
            const cat = await dbPromise.get(
                'SELECT id FROM shortcut_categories WHERE id = ? AND user_id = ?',
                [category_id, userId]
            );

            if (!cat) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'Catégorie non trouvée' 
                });
            }
        }

        const updates = [];
        const values = [];

        if (name) {
            updates.push('name = ?');
            values.push(name);
        }
        if (url) {
            updates.push('url = ?');
            values.push(url);
        }
        if (category_id) {
            updates.push('category_id = ?');
            values.push(category_id);
        }

        values.push(shortcutId);

        await dbPromise.run(
            `UPDATE shortcuts SET ${updates.join(', ')} WHERE id = ?`,
            values
        );

        console.log(`✅ Raccourci mis à jour: ID ${shortcutId}`);
        res.json({ 
            success: true, 
            message: 'Raccourci mis à jour'
        });
    } catch (error) {
        console.error('❌ Erreur mise à jour raccourci:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur serveur' 
        });
    }
});
module.exports = router;
