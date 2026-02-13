/**
 * HISTORIQUE - MODULE JS
 * Affiche les lots terminés
 */

import api from '../../config/api.js';
import getLogger from '../../config/Logger.js';
const logger = getLogger();


export default class HistoriqueManager {
    constructor(modalManager) {
        this.modalManager = modalManager;
        this.lots = [];
        this.init();
    }

    async init() {
        logger.debug('🚀 Initialisation HistoriqueManager');
        await this.loadLots();
        this.setupEventListeners();
        logger.debug('✅ HistoriqueManager prêt');
    }

    /**
     * Charger les lots terminés
     */
    async loadLots() {
        try {
            // Séparer l'endpoint des query params
            const serverUrl = api.getServerUrl();
            const endpoint = '/api/lots';
            const url = `${serverUrl}${endpoint}?status=finished`;
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('workspace_jwt') || ''}`
                }
            });
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            logger.debug('Données lots reçues:', data);
            
            // Gérer les deux formats : tableau direct ou avec wrapper
            const rawLots = Array.isArray(data) ? data : (data.items || data.lots || []);
            
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
                        logger.info(`📦 Lot historique ${lot.id} - Items chargés:`, JSON.stringify({ lotId: lot.id, itemsCount: items.length }, null, 2));
                        return {
                            ...lot,
                            ...lotData,
                            items: items
                        };
                    } else {
                        logger.warn(`⚠️ Impossible de charger les items du lot historique ${lot.id}`);
                        return {
                            ...lot,
                            items: []
                        };
                    }
                } catch (error) {
                    logger.error(`❌ Erreur chargement items lot historique ${lot.id}:`, error);
                    return {
                        ...lot,
                        items: []
                    };
                }
            }));
            
            // Trier par date de fin
            this.lots.sort((a, b) => 
                new Date(b.finished_at || b.created_at) - new Date(a.finished_at || a.created_at)
            );
            
            logger.info('📦 Lots historiques chargés:', JSON.stringify({ count: this.lots.length }, null, 2));
            
            logger.debug(`📦 ${this.lots.length} lot(s) terminé(s) chargé(s)`);
            // Debug: vérifier recovered_at
            if (this.lots.length > 0) {
                logger.debug('🔍 Premier lot recovered_at:', this.lots[0].recovered_at, 'Type:', typeof this.lots[0].recovered_at);
            }
            this.renderLots();
        } catch (error) {
            logger.error('❌ Erreur chargement lots:', error);
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
        
        // Déterminer le statut de récupération
        // Vérifier null, undefined, ou chaîne vide
        const isRecovered = lot.recovered_at != null && lot.recovered_at !== '';
        const recoveryBadgeClass = isRecovered ? 'badge-recovered' : 'badge-to-recover';
        const recoveryBadgeText = isRecovered 
            ? `Récupéré le ${this.formatDateTime(lot.recovered_at)}` 
            : 'À récupérer';
        const recoveryButtonClass = isRecovered ? 'btn-recovered' : 'btn-to-recover';
        const recoveryButtonText = isRecovered ? '✓ Récupéré' : 'Récupérer';

        return `
            <div class="historique-lot-card" data-lot-id="${lot.id}">
                <div class="historique-lot-header">
                    <div class="historique-lot-title">
                        <h3>Lot #${lot.id}${lot.lot_name ? ' | ' + lot.lot_name : ''}</h3>
                        <span class="${recoveryBadgeClass}">${recoveryBadgeText}</span>
                        <span class="badge-created">Terminé le ${this.formatDate(lot.finished_at)}</span>
                    </div>
                    <div class="historique-lot-stats">
                        <span class="historique-stat">
                            <i class="fa-solid fa-check-circle"></i>
                            <strong>${recond}</strong> reconditionnés
                        </span>
                        <span class="historique-stat">
                            <i class="fa-solid fa-exclamation-circle"></i>
                            <strong>${hs}</strong> HS
                        </span>
                        <span class="historique-stat">
                            <strong>${total}</strong> total
                        </span>
                    </div>
                    <div class="historique-lot-actions">
                        <button type="button" class="btn-view-details" data-lot-id="${lot.id}">
                            <i class="fa-solid fa-eye"></i> Voir détails
                        </button>
                        <button type="button" class="btn-edit-lot" data-lot-id="${lot.id}">
                            <i class="fa-solid fa-edit"></i> Éditer lot
                        </button>
                        <button type="button" class="btn-edit-items" data-lot-id="${lot.id}">
                            <i class="fa-solid fa-list-check"></i> Éditer matériel
                        </button>
                        <button type="button" class="${recoveryButtonClass}" data-lot-id="${lot.id}" ${isRecovered ? 'disabled' : ''}>
                            ${recoveryButtonText}
                        </button>
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

        document.querySelectorAll('.btn-edit-lot').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const lotId = btn.dataset.lotId;
                this.editLotName(lotId);
            });
        });

        document.querySelectorAll('.btn-edit-items').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const lotId = btn.dataset.lotId;
                this.editLotItems(lotId);
            });
        });

        document.querySelectorAll('.btn-to-recover').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const lotId = btn.dataset.lotId;
                this.markAsRecovered(lotId);
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
        if (!itemsContainer) {
            logger.error('modal-lot-items non trouvé');
            return;
        }
        
        // S'assurer que lot.items est un tableau
        const items = Array.isArray(lot.items) ? lot.items : [];
        logger.info('Items du lot:', JSON.stringify({ 
            lotId, 
            itemsCount: items.length, 
            lotItemsRaw: lot.items,
            lotItemsType: Array.isArray(lot.items) ? 'array' : typeof lot.items,
            items: items.slice(0, 5)
        }, null, 2));
        
        itemsContainer.innerHTML = items.map((item, idx) => `
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

        // Bouton appliquer les modifications des items
        const applyBtn = document.getElementById('btn-apply-item-edits');
        if (applyBtn) {
            applyBtn.addEventListener('click', () => this.applyItemEdits());
        }

        // Bouton sauvegarder le nom du lot
        const saveLotNameBtn = document.getElementById('btn-save-lot-name');
        if (saveLotNameBtn) {
            saveLotNameBtn.addEventListener('click', () => this.saveLotName());
        }
    }

    /**
     * Éditer le nom du lot
     */
    editLotName(lotId) {
        const lot = this.lots.find(l => l.id == lotId);
        if (!lot) return;

        // Stocker l'ID du lot en cours d'édition
        this.currentEditingLotId = lotId;

        // Remplir le champ d'entrée avec le nom actuel
        const inputLotName = document.getElementById('input-lot-name');
        if (inputLotName) {
            inputLotName.value = lot.lot_name || '';
        }

        // Ouvrir la modale
        this.modalManager.open('modal-edit-lot-name');
    }

    /**
     * Sauvegarder le nom du lot
     */
    saveLotName() {
        const lot = this.lots.find(l => l.id == this.currentEditingLotId);
        if (!lot) return;

        const inputLotName = document.getElementById('input-lot-name');
        const newName = inputLotName.value.trim();

        if (!newName) {
            this.showNotification('Le nom du lot ne peut pas être vide', 'warning');
            return;
        }

        // Mettre à jour localement
        lot.lot_name = newName;

        // Faire un appel API pour sauvegarder
        const serverUrl = api.getServerUrl();
        const endpointPath = '/api/lots/:id'.replace(':id', this.currentEditingLotId);
        const fullUrl = `${serverUrl}${endpointPath}`;
        logger.info('💾 Sauvegarde nom lot:', JSON.stringify({ lotId: this.currentEditingLotId, newName, fullUrl }, null, 2));
        fetch(fullUrl, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('workspace_jwt') || ''}`
            },
            body: JSON.stringify({ lot_name: newName })
        })
        .then(async res => {
            logger.info('📡 Réponse sauvegarde nom:', JSON.stringify({ 
                status: res.status, 
                statusText: res.statusText,
                ok: res.ok 
            }, null, 2));
            
            if (res.ok) {
                const data = await res.json();
                logger.info('✅ Nom du lot mis à jour:', JSON.stringify(data, null, 2));
                this.showNotification('Nom du lot mis à jour', 'success');
                this.modalManager.close('modal-edit-lot-name');
                this.renderLots();
            } else {
                const errorText = await res.text();
                logger.error('❌ Erreur réponse:', JSON.stringify({ 
                    status: res.status, 
                    errorText 
                }, null, 2));
                const errorData = JSON.parse(errorText).catch(() => ({}));
                throw new Error(errorData.message || `Erreur ${res.status}: ${errorText}`);
            }
        })
        .catch(err => {
            logger.error('❌ Erreur sauvegarde nom:', JSON.stringify({ error: err.message, stack: err.stack }, null, 2));
            this.showNotification('Erreur lors de la mise à jour', 'error');
        });
    }

    /**
     * Marquer un lot comme récupéré
     */
    async markAsRecovered(lotId) {
        const lot = this.lots.find(l => l.id == lotId);
        if (!lot) return;

        // Désactiver le bouton immédiatement
        const button = document.querySelector(`.btn-to-recover[data-lot-id="${lotId}"]`);
        if (button) {
            button.disabled = true;
            button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> En cours...';
        }

        try {
            // Faire un appel API pour sauvegarder
            const serverUrl = api.getServerUrl();
            const endpointPath = '/api/lots/:id'.replace(':id', lotId);
            const fullUrl = `${serverUrl}${endpointPath}`;
            logger.info('🔄 Récupération lot:', JSON.stringify({ lotId, fullUrl, endpointPath }, null, 2));
            const response = await fetch(fullUrl, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('workspace_jwt') || ''}`
                },
                body: JSON.stringify({ recovered_at: new Date().toISOString() })
            });
            
            logger.info('📡 Réponse récupération:', JSON.stringify({ 
                status: response.status, 
                statusText: response.statusText,
                ok: response.ok 
            }, null, 2));
            
            if (!response.ok) {
                const errorText = await response.text();
                logger.error('❌ Erreur réponse:', JSON.stringify({ status: response.status, errorText }, null, 2));
                throw new Error(`Erreur ${response.status}: ${errorText}`);
            }
            
            const data = await response.json();
            logger.info('📡 Données récupération reçues:', JSON.stringify(data, null, 2));
            
            // Mettre à jour localement
            lot.recovered_at = data.item?.recovered_at || data.recovered_at || new Date().toISOString();
            logger.info('✅ Lot mis à jour localement:', JSON.stringify({ lotId, recovered_at: lot.recovered_at }, null, 2));
            
            this.showNotification('Lot marqué comme récupéré - PDF régénéré', 'success');
            this.renderLots();
        } catch (err) {
            logger.error('Erreur:', err);
            this.showNotification('Erreur lors de la mise à jour', 'error');
            
            // Réactiver le bouton en cas d'erreur
            if (button) {
                button.disabled = false;
                button.innerHTML = 'Récupérer';
            }
        }
    }

    /**
     * Éditer l'état du matériel et les techniciens
     */
    editLotItems(lotId) {
        const lot = this.lots.find(l => l.id == lotId);
        if (!lot) {
            logger.error('Lot non trouvé:', lotId);
            return;
        }

        // Utiliser la modale d'édition des items (similaire à inventaire)
        const modal = document.getElementById('modal-edit-lot-items');
        if (!modal) {
            this.showNotification('Modale d\'édition non trouvée', 'error');
            return;
        }

        // S'assurer que lot.items est un tableau
        const items = Array.isArray(lot.items) ? lot.items : [];
        logger.info('Items du lot pour édition:', JSON.stringify({ 
            lotId, 
            itemsCount: items.length, 
            lotItemsRaw: lot.items,
            lotItemsType: Array.isArray(lot.items) ? 'array' : typeof lot.items,
            items: items.slice(0, 5)
        }, null, 2));

        // Remplir la modale avec les items du lot
        this.currentEditingLotId = lotId;
        const itemsContainer = document.getElementById('modal-edit-items-body');
        if (itemsContainer) {
            itemsContainer.innerHTML = items.map((item, idx) => {
                const itemState = item.state || 'Reconditionnés';
                return `
                <tr data-item-id="${item.id}">
                    <td><span class="item-number">${idx + 1}</span></td>
                    <td><span class="item-text">${item.serial_number || '-'}</span></td>
                    <td><span class="item-text">${item.type || '-'}</span></td>
                    <td><span class="item-text">${item.marque_name || '-'}</span></td>
                    <td><span class="item-text">${item.modele_name || '-'}</span></td>
                    <td>
                        <select class="item-state-select" data-item-id="${item.id}">
                            <option value="Reconditionnés" ${itemState === 'Reconditionnés' ? 'selected' : ''}>Reconditionnés</option>
                            <option value="Pour pièces" ${itemState === 'Pour pièces' ? 'selected' : ''}>Pour pièces</option>
                            <option value="HS" ${itemState === 'HS' ? 'selected' : ''}>HS</option>
                        </select>
                    </td>
                    <td>
                        <input type="text" class="item-technician-input" data-item-id="${item.id}" value="${item.technician || ''}" placeholder="Technicien">
                    </td>
                </tr>
            `;
            }).join('');
        }

        // Mettre à jour le numéro du lot dans la modale
        document.getElementById('modal-edit-lot-number').textContent = lot.id;

        this.modalManager.open('modal-edit-lot-items');
    }

    /**
     * Apliquer les changements à l'édition des items
     */
    applyItemEdits() {
        const lot = this.lots.find(l => l.id == this.currentEditingLotId);
        if (!lot) return;

        const updates = [];

        // Collecter les mises à jour à partir des selects et inputs
        document.querySelectorAll('#modal-edit-items-body .item-state-select').forEach(stateSelect => {
            const itemId = stateSelect.dataset.itemId;
            const row = stateSelect.closest('tr');
            const technicianInput = row.querySelector('.item-technician-input');

            if (itemId && technicianInput) {
                updates.push({
                    itemId,
                    state: stateSelect.value,
                    technician: technicianInput.value.trim()
                });
            }
        });

        if (updates.length === 0) {
            this.showNotification('Aucun élément à mettre à jour', 'info');
            return;
        }

        // Envoyer les mises à jour
        Promise.all(updates.map(async update => {
            const serverUrl = api.getServerUrl();
            const endpointPath = '/api/lots/items/:id'.replace(':id', update.itemId);
            const fullUrl = `${serverUrl}${endpointPath}`;
            const response = await fetch(fullUrl, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('workspace_jwt') || ''}`
                },
                body: JSON.stringify({
                    state: update.state,
                    technician: update.technician || null
                })
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        }))
        .then(() => {
            this.showNotification('Matériel mis à jour', 'success');
            this.modalManager.close('modal-edit-lot-items');
            this.loadLots();
        })
        .catch(err => {
            logger.error('Erreur:', err);
            this.showNotification('Erreur lors de la mise à jour', 'error');
        });
    }

    /**
     * Apliquer les changements
        const dateFrom = document.getElementById('filter-date-from').value;
        const dateTo = document.getElementById('filter-date-to').value;

        document.querySelectorAll('.historique-lot-card').forEach(card => {
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
        logger.debug('🧹 Destruction HistoriqueManager');
        this.lots = [];
    }
}
