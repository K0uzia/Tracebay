/**
 * CHAT-LOGGER.JS - Logger spécialisé pour les messages et événements du chat
 * Crée un nouveau fichier à chaque lancement de l'application
 * Enregistre: connexions, déconnexions, pseudos, messages, erreurs
 */

const fs = require('fs');
const path = require('path');

// Répertoire de logs pour le chat
// Utiliser le répertoire du projet (même répertoire que le script)
const CHAT_LOG_DIR = path.join(__dirname, 'logs', 'chat');

// Créer un nom de fichier unique avec timestamp de lancement
const LAUNCH_TIME = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + '_' + Date.now();
const CHAT_LOG_FILE = path.join(CHAT_LOG_DIR, `chat-${LAUNCH_TIME}.log`);

// Créer le répertoire si nécessaire
try {
    if (!fs.existsSync(CHAT_LOG_DIR)) {
        fs.mkdirSync(CHAT_LOG_DIR, { recursive: true });
        console.log(`✅ Répertoire chat logs créé: ${CHAT_LOG_DIR}`);
    }
    
    // Nettoyer les anciens fichiers de log (garder seulement les 3 derniers)
    // On exclut le fichier courant (qui vient d'être créé)
    const files = fs.readdirSync(CHAT_LOG_DIR)
        .filter(f => f.startsWith('chat-') && f.endsWith('.log') && f !== path.basename(CHAT_LOG_FILE))
        .sort();
    
    // Garder seulement les 2 anciens (+ le nouveau qui va être créé = 3 total)
    if (files.length > 2) {
        files.slice(0, -2).forEach(f => {
            try {
                fs.unlinkSync(path.join(CHAT_LOG_DIR, f));
                console.log(`🗑️  Ancien log chat supprimé: ${f}`);
            } catch (e) {
                // Ignorer les erreurs de suppression
            }
        });
    }
} catch (err) {
    console.error('⚠️  Impossible de gérer le répertoire chat logs:', err.message);
}

// Log du démarrage du chat-logger
try {
    const startEntry = `\n${'='.repeat(60)}\n[${new Date().toISOString()}] 🚀 Démarrage du chat-logger\n${'='.repeat(60)}\n`;
    fs.appendFileSync(CHAT_LOG_FILE, startEntry, { encoding: 'utf8' });
} catch (e) {
    console.error('❌ Erreur écriture démarrage chat log:', e.message);
}

/**
 * Logger pour les messages du chat
 */
const chatLogger = {
    /**
     * Enregistrer un nouveau message
     */
    logMessage: (pseudo, message, timestamp = new Date().toISOString()) => {
        try {
            const logEntry = `[${timestamp}] 💬 ${pseudo}: ${message}\n`;
            fs.appendFileSync(CHAT_LOG_FILE, logEntry, { encoding: 'utf8' });
        } catch (err) {
            console.error('❌ Erreur écriture chat log:', err.message);
        }
    },

    /**
     * Enregistrer un événement du chat (connexion, déconnexion, etc)
     */
    logEvent: (event, details = '', timestamp = new Date().toISOString()) => {
        try {
            const logEntry = `[${timestamp}] 📌 [${event}] ${details}\n`;
            fs.appendFileSync(CHAT_LOG_FILE, logEntry, { encoding: 'utf8' });
        } catch (err) {
            console.error('❌ Erreur écriture chat log:', err.message);
        }
    },

    /**
     * Enregistrer une connexion utilisateur
     */
    logConnection: (pseudo, clientIP = '', timestamp = new Date().toISOString()) => {
        try {
            const logEntry = `[${timestamp}] ✅ CONNEXION: ${pseudo} ${clientIP ? `(${clientIP})` : ''}\n`;
            fs.appendFileSync(CHAT_LOG_FILE, logEntry, { encoding: 'utf8' });
        } catch (err) {
            console.error('❌ Erreur écriture log connexion:', err.message);
        }
    },

    /**
     * Enregistrer une déconnexion utilisateur
     */
    logDisconnection: (pseudo, timestamp = new Date().toISOString()) => {
        try {
            const logEntry = `[${timestamp}] ❌ DÉCONNEXION: ${pseudo}\n`;
            fs.appendFileSync(CHAT_LOG_FILE, logEntry, { encoding: 'utf8' });
        } catch (err) {
            console.error('❌ Erreur écriture log déconnexion:', err.message);
        }
    },

    /**
     * Enregistrer un changement de pseudo
     */
    logPseudoChange: (oldPseudo, newPseudo, timestamp = new Date().toISOString()) => {
        try {
            const logEntry = `[${timestamp}] 🔄 PSEUDO CHANGÉ: ${oldPseudo} → ${newPseudo}\n`;
            fs.appendFileSync(CHAT_LOG_FILE, logEntry, { encoding: 'utf8' });
        } catch (err) {
            console.error('❌ Erreur écriture log changement pseudo:', err.message);
        }
    },

    /**
     * Enregistrer une erreur
     */
    logError: (error, context = '', timestamp = new Date().toISOString()) => {
        try {
            const logEntry = `[${timestamp}] ⚠️  [ERREUR] ${context}: ${error}\n`;
            fs.appendFileSync(CHAT_LOG_FILE, logEntry, { encoding: 'utf8' });
        } catch (err) {
            console.error('❌ Erreur écriture chat error log:', err.message);
        }
    },

    /**
     * Enregistrer une action WebSocket
     */
    logWebSocketAction: (action, pseudo, details = '', timestamp = new Date().toISOString()) => {
        try {
            const logEntry = `[${timestamp}] 🔌 [WS] ${action} - ${pseudo} ${details ? `(${details})` : ''}\n`;
            fs.appendFileSync(CHAT_LOG_FILE, logEntry, { encoding: 'utf8' });
        } catch (err) {
            console.error('❌ Erreur écriture log WS:', err.message);
        }
    }
};

module.exports = chatLogger;
