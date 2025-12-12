const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../database.js');
const logger = require('../logger.js');

const router = express.Router();
const SALT_ROUNDS = 10;

router.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Username et password requis' 
            });
        }

        if (username.length < 3 || username.length > 20) {
            return res.status(400).json({ 
                success: false, 
                message: 'Username doit contenir entre 3 et 20 caractères' 
            });
        }

        if (password.length < 6) {
            return res.status(400).json({ 
                success: false, 
                message: 'Password doit contenir au moins 6 caractères' 
            });
        }

        const usernameRegex = /^[a-zA-Z0-9_-]+$/;
        if (!usernameRegex.test(username)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Username invalide (lettres, chiffres, _ et - uniquement)' 
            });
        }

        db.get('SELECT id FROM users WHERE username = ?', [username], async (err, user) => {
            if (err) {
                logger.error('❌ Erreur vérification username:', err);
                return res.status(500).json({ 
                    success: false, 
                    message: 'Erreur serveur' 
                });
            }

            if (user) {
                return res.status(409).json({ 
                    success: false, 
                    message: 'Username déjà utilisé' 
                });
            }

            const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

            db.run(
                'INSERT INTO users (username, password_hash) VALUES (?, ?)',
                [username, passwordHash],
                function(err) {
                    if (err) {
                        logger.error('❌ Erreur création utilisateur:', err);
                        return res.status(500).json({ 
                            success: false, 
                            message: 'Erreur création compte' 
                        });
                    }

                    logger.info(`✅ Nouvel utilisateur créé: ${username} (ID: ${this.lastID})`);
                    res.json({ 
                        success: true, 
                        message: 'Compte créé avec succès',
                        user: {
                            id: this.lastID,
                            username
                        }
                    });
                }
            );
        });
    } catch (error) {
        logger.error('❌ Erreur register:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur serveur' 
        });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Username et password requis' 
            });
        }

        db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
            if (err) {
                logger.error('❌ Erreur recherche utilisateur:', err);
                return res.status(500).json({ 
                    success: false, 
                    message: 'Erreur serveur' 
                });
            }

            if (!user) {
                return res.status(401).json({ 
                    success: false, 
                    message: 'Username ou password incorrect' 
                });
            }

            const passwordValid = await bcrypt.compare(password, user.password_hash);

            if (!passwordValid) {
                return res.status(401).json({ 
                    success: false, 
                    message: 'Username ou password incorrect' 
                });
            }

            logger.info(`✅ Connexion réussie: ${username} (ID: ${user.id})`);
            res.json({ 
                success: true, 
                message: 'Connexion réussie',
                user: {
                    id: user.id,
                    username: user.username
                }
            });
        });
    } catch (error) {
        logger.error('❌ Erreur login:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur serveur' 
        });
    }
});

router.get('/verify', (req, res) => {
    const userId = req.headers['x-user-id'];

    if (!userId) {
        return res.status(401).json({ 
            success: false, 
            message: 'Non authentifié' 
        });
    }

    db.get('SELECT id, username FROM users WHERE id = ?', [userId], (err, user) => {
        if (err) {
            logger.error('❌ Erreur vérification utilisateur:', err);
            return res.status(500).json({ 
                success: false, 
                message: 'Erreur serveur' 
            });
        }

        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: 'Utilisateur invalide' 
            });
        }

        res.json({ 
            success: true, 
            user: {
                id: user.id,
                username: user.username
            }
        });
    });
});

module.exports = router;
