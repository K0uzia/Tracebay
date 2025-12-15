class AuthManager {
    constructor(options = {}) {
        this.user = null;
        this.listeners = [];
        this.serverUrl = options.serverUrl || 'http://localhost:8060';
        this.token = null;
        this.init();
    }

    init() {
        const userId = localStorage.getItem('workspace_user_id');
        const username = localStorage.getItem('workspace_username');
        const token = localStorage.getItem('workspace_token');

        if (userId && username && token) {
            this.user = {
                id: parseInt(userId),
                username: username
            };
            this.token = token;
            this.verifySession();
        }
    }

    async verifySession() {
        try {
            const response = await fetch(`${this.serverUrl}/api/auth/verify`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();

            if (!data.success) {
                this.clearSession();
            } else {
                this.emit('auth-change', this.user);
            }
        } catch (error) {
            console.error('❌ Erreur vérification session:', error);
            this.clearSession();
        }
    }

    async register(username, password) {
        try {
            const response = await fetch(`${this.serverUrl}/api/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (data.success && data.token) {
                this.setSession(data.user, data.token);
            }

            return data;
        } catch (error) {
            console.error('❌ Erreur register:', error);
            return {
                success: false,
                message: 'Erreur de connexion au serveur'
            };
        }
    }

    async login(username, password) {
        try {
            const response = await fetch(`${this.serverUrl}/api/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (data.success && data.token) {
                this.setSession(data.user, data.token);
            }

            return data;
        } catch (error) {
            console.error('❌ Erreur login:', error);
            return {
                success: false,
                message: 'Erreur de connexion au serveur'
            };
        }
    }

    logout() {
        this.clearSession();
        window.location.reload();
        return {
            success: true,
            message: 'Déconnexion réussie'
        };
    }

    setSession(user, token) {
        this.user = user;
        this.token = token;
        localStorage.setItem('workspace_user_id', user.id);
        localStorage.setItem('workspace_username', user.username);
        localStorage.setItem('workspace_token', token);
        this.emit('auth-change', this.user);
        
        // Émettre un événement global pour ChatManager
        window.dispatchEvent(new CustomEvent('auth-change', { detail: { user } }));
    }

    clearSession() {
        this.user = null;
        this.token = null;
        localStorage.removeItem('workspace_user_id');
        localStorage.removeItem('workspace_username');
        localStorage.removeItem('workspace_token');
        this.emit('auth-change', null);
        
        // Émettre un événement global pour ChatManager
        window.dispatchEvent(new CustomEvent('auth-change', { detail: { user: null } }));
    }

    isAuthenticated() {
        return this.user !== null && this.token !== null;
    }

    getCurrentUser() {
        return this.user;
    }

    getToken() {
        return this.token;
    }

    on(event, callback) {
        this.listeners.push({ event, callback });
    }

    emit(event, data) {
        this.listeners.forEach(listener => {
            if (listener.event === event) {
                listener.callback(data);
            }
        });
    }

    destroy() {
        this.listeners = [];
        this.user = null;
        this.token = null;
    }
}

export default AuthManager;
