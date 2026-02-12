/**
 * Workspace Client - Electron Main Process
 * Gère la fenêtre d'application et la connexion au serveur distant
 */
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');

// Import ClientDiscovery
const ClientDiscovery = require('./lib/ClientDiscovery.js');

// Import AutoUpdater
const getAutoUpdater = require('./lib/AutoUpdater.js');

// Détection environnement (production vs développement)
const isProduction = process.env.NODE_ENV === 'production' || app.isPackaged;

/**
 * Obtenir toutes les IPs locales du réseau
 */
function getLocalNetworkIPs() {
    const interfaces = os.networkInterfaces();
    const ips = [];
    
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // IPv4, non-interne
            if (iface.family === 'IPv4' && !iface.internal) {
                const parts = iface.address.split('.');
                const subnet = `${parts[0]}.${parts[1]}.${parts[2]}`;
                ips.push({ subnet, myIp: iface.address });
            }
        }
    }
    return ips;
}

/**
 * Tester la connexion à une IP:PORT spécifique
 */
function testServerConnection(ip, port = 8060, timeout = 1000) {
    return new Promise((resolve) => {
        const req = http.get(`http://${ip}:${port}/api/health`, { timeout }, (res) => {
            if (res.statusCode === 200) {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const health = JSON.parse(data);
                        if (health.status === 'ok') {
                            resolve({ found: true, url: `http://${ip}:${port}` });
                        } else {
                            resolve({ found: false });
                        }
                    } catch (e) {
                        resolve({ found: false });
                    }
                });
            } else {
                resolve({ found: false });
            }
        });

        req.on('error', () => resolve({ found: false }));
        req.on('timeout', () => {
            req.destroy();
            resolve({ found: false });
        });
    });
}

/**
 * Scanner le réseau local pour trouver le serveur
 */
async function discoverServer(port = 8060) {
    console.log('🔍 Recherche du serveur via beacons UDP...');
    
    // D'abord, essayer la découverte via beacons UDP
    const discovery = new ClientDiscovery();
    
    try {
        const server = await discovery.findServer(5000);  // Timeout de 5 secondes
        if (server) {
            return server;
        }
    } catch (err) {
        console.warn('⚠️  Erreur lors de la découverte UDP:', err.message);
    }
    
    console.log('🔍 Fallback: Recherche manuelle du serveur sur le réseau...');
    
    const networks = getLocalNetworkIPs();
    if (networks.length === 0) {
        console.warn('⚠️  Aucune interface réseau détectée');
        return null;
    }
    
    // Tester d'abord localhost
    console.log('🔍 Test localhost...');
    const localhostTest = await testServerConnection('localhost', port, 500);
    if (localhostTest.found) {
        console.log('✅ Serveur trouvé sur localhost');
        return { url: localhostTest.url, ws: `ws://localhost:${port}` };
    }
    
    // Ensuite tester notre propre IP
    for (const network of networks) {
        console.log(`🔍 Test ${network.myIp}...`);
        const selfTest = await testServerConnection(network.myIp, port, 500);
        if (selfTest.found) {
            console.log(`✅ Serveur trouvé sur ${network.myIp}`);
            return { url: selfTest.url, ws: `ws://${network.myIp}:${port}` };
        }
    }
    
    // Scanner le sous-réseau (en parallèle pour plus de rapidité)
    for (const network of networks) {
        console.log(`🔍 Scan du réseau ${network.subnet}.0/24...`);
        const promises = [];
        
        for (let i = 1; i <= 254; i++) {
            const ip = `${network.subnet}.${i}`;
            if (ip !== network.myIp) {  // Skip notre propre IP déjà testée
                promises.push(testServerConnection(ip, port, 800));
            }
        }
        
        const results = await Promise.all(promises);
        for (let i = 0; i < results.length; i++) {
            if (results[i].found) {
                const foundIp = results[i].url.replace('http://', '').replace(`:${port}`, '');
                console.log(`✅ Serveur trouvé sur ${foundIp}`);
                return { url: results[i].url, ws: `ws://${foundIp}:${port}` };
            }
        }
    }
    
    console.warn('⚠️  Aucun serveur trouvé sur le réseau');
    return null;
}

