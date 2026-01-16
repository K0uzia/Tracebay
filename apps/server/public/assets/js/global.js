/**
 * GLOBAL.JS - Utilitaires globaux du dashboard
 */

// Utilities simples
const Utils = {
  /**
     * Formatter les bytes en taille lisible
     */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  },

  /**
     * Formatter le temps en durée lisible
     */
  formatUptime(seconds) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    if (d > 0) return `${d}j ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  },

  /**
     * Échapper HTML pour éviter XSS
     */
  escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
  },

  /**
     * Formater une date en string lisible
     */
  formatDate(date) {
    const d = new Date(date);
    return d.toLocaleString('fr-FR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  },

  /**
     * Obtenir le temps écoulé en string
     */
  getTimeAgo(date) {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + ' ans';
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + ' mois';
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + ' jours';
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + ' heures';
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + ' minutes';
    return Math.floor(seconds) + ' secondes';
  }
};

// Gestion des pages
const PageManager = {
  currentPage: 'monitoring',

  init() {
    document.querySelectorAll('.nav-button').forEach(btn => {
      btn.addEventListener('click', (e) => {
        // Utiliser currentTarget pour obtenir le bouton, pas l'icône
        const button = e.currentTarget;
        const pageName = button.getAttribute('data-page');
        if (pageName) {
          this.switchPage(pageName);
          console.log(`✅ Page switch: ${pageName}`);
        }
      });
    });
  },

  switchPage(pageName) {
    // Masquer toutes les pages
    document.querySelectorAll('.page').forEach(p => {
      p.classList.remove('page-active');
    });

    // Afficher la page sélectionnée
    const page = document.getElementById(`page-${pageName}`);
    if (page) {
      page.classList.add('page-active');
    }

    // Mettre à jour le bouton actif
    document.querySelectorAll('.nav-button').forEach(btn => {
      btn.classList.remove('nav-button-active');
      if (btn.dataset.page === pageName) {
        btn.classList.add('nav-button-active');
      }
    });

    this.currentPage = pageName;
  }
};
