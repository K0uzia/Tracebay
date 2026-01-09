/**
 * HISTORIQUE - MODULE JS
 * Affiche les lots terminés
 */

export default class HistoriqueManager {
    constructor(modalManager) {
        this.modalManager = modalManager;
        this.lots = [];
        this.init();
    }

    async init() {
        console.log('🚀 Initialisation HistoriqueManager');
        await this.loadLots();
        this.setupEventListeners();
        console.log('✅ HistoriqueManager prêt');
    }

    /**
     * Charger les lots terminés
     */
    async loadLots() {
        try {
            const serverUrl = (window.APP_CONFIG && window.APP_CONFIG.serverUrl) || 'http://localhost:8060';
            const response = await fetch(`${serverUrl}/api/lots?status=finished`);
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            this.lots = (data.items || []).sort((a, b) => 
                new Date(b.finished_at) - new Date(a.finished_at)
            );
            
            console.log(`📦 ${this.lots.length} lot(s) terminé(s) chargé(s)`);
            this.renderLots();
        } catch (error) {
            console.error('❌ Erreur chargement lots:', error);
            this.showNotification('Erreur lors du chargement des lots', 'error');
        }
    }

    /**
     * Afficher les lots
     */
    renderLots() {
        const container = document.getElementById('historique-list');
        if (!container) return;

        if (this.lots.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-inbox"></i>
                    <p>Aucun lot terminé</p>
                    <small>Les lots terminés apparaîtront ici</small>
                </div>
            `;
            return;
        }

        container.innerHTML = this.lots.map(lot => this.createLotElement(lot)).join('');
        this.attachLotEventListeners();
    }

    /**
     * Créer un élément de lot
     */
    createLotElement(lot) {
        const total = lot.total || 0;
        const recond = lot.recond || 0;
        const hs = lot.hs || 0;

        return `
            <div class="lot-card" data-lot-id="${lot.id}">
                <div class="lot-header">
                    <div class="lot-title">
                        <h3>Lot #${lot.id}</h3>
                        <span class="badge-finished">Terminé</span>
                        <span class="badge-created">Terminé le ${this.formatDate(lot.finished_at)}</span>
                    </div>
                    <div class="lot-stats">
                        <span class="stat">
                            <i class="fa-solid fa-check-circle"></i>
                            <strong>${recond}</strong> reconditionnés
                        </span>
                        <span class="stat">
                            <i class="fa-solid fa-exclamation-circle"></i>
                            <strong>${hs}</strong> HS
                        </span>
                        <span class="stat">
                            <strong>${total}</strong> total
                        </span>
                    </div>
                    <div class="lot-actions">
                        <button type="button" class="btn-view-details" data-lot-id="${lot.id}">
                            <i class="fa-solid fa-eye"></i> Voir détails
                        </button>
                        ${lot.pdf_path ? `
                            <a href="${(window.APP_CONFIG?.serverUrl || 'http://localhost:8060')}${lot.pdf_path}" target="_blank" class="btn-download-pdf">
                                <i class="fa-solid fa-file-pdf"></i> PDF
                            </a>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Attacher les événements aux lots
     */
    attachLotEventListeners() {
        document.querySelectorAll('.btn-view-details').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const lotId = btn.dataset.lotId;
                this.viewLotDetails(lotId);
            });
        });
    }

    /**
     * Voir les détails d'un lot
     */
    viewLotDetails(lotId) {
        const lot = this.lots.find(l => l.id == lotId);
        if (!lot) return;

        const total = lot.total || 0;
        const recond = lot.recond || 0;
        const hs = lot.hs || 0;

        // Remplir la modale
        document.getElementById('modal-lot-number').textContent = lot.id;
        document.getElementById('modal-lot-created').textContent = this.formatDateTime(lot.created_at);
        document.getElementById('modal-lot-finished').textContent = this.formatDateTime(lot.finished_at);
        document.getElementById('modal-lot-total').textContent = total;
        document.getElementById('modal-lot-recond').textContent = recond;
        document.getElementById('modal-lot-hs').textContent = hs;

        // Items
        const itemsContainer = document.getElementById('modal-lot-items');
        itemsContainer.innerHTML = lot.items.map((item, idx) => `
            <tr>
                <td>${idx + 1}</td>
                <td>${item.serial_number || '-'}</td>
                <td>${item.type || '-'}</td>
                <td>${item.marque_name || '-'}</td>
                <td>${item.modele_name || '-'}</td>
                <td>
                    <span class="state-badge state-${item.state?.replace(/\s+/g, '-')}">
                        ${item.state || '-'}
                    </span>
                </td>
                <td>${item.technician || '-'}</td>
            </tr>
        `).join('');

        this.modalManager.open('modal-lot-details');
    }

    /**
     * Configurer les événements
     */
    setupEventListeners() {
        // Bouton rafraîchir
        const refreshBtn = document.getElementById('btn-refresh-historique');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.loadLots());
        }

        // Filtres dates
        const dateFrom = document.getElementById('filter-date-from');
        const dateTo = document.getElementById('filter-date-to');
        if (dateFrom && dateTo) {
            dateFrom.addEventListener('change', () => this.applyDateFilters());
            dateTo.addEventListener('change', () => this.applyDateFilters());
        }
    }

    /**
     * Appliquer les filtres de date
     */
    applyDateFilters() {
        const dateFrom = document.getElementById('filter-date-from').value;
        const dateTo = document.getElementById('filter-date-to').value;

        document.querySelectorAll('.lot-card').forEach(card => {
            const lotId = card.dataset.lotId;
            const lot = this.lots.find(l => l.id == lotId);
            
            if (!lot) return;

            const lotDate = new Date(lot.finished_at);
            let visible = true;

            if (dateFrom) {
                const from = new Date(dateFrom);
                visible = visible && lotDate >= from;
            }

            if (dateTo) {
                const to = new Date(dateTo);
                to.setHours(23, 59, 59);
                visible = visible && lotDate <= to;
            }

            card.style.display = visible ? '' : 'none';
        });
    }

    /**
     * Formater une date
     */
    formatDate(dateStr) {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        return date.toLocaleDateString('fr-FR', { year: 'numeric', month: 'short', day: 'numeric' });
    }

    /**
     * Formater une date et heure
     */
    formatDateTime(dateStr) {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        return date.toLocaleString('fr-FR', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
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
        console.log('🧹 Destruction HistoriqueManager');
        this.lots = [];
    }
}
