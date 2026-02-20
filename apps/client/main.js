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
const PDFDocument = require('pdfkit');

// #region agent log (bootstrap debug log pour AppImage sur autres machines)
function getAppImageDebugLogPath() {
    try {
        if (app.isPackaged) {
            return path.join(app.getPath('userData'), 'debug.log');
        }
        return path.join(__dirname, '..', '..', '.cursor', 'debug.log');
    } catch (_) {
        return path.join(os.homedir(), '.config', 'workspace-client-debug.log');
    }
}
function writeAppImageDebugLog(payload) {
    try {
        const logPath = getAppImageDebugLogPath();
        const dir = path.dirname(logPath);
        if (!fs.existsSync(dir)) {
            try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
        }
        fs.appendFileSync(logPath, JSON.stringify({ ...payload, timestamp: Date.now() }) + '\n');
    } catch (_) {}
}
try {
    writeAppImageDebugLog({
        hypothesisId: 'H4-H5',
        location: 'main.js:bootstrap',
        message: 'main_started',
        data: {
            platform: process.platform,
            arch: process.arch,
            nodeVersion: process.version,
            packaged: app.isPackaged,
            execPath: process.execPath ? path.basename(process.execPath) : ''
        }
    });
} catch (_) {}
process.on('uncaughtException', (err) => {
    writeAppImageDebugLog({ hypothesisId: 'H4', location: 'uncaughtException', message: String(err && err.message), data: { stack: err && err.stack } });
});
process.on('unhandledRejection', (reason) => {
    writeAppImageDebugLog({ hypothesisId: 'H4', location: 'unhandledRejection', message: String(reason) });
});
// #endregion

// Import ClientDiscovery
const ClientDiscovery = require('./lib/ClientDiscovery.js');

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
let splashWindow = null;
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
 * Écran de démarrage (splash) affiché pendant le chargement
 */
function createSplashWindow() {
    const splashHtml = `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: linear-gradient(145deg, #1a237e 0%, #0d47a1 100%);
    color: #fff;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
  }
  .logo { font-size: 2rem; font-weight: 700; margin-bottom: 0.5rem; letter-spacing: 0.02em; }
  .tagline { font-size: 0.9rem; opacity: 0.85; margin-bottom: 2rem; }
  .spinner {
    width: 40px; height: 40px;
    border: 3px solid rgba(255,255,255,0.25);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .message { margin-top: 1.25rem; font-size: 0.85rem; opacity: 0.9; }
  .progress-wrap { margin-top: 1rem; width: 100%; max-width: 260px; display: none; }
  .progress-wrap.visible { display: block; }
  .progress-bar { height: 8px; background: rgba(255,255,255,0.25); border-radius: 4px; overflow: hidden; }
  .progress-fill { height: 100%; width: 0%; background: rgba(255,255,255,0.9); border-radius: 4px; transition: width 0.2s ease; }
</style></head><body>
  <div class="logo">Workspace</div>
  <div class="tagline">By Sandersonn</div>
  <div class="spinner"></div>
  <p class="message">Chargement en cours…</p>
  <div class="progress-wrap" id="splash-progress">
    <div class="progress-bar"><div class="progress-fill" id="splash-progress-fill"></div></div>
  </div>
</body></html>`;
    const win = new BrowserWindow({
        width: 380,
        height: 280,
        frame: true,
        transparent: false,
        resizable: false,
        show: false,
        alwaysOnTop: true,
        webPreferences: { nodeIntegration: false, contextIsolation: true }
    });
    win.setMenuBarVisibility(false);
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(splashHtml));
    win.once('ready-to-show', () => win.show());
    splashWindow = win;
    win.on('closed', () => { splashWindow = null; });
    return win;
}

/**
 * Mettre à jour le message affiché sur l'écran de démarrage (splash)
 */
function setSplashMessage(text) {
    if (splashWindow && !splashWindow.isDestroyed() && splashWindow.webContents) {
        splashWindow.webContents.executeJavaScript(
            `(function(){ var el = document.querySelector('.message'); if (el) el.textContent = ${JSON.stringify(text)}; })();`
        ).catch(() => {});
    }
}

