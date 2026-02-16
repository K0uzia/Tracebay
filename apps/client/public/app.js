class PageManager {
    constructor() {
        this.contentContainer = 'content';
        this.storageKey = 'workspace_current_page';
        this.authManager = null;
        this.serverUrl = null;
        this.serverConnected = false;
        
        // Pages et leur configuration de layout
        this.pagesConfig = {
            'home': { showHeader: true, showFooter: true, showChat: true },
            'agenda': { showHeader: true, showFooter: false, showChat: false },
            'dossier': { showHeader: true, showFooter: true, showChat: true },
            'application': { showHeader: true, showFooter: true, showChat: true },
            'reception': { showHeader: true, showFooter: false, showChat: false },
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

        // Initialiser le gestionnaire de connexion serveur
        await this.initializeServerConnection();

        // Charger les composants HTML
        await this.loadComponent('header', './components/header.html', () => this.initializeAuth());
        await this.loadComponent('footer', './components/footer.html', () => this.initializeSystemInfo());
        
        // Initialiser le gestionnaire de notifications de mise à jour
        await this.initializeUpdateNotifier();
        
        // Charger la page sauvegardée ou home
        const lastPage = this.getLastPage();
        const pageToLoad = lastPage && this.pagesConfig[lastPage] ? lastPage : 'home';
        this.loadPage(pageToLoad);
    }

    async initializeUpdateNotifier() {
        try {
            if (typeof window !== 'undefined' && window.electron) {
                const config = await window.electron.invoke('get-app-config');
                if (config && config.isProduction) {
                    const UpdateNotifierModule = await import('./assets/js/modules/system/UpdateNotifier.js');
                    window.updateNotifier = new UpdateNotifierModule.default();
                    this.logger.info('UpdateNotifier initialisé');
                }
            }
        } catch (error) {
            this.logger.warn('Impossible d\'initialiser UpdateNotifier:', error);
        }
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

            await this.loadAuthModal();
            
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
            const isReceptionSubPage = ['entrer', 'sortie', 'inventaire', 'historique', 'tracabilite'].includes(pageName);
            
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
        
        if (chatMessagesContainer) {
            Promise.all([
                import('./assets/js/modules/chat/ChatManager.js'),
                import('./assets/js/config/ChatSecurityConfig.js')
            ]).then(([chatModule, configModule]) => {
                const ChatManager = chatModule.default;
                const securityConfig = configModule.default;
                
                window.chatManager = new ChatManager({
                    serverUrl: this.serverUrl || window.APP_CONFIG?.serverUrl || 'http://localhost:8060',
                    messagesContainerId: 'chat-messages',
                    inputId: 'chat-input',
                    sendButtonId: 'chat-send',
                    pseudoInputId: 'chat-pseudo-input',
                    pseudoConfirmId: 'chat-pseudo-confirm',
                    pseudoDisplayId: 'chat-pseudo-display',
                    pseudoErrorId: 'chat-pseudo-error',
                    clearChatBtnId: 'chat-clear-btn',
                    pseudoWrapperId: 'chat-pseudo-input-wrapper',
                    securityConfig: securityConfig
                });
            }).catch(error => {
                logger.error('❌ Erreur import ChatManager:', error);
            });
        }
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
     * Envoie le formulaire de feedback vers le système de monitoring
     */
    async submitFeedback() {
        const messageEl = document.getElementById('feedback-message');
        const typeEl = document.getElementById('feedback-type');
        if (!messageEl || !typeEl) return;
        const message = messageEl.value.trim();
        if (!message) return;
        const feedbackType = typeEl.value || 'feedback';
        const serverUrl = this.connectionConfig?.getServerUrl?.() || this.serverUrl || '';
        const endpoint = `${serverUrl}/api/monitoring/errors`;
        const submitBtn = document.getElementById('feedback-submit-btn');
        if (submitBtn) submitBtn.disabled = true;
        try {
            const payload = {
                clientId: window.app?.connectionConfig?.clientId || 'web-' + (navigator.userAgent || '').slice(0, 50),
                clientVersion: typeof window.app?.getAppVersion === 'function' ? window.app.getAppVersion() : '1.0',
                platform: navigator.platform || '',
                errorType: feedbackType,
                errorMessage: message.substring(0, 1000),
                context: 'Formulaire « Faire un retour »',
                userMessage: message.substring(0, 500)
            };
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                window.modalManager?.close('modal-feedback');
                messageEl.value = '';
                document.getElementById('feedback-char-count').textContent = '0';
                this.showNotification?.('Merci, votre retour a bien été envoyé.', 'success');
            } else {
                const err = await res.text();
                this.showNotification?.(`Envoi impossible : ${res.status}. Réessayez plus tard.`, 'error');
                logger.warn('Feedback non enregistré:', res.status, err);
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
        notification.className = `notification notification-${type}`;
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