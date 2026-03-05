class PageManager {
    constructor() {
        this.contentContainer = 'content';
        this.storageKey = 'workspace_current_page';
        this.authManager = null;
        this.serverUrl = null;
        this.serverConnected = false;
        
        // Pages et leur configuration de layout (sous-pages réception = même layout que reception)
        const receptionLayout = { showHeader: true, showFooter: false, showChat: false };
        this.pagesConfig = {
            'home': { showHeader: true, showFooter: true, showChat: true },
            'agenda': { showHeader: true, showFooter: true, showChat: false },
            'dossier': { showHeader: true, showFooter: true, showChat: true },
            'application': { showHeader: true, showFooter: true, showChat: true },
            'reception': receptionLayout,
            'entrer': receptionLayout,
            'sortie': receptionLayout,
            'inventaire': receptionLayout,
            'historique': receptionLayout,
            'tracabilite': receptionLayout,
            'disques': receptionLayout,
            'shortcut': { showHeader: true, showFooter: true, showChat: true },
            'option': { showHeader: true, showFooter: true, showChat: false },
            'login': { showHeader: false, showFooter: false, showChat: false },
            'signup': { showHeader: false, showFooter: false, showChat: false }
        };
        
        this.init();
    }

    async init() {
        // Initialiser le module API (configuration centralisée)
        const apiModule = await import('./assets/js/config/api.js');
        await apiModule.default.init();
        
        // Initialiser le Logger
        const loggerModule = await import('./assets/js/config/Logger.js');
        this.logger = loggerModule.default();
        window.logger = this.logger; // Exposer globalement
        
        // Initialiser le logger avec la config de l'app (pour détecter production)
        if (typeof this.logger.initializeFromAppConfig === 'function') {
            await this.logger.initializeFromAppConfig();
        }
        
        // Initialiser la configuration de connexion
        const module = await import('./assets/js/config/ConnectionConfig.js');
        const ConnectionConfig = module.default;
        this.connectionConfig = new ConnectionConfig();
        await this.connectionConfig.initialize();

        // Récupérer l'URL du serveur
        this.serverUrl = this.connectionConfig.getServerUrl();
        this.serverWsUrl = this.connectionConfig.getServerWsUrl();
        this.serverConnected = this.connectionConfig.serverConnected;
        
        this.logger.info(`Serveur: ${this.serverUrl}`);
        this.logger.info(`WebSocket: ${this.serverWsUrl}`);

        // Exposer l'instance App globalement
        window.app = this;

        // Capture automatique des erreurs JS non gérées → monitoring admin
        this.setupClientErrorReporting();

        // Toast "Mise à jour installée" après redémarrage post-update
        if (typeof window.electron !== 'undefined' && window.electron.on) {
            window.electron.on('update-was-installed', () => {
                window.app?.showNotification('Une nouvelle version a été installée avec succès.', 'success');
            });
        }

        // Initialiser le gestionnaire de connexion serveur
        await this.initializeServerConnection();

        // Charger le header puis afficher la page tout de suite (premier rendu plus rapide)
        await this.loadComponent('header', './components/header.html', () => this.initializeAuth());

        // Fermer le WebSocket à la fermeture de la fenêtre pour que le serveur
        // reçoive l'événement close et libère la session (évite "déjà connecté" au retour).
        const closeChatWebSocketOnUnload = () => {
            try {
                if (window.chatManager?.webSocket?.close) {
                    window.chatManager.webSocket.close(true);
                }
            } catch (_) { /* ignore */ }
        };
        window.addEventListener('beforeunload', closeChatWebSocketOnUnload);
        window.addEventListener('pagehide', closeChatWebSocketOnUnload);

        // Charger la page sauvegardée ou home (y compris sous-pages réception : entrer, historique, tracabilite, etc.)
        const lastPage = this.getLastPage();
        const receptionSubPages = ['entrer', 'sortie', 'inventaire', 'historique', 'tracabilite', 'disques'];
        const isValidPage = lastPage && (this.pagesConfig[lastPage] || receptionSubPages.includes(lastPage));
        const pageToLoad = isValidPage ? lastPage : 'home';
        this.loadPage(pageToLoad);

        // Footer et infos système en arrière-plan pour ne pas retarder le premier affichage
        this.loadComponent('footer', './components/footer.html', () => {
            this.initializeSystemInfo();
            this.updateFooterVersion();
        });
    }

    /**
     * Branche window.onerror et unhandledrejection sur le monitoring admin.
     * Filtre les erreurs provenant de bibliothèques tierces non actionnables
     * (emoji-picker, favicon gstatic) pour ne pas polluer le panel.
     */
    setupClientErrorReporting() {
        const serverUrl = this.serverUrl || '';
        const endpoint = `${serverUrl}/api/monitoring/errors`;
        const clientId = localStorage.getItem('workspace_client_id') || (() => {
            const id = `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            localStorage.setItem('workspace_client_id', id);
            return id;
        })();

        const IGNORED_PATTERNS = [
            /gstatic\.com/,
            /faviconV2/,
            /emoji-picker-element/,
            /picker\.js.*Emoji support detection/,
            /checkZwjSupport/,
        ];

        const shouldIgnore = (msg) => {
            if (!msg) return false;
            return IGNORED_PATTERNS.some(p => p.test(String(msg)));
        };

        const send = (payload) => {
            if (shouldIgnore(payload.errorMessage)) return;
            try {
                const blob = new Blob([JSON.stringify({
                    clientId,
                    clientVersion: typeof this.getAppVersion === 'function' ? this.getAppVersion() : '1.0',
                    platform: navigator.platform || '',
                    ...payload
                })], { type: 'application/json' });
                if (navigator.sendBeacon) {
                    navigator.sendBeacon(endpoint, blob);
                } else {
                    fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: blob, keepalive: true }).catch(() => {});
                }
            } catch (_) {}
        };

        window.onerror = (message, source, lineno, colno, error) => {
            send({
                errorType: 'js_error',
                errorMessage: String(message),
                errorStack: error?.stack || null,
                context: `${source || ''}:${lineno}:${colno}`
            });
            return false;
        };

        window.addEventListener('unhandledrejection', (event) => {
            const reason = event.reason;
            const msg = reason?.message || String(reason);
            send({
                errorType: 'promise_rejection',
                errorMessage: msg,
                errorStack: reason?.stack || null,
                context: 'Unhandled Promise Rejection'
            });
        });
    }

    async initializeServerConnection() {
        try {
            const module = await import('./assets/js/modules/system/ServerConnectionManager.js');
            const ServerConnectionManager = module.default;
            
            // Utiliser les paramètres de ConnectionConfig
            const config = window.APP_CONFIG;
            
            this.serverConnectionManager = new ServerConnectionManager({
                url: this.serverUrl,
                ws: this.serverWsUrl,
                healthCheckInterval: config.healthCheckInterval || 30000,
                reconnectDelay: config.reconnectDelay || 3000,
                maxReconnectAttempts: config.maxReconnectAttempts || 5
            });

            this.serverConnectionManager.onStatusChange((status, data) => {
                this.logger.debug(`Statut serveur: ${status}`, data);
                this.serverConnected = (status === 'connected');
                window.APP_CONFIG.serverConnected = this.serverConnected;
                this.updateServerStatus(status, data);
            });

            this.serverConnectionManager.start();
            this.logger.info('ServerConnectionManager initialisé');
        } catch (error) {
            this.logger.error('Erreur init ServerConnectionManager', error);
        }
    }

    updateServerStatus(status, data) {
        // Mettre à jour l'indicateur visuel dans le footer si présent
        const serverIndicator = document.getElementById('footer-server-value');
        const serverIcon = document.getElementById('footer-server-icon');
        
        if (serverIndicator && serverIcon) {
            if (status === 'connected') {
                serverIndicator.textContent = 'En ligne';
                serverIndicator.style.color = '#2ecc71';
                serverIcon.className = 'fa-solid fa-circle-check';
                serverIcon.style.color = '#2ecc71';
            } else if (status === 'disconnected') {
                serverIndicator.textContent = 'Déconnecté';
                serverIndicator.style.color = '#e74c3c';
                serverIcon.className = 'fa-solid fa-circle-xmark';
                serverIcon.style.color = '#e74c3c';
            } else if (status === 'failed') {
                serverIndicator.textContent = 'Hors ligne';
                serverIndicator.style.color = '#95a5a6';
                serverIcon.className = 'fa-solid fa-circle-exclamation';
                serverIcon.style.color = '#95a5a6';
            }
        }
    }

    async initializeAuth() {
        try {
            const module = await import('./assets/js/modules/auth/AuthManager.js');
            const AuthManager = module.default;
            this.authManager = new AuthManager();
            
            this.authManager.on('auth-change', (user) => {
                this.logger.debug('Auth change event', { user: user?.username });
                this.updateProfileUI(user);
                // Mettre à jour les récents pour le nouvel utilisateur
                if (this.recentItemsManager) {
                    this.recentItemsManager.updateForNewUser();
                }
            });

            window.addEventListener('session-expired', () => {
                if (this.authManager) {
                    this.authManager.clearSession();
                    this.updateProfileUI(null);
                }
            });

            await this.loadAuthModal();
            await this.loadSettingsModal();

            // Attendre que le DOM soit complètement chargé
            setTimeout(() => {
                const currentUser = this.authManager.getCurrentUser();
                this.logger.debug('Current user at init', { user: currentUser?.username });
                this.updateProfileUI(currentUser);
            }, 100);
            
            this.attachListeners();
            this.attachProfileListeners();
        } catch (error) {
            this.logger.error('Erreur import AuthManager', error);
        }
    }

    async loadAuthModal() {
        try {
            const response = await fetch('./components/auth-modal.html');
            if (!response.ok) throw new Error('Auth modal not found');
            const html = await response.text();
            document.getElementById('authModalContainer').innerHTML = html;
            this.attachAuthModalListeners();
        } catch (error) {
            this.logger.error('Erreur chargement auth modal', error);
        }
    }

    attachAuthModalListeners() {
        const authModal = document.getElementById('authModal');
        const authModalClose = document.getElementById('authModalClose');
        const authModalOverlay = document.getElementById('authModalOverlay');
        const authTabs = document.querySelectorAll('.auth-tab');
        const loginForm = document.getElementById('loginForm');
        const registerForm = document.getElementById('registerForm');

        authModalClose.addEventListener('click', () => {
            authModal.classList.add('hidden');
        });

        authModalOverlay.addEventListener('click', () => {
            authModal.classList.add('hidden');
        });

        authTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const mode = tab.dataset.mode;
                authTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                if (mode === 'login') {
                    loginForm.classList.remove('hidden');
                    registerForm.classList.add('hidden');
                } else {
                    loginForm.classList.add('hidden');
                    registerForm.classList.remove('hidden');
                }
            });
        });

        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('loginUsername').value;
            const password = document.getElementById('loginPassword').value;
            const errorEl = document.getElementById('loginError');

            const result = await this.authManager.login(username, password);

            if (result.success) {
                authModal.classList.add('hidden');
                loginForm.reset();
                errorEl.classList.add('hidden');
            } else {
                errorEl.textContent = result.message;
                errorEl.classList.remove('hidden');
            }
        });

        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('registerUsername').value;
            const password = document.getElementById('registerPassword').value;
            const passwordConfirm = document.getElementById('registerPasswordConfirm').value;
            const errorEl = document.getElementById('registerError');

            if (password !== passwordConfirm) {
                errorEl.textContent = 'Les mots de passe ne correspondent pas';
                errorEl.classList.remove('hidden');
                return;
            }

            const result = await this.authManager.register(username, password);

            if (result.success) {
                authModal.classList.add('hidden');
                registerForm.reset();
                errorEl.classList.add('hidden');
            } else {
                errorEl.textContent = result.message;
                errorEl.classList.remove('hidden');
            }
        });
    }

    updateProfileUI(user) {
        const profileAuth = document.getElementById('profileAuth');
        const profileUser = document.getElementById('profileUser');
        const profileUsername = document.getElementById('profileUsername');

        this.logger.debug('updateProfileUI called', { 
            user: user?.username, 
            profileAuth: !!profileAuth, 
            profileUser: !!profileUser
        });

        if (!profileAuth || !profileUser || !profileUsername) {
            this.logger.warn('Profile elements not found');
            return;
        }

        if (user) {
            this.logger.debug(`Showing user profile for: ${user.username}`);
            profileAuth.style.display = 'none';
            profileUser.style.display = 'flex';
            profileUsername.textContent = user.username;
        } else {
            this.logger.debug('Showing login buttons');
            profileAuth.style.display = 'flex';
            profileUser.style.display = 'none';
            profileUsername.textContent = '';
        }
    }

    attachProfileListeners() {
        const navProfile = document.getElementById('navProfile');
        const profileDropdown = document.getElementById('profileDropdown');
        const btnLogin = document.getElementById('btnLogin');
        const btnRegister = document.getElementById('btnRegister');
        const btnLogout = document.getElementById('btnLogout');
        const btnSettings = document.getElementById('btnSettings');

        if (!navProfile || !profileDropdown || !btnLogin || !btnRegister || !btnLogout) return;

        navProfile.addEventListener('click', (e) => {
            e.stopPropagation();
            profileDropdown.classList.toggle('hidden');
        });

        document.addEventListener('click', (e) => {
            if (!navProfile.contains(e.target) && !profileDropdown.contains(e.target)) {
                profileDropdown.classList.add('hidden');
            }
        });

        btnLogin.addEventListener('click', () => {
            this.showAuthModal('login');
            profileDropdown.classList.add('hidden');
        });

        btnRegister.addEventListener('click', () => {
            this.showAuthModal('register');
            profileDropdown.classList.add('hidden');
        });

        btnLogout.addEventListener('click', () => {
            this.authManager.logout();
            profileDropdown.classList.add('hidden');
        });

        if (btnSettings) {
            btnSettings.addEventListener('click', () => {
                this.showSettingsModal();
                profileDropdown.classList.add('hidden');
            });
        }
    }

    async loadSettingsModal() {
        try {
            const response = await fetch('./components/settings-modal.html');
            if (!response.ok) throw new Error('Settings modal not found');
            const html = await response.text();
            const container = document.getElementById('settingsModalContainer');
            if (container) container.innerHTML = html;
            this.attachSettingsModalListeners();
        } catch (error) {
            this.logger.error('Erreur chargement settings modal', error);
        }
    }

    showSettingsModal() {
        if (!this.authManager || !this.authManager.isAuthenticated()) return;
        const modal = document.getElementById('settingsModal');
        if (!modal) return;
        const user = this.authManager.getCurrentUser();
        const usernameInput = document.getElementById('settingsNewUsername');
        if (usernameInput && user) usernameInput.value = user.username || '';
        const usernameError = document.getElementById('settingsUsernameError');
        const passwordError = document.getElementById('settingsPasswordError');
        const deleteError = document.getElementById('settingsDeleteError');
        const deleteConfirmError = document.getElementById('settingsDeleteConfirmError');
        const deleteConfirm = document.getElementById('settingsDeleteConfirm');
        if (usernameError) { usernameError.classList.add('hidden'); usernameError.textContent = ''; }
        if (passwordError) { passwordError.classList.add('hidden'); passwordError.textContent = ''; }
        if (deleteError) { deleteError.classList.add('hidden'); deleteError.textContent = ''; }
        if (deleteConfirmError) { deleteConfirmError.classList.add('hidden'); deleteConfirmError.textContent = ''; }
        if (deleteConfirm) deleteConfirm.classList.add('hidden');
        modal.classList.remove('hidden');
    }

    attachSettingsModalListeners() {
        const modal = document.getElementById('settingsModal');
        const overlay = document.getElementById('settingsModalOverlay');
        const closeBtn = document.getElementById('settingsModalClose');
        const formUsername = document.getElementById('settingsFormUsername');
        const formPassword = document.getElementById('settingsFormPassword');
        const btnDeleteAccount = document.getElementById('settingsBtnDeleteAccount');
        const deleteConfirm = document.getElementById('settingsDeleteConfirm');
        const deletePassword = document.getElementById('settingsDeletePassword');
        const deleteConfirmBtn = document.getElementById('settingsDeleteConfirmBtn');
        const deleteCancelBtn = document.getElementById('settingsDeleteCancelBtn');

        if (!modal) return;

        const hideModal = () => modal.classList.add('hidden');

        if (closeBtn) closeBtn.addEventListener('click', hideModal);
        if (overlay) overlay.addEventListener('click', hideModal);

        if (formUsername) {
            formUsername.addEventListener('submit', async (e) => {
                e.preventDefault();
                const errEl = document.getElementById('settingsUsernameError');
                const input = document.getElementById('settingsNewUsername');
                const newUsername = (input && input.value || '').trim();
                if (!newUsername || newUsername.length < 3) {
                    if (errEl) { errEl.textContent = 'Le pseudo doit faire entre 3 et 20 caractères.'; errEl.classList.remove('hidden'); }
                    return;
                }
                if (errEl) errEl.classList.add('hidden');
                const result = await this.authManager.updateUsername(newUsername);
                if (result.success) {
                    hideModal();
                    if (this.showNotification) this.showNotification('Pseudo mis à jour.', 'success');
                } else {
                    if (errEl) { errEl.textContent = result.message || 'Erreur'; errEl.classList.remove('hidden'); }
                }
            });
        }

        if (formPassword) {
            formPassword.addEventListener('submit', async (e) => {
                e.preventDefault();
                const errEl = document.getElementById('settingsPasswordError');
                const current = document.getElementById('settingsCurrentPassword').value;
                const newPwd = document.getElementById('settingsNewPassword').value;
                const confirm = document.getElementById('settingsNewPasswordConfirm').value;
                if (newPwd !== confirm) {
                    if (errEl) { errEl.textContent = 'Les deux mots de passe ne correspondent pas.'; errEl.classList.remove('hidden'); return; }
                }
                if (errEl) errEl.classList.add('hidden');
                const result = await this.authManager.changePassword(current, newPwd);
                if (result.success) {
                    hideModal();
                    if (this.showNotification) this.showNotification('Mot de passe modifié.', 'success');
                    document.getElementById('settingsCurrentPassword').value = '';
                    document.getElementById('settingsNewPassword').value = '';
                    document.getElementById('settingsNewPasswordConfirm').value = '';
                } else {
                    if (errEl) { errEl.textContent = result.message || 'Erreur'; errEl.classList.remove('hidden'); }
                }
            });
        }

        if (btnDeleteAccount) {
            btnDeleteAccount.addEventListener('click', () => {
                document.getElementById('settingsDeleteError').classList.add('hidden');
                if (deleteConfirm) deleteConfirm.classList.remove('hidden');
                if (deletePassword) deletePassword.value = '';
            });
        }
        if (deleteCancelBtn) {
            deleteCancelBtn.addEventListener('click', () => {
                if (deleteConfirm) deleteConfirm.classList.add('hidden');
                document.getElementById('settingsDeleteConfirmError').classList.add('hidden');
            });
        }
        if (deleteConfirmBtn && deletePassword) {
            deleteConfirmBtn.addEventListener('click', async () => {
                const errEl = document.getElementById('settingsDeleteConfirmError');
                const password = deletePassword.value;
                if (!password) {
                    if (errEl) { errEl.textContent = 'Saisissez votre mot de passe.'; errEl.classList.remove('hidden'); return; }
                }
                if (errEl) errEl.classList.add('hidden');
                const result = await this.authManager.deleteAccount(password);
                if (result.success) {
                    hideModal();
                    window.location.reload();
                } else {
                    if (errEl) { errEl.textContent = result.message || 'Erreur'; errEl.classList.remove('hidden'); }
                }
            });
        }
    }

    showAuthModal(mode) {
        const authModal = document.getElementById('authModal');
        const authTabs = document.querySelectorAll('.auth-tab');
        const loginForm = document.getElementById('loginForm');
        const registerForm = document.getElementById('registerForm');

        authModal.classList.remove('hidden');

        authTabs.forEach(tab => {
            if (tab.dataset.mode === mode) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });

        if (mode === 'login') {
            loginForm.classList.remove('hidden');
            registerForm.classList.add('hidden');
        } else {
            loginForm.classList.add('hidden');
            registerForm.classList.remove('hidden');
        }
    }

    getLastPage() {
        try {
            return localStorage.getItem(this.storageKey);
        } catch (error) {
            logger.warn('⚠️ Impossible d\'accéder au localStorage:', error);
            return null;
        }
    }

    saveCurrentPage(pageName) {
        try {
            localStorage.setItem(this.storageKey, pageName);
        } catch (error) {
            logger.warn('⚠️ Impossible de sauvegarder la page:', error);
        }
    }

    trackPageVisit(pageName) {
        try {
            // Ne pas tracker la page d'accueil pour éviter les doublons
            if (pageName === 'home') return;

            // Créer le gestionnaire s'il n'existe pas
            if (!window.recentItemsManager) {
                import('./assets/js/modules/recent/RecentItemsManager.js')
                    .then(module => {
                        const RecentItemsManager = module.default;
                        window.recentItemsManager = new RecentItemsManager({ maxItems: 5 });
                        window.recentItemsManager.trackPageVisit(pageName);
                    })
                    .catch(error => {
                        logger.error('❌ Erreur import RecentItemsManager:', error);
                    });
            } else {
                // Tracker la visite si le gestionnaire existe
                window.recentItemsManager.trackPageVisit(pageName);
            }
        } catch (error) {
            logger.warn('⚠️ Impossible de tracker la visite:', error);
        }
    }

    loadComponentDirect(elementId, html, onLoad) {
        try {
            const element = document.getElementById(elementId);
            if (!element) {
                logger.error(`❌ Element ${elementId} not found`);
                return;
            }
            element.innerHTML = html;
            if (onLoad) onLoad();
        } catch (error) {
            logger.error(`❌ Erreur chargement ${elementId}:`, error);
        }
    }

    async loadComponent(elementId, url, onLoad) {
        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Component ${elementId} not found`);
            const html = await response.text();
            document.getElementById(elementId).innerHTML = html;
            if (onLoad) onLoad();
        } catch (error) {
            logger.error(`❌ Erreur chargement ${elementId}:`, error);
        }
    }

    initializeSystemInfo() {
        import('./assets/js/modules/system/SystemInfoManager.js')
            .then(module => {
                const SystemInfoManager = module.default;
                window.systemInfoManager = new SystemInfoManager({
                    ipElementId: 'footer-ip-value',
                    ramElementId: 'footer-ram-value',
                    connectionElementId: 'footer-connection-value',
                    connectionIconId: 'footer-connection-icon',
                    serverElementId: 'footer-server-value',
                    serverIconId: 'footer-server-icon',
                    updateInterval: 5000
                });
            })
            .catch(error => {
                logger.error('❌ Erreur import SystemInfoManager:', error);
            });
    }

    /**
     * Afficher la version de l'app dans le footer (Electron = app.getVersion(), sinon fallback V3.0).
     */
    updateFooterVersion() {
        const el = document.getElementById('footer-app-version');
        if (!el) return;
        if (typeof window.electron?.invoke === 'function') {
            window.electron.invoke('get-app-config')
                .then(config => {
                    if (config?.appVersion) el.textContent = 'V' + config.appVersion;
                })
                .catch(() => {});
        }
    }

    /**
     * Ferme tous les <dialog> dans un conteneur (évite que les modales s'ouvrent automatiquement après injection HTML).
     */
    closeAllDialogsIn(container) {
        if (!container || !container.querySelectorAll) return;
        const dialogs = container.querySelectorAll('dialog');
        dialogs.forEach(dialog => {
            if (typeof dialog.close === 'function') dialog.close();
            dialog.removeAttribute('open');
            const id = dialog.id;
            if (id && window.modalManager && typeof window.modalManager.forget === 'function') {
                window.modalManager.forget(id);
            }
        });
    }

    async loadPage(pageName) {
        try {
            const isReceptionSubPage = ['entrer', 'sortie', 'inventaire', 'historique', 'tracabilite', 'disques'].includes(pageName);
            
            // Si c'est une sous-page de réception, charger d'abord reception.html
            if (isReceptionSubPage) {
                const receptionResponse = await fetch('./pages/reception.html');
                if (!receptionResponse.ok) throw new Error(`HTTP error! status: ${receptionResponse.status}`);
                let receptionHtml = await receptionResponse.text();
                receptionHtml = this.transformFileManagers(receptionHtml);
                receptionHtml = this.transformAppManagers(receptionHtml);
                const contentEl = document.getElementById(this.contentContainer);
                contentEl.innerHTML = receptionHtml;
                this.closeAllDialogsIn(contentEl);

                // Puis charger la sous-page dans recep-section
                const pagePath = `./pages/reception-pages/${pageName}.html`;
                const response = await fetch(pagePath);
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                let html = await response.text();
                html = this.transformFileManagers(html);
                html = this.transformAppManagers(html);
                const recepSection = document.querySelector('.recep-section');
                if (recepSection) {
                    recepSection.innerHTML = html;
                    this.closeAllDialogsIn(recepSection);
                }
                this.setReceptionNavActive(pageName);
            } else {
                // Si on clique sur "Réception" du header, rediriger vers "entrer" par défaut
                if (pageName === 'reception') {
                    return this.loadPage('entrer');
                }
                
                // Déterminer le chemin de la page
                let pagePath = `./pages/${pageName}.html`;
                const response = await fetch(pagePath);
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                
                let html = await response.text();
                html = this.transformFileManagers(html);
                html = this.transformAppManagers(html);
                const contentEl = document.getElementById(this.contentContainer);
                // Retirer les modales agenda du body si elles y ont été déplacées (évite doublons d’id au rechargement agenda)
                ['agenda-create-modal', 'agenda-edit-modal', 'agenda-delete-modal'].forEach((id) => {
                    document.getElementById(id)?.remove();
                });
                contentEl.innerHTML = html;
                this.closeAllDialogsIn(contentEl);
            }

            /* Fermer tout dialog restant dans le document (sécurité) */
            this.closeAllDialogsIn(document.body);

            this.saveCurrentPage(pageName);
            this.trackPageVisit(pageName);
            // Pour les sous-pages reception, utiliser la config 'reception'
            const layoutPageName = isReceptionSubPage ? 'reception' : pageName;
            this.updateLayout(layoutPageName);
            this.initializeChatIfNeeded();
            this.initializeTimeIfNeeded();
            this.initializePageElements(pageName);
            this.attachListeners();
            this.attachReceptionPageListeners();
            this.initializeFileManagers();
            this.initializeAppManagers();
        } catch (error) {
            logger.error(`❌ Erreur lors du chargement de ${pageName}:`, error);
            this.showError(pageName);
        }
    }

    transformFileManagers(html) {
        // Remplace {{filemanagerX}} ... {{/filemanagerX}} (avec espaces tolérés) par un conteneur dédié
        const re = /\{\{\s*filemanager(\w+)\s*\}\}[\s\S]*?\{\{\s*\/filemanager\1\s*\}\}/gi;
        return html.replace(re, (_match, name) => {
            const key = name.toLowerCase();
            return `<div class="filemanager" data-fm="${key}"></div>`;
        });
    }

    transformAppManagers(html) {
        // Remplace {{appmanagerX}} ... {{/appmanagerX}} par un conteneur dédié
        const re = /\{\{\s*appmanager(\w+)\s*\}\}[\s\S]*?\{\{\s*\/appmanager\1\s*\}\}/gi;
        return html.replace(re, (_match, name) => {
            const key = name.toLowerCase();
            return `<div class="app-manager" data-app="${key}"></div>`;
        });
    }

    initializeTimeIfNeeded() {
        const timeElement = document.getElementById('current-time');
        const dateElement = document.getElementById('current-date');
        
        if (timeElement && dateElement) {
            if (window.timeManager) {
                window.timeManager.destroy();
            }
            
            import('./assets/js/modules/time/TimeManager.js')
                .then(module => {
                    const TimeManager = module.default;
                    window.timeManager = new TimeManager({
                        dateElementId: 'current-date',
                        timeElementId: 'current-time',
                        updateInterval: 1000
                    });
                })
                .catch(error => {
                    logger.error('❌ Erreur import TimeManager:', error);
                });
        } else {
            if (window.timeManager) {
                window.timeManager.destroy();
                window.timeManager = null;
            }
        }
    }

    initializeChatIfNeeded() {
        const chatMessagesContainer = document.getElementById('chat-messages');
        if (!chatMessagesContainer) return;
        if (window.chatManager) return;
        Promise.all([
            import('./assets/js/modules/chat/ChatManager.js'),
            import('./assets/js/config/ChatSecurityConfig.js')
        ]).then(async ([chatModule, configModule]) => {
            const ChatManager = chatModule.default;
            const securityConfig = configModule.default;
            const apiModule = await import('./assets/js/config/api.js');
            const wsUrl = apiModule.default.getWsUrl?.() || (window.APP_CONFIG?.serverWsUrl);
            window.chatManager = new ChatManager({
                wsUrl,
                messagesContainerId: 'chat-messages',
                inputId: 'chat-input',
                sendButtonId: 'chat-send',
                pseudoDisplayId: 'chat-pseudo-display',
                securityConfig: securityConfig
            });
        }).catch(error => {
            logger.error('❌ Erreur import ChatManager:', error);
        });
    }

    initializePageElements(pageName) {
        if (pageName === 'home') {
            Promise.all([
                import('./assets/js/modules/pdf/PDFManager.js'),
                import('./assets/js/config/PDFConfig.js'),
                import('./assets/js/modules/recent/RecentItemsManager.js')
            ]).then(([pdfModule, configModule, recentModule]) => {
                const PDFManager = pdfModule.default;
                const pdfConfig = configModule.pdfConfig;
                const RecentItemsManager = recentModule.default;
                
                window.pdfManager = new PDFManager();
                window.pdfManager.attachPDFListeners(pdfConfig);

                // Initialiser le gestionnaire des éléments récents
                if (!window.recentItemsManager) {
                    window.recentItemsManager = new RecentItemsManager({ maxItems: 5 });
                    logger.debug('✅ RecentItemsManager créé');
                } else {
                    logger.debug('♻️ RecentItemsManager réutilisé');
                }
                
                // Afficher les éléments récents après un court délai pour laisser le DOM se stabiliser
                requestAnimationFrame(() => {
                    if (window.recentItemsManager) {
                        window.recentItemsManager.display();
                        logger.debug('✅ RecentItemsManager affiché');
                    }
                });
            }).catch(error => {
                logger.error('❌ Erreur import modules home:', error);
            });

            import('./assets/js/modules/agenda/AgendaStore.js')
                .then(module => {
                    const AgendaStore = module.default;
                    this.loadTodayEvents(AgendaStore);
                })
                .catch(error => {
                    logger.error('❌ Erreur import AgendaStore:', error);
                });

            this.initializeHomeModals();
        } else if (pageName === 'agenda') {
            import('./assets/js/modules/agenda/AgendaInit.js')
                .then(module => {
                    module.destroyAgenda();
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => module.initAgenda());
                    });
                })
                .catch(error => {
                    logger.error('❌ Erreur import AgendaInit:', error);
                });
        } else if (pageName === 'shortcut') {
            import('./assets/js/modules/shortcut/ShortcutManager.js')
                .then(async module => {
                    const ShortcutManager = module.default;
                    if (window.shortcutManager) {
                        window.shortcutManager.destroy();
                    }
                    window.shortcutManager = new ShortcutManager();
                    await window.shortcutManager.init();
                })
                .catch(error => {
                    logger.error('❌ Erreur import ShortcutManager:', error);
                });
        } else if (pageName === 'entrer') {
            // Empêcher la double initialisation
            if (window.gestionLotsManagerInitializing) {
                logger.debug('⏳ GestionLotsManager déjà en cours d\'initialisation, skip');
                return;
            }
            
            // Détruire l'ancien manager s'il existe (changement de page)
            if (window.gestionLotsManager) {
                window.gestionLotsManager.destroy();
                window.gestionLotsManager = null;
                logger.debug('ℹ️ Ancien GestionLotsManager détruit');
            }
            
            // Marquer comme en cours d'initialisation
            window.gestionLotsManagerInitializing = true;
            
            // Initialiser un nouveau gestionnaire de lots
            import('./assets/js/modules/reception/gestion-lots.js')
                .then(module => {
                    const GestionLotsManager = module.default;
                    window.gestionLotsManager = new GestionLotsManager(window.modalManager);
                    logger.debug('✅ GestionLotsManager initialisé depuis app.js');
                    // Libérer le flag après un court délai
                    setTimeout(() => {
                        window.gestionLotsManagerInitializing = false;
                    }, 500);
                })
                .catch(error => {
                    logger.error('❌ Erreur import GestionLotsManager:', error);
                    window.gestionLotsManagerInitializing = false;
                });
        } else if (pageName === 'inventaire') {
            // Détruire l'ancien manager s'il existe
            if (window.inventaireManager) {
                window.inventaireManager.destroy();
                window.inventaireManager = null;
            }
            
            // Initialiser le gestionnaire d'inventaire
            import('./assets/js/modules/reception/inventaire.js')
                .then(module => {
                    const InventaireManager = module.default;
                    window.inventaireManager = new InventaireManager(window.modalManager);
                    logger.debug('✅ InventaireManager initialisé depuis app.js');
                })
                .catch(error => {
                    logger.error('❌ Erreur import InventaireManager:', error);
                });
        } else if (pageName === 'historique') {
            // Détruire l'ancien manager s'il existe
            if (window.historiqueManager) {
                window.historiqueManager.destroy();
                window.historiqueManager = null;
            }
            
            // Initialiser le gestionnaire d'historique
            import('./assets/js/modules/reception/historique.js')
                .then(module => {
                    const HistoriqueManager = module.default;
                    window.historiqueManager = new HistoriqueManager(window.modalManager);
                    logger.debug('✅ HistoriqueManager initialisé depuis app.js');
                })
                .catch(error => {
                    logger.error('❌ Erreur import HistoriqueManager:', error);
                });
        } else if (pageName === 'tracabilite') {
            // Détruire l'ancien manager s'il existe
            if (window.tracabiliteManager) {
                window.tracabiliteManager.destroy();
                window.tracabiliteManager = null;
            }
            
            // Initialiser le gestionnaire de traçabilité
            import('./assets/js/modules/reception/tracabilite.js')
                .then(module => {
                    const TracabiliteManager = module.default;
                    window.tracabiliteManager = new TracabiliteManager(window.modalManager);
                    logger.debug('✅ TracabiliteManager initialisé depuis app.js');
                })
                .catch(error => {
                    logger.error('❌ Erreur import TracabiliteManager:', error);
                });
        } else if (pageName === 'disques') {
            if (window.disquesManager) {
                window.disquesManager.destroy();
                window.disquesManager = null;
            }
            import('./assets/js/modules/reception/disques.js')
                .then(module => {
                    const DisquesManager = module.default;
                    window.disquesManager = new DisquesManager(window.modalManager);
                    logger.debug('✅ DisquesManager initialisé depuis app.js');
                })
                .catch(error => {
                    logger.error('❌ Erreur import DisquesManager:', error);
                });
        }
    }

    async initializeFileManagers() {
        const fmContainers = document.querySelectorAll('.filemanager[data-fm]');
        if (!fmContainers.length) return;

        try {
            const [managerModule, configModule] = await Promise.all([
                import('./assets/js/modules/folder/FolderManager.js'),
                import('./assets/js/config/FolderConfig.js')
            ]);
            const FolderManager = managerModule.default;
            const folderConfig = configModule.folderConfig || configModule.default;

            // Nettoyer une instance globale éventuelle
            if (window.folderManagers) {
                window.folderManagers.forEach(m => m.destroy());
            }
            window.folderManagers = [];

            fmContainers.forEach(container => {
                const key = container.dataset.fm?.toLowerCase();
                const cfg = folderConfig.resolvePreset(key);

                // Construire le markup interne
                container.innerHTML = `<div class="folders-list"></div>`;

                const manager = new FolderManager({
                    scope: container,
                    buttonSelector: '.folder-open-btn',
                    listSelector: '.folders-list',
                    preset: key,
                    config: cfg
                });
                window.folderManagers.push(manager);
            });
        } catch (error) {
            logger.error('❌ Erreur initialisation FileManagers:', error);
        }
    }

    async initializeAppManagers() {
        const appContainers = document.querySelectorAll('.app-manager[data-app]');
        if (!appContainers.length) return;

        try {
            const [managerModule, configModule] = await Promise.all([
                import('./assets/js/modules/app/AppManager.js'),
                import('./assets/js/config/AppConfig.js')
            ]);
            const AppManager = managerModule.default;

            if (window.appManagers) {
                window.appManagers.forEach(m => m.destroy());
            }
            window.appManagers = [];

            appContainers.forEach(container => {
                const preset = container.dataset.app?.toLowerCase();
                logger.debug('🔧 Initialisation AppManager:', preset, container);
                const manager = new AppManager({
                    scope: container,
                    preset: preset
                });
                window.appManagers.push(manager);
            });
        } catch (error) {
            logger.error('❌ Erreur initialisation AppManagers:', error);
        }
    }

    async loadTodayEvents(AgendaStore) {
        try {
            const today = new Date();
            const todayStr = this.formatLocalISODate(today);
            
            const allEvents = await AgendaStore.getAllEvents();
            const todayEvents = allEvents.filter(ev => {
                const eventStart = ev.start.substring(0, 10);
                const eventEnd = ev.end.substring(0, 10);
                return todayStr >= eventStart && todayStr <= eventEnd;
            });

            todayEvents.sort((a, b) => a.start.localeCompare(b.start));

            const homeSection = document.querySelector('.home.section');
            if (!homeSection) return;
            
            const blockContents = homeSection.querySelectorAll('.block-content');
            const calendarContent = blockContents[1];
            
            if (calendarContent) {
                if (todayEvents.length === 0) {
                    calendarContent.innerHTML = '<p class="home-event-item-empty">Aucun événement pour aujourd\'hui</p>';
                } else {
                    calendarContent.innerHTML = todayEvents.map(event => {
                        const startTime = event.start.substring(11, 16);
                        const endTime = event.end.substring(11, 16);
                        const eventColor = event.color || '#3788d8';
                        const backgroundColor = eventColor + '20';
                        return `
                            <div class="home-event-item" data-color="${eventColor}" data-bg-color="${backgroundColor}">
                                <div class="home-event-item-title">${event.title}</div>
                                <div class="home-event-item-time">
                                    ${startTime} à ${endTime}
                                </div>
                                ${event.description ? `<div class="home-event-item-description">${event.description}</div>` : ''}
                            </div>
                        `;
                    }).join('');
                    
                    document.querySelectorAll('.home-event-item').forEach(el => {
                        const color = el.getAttribute('data-color');
                        const bgColor = el.getAttribute('data-bg-color');
                        el.style.backgroundColor = bgColor;
                        el.style.borderLeft = `4px solid ${color}`;
                    });
                }
            }
        } catch (error) {
            logger.error('❌ Erreur chargement événements du jour:', error);
            const calendarContent = document.querySelector('.calendar-content');
            if (calendarContent) {
                calendarContent.innerHTML = '<p class="home-event-item-empty">Erreur lors du chargement des événements</p>';
            }
        }
    }

    formatLocalISODate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * Initialise les modales de la page d'accueil (liste adhérents, feedback)
     */
    initializeHomeModals() {
        const feedbackSubmit = document.getElementById('feedback-submit-btn');
        const feedbackMessage = document.getElementById('feedback-message');
        const feedbackType = document.getElementById('feedback-type');
        const feedbackCharCount = document.getElementById('feedback-char-count');
        if (feedbackMessage && feedbackCharCount) {
            feedbackMessage.addEventListener('input', () => {
                feedbackCharCount.textContent = feedbackMessage.value.length;
            });
            feedbackMessage.dispatchEvent(new Event('input'));
        }
        if (feedbackSubmit) {
            feedbackSubmit.addEventListener('click', () => this.submitFeedback());
        }
    }

    /**
     * Envoie le formulaire de feedback vers POST /api/monitoring/errors (panel admin / issues).
     * Payload aligné sur le serveur (branche proxmox) : clientId, errorType, errorMessage, userMessage, etc.
     */
    async submitFeedback() {
        const messageEl = document.getElementById('feedback-message');
        const typeEl = document.getElementById('feedback-type');
        if (!messageEl || !typeEl) return;
        const message = messageEl.value.trim();
        if (!message) return;

        const formType = typeEl.value || 'feedback';
        const submitBtn = document.getElementById('feedback-submit-btn');
        if (submitBtn) submitBtn.disabled = true;

        const api = (await import('./assets/js/config/api.js')).default;
        await api.init();
        const endpoint = api.getUrl('monitoring.errors');
        const token = localStorage.getItem('workspace_jwt');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const clientId = localStorage.getItem('workspace_client_id') || 'web-' + (navigator.userAgent || '').slice(0, 50);
        const errorType = formType === 'bug' ? 'bug_report' : formType;
        const errorMessage = formType === 'bug'
            ? `[Bug] ${message.substring(0, 80)}${message.length > 80 ? '…' : ''}`
            : `[Feedback] ${message.substring(0, 80)}${message.length > 80 ? '…' : ''}`;

        const payload = {
            clientId,
            clientVersion: typeof this.getAppVersion === 'function' ? this.getAppVersion() : '1.0',
            platform: navigator.platform || '',
            errorType,
            errorMessage,
            context: 'Formulaire « Faire un retour »',
            userMessage: message.substring(0, 500),
            userAgent: navigator.userAgent ? navigator.userAgent.substring(0, 500) : undefined
        };

        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify(payload)
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success !== false) {
                window.modalManager?.close('modal-feedback');
                messageEl.value = '';
                const charCount = document.getElementById('feedback-char-count');
                if (charCount) charCount.textContent = '0';
                this.showNotification?.('Merci, votre retour a bien été envoyé. Il sera visible dans le panel de suivi.', 'success');
            } else {
                const errMsg = data.error || data.message || `Erreur ${res.status}`;
                this.showNotification?.(`Envoi impossible : ${errMsg}`, 'error');
                logger.warn('Feedback non enregistré:', res.status, data);
            }
        } catch (e) {
            this.showNotification?.('Envoi impossible. Vérifiez la connexion au serveur.', 'error');
            logger.error('Erreur envoi feedback:', e);
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    /**
     * Affiche une notification toast (feedback, erreur, succès)
     */
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.setAttribute('role', 'status');
        let icon = '<i class="fa-solid fa-circle-info"></i>';
        if (type === 'success') icon = '<i class="fa-solid fa-check-circle"></i>';
        else if (type === 'error') icon = '<i class="fa-solid fa-exclamation-circle"></i>';
        notification.innerHTML = `${icon}<span>${String(message).replace(/</g, '&lt;')}</span>`;
        document.body.appendChild(notification);
        requestAnimationFrame(() => notification.classList.add('show'));
        setTimeout(() => {
            notification.classList.add('hide');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    updateLayout(pageName) {
        const header = document.getElementById('header');
        const footer = document.getElementById('footer');
        
        const config = this.pagesConfig[pageName];
        
        if (!config) {
            logger.warn(`⚠️ Configuration manquante pour : ${pageName}`);
            return;
        }
        
        window.navManager?.closeMenu();
        
        header.style.display = config.showHeader ? 'block' : 'none';
        footer.style.display = config.showFooter ? 'block' : 'none';
        
        const chatWidget = document.getElementById('chat-widget-wrapper');
        if (chatWidget) {
            chatWidget.style.display = config.showChat ? 'flex' : 'none';
            
            if (!config.showChat && window.chatWidgetManager) {
                window.chatWidgetManager.closePanel();
            }
        }
        
        const layoutType = config.showHeader ? '📱 Normal' : '🔒 Full-screen';
    }

    showError(pageName) {
        const errorHTML = `
            <div style="color: red; padding: 20px;">
                <h2>❌ Erreur de chargement</h2>
                <p>Impossible de charger la page : <strong>${pageName}</strong></p>
                <p>Vérifiez que le fichier existe : <code>public/pages/${pageName}.html</code></p>
            </div>
        `;
        document.getElementById(this.contentContainer).innerHTML = errorHTML;
    }

    attachListeners() {
        const buttons = document.querySelectorAll('[data-page]');
        
        buttons.forEach(button => {
            if (!button.dataset.listenerAttached) {
                button.addEventListener('click', (event) => {
                    event.preventDefault();
                    const pageName = button.dataset.page;
                    this.loadPage(pageName);
                });
                
                button.dataset.listenerAttached = 'true';
            }
        });
    }

    setReceptionNavActive(pageName) {
        const buttons = document.querySelectorAll('[data-reception-page="true"]');
        buttons.forEach(btn => {
            btn.classList.remove('active');
            btn.removeAttribute('aria-current');
            if (btn.dataset.page === pageName) {
                btn.classList.add('active');
                btn.setAttribute('aria-current', 'page');
            }
        });
    }

    attachReceptionPageListeners() {
        const receptionButtons = document.querySelectorAll('[data-reception-page="true"]');
        
        receptionButtons.forEach(button => {
            if (!button.dataset.receptionListenerAttached) {
                button.addEventListener('click', (event) => {
                    event.preventDefault();
                    const pageName = button.dataset.page;
                    this.loadPage(pageName);
                });
                
                button.dataset.receptionListenerAttached = 'true';
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.pageManager = new PageManager();
});