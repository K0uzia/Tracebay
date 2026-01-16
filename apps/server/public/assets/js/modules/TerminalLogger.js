/**
 * Terminal Logger Module
 * Gère les affichages de logs dans les terminaux (chat et requêtes)
 */

class TerminalLogger {
  constructor() {
    this.chatLogs = [];
    this.requestLogs = [];
    this.maxLogs = 500;
    this.initContainers();
  }

  initContainers() {
    this.chatContainer = document.getElementById('chat-logs-container');
    this.requestContainer = document.getElementById('requests-container');

    if (this.chatContainer) {
      // Vider le message par défaut
      this.chatContainer.innerHTML = '';
    }
    if (this.requestContainer) {
      this.requestContainer.innerHTML = '';
    }
  }

  /**
     * Ajouter un log de chat
     */
  addChatLog(user, message, timestamp = new Date()) {
    const time = timestamp.toLocaleTimeString('fr-FR');
    const logEntry = `[${time}] <${user}> ${message}`;

    this.chatLogs.push({
      timestamp: time,
      user: user,
      message: message,
      raw: logEntry
    });

    if (this.chatLogs.length > this.maxLogs) {
      this.chatLogs.shift();
    }

    this.renderChatLogs();
    console.log(`💬 Chat: ${logEntry}`);
  }

  /**
     * Ajouter un log de requête HTTP
     */
  addRequestLog(method, path, status, statusText, duration = 0) {
    const time = new Date().toLocaleTimeString('fr-FR');

    let statusColor = 'info';
    if (status >= 200 && status < 300) {
      statusColor = 'success';
    } else if (status >= 400 && status < 500) {
      statusColor = 'warning';
    } else if (status >= 500) {
      statusColor = 'error';
    }

    const methodColor = this.getMethodColor(method);
    const durationStr = duration > 0 ? ` [${duration}ms]` : '';
    const logEntry = `[${time}] ${method} ${path} → ${status} ${statusText}${durationStr}`;

    this.requestLogs.push({
      timestamp: time,
      method: method,
      path: path,
      status: status,
      statusText: statusText,
      duration: duration,
      statusColor: statusColor,
      methodColor: methodColor,
      raw: logEntry
    });

    if (this.requestLogs.length > this.maxLogs) {
      this.requestLogs.shift();
    }

    this.renderRequestLogs();
    console.log(`📡 Request: ${logEntry}`);
  }

  /**
     * Obtenir la couleur CSS pour une méthode HTTP
     */
  getMethodColor(method) {
    const colors = {
      'GET': 'request-get',
      'POST': 'request-post',
      'PUT': 'request-put',
      'DELETE': 'request-delete',
      'PATCH': 'request-put',
      'HEAD': 'request-get',
      'OPTIONS': 'info'
    };
    return colors[method] || 'info';
  }

  /**
     * Afficher les logs du chat
     */
  renderChatLogs() {
    if (!this.chatContainer) return;

    this.chatContainer.innerHTML = '';

    if (this.chatLogs.length === 0) {
      this.chatContainer.innerHTML = '<div class="terminal-line">$ En attente de messages...</div>';
      return;
    }

    this.chatLogs.forEach(log => {
      const div = document.createElement('div');
      div.className = 'terminal-line';
      div.textContent = log.raw;
      this.chatContainer.appendChild(div);
    });

    // Scroller en bas
    this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
  }

  /**
     * Afficher les logs des requêtes
     */
  renderRequestLogs() {
    if (!this.requestContainer) return;

    this.requestContainer.innerHTML = '';

    if (this.requestLogs.length === 0) {
      this.requestContainer.innerHTML = '<div class="terminal-line">$ En attente de requêtes...</div>';
      return;
    }

    this.requestLogs.forEach(log => {
      const div = document.createElement('div');
      div.className = `terminal-line ${log.methodColor} status-${Math.floor(log.status / 100) * 100}`;
      div.textContent = log.raw;
      this.requestContainer.appendChild(div);
    });

    // Scroller en bas
    this.requestContainer.scrollTop = this.requestContainer.scrollHeight;
  }

  /**
     * Effacer les logs du chat
     */
  clearChatLogs() {
    this.chatLogs = [];
    this.renderChatLogs();
    console.log('🗑️ Logs chat effacés');
  }

  /**
     * Effacer les logs des requêtes
     */
  clearRequestLogs() {
    this.requestLogs = [];
    this.renderRequestLogs();
    console.log('🗑️ Logs requêtes effacés');
  }

  /**
     * Effacer tous les logs
     */
  clearAllLogs() {
    this.clearChatLogs();
    this.clearRequestLogs();
  }
}

// Instance globale
window.terminalLogger = new TerminalLogger();

// Ajouter les event listeners pour les boutons "Effacer"
document.addEventListener('DOMContentLoaded', () => {
  const chatClearBtn = document.getElementById('chat-logs-clear');
  const requestsClearBtn = document.getElementById('requests-clear');

  if (chatClearBtn) {
    chatClearBtn.addEventListener('click', () => {
      window.terminalLogger.clearChatLogs();
    });
  }

  if (requestsClearBtn) {
    requestsClearBtn.addEventListener('click', () => {
      window.terminalLogger.clearRequestLogs();
    });
  }
});
