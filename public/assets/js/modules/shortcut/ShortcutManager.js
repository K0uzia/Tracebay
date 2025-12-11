/**
 * ShortcutManager - Gestion des raccourcis hiérarchiques
 * Structure: Catégories (H3) > Sous-catégories (H4) > Raccourcis (boutons)
 */

import IconSelector from './IconSelector.js';
import ConfirmDialog from './ConfirmDialog.js';

class ShortcutManager {
    constructor() {
        this.storageKey = 'workspace_shortcuts';
        this.maxCategories = 3;
        this.currentCategoryIndex = null;
        this.currentSubcategoryIndex = null;
        
        this.iconSelector = new IconSelector();
        this.confirmDialog = new ConfirmDialog();
        
        this.init();
    }

    /**
     * Initialiser le gestionnaire
     */
    init() {
        console.log('🔧 ShortcutManager init() appelé');
        console.log('window.electron disponible?', !!window.electron);
        if (window.electron) {
            console.log('window.electron.openExternal disponible?', !!window.electron.openExternal);
        }
        
        this.loadShortcuts();
        this.render();
        this.attachListeners();
    }

    /**
     * Charger les raccourcis depuis localStorage
     */
    loadShortcuts() {
        try {
            const data = localStorage.getItem(this.storageKey);
            this.categories = data ? JSON.parse(data) : [];
        } catch (error) {
            console.error('❌ Erreur chargement raccourcis:', error);
            this.categories = [];
        }
    }

