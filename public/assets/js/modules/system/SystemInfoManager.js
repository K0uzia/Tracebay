/**
 * SystemInfoManager - Gère l'affichage des informations système dans le footer
 */

export default class SystemInfoManager {
    constructor(config = {}) {
        this.ipElementId = config.ipElementId || 'footer-ip-value';
        this.ramElementId = config.ramElementId || 'footer-ram-value';
        this.connectionElementId = config.connectionElementId || 'footer-connection-value';
        this.connectionIconId = config.connectionIconId || 'footer-connection-icon';
        this.updateInterval = config.updateInterval || 5000; // 5 secondes par défaut
        
        this.intervalId = null;
        this.init();
    }

    /**
     * Initialiser le manager
     */
    init() {
        // Charger immédiatement
        this.fetchSystemInfo();
        
        // Mettre à jour périodiquement
        this.intervalId = setInterval(() => {
            this.fetchSystemInfo();
        }, this.updateInterval);
        
        // Ajouter l'écouteur de clic sur l'IP
        this.attachIPClickListener();
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
            const response = await fetch('/api/system');
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (result.success && result.data) {
                this.updateDisplay(result.data);
            } else {
                console.error('❌ Erreur dans la réponse API:', result);
                this.showError();
            }
        } catch (error) {
            console.error('❌ Erreur récupération infos système:', error);
            this.showError();
        }
    }

    /**
     * Mettre à jour l'affichage
     * @param {Object} data - Données système
     */
    updateDisplay(data) {
        // Afficher l'IP
        const ipElement = document.getElementById(this.ipElementId);
        if (ipElement) {
            ipElement.textContent = data.ip || 'N/A';
        }

        // Afficher la RAM
        const ramElement = document.getElementById(this.ramElementId);
        if (ramElement) {
            const ramText = `${data.ram.used} Go / ${data.ram.total} Go (${data.ram.usedPercent}%)`;
            ramElement.textContent = ramText;
            
            // Ajouter une couleur selon l'utilisation
            const usedPercent = parseFloat(data.ram.usedPercent);
            if (usedPercent > 90) {
                ramElement.style.color = '#c62828'; // Rouge
            } else if (usedPercent > 70) {
                ramElement.style.color = '#F28241'; // Orange
            } else {
                ramElement.style.color = ''; // Défaut
            }
        }

        // Afficher l'état de la connexion
        const connectionElement = document.getElementById(this.connectionElementId);
        const connectionIcon = document.getElementById(this.connectionIconId);
        
        if (connectionElement && connectionIcon) {
            const connectionType = data.network.connectionType || 'none';
            const isOnline = data.network.isOnline;
            const hasConnection = data.network.hasConnection;
            
            // Déterminer l'icône selon le type de connexion
            let iconClass = '';
            let titleText = '';
            const typeText = connectionType === 'wifi' ? 'WiFi' : (connectionType === 'ethernet' ? 'Ethernet' : 'Aucune');
            
            if (connectionType === 'wifi') {
                iconClass = isOnline ? 'fas fa-wifi' : (hasConnection ? 'fas fa-wifi' : 'fas fa-wifi-slash');
            } else if (connectionType === 'ethernet') {
                iconClass = 'fas fa-ethernet';
            } else {
                iconClass = 'fas fa-wifi-slash';
            }
            
            // Déterminer la couleur, le texte et le title selon l'état
            if (isOnline) {
                // Vert clair = Internet disponible
                connectionElement.textContent = 'En ligne';
                connectionElement.style.color = '#4ade80';
                titleText = `Connexion ${typeText} active - Internet disponible`;
            } else if (hasConnection) {
                // Orange = Connecté mais pas d'Internet
                connectionElement.textContent = 'Pas d\'Internet';
                connectionElement.style.color = '#F28241';
                titleText = `Connexion ${typeText} active - Pas d'accès Internet`;
            } else {
                // Rouge = Aucune connexion
                connectionElement.textContent = 'Hors ligne';
                connectionElement.style.color = '#c62828';
                titleText = 'Aucune connexion réseau';
            }
            
            connectionIcon.className = iconClass;
            
            // Ajouter le title au conteneur parent
            const parentItem = connectionElement.closest('.footer-info-item');
            if (parentItem) {
                parentItem.setAttribute('title', titleText);
            }
        }
    }

    /**
     * Afficher un message d'erreur
     */
    showError() {
        const ipElement = document.getElementById(this.ipElementId);
        const ramElement = document.getElementById(this.ramElementId);
        const connectionElement = document.getElementById(this.connectionElementId);
        
        if (ipElement) ipElement.textContent = 'Erreur';
        if (ramElement) ramElement.textContent = 'Erreur';
        if (connectionElement) connectionElement.textContent = 'Erreur';
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