/**
 * Afficher ou masquer la barre de progression (percent: 0-100, ou null pour masquer)
 */
function setSplashProgress(percent) {
    if (!splashWindow || splashWindow.isDestroyed() || !splashWindow.webContents) return;
    const show = typeof percent === 'number';
    const value = Math.min(100, Math.max(0, percent));
    splashWindow.webContents.executeJavaScript(
        `(function(){
            var wrap = document.getElementById('splash-progress');
            var fill = document.getElementById('splash-progress-fill');
            if (wrap) wrap.classList.toggle('visible', ${show});
            if (fill) fill.style.width = ${JSON.stringify(value)} + '%';
        })();`
    ).catch(() => {});
}

/**
 * Afficher l'état succès sur le splash (icône check, pas de spinner) et masquer la barre de progression
 */
function setSplashUpdateSuccess(text) {
    if (splashWindow && !splashWindow.isDestroyed() && splashWindow.webContents) {
        splashWindow.webContents.executeJavaScript(
            `(function(){
                var spinner = document.querySelector('.spinner');
                var msg = document.querySelector('.message');
                var progressWrap = document.getElementById('splash-progress');
                if (spinner) { spinner.style.display = 'none'; }
                if (progressWrap) { progressWrap.classList.remove('visible'); }
                var wrap = document.querySelector('.message-wrap');
                if (!wrap && msg) {
                    wrap = document.createElement('div');
                    wrap.className = 'message-wrap';
                    msg.parentNode.insertBefore(wrap, msg);
                    wrap.appendChild(msg);
                }
                if (wrap) wrap.innerHTML = '<div class="splash-success"><span class="splash-check">✓</span></div><p class="message">' + ${JSON.stringify(text)} + '</p>';
                var style = document.createElement('style');
                style.textContent = '.splash-success { margin-top: 1rem; }.splash-check { display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; background: rgba(76, 175, 80, 0.9); color: #fff; border-radius: 50%; font-size: 1.5rem; font-weight: bold; }.message-wrap .message { margin-top: 0.75rem; }';
                if (!document.querySelector('#splash-success-style')) { style.id = 'splash-success-style'; document.head.appendChild(style); }
            })();`
        ).catch(() => {});
    }
}

/**
 * Fermer l'écran de démarrage (splash)
 */
function closeSplashWindow() {
    if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.close();
        splashWindow = null;
    }
}

/**
 * Créer la fenêtre principale (une seule instance)
 */
function createWindow() {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
        return;
    }
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

    // Charger l'index.html ; afficher la fenêtre et fermer le splash une fois prêt
    mainWindow.loadURL(`file://${path.join(__dirname, 'public', 'index.html')}`);
    let showMainCalled = false;
    let showMainFallbackId;
    const showMainAndCloseSplash = () => {
        if (showMainCalled) return;
        showMainCalled = true;
        if (showMainFallbackId) clearTimeout(showMainFallbackId);
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show();
        closeSplashWindow();
        const flagPath = path.join(app.getPath('userData'), 'workspace-update-installed.flag');
        if (fs.existsSync(flagPath)) {
            try {
                fs.unlinkSync(flagPath);
            } catch (_) {}
            setTimeout(() => {
                if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
                    mainWindow.webContents.send('update-was-installed');
                }
            }, 800);
        }
    };
    mainWindow.webContents.once('did-finish-load', showMainAndCloseSplash);
    showMainFallbackId = setTimeout(showMainAndCloseSplash, 15000);

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

/** Garde pour éviter le double lancement (ex. checkForUpdates rejette après update-not-available) */
let appLaunched = false;

/**
 * Lancer l'application (fenêtre principale après éventuelle mise à jour)
 */
