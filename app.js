console.log('lancement de workspace 1.0')

// ============================================
// app.js - Logique de l'application
// ============================================

/**
 * Classe pour gérer les pages
 */
class PageManager {
    constructor() {
        // Configuration
        this.contentContainer = 'content';
        
        // Pages et leur configuration de layout
        this.pagesConfig = {
            // Pages normales (avec header, footer et chat)
            'home': { showHeader: true, showFooter: true, showChat: true },
            'agenda': { showHeader: true, showFooter: true, showChat: false },
            'dossier': { showHeader: true, showFooter: true, showChat: true },
            'application': { showHeader: true, showFooter: true, showChat: true },
            'reception': { showHeader: true, showFooter: true, showChat: false },
            'shortcut': { showHeader: true, showFooter: true, showChat: true },
            'option': { showHeader: true, showFooter: true, showChat: false },
            
            // Pages full-screen (sans header ni footer ni chat)
            'login': { showHeader: false, showFooter: false, showChat: false },
            'signup': { showHeader: false, showFooter: false, showChat: false },
        };
        
        // Initialiser au démarrage
        this.init();
    }

    /**
     * Initialisation
     */
    init() {
        console.log('🚀 Workspace 1.0 démarrée');
        
        // Charger le header et footer
        this.loadHeader();
        this.loadFooter();
        
        // Charger la page par défaut
        this.loadPage('home');
    }

    /**
     * Charger le header
     */
    async loadHeader() {
        try {
            const response = await fetch('./public/components/header.html');
            if (!response.ok) throw new Error('Header not found');
            const html = await response.text();
            document.getElementById('header').innerHTML = html;
            
            // Réattacher les écouteurs après chargement du header
            this.attachListeners();
            console.log('✅ Header chargé et écouteurs attachés');
        } catch (error) {
            console.error('❌ Erreur chargement header:', error);
        }
    }

    /**
     * Charger le footer
     */
    async loadFooter() {
        try {
            const response = await fetch('./public/components/footer.html');
            if (!response.ok) throw new Error('Footer not found');
            const html = await response.text();
            document.getElementById('footer').innerHTML = html;
            console.log('✅ Footer chargé');
        } catch (error) {
            console.error('❌ Erreur chargement footer:', error);
        }
    }

    /**
     * Charger une page HTML
     * @param {string} pageName - Nom de la page (sans .html)
     */
    async loadPage(pageName) {
        try {
            console.log(`📄 Chargement de : ${pageName}`);
            
            // Construire le chemin
            const filePath = `./public/pages/${pageName}.html`;
            
            // Récupérer le fichier
            const response = await fetch(filePath);
            
            // Vérifier si la requête est réussie
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            // Récupérer le texte HTML
            const html = await response.text();
            
            // Insérer le HTML dans la page
            document.getElementById(this.contentContainer).innerHTML = html;
            
            // Mettre à jour l'affichage
            this.updateLayout(pageName);
            
            // Réinitialiser le ChatManager si les éléments chat existent
            this.initializeChatIfNeeded();
            
            // Réinitialiser TimeManager si les éléments time existent
            this.initializeTimeIfNeeded();

            // Initialiser les éléments page-spécifiques
            this.initializePageElements(pageName);
            
            console.log(`✅ Page chargée : ${pageName}`);
        } catch (error) {
            console.error(`❌ Erreur lors du chargement de ${pageName}:`, error);
            this.showError(pageName);
        }
    }

    /**
     * Initialiser le TimeManager si les éléments existent
     */
    initializeTimeIfNeeded() {
        const timeElement = document.getElementById('current-time');
        const dateElement = document.getElementById('current-date');
        
        if (timeElement && dateElement) {
            // Arrêter l'ancien TimeManager s'il existe
            if (window.timeManager) {
                console.log('♻️ Réinitialisation TimeManager');
                window.timeManager.destroy();
            }
            
            // Charger et créer une nouvelle instance
            import('./public/assets/js/modules/TimeManager.js')
                .then(module => {
                    const TimeManager = module.default;
                    window.timeManager = new TimeManager({
                        dateElementId: 'current-date',
                        timeElementId: 'current-time',
                        updateInterval: 1000
                    });
                    console.log('✅ TimeManager réinitialisé');
                })
                .catch(error => {
                    console.error('❌ Erreur import TimeManager:', error);
                });
        } else {
            // Arrêter le TimeManager si on change vers une page sans éléments de temps
            if (window.timeManager) {
                window.timeManager.destroy();
                window.timeManager = null;
            }
        }
    }

