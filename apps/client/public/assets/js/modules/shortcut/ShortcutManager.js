import api from '../../config/api.js';
import getLogger from '../../config/Logger.js';
const logger = getLogger();


export default class ShortcutManager {
    constructor() {
        this.categories = [];
        this.searchQuery = '';
        this.listeners = [];
        this.loadError = null;
    }

    async init() {
        this.checkAuthentication();
        await this.loadShortcuts();
        this.render();
        this.attachEventListeners();
        this.setupKeyboardShortcuts();
        this.listenAuthChanges();
    }

    checkAuthentication() {
        const authRequired = document.getElementById('shortcut-auth-required');
        const content = document.getElementById('shortcut-content');
        const isAuth = this.isAuthenticated();

        if (authRequired && content) {
            if (isAuth) {
                authRequired.classList.add('hidden');
                content.style.display = 'block';
            } else {
                authRequired.classList.remove('hidden');
                content.style.display = 'none';
                logger.warn('⚠️ Contenu raccourcis masqué (non authentifié)');
            }
        } else {
            logger.error('❌ Éléments DOM non trouvés:', { authRequired: !!authRequired, content: !!content });
        }
    }

    listenAuthChanges() {
        window.addEventListener('auth-change', () => {
            this.checkAuthentication();
            this.loadShortcuts().then(() => this.render());
        });

        const loginBtn = document.getElementById('shortcut-login-btn');
        if (loginBtn) {
            loginBtn.addEventListener('click', () => {
                // Déclencher l'ouverture de la modal de login
                const btnLogin = document.getElementById('btnLogin');
                if (btnLogin) btnLogin.click();
            });
        }
    }

    destroy() {
        this.listeners.forEach(({ element, event, handler }) => {
            element?.removeEventListener(event, handler);
        });
        this.listeners = [];
        document.removeEventListener('keydown', this.globalKeyHandler);
    }

    addListener(element, event, handler) {
        if (element) {
            element.addEventListener(event, handler);
            this.listeners.push({ element, event, handler });
        }
    }

    /**
     * Charge les catégories et raccourcis depuis l’API.
     * Le backend doit filtrer par utilisateur authentifié (JWT) : GET /api/shortcuts/categories
     * et GET /api/shortcuts ne doivent retourner que les données du compte connecté.
     * Voir docs/backend-shortcuts-api.md pour le contrat backend.
     */
    async loadShortcuts() {
        const token = localStorage.getItem('workspace_jwt');
        this.loadError = null;

        if (!token) {
            this.categories = [];
            return;
        }

        try {
            const [categoriesRes, shortcutsRes] = await Promise.all([
                api.get('shortcuts.categories.list', { useCache: false }),
                api.get('shortcuts.list', { useCache: false })
            ]);

            const catStatus = categoriesRes.status;
            const shortStatus = shortcutsRes.status;
            const is5xx = (s) => s >= 500 && s < 600;
            if (is5xx(catStatus) || is5xx(shortStatus)) {
                const which = shortStatus >= 500 ? 'shortcuts' : 'categories';
                const failingRes = shortStatus >= 500 ? shortcutsRes : categoriesRes;
                const endpoint = which === 'shortcuts' ? '/api/shortcuts' : '/api/shortcuts/categories';
                const detail = await this.readErrorDetail(failingRes);
                this.loadError = { status: shortStatus >= 500 ? shortStatus : catStatus, which, endpoint, detail };
                logger.error(`Erreur serveur API raccourcis (${this.loadError.status}) sur ${endpoint}: ${detail}`);
                this.categories = [];
                return;
            }

            if (!categoriesRes.ok || !shortcutsRes.ok) {
                const failingRes = !shortcutsRes.ok ? shortcutsRes : categoriesRes;
                const endpoint = !shortcutsRes.ok ? '/api/shortcuts' : '/api/shortcuts/categories';
                const detail = await this.readErrorDetail(failingRes);
                this.loadError = { status: failingRes.status, which: !shortcutsRes.ok ? 'shortcuts' : 'categories', endpoint, detail };
                logger.error(`Erreur API raccourcis (${failingRes.status}) sur ${endpoint}: ${detail}`);
                this.categories = [];
                return;
            }

            const categoriesData = await categoriesRes.json();
            const shortcutsData = await shortcutsRes.json();

            // Gérer les deux formats de réponse : avec wrapper success ou directement un tableau
            const categories = Array.isArray(categoriesData) ? categoriesData : (categoriesData.categories || categoriesData.items || []);
            const shortcuts = Array.isArray(shortcutsData) ? shortcutsData : (shortcutsData.shortcuts || shortcutsData.items || []);

            this.categories = categories.map(cat => {
                // Vérifier tous les champs possibles pour category_id
                const catShortcuts = shortcuts
                    .filter(s => {
                        const matches = s.category_id === cat.id || s.categoryId === cat.id || s.category === cat.id;
                        if (!matches && (s.category_id || s.categoryId || s.category)) {
                            logger.debug(`Shortcut ${s.id} / catégorie ${cat.id}:`, { shortcutCategoryId: s.category_id, catId: cat.id });
                        }
                        return matches;
                    })
                    .map(s => ({ 
                        id: s.id, 
                        name: s.name || s.title || 'Sans nom', 
                        url: s.url || '#',
                        raw: s
                    }));
                
                return {
                    id: cat.id,
                    name: cat.name,
                    shortcuts: catShortcuts
                };
            });
        } catch (error) {
            logger.error('❌ Erreur chargement raccourcis:', error);
            this.loadError = { status: 0, which: 'shortcuts', endpoint: '/api/shortcuts', detail: error?.message || 'Erreur réseau' };
            this.categories = [];
        }
    }

