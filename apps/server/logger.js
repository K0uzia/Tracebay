/**
 * LOGGER.JS - Système de logging centralisé
 * Capture tous les erreurs, warnings et infos
 * Crée un nouveau fichier à chaque lancement
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

function resolveLogDir() {
    try {
        const { app } = require('electron');
        if (app && typeof app.getPath === 'function') {
            return path.join(app.getPath('userData'), 'logs');
        }
    } catch (_) {}
    const home = process.env.HOME || process.env.USERPROFILE;
    if (home) return path.join(home, '.workspace-server', 'logs');
    return path.join(process.cwd(), 'logs');
}

const LOG_DIR = resolveLogDir();
const LAUNCH_TIME = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + '_' + Date.now();
const LOG_FILE = path.join(LOG_DIR, `app-${LAUNCH_TIME}.log`);
const MAX_LOG_SIZE = 10 * 1024 * 1024;
const MAX_LOG_FILES = 3;

try {
    if (!fsSync.existsSync(LOG_DIR)) {
        fsSync.mkdirSync(LOG_DIR, { recursive: true });
        console.log(`✅ Répertoire logs créé: ${LOG_DIR}`);
    }
    
    const files = fsSync.readdirSync(LOG_DIR)
        .filter(f => f.startsWith('app-') && f.endsWith('.log') && f !== path.basename(LOG_FILE))
        .map(f => ({
            name: f,
            path: path.join(LOG_DIR, f),
            time: fsSync.statSync(path.join(LOG_DIR, f)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time);
    
    if (files.length >= MAX_LOG_FILES) {
        files.slice(MAX_LOG_FILES - 1).forEach(f => {
            try {
                fsSync.unlinkSync(f.path);
                console.log(`🗑️  Ancien log supprimé: ${f.name}`);
            } catch (e) {}
        });
    }
} catch (err) {
    console.error('⚠️  Impossible de gérer le répertoire logs:', err.message);
}

try {
    const separator = '\n============================================================\n';
    const startup = `🚀 DÉMARRAGE APPLICATION - ${new Date().toISOString()}\n`;
    fsSync.appendFileSync(LOG_FILE, separator + startup + separator, { encoding: 'utf8' });
} catch (err) {
    console.error('⚠️  Impossible d\'écrire le séparateur de démarrage:', err.message);
}

const LOG_LEVELS = {
    DEBUG: { color: '\x1b[36m', level: 'DEBUG' },
    INFO: { color: '\x1b[32m', level: 'INFO' },
    WARN: { color: '\x1b[33m', level: 'WARN' },
    ERROR: { color: '\x1b[31m', level: 'ERROR' },
    FATAL: { color: '\x1b[35m', level: 'FATAL' }
};
const RESET = '\x1b[0m';

function formatLog(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const levelStr = LOG_LEVELS[level].level;
    
    let logMessage = `[${timestamp}] [${levelStr}] ${message}`;
    if (data) {
        logMessage += '\n' + JSON.stringify(data, null, 2);
    }
    
    return logMessage;
}

function checkLogSize() {
    try {
        const stats = fsSync.statSync(LOG_FILE);
        if (stats.size > MAX_LOG_SIZE) {
            const warningMsg = `\n[${new Date().toISOString()}] ⚠️  Limite de taille atteinte (${(stats.size / 1024 / 1024).toFixed(2)}MB)\n`;
            fsSync.appendFileSync(LOG_FILE, warningMsg, { encoding: 'utf8' });
            return false;
        }
        return true;
    } catch {
        return true;
    }
}

function writeToFile(logMessage) {
    if (!checkLogSize()) return;
    
    fs.appendFile(LOG_FILE, logMessage + '\n', { encoding: 'utf8' })
        .catch(err => console.error('❌ Erreur écriture log file:', err.message));
}

function logConsole(level, message, data = null) {
    const { color } = LOG_LEVELS[level];
    const levelStr = LOG_LEVELS[level].level;
    const timestamp = new Date().toISOString();
    
    console.log(`${color}[${timestamp}] [${levelStr}]${RESET} ${message}`);
    if (data) {
        console.log(color, JSON.stringify(data, null, 2), RESET);
    }
}

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

process.on('error', (error) => {
    if (error.code === 'EPIPE') {
        logger.warn('⚠️  EPIPE Error (pipe fermée)', { code: error.code });
    } else {
        logger.error('Process Error', error);
    }
});

module.exports = logger;
