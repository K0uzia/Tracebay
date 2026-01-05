/**
 * FolderManager - Gestion générique d'ouverture de dossiers
 * - Supporte plusieurs boutons via un sélecteur
 * - Chemin résolu par data-attributes ou config par défaut
 * - Blacklist appliquée pour les listings (API serveur)
 */

import folderConfig from '../../config/FolderConfig.js';

export default class FolderManager {
    constructor(options = {}) {
        this.config = { ...folderConfig, ...(options.config || {}) };
        this.buttonSelector = options.buttonSelector || '.folder-open-btn';
        this.listSelector = options.listSelector || '.folders-list';
        this.scope = options.scope || document;
        this.buttons = [];
        this.listContainer = null;
        this.init();
    }

    init() {
        this.buttons = Array.from(this.scope.querySelectorAll(this.buttonSelector));
        this.listContainer = this.scope.querySelector(this.listSelector);

        if (this.buttons.length === 0) {
            console.warn('⚠️ Aucun bouton de dossier trouvé');
        }
        if (!this.listContainer) {
            console.warn('⚠️ Aucun conteneur de liste de dossiers trouvé');
        }

        this.attachListeners();
        this.loadAndRender();
        console.log(`✅ FolderManager initialisé (${this.buttons.length} bouton(s))`);
    }

    attachListeners() {
        this.buttons.forEach((btn) => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                const targetPath = this.resolvePath(btn);
                await this.openFolder(btn, targetPath);
            });
        });
    }

    resolvePath(btn) {
        // Priorité: data-folder-path (chemin absolu)
        const explicitPath = btn.dataset.folderPath;
        if (explicitPath) return explicitPath;

        // Sinon base + subpath
        const base = btn.dataset.folderBase || this.config.basePath || '';
        const sub = btn.dataset.folderSubpath || '';
        const normalized = [base, sub].filter(Boolean).join('/').replace(/\/+/g, '/');
        return normalized;
    }

    async openFolder(btn, path) {
        if (!path) {
            this.showError('Chemin de dossier manquant');
            return;
        }
        try {
            btn.disabled = true;
            btn.classList.add('is-loading');

            // Essayer via IPC (Electron) - open-path pour chemins locaux
            if (window.ipcRenderer?.invoke) {
                const result = await window.ipcRenderer.invoke('open-path', { path });
                if (result?.success) {
                    console.log(`✅ Dossier ouvert (IPC): ${path}`);
                    return;
                }
                console.warn('⚠️ IPC open-path a échoué, tentative API');
            }

            // Fallback API serveur
            await this.openViaServer(path);
            console.log(`✅ Dossier ouvert via serveur: ${path}`);
        } catch (error) {
            console.error('❌ Erreur ouverture dossier:', error);
            this.showError("Impossible d'ouvrir le dossier");
        } finally {
            btn.disabled = false;
            btn.classList.remove('is-loading');
        }
    }

    async openViaServer(path) {
        const serverUrl = window.APP_CONFIG?.serverUrl || 'http://localhost:8060';
        const response = await fetch(`${serverUrl}/api/fs/open`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('jwt_token') || ''}`
            },
            body: JSON.stringify({ path })
        });
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
    }

    getListPath() {
        const base = this.config.basePath || '';
        return base || '';
    }

    async listFolders(pathOverride) {
        const path = pathOverride || this.getListPath();
        // Priorité IPC (Electron)
        if (window.ipcRenderer?.invoke) {
            try {
                const data = await window.ipcRenderer.invoke('list-folders', {
                    path,
                    blacklist: this.config.blacklist,
                    ignoreSuffixes: this.config.ignoreSuffixes,
                    ignoreExtensions: this.config.ignoreExtensions
                });
                return this.filterBlacklisted(data?.folders || []);
            } catch (error) {
                console.warn('⚠️ IPC list-folders indisponible, fallback API', error);
            }
        }

        const serverUrl = window.APP_CONFIG?.serverUrl || 'http://localhost:8060';
        try {
            const response = await fetch(`${serverUrl}/api/fs/list`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('jwt_token') || ''}`
                },
                body: JSON.stringify({
                    path,
                    blacklist: this.config.blacklist,
                    ignoreSuffixes: this.config.ignoreSuffixes,
                    ignoreExtensions: this.config.ignoreExtensions
                })
            });
            if (!response.ok) throw new Error(`API error: ${response.status}`);
            const data = await response.json();
            const folders = data.folders || [];
            return this.filterBlacklisted(folders);
        } catch (error) {
            console.error('❌ Erreur listage dossiers:', error);
            return [];
        }
    }

    filterBlacklisted(items) {
        return (items || []).filter((item) => !this.config.isBlacklisted(item));
    }

    async loadAndRender() {
        if (!this.listContainer) return;
        this.listContainer.innerHTML = '<p class="folders-empty">Chargement...</p>';
        const folders = await this.listFolders();
        if (!folders || folders.length === 0) {
            this.listContainer.innerHTML = '<p class="folders-empty">Aucun dossier trouvé</p>';
            return;
        }
        this.renderList(folders);
    }

    renderList(folders) {
        if (!this.listContainer) return;
        this.listContainer.innerHTML = '';
        folders.forEach((name) => {
            const btn = document.createElement('button');
            btn.className = 'folder-open-btn folder-item-btn';
            btn.dataset.folderPath = this.buildPath(name);
            btn.innerHTML = `<i class="fa-solid fa-folder"></i><span>${name}</span>`;
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                await this.openFolder(btn, btn.dataset.folderPath);
            });
            this.listContainer.appendChild(btn);
        });
    }

    buildPath(name) {
        const base = this.config.basePath || '';
        return [base, name].filter(Boolean).join('/').replace(/\/+/g, '/');
    }

    showError(message) {
        console.error(message);
        if (window.showNotification) {
            window.showNotification(message, 'error');
        }
    }

    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
    }

    destroy() {
        this.buttons.forEach((btn) => {
            btn.replaceWith(btn.cloneNode(true));
        });
        this.buttons = [];
    }
}
