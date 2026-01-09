/**
 * INVENTAIRE - MODULE JS
 * Affiche les lots en cours et permet d'éditer l'état des PC
 */

export default class InventaireManager {
    constructor(modalManager) {
        this.modalManager = modalManager;
        this.currentEditingItemId = null;
        this.lots = [];
        this.init();
    }

    async init() {
        console.log('🚀 Initialisation InventaireManager');
        await this.loadLots();
        this.setupEventListeners();
        console.log('✅ InventaireManager prêt');
    }

    /**
     * Charger les lots actifs (non terminés)
     */
    async loadLots() {
        try {
            const serverUrl = (window.APP_CONFIG && window.APP_CONFIG.serverUrl) || 'http://localhost:8060';
            const response = await fetch(`${serverUrl}/api/lots?status=active`);
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            this.lots = data.items || [];
            
            console.log(`📦 ${this.lots.length} lot(s) chargé(s)`);
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
        const container = document.getElementById('lots-list');
        if (!container) return;

        if (this.lots.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-inbox"></i>
                    <p>Aucun lot en cours</p>
                    <small>Tous les lots ont été complétés</small>
                </div>
            `;
            return;
        }

        container.innerHTML = this.lots.map(lot => this.createLotElement(lot)).join('');
        this.attachLotEventListeners();
    }

    /**
     * Créer un élément de lot pliable
     */
    createLotElement(lot) {
        const total = lot.total || 0;
        const pending = lot.pending || 0;
        const recond = lot.recond || 0;
        const hs = lot.hs || 0;
        const progress = total > 0 ? ((total - pending) / total * 100).toFixed(0) : 0;

        return `
            <div class="lot-card" data-lot-id="${lot.id}">
                <div class="lot-header" style="cursor: pointer;">
                    <div class="lot-title">
                        <i class="fa-solid fa-chevron-right expand-icon"></i>
                        <h3>Lot #${lot.id}</h3>
                        <span class="badge-created">Créé le ${this.formatDate(lot.created_at)}</span>
                    </div>
                    <div class="lot-stats">
                        <span class="stat">
                            <i class="fa-solid fa-hourglass-end"></i>
                            <strong>${pending}</strong> à faire
                        </span>
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
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${progress}%"></div>
                    </div>
                </div>
                <div class="lot-content" style="display: none;">
                    <div class="items-table-wrapper">
                        <table class="items-table">
                            <thead>
                                <tr>
                                    <th style="width: 50px;">N°</th>
                                    <th style="width: 140px;">S/N</th>
                                    <th style="width: 100px;">Type</th>
                                    <th style="width: 100px;">Marque</th>
                                    <th style="width: 120px;">Modèle</th>
                                    <th style="width: 100px;">État</th>
                                    <th style="width: 120px;">Technicien</th>
                                    <th style="width: 60px;">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${lot.items.map((item, idx) => `
                                    <tr class="item-row item-${item.state?.replace(/\s+/g, '-')}">
                                        <td>${idx + 1}</td>
                                        <td>${item.serial_number || '-'}</td>
                                        <td>${item.type || '-'}</td>
                                        <td>${item.marque_name || '-'}</td>
                                        <td>${item.modele_name || '-'}</td>
                                        <td>
                                            <span class="state-badge state-${item.state?.replace(/\s+/g, '-')}">
                                                ${item.state || 'À faire'}
                                            </span>
                                        </td>
                                        <td>${item.technician || '-'}</td>
                                        <td>
                                            <button type="button" class="btn-edit-pc" data-item-id="${item.id}">
                                                <i class="fa-solid fa-edit"></i>
                                            </button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Attacher les événements aux lots
     */
    attachLotEventListeners() {
        // Toggle lot expansion
        document.querySelectorAll('.lot-header').forEach(header => {
            header.addEventListener('click', (e) => {
                if (e.target.closest('.btn-edit-pc')) return;
                
                const card = header.closest('.lot-card');
                const content = card.querySelector('.lot-content');
                const icon = card.querySelector('.expand-icon');
                
                if (content.style.display === 'none') {
                    content.style.display = 'block';
                    icon.style.transform = 'rotate(90deg)';
                } else {
                    content.style.display = 'none';
                    icon.style.transform = 'rotate(0deg)';
                }
            });
        });

        // Edit PC buttons
        document.querySelectorAll('.btn-edit-pc').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const itemId = btn.dataset.itemId;
                this.editPC(itemId);
            });
        });
    }

    /**
     * Éditer un PC
     */
    editPC(itemId) {
        // Chercher l'item dans les lots
        let item = null;
        for (const lot of this.lots) {
            item = lot.items.find(i => i.id == itemId);
            if (item) break;
        }

        if (!item) {
            this.showNotification('PC non trouvé', 'error');
            return;
        }

        this.currentEditingItemId = itemId;

        // Remplir la modale
        document.getElementById('modal-pc-serial').textContent = item.serial_number || '-';
        document.getElementById('modal-pc-brand').textContent = item.marque_name || '-';
        document.getElementById('modal-pc-model').textContent = item.modele_name || '-';
        document.getElementById('modal-pc-type').textContent = item.type || '-';
        document.getElementById('modal-pc-entry').textContent = item.entry_type || '-';
        document.getElementById('modal-pc-state').value = item.state || 'À faire';
        document.getElementById('modal-pc-technician').value = item.technician || '';

        this.modalManager.open('modal-edit-pc');
    }

    /**
     * Configurer les événements
     */
    setupEventListeners() {
        // Bouton rafraîchir
        const refreshBtn = document.getElementById('btn-refresh-lots');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.loadLots());
        }

        // Filtre état
        const filterState = document.getElementById('filter-state');
        if (filterState) {
            filterState.addEventListener('change', () => this.applyFilters());
        }

        // Sauvegarder l'édition PC
        const savePcBtn = document.getElementById('btn-save-pc-edit');
        if (savePcBtn) {
            savePcBtn.addEventListener('click', () => this.savePCEdit());
        }
    }

    /**
     * Sauvegarder l'édition d'un PC
     */
    async savePCEdit() {
        try {
            const state = document.getElementById('modal-pc-state').value;
            const technician = document.getElementById('modal-pc-technician').value.trim();

            if (!state) {
                this.showNotification('Veuillez sélectionner un état', 'error');
                return;
            }

            const serverUrl = (window.APP_CONFIG && window.APP_CONFIG.serverUrl) || 'http://localhost:8060';
            const response = await fetch(`${serverUrl}/api/lots/items/${this.currentEditingItemId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    state: state,
                    technician: technician || null
                })
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();

            this.showNotification('PC mis à jour', 'success');
            this.modalManager.close('modal-edit-pc');

            // Recharger les lots
            await this.loadLots();

            // Si le lot est terminé, afficher une notification
            if (data.lotFinished) {
                this.showNotification('🎉 Lot terminé ! Passage en Historique...', 'success');
                setTimeout(() => this.loadLots(), 1000);
            }

        } catch (error) {
            console.error('❌ Erreur sauvegarde PC:', error);
            this.showNotification('Erreur lors de la mise à jour', 'error');
        }
    }

    /**
     * Appliquer les filtres
     */
    applyFilters() {
        const filterState = document.getElementById('filter-state').value;
        
        document.querySelectorAll('.item-row').forEach(row => {
            if (filterState === '') {
                row.style.display = '';
            } else {
                const rowState = row.classList.toString();
                if (rowState.includes(`item-${filterState.replace(/\s+/g, '-')}`)) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            }
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
        console.log('🧹 Destruction InventaireManager');
        this.lots = [];
        this.currentEditingItemId = null;
    }
}
