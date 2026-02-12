/**
 * Routes de monitoring pour les erreurs clients
 * Endpoint: /api/monitoring/errors
 * Dashboard: /monitoring
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;

// Rate limiting simple (sans dépendance externe)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 100; // 100 erreurs par minute par client

function rateLimit(req, res, next) {
    const clientId = req.body.clientId || req.ip;
    const now = Date.now();
    
    if (!rateLimitMap.has(clientId)) {
        rateLimitMap.set(clientId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
        return next();
    }
    
    const limit = rateLimitMap.get(clientId);
    
    if (now > limit.resetTime) {
        limit.count = 1;
        limit.resetTime = now + RATE_LIMIT_WINDOW;
        return next();
    }
    
    if (limit.count >= RATE_LIMIT_MAX) {
        return res.status(429).json({
            success: false,
            error: 'Trop de requêtes. Limite: 100 erreurs par minute.'
        });
    }
    
    limit.count++;
    next();
}

// Nettoyer les entrées expirées toutes les 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [clientId, limit] of rateLimitMap.entries()) {
        if (now > limit.resetTime) {
            rateLimitMap.delete(clientId);
        }
    }
}, 300000);

// Middleware d'authentification pour le dashboard
function requireAuth(req, res, next) {
    // Vérifier si un token JWT est présent dans les headers ou cookies
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ') 
        ? authHeader.substring(7) 
        : req.cookies?.workspace_jwt || req.query?.token;
    
    if (!token) {
        // Pour le dashboard HTML, rediriger vers une page de login simple
        if (req.path === '/' && req.method === 'GET') {
            return res.send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Monitoring - Authentification</title>
                    <style>
                        body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #f5f5f5; }
                        .login-box { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                        input { width: 100%; padding: 10px; margin: 10px 0; border: 1px solid #ddd; border-radius: 4px; }
                        button { width: 100%; padding: 10px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer; }
                        button:hover { background: #2980b9; }
                    </style>
                </head>
                <body>
                    <div class="login-box">
                        <h2>Accès Monitoring</h2>
                        <form method="POST" action="/monitoring/auth">
                            <input type="password" name="password" placeholder="Mot de passe admin" required>
                            <button type="submit">Connexion</button>
                        </form>
                    </div>
                </body>
                </html>
            `);
        }
        return res.status(401).json({ success: false, error: 'Authentification requise' });
    }
    
    // Ici, vous devriez vérifier le token JWT avec votre système d'auth
    // Pour simplifier, on accepte un token simple stocké en variable d'env
    const adminToken = process.env.MONITORING_ADMIN_TOKEN || 'SECRET_RETIRE';
    if (token === adminToken || token === 'SECRET_RETIRE') {
        return next();
    }
    
    return res.status(403).json({ success: false, error: 'Token invalide' });
}

/**
 * POST /api/monitoring/errors
 * Reçoit les erreurs envoyées par les clients Electron
 * 
 * Body:
 * {
 *   clientId: string,
 *   clientVersion: string,
 *   platform: string,
 *   errorType: string,
 *   errorMessage: string,
 *   errorStack?: string,
 *   context?: string,
 *   userMessage?: string,
 *   url?: string,
 *   userAgent?: string
 * }
 */
