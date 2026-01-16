const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

const CHAT_LOG_DIR = path.join(__dirname, 'logs', 'chat');
const LAUNCH_TIME = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + '_' + Date.now();
const CHAT_LOG_FILE = path.join(CHAT_LOG_DIR, `chat-${LAUNCH_TIME}.log`);
const MAX_LOG_SIZE = 10 * 1024 * 1024;
const MAX_LOG_FILES = 3;

try {
  if (!fsSync.existsSync(CHAT_LOG_DIR)) {
    fsSync.mkdirSync(CHAT_LOG_DIR, { recursive: true });
    console.log(`✅ Répertoire chat logs créé: ${CHAT_LOG_DIR}`);
  }

  const files = fsSync.readdirSync(CHAT_LOG_DIR)
    .filter(f => f.startsWith('chat-') && f.endsWith('.log') && f !== path.basename(CHAT_LOG_FILE))
    .map(f => ({
      name: f,
      path: path.join(CHAT_LOG_DIR, f),
      time: fsSync.statSync(path.join(CHAT_LOG_DIR, f)).mtime.getTime()
    }))
    .sort((a, b) => b.time - a.time);

  if (files.length >= MAX_LOG_FILES) {
    files.slice(MAX_LOG_FILES - 1).forEach(f => {
      try {
        fsSync.unlinkSync(f.path);
        console.log(`🗑️  Ancien log chat supprimé: ${f.name}`);
      } catch (e) {}
    });
  }
} catch (err) {
  console.error('⚠️  Impossible de gérer le répertoire chat logs:', err.message);
}

try {
  const startEntry = `\n${'='.repeat(60)}\n[${new Date().toISOString()}] 🚀 Démarrage du chat-logger\n${'='.repeat(60)}\n`;
  fsSync.appendFileSync(CHAT_LOG_FILE, startEntry, { encoding: 'utf8' });
} catch (e) {
  console.error('❌ Erreur écriture démarrage chat log:', e.message);
}

function checkLogSize() {
  try {
    const stats = fsSync.statSync(CHAT_LOG_FILE);
    if (stats.size > MAX_LOG_SIZE) {
      const warningMsg = `\n[${new Date().toISOString()}] ⚠️  Limite de taille atteinte (${(stats.size / 1024 / 1024).toFixed(2)}MB)\n`;
      fsSync.appendFileSync(CHAT_LOG_FILE, warningMsg, { encoding: 'utf8' });
      return false;
    }
    return true;
  } catch {
    return true;
  }
}

function writeToFile(logEntry) {
  if (!checkLogSize()) return;

  fs.appendFile(CHAT_LOG_FILE, logEntry, { encoding: 'utf8' })
    .catch(err => console.error('❌ Erreur écriture chat log:', err.message));
}

const chatLogger = {
  logMessage: (pseudo, message, timestamp = new Date().toISOString()) => {
    const logEntry = `[${timestamp}] 💬 ${pseudo}: ${message}\n`;
    writeToFile(logEntry);
  },

  logEvent: (event, details = '', timestamp = new Date().toISOString()) => {
    const logEntry = `[${timestamp}] 📌 [${event}] ${details}\n`;
    writeToFile(logEntry);
  },

  logConnection: (pseudo, clientIP = '', timestamp = new Date().toISOString()) => {
    const logEntry = `[${timestamp}] ✅ CONNEXION: ${pseudo} ${clientIP ? `(${clientIP})` : ''}\n`;
    writeToFile(logEntry);
  },

  logDisconnection: (pseudo, timestamp = new Date().toISOString()) => {
    const logEntry = `[${timestamp}] ❌ DÉCONNEXION: ${pseudo}\n`;
    writeToFile(logEntry);
  },

  logPseudoChange: (oldPseudo, newPseudo, timestamp = new Date().toISOString()) => {
    const logEntry = `[${timestamp}] 🔄 PSEUDO CHANGÉ: ${oldPseudo} → ${newPseudo}\n`;
    writeToFile(logEntry);
  },

  logError: (error, context = '', timestamp = new Date().toISOString()) => {
    const logEntry = `[${timestamp}] ⚠️  [ERREUR] ${context}: ${error}\n`;
    writeToFile(logEntry);
  },

  logWebSocketAction: (action, pseudo, details = '', timestamp = new Date().toISOString()) => {
    const logEntry = `[${timestamp}] 🔌 [WS] ${action} - ${pseudo} ${details ? `(${details})` : ''}\n`;
    writeToFile(logEntry);
  }
};

module.exports = chatLogger;
