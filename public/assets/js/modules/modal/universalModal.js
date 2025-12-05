/**
 * Universal Modal Manager
 * 
 * Gère les modals de manière centralisée et réutilisable
 */

class UniversalModal {
  constructor(modalId) {
    this.modal = document.getElementById(modalId);
    this.modalId = modalId;
    
    if (!this.modal) {
      console.warn(`Modal with id "${modalId}" not found`);
      return;
    }

    this.init();
  }

  /**
   * Initialise les event listeners de la modal
   */
  init() {
    const closeBtn = this.modal.querySelector('.modal-close-btn');
    const cancelBtn = this.modal.querySelector('.modal-cancel-btn');
    const overlay = this.modal.querySelector('.modal-overlay');

    // Fermer avec le bouton X
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    // Fermer avec le bouton Annuler
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.close());
    }

    // Fermer en cliquant en dehors de la modal (sur l'overlay)
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target === this.modal) {
          this.close();
        }
      });
    }

    // Fermer avec Escape
    this.modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.close();
      }
    });
  }

  /**
   * Ouvre la modal
   */
  open() {
    if (!this.modal) return;
    this.modal.showModal?.() || (this.modal.style.display = 'flex');
    this.modal.setAttribute('open', '');
    document.body.style.overflow = 'hidden';
  }

  /**
   * Ferme la modal
   */
  close() {
    if (!this.modal) return;
    this.modal.close?.() || (this.modal.style.display = 'none');
    this.modal.removeAttribute('open');
    document.body.style.overflow = '';
  }

  /**
   * Bascule l'affichage de la modal
   */
  toggle() {
    if (!this.modal) return;
    this.modal.hasAttribute('open') ? this.close() : this.open();
  }

  /**
   * Définit le contenu de la modal
   * @param {string} content - Contenu HTML à afficher
   */
  setContent(content) {
    if (!this.modal) return;
    const body = this.modal.querySelector('.modal-body');
    if (body) {
      body.innerHTML = content;
    }
  }

  /**
   * Définit le titre de la modal
   * @param {string} title - Titre à afficher
   */
  setTitle(title) {
    if (!this.modal) return;
    const titleElement = this.modal.querySelector('.modal-header h2');
    if (titleElement) {
      titleElement.textContent = title;
    }
  }

  /**
   * Récupère le formulaire de la modal s'il existe
   * @returns {HTMLFormElement|null}
   */
  getForm() {
    if (!this.modal) return null;
    return this.modal.querySelector('.modal-body form');
  }

  /**
   * Récupère les données du formulaire de la modal
   * @returns {FormData|null}
   */
  getFormData() {
    const form = this.getForm();
    return form ? new FormData(form) : null;
  }

  /**
   * Définit les données du formulaire
   * @param {Object} data - Objet de données à remplir
   */
  setFormData(data) {
    const form = this.getForm();
    if (!form) return;

    Object.entries(data).forEach(([key, value]) => {
      const field = form.elements[key];
      if (field) {
        field.value = value;
      }
    });
  }

  /**
   * Valide le formulaire
   * @returns {boolean}
   */
  validateForm() {
    const form = this.getForm();
    return form ? form.checkValidity() : true;
  }

  /**
   * Affiche un message d'erreur
   * @param {string} message - Message d'erreur
   */
  showError(message) {
    const body = this.modal.querySelector('.modal-body');
    if (body) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'modal-error-message';
      errorDiv.innerHTML = `<p>${message}</p>`;
      
      // Supprimer les anciens messages d'erreur
      body.querySelectorAll('.modal-error-message').forEach(el => el.remove());
      
      body.insertBefore(errorDiv, body.firstChild);
    }
  }

  /**
   * Affiche un message de succès
   * @param {string} message - Message de succès
   */
  showSuccess(message) {
    const body = this.modal.querySelector('.modal-body');
    if (body) {
      const successDiv = document.createElement('div');
      successDiv.className = 'modal-success-message';
      successDiv.innerHTML = `<p>${message}</p>`;
      
      // Supprimer les anciens messages
      body.querySelectorAll('.modal-success-message').forEach(el => el.remove());
      
      body.insertBefore(successDiv, body.firstChild);
    }
  }

  /**
   * Nettoie les messages et réinitialise la modal
   */
  reset() {
    if (!this.modal) return;
    const body = this.modal.querySelector('.modal-body');
    if (body) {
      body.querySelectorAll('.modal-error-message, .modal-success-message').forEach(el => el.remove());
    }
    
    const form = this.getForm();
    if (form) {
      form.reset();
    }
  }

  /**
   * Met à jour la barre de progression interne de la modal
   * @param {number} percent 0-100
   */
  setProgress(percent) {
    if (!this.modal) return;
    const body = this.modal.querySelector('.modal-body');
    if (!body) return;

    let container = body.querySelector('.modal-progress-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'modal-progress-container';
      container.innerHTML = `
        <div class="modal-progress">
          <div class="modal-progress-bar" style="width: 0%"></div>
        </div>
        <div class="modal-progress-text">0%</div>
      `;
      body.insertBefore(container, body.firstChild);
    }

    const bar = container.querySelector('.modal-progress-bar');
    const text = container.querySelector('.modal-progress-text');
    if (bar) bar.style.width = Math.max(0, Math.min(100, percent)) + '%';
    if (text) text.textContent = Math.round(percent) + '%';
  }

  /**
   * Supprime la barre de progression
   */
  clearProgress() {
    if (!this.modal) return;
    const body = this.modal.querySelector('.modal-body');
    if (!body) return;
    body.querySelectorAll('.modal-progress-container').forEach(el => el.remove());
  }

  /**
   * Active/désactive le bouton de soumission
   * @param {boolean} enabled
   */
  setSubmitEnabled(enabled) {
    if (!this.modal) return;
    const submitBtn = this.modal.querySelector('.modal-submit-btn');
    if (submitBtn) {
      submitBtn.disabled = !enabled;
    }
  }

  /**
   * Modifie le texte du bouton de soumission
   * @param {string} text
   */
  setSubmitText(text) {
    if (!this.modal) return;
    const submitBtn = this.modal.querySelector('.modal-submit-btn');
    if (submitBtn) {
      submitBtn.textContent = text;
    }
  }
}