    /**
     * Initialiser le ChatManager si les éléments existent
     */
    initializeChatIfNeeded() {
        const chatMessagesContainer = document.getElementById('chat-messages');
        
        if (chatMessagesContainer) {
            // Détruire l'ancien ChatManager s'il existe
            if (window.chatManager) {
                console.log('♻️ Réinitialisation ChatManager');
            }
            
            // Créer une nouvelle instance avec config de sécurité
            Promise.all([
                import('./public/assets/js/modules/ChatManager.js'),
                import('./public/assets/js/config/ChatSecurityConfig.js')
            ]).then(([chatModule, configModule]) => {
                const ChatManager = chatModule.default;
                const securityConfig = configModule.default;
                
                window.chatManager = new ChatManager({
                    messagesContainerId: 'chat-messages',
                    inputId: 'chat-input',
                    sendButtonId: 'chat-send',
                    pseudoInputId: 'chat-pseudo-input',
                    pseudoConfirmId: 'chat-pseudo-confirm',
                    pseudoDisplayId: 'chat-pseudo-display',
                    pseudoErrorId: 'chat-pseudo-error',
                    clearChatBtnId: 'chat-clear-btn',
                    pseudoWrapperId: 'chat-pseudo-input-wrapper',
                    // Passer la configuration de sécurité
                    securityConfig: securityConfig
                });
                console.log('✅ ChatManager réinitialisé');
            }).catch(error => {
                console.error('❌ Erreur import ChatManager:', error);
            });
        }
    }

    /**
     * Initialiser les éléments spécifiques à chaque page
     */
    initializePageElements(pageName) {
        if (pageName === 'home') {
            // Initialiser les boutons PDF
            Promise.all([
                import('./public/assets/js/modules/PDFManager.js'),
                import('./public/assets/js/config/PDFConfig.js')
            ]).then(([pdfModule, configModule]) => {
                const PDFManager = pdfModule.default;
                const pdfConfig = configModule.pdfConfig;
                
                window.pdfManager = new PDFManager();
                window.pdfManager.attachPDFListeners(pdfConfig);
                
                console.log('✅ PDFManager initialisé');
            }).catch(error => {
                console.error('❌ Erreur import PDFManager:', error);
            });
        }
    }

    /**
     * Afficher/masquer header et footer selon la page
     * @param {string} pageName - Nom de la page
     */
    updateLayout(pageName) {
        const header = document.getElementById('header');
        const footer = document.getElementById('footer');
        
        // Récupérer la configuration de la page
        const config = this.pagesConfig[pageName];
        
        if (!config) {
            console.warn(`⚠️ Configuration manquante pour : ${pageName}`);
            return;
        }
        
        // Fermer le menu burger si ouvert
        window.navManager?.closeMenu();
        
        // Appliquer la configuration
        header.style.display = config.showHeader ? 'block' : 'none';
        footer.style.display = config.showFooter ? 'block' : 'none';
        
        // Gérer l'affichage du chat widget
        const chatWidget = document.getElementById('chat-widget-wrapper');
        if (chatWidget) {
            chatWidget.style.display = config.showChat ? 'flex' : 'none';
            
            // Fermer le panel si on cache le widget
            if (!config.showChat && window.chatWidgetManager) {
                window.chatWidgetManager.closePanel();
            }
        }
        
        const layoutType = config.showHeader ? '📱 Normal' : '🔒 Full-screen';
        console.log(`${layoutType} (header: ${config.showHeader}, footer: ${config.showFooter}, chat: ${config.showChat})`);
    }

    /**
     * Afficher message d'erreur
     * @param {string} pageName - Page qui n'a pas pu être chargée
     */
    showError(pageName) {
        const errorHTML = `
            <div style="color: red; padding: 20px;">
                <h2>❌ Erreur de chargement</h2>
                <p>Impossible de charger la page : <strong>${pageName}</strong></p>
                <p>Vérifiez que le fichier existe : <code>public/pages/${pageName}.html</code></p>
            </div>
        `;
        document.getElementById(this.contentContainer).innerHTML = errorHTML;
    }

    /**
     * Attacher les écouteurs d'événements sur les boutons
     */
    attachListeners() {
        // Sélectionner tous les boutons avec data-page
        const buttons = document.querySelectorAll('[data-page]');
        
        console.log(`📌 Trouvé ${buttons.length} boutons de navigation`);
        
        // Pour chaque bouton
        buttons.forEach(button => {
            // Attacher un écouteur de clic
            button.addEventListener('click', (event) => {
                event.preventDefault();
                
                // Récupérer le nom de la page
                const pageName = button.dataset.page;
                
                // Charger la page
                this.loadPage(pageName);
            });
        });
    }
}

// ============================================
// Démarrage de l'application
// ============================================

// Attendre que le DOM soit chargé
document.addEventListener('DOMContentLoaded', () => {
    console.log('📖 DOM chargé');
    
    // Créer l'instance du gestionnaire
    window.pageManager = new PageManager();
});