// Charger la configuration serveur centralisée
let serverConfig = {};
try {
    const configPath = path.join(__dirname, 'config', 'connection.json');
    const configData = fs.readFileSync(configPath, 'utf8');
    serverConfig = JSON.parse(configData);
    console.log('✅ Configuration serveur chargée:', serverConfig.mode);
} catch (error) {
    console.error('❌ Erreur chargement config serveur:', error.message);
    // Fallback to default local config
    serverConfig = {
        mode: 'local',
        environments: {
            local: {
                url: 'http://localhost:8060',
                ws: 'ws://localhost:8060'
            }
        },
        endpoints: {
            health: '/api/health'
        }
    };
}

// Configuration initiale (fallback) - La vraie config vient du client web via ConnectionConfig.js
const MODE = process.env.SERVER_MODE || serverConfig.mode || 'local';
const environments = serverConfig.environments || {};
let currentConfig = environments[MODE] || environments.local;

// Utiliser la config locale par défaut
if (!currentConfig || !currentConfig.url) {
    currentConfig = { url: 'http://localhost:8060', ws: 'ws://localhost:8060' };
}

let SERVER_URL = currentConfig.url;
let SERVER_WS_URL = currentConfig.ws;
const healthEndpoint = serverConfig.endpoints?.health || '/api/health';
let SERVER_HEALTH_ENDPOINT = `${SERVER_URL}${healthEndpoint}`;
const MAX_RETRY_ATTEMPTS = 10;
const RETRY_INTERVAL = 500;

let mainWindow;
let pdfWindows = new Map();
let serverConnected = false;
let discoveredServer = null;
let lastOpenTime = 0;
const MIN_OPEN_INTERVAL = 1500; // 1.5s minimum entre chaque ouverture

function isBlacklisted(name, blacklist = [], ignoreSuffixes = [], ignoreExtensions = []) {
    if (!name) return true;
    if (blacklist.includes(name)) return true;
    if (name.startsWith('~$')) return true;
    if (name.startsWith('.') && name !== '.' && name !== '..') return true;
    for (const suffix of ignoreSuffixes) {
        if (name.endsWith(suffix)) return true;
    }
    for (const ext of ignoreExtensions) {
        if (name.endsWith(ext)) return true;
    }
    return false;
}

/**
 * Vérifier la connexion au serveur distant (non-bloquant)
 */
