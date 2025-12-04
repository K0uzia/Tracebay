// ============================================
// preload.js - Bridge sécurisé
// ============================================

const { contextBridge, ipcRenderer } = require('electron');

/**
 * Exposer une API sécurisée au code web
 * 
 * Accès web : window.electron.send('channel', data);
 */
contextBridge.exposeInMainWorld('electron', {
    /**
     * Envoyer un message au processus principal
     * @param {string} channel - Nom du canal
     * @param {any} data - Données à envoyer
     */
    send: (channel, data) => {
        ipcRenderer.send(channel, data);
    },

    /**
     * Écouter les messages du processus principal
     * @param {string} channel - Nom du canal
     * @param {function} callback - Fonction à appeler quand un message arrive
     */
    on: (channel, callback) => {
        ipcRenderer.on(channel, (event, args) => {
            callback(args);
        });
    },

    /**
     * Envoyer un message et attendre une réponse (une seule fois)
     * @param {string} channel - Nom du canal
     * @param {function} callback - Fonction à appeler quand la réponse arrive
     */
    once: (channel, callback) => {
        ipcRenderer.once(channel, (event, args) => {
            callback(args);
        });
    },

    /**
     * Invoquer une fonction dans le processus principal
     * @param {string} channel - Nom du canal
     * @param {any} args - Arguments
     * @returns {Promise} Réponse du processus principal
     */
    invoke: (channel, args) => {
        return ipcRenderer.invoke(channel, args);
    },

    /**
     * Ouvrir une URL dans le navigateur par défaut de la machine
     * @param {string} url - URL à ouvrir
     */
    openExternal: (url) => {
        ipcRenderer.send('open-external', url);
    },

    /**
     * Ouvrir un fichier PDF avec l'application par défaut
     */
    openPDF: () => {
        ipcRenderer.send('open-pdf');
    }
});

console.log('🔒 Preload script chargé');
