// updates.js - Gestion des mises à jour Electron
// Configuration manuelle (pas d'updates automatiques)

const { autoUpdater } = require('electron-updater');
const { ipcMain } = require('electron');

// Désactiver les updates automatiques
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

/**
 * Initialiser le système de mises à jour
 * @param {BrowserWindow} mainWindow - Fenêtre principale
 */
function initUpdater(mainWindow) {
    if (!mainWindow) return;

    // Vérification au démarrage
    autoUpdater.checkForUpdates().catch(err => {
        console.log('Update check failed:', err);
    });

    // Événement: Une mise à jour est disponible
    autoUpdater.on('update-available', (info) => {
        console.log('Update available:', info.version);
        mainWindow.webContents.send('update:available', info);
    });

    // Événement: Pas de mise à jour
    autoUpdater.on('update-not-available', (info) => {
        console.log('No update available');
        mainWindow.webContents.send('update:not-available', info);
    });

    // Événement: Erreur lors de la vérification
    autoUpdater.on('error', (err) => {
        console.error('Update error:', err);
        mainWindow.webContents.send('update:error', err.message);
    });

    // Événement: Mise à jour téléchargée
    autoUpdater.on('update-downloaded', (info) => {
        console.log('Update downloaded:', info.version);
        mainWindow.webContents.send('update:downloaded', info);
    });

    // Événement: Progression du téléchargement
    autoUpdater.on('download-progress', (progressObj) => {
        mainWindow.webContents.send('update:progress', {
            percent: Math.round(progressObj.percent),
            bytesPerSecond: progressObj.bytesPerSecond,
            transferred: progressObj.transferred,
            total: progressObj.total
        });
    });
}

/**
 * Configurer les événements IPC pour les mises à jour
 */
function setupUpdateIPC() {
    // Vérifier les mises à jour
    ipcMain.handle('update:check', async () => {
        try {
            const result = await autoUpdater.checkForUpdates();
            return result;
        } catch (err) {
            throw new Error(err.message);
        }
    });

    // Télécharger la mise à jour
    ipcMain.handle('update:download', async () => {
        try {
            await autoUpdater.downloadUpdate();
            return { success: true };
        } catch (err) {
            throw new Error(err.message);
        }
    });

    // Installer la mise à jour et redémarrer
    ipcMain.on('update:install', () => {
        autoUpdater.quitAndInstall();
    });

    // Annuler la vérification
    ipcMain.handle('update:cancel', async () => {
        // electron-updater ne a pas de méthode cancel native
        // Cette fonction peut être utilisée pour nettoyer les ressources si nécessaire
        return { success: true };
    });
}

module.exports = {
    initUpdater,
    setupUpdateIPC,
    autoUpdater
};
