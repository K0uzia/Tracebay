/**
 * ConfirmDialog - Modal de confirmation réutilisable
 */

class ConfirmDialog {
    constructor() {
        this.callback = null;
    }

    /**
     * Ouvrir le modal de confirmation
     * @param {Object} options
     * @param {string} options.title - Titre de la confirmation
     * @param {string} options.message - Message de confirmation
     * @param {string} options.warning - Message d'avertissement optionnel
     * @param {Function} options.onConfirm - Callback si confirmation
     */
    show(options = {}) {
        const modal = document.getElementById('modal-confirm-delete');
        if (!modal) return;

        const messageEl = document.getElementById('confirm-message');
        const warningEl = document.getElementById('confirm-warning');
        const confirmBtn = document.getElementById('btn-confirm-delete');

        if (messageEl) {
            messageEl.textContent = options.message || 'Êtes-vous sûr ?';
        }

        if (warningEl) {
            if (options.warning) {
                warningEl.textContent = options.warning;
                warningEl.style.display = 'block';
            } else {
                warningEl.style.display = 'none';
            }
        }

        // Remplacer l'ancien callback
        if (confirmBtn) {
            const newConfirmBtn = confirmBtn.cloneNode(true);
            confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

            newConfirmBtn.addEventListener('click', () => {
                modal.close();
                if (options.onConfirm) {
                    options.onConfirm();
                }
            });
        }

        modal.showModal();
    }
}

export default ConfirmDialog;
