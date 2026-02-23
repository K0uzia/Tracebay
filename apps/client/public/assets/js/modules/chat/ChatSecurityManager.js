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
        
        // Détection : http(s)://, www.xxx.tld, emails ; on retire la ponctuation finale du match
        this.urlRegex = /(https?:\/\/[^\s<>"')]+|www\.[a-zA-Z0-9][-a-zA-Z0-9.]*\.[a-z]{2,}(?:\/[^\s<>"')]*)?|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
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

    isImageUrl(urlString) {
        try {
            let url = urlString;
            if (!url.match(/^[a-z][a-z0-9+.-]*:/i)) url = 'https://' + url;
            const u = new URL(url);
            const path = u.pathname.toLowerCase();
            const host = u.hostname.toLowerCase();
            if (/\.(gif|webp|png|jpe?g|bmp|svg)(\?|$)/i.test(path)) return true;
            if (host.includes('giphy.com') || host.includes('tenor.com') || host.includes('media.tenor.com')) return true;
            return false;
        } catch {
            return false;
        }
    }

    createLinkOrImage(urlString) {
        let url = urlString;
        if (!url.match(/^[a-z][a-z0-9+.-]*:/i)) url = 'https://' + url;
        const openUrl = () => {
            if (window.electron && typeof window.electron.openExternal === 'function') {
                window.electron.openExternal(url);
            } else {
                window.open(url, '_blank', 'noopener,noreferrer');
            }
        };
        if (this.isImageUrl(urlString)) {
            const wrap = document.createElement('span');
            wrap.className = 'chat-link chat-image-link';
            const img = document.createElement('img');
            img.src = url;
            img.alt = '';
            img.loading = 'lazy';
            img.className = 'chat-inline-image';
            img.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openUrl(); });
            wrap.appendChild(img);
            return wrap;
        }
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = urlString;
        button.className = 'chat-link';
        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openUrl();
            return false;
        });
        return button;
    }

    /**
     * Traiter un message et rendre les liens cliquables
     * Retourne un DocumentFragment contenant les éléments DOM
     */
    processMessage(text) {
        if (text == null || text === '') {
            const fragment = document.createDocumentFragment();
            fragment.appendChild(document.createTextNode(''));
            return fragment;
        }
        text = String(text);

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
            let url = match[0];
            url = url.replace(/[.,;:!?)]+$/, '');

            if (match.index > lastIndex) {
                const textNode = document.createTextNode(text.substring(lastIndex, match.index));
                fragment.appendChild(textNode);
            }

            if (this.isValidUrl(url)) {
                const el = this.createLinkOrImage(url);
                fragment.appendChild(el);
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
