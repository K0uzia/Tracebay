// Importer les modules Electron
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const logger = require('./logger.js');

let mainWindow;
let pdfWindows = new Map();
let server = null;
let serverStopping = false;

const PORT = process.env.PORT || 8060;
const MAX_SERVER_CHECK_RETRIES = 10;
const SERVER_CHECK_INTERVAL = 200;

function checkServerReady(retries = 0) {
    return new Promise((resolve, reject) => {
        const req = http.get(`http://localhost:${PORT}/api/health`, (res) => {
            if (res.statusCode === 200) {
                logger.info(`✅ APPLICATION LANCÉE`);
                logger.info(`📍 Serveur HTTP: http://localhost:${PORT}`);
                logger.info(`🔌 WebSocket: ws://localhost:${PORT}`);
                logger.info(`💻 Poste connecté au serveur`);
                resolve(PORT);
            } else if (retries < MAX_SERVER_CHECK_RETRIES) {
                setTimeout(() => {
                    checkServerReady(retries + 1).then(resolve).catch(reject);
                }, SERVER_CHECK_INTERVAL);
            } else {
                reject(new Error('Serveur non disponible après vérification'));
            }
        });

        req.on('error', () => {
            if (retries < MAX_SERVER_CHECK_RETRIES) {
                setTimeout(() => {
                    checkServerReady(retries + 1).then(resolve).catch(reject);
                }, SERVER_CHECK_INTERVAL);
            } else {
                reject(new Error('Serveur non disponible'));
            }
        });
    });
}

function startServer() {
    return new Promise((resolve, reject) => {
        try {
            const serverModule = require('./server.js');
            server = serverModule;
            checkServerReady().then(resolve).catch(reject);
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

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    mainWindow.loadURL(`http://localhost:${PORT}`);

    mainWindow.webContents.on('console-message', (level, message) => {
        if (typeof message === 'string' && 
            !message.includes('Autofill') && 
            !message.includes('atom_cache') &&
            !message.includes('privileged')) {
            console.log(`[Electron] ${message}`);
        }
    });

    mainWindow.webContents.on('destroyed', () => {
        mainWindow = null;
    });

    if (process.env.NODE_ENV === 'development') {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.on('ready', async () => {
    try {
        // Ensure database path is writable in packaged apps
        if (!process.env.DATABASE_PATH) {
            const userDataDir = app.getPath('userData');
            const dbPath = path.join(userDataDir, 'workspace.db');
            process.env.DATABASE_PATH = dbPath;
        }
        await startServer();
        createWindow();
        logger.info(`💻 Interface graphique créée et lancée`);
        logger.info(`✨ Application prête et fonctionnelle`);
    } catch (error) {
        logger.error('❌ Erreur initialisation:', error);
        app.quit();
    }
});

app.on('window-all-closed', async () => {
    if (process.platform !== 'darwin') {
        await stopServer();
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});

app.on('before-quit', async () => {
    logger.info('⏹️  ARRÊT DE L\'APPLICATION');
    logger.info(`🚪 Poste déconnecté du serveur (http://localhost:${PORT})`);
    logger.info(`🔌 Fermeture de WebSocket sur ws://localhost:${PORT}`);
    
    pdfWindows.forEach((win) => {
        if (win && !win.isDestroyed()) {
            win.close();
        }
    });
    pdfWindows.clear();
    
    await stopServer();
    logger.info('✅ APPLICATION ARRÊTÉE - Fin de session');
    logger.info('============================================================');
    process.exit(0);
});

ipcMain.handle('open-external', async (event, url) => {
    try {
        await shell.openExternal(url);
        return { success: true };
    } catch (error) {
        logger.error('❌ Erreur ouverture URL:', error);
        throw error;
    }
});

ipcMain.on('open-pdf', (event) => {
    const pdfPath = path.join(__dirname, 'public', 'src', 'pdf', 'Règlement_intérieur_chantier_num.pdf');
    shell.openPath(pdfPath).catch(error => {
        logger.error('❌ Erreur ouverture PDF:', error);
    });
});

ipcMain.handle('open-pdf-window', async (event, data) => {
    try {
        const { pdfFile, title } = data;
        
        if (!pdfFile || typeof pdfFile !== 'string') {
            return { success: false, error: 'Nom de fichier invalide' };
        }
        
        if (pdfFile.includes('..') || pdfFile.includes('/') || pdfFile.includes('\\')) {
            return { success: false, error: 'Chemin de fichier non autorisé' };
        }
        
        const pdfPath = path.join(__dirname, 'public', 'src', 'pdf', pdfFile);
        
        if (!fs.existsSync(pdfPath)) {
            logger.warn(`⚠️  Fichier PDF introuvable: ${pdfFile}`);
            return { success: false, error: 'Fichier introuvable' };
        }
        
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
        
        pdfWindow.setTitle(title || 'PDF');
        
        const windowId = `pdf-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        pdfWindow.id = windowId;
        pdfWindows.set(windowId, pdfWindow);
        
        pdfWindow.on('closed', () => {
            pdfWindows.delete(windowId);
        });
        
        return { success: true, windowId };
    } catch (error) {
        logger.error('❌ Erreur ouverture PDF window:', error);
        return { success: false, error: error.message };
    }
});
