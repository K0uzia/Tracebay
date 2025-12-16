/**
 * SERVER MONITOR - Monitoring temps réel du serveur
 * Connexion WebSocket et mise à jour du dashboard
 */

class ServerMonitor {
    constructor() {
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectInterval = 3000;
        this.stats = {
            totalRequests: 0,
            successCount: 0,
            clientErrors: 0,
            serverErrors: 0,
            totalMessages: 0,
            todayMessages: 0,
            hourMessages: 0,
            clients: [],
            logs: []
        };
        
        this.init();
    }

    /**
     * Initialiser la connexion WebSocket
     */
    init() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//localhost:8060`;
        
        try {
            this.ws = new WebSocket(wsUrl);
            
            this.ws.addEventListener('open', () => this.onOpen());
            this.ws.addEventListener('message', (e) => this.onMessage(e));
            this.ws.addEventListener('error', (e) => this.onError(e));
            this.ws.addEventListener('close', () => this.onClose());
        } catch (err) {
            console.error('❌ Erreur WebSocket:', err);
            this.schedulereconnect();
        }
    }

    /**
     * Connexion établie
     */
    onOpen() {
        console.log('✅ Connecté au serveur WebSocket');
        this.reconnectAttempts = 0;
        this.updateStatus('EN LIGNE');
        
        // Envoyer message d'auth si nécessaire
        this.sendMessage({
            type: 'monitor',
            action: 'subscribe'
        });
        
        // Récupérer les stats initiales
        this.fetchStats();
        
        // Rafraîchir les stats toutes les 2 secondes
        if (this.statsInterval) clearInterval(this.statsInterval);
        this.statsInterval = setInterval(() => this.fetchStats(), 2000);
    }

    /**
     * Message reçu
     */
    onMessage(event) {
        try {
            const data = JSON.parse(event.data);
            
            switch(data.type) {
                case 'userCount':
                    // data.users: [{username, ip}]
                    this.stats.clients = data.users || [];
                    this.updateClientCount(data.count || this.stats.clients.length || 0);
                    break;
                case 'message':
                    this.addLog(`💬 Message: ${data.user || 'unknown'}`);
                    this.stats.totalMessages++;
                    this.updateStats();
                    break;
                case 'stats':
                    this.updateAllStats(data);
                    break;
                default:
                    this.addLog(`Info: ${data.type}`);
            }
        } catch (err) {
            console.error('❌ Erreur parsing message:', err);
        }
    }

    /**
     * Erreur WebSocket
     */
    onError(error) {
        console.error('❌ Erreur WebSocket:', error);
        this.updateStatus('ERREUR CONNEXION');
        this.addLog('❌ Erreur WebSocket', 'error');
    }

    /**
     * Connexion fermée
     */
    onClose() {
        console.log('⚠️  WebSocket fermé');
        this.updateStatus('DÉCONNECTÉ');
        this.addLog('⚠️  Connexion WebSocket fermée', 'warning');
        this.schedulereconnect();
    }

    /**
     * Envoyer un message
     */
    sendMessage(msg) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(msg));
        }
    }

    /**
     * Programmer une reconnexion
     */
    schedulereconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`🔄 Reconnexion dans ${this.reconnectInterval}ms (tentative ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            setTimeout(() => this.init(), this.reconnectInterval);
        } else {
            console.error('❌ Impossible de se reconnecter au serveur');
            this.addLog('❌ Impossible de se reconnecter au serveur', 'error');
        }
    }

    /**
     * Récupérer les stats via HTTP
     */
    async fetchStats() {
        try {
            const response = await fetch('/api/monitoring/internal/stats');
            if (response.ok) {
                const data = await response.json();
                // Si l'API retourne aussi les clients, conserver pour affichage
                if (data.clients) {
                    this.stats.clients = data.clients;
                }
                this.updateAllStats(data);
            } else {
                console.error('❌ Erreur fetch stats:', response.status);
            }
        } catch (err) {
            console.error('❌ Erreur fetch stats:', err);
        }
    }

    /**
     * Mettre à jour tous les stats
     */
    updateAllStats(data) {
        // data.stats contient les valeurs
        const stats = data.stats || data;
        
        // ===== SYSTÈME =====
        if (stats.uptime !== undefined) {
            this.updateUptime(stats.uptime);
        }
        
        if (stats.memoryUsage !== undefined) {
            const el = document.getElementById('system-memory');
            if (el) el.textContent = stats.memoryUsage;
        }
        
        if (stats.cpuUsage !== undefined) {
            const el = document.getElementById('system-cpu');
            if (el) el.textContent = stats.cpuUsage;
        }
        
        if (stats.nodeVersion !== undefined) {
            const el = document.getElementById('system-node');
            if (el) el.textContent = stats.nodeVersion;
        }
        
        // ===== BASE DE DONNÉES =====
        if (stats.totalUsers !== undefined) {
            const el = document.getElementById('db-users');
            if (el) el.textContent = stats.totalUsers;
        }
        
        if (stats.totalMessages !== undefined) {
            const el = document.getElementById('db-messages');
            if (el) el.textContent = stats.totalMessages;
        }
        
        if (stats.totalEvents !== undefined) {
            const el = document.getElementById('db-events');
            if (el) el.textContent = stats.totalEvents;
        }
        
        // ===== REQUÊTES HTTP =====
        if (stats.httpStats) {
            const httpStats = stats.httpStats;
            
            if (httpStats.total !== undefined) {
                const el = document.getElementById('stats-total-requests');
                if (el) el.textContent = httpStats.total;
            }
            
            if (httpStats.success !== undefined) {
                const el = document.getElementById('stats-success');
                if (el) el.textContent = httpStats.success;
            }
            
            if (httpStats.clientErrors !== undefined) {
                const el = document.getElementById('stats-client-errors');
                if (el) el.textContent = httpStats.clientErrors;
            }
            
            if (httpStats.serverErrors !== undefined) {
                const el = document.getElementById('stats-server-errors');
                if (el) el.textContent = httpStats.serverErrors;
            }
        }
        
        // ===== MESSAGES CHAT =====
        if (stats.totalMessages !== undefined) {
            const el = document.getElementById('stats-total-messages');
            if (el) el.textContent = stats.totalMessages;
        }
        
        if (stats.todayMessages !== undefined) {
            const el = document.getElementById('stats-today-messages');
            if (el) el.textContent = stats.todayMessages;
        }
        
        if (stats.hourMessages !== undefined) {
            const el = document.getElementById('stats-hour-messages');
            if (el) el.textContent = stats.hourMessages;
        }
        
        console.log('✅ Stats mises à jour:', stats);
    }

    /**
     * Mettre à jour le statut serveur
     */
    updateStatus(status) {
        const el = document.getElementById('server-status');
        if (el) {
            el.textContent = status;
            if (status === 'EN LIGNE') {
                el.className = 'stat-value stat-value-online';
            } else {
                el.className = 'stat-value stat-value-error';
            }
        }
    }

    /**
     * Mettre à jour le nombre de clients
     */
    updateClientCount(count) {
        const el = document.getElementById('client-count');
        if (el) {
            el.textContent = count;
        }
        
        // Mettre à jour la liste détaillée des clients (username + IP)
        const list = document.getElementById('client-list');
        if (list) {
            if (!this.stats.clients || this.stats.clients.length === 0) {
                list.innerHTML = '<p class="empty-message">Aucun client connecté</p>';
            } else {
                list.innerHTML = this.stats.clients
                    .map((c) => `<div class="client-item">👤 ${Utils.escapeHtml(c.username || 'inconnu')} <span class="client-ip">(${Utils.escapeHtml(c.ip || 'N/A')})</span></div>`)
                    .join('');
            }
        }
    }

    /**
     * Mettre à jour l'uptime
     */
    updateUptime(seconds) {
        const el = document.getElementById('server-uptime');
        if (el) {
            el.textContent = Utils.formatUptime(seconds);
        }
    }

    /**
     * Mettre à jour la mémoire
     */
    updateMemory(bytes) {
        const el = document.getElementById('system-memory');
        if (el) {
            el.textContent = Utils.formatBytes(bytes);
        }
    }

    /**
     * Mettre à jour les stats affichées
     */
    updateStats() {
        document.getElementById('stats-total-requests').textContent = this.stats.totalRequests;
        document.getElementById('stats-success').textContent = this.stats.successCount;
        document.getElementById('stats-client-errors').textContent = this.stats.clientErrors;
        document.getElementById('stats-server-errors').textContent = this.stats.serverErrors;
        document.getElementById('stats-total-messages').textContent = this.stats.totalMessages;
        document.getElementById('stats-today-messages').textContent = this.stats.todayMessages;
        document.getElementById('stats-hour-messages').textContent = this.stats.hourMessages;
    }

    /**
     * Ajouter un log
     */
    addLog(message, level = 'info') {
        const container = document.getElementById('logs-container');
        if (!container) return;

        // Créer l'entrée de log
        const entry = document.createElement('div');
        entry.className = `log-entry log-entry-${level}`;
        entry.textContent = `[${new Date().toLocaleTimeString()}] ${Utils.escapeHtml(message)}`;
        
        // Ajouter au container
        container.appendChild(entry);
        
        // Scroller en bas
        container.scrollTop = container.scrollHeight;
        
        // Limiter à 1000 logs
        const entries = container.querySelectorAll('.log-entry');
        if (entries.length > 1000) {
            entries[0].remove();
        }

        // Ajouter aux stats
        this.stats.logs.push({
            message,
            level,
            timestamp: new Date()
        });
    }

    /**
     * Synchroniser les logs de chat
     */
    async syncChatLogs() {
        try {
            const response = await fetch('/api/monitoring/chat-logs?limit=100');
            if (response.ok) {
                const data = await response.json();
                if (data.logs && window.terminalLogger) {
                    // Récupérer les logs actuels
                    const currentLogs = window.terminalLogger.chatLogs.map(l => l.raw);
                    
                    // Ajouter les nouveaux logs
                    data.logs.forEach(log => {
                        if (!currentLogs.includes(`[${log.timestamp.substring(11, 19)}] <${log.user}> ${log.message}`)) {
                            window.terminalLogger.addChatLog(log.user, log.message, new Date(log.timestamp));
                        }
                    });
                }
            }
        } catch (err) {
            console.error('❌ Erreur sync chat logs:', err);
        }
    }

    /**
     * Synchroniser les logs de requêtes
     */
    async syncRequestLogs() {
        try {
            const response = await fetch('/api/monitoring/request-logs?limit=100');
            if (response.ok) {
                const data = await response.json();
                if (data.logs && window.terminalLogger) {
                    // Récupérer les logs actuels
                    const currentLogs = window.terminalLogger.requestLogs.map(l => l.raw);
                    
                    // Ajouter les nouveaux logs
                    data.logs.forEach(log => {
                        const raw = `[${log.timestamp.substring(11, 19)}] ${log.method} ${log.path} → ${log.status} ${log.statusText}`;
                        if (!currentLogs.includes(raw)) {
                            window.terminalLogger.addRequestLog(log.method, log.path, log.status, log.statusText, log.duration);
                        }
                    });
                }
            }
        } catch (err) {
            console.error('❌ Erreur sync request logs:', err);
        }
    }
}

// Démarrer le monitoring
let monitor = null;
document.addEventListener('DOMContentLoaded', () => {
    monitor = new ServerMonitor();
    
    // Bouton pour effacer les logs
    const clearBtn = document.getElementById('logs-clear');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            const container = document.getElementById('logs-container');
            if (container) {
                container.innerHTML = '<p class="empty-message">Logs effacés</p>';
                monitor.stats.logs = [];
            }
        });
    }

    // Synchroniser les logs tous les 2 secondes aussi
    if (window.terminalLogger) {
        setInterval(() => {
            monitor.syncChatLogs();
            monitor.syncRequestLogs();
        }, 2000);
    }
});
