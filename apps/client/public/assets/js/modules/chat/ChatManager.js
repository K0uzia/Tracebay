/**
 * ChatManager - Chat simplifié : pseudo = username du compte, pas de setPseudo.
 * Affiche pseudo, nombre de connectés, messages (avec liens sécurisés), envoi.
 */

import ChatSecurityManager from './ChatSecurityManager.js';
import { getSharedChatWebSocket } from './ChatWebSocket.js';
import api from '../../config/api.js';
import getLogger from '../../config/Logger.js';

const logger = getLogger();

class ChatManager {
    constructor(options = {}) {
        this.pseudoDisplayId = options.pseudoDisplayId || 'chat-widget-pseudo-display';
        this.messagesContainerId = options.messagesContainerId || 'chat-widget-messages';
        this.inputId = options.inputId || 'chat-widget-input';
        this.sendButtonId = options.sendButtonId || 'chat-widget-send';
        this.emoteButtonId = options.emoteButtonId || 'chat-widget-emote';
        this.emotePickerId = options.emotePickerId || 'chat-widget-emote-picker';
        this.gifButtonId = options.gifButtonId || 'chat-widget-gif';
        this.gifPickerId = options.gifPickerId || 'chat-widget-gif-picker';
        this.giphyApiKey = options.giphyApiKey || (options.securityConfig && options.securityConfig.giphyApiKey) || (typeof window !== 'undefined' && window.APP_CONFIG && window.APP_CONFIG.giphyApiKey) || '';

        const wsUrl = options.wsUrl || api.getWsUrl();
        this.webSocket = getSharedChatWebSocket({ wsUrl });

        this.pseudo = this.loadPseudo();
        this.messages = [];
        this.userCount = 0;
        this.connectedUsers = [];
        this.securityConfig = options.securityConfig || {};
        this.securityManager = new ChatSecurityManager(this.securityConfig);

        this._registerWsHandlers();
        this.init();
    }

    _registerWsHandlers() {
        this.webSocket.onMessage((data) => {
            if (data.type === 'userCount') {
                this.connectedUsers = data.users || [];
                this.userCount = typeof data.count === 'number' ? data.count : 0;
                this.displayPseudo();
                return;
            }
            if (data.type === 'auth:ack') {
                this.fetchHistory();
                return;
            }
            if (data.type === 'history') {
                this.messages = (data.messages || []).map(msg => ({
                    id: msg.id,
                    pseudo: msg.pseudo || msg.username,
                    text: msg.message || msg.text || '',
                    timestamp: this.formatTime(msg.created_at),
                    own: (msg.pseudo || msg.username) === this.pseudo,
                    created_at: msg.created_at
                }));
                this.renderMessages();
                this.scrollToBottom();
                return;
            }
            if (data.type === 'newMessage') {
                const msg = data.message;
                const messageText = typeof msg.message === 'string' ? msg.message : (msg.text || '');
                const pseudo = msg.pseudo || msg.username || 'Anonyme';
                const isOwn = pseudo === this.pseudo;
                const recent = Date.now() - 15000;
                const isDuplicate = isOwn && this.messages.some(m =>
                    m.own && m.pseudo === pseudo && m.text === messageText && m.created_at && new Date(m.created_at).getTime() > recent
                );
                if (isDuplicate) {
                    const idx = this.messages.findIndex(m =>
                        m.own && m.pseudo === pseudo && m.text === messageText && m.created_at && new Date(m.created_at).getTime() > recent
                    );
                    if (idx !== -1 && this.messages[idx].id && String(this.messages[idx].id).startsWith('temp-')) {
                        this.messages[idx].id = msg.id || this.messages[idx].id;
                        this.messages[idx].created_at = msg.created_at;
                        this.messages[idx].timestamp = this.formatTime(msg.created_at);
                    }
                    this.renderMessages();
                    this.scrollToBottom();
                    return;
                }
                this.messages.push({
                    id: msg.id || Date.now(),
                    pseudo,
                    text: messageText,
                    timestamp: this.formatTime(msg.created_at),
                    own: isOwn,
                    created_at: msg.created_at
                });
                this.renderMessages();
                this.scrollToBottom();
                return;
            }
            if (data.type === 'chatCleared') {
                this.messages = [];
                this.renderMessages();
            }
        });

        this.webSocket.onError((err) => {
            const code = err && err.code;
            const message = err && err.message ? err.message : (typeof err === 'string' ? err : 'Erreur chat');
            if (code === 'ALREADY_LOGGED_IN') {
                alert('Compte déjà connecté sur un autre poste. Déconnectez-vous de l\'autre session ou réessayez plus tard.');
            } else {
                logger.error('Erreur chat', message);
            }
        });
    }

    loadPseudo() {
        return localStorage.getItem('workspace_username') || null;
    }

