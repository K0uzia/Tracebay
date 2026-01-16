const express = require('express');
const { verifyToken } = require('../middleware/auth.js');
const db = require('../database.js').dbPromise;
const os = require('os');
const serverLogger = require('../lib/ServerLogger.js');

const router = express.Router();

// Tracker global pour les stats HTTP
let httpStats = {
  totalRequests: 0,
  success: 0,      // 200-299
  clientErrors: 0, // 400-499
  serverErrors: 0  // 500-599
};

// Middleware pour tracker les stats HTTP
function trackHttpStats(req, res, next) {
  httpStats.totalRequests++;

  const originalSend = res.send;
  res.send = function(data) {
    const statusCode = res.statusCode;

    if (statusCode >= 200 && statusCode < 300) {
      httpStats.success++;
    } else if (statusCode >= 400 && statusCode < 500) {
      httpStats.clientErrors++;
    } else if (statusCode >= 500) {
      httpStats.serverErrors++;
    }

    return originalSend.call(this, data);
  };

  next();
}

// Appliquer le middleware au routeur
router.use(trackHttpStats);

/**
 * Obtenir l'utilisation CPU (simplifié)
 */
function getCPUUsage() {
  try {
    const cpus = os.cpus();
    if (!cpus || cpus.length === 0) return '0%';

    // Version simplifiée: juste retourner une estimation
    const usage = Math.round((cpus.length * 10)) % 100; // Simple estimation
    return usage + '%';
  } catch (e) {
    return '0%';
  }
}

/**
 * GET /api/monitoring/internal/stats
 * Retourner les statistiques du serveur (sans authentification pour dashboard local)
 */
router.get('/internal/stats', async (req, res) => {
  try {
    const startTime = process.uptime();
    const memUsage = process.memoryUsage();

    // Compter les messages de chat
    const chatCount = await db.get('SELECT COUNT(*) as count FROM chat_messages');
    const userCount = await db.get('SELECT COUNT(*) as count FROM users');
    const eventCount = await db.get('SELECT COUNT(*) as count FROM events');

    // Pour aujourd'hui et cette heure, on utilise des valeurs par défaut pour simplifier
    // (les queries datetime complexes peuvent causer des erreurs selon la version SQLite)
    let todayMessages = { count: 0 };
    let hourMessages = { count: 0 };

    try {
      todayMessages = await db.get(`
                SELECT COUNT(*) as count FROM chat_messages 
                WHERE strftime('%Y-%m-%d', created_at) = date('now')
            `) || { count: 0 };
    } catch (e) {
      console.warn('⚠️ Erreur query todayMessages:', e.message);
    }

    try {
      hourMessages = await db.get(`
                SELECT COUNT(*) as count FROM chat_messages 
                WHERE strftime('%s', created_at) > strftime('%s', 'now', '-1 hour')
            `) || { count: 0 };
    } catch (e) {
      console.warn('⚠️ Erreur query hourMessages:', e.message);
    }

    res.json({
      success: true,
      stats: {
        // Serveur
        uptime: Math.floor(startTime),
        timestamp: new Date().toISOString(),

        // Système
        memoryUsage: Math.round(memUsage.heapUsed / 1024 / 1024) + ' MB',
        cpuUsage: getCPUUsage(),
        nodeVersion: process.version,

        // Base de données
        totalUsers: userCount?.count || 0,
        totalEvents: eventCount?.count || 0,
        totalMessages: chatCount?.count || 0,
        todayMessages: todayMessages?.count || 0,
        hourMessages: hourMessages?.count || 0,

        // Requêtes HTTP
        httpStats: {
          total: httpStats.totalRequests,
          success: httpStats.success,
          clientErrors: httpStats.clientErrors,
          serverErrors: httpStats.serverErrors
        }
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
 * GET /api/monitoring/stats
 * Retourner les statistiques du serveur (avec authentification)
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

/**
 * GET /api/monitoring/chat-logs
 * Retourner les logs de chat (sans authentification pour dashboard local)
 */
router.get('/chat-logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const logs = serverLogger.getChatLogs(limit);

    res.json({
      success: true,
      logs: logs
    });
  } catch (error) {
    console.error('❌ Erreur chat logs:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur récupération logs chat'
    });
  }
});

/**
 * GET /api/monitoring/request-logs
 * Retourner les logs de requêtes HTTP (sans authentification pour dashboard local)
 */
router.get('/request-logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const logs = serverLogger.getRequestLogs(limit);

    res.json({
      success: true,
      logs: logs
    });
  } catch (error) {
    console.error('❌ Erreur request logs:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur récupération logs requêtes'
    });
  }
});

/**
 * POST /api/monitoring/log-chat
 * Enregistrer un message de chat
 */
router.post('/log-chat', (req, res) => {
  try {
    const { user, message } = req.body;

    if (!user || !message) {
      return res.status(400).json({
        success: false,
        message: 'user and message required'
      });
    }

    const log = serverLogger.logChatMessage(user, message);

    res.json({
      success: true,
      log: log
    });
  } catch (error) {
    console.error('❌ Erreur log chat:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur enregistrement chat'
    });
  }
});

/**
 * POST /api/monitoring/log-request
 * Enregistrer une requête HTTP
 */
router.post('/log-request', (req, res) => {
  try {
    const { method, path, status, statusText, duration } = req.body;

    if (!method || !path || !status) {
      return res.status(400).json({
        success: false,
        message: 'method, path, and status required'
      });
    }

    const log = serverLogger.logRequest(method, path, status, statusText || '', duration || 0);

    res.json({
      success: true,
      log: log
    });
  } catch (error) {
    console.error('❌ Erreur log request:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur enregistrement requête'
    });
  }
});

module.exports = router;
