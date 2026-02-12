import api from '../../config/api.js';

class AuthManager {
    constructor() {
        this.user = null;
        this.listeners = [];
        this.tokenKey = 'workspace_jwt';
        this.init();
    }

    init() {
        const userId = localStorage.getItem('workspace_user_id');
        const username = localStorage.getItem('workspace_username');
        const token = localStorage.getItem(this.tokenKey);

        if (userId && username && token) {
            this.user = {
                id: parseInt(userId),
                username: username
            };
            this.verifySession(token);
        }
    }

    async verifySession(token) {
        try {
            const response = await api.get('auth.verify', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            const data = await response.json();

            if (!data.success) {
                this.clearSession();
            } else {
                this.emit('auth-change', this.user);
            }
        } catch (error) {
            console.error('Erreur vérification session:', error);
            this.clearSession();
        }
    }

    async register(username, password) {
        try {
            const response = await api.post('auth.register', { username, password });
            const data = await response.json();

            if (data.success) {
                this.setSession(data.user, data.token);
            }

            return data;
        } catch (error) {
            console.error('Erreur register:', error);
            return {
                success: false,
                message: 'Erreur de connexion au serveur'
            };
        }
    }

    async login(username, password) {
        try {
            const response = await api.post('auth.login', { username, password });

            const data = await response.json();

            if (data.success) {
                this.setSession(data.user, data.token);
            }

            return data;
        } catch (error) {
            console.error('Erreur login:', error);
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
        localStorage.setItem('workspace_user_id', user.id);
        localStorage.setItem('workspace_username', user.username);
        if (token) {
            localStorage.setItem(this.tokenKey, token);
        }
        this.emit('auth-change', this.user);
        
        // Émettre un événement global pour ChatManager
        window.dispatchEvent(new CustomEvent('auth-change', { detail: { user, token } }));
    }

    clearSession() {
        this.user = null;
        localStorage.removeItem('workspace_user_id');
        localStorage.removeItem('workspace_username');
        localStorage.removeItem(this.tokenKey);
        this.emit('auth-change', null);
        
        // Émettre un événement global pour ChatManager
        window.dispatchEvent(new CustomEvent('auth-change', { detail: { user: null } }));
    }

    getToken() {
        return localStorage.getItem(this.tokenKey) || null;
    }

    isAuthenticated() {
        return this.user !== null;
    }

    getCurrentUser() {
        return this.user;
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
    }
}

export default AuthManager;
