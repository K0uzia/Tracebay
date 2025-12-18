/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

type LogLevel = 'INFO' | 'WARN' | 'WARNING' | 'ERROR' | 'DEBUG' | string;

type LogEntry = {
    time: string;
    level: LogLevel;
    msg: string;
};

type GameTerminalOptions = {
    terminalSelector?: string;
    statusSelector?: string;
    buttonSelector?: string;
    pollMs?: number;
    maxLines?: number;
};

class GameServerTerminalTS {
    private terminalSelector: string;
    private statusSelector: string;
    private buttonSelector: string;
    private pollMs: number;
    private maxLines: number;
    private lines: LogEntry[] = [];
    private status: 'running' | 'stopped' | 'pending' = 'stopped';
    private interval: number | null = null;
    private terminalEl: HTMLElement | null;
    private statusEl: HTMLElement | null;
    private buttons: HTMLButtonElement[];

    constructor(options: GameTerminalOptions = {}) {
        this.terminalSelector = options.terminalSelector || '#game-terminal';
        this.statusSelector = options.statusSelector || '#game-status';
        this.buttonSelector = options.buttonSelector || '[data-game-action]';
        this.pollMs = options.pollMs || 3000;
        this.maxLines = options.maxLines || 500;

        this.terminalEl = document.querySelector<HTMLElement>(this.terminalSelector);
        this.statusEl = document.querySelector<HTMLElement>(this.statusSelector);
        this.buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(this.buttonSelector));

        if (!this.terminalEl) {
            console.warn('GameServerTerminalTS: terminal element not found');
            return;
        }

        this.attachButtonHandlers();
        this.setStatus('stopped');
        this.startPolling();
    }

    private attachButtonHandlers() {
        this.buttons.forEach((btn) => {
            const action = btn.getAttribute('data-game-action');
            btn.addEventListener('click', () => this.handleAction(action));
        });
    }

    private setStatus(status: 'running' | 'stopped' | 'pending') {
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

    private updateButtons() {
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

    private setPending(isPending: boolean) {
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

    private startPolling() {
        this.fetchLogs();
        this.interval = window.setInterval(() => this.fetchLogs(), this.pollMs);
    }

    public stopPolling() {
        if (this.interval) {
            window.clearInterval(this.interval);
            this.interval = null;
        }
    }

    private async fetchLogs() {
        try {
            const res = await fetch('/api/logs');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = (await res.json()) as LogEntry[];
            if (Array.isArray(data)) this.renderLogs(data);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.addLine({ time: this.now(), level: 'ERROR', msg: `Fetch logs failed: ${message}` });
        }
    }

    private async handleAction(action: string | null) {
        if (!action) return;
        this.setPending(true);
        try {
            const res = await fetch('/api/command', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            this.addLine({ time: this.now(), level: 'INFO', msg: `Commande ${action} envoyée` });
            if (action === 'start') this.setStatus('running');
            if (action === 'stop' || action === 'kill') this.setStatus('stopped');
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.addLine({ time: this.now(), level: 'ERROR', msg: `Commande échouée: ${message}` });
            this.setStatus('stopped');
        } finally {
            this.setPending(false);
        }
    }

    private renderLogs(logs: LogEntry[]) {
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
            this.terminalEl?.appendChild(div);
        });
        this.scrollToBottom();
    }

    private addLine(line: LogEntry) {
        if (!this.terminalEl) return;
        this.lines.push(line);
        if (this.lines.length > this.maxLines) this.lines.shift();
        const div = document.createElement('div');
        div.className = `game-line ${this.levelClass(line.level)}`;
        div.innerHTML = `<span class="game-time">[${this.escape(line.time)}]</span><span class="game-level">${this.escape(line.level)}</span>${this.escape(line.msg)}`;
        this.terminalEl.appendChild(div);
        this.scrollToBottom();
    }

    private scrollToBottom() {
        if (this.terminalEl) this.terminalEl.scrollTop = this.terminalEl.scrollHeight;
    }

    private levelClass(level: LogLevel) {
        const l = (level || '').toUpperCase();
        if (l === 'ERROR') return 'game-line-error';
        if (l === 'WARN' || l === 'WARNING') return 'game-line-warn';
        if (l === 'DEBUG') return 'game-line-debug';
        if (l === 'INFO') return 'game-line-info';
        return 'game-line-default';
    }

    private escape(str: string) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    private now() {
        return new Date().toLocaleTimeString('fr-FR');
    }
}

export { GameServerTerminalTS, LogEntry, GameTerminalOptions };
