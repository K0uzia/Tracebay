/**
 * UpdateNotifier - Gestionnaire d'UI pour les notifications de mise à jour
 * @module UpdateNotifier
 */

export default class UpdateNotifier {
    constructor() {
        this.updateInfo = null;
        this.downloadProgress = 0;
        this.notificationElement = null;
        this.init();
    }

    init() {
        if (typeof window === 'undefined' || !window.electron) {
            return;
        }

        // Créer l'élément de notification
        this.createNotificationElement();

        // Écouter les événements de mise à jour
        window.electron.on('update:checking-for-update', () => {
            this.showChecking();
        });

        window.electron.on('update:available', (info) => {
            this.showUpdateAvailable(info);
        });

        window.electron.on('update:not-available', () => {
            this.hide();
        });

        window.electron.on('update:download-progress', (progressObj) => {
            this.updateDownloadProgress(progressObj);
        });

        window.electron.on('update:downloaded', (info) => {
            this.showUpdateDownloaded(info);
        });

        window.electron.on('update:error', (error) => {
            this.showError(error);
        });
    }

    createNotificationElement() {
        const notification = document.createElement('div');
        notification.id = 'update-notification';
        notification.className = 'update-notification';
        notification.innerHTML = `
            <div class="update-notification-content">
                <div class="update-notification-icon">
                    <i class="fas fa-download"></i>
                </div>
                <div class="update-notification-text">
                    <div class="update-notification-title"></div>
                    <div class="update-notification-message"></div>
                    <div class="update-notification-progress" style="display: none;">
                        <div class="update-progress-bar">
                            <div class="update-progress-fill"></div>
                        </div>
                        <div class="update-progress-text">0%</div>
                    </div>
                </div>
                <div class="update-notification-actions">
                    <button class="update-btn update-btn-primary" id="update-action-btn" style="display: none;">
                        Installer maintenant
                    </button>
                    <button class="update-btn update-btn-secondary" id="update-later-btn" style="display: none;">
                        Plus tard
                    </button>
                    <button class="update-btn update-btn-close" id="update-close-btn">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(notification);
        this.notificationElement = notification;

        // Gérer les clics
        document.getElementById('update-action-btn').addEventListener('click', () => {
            this.installUpdate();
        });

        document.getElementById('update-later-btn').addEventListener('click', () => {
            this.hide();
        });

        document.getElementById('update-close-btn').addEventListener('click', () => {
            this.hide();
        });
    }

    showChecking() {
        if (!this.notificationElement) return;
        this.notificationElement.classList.add('show');
        this.notificationElement.querySelector('.update-notification-title').textContent = 'Vérification des mises à jour...';
        this.notificationElement.querySelector('.update-notification-message').textContent = '';
        this.notificationElement.querySelector('.update-notification-progress').style.display = 'none';
        document.getElementById('update-action-btn').style.display = 'none';
        document.getElementById('update-later-btn').style.display = 'none';
    }

    showUpdateAvailable(info) {
        if (!this.notificationElement) return;
        this.updateInfo = info;
        this.notificationElement.classList.add('show');
        this.notificationElement.querySelector('.update-notification-title').textContent = 'Mise à jour disponible';
        this.notificationElement.querySelector('.update-notification-message').textContent = 
            `Version ${info.version} est disponible. Téléchargement en cours...`;
        this.notificationElement.querySelector('.update-notification-progress').style.display = 'block';
        document.getElementById('update-action-btn').style.display = 'none';
        document.getElementById('update-later-btn').style.display = 'none';
    }

    updateDownloadProgress(progressObj) {
        if (!this.notificationElement) return;
        this.downloadProgress = progressObj.percent || 0;
        const progressFill = this.notificationElement.querySelector('.update-progress-fill');
        const progressText = this.notificationElement.querySelector('.update-progress-text');
        
        if (progressFill) {
            progressFill.style.width = `${this.downloadProgress}%`;
        }
        if (progressText) {
            progressText.textContent = `${Math.round(this.downloadProgress)}%`;
        }
    }

    showUpdateDownloaded(info) {
        if (!this.notificationElement) return;
        this.updateInfo = info;
        this.notificationElement.classList.add('show');
        this.notificationElement.querySelector('.update-notification-title').textContent = 'Mise à jour téléchargée';
        this.notificationElement.querySelector('.update-notification-message').textContent = 
            `Version ${info.version} est prête à être installée. L'application redémarrera après l'installation.`;
        this.notificationElement.querySelector('.update-notification-progress').style.display = 'none';
        document.getElementById('update-action-btn').style.display = 'inline-block';
        document.getElementById('update-action-btn').textContent = 'Installer maintenant';
        document.getElementById('update-later-btn').style.display = 'inline-block';
    }

    showError(error) {
        if (!this.notificationElement) return;
        this.notificationElement.classList.add('show', 'error');
        this.notificationElement.querySelector('.update-notification-title').textContent = 'Erreur de mise à jour';
        this.notificationElement.querySelector('.update-notification-message').textContent = 
            error.message || 'Une erreur est survenue lors de la vérification des mises à jour.';
        this.notificationElement.querySelector('.update-notification-progress').style.display = 'none';
        document.getElementById('update-action-btn').style.display = 'none';
        document.getElementById('update-later-btn').style.display = 'none';
        
        // Masquer automatiquement après 5 secondes en cas d'erreur
        setTimeout(() => this.hide(), 5000);
    }

    async installUpdate() {
        try {
            await window.electron.installUpdate();
        } catch (error) {
            console.error('Erreur lors de l\'installation:', error);
            this.showError(error);
        }
    }

    hide() {
        if (!this.notificationElement) return;
        this.notificationElement.classList.remove('show', 'error');
    }
}