    async init() {
        window.addEventListener('auth-change', (e) => {
            const user = e.detail?.user;
            const token = e.detail?.token;
            this.pseudo = user ? user.username : null;
            this.displayPseudo();
            if (token) {
                if (!this.webSocket.isConnected()) this.webSocket.connect();
                this.webSocket.authenticate(token);
            } else {
                this.webSocket.disconnect();
            }
        });

        this.displayPseudo();
        this.renderMessages();
        this.attachEventListeners();
        requestAnimationFrame(() => {
            this.initEmotePicker();
            this.initGifPicker();
        });

        const connectAndRestoreSession = () => {
            if (this.webSocket.isConnected()) {
                const token = this.getStoredToken();
                if (token) this.webSocket.authenticate(token);
                if (this.pseudo) this.fetchHistory();
            } else {
                setTimeout(connectAndRestoreSession, 500);
            }
        };
        connectAndRestoreSession();
    }

    getStoredToken() {
        return localStorage.getItem('workspace_jwt');
    }

    async fetchHistory() {
        try {
            const res = await api.get('messages.list', { useCache: false });
            if (!res.ok) return;
            const data = await res.json();
            const list = data.messages || [];
            if (list.length === 0) return;
            this.messages = list.map(msg => ({
                id: msg.id,
                pseudo: msg.pseudo || msg.username || 'Anonyme',
                text: msg.message || msg.text || '',
                timestamp: this.formatTime(msg.created_at),
                own: (msg.pseudo || msg.username) === this.pseudo,
                created_at: msg.created_at
            })).reverse();
            this.renderMessages();
            this.scrollToBottom();
        } catch (e) {
            logger.debug('Historique chat non disponible', e);
        }
    }

