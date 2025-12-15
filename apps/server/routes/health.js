const express = require('express');

const router = express.Router();

/**
 * GET /api/health
 * Health check endpoint pour la vérification de connexion client
 */
router.get('/', (req, res) => {
    res.json({
        success: true,
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        pid: process.pid
    });
});

module.exports = router;