function checkServerConnection(retries = 0) {
    return new Promise((resolve) => {
        const req = http.get(SERVER_HEALTH_ENDPOINT, { timeout: 3000 }, (res) => {
            if (res.statusCode === 200) {
                console.log(`✅ Connecté au serveur: ${SERVER_URL}`);
                serverConnected = true;
                resolve(true);
            } else if (retries < MAX_RETRY_ATTEMPTS) {
                setTimeout(() => {
                    checkServerConnection(retries + 1).then(resolve);
                }, RETRY_INTERVAL);
            } else {
                console.warn(`⚠️  Serveur indisponible après ${MAX_RETRY_ATTEMPTS} tentatives`);
                serverConnected = false;
                resolve(false);
            }
        });

        req.on('error', () => {
            if (retries < MAX_RETRY_ATTEMPTS) {
                setTimeout(() => {
                    checkServerConnection(retries + 1).then(resolve);
                }, RETRY_INTERVAL);
            } else {
                console.warn(`⚠️  Impossible de se connecter au serveur: ${SERVER_URL}`);
                serverConnected = false;
                resolve(false);
            }
        });

        req.on('timeout', () => {
            req.destroy();
            if (retries < MAX_RETRY_ATTEMPTS) {
                setTimeout(() => {
                    checkServerConnection(retries + 1).then(resolve);
                }, RETRY_INTERVAL);
            } else {
                console.warn('⚠️  Timeout lors de la connexion au serveur');
                serverConnected = false;
                resolve(false);
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
        autoHideMenuBar: true,  // Masquer la barre de menu
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    // Charger l'index.html directement
    mainWindow.loadURL(`file://${path.join(__dirname, 'public', 'index.html')}`);
    mainWindow.show();

    // DevTools uniquement en développement
    if (!isProduction) {
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
    console.log('🚀 Démarrage Workspace Client...');
    console.log(`📍 Configuration depuis: ${MODE} (connexion-config.json)`);
    console.log(`🔗 Serveur par défaut: ${SERVER_URL}`);
    console.log(`🌍 Environnement: ${isProduction ? 'PRODUCTION' : 'DÉVELOPPEMENT'}`);
    console.log('ℹ️  La config réelle sera chargée par le client web');
    
    // Tenter la connexion au serveur (non-bloquant)
    await checkServerConnection();
    
    if (!serverConnected) {
        console.log('🔌 Mode hors-ligne: Le client démarre sans connexion serveur');
    }
    
    // Créer la fenêtre principale
    createWindow();
    
    // Initialiser l'auto-updater APRÈS la création de la fenêtre (si production)
    if (isProduction) {
        const autoUpdater = getAutoUpdater({
            enabled: true,
            owner: 'SandersonnDev',
            repo: 'Workspace'
        });
        autoUpdater.init(isProduction, mainWindow);
    }
    
    console.log('✅ Interface graphique lancée');
    console.log('✨ Application prête');
});

// IPC: lister les dossiers d'un chemin
ipcMain.handle('list-folders', async (_event, payload) => {
    const { path: basePath, blacklist = [], ignoreSuffixes = [], ignoreExtensions = [] } = payload || {};
    if (!basePath) throw new Error('path is required');

    const resolvedPath = path.resolve(basePath);
    try {
        const entries = await fs.promises.readdir(resolvedPath, { withFileTypes: true });
        const folders = entries
            .filter((ent) => ent.isDirectory() && !isBlacklisted(ent.name, blacklist, ignoreSuffixes, ignoreExtensions))
            .map((ent) => ent.name);
        return { folders, path: resolvedPath };
    } catch (error) {
        console.error('❌ Erreur list-folders:', error);
        throw error;
    }
});

// IPC: ouvrir un chemin local (dossier/fichier) via shell.openPath
ipcMain.handle('open-path', async (_event, payload) => {
    const targetPath = typeof payload === 'string' ? payload : payload?.path;
    if (!targetPath) throw new Error('path is required');
    
    try {
        const resolved = path.resolve(targetPath);
        
        // Vérifier si le chemin existe
        if (!fs.existsSync(resolved)) {
            return { success: false, error: 'Path does not exist' };
        }
        
        // Throttle: attendre avant d'ouvrir si nécessaire
        const now = Date.now();
        const elapsed = now - lastOpenTime;
        if (elapsed < MIN_OPEN_INTERVAL) {
            const waitTime = MIN_OPEN_INTERVAL - elapsed;
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        lastOpenTime = Date.now();
        
        // Ouvrir avec le gestionnaire de fichiers natif
        const platform = process.platform;
        let cmd;
        
        if (platform === 'win32') {
            cmd = `explorer "${resolved}"`;
        } else if (platform === 'darwin') {
            cmd = `open "${resolved}"`;
        } else {
            // Linux - utiliser xdg-open ou nautilus
            cmd = `xdg-open "${resolved}" || nautilus "${resolved}" || dolphin "${resolved}"`;
        }
        
        exec(cmd, (error) => {
            if (error) {
                console.error('❌ Erreur ouverture explorateur:', error.message);
            }
        });
        
        return { success: true, path: resolved };
    } catch (error) {
        console.error('❌ Erreur open-path:', error);
        return { success: false, error: error.message };
    }
});

// IPC: récupérer l'icône d'une application
ipcMain.handle('get-app-icon', async (_event, payload) => {
    const { command, appName } = payload || {};
    if (!command) return { success: false, icon: null };
    
    try {
        // Extraire la commande de base (avant les flags)
        const baseCommand = command.split(' ')[0];
        
        // D'abord chercher dans /usr/share/applications avec la commande
        let desktopFiles = [
            `/usr/share/applications/${command}.desktop`,
            `/usr/share/applications/${baseCommand}.desktop`,
            `/usr/local/share/applications/${command}.desktop`,
            `/usr/local/share/applications/${baseCommand}.desktop`,
            `${os.homedir()}/.local/share/applications/${command}.desktop`,
            `${os.homedir()}/.local/share/applications/${baseCommand}.desktop`
        ];
        
        // Pour LibreOffice, détecter le type spécifique depuis la commande
        if (baseCommand === 'libreoffice' && command.includes('--')) {
            const flag = command.match(/--(\w+)/)?.[1];
            if (flag) {
                desktopFiles.unshift(`/usr/share/applications/libreoffice-${flag}.desktop`);
            }
        }
        
        // Ajouter des variantes courantes basées sur le nom de l'app
        if (appName) {
            const nameLower = appName.toLowerCase().replace(/\s+/g, '');
            desktopFiles.push(
                `/usr/share/applications/${nameLower}.desktop`,
                `/usr/share/applications/${baseCommand}-${nameLower}.desktop`,
                `/usr/share/applications/org.${nameLower}.${appName}.desktop`,
                `/usr/share/applications/org.gnome.${appName}.desktop`,  // GNOME apps (majuscule)
                `/usr/share/applications/org.gnome.${nameLower}.desktop`  // GNOME apps (minuscule)
            );
            // Ajouter aussi la variante complète (org.gnome.GNOME)
            desktopFiles.push(
                `/usr/share/applications/org.${nameLower}.${nameLower}.desktop`
            );
        }
        
        // Chercher aussi les .desktop contenant la commande (grep)
        try {
            const result = execSync(`grep -l "Exec=.*${baseCommand}" /usr/share/applications/*.desktop 2>/dev/null | head -5`, {
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'ignore']
            }).trim().split('\n').filter(Boolean);
            if (result[0]) desktopFiles.push(...result);
        } catch (e) {
            // Pas d'erreur si rien trouvé
        }
        
        // Pour les apps Flatpak, extraire l'ID
        let flatpakId = null;
        if (command.startsWith('flatpak') || command.includes('com.') || command.includes('io.')) {
            const parts = command.split(' ');
            flatpakId = parts[parts.length - 1];
            desktopFiles.push(
                `/var/lib/flatpak/app/${flatpakId}/current/active/files/share/applications/${flatpakId}.desktop`,
                `${os.homedir()}/.local/share/flatpak/app/${flatpakId}/current/active/files/share/applications/${flatpakId}.desktop`
            );
        }
        
        // Déduplicatif et filtre
        desktopFiles = [...new Set(desktopFiles)].filter(f => f && f.includes('.desktop'));
        
        for (const desktopFile of desktopFiles) {
            if (fs.existsSync(desktopFile)) {
                try {
                    const content = fs.readFileSync(desktopFile, 'utf8');
                    const iconMatch = content.match(/Icon=(.+)/);
                    
                    if (iconMatch) {
                        const iconName = iconMatch[1].trim();
                        
                        // Chercher l'icône - augmenter la couverture de recherche
                        const iconPaths = [
                            // Hicolor (standard)
                            `/usr/share/icons/hicolor/256x256/apps/${iconName}.png`,
                            `/usr/share/icons/hicolor/256x256/apps/${iconName}.svg`,
                            `/usr/share/icons/hicolor/128x128/apps/${iconName}.png`,
                            `/usr/share/icons/hicolor/128x128/apps/${iconName}.svg`,
                            `/usr/share/icons/hicolor/48x48/apps/${iconName}.png`,
                            `/usr/share/icons/hicolor/48x48/apps/${iconName}.svg`,
                            `/usr/share/icons/hicolor/scalable/apps/${iconName}.svg`,
                            // Pixmaps
                            `/usr/share/pixmaps/${iconName}.png`,
                            `/usr/share/pixmaps/${iconName}.svg`,
                            `/usr/share/pixmaps/${iconName}`,
                            // Adwaita (GNOME)
                            `/usr/share/icons/Adwaita/256x256/apps/${iconName}.png`,
                            `/usr/share/icons/Adwaita/256x256/apps/${iconName}.svg`,
                            `/usr/share/icons/Adwaita/scalable/apps/${iconName}.svg`,
                            // HighContrast
                            `/usr/share/icons/HighContrast/256x256/apps/${iconName}.png`,
                            `/usr/share/icons/HighContrast/256x256/apps/${iconName}.svg`,
                            // Mint-Y (popular Linux theme)
                            `/usr/share/icons/Mint-Y/apps/256/${iconName}.png`,
                            `/usr/share/icons/Mint-Y/apps/48/${iconName}.png`,
                            `/usr/share/icons/Mint-L/apps/256/${iconName}.png`,
                            `/usr/share/icons/Mint-L/apps/48/${iconName}.png`,
                            // Papirus (SVG icons)
                            `/usr/share/icons/Papirus/64x64/apps/${iconName}.svg`,
                            `/usr/share/icons/Papirus/48x48/apps/${iconName}.svg`,
                            `/usr/share/icons/Papirus/32x32/apps/${iconName}.svg`,
                            // Humanity
                            `/usr/share/icons/Humanity/apps/128/${iconName}.svg`,
                            `/usr/share/icons/Humanity/apps/64/${iconName}.svg`,
                            // Yaru
                            `/usr/share/icons/Yaru/256x256/apps/${iconName}.png`,
                            `/usr/share/icons/Yaru/48x48/apps/${iconName}.png`,
                            // GNOME
                            `/usr/share/icons/gnome/256x256/apps/${iconName}.png`,
                            `/usr/share/icons/gnome/48x48/apps/${iconName}.png`,
                            // Variantes avec traits d'union/underscore
                            `/usr/share/icons/hicolor/256x256/apps/${iconName.replace(/_/g, '-')}.png`,
                            `/usr/share/icons/hicolor/256x256/apps/${iconName.replace(/_/g, '-')}.svg`,
                            `/usr/share/icons/Adwaita/256x256/apps/${iconName.replace(/_/g, '-')}.png`,
                            `/usr/share/icons/Adwaita/256x256/apps/${iconName.replace(/_/g, '-')}.svg`,
                            `/usr/share/icons/Mint-Y/apps/256/${iconName.replace(/_/g, '-')}.png`
                        ];
                        
                        // Pour Flatpak
                        if (flatpakId) {
                            iconPaths.push(
                                `/var/lib/flatpak/app/${flatpakId}/current/active/files/share/icons/hicolor/256x256/apps/${iconName}.png`,
                                `/var/lib/flatpak/app/${flatpakId}/current/active/files/share/pixmaps/${iconName}.png`,
                                `${os.homedir()}/.local/share/flatpak/app/${flatpakId}/current/active/files/share/icons/hicolor/256x256/apps/${iconName}.png`
                            );
                        }
                        
                        for (const iconPath of iconPaths) {
                            if (fs.existsSync(iconPath)) {
                                console.log('✅ Icône trouvée:', iconPath);
                                return { success: true, icon: iconPath };
                            }
                        }
                    }
                } catch (err) {
                    console.warn('⚠️ Erreur lecture .desktop:', desktopFile, err.message);
                }
            }
        }
        
        console.warn('⚠️ Icône non trouvée pour:', command, 'avec appName:', appName);
        return { success: false, icon: null };
    } catch (error) {
        console.error('❌ Erreur get-app-icon:', error);
        return { success: false, icon: null };
    }
});

// IPC: lancer une application
ipcMain.handle('launch-app', async (_event, payload) => {
    const { command, args = [] } = payload || {};
    if (!command) throw new Error('command is required');
    
    try {
        // Construire la commande avec les arguments
        const cmdArgs = args.map(arg => `"${arg}"`).join(' ');
        const fullCmd = cmdArgs ? `${command} ${cmdArgs}` : command;
        
        exec(fullCmd, (error, stdout, stderr) => {
            if (error) {
                console.error('❌ Erreur lancement app:', error.message);
                return;
            }
            if (stderr) {
                console.warn('⚠️ App stderr:', stderr);
            }
            console.log('✅ Application lancée:', command);
        });
        
        return { success: true, command };
    } catch (error) {
        console.error('❌ Erreur launch-app:', error);
        return { success: false, error: error.message };
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
        serverWsUrl: SERVER_WS_URL,
        serverConnected: serverConnected,
        serverMode: MODE,
        nodeEnv: isProduction ? 'production' : 'development',
        isProduction: isProduction,
        appVersion: app.getVersion()
    };
});

/**
 * Vérifier manuellement les mises à jour
 */
ipcMain.handle('check-for-updates', async () => {
    if (!isProduction) {
        return { success: false, message: 'Auto-updater désactivé en développement' };
    }
    
    try {
        const autoUpdater = getAutoUpdater();
        await autoUpdater.checkForUpdates();
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

/**
 * Installer la mise à jour téléchargée
 */
ipcMain.handle('install-update', async () => {
    if (!isProduction) {
        return { success: false, message: 'Auto-updater désactivé en développement' };
    }
    
    try {
        const autoUpdater = getAutoUpdater();
        await autoUpdater.installUpdate();
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

/**
 * Obtenir les informations sur les mises à jour
 */
ipcMain.handle('get-update-info', async () => {
    if (!isProduction) {
        return {
            enabled: false,
            currentVersion: app.getVersion(),
            updateAvailable: false,
            updateDownloaded: false
        };
    }
    
    try {
        const autoUpdater = getAutoUpdater();
        const info = autoUpdater.getUpdateInfo();
        return {
            enabled: true,
            ...info
        };
    } catch (error) {
        return {
            enabled: true,
            error: error.message
        };
    }
});

/**
 * Obtenir la configuration serveur complète
 */
ipcMain.handle('get-server-config', async () => {
    // Si un serveur a été découvert, mettre à jour currentConfig
    if (discoveredServer) {
        currentConfig = { url: SERVER_URL, ws: SERVER_WS_URL };
    }
    
    return {
        mode: MODE,
        config: currentConfig,
        discoveredServer: discoveredServer,
        serverUrl: SERVER_URL,
        serverWs: SERVER_WS_URL,
        allModes: Object.keys(serverConfig).filter(k => typeof serverConfig[k] === 'object' && serverConfig[k].url),
        healthCheckInterval: serverConfig.healthCheckInterval,
        reconnectDelay: serverConfig.reconnectDelay,
        maxReconnectAttempts: serverConfig.maxReconnectAttempts
    };
});

/**
 * Obtenir l'IP locale de la machine
 */
ipcMain.handle('get-local-ip', async () => {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // Ignorer les adresses internes (127.0.0.1) et IPv6
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1'; // Fallback
});

/**
 * Obtenir les infos système locales (RAM, réseau)
 */
ipcMain.handle('get-system-info', async () => {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    const usedPercent = Math.round((used / total) * 100);

    // Déterminer une interface active et son type
    const interfaces = os.networkInterfaces();
    let ifaceName = null;
    let address = null;
    let connectionType = 'unknown';
    
    for (const [name, list] of Object.entries(interfaces)) {
        if (!Array.isArray(list)) continue;
        const found = list.find((i) => i.family === 'IPv4' && !i.internal);
        if (found) {
            ifaceName = name;
            address = found.address;
            
            // Déterminer le type de connexion selon le nom de l'interface
            const lowerName = name.toLowerCase();
            if (lowerName.includes('wl') || lowerName.includes('wi-fi') || lowerName.includes('wifi') || lowerName.includes('wlan')) {
                connectionType = 'wifi';
            } else if (lowerName.includes('en') || lowerName.includes('eth') || lowerName.includes('eno') || lowerName.includes('enp')) {
                connectionType = 'ethernet';
            } else if (lowerName.includes('ppp') || lowerName.includes('wwan') || lowerName.includes('rmnet')) {
                connectionType = 'cellular';
            } else if (lowerName.includes('bt') || lowerName.includes('bluetooth')) {
                connectionType = 'bluetooth';
            }
            break;
        }
    }

    return {
        memory: {
            totalBytes: total,
            freeBytes: free,
            usedBytes: used,
            totalGb: (total / (1024 ** 3)).toFixed(2),
            usedGb: (used / (1024 ** 3)).toFixed(2),
            freeGb: (free / (1024 ** 3)).toFixed(2),
            usedPercent
        },
        network: {
            interface: ifaceName,
            address,
            type: connectionType
        }
    };
});