    /**
     * Sauvegarder les raccourcis
     */
    saveShortcuts() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.categories));
        } catch (error) {
            console.error('❌ Erreur sauvegarde raccourcis:', error);
        }
    }

    /**
     * Ajouter une catégorie principale
     */
    addCategory(name, color) {
        if (this.categories.length >= this.maxCategories) {
            alert(`❌ Maximum ${this.maxCategories} catégories autorisées`);
            return false;
        }

        const category = {
            id: Date.now(),
            name,
            color,
            subcategories: []
        };

        this.categories.push(category);
        this.saveShortcuts();
        this.render();
        return true;
    }

    /**
     * Supprimer une catégorie principale
     */
    deleteCategory(categoryIndex) {
        const category = this.categories[categoryIndex];
        this.confirmDialog.show({
            message: `Supprimer la catégorie "${category.name}" ?`,
            warning: 'Cette action supprimera aussi toutes les sous-catégories et raccourcis.',
            onConfirm: () => {
                this.categories.splice(categoryIndex, 1);
                this.saveShortcuts();
                this.render();
            }
        });
    }

    /**
     * Ajouter une sous-catégorie
     */
    addSubcategory(categoryIndex, name) {
        if (categoryIndex < 0 || categoryIndex >= this.categories.length) {
            alert('❌ Catégorie invalide');
            return false;
        }

        const subcategory = {
            id: Date.now(),
            name,
            shortcuts: []
        };

        this.categories[categoryIndex].subcategories.push(subcategory);
        this.saveShortcuts();
        this.render();
        return true;
    }

    /**
     * Supprimer une sous-catégorie
     */
    deleteSubcategory(categoryIndex, subcategoryIndex) {
        const subcat = this.categories[categoryIndex].subcategories[subcategoryIndex];
        this.confirmDialog.show({
            message: `Supprimer la sous-catégorie "${subcat.name}" ?`,
            warning: 'Cela supprimera aussi tous les raccourcis de cette sous-catégorie.',
            onConfirm: () => {
                this.categories[categoryIndex].subcategories.splice(subcategoryIndex, 1);
                this.saveShortcuts();
                this.render();
            }
        });
    }

    /**
     * Ajouter un raccourci
     */
    addShortcut(categoryIndex, subcategoryIndex, name, url, icon = null) {
        if (categoryIndex < 0 || categoryIndex >= this.categories.length) {
            alert('❌ Catégorie invalide');
            return false;
        }

        if (subcategoryIndex < 0 || subcategoryIndex >= this.categories[categoryIndex].subcategories.length) {
            alert('❌ Sous-catégorie invalide');
            return false;
        }

        // Utiliser la favicon du site si pas d'icône
        const finalIcon = icon && icon.trim() ? icon : null;

        const shortcut = {
            id: Date.now(),
            name,
            url,
            icon: finalIcon
        };

        this.categories[categoryIndex].subcategories[subcategoryIndex].shortcuts.push(shortcut);
        this.saveShortcuts();
        this.render();
        return true;
    }

    /**
     * Supprimer un raccourci
     */
    deleteShortcut(categoryIndex, subcategoryIndex, shortcutIndex) {
        const shortcut = this.categories[categoryIndex].subcategories[subcategoryIndex].shortcuts[shortcutIndex];
        this.confirmDialog.show({
            message: `Supprimer le raccourci "${shortcut.name}" ?`,
            onConfirm: () => {
                this.categories[categoryIndex].subcategories[subcategoryIndex].shortcuts.splice(shortcutIndex, 1);
                this.saveShortcuts();
                this.render();
            }
        });
    }

    /**
     * Obtenir la favicon d'une URL
     */
    getFaviconUrl(url) {
        try {
            const domain = new URL(url).hostname;
            return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
        } catch (error) {
            return null;
        }
    }

    /**
     * Rendu de la structure
     */
    render() {
        const container = document.getElementById('shortcuts-container');
        if (!container) return;

        if (this.categories.length === 0) {
            container.innerHTML = '<p class="empty-container">Aucune catégorie créée. Cliquez sur "+ Nouvelle catégorie" pour commencer.</p>';
            return;
        }

        container.innerHTML = this.categories.map((category, catIndex) => `
            <div class="category-block" data-category-color="${category.color}">
                <div class="category-header">
                    <h3 class="category-title" data-color="${category.color}">${category.name}</h3>
                    <div class="category-actions">
                        <button class="btn-icon" title="Ajouter une sous-catégorie" data-add-subcat="${catIndex}">
                            <i class="fas fa-plus"></i>
                        </button>
                        <button class="btn-icon btn-danger" title="Supprimer la catégorie" data-delete-cat="${catIndex}">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>

                <div class="subcategories-container">
                    ${category.subcategories.length === 0 
                        ? '<p class="empty-message">Aucune sous-catégorie. Cliquez sur + pour en ajouter une.</p>'
                        : category.subcategories.map((subcat, subcatIndex) => `
                            <div class="subcategory-block">
                                <div class="subcategory-header">
                                    <h4>${subcat.name}</h4>
                                    <div class="subcategory-actions">
                                        <button class="btn-icon" title="Ajouter un raccourci" data-add-shortcut="${catIndex},${subcatIndex}">
                                            <i class="fas fa-plus"></i>
                                        </button>
                                        <button class="btn-icon btn-danger" title="Supprimer" data-delete-subcat="${catIndex},${subcatIndex}">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </div>

                                <div class="shortcuts-list">
                                    ${subcat.shortcuts.length === 0
                                        ? '<p class="empty-message">Aucun raccourci</p>'
                                        : subcat.shortcuts.map((shortcut, shortcutIndex) => {
                                            const faviconUrl = this.getFaviconUrl(shortcut.url);
                                            return `
                                                <div class="shortcut-button-wrapper">
                                                    <button class="shortcut-button" type="button" data-shortcut="${catIndex},${subcatIndex},${shortcutIndex}" title="${shortcut.name}">
                                                        ${shortcut.icon 
                                                            ? `<i class="${shortcut.icon}"></i>` 
                                                            : `<img src="${faviconUrl}" alt="${shortcut.name}" class="shortcut-favicon">`
                                                        }
                                                        <span>${shortcut.name}</span>
                                                    </button>
                                                    <button class="btn-delete-shortcut" title="Supprimer" data-delete-shortcut="${catIndex},${subcatIndex},${shortcutIndex}">
                                                        <i class="fas fa-times"></i>
                                                    </button>
                                                </div>
                                            `;
                                        }).join('')
                                    }
                                </div>
                            </div>
                        `).join('')
                    }
                </div>
            </div>
        `).join('');

        this.attachRenderListeners();
        this.applyCategoryColors();
    }

    /**
     * Appliquer les couleurs des catégories avec CSS
     */
    applyCategoryColors() {
        document.querySelectorAll('.category-block').forEach(block => {
            const color = block.getAttribute('data-category-color');
            if (color) {
                block.style.setProperty('--category-color', color);
            }
        });
    }

    /**
     * Attacher les listeners aux éléments rendus
     */
    attachRenderListeners() {
        // Ajouter sous-catégorie
        document.querySelectorAll('[data-add-subcat]').forEach(btn => {
            btn.addEventListener('click', () => {
                const catIndex = parseInt(btn.getAttribute('data-add-subcat'));
                this.currentCategoryIndex = catIndex;
                this.showSubcategoryModal();
            });
        });

        // Supprimer catégorie
        document.querySelectorAll('[data-delete-cat]').forEach(btn => {
            btn.addEventListener('click', () => {
                const catIndex = parseInt(btn.getAttribute('data-delete-cat'));
                this.deleteCategory(catIndex);
            });
        });

        // Ajouter raccourci
        document.querySelectorAll('[data-add-shortcut]').forEach(btn => {
            btn.addEventListener('click', () => {
                const [catIndex, subcatIndex] = btn.getAttribute('data-add-shortcut').split(',').map(Number);
                this.currentCategoryIndex = catIndex;
                this.currentSubcategoryIndex = subcatIndex;
                this.showShortcutModal();
            });
        });

        // Supprimer sous-catégorie
        document.querySelectorAll('[data-delete-subcat]').forEach(btn => {
            btn.addEventListener('click', () => {
                const [catIndex, subcatIndex] = btn.getAttribute('data-delete-subcat').split(',').map(Number);
                this.deleteSubcategory(catIndex, subcatIndex);
            });
        });

        // Cliquer sur un raccourci
        document.querySelectorAll('[data-shortcut]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const [catIndex, subcatIndex, shortcutIndex] = btn.getAttribute('data-shortcut').split(',').map(Number);
                this.openShortcut(catIndex, subcatIndex, shortcutIndex);
            });
        });

        // Supprimer raccourci
        document.querySelectorAll('[data-delete-shortcut]').forEach(btn => {
            btn.addEventListener('click', () => {
                const [catIndex, subcatIndex, shortcutIndex] = btn.getAttribute('data-delete-shortcut').split(',').map(Number);
                this.deleteShortcut(catIndex, subcatIndex, shortcutIndex);
            });
        });
    }

    /**
     * Ouvrir un raccourci dans le navigateur par défaut
     */
    openShortcut(categoryIndex, subcategoryIndex, shortcutIndex) {
        const shortcut = this.categories[categoryIndex].subcategories[subcategoryIndex].shortcuts[shortcutIndex];
        
        console.log('🔗 Ouverture raccourci:', shortcut.name, shortcut.url);
        
        try {
            // En Electron, utiliser window.electron.openExternal
            if (typeof window.electron !== 'undefined' && typeof window.electron.openExternal === 'function') {
                console.log('✅ Utilisation window.electron.openExternal');
                Promise.resolve(window.electron.openExternal(shortcut.url))
                    .then(() => {
                        console.log('✅ Raccourci ouvert avec succès');
                    })
                    .catch(err => {
                        console.error('❌ Erreur openExternal:', err);
                        window.open(shortcut.url, '_blank');
                    });
            } else {
                // En web, ouvrir dans le navigateur
                console.log('📂 Utilisation window.open (web)');
                window.open(shortcut.url, '_blank');
            }
        } catch (error) {
            console.error('❌ Erreur ouverture raccourci:', error);
            window.open(shortcut.url, '_blank');
        }
    }

    /**
     * Afficher la modal pour ajouter une catégorie
     */
    showCategoryModal() {
        const modal = document.getElementById('modal-add-category');
        const form = document.getElementById('form-add-category');
        
        form.reset();
        form.onsubmit = (e) => {
            e.preventDefault();
            const name = document.getElementById('category-name').value.trim();
            const color = document.getElementById('category-color').value;

            if (name && this.addCategory(name, color)) {
                modal.close();
            }
        };

        modal.showModal();
    }

    /**
     * Afficher la modal pour ajouter une sous-catégorie
     */
    showSubcategoryModal() {
        const modal = document.getElementById('modal-add-subcategory');
        const form = document.getElementById('form-add-subcategory');
        
        form.reset();
        form.onsubmit = (e) => {
            e.preventDefault();
            const name = document.getElementById('subcategory-name').value.trim();

            if (name && this.addSubcategory(this.currentCategoryIndex, name)) {
                modal.close();
            }
        };

        modal.showModal();
    }

    /**
     * Afficher la modal pour ajouter un raccourci
     */
    showShortcutModal() {
        const modal = document.getElementById('modal-add-shortcut');
        const form = document.getElementById('form-add-shortcut');
        const iconInput = document.getElementById('shortcut-icon');
        const iconPreview = document.getElementById('selected-icon-preview');
        const iconSelectBtn = document.getElementById('btn-icon-select');
        
        form.reset();
        iconInput.value = '';
        
        if (iconPreview) {
            iconPreview.innerHTML = '<i class="fas fa-link"></i>';
        }

        if (iconSelectBtn) {
            iconSelectBtn.onclick = (e) => {
                e.preventDefault();
                this.iconSelector.open();
            };
        }
        
        form.onsubmit = (e) => {
            e.preventDefault();
            const name = document.getElementById('shortcut-name').value.trim();
            const url = document.getElementById('shortcut-url').value.trim();
            const icon = document.getElementById('shortcut-icon').value.trim() || null;

            if (name && url && this.addShortcut(this.currentCategoryIndex, this.currentSubcategoryIndex, name, url, icon)) {
                modal.close();
            }
        };

        modal.showModal();
    }

    /**
     * Attacher les listeners principaux
     */
    attachListeners() {
        // Bouton ajouter catégorie
        const addCategoryBtn = document.getElementById('add-main-category-btn');
        if (addCategoryBtn) {
            addCategoryBtn.addEventListener('click', () => this.showCategoryModal());
        }

        // Fermer les modals
        document.querySelectorAll('[data-close]').forEach(btn => {
            btn.addEventListener('click', () => {
                const modalId = btn.getAttribute('data-close');
                const modal = document.getElementById(modalId);
                if (modal) modal.close();
            });
        });
    }
}

export default ShortcutManager;