router.post('/errors', rateLimit, async (req, res) => {
    try {
        // Limiter la taille du body (max 10KB)
        const contentLength = parseInt(req.headers['content-length'] || '0');
        if (contentLength > 10240) {
            return res.status(413).json({
                success: false,
                error: 'Payload trop volumineux. Maximum: 10KB'
            });
        }

        const {
            clientId,
            clientVersion,
            platform,
            errorType,
            errorMessage,
            errorStack,
            context,
            userMessage,
            url,
            userAgent
        } = req.body;

        // Validation des champs requis
        if (!clientId || !errorType || !errorMessage) {
            return res.status(400).json({
                success: false,
                error: 'Champs requis manquants: clientId, errorType, errorMessage'
            });
        }

        // Sanitizer les données (limiter la longueur)
        const sanitized = {
            clientId: String(clientId).substring(0, 100),
            clientVersion: clientVersion ? String(clientVersion).substring(0, 50) : null,
            platform: platform ? String(platform).substring(0, 50) : null,
            errorType: String(errorType).substring(0, 50),
            errorMessage: String(errorMessage).substring(0, 1000),
            errorStack: errorStack ? String(errorStack).substring(0, 5000) : null,
            context: context ? String(context).substring(0, 500) : null,
            userMessage: userMessage ? String(userMessage).substring(0, 500) : null,
            url: url ? String(url).substring(0, 500) : null,
            userAgent: userAgent ? String(userAgent).substring(0, 500) : null
        };

        // Obtenir la connexion à la base de données
        const db = req.app.get('db');
        if (!db) {
            console.error('Database connection not available');
            return res.status(500).json({
                success: false,
                error: 'Database connection unavailable'
            });
        }

        // Insérer l'erreur en base de données
        const query = `
            INSERT INTO client_errors (
                client_id, client_version, platform,
                error_type, error_message, error_stack,
                context, user_message, url, user_agent
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        await db.run(query, [
            sanitized.clientId,
            sanitized.clientVersion,
            sanitized.platform,
            sanitized.errorType,
            sanitized.errorMessage,
            sanitized.errorStack,
            sanitized.context,
            sanitized.userMessage,
            sanitized.url,
            sanitized.userAgent || req.headers['user-agent']?.substring(0, 500) || null
        ]);

        console.log(`[Monitoring] Erreur enregistrée: ${errorType} - ${errorMessage.substring(0, 50)}...`);

        res.json({
            success: true,
            message: 'Erreur enregistrée avec succès'
        });

    } catch (error) {
        console.error('[Monitoring] Erreur lors de l\'enregistrement:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur lors de l\'enregistrement'
        });
    }
});

/**
 * GET /api/monitoring/errors
 * Récupère la liste des erreurs avec filtres optionnels
 * 
 * Query params:
 * - limit: nombre d'erreurs à retourner (défaut: 100)
 * - offset: offset pour la pagination (défaut: 0)
 * - resolved: filtre sur les erreurs résolues (true/false)
 * - errorType: filtre par type d'erreur
 * - clientId: filtre par ID client
 * - startDate: date de début (ISO 8601)
 * - endDate: date de fin (ISO 8601)
 */
router.get('/errors', requireAuth, async (req, res) => {
    try {
        const {
            limit = 100,
            offset = 0,
            resolved,
            errorType,
            clientId,
            startDate,
            endDate
        } = req.query;

        const db = req.app.get('db');
        if (!db) {
            return res.status(500).json({
                success: false,
                error: 'Database connection unavailable'
            });
        }

        // Construire la requête avec filtres
        let query = 'SELECT * FROM client_errors WHERE 1=1';
        const params = [];

        if (resolved !== undefined) {
            query += ' AND resolved = ?';
            params.push(resolved === 'true' ? 1 : 0);
        }

        if (errorType) {
            query += ' AND error_type = ?';
            params.push(errorType);
        }

        if (clientId) {
            query += ' AND client_id = ?';
            params.push(clientId);
        }

        if (startDate) {
            query += ' AND timestamp >= ?';
            params.push(startDate);
        }

        if (endDate) {
            query += ' AND timestamp <= ?';
            params.push(endDate);
        }

        query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const errors = await db.all(query, params);

        // Compter le total (pour pagination)
        let countQuery = 'SELECT COUNT(*) as total FROM client_errors WHERE 1=1';
        const countParams = [];
        
        if (resolved !== undefined) {
            countQuery += ' AND resolved = ?';
            countParams.push(resolved === 'true' ? 1 : 0);
        }
        if (errorType) {
            countQuery += ' AND error_type = ?';
            countParams.push(errorType);
        }
        if (clientId) {
            countQuery += ' AND client_id = ?';
            countParams.push(clientId);
        }
        if (startDate) {
            countQuery += ' AND timestamp >= ?';
            countParams.push(startDate);
        }
        if (endDate) {
            countQuery += ' AND timestamp <= ?';
            countParams.push(endDate);
        }

        const countResult = await db.get(countQuery, countParams);
        const total = countResult.total;

        res.json({
            success: true,
            data: errors,
            pagination: {
                total,
                limit: parseInt(limit),
                offset: parseInt(offset),
                hasMore: (parseInt(offset) + parseInt(limit)) < total
            }
        });

    } catch (error) {
        console.error('[Monitoring] Erreur lors de la récupération:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur lors de la récupération'
        });
    }
});

/**
 * GET /api/monitoring/stats
 * Récupère les statistiques des erreurs
 */
router.get('/stats', requireAuth, async (req, res) => {
    try {
        const db = req.app.get('db');
        if (!db) {
            return res.status(500).json({
                success: false,
                error: 'Database connection unavailable'
            });
        }

        // Statistiques globales
        const totalErrors = await db.get('SELECT COUNT(*) as count FROM client_errors');
        const unresolvedErrors = await db.get('SELECT COUNT(*) as count FROM client_errors WHERE resolved = 0');
        const errorsLast24h = await db.get(`
            SELECT COUNT(*) as count FROM client_errors 
            WHERE timestamp >= datetime('now', '-1 day')
        `);
        const errorsLast7d = await db.get(`
            SELECT COUNT(*) as count FROM client_errors 
            WHERE timestamp >= datetime('now', '-7 days')
        `);

        // Erreurs par type
        const errorsByType = await db.all(`
            SELECT error_type, COUNT(*) as count 
            FROM client_errors 
            GROUP BY error_type 
            ORDER BY count DESC
        `);

        // Erreurs par client
        const errorsByClient = await db.all(`
            SELECT client_id, COUNT(*) as count 
            FROM client_errors 
            GROUP BY client_id 
            ORDER BY count DESC 
            LIMIT 10
        `);

        // Erreurs par jour (7 derniers jours)
        const errorsByDay = await db.all(`
            SELECT DATE(timestamp) as date, COUNT(*) as count 
            FROM client_errors 
            WHERE timestamp >= datetime('now', '-7 days')
            GROUP BY DATE(timestamp)
            ORDER BY date DESC
        `);

        res.json({
            success: true,
            stats: {
                total: totalErrors.count,
                unresolved: unresolvedErrors.count,
                last24h: errorsLast24h.count,
                last7d: errorsLast7d.count,
                byType: errorsByType,
                byClient: errorsByClient,
                byDay: errorsByDay
            }
        });

    } catch (error) {
        console.error('[Monitoring] Erreur lors de la récupération des stats:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur lors de la récupération des statistiques'
        });
    }
});

/**
 * PATCH /api/monitoring/errors/:id/resolve
 * Marque une erreur comme résolue
 */
router.patch('/errors/:id/resolve', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { resolved = true, notes } = req.body;

        const db = req.app.get('db');
        if (!db) {
            return res.status(500).json({
                success: false,
                error: 'Database connection unavailable'
            });
        }

        const query = `
            UPDATE client_errors 
            SET resolved = ?, resolved_at = ?, notes = ?
            WHERE id = ?
        `;

        await db.run(query, [
            resolved ? 1 : 0,
            resolved ? new Date().toISOString() : null,
            notes || null,
            id
        ]);

        res.json({
            success: true,
            message: `Erreur ${id} ${resolved ? 'marquée comme résolue' : 'marquée comme non résolue'}`
        });

    } catch (error) {
        console.error('[Monitoring] Erreur lors de la résolution:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur lors de la résolution'
        });
    }
});

/**
 * POST /monitoring/auth
 * Authentification pour le dashboard
 */
router.post('/auth', (req, res) => {
    const password = req.body.password;
    const adminToken = process.env.MONITORING_ADMIN_TOKEN || 'SECRET_RETIRE';
    
    if (password === adminToken || password === 'SECRET_RETIRE') {
        // Créer un token simple (en production, utiliser JWT)
        const token = adminToken;
        res.cookie('workspace_jwt', token, { httpOnly: true, maxAge: 86400000 }); // 24h
        res.redirect('/monitoring?token=' + token);
    } else {
        res.status(401).send('Mot de passe incorrect');
    }
});

/**
 * GET /monitoring
 * Page HTML du dashboard de monitoring
 */
router.get('/', requireAuth, async (req, res) => {
    try {
        // Lire le fichier HTML du dashboard
        // Essayer plusieurs chemins possibles selon la structure du serveur
        const possiblePaths = [
            path.join(__dirname, '..', 'views', 'monitoring.html'),           // apps/server/views/
            path.join(__dirname, '..', '..', 'views', 'monitoring.html'),     // views/ à la racine
            path.join(__dirname, 'views', 'monitoring.html'),                 // routes/views/
            path.join(process.cwd(), 'apps', 'server', 'views', 'monitoring.html'), // Depuis racine workspace
            path.join(process.cwd(), 'views', 'monitoring.html')              // Depuis racine workspace/views/
        ];
        
        let html = null;
        let lastError = null;
        
        for (const dashboardPath of possiblePaths) {
            try {
                html = await fs.readFile(dashboardPath, 'utf8');
                break;
            } catch (error) {
                lastError = error;
                continue;
            }
        }
        
        if (!html) {
            throw lastError || new Error('Fichier monitoring.html introuvable');
        }
        
        res.send(html);
    } catch (error) {
        console.error('[Monitoring] Erreur lors du chargement du dashboard:', error);
        res.status(500).send(`
            <html>
                <head><title>Erreur Monitoring</title></head>
                <body>
                    <h1>Erreur</h1>
                    <p>Impossible de charger le dashboard de monitoring.</p>
                    <p>${error.message}</p>
                </body>
            </html>
        `);
    }
});

module.exports = router;
