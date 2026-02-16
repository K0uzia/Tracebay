const { contextBridge, ipcRenderer } = require('electron');

const ALLOWED_CHANNELS = {
    send: ['open-pdf'],
    invoke: ['open-external', 'open-pdf-window', 'get-app-config', 'get-server-config', 'get-local-ip', 'get-system-info', 'list-folders', 'open-path', 'launch-app', 'get-app-icon', 'check-for-updates', 'install-update', 'get-update-info', 'generate-lot-pdf', 'read-file-as-base64'],
    on: ['update:checking-for-update', 'update:available', 'update:not-available', 'update:downloaded', 'update:download-progress', 'update:error']
};

function validateChannel(channel, type) {
    if (!ALLOWED_CHANNELS[type] || !ALLOWED_CHANNELS[type].includes(channel)) {
        throw new Error(`Canal IPC non autorisé: ${channel}`);
    }
}

contextBridge.exposeInMainWorld('electron', {
    send: (channel, data) => {
        validateChannel(channel, 'send');
        ipcRenderer.send(channel, data);
    },

    on: (channel, callback) => {
        validateChannel(channel, 'on');
        if (typeof callback !== 'function') {
            throw new Error('Le callback doit être une fonction');
        }
        ipcRenderer.on(channel, (event, args) => callback(args));
    },

    once: (channel, callback) => {
        validateChannel(channel, 'on');
        if (typeof callback !== 'function') {
            throw new Error('Le callback doit être une fonction');
        }
        ipcRenderer.once(channel, (event, args) => callback(args));
    },

    invoke: (channel, args) => {
        validateChannel(channel, 'invoke');
        return ipcRenderer.invoke(channel, args);
    },

    openExternal: async (url) => {
        if (typeof url !== 'string' || !url.startsWith('http')) {
            throw new Error('URL invalide');
        }
        return ipcRenderer.invoke('open-external', url);
    },

    openPDF: () => {
        ipcRenderer.send('open-pdf');
    },

    // Méthodes pour l'auto-updater
    checkForUpdates: async () => {
        return ipcRenderer.invoke('check-for-updates');
    },

    installUpdate: async () => {
        return ipcRenderer.invoke('install-update');
    },

    getUpdateInfo: async () => {
        return ipcRenderer.invoke('get-update-info');
    },

    onUpdateAvailable: (callback) => {
        if (typeof callback !== 'function') {
            throw new Error('Le callback doit être une fonction');
        }
        ipcRenderer.on('update:available', (event, args) => callback(args));
    },

    onUpdateDownloaded: (callback) => {
        if (typeof callback !== 'function') {
            throw new Error('Le callback doit être une fonction');
        }
        ipcRenderer.on('update:downloaded', (event, args) => callback(args));
    }
});

// Exposer ipcRenderer pour la compatibilité
contextBridge.exposeInMainWorld('ipcRenderer', {
    invoke: (channel, args) => {
        if (!ALLOWED_CHANNELS.invoke.includes(channel)) {
            throw new Error(`Canal IPC non autorisé: ${channel}`);
        }
        return ipcRenderer.invoke(channel, args);
    }
});

// Exposer electronAPI comme alias pour electron (pour la compatibilité)
contextBridge.exposeInMainWorld('electronAPI', {
    openExternal: async (url) => {
        if (typeof url !== 'string' || !url.startsWith('http')) {
            throw new Error('URL invalide');
        }
        return ipcRenderer.invoke('open-external', url);
    },
    openPath: async (path) => {
        return ipcRenderer.invoke('open-path', { path });
    }
});

