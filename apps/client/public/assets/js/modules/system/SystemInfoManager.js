/**
 * SystemInfoManager - Gère l'affichage des informations système dans le footer
 */

export default class SystemInfoManager {
    constructor(config = {}) {
        this.ipElementId = config.ipElementId || 'footer-ip-value';
        this.ramElementId = config.ramElementId || 'footer-ram-value';
        this.connectionElementId = config.connectionElementId || 'footer-connection-value';
        this.connectionIconId = config.connectionIconId || 'footer-connection-icon';
        this.serverElementId = config.serverElementId || 'footer-server-value';
        this.serverIconId = config.serverIconId || 'footer-server-icon';
        this.updateInterval = config.updateInterval || 5000; // 5 secondes par défaut
        this.serverUrl = config.serverUrl || window.APP_CONFIG?.serverUrl || 'http://localhost:8060';
        this.serverErrorCount = 0;
        this.healthEndpoint = `${this.serverUrl}/api/health`;
        
        this.intervalId = null;
        this.init();
    }

    /**
     * Initialiser le manager
     */
    init() {
        // Charger les infos locales immédiatement
        this.fetchLocalInfo();
        
        // Charger les infos serveur
        this.fetchSystemInfo();
        
        // Mettre à jour périodiquement
        this.intervalId = setInterval(() => {
            this.fetchLocalInfo();
            this.fetchSystemInfo();
        }, this.updateInterval);

        // Écouteur de clic pour copier l'IP
        this.attachIPClickListener();
    }

