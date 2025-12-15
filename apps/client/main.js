/**
 * Workspace Client - Electron Main Process
 * Gère la fenêtre d'application et la connexion au serveur distant
 */
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

// Configuration
const SERVER_HOST = process.env.SERVER_HOST || 'localhost';
const SERVER_PORT = process.env.SERVER_PORT || 8060;
const SERVER_URL = `http://${SERVER_HOST}:${SERVER_PORT}`;
const MAX_RETRY_ATTEMPTS = 10;
const RETRY_INTERVAL = 500;

let mainWindow;
let pdfWindows = new Map();
let serverConnected = false;

/**
 * Vérifier la connexion au serveur distant
 */
function checkServerConnection(retries = 0) {
    return new Promise((resolve, reject) => {
        const req = http.get(`${SERVER_URL}/api/health`, { timeout: 3000 }, (res) => {
            if (res.statusCode === 200) {
                console.log(`✅ Connecté au serveur: ${SERVER_URL}`);
                serverConnected = true;
                resolve(true);
            } else if (retries < MAX_RETRY_ATTEMPTS) {
                setTimeout(() => {
                    checkServerConnection(retries + 1).then(resolve).catch(reject);
                }, RETRY_INTERVAL);
            } else {
                reject(new Error(`Serveur indisponible après ${MAX_RETRY_ATTEMPTS} tentatives`));
            }
        });

        req.on('error', () => {
            if (retries < MAX_RETRY_ATTEMPTS) {
                setTimeout(() => {
                    checkServerConnection(retries + 1).then(resolve).catch(reject);
                }, RETRY_INTERVAL);
            } else {
                reject(new Error(`Impossible de se connecter au serveur: ${SERVER_URL}`));
            }
        });

        req.on('timeout', () => {
            req.destroy();
            if (retries < MAX_RETRY_ATTEMPTS) {
                setTimeout(() => {
                    checkServerConnection(retries + 1).then(resolve).catch(reject);
                }, RETRY_INTERVAL);
            } else {
                reject(new Error('Timeout lors de la connexion au serveur'));
            }
        });
    });
}

/**
 * Créer la fenêtre principale
 */
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    mainWindow.loadURL(`file://${path.join(__dirname, 'public', 'index.html')}`);
    mainWindow.show();

    // DevTools en développement
    if (process.env.NODE_ENV === 'development') {
        mainWindow.webContents.openDevTools();
    }

    // Logs console Electron (filtrer le bruit)
    mainWindow.webContents.on('console-message', (level, message) => {
        if (typeof message === 'string' && 
            !message.includes('Autofill') && 
            !message.includes('atom_cache') &&
            !message.includes('privileged')) {
            console.log(`[Renderer] ${message}`);
        }
    });

    mainWindow.webContents.on('destroyed', () => {
        mainWindow = null;
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

/**
 * Événement de démarrage Electron
 */
app.on('ready', async () => {
    try {
        console.log('🚀 Démarrage Workspace Client...');
        console.log(`📍 Serveur attendu: ${SERVER_URL}`);
        
        // Attendre la connexion au serveur
        await checkServerConnection();
        
        createWindow();
        console.log('✅ Interface graphique lancée');
        console.log('✨ Application prête');
    } catch (error) {
        console.error('❌ Erreur initialisation:', error.message);
        app.quit();
    }
});

/**
 * Fermeture de toutes les fenêtres
 */
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

/**
 * Activation (macOS)
 */
app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});

/**
 * Avant la fermeture de l'application
 */
app.on('before-quit', () => {
    console.log('⏹️  Arrêt de Workspace Client');
    pdfWindows.forEach((win) => {
        if (win && !win.isDestroyed()) {
            win.close();
        }
    });
    pdfWindows.clear();
});


/**
 * IPC Handlers - API exposée au renderer
 */

/**
 * Ouvrir une URL externe
 */
ipcMain.handle('open-external', async (event, url) => {
    try {
        // Valider l'URL
        const urlObj = new URL(url);
        if (!['http:', 'https:', 'mailto:', 'ftp:'].includes(urlObj.protocol)) {
            throw new Error('Protocole non autorisé');
        }
        await shell.openExternal(url);
        return { success: true };
    } catch (error) {
        console.error('❌ Erreur ouverture URL:', error.message);
        return { success: false, error: error.message };
    }
});

/**
 * Ouvrir un fichier PDF
 */
ipcMain.handle('open-pdf-window', async (event, data) => {
    try {
        const { pdfFile, title } = data;
        
        // Validation
        if (!pdfFile || typeof pdfFile !== 'string') {
            throw new Error('Nom de fichier invalide');
        }
        
        // Sécurité : empêcher les path traversal attacks
        if (pdfFile.includes('..') || pdfFile.includes('/') || pdfFile.includes('\\')) {
            throw new Error('Chemin de fichier non autorisé');
        }
        
        const pdfPath = path.join(__dirname, 'public', 'src', 'pdf', pdfFile);
        
        if (!fs.existsSync(pdfPath)) {
            throw new Error(`Fichier PDF introuvable: ${pdfFile}`);
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
        
        pdfWindow.setTitle(title || 'PDF Viewer');
        
        const windowId = `pdf-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        pdfWindow.id = windowId;
        pdfWindows.set(windowId, pdfWindow);
        
        pdfWindow.on('closed', () => {
            pdfWindows.delete(windowId);
        });
        
        return { success: true, windowId };
    } catch (error) {
        console.error('❌ Erreur ouverture PDF:', error.message);
        return { success: false, error: error.message };
    }
});

/**
 * Obtenir la configuration de l'application
 */
ipcMain.handle('get-app-config', async () => {
    return {
        serverUrl: SERVER_URL,
        serverHost: SERVER_HOST,
        serverPort: SERVER_PORT,
        nodeEnv: process.env.NODE_ENV || 'production',
        appVersion: app.getVersion()
    };
});
