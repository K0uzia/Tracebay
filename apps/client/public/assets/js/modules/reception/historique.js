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
      // Debug: vérifier recovered_at
      if (this.lots.length > 0) {
        console.log('🔍 Premier lot recovered_at:', this.lots[0].recovered_at, 'Type:', typeof this.lots[0].recovered_at);
      }
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
    const serverUrl = (window.APP_CONFIG && window.APP_CONFIG.serverUrl) || 'http://localhost:8060';
    fetch(`${serverUrl}/api/lots/${this.currentEditingLotId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lot_name: newName })
    })
      .then(res => {
        if (res.ok) {
          this.showNotification('Nom du lot mis à jour', 'success');
          this.modalManager.close('modal-edit-lot-name');
          this.renderLots();
        } else {
          throw new Error('Erreur mise à jour');
        }
      })
      .catch(err => {
        console.error('Erreur:', err);
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
      const serverUrl = (window.APP_CONFIG && window.APP_CONFIG.serverUrl) || 'http://localhost:8060';
      const response = await fetch(`${serverUrl}/api/lots/${lotId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recovered_at: true })
      });

      if (!response.ok) throw new Error('Erreur mise à jour');

      const data = await response.json();

      // Mettre à jour localement
      lot.recovered_at = data.item.recovered_at;

      this.showNotification('Lot marqué comme récupéré - PDF régénéré', 'success');
      this.renderLots();
    } catch (err) {
      console.error('Erreur:', err);
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
    if (!lot || !lot.items) return;

    // Utiliser la modale d'édition des items (similaire à inventaire)
    const modal = document.getElementById('modal-edit-lot-items');
    if (!modal) {
      this.showNotification('Modale d\'édition non trouvée', 'error');
      return;
    }

    // Remplir la modale avec les items du lot
    this.currentEditingLotId = lotId;
    const itemsContainer = document.getElementById('modal-edit-items-body');
    if (itemsContainer) {
      itemsContainer.innerHTML = lot.items.map((item, idx) => {
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

    const serverUrl = (window.APP_CONFIG && window.APP_CONFIG.serverUrl) || 'http://localhost:8060';
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
    Promise.all(updates.map(update =>
      fetch(`${serverUrl}/api/lots/items/${update.itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          state: update.state,
          technician: update.technician || null
        })
      })
    ))
      .then(() => {
        this.showNotification('Matériel mis à jour', 'success');
        this.modalManager.close('modal-edit-lot-items');
        this.loadLots();
      })
      .catch(err => {
        console.error('Erreur:', err);
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
