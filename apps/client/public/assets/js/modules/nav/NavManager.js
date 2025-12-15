/**
 * GESTION DU MENU BURGER - RESPONSIVE MOBILE
 * Accessibilité & UX fluide
 */

class NavManager {
    constructor() {
        this.navBurger = document.getElementById('navBurger');
        this.navLinks = document.getElementById('navLinks');
        this.navButtons = document.querySelectorAll('.nav-btn');
        this.breakpoint = 720;
        
        this.init();
    }

    init() {
        if (!this.navBurger || !this.navLinks) {
            console.warn('⚠️ Aucun éléments de navigation trouvé');
            return;
        }

        // Créer des versions bound des fonctions pour pouvoir les supprimer plus tard
        this.handleBurgerClick = this.handleBurgerClick.bind(this);
        this.handleLinkClick = this.handleLinkClick.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleResize = this.handleResize.bind(this);

        // Ouvrir/Fermer le menu burger
        this.navBurger.addEventListener('click', this.handleBurgerClick);

        // Fermer le menu quand on clique sur un lien
        this.navButtons.forEach(button => {
            button.addEventListener('click', this.handleLinkClick);
        });

        // Fermer le menu en appuyant sur Escape
        document.addEventListener('keydown', this.handleKeyDown);

        // Fermer le menu si on redimensionne au-dessus du breakpoint
        window.addEventListener('resize', this.handleResize);
    }

    handleBurgerClick() {
        this.toggleMenu();
    }

    handleLinkClick(e) {
        // Fermer le menu
        this.closeMenu();
        // Ne pas bloquer la propagation pour laisser app.js gérer la navigation
    }

    handleKeyDown(e) {
        if (e.key === 'Escape') {
            this.closeMenu();
        }
    }

    toggleMenu() {
        this.navBurger.classList.toggle('active');
        this.navLinks.classList.toggle('active');
    }

    closeMenu() {
        this.navBurger?.classList.remove('active');
        this.navLinks?.classList.remove('active');
    }

    handleResize() {
        if (window.innerWidth > this.breakpoint) {
            this.closeMenu();
        }
    }
}

export default NavManager;
