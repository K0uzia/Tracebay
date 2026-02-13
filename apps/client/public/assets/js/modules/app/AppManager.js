/**
 * AppManager - Gestion du lancement d'applications
 */

import appConfig from '../../config/AppConfig.js';
import getLogger from '../../config/Logger.js';
const logger = getLogger();


export default class AppManager {
    constructor(options = {}) {
        this.config = appConfig.resolvePreset(options.preset);
        this.scope = options.scope || document;
        this.container = this.scope.classList?.contains('app-manager') ? this.scope : this.scope.querySelector('.app-manager');
        this.isLaunching = false;
        this.init();
    }

    init() {
        if (!this.container || !this.config) {
            console.warn('⚠️ AppManager: conteneur ou config introuvable', {
                container: this.container,
                config: this.config
            });
            return;
        }

        logger.debug('✅ AppManager init:', this.config?.apps?.length, 'apps');
        this.render().catch(err => logger.error('Erreur render:', err));
    }

    async render() {
        if (!this.container || !this.config?.apps) return;

        this.container.innerHTML = '';
        
        for (const app of this.config.apps) {
            const btn = document.createElement('button');
            btn.className = 'app-btn';
            btn.title = app.name;
            btn.dataset.appCommand = app.command;
            btn.dataset.appArgs = JSON.stringify(app.args || []);
            btn.dataset.requiresInput = app.requiresInput || false;
            
            if (app.requiresInput) {
                btn.dataset.inputType = app.inputType || 'text';
                btn.dataset.inputLabel = app.inputLabel || 'Paramètre';
                btn.dataset.inputPlaceholder = app.inputPlaceholder || '';
            }

            // Charger l'icône réelle de l'application
            const iconElement = document.createElement('span');
            iconElement.className = 'app-icon';
            
            if (window.ipcRenderer?.invoke) {
                try {
                    const result = await window.ipcRenderer.invoke('get-app-icon', { 
                        command: app.command,
                        appName: app.name 
                    });
                    if (result?.success && result.icon) {
                        const img = document.createElement('img');
                        // Convertir le chemin en file:// URL
                        img.src = `file://${result.icon}`;
                        img.alt = app.name;
                        img.onerror = () => {
                            // Fallback si l'image ne charge pas
                            const icon = document.createElement('i');
                            icon.className = `fa-solid ${app.icon || 'fa-rocket'}`;
                            iconElement.innerHTML = '';
                            iconElement.appendChild(icon);
                        };
                        iconElement.appendChild(img);
                        logger.debug('✅ Icône chargée:', app.name, result.icon);
                    } else {
                        // Fallback vers Font Awesome
                        const icon = document.createElement('i');
                        icon.className = `fa-solid ${app.icon || 'fa-rocket'}`;
                        iconElement.appendChild(icon);
                    }
                } catch (error) {
                    logger.warn('⚠️ Erreur chargement icône:', app.command, error.message);
                    const icon = document.createElement('i');
                    icon.className = `fa-solid ${app.icon || 'fa-rocket'}`;
                    iconElement.appendChild(icon);
                }
            } else {
                // Pas d'IPC, utiliser Font Awesome
                const icon = document.createElement('i');
                icon.className = `fa-solid ${app.icon || 'fa-rocket'}`;
                iconElement.appendChild(icon);
            }
            
            btn.appendChild(iconElement);
            
            const nameSpan = document.createElement('span');
            nameSpan.textContent = app.name;
            btn.appendChild(nameSpan);
            
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                await this.launchApp(btn, app);
            });
            
            this.container.appendChild(btn);
        }
    }

    async launchApp(btn, app) {
        if (this.isLaunching) {
            logger.debug('⏳ Lancement en cours');
            return;
        }

        this.isLaunching = true;

        try {
            btn.disabled = true;
            btn.classList.add('is-loading');

            let args = [...(app.args || [])];

            // Si l'app nécessite une entrée utilisateur
            if (app.requiresInput) {
                const userInput = await this.promptUserInput(app);
                if (!userInput) {
                    logger.debug('❌ Lancement annulé');
                    return;
                }
                args.push(userInput);
            }

            if (window.ipcRenderer?.invoke) {
                const result = await window.ipcRenderer.invoke('launch-app', {
                    command: app.command,
                    args: args
                });

                if (result?.success) {
                    logger.debug('✅ Application lancée:', app.name);
                } else {
                    logger.error('❌ Échec lancement:', result?.error);
                }
            }
        } catch (error) {
            logger.error('Erreur lancement:', error.message);
        } finally {
            btn.disabled = false;
            btn.classList.remove('is-loading');
            setTimeout(() => {
                this.isLaunching = false;
            }, 500);
        }
    }

    async promptUserInput(app) {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'app-input-modal';
            modal.innerHTML = `
                <div class="modal-overlay"></div>
                <div class="modal-content">
                    <h3>${app.inputLabel || 'Paramètre requis'}</h3>
                    <input 
                        type="text" 
                        class="app-input" 
                        placeholder="${app.inputPlaceholder || ''}"
                        autofocus
                    />
                    <div class="modal-actions">
                        <button class="btn-cancel">Annuler</button>
                        <button class="btn-confirm">Lancer</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            const input = modal.querySelector('.app-input');
            const btnCancel = modal.querySelector('.btn-cancel');
            const btnConfirm = modal.querySelector('.btn-confirm');

            const cleanup = () => {
                document.body.removeChild(modal);
            };

            btnCancel.addEventListener('click', () => {
                cleanup();
                resolve(null);
            });

            btnConfirm.addEventListener('click', () => {
                const value = input.value.trim();
                cleanup();
                resolve(value || null);
            });

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    const value = input.value.trim();
                    cleanup();
                    resolve(value || null);
                } else if (e.key === 'Escape') {
                    cleanup();
                    resolve(null);
                }
            });

            modal.querySelector('.modal-overlay').addEventListener('click', () => {
                cleanup();
                resolve(null);
            });
        });
    }

    destroy() {
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
}
