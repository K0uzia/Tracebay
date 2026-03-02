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
        logger.info('🚀 Initialisation ShortcutManager');
        this.checkAuthentication();
        logger.info('📥 Chargement des raccourcis...');
        await this.loadShortcuts();
        logger.info('🎨 Rendu des raccourcis...');
        this.render();
        this.attachEventListeners();
        this.setupKeyboardShortcuts();
        this.listenAuthChanges();
        logger.info('✅ ShortcutManager initialisé');
    }

    checkAuthentication() {
        const authRequired = document.getElementById('shortcut-auth-required');
        const content = document.getElementById('shortcut-content');
        const isAuth = this.isAuthenticated();

        logger.info('🔐 Vérification authentification:', { 
            isAuthenticated: isAuth,
            hasAuthRequired: !!authRequired,
            hasContent: !!content
        });

        if (authRequired && content) {
            if (isAuth) {
                authRequired.classList.add('hidden');
                content.style.display = 'block';
                logger.info('✅ Contenu raccourcis affiché');
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
        logger.info('📥 loadShortcuts() appelé');
        const token = localStorage.getItem('workspace_jwt');
        
        if (!token) {
            logger.warn('⚠️ Pas de token, raccourcis non chargés');
            this.categories = [];
            return;
        }
        
        logger.info('✅ Token trouvé, chargement des raccourcis...');

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

            logger.info('📋 Données chargées depuis API:', { 
                categoriesFormat: Array.isArray(categoriesData) ? 'array' : 'object',
                shortcutsFormat: Array.isArray(shortcutsData) ? 'array' : 'object',
                categoriesData, 
                shortcutsData 
            });

            // Gérer les deux formats de réponse : avec wrapper success ou directement un tableau
            const categories = Array.isArray(categoriesData) ? categoriesData : (categoriesData.categories || categoriesData.items || []);
            const shortcuts = Array.isArray(shortcutsData) ? shortcutsData : (shortcutsData.shortcuts || shortcutsData.items || []);

            logger.info('📋 Données parsées:', JSON.stringify({ 
                categoriesCount: categories.length, 
                shortcutsCount: shortcuts.length,
                categories: categories.slice(0, 2),
                shortcuts: shortcuts.slice(0, 5)
            }, null, 2));

            this.categories = categories.map(cat => {
                // Vérifier tous les champs possibles pour category_id
                const catShortcuts = shortcuts
                    .filter(s => {
                        const matches = s.category_id === cat.id || s.categoryId === cat.id || s.category === cat.id;
                        if (!matches && (s.category_id || s.categoryId || s.category)) {
                            logger.debug(`🔍 Shortcut ${s.id} ne correspond pas à catégorie ${cat.id}:`, {
                                shortcutCategoryId: s.category_id,
                                shortcutCategoryIdAlt: s.categoryId,
                                shortcutCategory: s.category,
                                catId: cat.id
                            });
                        }
                        return matches;
                    })
                    .map(s => ({ 
                        id: s.id, 
                        name: s.name || s.title || 'Sans nom', 
                        url: s.url || '#',
                        raw: s
                    }));
                
                logger.info(`📁 Catégorie "${cat.name}":`, JSON.stringify({ 
                    id: cat.id, 
                    shortcutsCount: catShortcuts.length, 
                    shortcuts: catShortcuts,
                    allShortcutsInCategory: shortcuts.filter(s => s.category_id === cat.id || s.categoryId === cat.id || s.category === cat.id).length
                }, null, 2));
                
                return {
                    id: cat.id,
                    name: cat.name,
                    shortcuts: catShortcuts
                };
            });

            logger.info(`✅ ${this.categories.length} catégorie(s) et ${shortcuts.length} raccourci(s) chargé(s)`);
            logger.info('📋 Catégories finales:', this.categories);
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
        logger.info('🎨 render() appelé');
        const grid = document.getElementById('shortcut-grid');
        if (!grid) {
            logger.error('❌ shortcut-grid non trouvé dans le DOM');
            return;
        }

        logger.info('🎨 Rendu raccourcis:', { categoriesCount: this.categories?.length, categories: this.categories });
        const filteredCategories = this.filterCategories();
        logger.info('🎨 Catégories filtrées:', { count: filteredCategories.length, categories: filteredCategories });
        
        if (filteredCategories.length === 0) {
            logger.warn('⚠️ Aucune catégorie à afficher');
            grid.innerHTML = '<p class="shortcut-empty-message">Aucun raccourci trouvé</p>';
            return;
        }

        logger.info('🎨 Génération HTML pour', filteredCategories.length, 'catégorie(s)');
        const html = filteredCategories.map(category => this.renderCategory(category)).join('');
        logger.info('📝 HTML généré (premiers 500 caractères):', html.substring(0, 500));
        logger.info('📝 HTML complet (longueur):', html.length, 'caractères');
        
        grid.innerHTML = html;
        logger.info('✅ HTML inséré dans le DOM');
        const gridState = {
            innerHTMLLength: grid.innerHTML.length,
            childrenCount: grid.children.length,
            computedDisplay: window.getComputedStyle(grid).display,
            computedVisibility: window.getComputedStyle(grid).visibility,
            computedOpacity: window.getComputedStyle(grid).opacity,
            gridHTML: grid.innerHTML.substring(0, 300)
        };
        logger.info('📊 État du grid après insertion:', JSON.stringify(gridState, null, 2));
        
        // Vérifier que le contenu est bien présent
        const containers = grid.querySelectorAll('.shortcut-container');
        const links = grid.querySelectorAll('.shortcut-link');
        const shortcutsInLinks = grid.querySelectorAll('.shortcut-links .shortcut-item-wrapper');
        const logData = {
            containers: containers.length,
            links: links.length,
            shortcutsInLinks: shortcutsInLinks.length,
            containersHTML: containers.length > 0 ? containers[0].outerHTML.substring(0, 300) : 'aucun',
            firstLinkHTML: links.length > 0 ? links[0].outerHTML : 'aucun'
        };
        logger.info('🔍 Éléments trouvés dans le DOM:', JSON.stringify(logData, null, 2));
        
        // Vérifier aussi le parent
        const parent = grid.parentElement;
        if (parent) {
            const parentStyle = window.getComputedStyle(parent);
            logger.info('📋 Parent du grid:', JSON.stringify({
                id: parent.id,
                className: parent.className,
                display: parentStyle.display,
                visibility: parentStyle.visibility,
                height: parentStyle.height,
                overflow: parentStyle.overflow,
                parentHTML: parent.outerHTML.substring(0, 200)
            }, null, 2));
        }
        
        // Vérifier le contenu réel du grid
        const gridRect = grid.getBoundingClientRect();
        logger.info('📐 Position du grid:', JSON.stringify({
            width: gridRect.width,
            height: gridRect.height,
            top: gridRect.top,
            left: gridRect.left,
            visible: gridRect.width > 0 && gridRect.height > 0
        }, null, 2));
        
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

    getFaviconUrl(url) {
        try {
            const urlObj = new URL(url);
            const domain = urlObj.hostname;
            // #region agent log
            const isLocal = /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(domain);
            fetch('http://127.0.0.1:7475/ingest/b9448150-f1e8-40a5-a65b-b79718dab2f2',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0937cc'},body:JSON.stringify({sessionId:'0937cc',location:'ShortcutManager.js:getFaviconUrl',message:'getFaviconUrl appelé',data:{url,domain,isLocal},timestamp:Date.now(),hypothesisId:'H-A'})}).catch(()=>{});
            // #endregion
            if (isLocal) {
                return 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 1 1%22%3E%3C/svg%3E';
            }
            return `https://www.google.com/s2/favicons?sz=32&domain=${domain}`;
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
        `);

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
            btn.addEventListener('click', () => {
                const shortcutId = parseInt(btn.dataset.deleteShortcut);
                this.deleteShortcut(shortcutId);
                modal.close();
                modal.remove();
                this.render();
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
        let hasReordered = false; // Tracker si l'ordre a changé

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

        modal.querySelector('[data-delete-category]').addEventListener('click', () => {
            if (confirm(`Supprimer la catégorie "${category.name}" et tous ses raccourcis ?`)) {
                this.deleteCategory(categoryId);
                modal.close();
                modal.remove();
                this.render();
            }
        });

        modal.querySelector('[data-close]').addEventListener('click', async () => {
            // Sauvegarder l'ordre si quelque chose a changé
            if (hasReordered) {
                logger.debug('💾 Sauvegarde de l\'ordre avant fermeture');
                const items = [...shortcutsList.querySelectorAll('.shortcut-item')];
                const shortcutIds = items.map(item => parseInt(item.dataset.shortcutId));
                await this.reorderShortcuts(categoryId, shortcutIds);
            }
            modal.close();
            modal.remove();
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

    createModal(title, content) {
        const modal = document.createElement('dialog');
        modal.className = 'universal-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3>${this.escapeHtml(title)}</h3>
                </div>
                <div class="modal-body">
                    ${content}
                </div>
            </div>
        `;
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

    async deleteCategory(categoryId) {
        const token = this.getToken();
        
        if (!token) return;

        try {
            const response = await api.delete(`/api/shortcuts/categories/${categoryId}`);

            const data = await response.json();

            if (data.success) {
                await this.loadShortcuts();
                this.render();
            }
        } catch (error) {
            logger.error('❌ Erreur suppression catégorie:', error);
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
            logger.info('➕ Ajout raccourci:', JSON.stringify({ categoryId, name, url, payload }, null, 2));
            // Le serveur attend 'title' au lieu de 'name'
            const response = await api.post('shortcuts.create', payload);
            logger.info('📡 Réponse API reçue:', JSON.stringify({ ok: response.ok, status: response.status, statusText: response.statusText }, null, 2));

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
            logger.info('📡 Réponse serveur complète:', JSON.stringify(data, null, 2));
            
            // Vérifier si le category_id est bien retourné
            if (data && data.category_id === null) {
                logger.warn('⚠️ Le serveur a retourné category_id: null pour le raccourci créé');
            }

            // Le serveur peut retourner directement l'objet créé ou avec un wrapper success
            // Si on a un ID ou un objet raccourci, considérer que c'est un succès
            if (data.success !== false && (data.id || data.shortcut || data.title || data.url)) {
                logger.info('✅ Raccourci créé avec succès, rechargement...');
                // Forcer le rechargement sans cache
                await this.loadShortcuts();
                this.render();
                logger.info('✅ Raccourcis rechargés et affichés');
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
        
        if (!token) return;

        try {
            const response = await api.delete(`/api/shortcuts/${shortcutId}`);

            const data = await response.json();

            if (data.success) {
                await this.loadShortcuts();
                this.render();
            }
        } catch (error) {
            logger.error('❌ Erreur suppression raccourci:', error);
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
