/**
 * TRAÇABILITÉ - MODULE JS
 * Affiche tous les lots avec accès aux PDFs et email
 */

export default class TracabiliteManager {
    constructor(modalManager) {
        this.modalManager = modalManager;
        this.lots = [];
        this.currentEmailLotId = null;
        this.init();
    }

    async init() {
        console.log('🚀 Initialisation TracabiliteManager');
        await this.loadLots();
        this.setupEventListeners();
        console.log('✅ TracabiliteManager prêt');
    }

    /**
     * Charger tous les lots
     */
    async loadLots() {
        try {
            const serverUrl = (window.APP_CONFIG && window.APP_CONFIG.serverUrl) || 'http://localhost:8060';
            const response = await fetch(`${serverUrl}/api/lots?status=all`);
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            this.lots = (data.items || []).sort((a, b) => 
                new Date(b.created_at) - new Date(a.created_at)
            );
            
            console.log(`📦 ${this.lots.length} lot(s) chargé(s)`);
            this.renderTable();
        } catch (error) {
            console.error('❌ Erreur chargement lots:', error);
            this.showNotification('Erreur lors du chargement des lots', 'error');
        }
    }

    /**
     * Afficher le tableau des lots
     */
    renderTable() {
        const tbody = document.getElementById('tracabilite-table-body');
        if (!tbody) return;

        if (this.lots.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 20px;">
                        <i class="fa-solid fa-inbox"></i> Aucun lot
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = this.lots.map(lot => this.createTableRow(lot)).join('');
        this.attachRowEventListeners();
    }

    /**
     * Créer une ligne du tableau
     */
    createTableRow(lot) {
        const total = lot.total || 0;
        const recond = lot.recond || 0;
        const hs = lot.hs || 0;
        const pending = lot.pending || 0;
        const isFinished = pending === 0 && total > 0;

        return `
            <tr class="lot-row lot-${isFinished ? 'finished' : 'active'}" data-lot-id="${lot.id}">
                <td><strong>#${lot.id}</strong></td>
                <td>${this.formatDate(lot.created_at)}</td>
                <td>${lot.finished_at ? this.formatDate(lot.finished_at) : '-'}</td>
                <td>${total}</td>
                <td>${recond}</td>
                <td>${hs}</td>
                <td>
                    ${isFinished ? 
                        '<span class="badge badge-finished"><i class="fa-solid fa-check"></i> Terminé</span>' :
                        '<span class="badge badge-active"><i class="fa-solid fa-clock"></i> En cours</span>'
                    }
                </td>
                <td>
                    <div class="row-actions">
                        ${lot.pdf_path ? `
                            <a href="${(window.APP_CONFIG?.serverUrl || 'http://localhost:8060')}${lot.pdf_path}" target="_blank" title="Télécharger le PDF" class="btn-action btn-download">
                                <i class="fa-solid fa-download"></i> PDF
                            </a>
                        ` : `
                            <button type="button" class="btn-action btn-generate-pdf" data-lot-id="${lot.id}" title="Générer le PDF">
                                <i class="fa-solid fa-file-pdf"></i> Générer
                            </button>
                        `}
                        ${lot.pdf_path ? `
                            <button type="button" class="btn-action btn-send-email" data-lot-id="${lot.id}" title="Envoyer par email">
                                <i class="fa-solid fa-envelope"></i> Email
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    }

    /**
     * Attacher les événements aux lignes
     */
    attachRowEventListeners() {
        // Générer PDF
        document.querySelectorAll('.btn-generate-pdf').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const lotId = btn.dataset.lotId;
                this.generatePDF(lotId);
            });
        });

        // Envoyer email
        document.querySelectorAll('.btn-send-email').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const lotId = btn.dataset.lotId;
                this.openEmailModal(lotId);
            });
        });
    }

    /**
     * Générer le PDF
     */
    async generatePDF(lotId) {
        try {
            this.showNotification('Génération du PDF...', 'info');
            
            const serverUrl = (window.APP_CONFIG && window.APP_CONFIG.serverUrl) || 'http://localhost:8060';
            const response = await fetch(`${serverUrl}/api/lots/${lotId}/pdf`, {
                method: 'POST'
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            this.showNotification('PDF généré avec succès', 'success');
            
            // Recharger les lots
            await this.loadLots();
        } catch (error) {
            console.error('❌ Erreur génération PDF:', error);
            this.showNotification('Erreur lors de la génération du PDF', 'error');
        }
    }

    /**
     * Ouvrir la modale d'email
     */
    openEmailModal(lotId) {
        this.currentEmailLotId = lotId;
        document.getElementById('email-recipient').value = '';
        document.getElementById('email-message').value = '';
        this.modalManager.open('modal-send-email');
    }

    /**
     * Configurer les événements
     */
    setupEventListeners() {
        // Bouton rafraîchir
        const refreshBtn = document.getElementById('btn-refresh-tracabilite');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.loadLots());
        }

        // Filtre statut
        const filterStatus = document.getElementById('filter-tracabilite-status');
        if (filterStatus) {
            filterStatus.addEventListener('change', () => this.applyStatusFilter());
        }

        // Bouton envoyer email
        const sendEmailBtn = document.getElementById('btn-confirm-send-email');
        if (sendEmailBtn) {
            sendEmailBtn.addEventListener('click', () => this.sendEmailPDF());
        }
    }

    /**
     * Appliquer le filtre de statut
     */
    applyStatusFilter() {
        const status = document.getElementById('filter-tracabilite-status').value;
        
        document.querySelectorAll('.lot-row').forEach(row => {
            if (status === '') {
                row.style.display = '';
            } else if (status === 'active' && row.classList.contains('lot-active')) {
                row.style.display = '';
            } else if (status === 'finished' && row.classList.contains('lot-finished')) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
    }

    /**
     * Envoyer le PDF par email
     */
    async sendEmailPDF() {
        try {
            const recipient = document.getElementById('email-recipient').value.trim();
            const message = document.getElementById('email-message').value.trim();

            if (!recipient) {
                this.showNotification('Veuillez entrer une adresse email', 'error');
                return;
            }

            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
                this.showNotification('Adresse email invalide', 'error');
                return;
            }

            this.showNotification('Envoi en cours...', 'info');

            const serverUrl = (window.APP_CONFIG && window.APP_CONFIG.serverUrl) || 'http://localhost:8060';
            const response = await fetch(`${serverUrl}/api/lots/${this.currentEmailLotId}/email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    recipient: recipient,
                    message: message || null
                })
            });

            if (!response.ok) {
                let errorMessage = `HTTP ${response.status}`;
                try {
                    const data = await response.json();
                    errorMessage = data.message || errorMessage;
                } catch (parseError) {
                    // Si on ne peut pas parser la réponse, utiliser l'erreur HTTP
                    console.warn('Impossible de parser la réponse d\'erreur:', parseError);
                }
                throw new Error(errorMessage);
            }

            const result = await response.json();
            this.showNotification('Email envoyé avec succès', 'success');
            this.modalManager.close('modal-send-email');

        } catch (error) {
            console.error('❌ Erreur envoi email:', error);
            this.showNotification(error.message || 'Erreur lors de l\'envoi de l\'email', 'error');
            // Fermer le modal même en cas d'erreur après un délai
            setTimeout(() => {
                this.modalManager.close('modal-send-email');
            }, 3000);
        }
    }

    /**
     * Formater une date
     */
    formatDate(dateStr) {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        return date.toLocaleDateString('fr-FR', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric'
        });
    }

    /**
     * Afficher une notification
     */
    showNotification(message, type = 'info') {
        console.log(`[${type.toUpperCase()}] ${message}`);
        
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        
        let icon = '';
        if (type === 'success') icon = '<i class="fa-solid fa-check-circle"></i>';
        else if (type === 'error') icon = '<i class="fa-solid fa-exclamation-circle"></i>';
        else icon = '<i class="fa-solid fa-info-circle"></i>';
        
        notification.innerHTML = `${icon}<span>${message}</span>`;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('hide');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    destroy() {
        console.log('🧹 Destruction TracabiliteManager');
        this.lots = [];
        this.currentEmailLotId = null;
    }
}
