const express = require('express');
const db = require('../database.js');
const logger = require('../logger.js');

const router = express.Router();

function getUserId(req) {
    return req.headers['x-user-id'];
}

router.get('/categories', (req, res) => {
    const userId = getUserId(req);
    
    if (!userId) {
        return res.status(401).json({ 
            success: false, 
            message: 'Non authentifié' 
        });
    }

    db.all(
        'SELECT * FROM shortcut_categories WHERE user_id = ? ORDER BY position ASC',
        [userId],
        (err, categories) => {
            if (err) {
                logger.error('❌ Erreur récupération catégories:', err);
                return res.status(500).json({ 
                    success: false, 
                    message: 'Erreur serveur' 
                });
            }

            res.json({ 
                success: true, 
                categories 
            });
        }
    );
});

router.post('/categories', (req, res) => {
    const userId = getUserId(req);
    const { name } = req.body;

    if (!userId) {
        return res.status(401).json({ 
            success: false, 
            message: 'Non authentifié' 
        });
    }

    if (!name || name.trim().length === 0) {
        return res.status(400).json({ 
            success: false, 
            message: 'Le nom de la catégorie est requis' 
        });
    }

    db.get('SELECT MAX(position) as maxPos FROM shortcut_categories WHERE user_id = ?', [userId], (err, row) => {
        if (err) {
            logger.error('❌ Erreur récupération position:', err);
            return res.status(500).json({ 
                success: false, 
                message: 'Erreur serveur' 
            });
        }

        const position = (row.maxPos || 0) + 1;

        db.run(
            'INSERT INTO shortcut_categories (user_id, name, position) VALUES (?, ?, ?)',
            [userId, name.trim(), position],
            function(err) {
                if (err) {
                    logger.error('❌ Erreur création catégorie:', err);
                    return res.status(500).json({ 
                        success: false, 
                        message: 'Erreur création catégorie' 
                    });
                }

                logger.info(`✅ Catégorie créée: ${name} (ID: ${this.lastID})`);
                res.json({ 
                    success: true, 
                    category: {
                        id: this.lastID,
                        user_id: userId,
                        name: name.trim(),
                        position
                    }
                });
            }
        );
    });
});

router.delete('/categories/:id', (req, res) => {
    const userId = getUserId(req);
    const categoryId = req.params.id;

    if (!userId) {
        return res.status(401).json({ 
            success: false, 
            message: 'Non authentifié' 
        });
    }

    db.run(
        'DELETE FROM shortcut_categories WHERE id = ? AND user_id = ?',
        [categoryId, userId],
        function(err) {
            if (err) {
                logger.error('❌ Erreur suppression catégorie:', err);
                return res.status(500).json({ 
                    success: false, 
                    message: 'Erreur suppression catégorie' 
                });
            }

            logger.info(`✅ Catégorie supprimée: ID ${categoryId}`);
            res.json({ 
                success: true, 
                message: 'Catégorie supprimée' 
            });
        }
    );
});

router.get('/', (req, res) => {
    const userId = getUserId(req);
    
    if (!userId) {
        return res.status(401).json({ 
            success: false, 
            message: 'Non authentifié' 
        });
    }

    db.all(
        'SELECT * FROM shortcuts WHERE user_id = ? ORDER BY category_id, created_at ASC',
        [userId],
        (err, shortcuts) => {
            if (err) {
                logger.error('❌ Erreur récupération raccourcis:', err);
                return res.status(500).json({ 
                    success: false, 
                    message: 'Erreur serveur' 
                });
            }

            res.json({ 
                success: true, 
                shortcuts 
            });
        }
    );
});

router.post('/', (req, res) => {
    const userId = getUserId(req);
    const { category_id, name, url } = req.body;

    if (!userId) {
        return res.status(401).json({ 
            success: false, 
            message: 'Non authentifié' 
        });
    }

    if (!category_id || !name || !url) {
        return res.status(400).json({ 
            success: false, 
            message: 'Catégorie, nom et URL requis' 
        });
    }

    db.run(
        'INSERT INTO shortcuts (user_id, category_id, name, url) VALUES (?, ?, ?, ?)',
        [userId, category_id, name.trim(), url.trim()],
        function(err) {
            if (err) {
                logger.error('❌ Erreur création raccourci:', err);
                return res.status(500).json({ 
                    success: false, 
                    message: 'Erreur création raccourci' 
                });
            }

            logger.info(`✅ Raccourci créé: ${name} (ID: ${this.lastID})`);
            res.json({ 
                success: true, 
                shortcut: {
                    id: this.lastID,
                    user_id: userId,
                    category_id,
                    name: name.trim(),
                    url: url.trim()
                }
            });
        }
    );
});

router.delete('/:id', (req, res) => {
    const userId = getUserId(req);
    const shortcutId = req.params.id;

    if (!userId) {
        return res.status(401).json({ 
            success: false, 
            message: 'Non authentifié' 
        });
    }

    db.run(
        'DELETE FROM shortcuts WHERE id = ? AND user_id = ?',
        [shortcutId, userId],
        function(err) {
            if (err) {
                logger.error('❌ Erreur suppression raccourci:', err);
                return res.status(500).json({ 
                    success: false, 
                    message: 'Erreur suppression raccourci' 
                });
            }

            logger.info(`✅ Raccourci supprimé: ID ${shortcutId}`);
            res.json({ 
                success: true, 
                message: 'Raccourci supprimé' 
            });
        }
    );
});

module.exports = router;