    /**
     * Récupérer les informations locales (sans serveur)
     */
    async fetchLocalInfo() {
        try {
            let systemInfo = null;
            if (window.ipcRenderer) {
                try {
                    systemInfo = await window.ipcRenderer.invoke('get-system-info');
                } catch (err) {
                    console.warn('Impossible d\'obtenir les infos système locales:', err);
                }
            }

            // IP locale via IPC Electron
            if (window.ipcRenderer) {
                try {
                    const localIp = await window.ipcRenderer.invoke('get-local-ip');
                    const ipElement = document.getElementById(this.ipElementId);
                    if (ipElement && localIp) {
                        ipElement.textContent = localIp;
                    }
                } catch (err) {
                    console.warn('Impossible d\'obtenir l\'IP locale:', err);
                }
            }
            
            const ramElement = document.getElementById(this.ramElementId);
            if (ramElement) {
                if (systemInfo && systemInfo.memory) {
                    const { usedGb, totalGb, usedPercent } = systemInfo.memory;
                    ramElement.textContent = `${usedGb} Go / ${totalGb} Go (${usedPercent}%)`;
                    ramElement.style.color = usedPercent > 90 ? '#c62828' : (usedPercent > 70 ? '#F28241' : '');
                } else if (performance.memory) {
                    const usedMB = (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(2);
                    const totalMB = (performance.memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2);
                    const usedPercent = ((performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit) * 100).toFixed(0);
                    ramElement.textContent = `${usedMB} MB / ${totalMB} MB (${usedPercent}%)`;
                    ramElement.style.color = usedPercent > 90 ? '#c62828' : (usedPercent > 70 ? '#F28241' : '');
                } else if (navigator.deviceMemory) {
                    ramElement.textContent = `${navigator.deviceMemory} Go`;
                    ramElement.style.color = '';
                } else {
                    ramElement.textContent = 'N/A';
                    ramElement.style.color = '#9ca3af';
                }
            }
            
            // État de la connexion réseau
            const connectionElement = document.getElementById(this.connectionElementId);
            const connectionIcon = document.getElementById(this.connectionIconId);
            
            if (connectionElement && connectionIcon) {
                const isOnline = navigator.onLine;
                const parentItem = connectionElement.closest('.footer-info-item');

                let label = isOnline ? 'En ligne' : 'Hors ligne';
                let color = isOnline ? '#4ade80' : '#ef4444';
                let iconClass = 'fas fa-wifi';
                let title = 'Connexion Internet active';

                if (!isOnline) {
                    iconClass = 'fas fa-wifi-slash';
                    title = 'Pas de connexion Internet';
                } else {
                    // Déterminer le type de connexion
                    let connectionType = null;
                    
                    // Priorité 1: Info système locale (plus fiable)
                    if (systemInfo && systemInfo.network && systemInfo.network.type) {
                        connectionType = systemInfo.network.type;
                    } else {
                        // Priorité 2: API Navigator.connection (si disponible)
                        const navConn = navigator.connection || navigator.webkitConnection || navigator.mozConnection;
                        if (navConn && navConn.type) {
                            connectionType = navConn.type;
                        }
                    }
                    
                    // Appliquer l'icône selon le type
                    switch (connectionType) {
                        case 'wifi':
                            iconClass = 'fas fa-wifi';
                            title = 'Wi-Fi';
                            break;
                        case 'ethernet':
                        case 'wired':
                            iconClass = 'fas fa-ethernet'; 
                            title = 'Ethernet';
                            break;
                        case 'cellular':
                            iconClass = 'fas fa-signal';
                            title = 'Cellulaire';
                            break;
                        case 'bluetooth':
                            iconClass = 'fas fa-bluetooth-b';
                            title = 'Bluetooth';
                            break;
                        default:
                            iconClass = 'fas fa-wifi';
                            title = 'Réseau actif';
                            break;
                    }
                }

                connectionElement.textContent = label;
                connectionElement.style.color = color;
                connectionIcon.className = iconClass;
                if (parentItem) {
                    parentItem.setAttribute('title', title);
                }
            }
        } catch (error) {
            console.error('❌ Erreur récupération infos locales:', error);
        }
    }
    /**
     * Attacher l'écouteur de clic sur l'IP pour la copier
     */
    attachIPClickListener() {
        const ipElement = document.getElementById(this.ipElementId);
        if (ipElement) {
            ipElement.style.cursor = 'pointer';
            ipElement.addEventListener('click', () => {
                this.copyIPToClipboard();
            });
        }
    }
    
    /**
     * Copier l'IP dans le presse-papiers
     */
    async copyIPToClipboard() {
        const ipElement = document.getElementById(this.ipElementId);
        if (!ipElement) return;
        
        const ipText = ipElement.textContent;
        
        // Ne pas copier si c'est une erreur ou N/A
        if (ipText === 'N/A' || ipText === 'Erreur' || ipText === 'Non disponible') {
            return;
        }
        
        try {
            await navigator.clipboard.writeText(ipText);
            
            // Feedback visuel
            const originalText = ipElement.textContent;
            const originalColor = ipElement.style.color;
            ipElement.textContent = '✓ Copié!';
            ipElement.style.color = '#4ade80';
            
            setTimeout(() => {
                ipElement.textContent = originalText;
                ipElement.style.color = originalColor;
            }, 1000);
        } catch (error) {
            console.error('❌ Erreur copie IP:', error);
        }
    }

    /**
     * Récupérer les informations système depuis l'API
     */
    async fetchSystemInfo() {
        try {
            const response = await fetch(this.healthEndpoint);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            const hasData = !!(result && result.data);
            if (hasData) {
                this.updateDisplay(result.data);
            }
            this.updateServerStatus(true);
            this.serverErrorCount = 0;
        } catch (error) {
            // Serveur non disponible - mode offline
            this.serverErrorCount += 1;
            this.showOffline();
            if (this.serverErrorCount === 1 || this.serverErrorCount % 5 === 0) {
                console.warn(`⚠️  Impossible de joindre /api/health (${this.serverErrorCount} tentative${this.serverErrorCount > 1 ? 's' : ''})`);
            }
            // Après plusieurs échecs, arrêter le polling pour éviter le spam
            if (this.serverErrorCount >= 10 && this.intervalId) {
                clearInterval(this.intervalId);
                this.intervalId = null;
                console.warn('⏸️ Arrêt du polling /api/health après 10 échecs');
            }
        }
    }

    /**
     * Mettre à jour l'affichage
     * @param {Object} data - Données système
     */
    updateDisplay(data) {
        // Afficher l'IP serveur si dispo, sinon garder locale
        const ipElement = document.getElementById(this.ipElementId);
        if (ipElement && data.ip) {
            ipElement.textContent = data.ip;
            ipElement.style.color = '';
        }

        // Afficher la RAM remontée par le serveur si plus précise
        const ramElement = document.getElementById(this.ramElementId);
        if (ramElement && data.ram) {
            const used = data.ram.used || data.ram.usedGb || data.ram.usedBytes;
            const total = data.ram.total || data.ram.totalGb || data.ram.totalBytes;
            const usedPercent = parseFloat(data.ram.usedPercent || 0);
            const displayUsed = data.ram.used || data.ram.usedGb || (used ? (used / 1024 / 1024 / 1024).toFixed(2) : null);
            const displayTotal = data.ram.total || data.ram.totalGb || (total ? (total / 1024 / 1024 / 1024).toFixed(2) : null);

            ramElement.textContent = `${displayUsed} Go / ${displayTotal} Go (${usedPercent}%)`;
            
            if (usedPercent > 90) {
                ramElement.style.color = '#c62828';
            } else if (usedPercent > 70) {
                ramElement.style.color = '#F28241';
            } else {
                ramElement.style.color = '';
            }
        }

        // Mettre à jour le statut serveur
        this.updateServerStatus(true);
    }

    /**
     * Afficher l'état offline
     */
    showOffline() {
        this.updateServerStatus(false);
    }

    /**
     * Mettre à jour le statut du serveur
     */
    updateServerStatus(isOnline) {
        const serverElement = document.getElementById(this.serverElementId);
        const serverIcon = document.getElementById(this.serverIconId);
        
        if (serverElement && serverIcon) {
            if (isOnline) {
                serverElement.textContent = 'Serveur en ligne';
                serverElement.style.color = '#4ade80';
                serverIcon.className = 'fas fa-check-circle';
                
                const parentItem = serverElement.closest('.footer-info-item');
                if (parentItem) {
                    parentItem.setAttribute('title', 'Serveur connecté');
                }
            } else {
                serverElement.textContent = 'Serveur hors ligne';
                serverElement.style.color = '#ef4444';
                serverIcon.className = 'fas fa-times-circle';
                
                const parentItem = serverElement.closest('.footer-info-item');
                if (parentItem) {
                    parentItem.setAttribute('title', 'Serveur non disponible - Mode hors ligne');
                }
            }
        }
    }

    /**
     * Afficher un message d'erreur
     */
    showError() {
        this.showOffline();
    }

    /**
     * Détruire le manager et arrêter les mises à jour
     */
    destroy() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }
}