/**
 * Gestionnaire global des modals
 */
class ModalManager {
  constructor() {
    this.modals = new Map();
  }

  /**
   * Crée ou récupère une instance de modal
   * @param {string} modalId
   * @returns {UniversalModal}
   */
  get(modalId) {
    if (!this.modals.has(modalId)) {
      this.modals.set(modalId, new UniversalModal(modalId));
    }
    return this.modals.get(modalId);
  }

  /**
   * Ouvre une modal
   * @param {string} modalId
   */
  open(modalId) {
    this.get(modalId).open();
  }

  /**
   * Ferme une modal
   * @param {string} modalId
   */
  close(modalId) {
    this.get(modalId).close();
  }

  /**
   * Enregistre un gestionnaire personnalisé pour une modal
   * @param {string} modalId
   * @param {Function} handler - Fonction de gestion
   */
  registerHandler(modalId, handler) {
    const modal = this.get(modalId);
    handler(modal);
  }
}

// Export pour utilisation
export const modalManager = new ModalManager();

/**
 * Fonction d'initialisation - appelée depuis main.js
 */
export function initModals() {
  // Initialiser toutes les modals trouvées
  const modalsFound = document.querySelectorAll('[data-modal-id]');
  
  modalsFound.forEach(modal => {
    const modalId = modal.getAttribute('data-modal-id');
    modalManager.get(modalId);
  });

  // Gérer les data-attributes pour ouvrir/fermer les modals
  // Utiliser closest() pour supporter les clics sur des éléments enfants (icônes, spans...)
  document.addEventListener('click', (e) => {
    // Recherche d'un élément (ou parent) avec data-modal-open
    const openBtn = e.target.closest && e.target.closest('[data-modal-open]');
    if (openBtn) {
      e.preventDefault();
      const modalId = openBtn.getAttribute('data-modal-open');
      modalManager.open(modalId);
      return;
    }

    // Recherche d'un élément (ou parent) avec data-modal-close
    const closeBtn = e.target.closest && e.target.closest('[data-modal-close]');
    if (closeBtn) {
      e.preventDefault();
      const modalId = closeBtn.getAttribute('data-modal-close');
      modalManager.close(modalId);
      return;
    }
  });
}

// Export pour utilisation directe
export { UniversalModal, ModalManager };

// Expose modalManager globally for inline scripts in templates
if (typeof window !== 'undefined') {
  window.modalManager = modalManager;
}
