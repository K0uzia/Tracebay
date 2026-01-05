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
            'reception': { showHeader: true, showFooter: true, showChat: false },
            'shortcut': { showHeader: true, showFooter: true, showChat: true },
            'option': { showHeader: true, showFooter: true, showChat: false },
            'login': { showHeader: false, showFooter: false, showChat: false },
            'signup': { showHeader: false, showFooter: false, showChat: false }
        };
        
        this.init();
    }

    async init() {
        let config = null;
        // Récupérer la config du serveur depuis le processus principal
        try {
            if (window.ipcRenderer && window.ipcRenderer.invoke) {
                config = await window.ipcRenderer.invoke('get-app-config');
                const serverConfig = await window.ipcRenderer.invoke('get-server-config');
                
                this.serverUrl = config.serverUrl || 'http://localhost:8060';
                this.serverWsUrl = config.serverWsUrl || 'ws://localhost:8060';
                this.serverConnected = !!config.serverConnected;
                this.serverMode = config.serverMode || 'local';
                this.serverConfig = serverConfig;
                
                console.log(`📡 Mode serveur: ${this.serverMode}`);
                console.log(`🔗 URL: ${this.serverUrl}`);
                console.log(`🔌 WebSocket: ${this.serverWsUrl}`);
            } else {
                this.serverUrl = 'http://localhost:8060';
                this.serverWsUrl = 'ws://localhost:8060';
            }
        } catch (error) {
            console.error('❌ Erreur récupération config:', error);
            this.serverUrl = 'http://localhost:8060';
            this.serverWsUrl = 'ws://localhost:8060';
            this.serverConnected = false;
        }

        // Exposer serverUrl et état serveur globalement pour les modules
        window.APP_CONFIG = {
            serverUrl: this.serverUrl,
            serverWsUrl: this.serverWsUrl,
            serverConnected: this.serverConnected,
            serverMode: this.serverMode
        };

        // Initialiser le gestionnaire de connexion serveur
        await this.initializeServerConnection();

        // Charger les composants HTML
        await this.loadComponent('header', './components/header.html', () => this.initializeAuth());
        await this.loadComponent('footer', './components/footer.html', () => this.initializeSystemInfo());
        
        // Charger la page sauvegardée ou home
        const lastPage = this.getLastPage();
        const pageToLoad = lastPage && this.pagesConfig[lastPage] ? lastPage : 'home';
        this.loadPage(pageToLoad);
    }

    async initializeServerConnection() {
        try {
            if (!this.serverConfig) return;
            
            const module = await import('./assets/js/modules/system/ServerConnectionManager.js');
            const ServerConnectionManager = module.default;
            
            this.serverConnectionManager = new ServerConnectionManager({
                url: this.serverUrl,
                ws: this.serverWsUrl,
                healthCheckInterval: this.serverConfig.healthCheckInterval || 30000,
                reconnectDelay: this.serverConfig.reconnectDelay || 3000,
                maxReconnectAttempts: this.serverConfig.maxReconnectAttempts || 5
            });

            this.serverConnectionManager.onStatusChange((status, data) => {
                console.log(`📡 Statut serveur: ${status}`, data);
                this.serverConnected = (status === 'connected');
                window.APP_CONFIG.serverConnected = this.serverConnected;
                this.updateServerStatus(status, data);
            });

            this.serverConnectionManager.start();
            console.log('✅ ServerConnectionManager initialisé');
        } catch (error) {
            console.error('❌ Erreur init ServerConnectionManager:', error);
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
                console.log('🔄 Auth change event:', user);
                this.updateProfileUI(user);
            });

            await this.loadAuthModal();
            
            // Attendre que le DOM soit complètement chargé
            setTimeout(() => {
                const currentUser = this.authManager.getCurrentUser();
                console.log('👤 Current user at init:', currentUser);
                this.updateProfileUI(currentUser);
            }, 100);
            
            this.attachListeners();
            this.attachProfileListeners();
        } catch (error) {
            console.error('❌ Erreur import AuthManager:', error);
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
            console.error('❌ Erreur chargement auth modal:', error);
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

        console.log('🎨 updateProfileUI called:', { 
            user, 
            profileAuth: !!profileAuth, 
            profileUser: !!profileUser,
            profileAuthClasses: profileAuth?.className,
            profileUserClasses: profileUser?.className
        });

        if (!profileAuth || !profileUser || !profileUsername) {
            console.warn('⚠️ Profile elements not found');
            return;
        }

        if (user) {
            console.log('✅ Showing user profile for:', user.username);
            profileAuth.style.display = 'none';
            profileUser.style.display = 'flex';
            profileUsername.textContent = user.username;
            console.log('After update:', {
                profileAuthDisplay: profileAuth.style.display,
                profileUserDisplay: profileUser.style.display
            });
        } else {
            console.log('❌ Showing login buttons');
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
            console.warn('⚠️ Impossible d\'accéder au localStorage:', error);
            return null;
        }
    }

    saveCurrentPage(pageName) {
        try {
            localStorage.setItem(this.storageKey, pageName);
        } catch (error) {
            console.warn('⚠️ Impossible de sauvegarder la page:', error);
        }
    }

    loadComponentDirect(elementId, html, onLoad) {
        try {
            const element = document.getElementById(elementId);
            if (!element) {
                console.error(`❌ Element ${elementId} not found`);
                return;
            }
            element.innerHTML = html;
            if (onLoad) onLoad();
        } catch (error) {
            console.error(`❌ Erreur chargement ${elementId}:`, error);
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
            console.error(`❌ Erreur chargement ${elementId}:`, error);
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
                console.error('❌ Erreur import SystemInfoManager:', error);
            });
    }

    async loadPage(pageName) {
        try {
            const response = await fetch(`./pages/${pageName}.html`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            let html = await response.text();
            html = this.transformFileManagers(html);
            document.getElementById(this.contentContainer).innerHTML = html;
            
            this.saveCurrentPage(pageName);
            this.updateLayout(pageName);
            this.initializeChatIfNeeded();
            this.initializeTimeIfNeeded();
            this.initializePageElements(pageName);
            this.attachListeners();
            this.initializeFileManagers();
        } catch (error) {
            console.error(`❌ Erreur lors du chargement de ${pageName}:`, error);
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
                    console.error('❌ Erreur import TimeManager:', error);
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
                console.error('❌ Erreur import ChatManager:', error);
            });
        }
    }

    initializePageElements(pageName) {
        if (pageName === 'home') {
            Promise.all([
                import('./assets/js/modules/pdf/PDFManager.js'),
                import('./assets/js/config/PDFConfig.js')
            ]).then(([pdfModule, configModule]) => {
                const PDFManager = pdfModule.default;
                const pdfConfig = configModule.pdfConfig;
                
                window.pdfManager = new PDFManager();
                window.pdfManager.attachPDFListeners(pdfConfig);
            }).catch(error => {
                console.error('❌ Erreur import PDFManager:', error);
            });

            import('./assets/js/modules/agenda/AgendaStore.js')
                .then(module => {
                    const AgendaStore = module.default;
                    this.loadTodayEvents(AgendaStore);
                })
                .catch(error => {
                    console.error('❌ Erreur import AgendaStore:', error);
                });
        } else if (pageName === 'agenda') {
            import('./assets/js/modules/agenda/AgendaInit.js')
                .then(module => {
                    module.destroyAgenda();
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => module.initAgenda());
                    });
                })
                .catch(error => {
                    console.error('❌ Erreur import AgendaInit:', error);
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
                    console.error('❌ Erreur import ShortcutManager:', error);
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
            console.error('❌ Erreur initialisation FileManagers:', error);
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
            console.error('❌ Erreur chargement événements du jour:', error);
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

    updateLayout(pageName) {
        const header = document.getElementById('header');
        const footer = document.getElementById('footer');
        
        const config = this.pagesConfig[pageName];
        
        if (!config) {
            console.warn(`⚠️ Configuration manquante pour : ${pageName}`);
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
}

document.addEventListener('DOMContentLoaded', () => {
    window.pageManager = new PageManager();
});