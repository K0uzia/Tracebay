const express = require('express');
const { verifyToken } = require('../middleware/auth.js');
const db = require('../database.js').dbPromise;

const router = express.Router();

/**
 * GET /api/monitoring/stats
 * Retourner les statistiques du serveur
 */
router.get('/stats', verifyToken, async (req, res) => {
    try {
        const startTime = process.uptime();
        const memUsage = process.memoryUsage();
        
        // Compter les messages de chat
        const chatCount = await db.get('SELECT COUNT(*) as count FROM chat_messages');
        const userCount = await db.get('SELECT COUNT(*) as count FROM users');
        const eventCount = await db.get('SELECT COUNT(*) as count FROM events');

        res.json({
            success: true,
            stats: {
                uptime: Math.floor(startTime),
                memoryUsage: Math.round(memUsage.heapUsed / 1024 / 1024) + ' MB',
                totalUsers: userCount?.count || 0,
                totalEvents: eventCount?.count || 0,
                totalMessages: chatCount?.count || 0,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('❌ Erreur stats:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur récupération stats'
        });
    }
});

/**
 * GET /api/monitoring/logs
 * Retourner les logs récents (placeholder)
 */
router.get('/logs', verifyToken, async (req, res) => {
    try {
        res.json({
            success: true,
            logs: [
                { timestamp: new Date().toISOString(), level: 'info', message: 'Server monitoring enabled' }
            ]
        });
    } catch (error) {
        console.error('❌ Erreur logs:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur récupération logs'
        });
    }
});

module.exports = router;
