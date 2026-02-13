/**
 * INVENTAIRE - MODULE JS
 * Affiche les lots en cours et permet d'éditer l'état des PC
 */

import api from '../../config/api.js';
import getLogger from '../../config/Logger.js';
const logger = getLogger();


export default class InventaireManager {
    constructor(modalManager) {
        this.modalManager = modalManager;
        this.currentEditingItemId = null;
        this.lots = [];
        this.init();
    }

    async init() {
        logger.debug('🚀 Initialisation InventaireManager');
        await this.loadLots();
        this.setupEventListeners();
        logger.debug('✅ InventaireManager prêt');
    }

    /**
     * Charger les lots actifs (non terminés)
     */
    async loadLots() {
        try {
            // Séparer l'endpoint des query params
            const serverUrl = api.getServerUrl();
            const endpoint = '/api/lots';
            const url = `${serverUrl}${endpoint}?status=active`;
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('workspace_jwt') || ''}`
                }
            });
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            logger.info('📦 Données lots reçues (brutes):', JSON.stringify(data, null, 2));
            
            // Gérer les deux formats : tableau direct ou avec wrapper
            const rawLots = Array.isArray(data) ? data : (data.items || data.lots || []);
            logger.info('📦 Lots extraits:', JSON.stringify({
                count: rawLots.length,
                firstLot: rawLots.length > 0 ? {
                    id: rawLots[0].id,
                    hasItems: 'items' in rawLots[0],
                    itemsType: typeof rawLots[0].items,
                    itemsIsArray: Array.isArray(rawLots[0].items),
                    itemsCount: Array.isArray(rawLots[0].items) ? rawLots[0].items.length : 'N/A',
                    itemsRaw: rawLots[0].items
                } : null
            }, null, 2));
            
            // S'assurer que this.lots est toujours un tableau
            if (!Array.isArray(rawLots)) {
                logger.warn('Données lots invalides, utilisation tableau vide:', rawLots);
                this.lots = [];
                return;
            }
            
            // Charger les items pour chaque lot (l'API ne les inclut pas dans la liste)
            this.lots = await Promise.all(rawLots.map(async (lot) => {
                try {
                    // Récupérer les détails complets du lot avec ses items
                    const serverUrl = api.getServerUrl();
                    const lotUrl = `${serverUrl}/api/lots/${lot.id}`;
                    const lotResponse = await fetch(lotUrl, {
                        method: 'GET',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${localStorage.getItem('workspace_jwt') || ''}`
                        }
                    });
                    
                    if (lotResponse.ok) {
                        const lotData = await lotResponse.json();
                        const items = Array.isArray(lotData.items) ? lotData.items : (lotData.item?.items || []);
                        logger.info(`📦 Lot ${lot.id} - Items chargés:`, JSON.stringify({ lotId: lot.id, itemsCount: items.length }, null, 2));
                        return {
                            ...lot,
                            ...lotData,
                            items: items
                        };
                    } else {
                        logger.warn(`⚠️ Impossible de charger les items du lot ${lot.id}`);
                        return {
                            ...lot,
                            items: []
                        };
                    }
                } catch (error) {
                    logger.error(`❌ Erreur chargement items lot ${lot.id}:`, error);
                    return {
                        ...lot,
                        items: []
                    };
                }
            }));
            
            logger.info(`📦 ${this.lots.length} lot(s) chargé(s) avec items`, this.lots);
            this.renderLots();
        } catch (error) {
            logger.error('❌ Erreur chargement lots:', error);
            this.lots = []; // S'assurer que this.lots est toujours défini
            this.showNotification('Erreur lors du chargement des lots', 'error');
        }
    }

    /**
     * Afficher les lots
     */
    renderLots() {
        const container = document.getElementById('lots-list');
        if (!container) return;

        // S'assurer que this.lots est défini et est un tableau
        if (!this.lots || !Array.isArray(this.lots)) {
            logger.warn('this.lots invalide dans renderLots:', this.lots);
            this.lots = [];
        }

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
        // S'assurer que lot.items est un tableau
        const items = Array.isArray(lot.items) ? lot.items : [];
        const total = lot.total || items.length || 0;
        const pending = lot.pending || 0;
        const recond = lot.recond || 0;
        const hs = lot.hs || 0;
        const progress = total > 0 ? ((total - pending) / total * 100).toFixed(0) : 0;
        
        logger.info('📦 Création élément lot:', JSON.stringify({
            lotId: lot.id,
            itemsCount: items.length,
            total,
            pending,
            recond,
            hs,
            hasItems: items.length > 0,
            items: items.length > 0 ? items.slice(0, 3) : [],
            lotItemsRaw: lot.items,
            lotItemsType: Array.isArray(lot.items) ? 'array' : typeof lot.items
        }, null, 2));

        return `
            <div class="inventaire-lot-card" data-lot-id="${lot.id}">
                <div class="inventaire-lot-header" style="cursor: pointer;">
                    <div class="inventaire-lot-title">
                        <i class="fa-solid fa-chevron-right expand-icon"></i>
                        <h3>Lot #${lot.id}${lot.lot_name ? ' | ' + lot.lot_name : ''}</h3>
                        <span class="badge-created">Créé le ${this.formatDate(lot.created_at)}</span>
                    </div>
                    <div class="inventaire-lot-stats">
                        <span class="inventaire-stat">
                            <i class="fa-solid fa-hourglass-end"></i>
                            <strong>${pending}</strong> à faire
                        </span>
                        <span class="inventaire-stat">
                            <i class="fa-solid fa-check-circle"></i>
                            <strong>${recond}</strong> reconditionnés
                        </span>
                        <span class="inventaire-stat">
                            <i class="fa-solid fa-exclamation-circle"></i>
                            <strong>${hs}</strong> HS
                        </span>
                        <span class="inventaire-stat">
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
                                    <th style="width: 140px;">Date</th>
                                    <th style="width: 120px;">Technicien</th>
                                    <th style="width: 60px;">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${items.map((item, idx) => `
                                    <tr class="item-row item-${item.state?.replace(/\s+/g, '-')}">
                                        <td>${idx + 1}</td>
                                        <td>${item.serial_number || '-'}</td>
                                        <td>${item.type || '-'}</td>
                                        <td>${item.marque_name || '-'}</td>
                                        <td>${item.modele_name || '-'}</td>
                                        <td>
                                            <span class="state-badge state-${item.state?.replace(/\s+/g, '-')}">
                                                ${item.state || 'Reconditionnés'}
                                            </span>
                                        </td>
                                        <td>${this.formatDateTime(item.state_changed_at) || '-'}</td>
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
        document.querySelectorAll('.inventaire-lot-header').forEach(header => {
            header.addEventListener('click', (e) => {
                if (e.target.closest('.btn-edit-pc')) return;
                
                const card = header.closest('.inventaire-lot-card');
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
        document.getElementById('modal-pc-date-changed').textContent = this.formatDateTime(item.state_changed_at) || '-';
        document.getElementById('modal-pc-state').value = item.state || 'Reconditionnés';
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

            const endpoint = `lots.items.update`.replace(':id', this.currentEditingItemId);
            const response = await api.put(endpoint, {
                state: state,
                technician: technician || null
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();

            this.modalManager.close('modal-edit-pc');

            // Recharger les lots
            await this.loadLots();

            // Afficher une seule notification en fonction du résultat
            if (data.lotFinished) {
                this.showNotification('🎉 Lot terminé ! Passage en Historique...', 'success');
            } else {
                this.showNotification('PC mis à jour', 'success');
            }

        } catch (error) {
            logger.error('❌ Erreur sauvegarde PC:', error);
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
     * Formater une date et heure
     */
    formatDateTime(dateStr) {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        return date.toLocaleDateString('fr-FR', { 
            year: 'numeric', 
            month: 'numeric', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    /**
     * Afficher une notification
     */
    showNotification(message, type = 'info') {
        logger.debug(`[${type.toUpperCase()}] ${message}`);
        
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
        logger.debug('🧹 Destruction InventaireManager');
        this.lots = [];
        this.currentEditingItemId = null;
    }
}