async function launchApp() {
    if (appLaunched) return;
    appLaunched = true;
    setSplashMessage('Chargement en cours…');
    await checkServerConnection();
    if (!serverConnected) {
        console.log('🔌 Mode hors-ligne: Le client démarre sans connexion serveur');
    }
    createWindow();
    console.log('✅ Interface graphique lancée');
    console.log('✨ Application prête');
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

    createSplashWindow();

    if (app.isPackaged) {
        try {
            const { autoUpdater } = require('electron-updater');
            autoUpdater.autoDownload = true;
            autoUpdater.autoInstallOnAppQuit = false;

            let updateHandled = false;
            let timeoutId;
            const done = () => {
                if (updateHandled) return;
                updateHandled = true;
                if (timeoutId) clearTimeout(timeoutId);
                setSplashMessage('Aucune mise à jour');
                setSplashProgress(null);
                setTimeout(() => {
                    setSplashMessage('Lancement…');
                    setTimeout(launchApp, 400);
                }, 600);
            };

            autoUpdater.on('checking-for-update', () => {
                setSplashMessage('Recherche de mise à jour…');
                setSplashProgress(null);
            });
            autoUpdater.on('update-available', () => {
                setSplashMessage('Mise à jour trouvée');
                setSplashProgress(0);
            });
            autoUpdater.on('download-progress', (p) => {
                const percent = Math.round(p.percent || 0);
                setSplashMessage('Téléchargement');
                setSplashProgress(percent);
            });
            autoUpdater.on('update-downloaded', () => {
                if (timeoutId) clearTimeout(timeoutId);
                updateHandled = true;
                setSplashProgress(null);
                setSplashMessage('Installation');
                const flagPath = path.join(app.getPath('userData'), 'workspace-update-installed.flag');
                try {
                    fs.writeFileSync(flagPath, Date.now().toString(), 'utf8');
                } catch (_) {}
                setTimeout(() => {
                    const REDIRECT_SECONDS = 3;
                    setSplashUpdateSuccess(`Redémarrage dans ${REDIRECT_SECONDS} s…`);
                    let left = REDIRECT_SECONDS;
                    const t = setInterval(() => {
                        left--;
                        if (left > 0) {
                            setSplashMessage(`Redémarrage dans ${left} s…`);
                        } else {
                            clearInterval(t);
                            autoUpdater.quitAndInstall(false, true);
                        }
                    }, 1000);
                }, 500);
            });
            autoUpdater.on('update-not-available', done);
            autoUpdater.on('error', () => done());

            setSplashMessage('Recherche de mise à jour…');
            timeoutId = setTimeout(done, 12000);
            await autoUpdater.checkForUpdates();
        } catch (e) {
            console.warn('Mise à jour auto non disponible:', e.message);
            if (timeoutId) clearTimeout(timeoutId);
            await launchApp();
        }
    } else {
        await launchApp();
    }
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

// IPC: ouvrir un chemin local (fichier ou dossier) avec l'app par défaut
ipcMain.handle('open-path', async (_event, payload) => {
    const targetPath = typeof payload === 'string' ? payload : payload?.path;
    if (!targetPath) throw new Error('path is required');
    
    try {
        const resolved = path.resolve(targetPath);
        
        if (!fs.existsSync(resolved)) {
            return { success: false, error: 'Path does not exist' };
        }
        
        const now = Date.now();
        const elapsed = now - lastOpenTime;
        if (elapsed < MIN_OPEN_INTERVAL) {
            await new Promise(resolve => setTimeout(resolve, MIN_OPEN_INTERVAL - elapsed));
        }
        lastOpenTime = Date.now();
        
        const stat = fs.statSync(resolved);
        if (stat.isFile()) {
            const err = await shell.openPath(resolved);
            if (err) {
                console.error('❌ open-path (fichier):', err);
                return { success: false, error: err };
            }
            return { success: true, path: resolved };
        }
        
        const platform = process.platform;
        let cmd;
        if (platform === 'win32') {
            cmd = `explorer "${resolved}"`;
        } else if (platform === 'darwin') {
            cmd = `open "${resolved}"`;
        } else {
            cmd = `xdg-open "${resolved}" || nautilus "${resolved}" || dolphin "${resolved}"`;
        }
        exec(cmd, (error) => {
            if (error) console.error('❌ Erreur ouverture dossier:', error.message);
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

/** Dossier de backup PDF traçabilité : /mnt/team/#TEAM/#TRAÇABILITÉ (exactement comme demandé) */
const TRACABILITE_PDF_BASE = '/mnt/team/#TEAM/#TRAÇABILITÉ';

/**
 * Formater une date ISO en "jj/mm/aaaa HH:mm" pour le PDF
 */
function formatDateForPdf(iso) {
    if (!iso || typeof iso !== 'string') return '-';
    try {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '-';
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const h = String(d.getHours()).padStart(2, '0');
        const m = String(d.getMinutes()).padStart(2, '0');
        return `${day}/${month}/${year} ${h}:${m}`;
    } catch (_) {
        return '-';
    }
}

/** Échapper pour affichage dans le HTML du template PDF */
function escapeHtml(s) {
    if (s == null) return '';
    const str = String(s);
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** Libellés français pour les types (code API -> affichage PDF) */
const TYPE_LABELS = { portable: 'Portable', fixe: 'Fixe', ecran: 'Écran', autres: 'Autres' };
function typeLabel(code) {
    if (!code || typeof code !== 'string') return 'Non défini';
    const c = code.trim().toLowerCase();
    return TYPE_LABELS[c] || (code.trim() || 'Non défini');
}

/**
 * Formater date/heure item pour le PDF (created_at, state_changed_at, updated_at, ou date+time)
 */
function formatItemDateForPdf(it) {
    const iso = it.created_at || it.createdAt || it.state_changed_at || it.stateChangedAt || it.updated_at || it.updatedAt;
    if (iso) return formatDateForPdf(iso);
    if (it.date && it.time) {
        const d = it.date + 'T' + (String(it.time).length === 5 ? it.time + ':00' : it.time);
        return formatDateForPdf(d);
    }
    if (it.date && /^\d{4}-\d{2}-\d{2}/.test(String(it.date))) return formatDateForPdf(it.date + 'T00:00:00');
    // Chaîne type "YYYY-MM-DD HH:mm:ss" ou "YYYY-MM-DD"
    const dateStr = it.date || it.date_changed;
    if (dateStr && /^\d{4}-\d{2}-\d{2}/.test(String(dateStr))) return formatDateForPdf(String(dateStr).replace(' ', 'T').slice(0, 19) || dateStr + 'T00:00:00');
    return '-';
}

/** Construire le bloc HTML du résumé PDF : total + types en ligne, puis cartes par état */
function buildPdfSummaryBlock(totalItems, typeEntries, stateEntries) {
    const typeParts = typeEntries.map(([typeName, count]) => `${escapeHtml(typeLabel(typeName))} ${count}`).join(', ');
    const totalLine = `<p class="pdf-summary-total-line"><i class="fa-solid fa-laptop-code"></i> <strong>${escapeHtml(String(totalItems))} machine(s)</strong>${typeParts ? ` (${typeParts})` : ''}</p>`;
    const stateCards = stateEntries
        .map(([stateName, count]) => `<span class="pdf-summary-state-card"><span class="pdf-summary-state-name">${escapeHtml(stateName)}</span><span class="pdf-summary-state-count">${escapeHtml(String(count))}</span></span>`)
        .join('\n');
    return `${totalLine}\n<div class="pdf-summary-state-cards">${stateCards}</div>`;
}

/**
 * Générer le PDF d'un lot via le template HTML/CSS si présent, sinon PDFKit.
 * Template : apps/client/public/pdf-templates/lot.html + lot.css
 * Placeholders : {{lotId}}, {{lotName}}, {{created_at}}, {{finished_at}}, {{recovered_at}},
 * {{summary_block}}, {{items_rows}}
 */
async function generateLotPdfFromHtmlTemplate(payload, fullPath, stateEntries, typeEntries, totalItems) {
    const templateDir = path.join(__dirname, 'public', 'pdf-templates');
    const htmlPath = path.join(templateDir, 'lot.html');
    const cssPath = path.join(templateDir, 'lot.css');
    if (!fs.existsSync(htmlPath) || !fs.existsSync(cssPath)) {
        return null;
    }
    const {
        lotId,
        lotName,
        items = [],
        created_at,
        finished_at,
        recovered_at
    } = payload;

    const css = fs.readFileSync(cssPath, 'utf8');
    let html = fs.readFileSync(htmlPath, 'utf8');

    const summaryBlock = buildPdfSummaryBlock(totalItems, typeEntries, stateEntries);
    const itemsRows = items
        .map((it, idx) => {
            const num = it.numero != null ? it.numero : idx + 1;
            const sn = escapeHtml(it.serial_number || it.serialNumber || '-');
            const type = escapeHtml(typeLabel(it.type));
            const marque = escapeHtml(it.marque_name || it.marqueName || '-');
            const modele = escapeHtml(it.modele_name || it.modeleName || '-');
            const state = escapeHtml(it.state || '-');
            const tech = escapeHtml(it.technician || it.technicien || '-');
            const dateHeure = escapeHtml(formatItemDateForPdf(it));
            return `<tr><td class="col-num">${num}</td><td class="col-sn">${sn}</td><td class="col-type">${type}</td><td class="col-marque">${marque}</td><td class="col-modele">${modele}</td><td class="col-date">${dateHeure}</td><td class="col-state">${state}</td><td class="col-tech">${tech}</td></tr>`;
        })
        .join('\n');

    const replacements = [
        [/\{\{\s*lotId\s*\}\}/g, escapeHtml(lotId)],
        [/\{\{\s*lotName\s*\}\}/g, escapeHtml(lotName || '-')],
        [/\{\{\s*created_at\s*\}\}/g, escapeHtml(formatDateForPdf(created_at))],
        [/\{\{\s*finished_at\s*\}\}/g, escapeHtml(formatDateForPdf(finished_at))],
        [/\{\{\s*recovered_at\s*\}\}/g, escapeHtml(formatDateForPdf(recovered_at))],
        [/\{\{\s*totalItems\s*\}\}/g, String(totalItems)],
        [/\{\{\s*summary_block\s*\}\}/g, summaryBlock],
        [/\{\{\s*items_rows\s*\}\}/g, itemsRows]
    ];
    replacements.forEach(([regex, value]) => { html = html.replace(regex, value); });

    html = html.replace(
        /<link\s+rel="stylesheet"\s+href="lot\.css"\s*\/?>/i,
        `<style>${css}</style>`
    );

    // FontAwesome : lien relatif valide quand on charge depuis un fichier dans pdf-templates
    const fontawesomeLink = '<link rel="stylesheet" href="../assets/css/fontawesome-local.css">';
    if (!html.includes('fontawesome')) {
        html = html.replace('</head>', `${fontawesomeLink}\n</head>`);
    }

    const outputPath = path.join(templateDir, '.lot-pdf-output.html');
    try {
        fs.writeFileSync(outputPath, html, 'utf8');
    } catch (e) {
        console.error('❌ generate-lot-pdf write temp HTML:', e.message);
        return null;
    }

    const win = new BrowserWindow({
        show: false,
        webPreferences: { offscreen: true }
    });
    try {
        await win.loadFile(outputPath);
        // Marges gérées par @page dans lot.css ; pas de custom margins pour éviter l'erreur Chromium
        const pdfBuffer = await win.webContents.printToPDF({
            printBackground: true,
            pageSize: 'A4',
            preferCSSPageSize: true
        });
        fs.writeFileSync(fullPath, pdfBuffer);
        return { success: true, pdf_path: path.resolve(fullPath) };
    } finally {
        win.close();
        try { fs.unlinkSync(outputPath); } catch (_) {}
    }
}

/**
 * Générer le PDF d'un lot et l'enregistrer localement dans le dossier traçabilité.
 * Payload: { lotId, lotName, date, items, created_at?, finished_at?, recovered_at?, basePath? }
 */
ipcMain.handle('generate-lot-pdf', async (_event, payload) => {
    const {
        lotId,
        lotName,
        date,
        items = [],
        created_at,
        finished_at,
        recovered_at,
        basePath = TRACABILITE_PDF_BASE
    } = payload || {};
    if (!lotId) {
        return { success: false, error: 'lotId requis' };
    }
    const rawDate = date ? String(date).trim() : (finished_at ? String(finished_at).slice(0, 10) : '');
    const dateStr = /^\d{4}-\d{2}-\d{2}/.test(rawDate) ? rawDate.slice(0, 10) : new Date().toISOString().slice(0, 10);
    const year = dateStr.slice(0, 4);
    const monthNum = parseInt(dateStr.slice(5, 7), 10) || 1;
    const MOIS_TRACABILITE = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    const nomMois = MOIS_TRACABILITE[Math.max(0, monthNum - 1)];
    const dirPath = path.join(basePath, year, nomMois);
    try {
        fs.mkdirSync(dirPath, { recursive: true });
    } catch (e) {
        console.error('❌ generate-lot-pdf mkdir:', e.message);
        return { success: false, error: 'Impossible de créer le dossier: ' + e.message };
    }
    let sanitizedName = (lotName || '').replace(/[\s]+/g, '_').replace(/[\\/:*?"<>|]/g, '').trim();
    if (!sanitizedName) sanitizedName = `Lot_${lotId}`;
    const fileName = `${sanitizedName}_${dateStr}.pdf`;
    const fullPath = path.join(dirPath, fileName);

    const totalItems = items.length;
    const stateCounts = {};
    const typeCounts = {};
    items.forEach((it) => {
        const s = (it.state && String(it.state).trim()) || 'Non défini';
        stateCounts[s] = (stateCounts[s] || 0) + 1;
        const t = (it.type && String(it.type).trim()) || 'Non défini';
        typeCounts[t] = (typeCounts[t] || 0) + 1;
    });
    const STATE_ORDER = ['Reconditionnés', 'Pour pièces', 'HS', 'Non défini'];
    const stateEntries = STATE_ORDER.map((name) => [name, stateCounts[name] || 0]);
    const typeEntries = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);

    try {
        const htmlResult = await generateLotPdfFromHtmlTemplate(
            { lotId, lotName, date, items, created_at, finished_at, recovered_at },
            fullPath,
            stateEntries,
            typeEntries,
            totalItems
        );
        if (htmlResult) return htmlResult;
    } catch (err) {
        console.error('❌ generate-lot-pdf (template HTML):', err.message);
    }

    const margin = 50;
    const pageWidth = 595;
    const contentWidth = pageWidth - margin * 2;

    return new Promise((resolve) => {
        const doc = new PDFDocument({ margin, size: 'A4' });
        const stream = fs.createWriteStream(fullPath);
        doc.pipe(stream);

        let y = margin;

        // ---- En-tête ----
        doc.fontSize(22).font('Helvetica-Bold').text(`Lot #${lotId}`, margin, y);
        y = doc.y + 4;
        doc.fontSize(11).font('Helvetica').fillColor('#333333').text(lotName || '-', margin, y);
        y = doc.y + 16;

        // ---- Bloc Infos (créé / terminé / récupéré) - style type icônes (symboles Unicode) ----
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#1a1a1a').text('Informations du lot', margin, y);
        y += 18;
        const lineH = 16;
        const bulletX = margin;
        const labelX = margin + 14;
        const valueX = labelX + 82;
        doc.font('Helvetica').fontSize(10);
        doc.fillColor('#2e7d32').text('\u2022', bulletX, y); doc.fillColor('#444444').text('Créé le', labelX, y); doc.fillColor('#1a1a1a').text(formatDateForPdf(created_at), valueX, y);
        y += lineH;
        doc.fillColor('#2e7d32').text('\u2022', bulletX, y); doc.fillColor('#444444').text('Terminé le', labelX, y); doc.fillColor('#1a1a1a').text(formatDateForPdf(finished_at), valueX, y);
        y += lineH;
        doc.fillColor('#2e7d32').text('\u2022', bulletX, y); doc.fillColor('#444444').text('Récupéré le', labelX, y); doc.fillColor(recovered_at ? '#1a1a1a' : '#888888').text(recovered_at ? formatDateForPdf(recovered_at) : '-', valueX, y);
        y += lineH + 8;

        // ---- Résumé (total + par état) ----
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#1a1a1a').text('Résumé', margin, y);
        y += 18;
        doc.font('Helvetica').fontSize(10);
        doc.fillColor('#1565c0').text('\u2022', bulletX, y); doc.fillColor('#444444').text(`Total : ${totalItems} machine${totalItems !== 1 ? 's' : ''}`, labelX, y);
        y += lineH;
        stateEntries.forEach(([stateName, count]) => {
            doc.fillColor('#1565c0').text('\u2022', bulletX, y); doc.fillColor('#444444').text(`${stateName} : ${count}`, labelX, y);
            y += lineH;
        });
        y += 12;

        // ---- Tableau détail ----
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#1a1a1a').text('Détail des articles', margin, y);
        y += 16;
        const colN = 38;
        const colSn = 38;
        const colType = 70;
        const colMarque = 75;
        const colModele = 85;
        const colState = 75;
        const colTech = 90;
        const tableLeft = margin;
        const headerY = y;
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#333333');
        doc.text('N°', tableLeft, headerY);
        doc.text('S/N', tableLeft + colN, headerY);
        doc.text('Type', tableLeft + colN + colSn, headerY);
        doc.text('Marque', tableLeft + colN + colSn + colType, headerY);
        doc.text('Modèle', tableLeft + colN + colSn + colType + colMarque, headerY);
        doc.text('État', tableLeft + colN + colSn + colType + colMarque + colModele, headerY);
        doc.text('Technicien', tableLeft + colN + colSn + colType + colMarque + colModele + colState, headerY);
        y += 14;
        doc.moveTo(tableLeft, y).lineTo(tableLeft + contentWidth, y).strokeColor('#cccccc').stroke();
        y += 10;
        doc.font('Helvetica').fontSize(9).fillColor('#1a1a1a');
        let rowNum = 1;
        for (const it of items) {
            const num = String(it.numero != null ? it.numero : rowNum);
            rowNum += 1;
            const sn = String(it.serial_number || '-').slice(0, 18);
            const type = String(it.type || '-').slice(0, 10);
            const marque = String(it.marque_name || '-').slice(0, 12);
            const modele = String(it.modele_name || '-').slice(0, 14);
            const state = String(it.state || '-').slice(0, 12);
            const tech = String(it.technician || '-').slice(0, 14);
            doc.text(num, tableLeft, y);
            doc.text(sn, tableLeft + colN, y);
            doc.text(type, tableLeft + colN + colSn, y);
            doc.text(marque, tableLeft + colN + colSn + colType, y);
            doc.text(modele, tableLeft + colN + colSn + colType + colMarque, y);
            doc.text(state, tableLeft + colN + colSn + colType + colMarque + colModele, y);
            doc.text(tech, tableLeft + colN + colSn + colType + colMarque + colModele + colState, y);
            y += 15;
        }

        doc.end();
        stream.on('finish', () => resolve({ success: true, pdf_path: path.resolve(fullPath) }));
        stream.on('error', (err) => {
            console.error('❌ generate-lot-pdf stream:', err.message);
            resolve({ success: false, error: err.message });
        });
        doc.on('error', (err) => {
            console.error('❌ generate-lot-pdf doc:', err.message);
            resolve({ success: false, error: err.message });
        });
    });
});

/**
 * Lire un fichier et retourner son contenu en base64 (pour envoi du PDF au serveur).
 */
ipcMain.handle('read-file-as-base64', async (_event, payload) => {
    const filePath = typeof payload === 'string' ? payload : payload?.path;
    if (!filePath || typeof filePath !== 'string') {
        return { success: false, error: 'path requis' };
    }
    try {
        const resolved = path.resolve(filePath);
        if (!fs.existsSync(resolved)) {
            return { success: false, error: 'Fichier introuvable' };
        }
        const buffer = fs.readFileSync(resolved);
        const base64 = buffer.toString('base64');
        return { success: true, base64 };
    } catch (err) {
        console.error('❌ read-file-as-base64:', err.message);
        return { success: false, error: err.message };
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
