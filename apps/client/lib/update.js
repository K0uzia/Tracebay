/**
 * Module de mise à jour automatique (electron-updater).
 * Utilisé par le main process lorsque l'app est packagée.
 * @module lib/update
 */

const path = require('path');
const fs = require('fs');

/**
 * Lance la vérification de mise à jour puis appelle launchApp (via done ou catch).
 * À appeler uniquement si app.isPackaged.
 * @param {Object} opts - Dépendances injectées depuis main.js
 * @param {import('electron').App} opts.app
 * @param {typeof path} opts.path
 * @param {typeof fs} opts.fs
 * @param {(text: string) => void} opts.setSplashMessage
 * @param {(percent: number | null) => void} opts.setSplashProgress
 * @param {(text: string) => void} opts.setSplashUpdateSuccess
 * @param {() => void} opts.launchApp
 * @param {() => import('electron').BrowserWindow | null} opts.getSplashWindow
 * @param {() => import('electron').BrowserWindow | null} opts.getMainWindow
 * @param {(value: boolean) => void} opts.setQuittingForUpdate
 * @param {(currentAppPath: string) => void} opts.linuxAppImageBackup
 * @param {(currentAppPath: string, newAppPath: string) => boolean} opts.tryLinuxAppImageUpdateHelper
 * @param {(payload: object) => void} [opts.sessionLog] - Optionnel, pour debug
 * @returns {Promise<void>}
 */
async function runAutoUpdate(opts) {
    const {
        app,
        path: pathModule,
        fs: fsModule,
        setSplashMessage,
        setSplashProgress,
        setSplashUpdateSuccess,
        launchApp,
        getSplashWindow,
        getMainWindow,
        setQuittingForUpdate,
        linuxAppImageBackup,
        tryLinuxAppImageUpdateHelper,
        sessionLog = () => {}
    } = opts;

    let timeoutId;
    let updateCheckFinished = false;

    try {
        const currentVersion = app.getVersion();
        console.log('[Update] Version installée:', currentVersion);

        const { autoUpdater } = require('electron-updater');
        autoUpdater.setFeedURL({
            provider: 'github',
            owner: 'SandersonnDev',
            repo: 'workspace',
            releaseType: 'release',
        });
        autoUpdater.autoDownload = true;
        autoUpdater.autoInstallOnAppQuit = false;

        const done = () => {
            if (updateCheckFinished) return;
            updateCheckFinished = true;
            if (timeoutId) clearTimeout(timeoutId);
            timeoutId = null;
            setSplashProgress(null);
            setSplashMessage('À jour. Lancement…');
            setTimeout(launchApp, 500);
        };

        autoUpdater.on('checking-for-update', () => {
            if (updateCheckFinished) return;
            setSplashMessage('Recherche de mise à jour…');
            setSplashProgress(null);
        });
        autoUpdater.on('update-available', (info) => {
            if (updateCheckFinished) return;
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
            console.log('[Update] Mise à jour disponible:', info?.version);
            setSplashMessage('Mise à jour trouvée. Téléchargement…');
            setSplashProgress(0);
            timeoutId = setTimeout(done, 300000);
        });
        autoUpdater.on('download-progress', (p) => {
            if (updateCheckFinished) return;
            const percent = Math.round(p.percent || 0);
            setSplashMessage(percent < 100 ? `Téléchargement… ${percent} %` : 'Téléchargement terminé.');
            setSplashProgress(percent);
        });
        autoUpdater.on('update-downloaded', () => {
            sessionLog({ hypothesisId: 'H1', location: 'lib/update.js:update-downloaded', message: 'update-downloaded fired', data: { updateCheckFinished } });
            if (updateCheckFinished) return;
            updateCheckFinished = true;
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
            setSplashProgress(null);
            setSplashMessage('Installation et redémarrage…');
            const flagPath = pathModule.join(app.getPath('userData'), 'workspace-update-installed.flag');
            try {
                fsModule.writeFileSync(flagPath, Date.now().toString(), 'utf8');
            } catch (_) { }
            sessionLog({ hypothesisId: 'H3', location: 'lib/update.js:update-downloaded', message: 'flag written, before setImmediate', data: {} });
            setSplashUpdateSuccess('Redémarrage en cours…');
            setImmediate(() => {
                setTimeout(() => {
                    setQuittingForUpdate(true);
                    const currentApp = process.env.APPIMAGE;
                    let newApp = autoUpdater.installerPath;
                    // Sous Linux AppImage : déplacer le fichier téléchargé vers un dossier temporaire dédié
                    if (process.platform === 'linux' && currentApp && newApp && fsModule.existsSync(newApp)) {
                        const updateTempDir = pathModule.join(app.getPath('temp'), 'workspace-update');
                        try {
                            fsModule.mkdirSync(updateTempDir, { recursive: true });
                            const tempAppPath = pathModule.join(updateTempDir, 'workspace-new.AppImage');
                            fsModule.renameSync(newApp, tempAppPath);
                            newApp = tempAppPath;
                            console.log('[Update] AppImage déplacée vers dossier temporaire:', newApp);
                        } catch (e) {
                            console.warn('[Update] Déplacement vers temp échoué, utilisation du chemin par défaut:', e?.message);
                        }
                        // Créer la copie .bak de l'AppImage actuelle une fois le téléchargement terminé
                        linuxAppImageBackup(currentApp);
                    }
                    const helperOk = tryLinuxAppImageUpdateHelper(currentApp, newApp);
                    if (helperOk) {
                        sessionLog({ hypothesisId: 'H2-H5', location: 'lib/update.js:update-downloaded', message: 'linux helper launched, force exit', data: {} });
                        const splashWindow = getSplashWindow();
                        const mainWindow = getMainWindow();
                        if (splashWindow && !splashWindow.isDestroyed()) {
                            splashWindow.destroy();
                        }
                        if (mainWindow && !mainWindow.isDestroyed()) {
                            mainWindow.destroy();
                        }
                        setImmediate(() => {
                            app.exit(0);
                        });
                        return;
                    }
                    sessionLog({ hypothesisId: 'H2-H5', location: 'lib/update.js:update-downloaded', message: 'calling quitAndInstall', data: {} });
                    autoUpdater.quitAndInstall(true, true);
                }, 500);
            });
        });
        autoUpdater.on('update-not-available', (info) => {
            const remoteVersion = info?.version || '?';
            console.log('[Update] À jour. Version installée:', currentVersion, '| Dernière sur GitHub:', remoteVersion);
            done();
        });
        autoUpdater.on('error', (err) => {
            console.error('[Update] Erreur:', err.message || err);
            done();
        });

        setSplashMessage('Recherche de mise à jour…');
        timeoutId = setTimeout(done, 15000);
        await autoUpdater.checkForUpdates();
    } catch (e) {
        console.warn('[Update] Non disponible:', e.message);
        if (timeoutId) clearTimeout(timeoutId);
        await launchApp();
    }
}

module.exports = { runAutoUpdate };