    attachEventListeners() {
        const sendBtn = document.getElementById(this.sendButtonId);
        if (sendBtn) sendBtn.addEventListener('click', () => this.sendMessage());
        const input = document.getElementById(this.inputId);
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
        }
    }

    initEmotePicker() {
        const btn = document.getElementById(this.emoteButtonId);
        const picker = document.getElementById(this.emotePickerId);
        const input = document.getElementById(this.inputId);
        if (!btn || !picker || !input) return;

        const insertEmoji = (unicode) => {
            const start = input.selectionStart ?? input.value.length;
            const end = input.selectionEnd ?? input.value.length;
            const before = input.value.slice(0, start);
            const after = input.value.slice(end);
            input.value = before + unicode + after;
            input.focus();
            input.selectionStart = input.selectionEnd = start + unicode.length;
            picker.classList.remove('show');
        };

        const initPickerElement = () => {
            picker.innerHTML = '';
            const emojiPicker = document.createElement('emoji-picker');
            emojiPicker.classList.add('chat-emoji-picker');
            emojiPicker.addEventListener('emoji-click', (e) => {
                const unicode = e.detail?.unicode;
                if (unicode) insertEmoji(unicode);
            });
            picker.appendChild(emojiPicker);
        };

        if (customElements.get('emoji-picker')) {
            initPickerElement();
        } else {
            customElements.whenDefined('emoji-picker').then(initPickerElement);
        }

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            document.getElementById(this.gifPickerId)?.classList.remove('show');
            picker.classList.toggle('show');
        });

        document.addEventListener('click', (e) => {
            if (picker.classList.contains('show') && !picker.contains(e.target) && e.target !== btn) {
                picker.classList.remove('show');
            }
        });
    }

    async fetchGiphyGifs(query, limit = 12) {
        if (!this.giphyApiKey) return [];
        try {
            const q = encodeURIComponent((query || 'reaction').slice(0, 50));
            const res = await fetch(
                `https://api.giphy.com/v1/gifs/search?api_key=${this.giphyApiKey}&q=${q}&limit=${limit}&rating=g&lang=fr`
            );
            if (!res.ok) return [];
            const data = await res.json();
            const results = data.data || [];
            return results.map(g => {
                const imgs = g.images || {};
                const orig = imgs.original || imgs.fixed_height || {};
                const preview = (imgs.fixed_height_small || imgs.fixed_height || orig).url;
                const url = orig.url || preview;
                return { url, preview: preview || url, id: g.id };
            }).filter(x => x.url);
        } catch (e) {
            logger.debug('Giphy API error', e);
            return [];
        }
    }

    initGifPicker() {
        const btn = document.getElementById(this.gifButtonId);
        const picker = document.getElementById(this.gifPickerId);
        const input = document.getElementById(this.inputId);
        if (!btn || !picker || !input) return;

        picker.className = 'chat-widget-gif-picker';
        const searchWrap = document.createElement('div');
        searchWrap.className = 'chat-widget-gif-search';
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = 'Rechercher un GIF...';
        searchInput.className = 'chat-widget-gif-search-input';
        const resultsWrap = document.createElement('div');
        resultsWrap.className = 'chat-widget-gif-results';

        const renderResults = (gifs) => {
            resultsWrap.innerHTML = '';
            if (!this.giphyApiKey) {
                resultsWrap.innerHTML = '<p class="chat-widget-gif-no-key">Ajoutez une cl\u00e9 API Giphy dans la config (giphyApiKey) pour rechercher des GIFs. <a href="https://developers.giphy.com/dashboard/" target="_blank" rel="noopener">Cr\u00e9er une cl\u00e9 Giphy</a></p>';
                return;
            }
            if (gifs.length === 0) {
                resultsWrap.innerHTML = '<p class="chat-widget-gif-empty">Aucun GIF. Essayez un autre mot.</p>';
                return;
            }
            gifs.forEach(({ url, preview }) => {
                const thumb = document.createElement('button');
                thumb.type = 'button';
                thumb.className = 'chat-widget-gif-thumb';
                const img = document.createElement('img');
                img.src = preview || url;
                img.alt = '';
                img.loading = 'lazy';
                thumb.appendChild(img);
                thumb.addEventListener('click', () => {
                    const sep = input.value.trim() ? ' ' : '';
                    input.value = input.value + sep + url;
                    picker.classList.remove('show');
                    input.focus();
                });
                resultsWrap.appendChild(thumb);
            });
        };

        searchWrap.appendChild(searchInput);
        picker.appendChild(searchWrap);
        picker.appendChild(resultsWrap);

        let searchTimeout = null;
        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            const q = searchInput.value.trim();
            searchTimeout = setTimeout(async () => {
                const gifs = await this.fetchGiphyGifs(q || 'reaction');
                renderResults(gifs);
            }, 300);
        });

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            document.getElementById(this.emotePickerId)?.classList.remove('show');
            picker.classList.toggle('show');
            if (picker.classList.contains('show') && resultsWrap.children.length === 0) {
                this.fetchGiphyGifs('reaction').then(renderResults);
            }
        });

        document.addEventListener('click', (e) => {
            if (picker.classList.contains('show') && !picker.contains(e.target) && e.target !== btn) {
                picker.classList.remove('show');
            }
        });
    }

    displayPseudo() {
        const el = document.getElementById(this.pseudoDisplayId);
        if (!el) return;
        if (this.pseudo) {
            const count = this.userCount >= 0 ? this.userCount : 0;
            el.innerHTML = `
                <div class="chat-pseudo-confirmed">
                    <div class="chat-pseudo-info">
                        <i class="fas fa-user"></i>
                        <span>${this.escapeHtml(this.pseudo)}</span>
                    </div>
                    <div class="chat-user-count">
                        <i class="fas fa-users"></i>
                        <span>${count}</span>
                    </div>
                </div>
            `;
        } else {
            el.innerHTML = `
                <div class="chat-pseudo-required">
                    <i class="fas fa-exclamation-circle"></i>
                    <span>Connectez-vous pour utiliser le chat</span>
                </div>
            `;
        }
    }

    async sendMessage() {
        const input = document.getElementById(this.inputId);
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;
        if (!this.pseudo) {
            alert('Vous devez être connecté pour envoyer des messages');
            return;
        }
        if (text.length > 5000) return;

        if (!this.webSocket.isConnected()) {
            logger.error('WebSocket non connecté');
            return;
        }

        const now = new Date().toISOString();
        const tempId = 'temp-' + Date.now();
        this.messages.push({
            id: tempId,
            pseudo: this.pseudo,
            text,
            timestamp: this.formatTime(now),
            own: true,
            created_at: now
        });
        this.renderMessages();
        this.scrollToBottom();
        input.value = '';

        try {
            await this.webSocket.sendMessage(text);
        } catch (error) {
            logger.error('Erreur envoi message', error);
            const idx = this.messages.findIndex(m => m.own && m.text === text && m.id && String(m.id).startsWith('temp-'));
            if (idx !== -1) this.messages.splice(idx, 1);
            this.renderMessages();
        }
    }

    renderMessages() {
        const container = document.getElementById(this.messagesContainerId);
        if (!container) return;

        if (this.messages.length === 0) {
            container.innerHTML = '<div class="chat-widget-empty">Aucun message pour le moment</div>';
            container.className = 'chat-widget-empty';
            return;
        }

        container.classList.remove('chat-widget-empty');
        container.innerHTML = '';

        this.messages.forEach(msg => {
            const wrap = document.createElement('div');
            wrap.className = msg.own ? 'chat-message own' : 'chat-message other';

            const pseudoEl = document.createElement('div');
            pseudoEl.className = 'chat-message-pseudo';
            pseudoEl.textContent = msg.pseudo || '';

            const contentWrap = document.createElement('div');
            contentWrap.className = 'chat-message-content';
            const textWrap = document.createElement('div');
            textWrap.className = 'chat-message-text';
            const fragment = this.securityManager.processMessage(msg.text);
            textWrap.appendChild(fragment);
            contentWrap.appendChild(textWrap);

            const timeEl = document.createElement('div');
            timeEl.className = 'chat-message-time';
            timeEl.textContent = msg.timestamp || '';

            wrap.appendChild(pseudoEl);
            wrap.appendChild(contentWrap);
            wrap.appendChild(timeEl);
            container.appendChild(wrap);
        });

        this.scrollToBottom();
    }

    scrollToBottom() {
        const container = document.getElementById(this.messagesContainerId);
        if (container) setTimeout(() => { container.scrollTop = container.scrollHeight; }, 0);
    }

    formatTime(isoString) {
        if (!isoString) return '00:00';
        const date = new Date(isoString);
        if (isNaN(date.getTime())) return '00:00';
        return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    destroy() {
        if (this.webSocket) this.webSocket.disconnect?.();
    }
}

export default ChatManager;
