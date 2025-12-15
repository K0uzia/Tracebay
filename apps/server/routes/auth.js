const express = require('express');
const db = require('../database.js').dbPromise;
const { generateToken } = require('../lib/jwt.js');
const { hashPassword, comparePassword } = require('../lib/password.js');
const { verifyToken } = require('../middleware/auth.js');

const router = express.Router();

/**
 * POST /api/auth/register
 * Créer un nouveau compte utilisateur
 */
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

        // Vérifier si le username existe
        const existingUser = await db.get('SELECT id FROM users WHERE username = ?', [username]);
        
        if (existingUser) {
            return res.status(409).json({ 
                success: false, 
                message: 'Username déjà utilisé' 
            });
        }

        // Hasher le password
        const passwordHash = await hashPassword(password);

        // Créer l'utilisateur
        const result = await db.run(
            'INSERT INTO users (username, password_hash) VALUES (?, ?)',
            [username, passwordHash]
        );

        const user = {
            id: result.id,
            username
        };

        // Générer token JWT
        const token = generateToken(user);

        console.log(`✅ Nouvel utilisateur créé: ${username} (ID: ${result.id})`);
        
        res.json({ 
            success: true,
            message: 'Compte créé avec succès',
            user,
            token
        });
    } catch (error) {
        console.error('❌ Erreur register:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur serveur' 
        });
    }
});

/**
 * POST /api/auth/login
 * Authentifier un utilisateur et retourner un JWT
 */
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Username et password requis' 
            });
        }

        // Chercher l'utilisateur
        const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);

        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: 'Username ou password incorrect' 
            });
        }

        // Vérifier le password
        const passwordValid = await comparePassword(password, user.password_hash);

        if (!passwordValid) {
            return res.status(401).json({ 
                success: false, 
                message: 'Username ou password incorrect' 
            });
        }

        // Générer token JWT
        const userObj = {
            id: user.id,
            username: user.username
        };
        const token = generateToken(userObj);

        console.log(`✅ Connexion réussie: ${username} (ID: ${user.id})`);
        
        res.json({ 
            success: true,
            message: 'Connexion réussie',
            user: userObj,
            token
        });
    } catch (error) {
        console.error('❌ Erreur login:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur serveur' 
        });
    }
});

/**
 * GET /api/auth/verify
 * Vérifier le token JWT (nécessite Authorization header)
 */
router.get('/verify', verifyToken, async (req, res) => {
    try {
        // req.user est défini par le middleware verifyToken
        const user = await db.get('SELECT id, username FROM users WHERE id = ?', [req.user.id]);

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
    } catch (error) {
        console.error('❌ Erreur verify:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erreur serveur' 
        });
    }
});

module.exports = router;
