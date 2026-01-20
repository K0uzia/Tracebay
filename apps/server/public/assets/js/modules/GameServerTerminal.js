class GameServerTerminal {
    constructor(options = {}) {
        this.terminalSelector = options.terminalSelector || '#game-terminal';
        this.statusSelector = options.statusSelector || '#game-status';
        this.buttonSelector = options.buttonSelector || '[data-game-action]';
        this.pollMs = options.pollMs || 3000;
        this.maxLines = options.maxLines || 500;
        this.lines = [];
        this.status = 'stopped';
        this.interval = null;
        this.consoleHooked = false;
        this.originalConsole = {};

        this.terminalEl = document.querySelector(this.terminalSelector);
        this.statusEl = document.querySelector(this.statusSelector);
        this.buttons = Array.from(document.querySelectorAll(this.buttonSelector));

        if (!this.terminalEl) {
            console.warn('GameServerTerminal: terminal element not found');
            return;
        }

        this.attachButtonHandlers();
        this.setStatus('stopped');
        this.hookConsole();
    }

    attachButtonHandlers() {
        this.buttons.forEach((btn) => {
            const action = btn.getAttribute('data-game-action');
            btn.addEventListener('click', () => this.handleAction(action));
        });
    }

    setStatus(status) {
        this.status = status;
        if (!this.statusEl) return;

        this.statusEl.classList.remove('status-offline', 'status-running', 'status-pending');
        if (status === 'running') {
            this.statusEl.textContent = 'En cours';
            this.statusEl.classList.add('status-running');
        } else if (status === 'pending') {
            this.statusEl.textContent = 'En cours...';
            this.statusEl.classList.add('status-pending');
        } else {
            this.statusEl.textContent = 'Arrêté';
            this.statusEl.classList.add('status-offline');
        }

        this.updateButtons();
    }

    updateButtons() {
        const running = this.status === 'running';
        this.buttons.forEach((btn) => {
            const action = btn.getAttribute('data-game-action');
            if (action === 'start') {
                btn.disabled = running;
            } else if (action === 'stop') {
                btn.disabled = !running;
            } else if (action === 'kill') {
                btn.disabled = false;
            }
        });
    }

    setPending(isPending) {
        this.buttons.forEach((btn) => {
            btn.disabled = isPending;
            btn.classList.toggle('is-loading', isPending);
        });
        if (isPending) {
            this.setStatus('pending');
        } else if (this.status === 'pending') {
            this.setStatus('stopped');
        }
    }

    startPolling() {
        this.stopPolling();
        this.fetchLogs();
        this.interval = window.setInterval(() => this.fetchLogs(), this.pollMs);
    }

    stopPolling() {
        if (this.interval) {
            window.clearInterval(this.interval);
            this.interval = null;
        }
    }

    async fetchLogs() {
        if (this.status !== 'running') return;
        try {
            const res = await fetch(this.apiBase('/api/logs'));
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }
            const data = await res.json();
            if (Array.isArray(data)) {
                this.renderLogs(data);
            }
        } catch (err) {
            this.addLine({ time: this.now(), level: 'ERROR', msg: `Fetch logs failed: ${err.message}` });
        }
    }

    async handleAction(action) {
        if (!action) return;
        this.setPending(true);
        try {
            const payload = { action };
            let res;
            if (window.electron && typeof window.electron.invoke === 'function') {
                res = await window.electron.invoke('game-server:command', payload);
                if (!res || res.ok === false) throw new Error(res?.error || 'IPC error');
            } else {
                const httpRes = await fetch(this.apiBase('/api/command'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                if (!httpRes.ok) throw new Error(`HTTP ${httpRes.status}`);
            }

            this.addLine({ time: this.now(), level: 'INFO', msg: `Commande ${action} envoyée` });
            if (action === 'start') {
                this.setStatus('running');
                this.startPolling();
                if (window.ServerMonitorInstance) {
                    window.ServerMonitorInstance.start('http://192.168.1.62:4000');
                }
            }
            if (action === 'stop' || action === 'kill') {
                this.setStatus('stopped');
                this.stopPolling();
                if (window.ServerMonitorInstance) {
                    window.ServerMonitorInstance.stop();
                }
            }
        } catch (err) {
            this.addLine({ time: this.now(), level: 'ERROR', msg: `Commande échouée: ${err.message}` });
            this.setStatus('stopped');
            this.stopPolling();
            if (window.ServerMonitorInstance) {
                window.ServerMonitorInstance.stop();
            }
        } finally {
            this.setPending(false);
        }
    }

    renderLogs(logs) {
        if (!this.terminalEl) return;
        this.lines = logs.slice(-this.maxLines).map((line) => ({
            time: line.time || this.now(),
            level: (line.level || 'INFO').toUpperCase(),
            msg: line.msg || '',
        }));

        this.terminalEl.innerHTML = '';
        this.lines.forEach((line) => {
            const div = document.createElement('div');
            div.className = `game-line ${this.levelClass(line.level)}`;
            div.innerHTML = `<span class="game-time">[${this.escape(line.time)}]</span><span class="game-level">${this.escape(line.level)}</span>${this.escape(line.msg)}`;
            this.terminalEl.appendChild(div);
        });
        this.scrollToBottom();
    }

    addLine(line) {
        if (!this.terminalEl) return;
        this.lines.push(line);
        if (this.lines.length > this.maxLines) {
            this.lines.shift();
        }
        const div = document.createElement('div');
        div.className = `game-line ${this.levelClass(line.level)}`;
        div.innerHTML = `<span class="game-time">[${this.escape(line.time)}]</span><span class="game-level">${this.escape(line.level)}</span>${this.escape(line.msg)}`;
        this.terminalEl.appendChild(div);
        this.scrollToBottom();
    }

    hookConsole() {
        if (this.consoleHooked) return;
        const map = {
            log: 'INFO',
            info: 'INFO',
            warn: 'WARN',
            error: 'ERROR',
            debug: 'DEBUG'
        };
        Object.keys(map).forEach((method) => {
            const original = console[method] ? console[method].bind(console) : null;
            this.originalConsole[method] = original;
            if (!original) return;
            console[method] = (...args) => {
                try {
                    const msg = args.map((a) => this.stringify(a)).join(' ');
                    this.addLine({ time: this.now(), level: map[method], msg: `[console.${method}] ${msg}` });
                } catch (e) {
                    // swallow
                }
                original(...args);
            };
        });
        this.consoleHooked = true;
    }

    stringify(value) {
        if (typeof value === 'string') return value;
        try {
            return JSON.stringify(value);
        } catch (e) {
            return String(value);
        }
    }

    scrollToBottom() {
        this.terminalEl.scrollTop = this.terminalEl.scrollHeight;
    }

    levelClass(level) {
        const l = (level || '').toUpperCase();
        if (l === 'ERROR') return 'game-line-error';
        if (l === 'WARN' || l === 'WARNING') return 'game-line-warn';
        if (l === 'DEBUG') return 'game-line-debug';
        if (l === 'INFO') return 'game-line-info';
        return 'game-line-default';
    }

    apiBase(pathname) {
        const base = 'http://192.168.1.62:4000';
        return `${base}${pathname}`;
    }

    escape(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    now() {
        return new Date().toLocaleTimeString('fr-FR');
    }
}

// Auto-init on DOM ready
window.addEventListener('DOMContentLoaded', () => {
    window.gameServerTerminal = new GameServerTerminal({
        terminalSelector: '#game-terminal',
        statusSelector: '#game-status',
        buttonSelector: '[data-game-action]',
        pollMs: 3000,
    });
});

// Export for potential reuse
window.GameServerTerminal = GameServerTerminal;
