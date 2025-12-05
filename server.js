/**
 * SERVER.JS - Serveur Express pour Workspace
 * Gère l'API et la base de données SQLite3
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const agendaRoutes = require('./routes/agenda.js');
const db = require('./database.js');
const { closeDatabase } = require('./database.js');

const app = express();
const PORT = process.env.PORT || 3000;
const isDev = process.argv.includes('--dev');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Routes API
app.use('/api/agenda', agendaRoutes);

/**
 * Health Check
 */
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

/**
 * Route racine
 */
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

/**
 * Servir les pages
 */
app.get('/:page', (req, res) => {
    const { page } = req.params;
    const filePath = path.join(__dirname, `public/pages/${page}.html`);
    res.sendFile(filePath, (err) => {
        if (err) {
            res.status(404).send('Page not found');
        }
    });
});

/**
 * 404 Handler
 */
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route non trouvée',
        path: req.path
    });
});

/**
 * Error Handler
 */
app.use((err, req, res, next) => {
    console.error('❌ Erreur serveur:', err);
    res.status(500).json({
        success: false,
        message: isDev ? err.message : 'Une erreur est survenue'
    });
});

/**
 * Démarrer le serveur
 */
const server = app.listen(PORT, () => {
    console.log(`
    🚀 Workspace 1.0 - Serveur lancé
    📍 http://localhost:${PORT}
    🔧 Mode: ${isDev ? 'développement' : 'production'}
    `);
});

/**
 * Gestion de l'arrêt gracieux
 */
process.on('SIGINT', async () => {
    console.log('\n⏹️  Arrêt du serveur...');
    server.close(async () => {
        await closeDatabase();
        process.exit(0);
    });
});

process.on('SIGTERM', async () => {
    console.log('\n⏹️  Arrêt du serveur (SIGTERM)...');
    server.close(async () => {
        await closeDatabase();
        process.exit(0);
    });
});

module.exports = app;

