// Importer les modules Electron
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');

let mainWindow;
let pdfWindows = new Map(); // Stocker les références des fenêtres PDF

/**
 * Créer la fenêtre principale
 */
function createWindow() {
    console.log('🪟 Création de la fenêtre');
    
    // Créer une fenêtre
    mainWindow = new BrowserWindow({
        width: 1200,           // Largeur
        height: 800,           // Hauteur
        webPreferences: {
            // Sécurité
            nodeIntegration: false,      // N'expose pas Node.js
            contextIsolation: true,      // Isoler le contexte
            preload: path.join(__dirname, 'preload.js')  // Charger preload.js
        }
    });

    // Charger la page HTML
    mainWindow.loadFile('index.html');

    // // Ouvrir les DevTools (à enlever en production)
    // mainWindow.webContents.openDevTools();

    // console.log('✅ Fenêtre créée');

    // // Gérer la fermeture
    // mainWindow.on('closed', () => {
    //     mainWindow = null;
    //     console.log('❌ Fenêtre fermée');
    // });
}

/**
 * Événement : App prête
 * → Créer la fenêtre
 */
app.on('ready', createWindow);

/**
 * Événement : Toutes les fenêtres fermées
 * → Quitter l'app (Windows/Linux)
 */
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {  // darwin = macOS
        app.quit();
    }
});

/**
 * Événement : App réactivée (macOS uniquement)
 * → Recréer la fenêtre
 */
app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});

/**
 * IPC : Ouvrir une URL externe dans le navigateur par défaut
 * Appelé par : window.electron.openExternal(url)
 */
ipcMain.on('open-external', (event, url) => {
    console.log(`🌐 Ouverture de l'URL externe: ${url}`);
    shell.openExternal(url).catch(error => {
        console.error('❌ Erreur ouverture URL:', error);
    });
});

/**
 * IPC : Ouvrir un fichier PDF avec l'application par défaut
 * Appelé par : window.electron.openPDF('open-pdf')
 */
ipcMain.on('open-pdf', (event) => {
    const pdfPath = path.join(__dirname, 'public', 'src', 'pdf', 'Règlement_intérieur_chantier_num.pdf');
    console.log(`📄 Ouverture du PDF: ${pdfPath}`);
    shell.openPath(pdfPath).catch(error => {
        console.error('❌ Erreur ouverture PDF:', error);
    });
});

/**
 * IPC : Ouvrir un PDF dans une nouvelle fenêtre
 * Appelé par : window.electron.invoke('open-pdf-window', {pdfFile, title})
 */
ipcMain.handle('open-pdf-window', async (event, data) => {
    try {
        const { pdfFile, title } = data;
        const pdfPath = path.join(__dirname, 'public', 'src', 'pdf', pdfFile);
        
        console.log(`📄 Création fenêtre PDF: ${title} (${pdfFile})`);
        
        // Créer une nouvelle fenêtre
        const pdfWindow = new BrowserWindow({
            width: 900,
            height: 700,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, 'preload.js')
            }
        });
        
        // Charger le PDF dans la fenêtre
        pdfWindow.loadURL(`file://${pdfPath}`);
        pdfWindow.webContents.setWindowOpenHandler(({ url }) => {
            shell.openExternal(url);
            return { action: 'deny' };
        });
        
        // Définir le titre de la fenêtre
        pdfWindow.setTitle(title);
        
        // Stocker la référence
        pdfWindow.id = Math.random();
        pdfWindows.set(pdfWindow.id, pdfWindow);
        
        // Nettoyer quand la fenêtre est fermée
        pdfWindow.on('closed', () => {
            pdfWindows.delete(pdfWindow.id);
        });
        
        return { success: true };
    } catch (error) {
        console.error('❌ Erreur ouverture fenêtre PDF:', error);
        return { success: false, error: error.message };
    }
});

console.log('🚀 Electron démarré');