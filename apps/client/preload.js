const { contextBridge, ipcRenderer } = require('electron');

const ALLOWED_CHANNELS = {
    send: ['open-pdf'],
    invoke: ['open-external', 'open-pdf-window', 'get-app-config', 'get-local-ip', 'get-system-info', 'list-folders', 'open-path'],
    on: ['update:available', 'update:not-available', 'update:downloaded', 'update:progress', 'update:error']
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
