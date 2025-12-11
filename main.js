// Importer les modules Electron
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const logger = require('./logger.js');

let mainWindow;
let pdfWindows = new Map();
let server = null;
let serverStopping = false;

/**
 * Démarrer le serveur Express
 */
function startServer() {
    return new Promise((resolve, reject) => {
        try {
            const PORT = process.env.PORT || 8060;
            server = require('./server.js');
            
            // Le serveur est lancé
            setTimeout(() => {
                logger.info(`✅ APPLICATION LANCÉE`);
                logger.info(`📍 Serveur HTTP: http://localhost:${PORT}`);
                logger.info(`🔌 WebSocket: ws://localhost:${PORT}`);
                logger.info(`💻 Poste connecté au serveur`);
                resolve(PORT);
            }, 500);
        } catch (err) {
            logger.error('❌ Erreur démarrage serveur:', err);
            reject(err);
        }
    });
}

/**
 * Arrêter le serveur proprement
 */
function stopServer() {
    return new Promise((resolve) => {
        // Éviter les appels multiples
        if (serverStopping) {
            resolve();
            return;
        }
        
        serverStopping = true;
        if (server && typeof server.shutdown === 'function') {
            server.shutdown().then(() => {
                resolve();
            }).catch(() => {
                resolve();
            });
        } else {
            resolve();
        }
    });
}

/**
 * Créer la fenêtre principale
 */
function createWindow() {
    // Créer une fenêtre
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    // Charger la page depuis le serveur HTTP
    const PORT = process.env.PORT || 8060;
    mainWindow.loadURL(`http://localhost:${PORT}`);

    // Filtrer les messages DevTools inutiles (Autofill API)
    mainWindow.webContents.on('console-message', (level, message, line, sourceId) => {
        if (typeof message === 'string' && 
            !message.includes('Autofill') && 
            !message.includes('atom_cache') &&
            !message.includes('privileged')) {
            console.log(`[Electron] ${message}`);
        }
    });

    // Supprimer les logs de Chromium pour les erreurs Autofill et DevTools
    mainWindow.webContents.on('destroyed', () => {
        mainWindow = null;
    });

/*     // Ouvrir les DevTools en développement
    if (process.env.NODE_ENV === 'development') {
        mainWindow.webContents.openDevTools();
    } */

    // Gérer la fermeture
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

/**
 * Événement : App prête
 */
app.on('ready', async () => {
    try {
        const PORT = process.env.PORT || 8060;
        
        // Démarrer le serveur
        await startServer();
        
        // Créer la fenêtre
        createWindow();
        
        // Log de statut après tout est prêt
        logger.info(`💻 Interface graphique créée et lancée`);
        logger.info(`✨ Application prête et fonctionnelle`);
    } catch (error) {
        logger.error('❌ Erreur initialisation:', error);
        app.quit();
    }
});

/**
 * Événement : Toutes les fenêtres fermées
 */
app.on('window-all-closed', async () => {
    if (process.platform !== 'darwin') {
        await stopServer();
        app.quit();
    }
});

/**
 * Événement : App réactivée (macOS)
 */
app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});

/**
 * Gestion de la fermeture de l'application
 */
app.on('before-quit', async () => {
    const PORT = process.env.PORT || 8060;
    logger.info('⏹️  ARRÊT DE L\'APPLICATION');
    logger.info(`🚪 Poste déconnecté du serveur (http://localhost:${PORT})`);
    logger.info(`🔌 Fermeture de WebSocket sur ws://localhost:${PORT}`);
    await stopServer();
    logger.info('✅ APPLICATION ARRÊTÉE - Fin de session');
    logger.info('============================================================');
    process.exit(0);
});

/**
 * IPC : Ouvrir une URL externe
 */
ipcMain.handle('open-external', async (event, url) => {
    try {
        await shell.openExternal(url);
        return { success: true };
    } catch (error) {
        logger.error('❌ Erreur ouverture URL:', error);
        throw error;
    }
});

/**
 * IPC : Ouvrir un fichier PDF
 */
ipcMain.on('open-pdf', (event) => {
    const pdfPath = path.join(__dirname, 'public', 'src', 'pdf', 'Règlement_intérieur_chantier_num.pdf');
    shell.openPath(pdfPath).catch(error => {
        logger.error('❌ Erreur ouverture PDF:', error);
    });
});

/**
 * IPC : Ouvrir un PDF dans une nouvelle fenêtre
 */
ipcMain.handle('open-pdf-window', async (event, data) => {
    try {
        const { pdfFile, title } = data;
        const pdfPath = path.join(__dirname, 'public', 'src', 'pdf', pdfFile);
        
        const pdfWindow = new BrowserWindow({
            width: 900,
            height: 700,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, 'preload.js')
            }
        });
        
        pdfWindow.loadURL(`file://${pdfPath}`);
        pdfWindow.webContents.setWindowOpenHandler(({ url }) => {
            shell.openExternal(url);
            return { action: 'deny' };
        });
        
        pdfWindow.setTitle(title);
        pdfWindow.id = Math.random();
        pdfWindows.set(pdfWindow.id, pdfWindow);
        
        pdfWindow.on('closed', () => {
            pdfWindows.delete(pdfWindow.id);
        });
        
        return { success: true, windowId: pdfWindow.id };
    } catch (error) {
        logger.error('❌ Erreur ouverture PDF window:', error);
        return { success: false, error: error.message };
    }
});
