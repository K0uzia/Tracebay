/**
 * ChatSecurityManager - Gestion sécurisée des liens dans le chat
 * 
 * Détecte et rend cliquables les liens URL tout en empêchant les attaques XSS.
 * Supporte whitelist/blacklist de domaines et mots-clés interdits.
 */

class ChatSecurityManager {
    constructor(options = {}) {
        // Configuration
        this.strictMode = options.strictMode || false; // true = whitelist only
        this.allowedDomains = options.allowedDomains || [];
        this.blockedDomains = options.blockedDomains || [];
        this.blockedKeywords = options.blockedKeywords || [];
        this.allowedProtocols = options.allowedProtocols || ['http', 'https', 'mailto', 'ftp'];
        
        // Regex pour détecter les URLs
        this.urlRegex = /(https?:\/\/[^\s<>"\)]+|www\.[^\s<>"\)]+\.[a-z]{2,}|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
    }

    /**
     * Ajouter un domaine à la blacklist
     */
    addBlockedDomain(domain) {
        if (!this.blockedDomains.includes(domain)) {
            this.blockedDomains.push(domain);
        }
    }

    /**
     * Ajouter un mot-clé à la blacklist
     */
    addBlockedKeyword(keyword) {
        if (!this.blockedKeywords.includes(keyword.toLowerCase())) {
            this.blockedKeywords.push(keyword.toLowerCase());
        }
    }

    /**
     * Vérifier si un message contient des mots-clés interdits
     */
    containsBlockedKeyword(text) {
        const lowerText = text.toLowerCase();
        return this.blockedKeywords.some(keyword => lowerText.includes(keyword));
    }

    /**
     * Valider une URL
     */
    isValidUrl(urlString) {
        try {
            // Ajouter protocole si manquant
            let url = urlString;
            if (!url.match(/^[a-z][a-z0-9+.-]*:/i)) {
                url = 'https://' + url;
            }

            const urlObj = new URL(url);
            
            // Vérifier le protocole
            const protocol = urlObj.protocol.replace(':', '');
            if (!this.allowedProtocols.includes(protocol)) {
                console.warn(`⚠️ Protocole non autorisé: ${protocol}`);
                return false;
            }

            // Vérifier les domaines
            const hostname = urlObj.hostname.toLowerCase();
            
            if (this.strictMode) {
                // Mode whitelist : seuls les domaines autorisés
                return this.allowedDomains.some(domain => 
                    hostname === domain || hostname.endsWith('.' + domain)
                );
            } else {
                // Mode blacklist : tous sauf ceux bloqués
                const isBlocked = this.blockedDomains.some(domain =>
                    hostname === domain || hostname.endsWith('.' + domain)
                );
                return !isBlocked;
            }
        } catch (error) {
            console.warn(`⚠️ URL invalide: ${urlString}`, error.message);
            return false;
        }
    }

    /**
     * Créer un élément lien sécurisé
     */
    createSafeLink(urlString) {
        // Créer un bouton stylisé comme un lien au lieu d'un <a>
        // Cela évite les problèmes de href et garantit que le click fonctionne
        const button = document.createElement('button');
        
        // Normaliser l'URL
        let url = urlString;
        if (!url.match(/^[a-z][a-z0-9+.-]*:/i)) {
            url = 'https://' + url;
        }
        
        button.type = 'button';
        button.textContent = urlString;
        button.className = 'chat-link';
        
        // Au clic, ouvrir dans le navigateur système
        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Utiliser l'API Electron pour ouvrir dans le navigateur par défaut
            if (window.electron && typeof window.electron.openExternal === 'function') {
                window.electron.openExternal(url);
            } else {
                console.warn('⚠️ window.electron.openExternal non disponible');
            }
            
            return false;
        });
        
        return button;
    }

    /**
     * Traiter un message et rendre les liens cliquables
     * Retourne un DocumentFragment contenant les éléments DOM
     */
    processMessage(text) {
        if (!text) {
            const fragment = document.createDocumentFragment();
            fragment.appendChild(document.createTextNode(text));
            return fragment;
        }

        // Vérifier les mots-clés bloqués
        if (this.containsBlockedKeyword(text)) {
            console.warn(`⚠️ Message contient un mot-clé bloqué`);
            const fragment = document.createDocumentFragment();
            fragment.appendChild(document.createTextNode(text));
            return fragment; // Retourner le texte brut sans liens
        }

        // Créer un fragment pour insérer le contenu
        const fragment = document.createDocumentFragment();
        
        // Diviser le texte par les URLs détectées
        let lastIndex = 0;
        let match;

        while ((match = this.urlRegex.exec(text)) !== null) {
            const url = match[0];
            
            // Ajouter le texte avant l'URL
            if (match.index > lastIndex) {
                const textNode = document.createTextNode(text.substring(lastIndex, match.index));
                fragment.appendChild(textNode);
            }

            // Vérifier si l'URL est valide
            if (this.isValidUrl(url)) {
                const link = this.createSafeLink(url);
                fragment.appendChild(link);
            } else {
                // Si l'URL n'est pas valide, ajouter le texte brut
                const textNode = document.createTextNode(url);
                fragment.appendChild(textNode);
            }

            lastIndex = match.index + url.length;
        }

        // Ajouter le texte restant
        if (lastIndex < text.length) {
            const textNode = document.createTextNode(text.substring(lastIndex));
            fragment.appendChild(textNode);
        }

        // Retourner le fragment contenant les éléments DOM
        return fragment;
    }

    /**
     * Exporter la configuration en JSON
     */
    exportConfig() {
        return {
            strictMode: this.strictMode,
            allowedDomains: this.allowedDomains,
            blockedDomains: this.blockedDomains,
            blockedKeywords: this.blockedKeywords,
            allowedProtocols: this.allowedProtocols
        };
    }

    /**
     * Importer une configuration depuis JSON
     */
    importConfig(config) {
        if (config.strictMode !== undefined) this.strictMode = config.strictMode;
        if (config.allowedDomains) this.allowedDomains = config.allowedDomains;
        if (config.blockedDomains) this.blockedDomains = config.blockedDomains;
        if (config.blockedKeywords) this.blockedKeywords = config.blockedKeywords;
        if (config.allowedProtocols) this.allowedProtocols = config.allowedProtocols;
    }
}

export default ChatSecurityManager;
