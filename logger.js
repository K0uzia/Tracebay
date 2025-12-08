/**
 * LOGGER.JS - Système de logging centralisé
 * Capture tous les erreurs, warnings et infos
 * Crée un nouveau fichier à chaque lancement
 */

const fs = require('fs');
const path = require('path');

// Déterminer le répertoire de logs
// Utiliser le répertoire du projet (même répertoire que le script)
let LOG_DIR = path.join(__dirname, 'logs');

// Créer un nom de fichier unique avec timestamp de lancement
const LAUNCH_TIME = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + '_' + Date.now();
const LOG_FILE = path.join(LOG_DIR, `app-${LAUNCH_TIME}.log`);

// Créer le répertoire logs s'il n'existe pas
try {
    if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, { recursive: true });
        console.log(`✅ Répertoire logs créé: ${LOG_DIR}`);
    }
    
    // Nettoyer les anciens fichiers de log (garder seulement les 3 derniers)
    // On exclut le fichier courant (qui vient d'être créé)
    const files = fs.readdirSync(LOG_DIR)
        .filter(f => f.startsWith('app-') && f.endsWith('.log') && f !== path.basename(LOG_FILE))
        .sort();
    
    // Garder seulement les 2 anciens (+ le nouveau qui va être créé = 3 total)
    if (files.length > 2) {
        files.slice(0, -2).forEach(f => {
            try {
                fs.unlinkSync(path.join(LOG_DIR, f));
                console.log(`🗑️  Ancien log supprimé: ${f}`);
            } catch (e) {
                // Ignorer les erreurs de suppression
            }
        });
    }
} catch (err) {
    console.error('⚠️  Impossible de gérer le répertoire logs:', err.message);
}

// Écrire un séparateur au démarrage du fichier log
try {
    fs.appendFileSync(LOG_FILE, '\n============================================================\n', { encoding: 'utf8' });
    fs.appendFileSync(LOG_FILE, `🚀 DÉMARRAGE APPLICATION - ${new Date().toISOString()}\n`, { encoding: 'utf8' });
    fs.appendFileSync(LOG_FILE, '============================================================\n', { encoding: 'utf8' });
} catch (err) {
    console.error('⚠️  Impossible d\'écrire le séparateur de démarrage:', err.message);
}

// Types de logs avec couleurs
const LOG_LEVELS = {
    DEBUG: { color: '\x1b[36m', level: 'DEBUG' },    // Cyan
    INFO: { color: '\x1b[32m', level: 'INFO' },      // Green
    WARN: { color: '\x1b[33m', level: 'WARN' },      // Yellow
    ERROR: { color: '\x1b[31m', level: 'ERROR' },    // Red
    FATAL: { color: '\x1b[35m', level: 'FATAL' }     // Magenta
};

const RESET = '\x1b[0m';

/**
 * Formatter les logs avec timestamp
 */
function formatLog(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const levelStr = LOG_LEVELS[level].level;
    
    let logMessage = `[${timestamp}] [${levelStr}] ${message}`;
    if (data) {
        logMessage += '\n' + JSON.stringify(data, null, 2);
    }
    
    return logMessage;
}

/**
 * Écrire dans le fichier log
 */
function writeToFile(logMessage) {
    try {
        fs.appendFileSync(LOG_FILE, logMessage + '\n', { encoding: 'utf8' });
    } catch (err) {
        console.error('❌ Erreur écriture log file:', err.message);
    }
}

/**
 * Logger avec couleur dans la console
 */
function logConsole(level, message, data = null) {
    const { color } = LOG_LEVELS[level];
    const levelStr = LOG_LEVELS[level].level;
    const timestamp = new Date().toISOString();
    
    console.log(`${color}[${timestamp}] [${levelStr}]${RESET} ${message}`);
    if (data) {
        console.log(color, JSON.stringify(data, null, 2), RESET);
    }
}

/**
 * Logger principal
 */
const logger = {
    debug: (message, data = null) => {
        const log = formatLog('DEBUG', message, data);
        logConsole('DEBUG', message, data);
        writeToFile(log);
    },
    
    info: (message, data = null) => {
        const log = formatLog('INFO', message, data);
        logConsole('INFO', message, data);
        writeToFile(log);
    },
    
    warn: (message, data = null) => {
        const log = formatLog('WARN', message, data);
        logConsole('WARN', message, data);
        writeToFile(log);
    },
    
    error: (message, error = null) => {
        const errorData = error ? {
            message: error.message,
            stack: error.stack,
            code: error.code
        } : null;
        const log = formatLog('ERROR', message, errorData);
        logConsole('ERROR', message, errorData);
        writeToFile(log);
    },
    
    fatal: (message, error = null) => {
        const errorData = error ? {
            message: error.message,
            stack: error.stack,
            code: error.code
        } : null;
        const log = formatLog('FATAL', message, errorData);
        logConsole('FATAL', message, errorData);
        writeToFile(log);
    }
};

/**
 * Capturer les erreurs non gérées
 */
process.on('uncaughtException', (error) => {
    logger.fatal('💥 Uncaught Exception', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.fatal('💥 Unhandled Promise Rejection', {
        reason: reason?.message || reason,
        promise: promise.toString()
    });
});

/**
 * Capturer les erreurs EPIPE et autres
 */
process.on('error', (error) => {
    if (error.code === 'EPIPE') {
        logger.warn('⚠️  EPIPE Error (pipe fermée)', { code: error.code });
    } else {
        logger.error('Process Error', error);
    }
});

module.exports = logger;
