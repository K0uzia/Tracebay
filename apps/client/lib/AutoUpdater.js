/**
 * AutoUpdater - Gestion des mises à jour automatiques
 * Utilise electron-updater pour vérifier et installer les mises à jour depuis GitHub Releases
 * @module AutoUpdater
 */

const { autoUpdater } = require('electron-updater');

/**
 * Classe AutoUpdater pour gérer les mises à jour automatiques
 * @class
 */
class AutoUpdater {
    /**
     * Crée une instance de AutoUpdater
     * @constructor
     * @param {Object} [options={}] - Options de configuration
     * @param {boolean} [options.enabled=true] - Activer l'auto-updater
     * @param {string} [options.owner='SandersonnDev'] - Propriétaire du repo GitHub
     * @param {string} [options.repo='Workspace'] - Nom du repo GitHub
     */
    constructor(options = {}) {
        this.enabled = options.enabled !== false;
        this.owner = options.owner || 'SandersonnDev';
        this.repo = options.repo || 'Workspace';
        this.checkingForUpdate = false;
        this.updateAvailable = false;
        this.updateDownloaded = false;
        
        // Configurer autoUpdater
        autoUpdater.setFeedURL({
            provider: 'github',
            owner: this.owner,
            repo: this.repo
        });
        
        // Désactiver les logs verbeux d'electron-updater
        autoUpdater.logger = {
            info: () => {},
            warn: () => {},
            error: () => {}
        };
        
        // Configurer les événements
        this.setupEvents();
    }

    /**
     * Configure les événements de l'auto-updater
     * @private
     * @returns {void}
     */
    setupEvents() {
        autoUpdater.on('checking-for-update', () => {
            this.checkingForUpdate = true;
            this.emit('checking-for-update');
        });

        autoUpdater.on('update-available', (info) => {
            this.updateAvailable = true;
            this.emit('update-available', info);
        });

        autoUpdater.on('update-not-available', (info) => {
            this.checkingForUpdate = false;
            this.updateAvailable = false;
            this.emit('update-not-available', info);
        });

        autoUpdater.on('error', (error) => {
            this.checkingForUpdate = false;
            this.emit('error', error);
        });

        autoUpdater.on('download-progress', (progressObj) => {
            this.emit('download-progress', progressObj);
        });

        autoUpdater.on('update-downloaded', (info) => {
            this.updateDownloaded = true;
            this.checkingForUpdate = false;
            this.emit('update-downloaded', info);
        });
    }

    /**
     * Émet un événement vers le renderer process via IPC
     * @param {string} event - Nom de l'événement
     * @param {*} data - Données à envoyer
     * @private
     * @returns {void}
     */
    emit(event, data = null) {
        // Cette méthode sera remplacée par setMainWindow dans init()
        if (this.mainWindow) {
            this.mainWindow.webContents.send(`update:${event}`, data);
        }
    }

    /**
     * Initialise l'auto-updater
     * @param {boolean} isProduction - Si true, active l'updater, sinon désactivé
     * @param {BrowserWindow} [mainWindow=null] - Fenêtre principale pour IPC
     * @returns {void}
     */
    init(isProduction, mainWindow = null) {
        if (!this.enabled || !isProduction) {
            console.log('⏸️  Auto-updater désactivé (mode développement)');
            return;
        }

        if (mainWindow) {
            this.mainWindow = mainWindow;
        }

        console.log('✅ Auto-updater activé (mode production)');
        
        // Vérifier les mises à jour au démarrage (après un délai de 3 secondes)
        setTimeout(() => {
            this.checkForUpdates();
        }, 3000);
    }

    /**
     * Vérifie manuellement les mises à jour disponibles
     * @returns {Promise<void>}
     */
    async checkForUpdates() {
        if (!this.enabled) {
            return;
        }

        if (this.checkingForUpdate) {
            console.log('⏳ Vérification déjà en cours...');
            return;
        }

        try {
            console.log('🔍 Vérification des mises à jour...');
            await autoUpdater.checkForUpdates();
        } catch (error) {
            console.error('❌ Erreur lors de la vérification des mises à jour:', error.message);
            this.emit('error', error);
        }
    }

    /**
     * Installe la mise à jour téléchargée et redémarre l'application
     * @returns {Promise<void>}
     */
    async installUpdate() {
        if (!this.updateDownloaded) {
            console.warn('⚠️  Aucune mise à jour téléchargée');
            return;
        }

        try {
            console.log('🔄 Installation de la mise à jour...');
            autoUpdater.quitAndInstall(false, true);
        } catch (error) {
            console.error('❌ Erreur lors de l\'installation:', error.message);
            this.emit('error', error);
        }
    }

    /**
     * Obtient les informations sur la version actuelle et la dernière version disponible
     * @returns {Object} Informations sur les versions
     */
    getUpdateInfo() {
        return {
            currentVersion: autoUpdater.currentVersion?.version || '1.0.0',
            updateAvailable: this.updateAvailable,
            updateDownloaded: this.updateDownloaded,
            checkingForUpdate: this.checkingForUpdate
        };
    }
}

// Singleton
let instance = null;

/**
 * Obtient l'instance singleton de l'AutoUpdater
 * @param {Object} [options={}] - Options de configuration (utilisées uniquement à la première création)
 * @returns {AutoUpdater} Instance de l'AutoUpdater
 */
function getAutoUpdater(options = {}) {
    if (!instance) {
        instance = new AutoUpdater(options);
    }
    return instance;
}

module.exports = getAutoUpdater;
