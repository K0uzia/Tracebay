/**
 * APP.JS - Application principale du dashboard
 * Gère les pages et l'interaction avec le ServerMonitor
 */

// Instance globale du ServerMonitor
let serverMonitor = null;

// Initialiser le dashboard
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Dashboard démarré');

    // Initialiser le ServerMonitor pour les stats en temps réel
    if (window.ServerMonitor) {
        serverMonitor = new ServerMonitor();
        window.serverMonitor = serverMonitor; // Exposer globalement
        console.log('📊 ServerMonitor initialisé');
        
        // Ajouter un log initial
        serverMonitor.addLog('🚀 Dashboard démarré avec succès');
    }

    // Initialiser la navigation directement avec les listeners
    const navButtons = document.querySelectorAll('.nav-button');
    console.log(`🔍 Trouvé ${navButtons.length} boutons de navigation`);
    
    navButtons.forEach((btn, index) => {
        const pageName = btn.getAttribute('data-page');
        console.log(`📌 Bouton ${index}: data-page="${pageName}"`);
        
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            console.log(`🖱️ CLICK sur bouton: ${pageName}`);
            
            // Masquer toutes les pages
            document.querySelectorAll('.page').forEach(p => {
                p.classList.remove('page-active');
            });
            
            // Afficher la page sélectionnée
            const page = document.getElementById(`page-${pageName}`);
            if (page) {
                page.classList.add('page-active');
                console.log(`✅ Page affichée: page-${pageName}`);
            } else {
                console.error(`❌ Page non trouvée: page-${pageName}`);
            }
            
            // Mettre à jour les boutons actifs
            navButtons.forEach(b => {
                b.classList.remove('nav-button-active');
            });
            btn.classList.add('nav-button-active');
            
            // Ajouter un log
            if (serverMonitor) {
                serverMonitor.addLog(`📄 Navigation vers ${pageName}`);
            }
            
            console.log(`✅ Navigation complète vers ${pageName}`);
        });
    });

    // Activer les onglets si présents
    const tabButtons = document.querySelectorAll('[data-tab]');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const tab = btn.getAttribute('data-tab');
            const container = btn.closest('[data-tabs-container]');
            
            if (container) {
                // Désactiver tous les onglets
                container.querySelectorAll('[data-tab]').forEach(b => {
                    b.classList.remove('active');
                });
                container.querySelectorAll('[data-tab-pane]').forEach(pane => {
                    pane.classList.remove('active');
                });
                
                // Activer l'onglet cliqué
                btn.classList.add('active');
                const pane = container.querySelector(`[data-tab-pane="${tab}"]`);
                if (pane) pane.classList.add('active');
                
                console.log(`🔄 Onglet activé: ${tab}`);
            }
        });
    });
    
    console.log('✅ Application pleinement initialisée');
});
