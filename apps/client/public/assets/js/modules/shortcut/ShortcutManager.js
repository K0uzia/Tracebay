import api from '../../config/api.js';
import getLogger from '../../config/Logger.js';
const logger = getLogger();


export default class ShortcutManager {
    constructor() {
        this.categories = [];
        this.searchQuery = '';
        this.listeners = [];
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

    async loadShortcuts() {
        const token = localStorage.getItem('workspace_jwt');
        
        if (!token) {
            this.categories = [];
            return;
        }

        try {
            const [categoriesRes, shortcutsRes] = await Promise.all([
                api.get('shortcuts.categories.list', { useCache: false }),
                api.get('shortcuts.list', { useCache: false })
            ]);

            if (!categoriesRes.ok || !shortcutsRes.ok) {
                logger.error('Erreur réponse API:', { categories: categoriesRes.status, shortcuts: shortcutsRes.status });
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
            this.categories = [];
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
            <div class="shortcut-container" data-category-id="${category.id}">
                <div class="shortcut-title">
                    <h3>${this.escapeHtml(category.name)}</h3>
                    <div class="shortcut-title-actions">
                        <button class="shortcut-rename-btn" data-rename-category="${category.id}" title="Renommer cette catégorie">
                            <i class="fas fa-pencil"></i>
                        </button>
                        <button class="shortcut-manage-btn" data-category-id="${category.id}" title="Gérer les raccourcis">
                            <i class="fas fa-cog"></i>
                        </button>
                    </div>
                </div>
                <div class="shortcut-links">
                    ${(category.shortcuts && category.shortcuts.length > 0) 
                        ? category.shortcuts.map(shortcut => this.renderShortcut(shortcut)).join('') 
                        : '<p class="shortcut-empty-message">Aucun raccourci dans cette catégorie</p>'}
                </div>
            </div>
        `;
    }

    renderShortcut(shortcut) {
        return `
            <div class="shortcut-item-wrapper" data-shortcut-id="${shortcut.id}">
                <button class="shortcut-link" data-url="${this.escapeHtml(shortcut.url)}" data-name="${this.escapeHtml(shortcut.name)}" aria-label="Ouvrir ${this.escapeHtml(shortcut.name)}">
                    <img 
                        class="shortcut-favicon" 
                        src="${this.getFaviconUrl(shortcut.url)}" 
                        alt=""
                    >
                    <i class="fas fa-link shortcut-fallback-icon"></i>
                    <span>${this.escapeHtml(shortcut.name)}</span>
                </button>
                <button class="shortcut-edit-btn" data-edit-shortcut="${shortcut.id}" title="Modifier ce raccourci">
                    <i class="fas fa-edit"></i>
                </button>
            </div>
        `;
    }

    /**
     * Retourne l'URL de la favicon pour un lien.
     * - Localhost / IP privées : /favicon.ico à l'origine (ex. http://192.168.1.62:4000/favicon.ico) pour récupérer la vraie favicon si le serveur en a une.
     * - Domaines publics : service Google (Figma, etc.).
     * En cas d'échec (404, cert, blocage), le fallback (icône lien) s'affiche.
     */
    getFaviconUrl(url) {
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
                
                // Tracker le clic sur le raccourci
                if (window.recentItemsManager && name && url) {
                    window.recentItemsManager.trackShortcutClick(name, url);
                    window.recentItemsManager.display();
                } else if (url) {
                    // Try Electron API first
                    if (window.electronAPI?.openExternal) {
                        logger.debug('🌐 Ouverture raccourci:', url);
                        window.electronAPI.openExternal(url);
                    } else if (window.electron?.openExternal) {
                        window.electron.openExternal(url);
                    } else if (typeof window.ipcRenderer !== 'undefined' && window.ipcRenderer.invoke) {
                        window.ipcRenderer.invoke('open-external', url);
                    } else {
                        // Fallback to opening in default browser
                        window.open(url, '_blank');
                    }
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

        document.querySelectorAll('.shortcut-rename-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const categoryId = parseInt(btn.dataset.renameCategory);
                this.openRenameModal(categoryId);
            });
        });

        document.querySelectorAll('.shortcut-edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
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
                    <input type="text" id="category-name" required>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" data-close>Annuler</button>
                    <button type="submit" class="btn btn-primary">Créer</button>
                </div>
            </form>
        `);

        const form = modal.querySelector('#add-category-form');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const name = document.getElementById('category-name').value.trim();
            if (name) {
                this.addCategory(name);
                modal.close();
                modal.remove();
            }
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

        const modal = this.createModal(`Gérer "${category.name}"`, `
            <div class="manage-shortcuts">
                <div class="shortcuts-list" id="shortcuts-list" data-category-id="${categoryId}">
                    ${category.shortcuts.length === 0 ? '<p class="shortcuts-empty">Aucun raccourci dans cette catégorie</p>' : category.shortcuts.map((s, idx) => `
                        <div class="shortcut-item" data-shortcut-id="${s.id}" draggable="true" data-index="${idx}">
                            <div class="shortcut-drag-handle">
                                <i class="fas fa-grip-vertical"></i>
                            </div>
                            <div class="shortcut-info">
                                <strong>${this.escapeHtml(s.name)}</strong>
                                <small>${this.escapeHtml(s.url)}</small>
                            </div>
                            <div class="shortcut-item-actions">
                                <button class="btn-icon btn-edit" data-edit-inline="${s.id}" title="Modifier">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="btn-icon btn-delete" data-delete-shortcut="${s.id}" title="Supprimer">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <form id="add-shortcut-form">
                    <div class="form-row">
                        <input type="text" id="shortcut-name" placeholder="Nom" required>
                        <input type="url" id="shortcut-url" placeholder="URL" required>
                        <button type="submit" class="btn btn-primary">
                            <i class="fas fa-plus"></i> Ajouter
                        </button>
                    </div>
                </form>
                <div class="modal-actions">
                    <button type="button" class="btn btn-danger" data-delete-category>Supprimer la catégorie</button>
                    <button type="button" class="btn btn-secondary" data-close>Fermer</button>
                </div>
            </div>
        `, { size: 'md' });

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

        const addForm = modal.querySelector('#add-shortcut-form');
        addForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const name = document.getElementById('shortcut-name').value.trim();
            const url = document.getElementById('shortcut-url').value.trim();
            if (name && url) {
                this.addShortcut(categoryId, name, url);
                modal.close();
                modal.remove();
                this.render();
            }
        });

        modal.querySelectorAll('[data-delete-shortcut]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const shortcutId = parseInt(btn.dataset.deleteShortcut, 10);
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
                const url = shortcutItem.querySelector('.shortcut-info small').textContent;
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
            }
        });

        modal.querySelector('[data-close]').addEventListener('click', () => {
            modal.close();
        });

        document.body.appendChild(modal);
        modal.showModal();
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
     * @param {string} content - HTML du corps
     * @param {{ size?: 'md' | 'lg' }} options - size: 'md' ou 'lg' pour modale plus large
     */
    createModal(title, content, options = {}) {
        const sizeClass = options.size ? ` modal-${options.size}` : '';
        const modal = document.createElement('dialog');
        modal.className = 'universal-modal';
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

    openRenameModal(categoryId) {
        const category = this.categories.find(c => c.id === categoryId);
        if (!category) return;

        const modal = this.createModal('Renommer la catégorie', `
            <form id="rename-category-form">
                <div class="form-group">
                    <label for="rename-category-input">Nouveau nom</label>
                    <input type="text" id="rename-category-input" value="${this.escapeHtml(category.name)}" required>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" data-close>Annuler</button>
                    <button type="submit" class="btn btn-primary">Renommer</button>
                </div>
            </form>
        `);

        const form = modal.querySelector('#rename-category-form');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const newName = document.getElementById('rename-category-input').value.trim();
            if (newName && newName !== category.name) {
                this.renameCategory(categoryId, newName);
                modal.close();
                modal.remove();
            } else if (newName === category.name) {
                modal.close();
                modal.remove();
            }
        });

        modal.querySelector('[data-close]').addEventListener('click', () => {
            modal.close();
            modal.remove();
        });

        document.body.appendChild(modal);
        modal.showModal();
        document.getElementById('rename-category-input').select();
    }

    openEditShortcutModal(shortcutId, categoryId, name, url) {
        const modal = this.createModal('Modifier le raccourci', `
            <form id="edit-shortcut-form">
                <div class="form-group">
                    <label for="edit-shortcut-name">Nom</label>
                    <input type="text" id="edit-shortcut-name" value="${this.escapeHtml(name)}" required>
                </div>
                <div class="form-group">
                    <label for="edit-shortcut-url">URL</label>
                    <input type="text" id="edit-shortcut-url" value="${this.escapeHtml(url)}" placeholder="https://example.com" required>
                </div>
                <div class="modal-actions">
                    <button type="button" class="btn btn-secondary" data-close>Annuler</button>
                    <button type="submit" class="btn btn-primary">Mettre à jour</button>
                </div>
            </form>
        `);

        const form = modal.querySelector('#edit-shortcut-form');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const newName = document.getElementById('edit-shortcut-name').value.trim();
            const newUrl = document.getElementById('edit-shortcut-url').value.trim();
            if (newName && newUrl) {
                this.updateShortcut(shortcutId, newName, newUrl);
                modal.close();
                modal.remove();
            } else {
                alert('Veuillez remplir tous les champs');
            }
        });

        modal.querySelector('[data-close]').addEventListener('click', () => {
            modal.close();
            modal.remove();
        });

        document.body.appendChild(modal);
        modal.showModal();
        document.getElementById('edit-shortcut-name').focus();
    }

    async renameCategory(categoryId, newName) {
        const token = this.getToken();
        
        if (!token) {
            alert('Vous devez être connecté pour renommer une catégorie');
            return;
        }

        try {
            const response = await api.put(`/api/shortcuts/categories/${categoryId}`, { name: newName });

            const data = await response.json();

            if (data.success) {
                await this.loadShortcuts();
                this.render();
            } else {
                alert(data.message || 'Erreur lors du renommage');
            }
        } catch (error) {
            logger.error('❌ Erreur renommage catégorie:', error);
            alert('Erreur lors du renommage de la catégorie');
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
