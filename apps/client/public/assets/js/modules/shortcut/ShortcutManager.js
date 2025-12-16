export default class ShortcutManager {
    constructor() {
        this.categories = [];
        this.searchQuery = '';
        this.listeners = [];
        this.serverUrl = (window.APP_CONFIG && window.APP_CONFIG.serverUrl) || 'http://localhost:8060';
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
            }
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
                fetch(`${this.serverUrl}/api/shortcuts/categories`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                }),
                fetch(`${this.serverUrl}/api/shortcuts`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                })
            ]);

            const categoriesData = await categoriesRes.json();
            const shortcutsData = await shortcutsRes.json();

            if (categoriesData.success && shortcutsData.success) {
                this.categories = categoriesData.categories.map(cat => ({
                    id: cat.id,
                    name: cat.name,
                    shortcuts: shortcutsData.shortcuts
                        .filter(s => s.category_id === cat.id)
                        .map(s => ({ id: s.id, name: s.name, url: s.url }))
                }));
            } else {
                this.categories = [];
            }
        } catch (error) {
            console.error('❌ Erreur chargement raccourcis:', error);
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
        if (!grid) return;

        const filteredCategories = this.filterCategories();
        
        if (filteredCategories.length === 0) {
            grid.innerHTML = '<p class="shortcut-empty-message">Aucun raccourci trouvé</p>';
            return;
        }

        grid.innerHTML = filteredCategories.map(category => this.renderCategory(category)).join('');
        this.attachCategoryListeners();
    }

    renderCategory(category) {
        return `
            <div class="shortcut-container" data-category-id="${category.id}">
                <div class="shortcut-title">
                    <h3>${this.escapeHtml(category.name)}</h3>
                    <button class="shortcut-manage-btn" data-category-id="${category.id}" title="Gérer les raccourcis">
                        <i class="fas fa-cog"></i>
                    </button>
                </div>
                <div class="shortcut-links">
                    ${category.shortcuts.map(shortcut => this.renderShortcut(shortcut)).join('')}
                </div>
            </div>
        `;
    }

    renderShortcut(shortcut) {
        return `
            <button class="shortcut-link" data-url="${this.escapeHtml(shortcut.url)}" data-name="${this.escapeHtml(shortcut.name)}" aria-label="Ouvrir ${this.escapeHtml(shortcut.name)}">
                <i class="fas fa-link"></i> ${this.escapeHtml(shortcut.name)}
            </button>
        `;
    }

    attachCategoryListeners() {
        document.querySelectorAll('.shortcut-link').forEach(btn => {
            btn.addEventListener('click', () => {
                const url = btn.dataset.url;
                if (url && window.electronAPI?.openExternal) {
                    window.electronAPI.openExternal(url);
                }
            });
        });

        document.querySelectorAll('.shortcut-manage-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const categoryId = parseInt(btn.dataset.categoryId);
                this.openManageModal(categoryId);
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
                <div class="shortcuts-list" id="shortcuts-list">
                    ${category.shortcuts.length === 0 ? '<p class="shortcuts-empty">Aucun raccourci dans cette catégorie</p>' : category.shortcuts.map(s => `
                        <div class="shortcut-item" data-shortcut-id="${s.id}">
                            <div class="shortcut-info">
                                <strong>${this.escapeHtml(s.name)}</strong>
                                <small>${this.escapeHtml(s.url)}</small>
                            </div>
                            <button class="btn-icon btn-delete" data-delete-shortcut="${s.id}" title="Supprimer">
                                <i class="fas fa-trash"></i>
                            </button>
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
                this.deleteShortcut(categoryId, shortcutId);
                modal.close();
                modal.remove();
                this.render();
            });
        });

        modal.querySelector('[data-delete-category]').addEventListener('click', () => {
            if (confirm(`Supprimer la catégorie "${category.name}" et tous ses raccourcis ?`)) {
                this.deleteCategory(categoryId);
                modal.close();
                modal.remove();
                this.render();
            }
        });

        modal.querySelector('[data-close]').addEventListener('click', () => {
            modal.close();
            modal.remove();
        });

        document.body.appendChild(modal);
        modal.showModal();
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
            const response = await fetch(`${this.serverUrl}/api/shortcuts/categories`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ name })
            });

            const data = await response.json();

            if (data.success) {
                await this.loadShortcuts();
                this.render();
            } else {
                alert(data.message);
            }
        } catch (error) {
            console.error('❌ Erreur création catégorie:', error);
            alert('Erreur lors de la création de la catégorie');
        }
    }

    async deleteCategory(categoryId) {
        const token = this.getToken();
        
        if (!token) return;

        try {
            const response = await fetch(`${this.serverUrl}/api/shortcuts/categories/${categoryId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const data = await response.json();

            if (data.success) {
                await this.loadShortcuts();
                this.render();
            }
        } catch (error) {
            console.error('❌ Erreur suppression catégorie:', error);
        }
    }

    async addShortcut(categoryId, name, url) {
        const token = this.getToken();
        
        if (!token) {
            alert('Vous devez être connecté pour ajouter un raccourci');
            return;
        }

        try {
            const response = await fetch(`${this.serverUrl}/api/shortcuts`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ category_id: categoryId, name, url })
            });

            const data = await response.json();

            if (data.success) {
                await this.loadShortcuts();
                this.render();
            } else {
                alert(data.message);
            }
        } catch (error) {
            console.error('❌ Erreur création raccourci:', error);
            alert('Erreur lors de la création du raccourci');
        }
    }

    async deleteShortcut(shortcutId) {
        const token = this.getToken();
        
        if (!token) return;

        try {
            const response = await fetch(`${this.serverUrl}/api/shortcuts/${shortcutId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const data = await response.json();

            if (data.success) {
                await this.loadShortcuts();
                this.render();
            }
        } catch (error) {
            console.error('❌ Erreur suppression raccourci:', error);
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