    async readErrorDetail(response) {
        try {
            const text = await response.clone().text();
            if (!text) return `HTTP ${response.status}`;
            try {
                const json = JSON.parse(text);
                return json?.message || json?.error || `HTTP ${response.status}`;
            } catch (_) {
                return text.slice(0, 180);
            }
        } catch (_) {
            return `HTTP ${response?.status || 'N/A'}`;
        }
    }

    async saveShortcuts() {
        // Plus besoin de sauvegarder localement, l'API gère la persistance
    }

    getUserId() {
        return localStorage.getItem('workspace_user_id');
    }
    
    getToken() {
        return localStorage.getItem('workspace_jwt');
    }

    isAuthenticated() {
        return !!this.getToken();
    }

    setupKeyboardShortcuts() {
        this.globalKeyHandler = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                const searchInput = document.getElementById('shortcut-search-input');
                searchInput?.focus();
            }
        };
        document.addEventListener('keydown', this.globalKeyHandler);
    }

    attachEventListeners() {
        const searchInput = document.getElementById('shortcut-search-input');
        if (searchInput) {
            const handler = (e) => {
                this.searchQuery = e.target.value.toLowerCase();
                this.render();
            };
            this.addListener(searchInput, 'input', handler);
        }

        const addCategoryBtn = document.getElementById('add-category-btn');
        if (addCategoryBtn) {
            const handler = () => this.openAddCategoryModal();
            this.addListener(addCategoryBtn, 'click', handler);
        }
    }

    filterCategories() {
        if (!this.searchQuery) return this.categories;

        return this.categories.map(cat => ({
            ...cat,
            shortcuts: cat.shortcuts.filter(shortcut =>
                shortcut.name.toLowerCase().includes(this.searchQuery) ||
                shortcut.url.toLowerCase().includes(this.searchQuery)
            )
        })).filter(cat => cat.shortcuts.length > 0);
    }

    render() {
        const grid = document.getElementById('shortcut-grid');
        if (!grid) {
            logger.error('❌ shortcut-grid non trouvé dans le DOM');
            return;
        }

        const filteredCategories = this.filterCategories();

        if (this.loadError) {
            const status = this.loadError.status || 500;
            const endpoint = this.escapeHtml(this.loadError.endpoint || '/api/shortcuts');
            const detail = this.escapeHtml(this.loadError.detail || 'Erreur serveur');
            grid.innerHTML = `<p class="shortcut-empty-message shortcut-error-message">Erreur API (${status}) sur ${endpoint}. ${detail}</p>`;
            return;
        }
        if (filteredCategories.length === 0) {
            grid.innerHTML = '<p class="shortcut-empty-message">Aucun raccourci trouvé</p>';
            return;
        }

        const html = filteredCategories.map(category => this.renderCategory(category)).join('');
        grid.innerHTML = html;

        this.attachCategoryListeners();
    }

    renderCategory(category) {
        return `
            <div class="grid-item">
                <div class="shortcut-container block" data-category-id="${category.id}">
                    <div class="shortcut-title block-title">
                        <h3>${this.escapeHtml(category.name)}</h3>
                        <div class="shortcut-title-actions">
                            <button type="button" class="shortcut-add-shortcut-btn" data-add-shortcut="${category.id}" title="Ajouter un raccourci dans cette catégorie">
                                <i class="fas fa-plus"></i><span class="shortcut-btn-label">Ajouter</span>
                            </button>
                            <button type="button" class="shortcut-manage-btn" data-category-id="${category.id}" title="Gérer (renommer, modifier, supprimer, réordonner)">
                                <i class="fas fa-cog"></i><span class="shortcut-btn-label">Gérer</span>
                            </button>
                        </div>
                    </div>
                    <div class="shortcut-links block-content">
                        ${(category.shortcuts && category.shortcuts.length > 0) 
                            ? category.shortcuts.map(shortcut => this.renderShortcut(shortcut)).join('') 
                            : '<p class="shortcut-empty-message">Aucun raccourci dans cette catégorie</p>'}
                    </div>
                </div>
            </div>
        `;
    }

    renderShortcut(shortcut) {
        const isInternal = this.isInternalShortcut(shortcut.url);
        const iconClass = isInternal ? this.getInternalIconClass(shortcut.url) : 'fa-link';
        return `
            <div class="shortcut-item-wrapper" data-shortcut-id="${shortcut.id}">
                <button class="shortcut-link" data-url="${this.escapeHtml(shortcut.url)}" data-name="${this.escapeHtml(shortcut.name)}" data-internal="${isInternal ? '1' : '0'}" aria-label="Ouvrir ${this.escapeHtml(shortcut.name)}">
                    ${isInternal
                        ? `<i class="fas ${iconClass} shortcut-internal-icon"></i>`
                        : `<img class="shortcut-favicon" src="${this.getFaviconUrl(shortcut.url)}" alt="">
                           <i class="fas fa-link shortcut-fallback-icon"></i>`}
                    <span>${this.escapeHtml(shortcut.name)}</span>
                </button>
                <div class="shortcut-item-actions-inline">
                    <button type="button" class="shortcut-edit-btn" data-edit-shortcut="${shortcut.id}" title="Modifier">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button type="button" class="shortcut-delete-btn" data-delete-shortcut-inline="${shortcut.id}" title="Supprimer">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }

    /** Raccourci interne (fichier / dossier / logiciel) : préfixe internal:// */
    isInternalShortcut(url) {
        return typeof url === 'string' && url.startsWith('internal://');
    }

    /** Type interne stocké dans l'URL : internal://file///path, internal://folder///path, internal://app///path */
    getInternalType(url) {
        if (!this.isInternalShortcut(url)) return null;
        const m = url.match(/^internal:\/\/(file|folder|app)\//i);
        return m ? m[1].toLowerCase() : null;
    }

    /** Chemin extrait d'une URL interne (sans le préfixe internal://type/) */
    getInternalPath(url) {
        if (!this.isInternalShortcut(url)) return '';
        return url.replace(/^internal:\/\/(?:file|folder|app)\/+/i, '').trim();
    }

    /** Icône FontAwesome pour un raccourci interne selon le type */
    getInternalIconClass(url) {
        const t = this.getInternalType(url);
        if (t === 'file') return 'fa-file';
        if (t === 'folder') return 'fa-folder';
        if (t === 'app') return 'fa-gear';
        return 'fa-folder-open';
    }

    /**
     * Retourne l'URL de la favicon pour un lien.
     * - Raccourcis internes (internal://) : pas de favicon (on utilise une icône).
     * - Localhost / IP privées : /favicon.ico à l'origine.
     * - Domaines publics : service Google (Figma, etc.).
     */
    getFaviconUrl(url) {
        if (this.isInternalShortcut(url)) {
            return 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 1 1%22%3E%3C/svg%3E';
        }
        try {
            const urlObj = new URL(url);
            const hostname = urlObj.hostname;
            const isLocal = /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(hostname);
            if (isLocal) {
                return `${urlObj.origin}/favicon.ico`;
            }
            const domain = hostname.replace(/^www\./, '');
            return `https://www.google.com/s2/favicons?sz=32&domain=${encodeURIComponent(domain)}`;
        } catch (error) {
            return 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 1 1%22%3E%3C/svg%3E';
        }
    }

    attachCategoryListeners() {
        document.querySelectorAll('.shortcut-link').forEach(btn => {
            btn.addEventListener('click', () => {
                const url = btn.dataset.url;
                const name = btn.dataset.name;
                const isInternal = btn.dataset.internal === '1';

                if (window.recentItemsManager && name && url) {
                    window.recentItemsManager.trackShortcutClick(name, url);
                    window.recentItemsManager.display();
                }
                if (!url) return;

                if (isInternal && this.isInternalShortcut(url)) {
                    const path = this.getInternalPath(url);
                    if (path && window.electronAPI?.openPath) {
                        logger.debug('📂 Ouverture raccourci interne:', path);
                        window.electronAPI.openPath(path).catch((err) => {
                            logger.error('❌ openPath:', err);
                            window.app?.showNotification?.(err?.error || 'Impossible d\'ouvrir le chemin', 'error');
                        });
                    }
                    return;
                }

                if (window.electronAPI?.openExternal && (url.startsWith('http://') || url.startsWith('https://'))) {
                    logger.debug('🌐 Ouverture raccourci:', url);
                    window.electronAPI.openExternal(url);
                } else if (window.electronAPI?.openPath && typeof url === 'string' && url.trim()) {
                    logger.debug('📂 Ouverture chemin (non-URL):', url);
                    window.electronAPI.openPath(url.trim()).catch((err) => {
                        logger.error('❌ openPath:', err);
                        window.app?.showNotification?.(err?.error || 'Impossible d\'ouvrir', 'error');
                    });
                } else if (window.electron?.openExternal && (url.startsWith('http://') || url.startsWith('https://'))) {
                    window.electron.openExternal(url);
                } else if (typeof window.ipcRenderer !== 'undefined' && window.ipcRenderer.invoke && (url.startsWith('http://') || url.startsWith('https://'))) {
                    window.ipcRenderer.invoke('open-external', url);
                } else if (url.startsWith('http://') || url.startsWith('https://')) {
                    window.open(url, '_blank');
                } else {
                    window.app?.showNotification?.('URL ou chemin invalide', 'warning');
                }
            });
        });

        // Ajouter un timeout pour les favicons qui ne chargent pas
        document.querySelectorAll('.shortcut-favicon').forEach(img => {
            let isProcessed = false;
            const originalSrc = img.src;
            // Chercher le wrapper qui contient l'image et l'icône fallback
            const button = img.closest('.shortcut-link');
            if (!button) {
                logger.warn('⚠️ Could not find .shortcut-link parent for:', originalSrc);
                return;
            }

            const showFallback = () => {
                if (!isProcessed) {
                    isProcessed = true;
                    logger.debug('✅ Showing fallback for:', originalSrc);
                    img.style.display = 'none';
                    const fallback = button.querySelector('.shortcut-fallback-icon');
                    if (fallback) {
                        logger.debug('✅ Fallback element found and shown');
                        fallback.style.display = 'inline';
                    } else {
                        logger.warn('⚠️ Fallback element NOT found in button');
                    }
                }
            };

            const showFavicon = () => {
                if (!isProcessed) {
                    isProcessed = true;
                    logger.debug('✅ Showing favicon for:', originalSrc);
                    img.style.display = 'inline-block';
                    const fallback = button.querySelector('.shortcut-fallback-icon');
                    if (fallback) {
                        fallback.style.display = 'none';
                    }
                }
            };

            // Fonction pour vérifier si l'image semble être un placeholder Google
            const isGooglePlaceholder = () => {
                const result = img.naturalWidth <= 1 || img.naturalHeight <= 1 || 
                       (img.naturalWidth === img.naturalHeight && img.naturalWidth <= 16 && img.naturalHeight <= 16);
                logger.debug(`📊 Placeholder check for ${originalSrc}: naturalW=${img.naturalWidth}, naturalH=${img.naturalHeight}, isPlaceholder=${result}`);
                return result;
            };

            let timeout;

            // Timeout de 1500ms
            timeout = setTimeout(() => {
                if (!isProcessed) {
                    logger.debug('⏱️ Favicon timeout for:', originalSrc);
                    showFallback();
                }
            }, 1500);

            img.addEventListener('load', () => {
                clearTimeout(timeout);
                logger.debug('📥 Load event for:', originalSrc, `naturalW=${img.naturalWidth}, naturalH=${img.naturalHeight}, displayW=${img.width}`);
                // Vérifier que l'image a du contenu réel
                if (img.naturalWidth > 0 && img.naturalHeight > 0 && img.width > 0) {
                    // Vérifier que ce n'est pas un placeholder Google
                    if (!isGooglePlaceholder()) {
                        showFavicon();
                    } else {
                        logger.debug('🔍 Google placeholder detected for:', originalSrc);
                        showFallback();
                    }
                } else {
                    logger.debug('⚠️ Image dimensions invalid:', originalSrc);
                    showFallback();
                }
            }, { once: true });

            img.addEventListener('error', () => {
                clearTimeout(timeout);
                logger.debug('❌ Error loading favicon:', originalSrc);
                showFallback();
            }, { once: true });

            // Vérifier aussi avec loadstart au cas où
            img.addEventListener('loadstart', () => {
                logger.debug('🚀 Loadstart event for:', originalSrc);
                clearTimeout(timeout);
            }, { once: true });
        });

        document.querySelectorAll('.shortcut-manage-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const categoryId = parseInt(btn.dataset.categoryId);
                this.openManageModal(categoryId);
            });
        });

        document.querySelectorAll('.shortcut-add-shortcut-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const categoryId = parseInt(btn.dataset.addShortcut);
                if (categoryId) this.openAddShortcutModal(categoryId);
            });
        });

        document.querySelectorAll('.shortcut-edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const shortcutId = parseInt(btn.dataset.editShortcut);
                const shortcutWrapper = btn.closest('.shortcut-item-wrapper');
                const categoryContainer = btn.closest('.shortcut-container');
                if (shortcutWrapper && categoryContainer) {
                    const categoryId = parseInt(categoryContainer.dataset.categoryId);
                    const name = shortcutWrapper.querySelector('.shortcut-link').dataset.name;
                    const url = shortcutWrapper.querySelector('.shortcut-link').dataset.url;
                    this.openEditShortcutModal(shortcutId, categoryId, name, url);
                }
            });
        });
        document.querySelectorAll('.shortcut-delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const shortcutId = parseInt(btn.dataset.deleteShortcutInline, 10);
                if (!shortcutId) return;
                if (confirm('Supprimer ce raccourci ?')) {
                    this.deleteShortcut(shortcutId).then((ok) => ok && this.loadShortcuts().then(() => this.render()));
                }
            });
        });
    }

    openAddCategoryModal() {
        if (!this.isAuthenticated()) {
            alert('Vous devez être connecté pour créer une catégorie');
            return;
        }

        const modal = this.createModal('Ajouter une catégorie', `
            <form id="add-category-form">
                <div class="form-group">
                    <label for="category-name">Nom de la catégorie</label>
                    <input type="text" id="category-name" placeholder="Ex : Travail, Perso…" required>
                </div>
            </form>
        `, {
            modalClass: 'shortcut-modal',
            footer: `
                <button type="button" class="modal-cancel-btn shortcut-modal-btn" data-close>Annuler</button>
                <button type="button" class="modal-submit-btn shortcut-modal-btn" id="add-category-submit-btn"><i class="fas fa-plus"></i> Créer</button>
            `
        });

        const form = modal.querySelector('#add-category-form');
        const submitBtn = modal.querySelector('#add-category-submit-btn');
        submitBtn.addEventListener('click', () => {
            const name = document.getElementById('category-name').value.trim();
            if (name) {
                this.addCategory(name);
                modal.close();
                modal.remove();
            }
        });
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            submitBtn.click();
        });

        modal.querySelector('[data-close]').addEventListener('click', () => {
            modal.close();
            modal.remove();
        });

        document.body.appendChild(modal);
        modal.showModal();
        document.getElementById('category-name').focus();
    }

    openManageModal(categoryId) {
        const category = this.categories.find(c => c.id === categoryId);
        if (!category) return;

        const modal = this.createModal(`Gérer la catégorie : ${this.escapeHtml(category.name)}`, `
            <div class="manage-shortcuts">
                <div class="manage-shortcuts-section manage-shortcuts-rename">
                    <h3 class="manage-shortcuts-section-title"><i class="fas fa-tag"></i> Nom de la catégorie</h3>
                    <div class="form-row form-row-rename">
                        <input type="text" id="manage-category-name" value="${this.escapeHtml(category.name)}" placeholder="Nom de la catégorie" class="manage-category-name-input">
                        <button type="button" class="modal-submit-btn" id="manage-rename-category-btn"><i class="fas fa-check"></i> Enregistrer le nom</button>
                    </div>
                </div>
                <div class="manage-shortcuts-section">
                    <h3 class="manage-shortcuts-section-title"><i class="fas fa-list"></i> Raccourcis dans cette catégorie</h3>
                    <p class="manage-shortcuts-hint">Glissez pour réordonner. Utilisez <strong>Modifier</strong> ou <strong>Supprimer</strong> pour chaque ligne.</p>
                    <div class="shortcuts-list" id="shortcuts-list" data-category-id="${categoryId}">
                        ${category.shortcuts.length === 0 ? '<p class="shortcuts-empty">Aucun raccourci. Utilisez le bouton « Ajouter » sur la carte pour en ajouter.</p>' : category.shortcuts.map((s, idx) => {
                            const displayUrl = this.isInternalShortcut(s.url) ? this.getInternalPath(s.url) || s.url : s.url;
                            return `
                            <div class="shortcut-item" data-shortcut-id="${s.id}" data-shortcut-url="${this.escapeHtml(s.url)}" draggable="true" data-index="${idx}">
                                <div class="shortcut-drag-handle">
                                    <i class="fas fa-grip-vertical"></i>
                                </div>
                                <div class="shortcut-info">
                                    <strong>${this.escapeHtml(s.name)}</strong>
                                    <small>${this.escapeHtml(displayUrl)}</small>
                                </div>
                                <div class="shortcut-item-actions">
                                    <button type="button" class="btn btn-edit-inline" data-edit-inline="${s.id}" title="Modifier">
                                        <i class="fas fa-edit"></i> Modifier
                                    </button>
                                    <button type="button" class="btn btn-delete-inline" data-delete-shortcut="${s.id}" title="Supprimer">
                                        <i class="fas fa-trash"></i> Supprimer
                                    </button>
                                </div>
                            </div>`;
                        }).join('')}
                    </div>
                </div>
            </div>
        `, {
            modalClass: 'shortcut-modal',
            size: 'lg',
            footer: `
                <button type="button" class="btn-danger shortcut-modal-btn" data-delete-category title="Supprime la catégorie et tous ses raccourcis">
                    <i class="fas fa-trash"></i> Supprimer la catégorie
                </button>
                <button type="button" class="modal-cancel-btn shortcut-modal-btn" data-close>Fermer</button>
            `
        });

        let hasReordered = false;
        modal.addEventListener('close', () => {
            if (hasReordered) {
                const list = modal.querySelector('#shortcuts-list');
                if (list) {
                    const items = [...list.querySelectorAll('.shortcut-item')];
                    const shortcutIds = items.map(item => parseInt(item.dataset.shortcutId));
                    this.reorderShortcuts(categoryId, shortcutIds);
                }
            }
            modal.remove();
        }, { once: true });

        const renameInput = modal.querySelector('#manage-category-name');
        const renameBtn = modal.querySelector('#manage-rename-category-btn');
        if (renameBtn && renameInput) {
            renameBtn.addEventListener('click', async () => {
                const newName = renameInput.value.trim();
                if (!newName) return;
                const success = await this.renameCategory(categoryId, newName);
                if (success) {
                    category.name = newName;
                    const headerTitle = modal.querySelector('.modal-header h2');
                    if (headerTitle) headerTitle.textContent = `Gérer la catégorie : ${newName}`;
                }
            });
        }

        modal.querySelectorAll('[data-delete-shortcut]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const shortcutId = parseInt(btn.dataset.deleteShortcut, 10);
                if (!confirm('Supprimer ce raccourci ?')) return;
                const success = await this.deleteShortcut(shortcutId);
                if (success) {
                    modal.close();
                    modal.remove();
                    this.render();
                }
            });
        });

        modal.querySelectorAll('[data-edit-inline]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const shortcutId = parseInt(btn.dataset.editInline);
                const shortcutItem = btn.closest('.shortcut-item');
                const name = shortcutItem.querySelector('.shortcut-info strong').textContent;
                const url = shortcutItem.dataset.shortcutUrl || shortcutItem.querySelector('.shortcut-info small').textContent;
                modal.close();
                modal.remove();
                this.openEditShortcutModal(shortcutId, categoryId, name, url);
            });
        });

        // Drag and drop pour réorganiser
        const shortcutsList = modal.querySelector('#shortcuts-list');
        let draggedElement = null;

        shortcutsList.addEventListener('dragstart', (e) => {
            draggedElement = e.target.closest('.shortcut-item');
            draggedElement.classList.add('dragging');
        });

        shortcutsList.addEventListener('dragend', (e) => {
            draggedElement?.classList.remove('dragging');
            draggedElement = null;
        });

        shortcutsList.addEventListener('dragover', (e) => {
            e.preventDefault();
            const afterElement = this.getDragAfterElement(shortcutsList, e.clientY);
            if (afterElement == null) {
                shortcutsList.appendChild(draggedElement);
            } else {
                shortcutsList.insertBefore(draggedElement, afterElement);
            }
            hasReordered = true; // Marquer que l'ordre a changé
        });

        shortcutsList.addEventListener('drop', () => {
            // On ne fait rien ici - l'ordre visuel est déjà mis à jour
            logger.debug('📌 Raccourci déplacé (pas encore sauvegardé)');
        });

        modal.querySelector('[data-delete-category]').addEventListener('click', async () => {
            if (!confirm(`Supprimer la catégorie "${category.name}" et tous ses raccourcis ?`)) return;
            const success = await this.deleteCategory(categoryId);
            if (success) {
                modal.close();
                modal.remove();
                this.render();
            }
        });

        modal.querySelector('[data-close]').addEventListener('click', () => {
            modal.close();
        });

        document.body.appendChild(modal);
        modal.showModal();
    }

    /**
     * Ouvre la modale pour ajouter un raccourci dans une catégorie donnée.
     * @param {number} categoryId - ID de la catégorie
     */
    openAddShortcutModal(categoryId) {
        if (!this.isAuthenticated()) {
            alert('Vous devez être connecté pour ajouter un raccourci');
            return;
        }
        const category = this.categories.find(c => c.id === categoryId);
        const categoryName = category ? category.name : '';

        const modal = this.createModal(`Ajouter un raccourci${categoryName ? ` dans « ${this.escapeHtml(categoryName)} »` : ''}`, `
            <form id="add-shortcut-modal-form" class="add-shortcut-modal-form">
                <div class="form-group shortcut-form-type-row">
                    <label for="add-shortcut-type">Type</label>
                    <select id="add-shortcut-type">
                        <option value="url">URL</option>
                        <option value="file">Fichier</option>
                        <option value="folder">Dossier</option>
                        <option value="app">Logiciel</option>
                    </select>
                </div>
                <div class="form-group" id="add-shortcut-url-group">
                    <label for="add-shortcut-url">URL</label>
                    <input type="url" id="add-shortcut-url" placeholder="https://example.com">
                </div>
                <div class="form-group hidden" id="add-shortcut-path-group">
                    <label for="add-shortcut-path">Chemin</label>
                    <input type="text" id="add-shortcut-path" placeholder="/chemin/vers/fichier ou dossier">
                </div>
                <div class="form-group">
                    <label for="add-shortcut-name">Nom</label>
                    <input type="text" id="add-shortcut-name" placeholder="Nom du raccourci" required>
                </div>
            </form>
        `, {
            modalClass: 'shortcut-modal',
            footer: `
                <button type="button" class="modal-cancel-btn shortcut-modal-btn" data-close>Annuler</button>
                <button type="button" class="modal-submit-btn shortcut-modal-btn" id="add-shortcut-submit-btn"><i class="fas fa-plus"></i> Ajouter</button>
            `
        });

        const typeSelect = modal.querySelector('#add-shortcut-type');
        const urlGroup = modal.querySelector('#add-shortcut-url-group');
        const pathGroup = modal.querySelector('#add-shortcut-path-group');
        const urlInput = modal.querySelector('#add-shortcut-url');
        const pathInput = modal.querySelector('#add-shortcut-path');
        const toggleType = () => {
            const type = typeSelect?.value || 'url';
            const isInternal = type === 'file' || type === 'folder' || type === 'app';
            if (urlGroup) urlGroup.classList.toggle('hidden', isInternal);
            if (pathGroup) pathGroup.classList.toggle('hidden', !isInternal);
            if (urlInput) urlInput.removeAttribute('required');
            if (pathInput) pathInput.required = isInternal;
        };
        typeSelect?.addEventListener('change', toggleType);
        toggleType();

        const submitBtn = modal.querySelector('#add-shortcut-submit-btn');
        const form = modal.querySelector('#add-shortcut-modal-form');
        const doSubmit = () => {
            const name = modal.querySelector('#add-shortcut-name').value.trim();
            const type = typeSelect?.value || 'url';
            const isInternal = type === 'file' || type === 'folder' || type === 'app';
            let url;
            if (isInternal) {
                const path = (modal.querySelector('#add-shortcut-path').value || '').trim();
                if (!path) {
                    alert('Veuillez saisir le chemin');
                    return;
                }
                url = 'internal://' + type + '///' + path.replace(/^\/+/, '');
            } else {
                url = (modal.querySelector('#add-shortcut-url').value || '').trim();
                if (!url) {
                    alert('Veuillez saisir l\'URL');
                    return;
                }
            }
            if (name && url) {
                this.addShortcut(categoryId, name, url);
                modal.close();
                modal.remove();
                this.render();
            }
        };
        submitBtn.addEventListener('click', doSubmit);
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            doSubmit();
        });

        modal.querySelector('[data-close]').addEventListener('click', () => {
            modal.close();
            modal.remove();
        });

        document.body.appendChild(modal);
        modal.showModal();
        modal.querySelector('#add-shortcut-name').focus();
    }

    getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.shortcut-item:not(.dragging)')];

        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;

            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    /**
     * Crée une modale alignée sur la structure universal-modal (modal.css).
     * @param {string} title - Titre de la modale
     * @param {string} content - HTML du corps (modal-body)
     * @param {{ size?: 'md' | 'lg', footer?: string, modalClass?: string }} options - size, footer, classe sur le dialog
     */
    createModal(title, content, options = {}) {
        const sizeClass = options.size ? ` modal-${options.size}` : '';
        const footerHtml = options.footer ? `<div class="modal-footer">${options.footer}</div>` : '';
        const modal = document.createElement('dialog');
        modal.className = 'universal-modal' + (options.modalClass ? ' ' + options.modalClass : '');
        modal.innerHTML = `
            <div class="modal-content${sizeClass}">
                <div class="modal-header">
                    <h2>${this.escapeHtml(title)}</h2>
                    <button type="button" class="modal-close-btn" data-dialog-close aria-label="Fermer">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    ${content}
                </div>
                ${footerHtml}
            </div>
        `;
        modal.querySelector('[data-dialog-close]')?.addEventListener('click', () => {
            modal.close();
            modal.remove();
        });
        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                modal.close();
                modal.remove();
            }
        });
        return modal;
    }

    async addCategory(name) {
        const token = this.getToken();
        
        if (!token) {
            alert('Vous devez être connecté pour créer une catégorie');
            return;
        }

        try {
            const response = await api.post('shortcuts.categories.create', { name });

            const data = await response.json();

            if (data.success) {
                await this.loadShortcuts();
                this.render();
            } else {
                alert(data.message);
            }
        } catch (error) {
            logger.error('❌ Erreur création catégorie:', error);
            alert('Erreur lors de la création de la catégorie');
        }
    }

    /**
     * Supprime une catégorie et tous ses raccourcis.
     * @param {number|string} categoryId - ID de la catégorie
     * @returns {Promise<boolean>} true si succès, false sinon
     */
    async deleteCategory(categoryId) {
        const token = this.getToken();

        if (!token) {
            alert('Vous devez être connecté pour supprimer une catégorie');
            return false;
        }

        try {
            const response = await api.delete(`/api/shortcuts/categories/${categoryId}`);
            let data = {};
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                try {
                    data = await response.json();
                } catch (_) {
                    /* body non JSON */
                }
            }

            if (!response.ok) {
                const msg = data.message || data.error || (response.status === 404
                    ? 'Suppression non disponible (404). Vérifiez que le serveur expose bien les routes DELETE pour les catégories.'
                    : `Erreur ${response.status}`);
                logger.error('❌ Suppression catégorie:', String(msg));
                alert(msg);
                return false;
            }

            if (data.success === false) {
                const msg = data.message || data.error || 'La suppression a échoué';
                alert(msg);
                return false;
            }

            await this.loadShortcuts();
            this.render();
            return true;
        } catch (error) {
            const errMsg = error?.message != null ? String(error.message) : (error != null ? String(error) : 'Erreur inconnue');
            logger.error('❌ Erreur suppression catégorie:', errMsg);
            alert('Erreur lors de la suppression de la catégorie. Vérifiez la connexion au serveur.');
            return false;
        }
    }

    async addShortcut(categoryId, name, url) {
        const token = this.getToken();
        
        if (!token) {
            alert('Vous devez être connecté pour ajouter un raccourci');
            return;
        }

        // Validation des paramètres
        if (!categoryId || !name || !url) {
            alert('Veuillez remplir tous les champs');
            return;
        }

        try {
            const payload = { category_id: categoryId, title: name, url };
            const response = await api.post('shortcuts.create', payload);

            if (!response.ok) {
                let errorMessage = `Erreur ${response.status}`;
                try {
                    const errorData = await response.json();
                    logger.error('Erreur serveur:', errorData);
                    errorMessage = errorData.message || errorData.error || errorMessage;
                } catch (e) {
                    errorMessage = `Erreur ${response.status}: ${response.statusText}`;
                }
                alert(errorMessage);
                return;
            }

            const data = await response.json();

            if (data.success !== false && (data.id || data.shortcut || data.title || data.url)) {
                await this.loadShortcuts();
                this.render();
            } else {
                logger.error('❌ Réponse serveur invalide:', data);
                alert(data.message || data.error || 'Erreur lors de la création du raccourci');
            }
        } catch (error) {
            logger.error('❌ Erreur création raccourci:', error);
            alert('Erreur lors de la création du raccourci: ' + (error.message || 'Erreur inconnue'));
        }
    }

    async deleteShortcut(shortcutId) {
        const token = this.getToken();
        
        if (!token) {
            alert('Vous devez être connecté pour supprimer un raccourci');
            return false;
        }

        try {
            const response = await api.delete(`/api/shortcuts/${shortcutId}`);
            let data = {};
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                try {
                    data = await response.json();
                } catch (_) {
                    /* body non JSON */
                }
            }

            if (response.ok && data.success !== false) {
                await this.loadShortcuts();
                this.render();
                return true;
            }
            const msg = response.status === 404
                ? 'Suppression non disponible (404). Vérifiez que le serveur expose bien la route DELETE pour les raccourcis.'
                : (data.message || data.error || `Erreur ${response.status}`);
            alert(msg);
            logger.error('❌ Erreur suppression raccourci:', msg);
            return false;
        } catch (error) {
            const errMsg = error?.message != null ? String(error.message) : (error != null ? String(error) : 'Erreur inconnue');
            logger.error('❌ Erreur suppression raccourci:', errMsg);
            alert('Erreur lors de la suppression du raccourci. Vérifiez la connexion au serveur.');
            return false;
        }
    }

    openEditShortcutModal(shortcutId, categoryId, name, url) {
        const isInternal = this.isInternalShortcut(url);
        const editType = isInternal ? (this.getInternalType(url) || 'file') : 'url';
        const editPath = isInternal ? this.getInternalPath(url) : '';
        const editUrl = isInternal ? '' : url;
        const pathGroupHidden = !isInternal ? ' hidden' : '';
        const urlGroupHidden = isInternal ? ' hidden' : '';

        const modal = this.createModal('Modifier le raccourci', `
            <form id="edit-shortcut-form">
                <div class="form-group">
                    <label for="edit-shortcut-name">Nom</label>
                    <input type="text" id="edit-shortcut-name" value="${this.escapeHtml(name)}" required>
                </div>
                <div class="form-group shortcut-form-type-row">
                    <label for="edit-shortcut-type">Type</label>
                    <select id="edit-shortcut-type">
                        <option value="url"${editType === 'url' ? ' selected' : ''}>URL</option>
                        <option value="file"${editType === 'file' ? ' selected' : ''}>Fichier</option>
                        <option value="folder"${editType === 'folder' ? ' selected' : ''}>Dossier</option>
                        <option value="app"${editType === 'app' ? ' selected' : ''}>Logiciel</option>
                    </select>
                </div>
                <div class="form-group" id="edit-shortcut-url-group"${urlGroupHidden}>
                    <label for="edit-shortcut-url">URL</label>
                    <input type="text" id="edit-shortcut-url" value="${this.escapeHtml(editUrl)}" placeholder="https://example.com">
                </div>
                <div class="form-group" id="edit-shortcut-path-group"${pathGroupHidden}>
                    <label for="edit-shortcut-path">Chemin</label>
                    <input type="text" id="edit-shortcut-path" value="${this.escapeHtml(editPath)}" placeholder="/chemin/vers/fichier ou dossier">
                </div>
            </form>
        `, {
            modalClass: 'shortcut-modal',
            footer: `
                <button type="button" class="modal-cancel-btn shortcut-modal-btn" data-close>Annuler</button>
                <button type="button" class="modal-submit-btn shortcut-modal-btn" id="edit-shortcut-submit-btn"><i class="fas fa-check"></i> Mettre à jour</button>
            `
        });

        const editTypeSelect = modal.querySelector('#edit-shortcut-type');
        const editUrlGroup = modal.querySelector('#edit-shortcut-url-group');
        const editPathGroup = modal.querySelector('#edit-shortcut-path-group');
        const editUrlInput = modal.querySelector('#edit-shortcut-url');
        const editPathInput = modal.querySelector('#edit-shortcut-path');
        const toggleEditFormType = () => {
            const type = editTypeSelect?.value || 'url';
            const isInternalEdit = type === 'file' || type === 'folder' || type === 'app';
            editUrlGroup?.classList.toggle('hidden', isInternalEdit);
            editPathGroup?.classList.toggle('hidden', !isInternalEdit);
            if (editUrlInput) editUrlInput.removeAttribute('required');
            if (editPathInput) editPathInput.required = isInternalEdit;
        };
        editTypeSelect?.addEventListener('change', toggleEditFormType);
        toggleEditFormType();

        const form = modal.querySelector('#edit-shortcut-form');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const newName = modal.querySelector('#edit-shortcut-name').value.trim();
            const type = modal.querySelector('#edit-shortcut-type').value;
            const isInternalEdit = type === 'file' || type === 'folder' || type === 'app';
            let newUrl;
            if (isInternalEdit) {
                const path = (modal.querySelector('#edit-shortcut-path').value || '').trim();
                if (!path) {
                    alert('Veuillez saisir le chemin');
                    return;
                }
                newUrl = 'internal://' + type + '///' + path.replace(/^\/+/, '');
            } else {
                newUrl = (modal.querySelector('#edit-shortcut-url').value || '').trim();
                if (!newUrl) {
                    alert('Veuillez saisir l\'URL');
                    return;
                }
            }
            if (newName && newUrl) {
                this.updateShortcut(shortcutId, newName, newUrl);
                modal.close();
                modal.remove();
                this.loadShortcuts().then(() => this.render());
            }
        });

        const editSubmitBtn = modal.querySelector('#edit-shortcut-submit-btn');
        if (editSubmitBtn) editSubmitBtn.addEventListener('click', () => form.requestSubmit());

        modal.querySelector('[data-close]').addEventListener('click', () => {
            modal.close();
            modal.remove();
        });

        document.body.appendChild(modal);
        modal.showModal();
        modal.querySelector('#edit-shortcut-name').focus();
    }

    /**
     * @param {number|string} categoryId
     * @param {string} newName
     * @returns {Promise<boolean>} true si succès
     */
    async renameCategory(categoryId, newName) {
        const token = this.getToken();
        if (!token) {
            alert('Vous devez être connecté pour renommer une catégorie');
            return false;
        }
        try {
            const response = await api.put(`/api/shortcuts/categories/${categoryId}`, { name: newName });
            const data = await response.json();
            if (data.success) {
                await this.loadShortcuts();
                this.render();
                return true;
            }
            alert(data.message || 'Erreur lors du renommage');
            return false;
        } catch (error) {
            logger.error('❌ Erreur renommage catégorie:', error);
            alert('Erreur lors du renommage de la catégorie');
            return false;
        }
    }

    async updateShortcut(shortcutId, name, url) {
        const token = this.getToken();
        
        if (!token) {
            alert('Vous devez être connecté pour modifier un raccourci');
            return;
        }

        try {
            const response = await api.put(`/api/shortcuts/${shortcutId}`, { name, url });

            const data = await response.json();

            if (data.success) {
                await this.loadShortcuts();
                this.render();
            } else {
                alert(data.message || 'Erreur lors de la modification');
            }
        } catch (error) {
            logger.error('❌ Erreur modification raccourci:', error);
            alert('Erreur lors de la modification du raccourci');
        }
    }

    async reorderShortcuts(categoryId, shortcutIds) {
        const token = this.getToken();
        
        if (!token) {
            logger.warn('❌ Pas de token disponible pour reorder');
            return;
        }

        try {
            const response = await api.put('shortcuts.reorder', { category_id: categoryId, shortcut_ids: shortcutIds });

            logger.debug('📥 Réponse reorder:', { status: response.status, statusText: response.statusText });
            const data = await response.json();
            logger.debug('📦 Data reorder:', data);

            if (data.success) {
                await this.loadShortcuts();
                this.render();
            }
        } catch (error) {
            logger.error('❌ Erreur réorganisation raccourcis:', error);
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
