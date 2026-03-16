/**
 * INVENTAIRE - MODULE JS
 * Affiche les lots en cours et permet d'éditer l'état des PC
 */

import api from '../../config/api.js';
import getLogger from '../../config/Logger.js';
import { loadLotsWithItems } from './lotsApi.js';
import { getOsIcon, getOsLabel, getOsOption } from './osOptions.js';
const logger = getLogger();


export default class InventaireManager {
    constructor(modalManager) {
        this.modalManager = modalManager;
        this.currentEditingItemId = null;
        this.currentEditingLotId = null;
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
            this.lots = await loadLotsWithItems({ status: 'active' });
            logger.info('📦 Inventaire : ' + this.lots.length + ' lot(s) chargé(s)');
            this.renderLots();
        } catch (error) {
            logger.error('❌ Erreur chargement lots:', error);
            this.lots = [];
            this.renderLotsError(error);
        }
    }

    /**
     * Afficher un bloc d'erreur avec bouton Réessayer
     */
    renderLotsError(error) {
        const container = document.getElementById('lots-list');
        if (!container) return;
        const message = error && error.message ? error.message : 'Erreur inconnue';
        container.innerHTML = `
            <div class="empty-state error-state">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <p>Erreur de chargement</p>
                <small>${String(message).replace(/</g, '&lt;')}</small>
                <button type="button" class="btn-retry-lots" id="btn-retry-lots-inventaire" title="Recharger la liste des lots">
                    <i class="fa-solid fa-sync" aria-hidden="true"></i> Réessayer
                </button>
            </div>
        `;
        const btn = document.getElementById('btn-retry-lots-inventaire');
        if (btn) btn.addEventListener('click', () => this.loadLots());
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
        
        // Calculer pending pour déterminer si le lot est terminé
        const pendingCount = items.filter(item => 
            !item.state || item.state.trim() === '' || 
            !item.technician || item.technician.trim() === ''
        ).length;
        const isLotFinished = items.length > 0 && pendingCount === 0;
        
        // Ne pas afficher les lots terminés avec status received (doivent aller en historique)
        if (isLotFinished && lot.status === 'received') {
            logger.debug('🚫 Lot terminé (status=received), skip affichage');
            return ''; // Retourner chaîne vide pour éviter null dans le join
        }
        
        // Calculer les statistiques à partir des items si elles ne sont pas fournies par le serveur
        const total = lot.total !== undefined ? lot.total : items.length;
        let recond = lot.recond !== undefined ? lot.recond : 0;
        let hs = lot.hs !== undefined ? lot.hs : 0;
        let pending = lot.pending !== undefined ? lot.pending : 0;
        
        // Si les stats ne sont pas fournies, les calculer depuis les items
        if (lot.total === undefined && items.length > 0) {
            recond = items.filter(item => item.state === 'Reconditionnés').length;
            hs = items.filter(item => item.state === 'HS').length;
            // Un item est "pending" s'il n'a pas d'état défini OU pas de technicien
            pending = items.filter(item => 
                !item.state || item.state.trim() === '' || 
                !item.technician || item.technician.trim() === ''
            ).length;
        } else if (items.length > 0) {
            // Recalculer pending depuis les items pour être sûr
            const calculatedPending = items.filter(item => 
                !item.state || item.state.trim() === '' || 
                !item.technician || item.technician.trim() === ''
            ).length;
            // Utiliser le calcul si différent du serveur (pour déboguer)
            if (calculatedPending !== pending) {
                logger.warn(`⚠️ Lot ${lot.id}: pending serveur (${pending}) != calculé (${calculatedPending}), utilisation du calculé`);
                pending = calculatedPending;
            }
        }
        
        const progress = total > 0 ? ((total - pending) / total * 100).toFixed(0) : 0;
        
        // Vérifier si le lot est terminé (tous les items ont un état et un technicien)
        const isFinished = total > 0 && pending === 0 && items.length > 0 && items.every(item => 
            item.state && item.state.trim() !== '' && 
            item.technician && item.technician.trim() !== ''
        );
        
        logger.debug('📦 Création élément lot:', JSON.stringify({
            lotId: lot.id,
            itemsCount: items.length,
            total,
            pending,
            recond,
            hs,
            isFinished,
            finished_at: lot.finished_at,
            status: lot.status,
            hasItems: items.length > 0,
            items: items.length > 0 ? items.map(item => ({ id: item.id, state: item.state, technician: item.technician })) : [],
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
                                    <th class="col-os">OS</th>
                                    <th style="width: 100px;">État</th>
                                    <th style="width: 140px;">Date</th>
                                    <th style="width: 120px;">Technicien</th>
                                    <th style="width: 60px;">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${items.map((item, idx) => `
                                    <tr class="item-row item-${(item.state && item.state.trim() !== '') ? item.state.replace(/\s+/g, '-') : 'non-defini'}">
                                        <td>${idx + 1}</td>
                                        <td>${item.serial_number || '-'}</td>
                                        <td>${item.type || '-'}</td>
                                        <td>${item.marque_name || '-'}</td>
                                        <td>${item.modele_name || '-'}</td>
                                        <td class="col-os"><i class="fa-brands fa-${getOsIcon(item.os)}" title="${getOsLabel(item.os)}"></i></td>
                                        <td>
                                            <span class="state-badge state-${item.state ? item.state.replace(/\s+/g, '-') : 'non-defini'}">
                                                ${item.state || 'Non défini'}
                                            </span>
                                        </td>
                                        <td>${this.formatDateTime(item.state_changed_at) || '-'}</td>
                                        <td>${item.technician || '-'}</td>
                                        <td>
                                            <button type="button" class="btn-edit-pc" data-item-id="${item.id}" title="Éditer l'état et le technicien de ce PC">
                                                <i class="fa-solid fa-edit" aria-hidden="true"></i>
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
        let foundLot = null;
        for (const lot of this.lots) {
            item = lot.items.find(i => i.id == itemId);
            if (item) {
                foundLot = lot;
                break;
            }
        }

        if (!item || !foundLot) {
            this.showNotification('PC non trouvé', 'error');
            return;
        }

        this.currentEditingItemId = itemId;
        this.currentEditingLotId = foundLot.id;

        // Remplir la modale
        document.getElementById('modal-pc-serial').textContent = item.serial_number || '-';
        document.getElementById('modal-pc-brand').textContent = item.marque_name || '-';
        document.getElementById('modal-pc-model').textContent = item.modele_name || '-';
        const osDisplay = getOsLabel(item.os);
        const osSelect = document.getElementById('modal-pc-os-select');
        document.getElementById('modal-pc-os').textContent = osDisplay;
        if (osSelect) osSelect.value = getOsOption(item.os).value;
        document.getElementById('modal-pc-type').textContent = item.type || '-';
        document.getElementById('modal-pc-entry').textContent = item.entry_type || '-';
        document.getElementById('modal-pc-date-changed').textContent = this.formatDateTime(item.state_changed_at) || '-';
        document.getElementById('modal-pc-state').value = item.state || '';
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
            refreshBtn.addEventListener('click', async () => {
                refreshBtn.disabled = true;
                try {
                    await this.loadLots();
                } finally {
                    refreshBtn.disabled = false;
                }
            });
        }

        // Filtre état
        const filterState = document.getElementById('filter-state');
        if (filterState) {
            filterState.addEventListener('change', () => this.applyFilters());
        }

        // Sauvegarder l'édition PC - retirer les anciens listeners pour éviter les doublons
        const savePcBtn = document.getElementById('btn-save-pc-edit');
        if (savePcBtn) {
            // Cloner le bouton pour retirer tous les listeners
            const newSavePcBtn = savePcBtn.cloneNode(true);
            savePcBtn.parentNode.replaceChild(newSavePcBtn, savePcBtn);
            newSavePcBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.savePCEdit();
            });
        }
    }

    /**
     * Sauvegarder l'édition d'un PC
     */
    async savePCEdit() {
        try {
            // Vérifier que l'itemId est défini
            if (!this.currentEditingItemId) {
                this.showNotification('Erreur : ID de l\'item non défini', 'error');
                logger.error('❌ currentEditingItemId est null');
                return;
            }

            const state = document.getElementById('modal-pc-state').value;
            const technician = document.getElementById('modal-pc-technician').value.trim();
            const osValue = (document.getElementById('modal-pc-os-select')?.value || 'linux').trim();

            if (!state || state.trim() === '') {
                this.showNotification('Veuillez sélectionner un état', 'error');
                return;
            }
            
            if (!technician || technician.trim() === '') {
                this.showNotification('Veuillez saisir un technicien', 'error');
                return;
            }

            // Construire l'URL manuellement car api.put ne remplace pas correctement :id
            const serverUrl = api.getServerUrl();
            const endpointPath = '/api/lots/items/:id'.replace(':id', this.currentEditingItemId);
            const fullUrl = `${serverUrl}${endpointPath}`;
            logger.debug('💾 Sauvegarde item:', JSON.stringify({ itemId: this.currentEditingItemId, state, technician, os: osValue, fullUrl }, null, 2));
            
            const response = await fetch(fullUrl, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('workspace_jwt') || ''}`
                },
                body: JSON.stringify({
                    state: state,
                    technician: technician || null,
                    os: osValue || 'linux'
                })
            });

            if (!response.ok) {
                let errorText = '';
                try {
                    errorText = await response.text();
                    // Essayer de parser comme JSON pour un meilleur affichage
                    try {
                        const errorJson = JSON.parse(errorText);
                        logger.error('❌ Erreur sauvegarde item:', JSON.stringify({ 
                            status: response.status, 
                            error: errorJson,
                            itemId: this.currentEditingItemId 
                        }, null, 2));
                        const errorMessage = errorJson.message || errorJson.error || errorText;
                        const fullError = errorJson.detail ? `${errorMessage} (${errorJson.detail})` : errorMessage;
                        logger.error('❌ Erreur SQL complète:', JSON.stringify(errorJson, null, 2));
                        logger.error('❌ Code erreur:', errorJson.code);
                        logger.error('❌ Détail erreur:', errorJson.detail);
                        console.error('❌ Erreur SQL complète (console):', errorJson);
                        this.showNotification(`Erreur serveur: ${fullError.substring(0, 200)}`, 'error');
                    } catch (e) {
                        logger.error('❌ Erreur sauvegarde item (texte):', JSON.stringify({ 
                            status: response.status, 
                            errorText,
                            itemId: this.currentEditingItemId 
                        }, null, 2));
                        this.showNotification(`Erreur serveur: ${errorText.substring(0, 100)}`, 'error');
                    }
                } catch (e) {
                    logger.error('❌ Erreur lors de la lecture de la réponse:', e);
                    this.showNotification(`Erreur ${response.status}: ${response.statusText}`, 'error');
                }
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            logger.debug('✅ Item mis à jour:', JSON.stringify(data, null, 2));

            this.modalManager.close('modal-edit-pc');

            // Déterminer si le lot est maintenant terminé : réponse API ou vérification côté client
            let lotJustFinished = data.lotFinished === true;
            if (!lotJustFinished && this.currentEditingLotId) {
                try {
                    const lotUrl = `${api.getServerUrl()}/api/lots/${this.currentEditingLotId}`;
                    const lotRes = await fetch(lotUrl, {
                        headers: { 'Authorization': `Bearer ${localStorage.getItem('workspace_jwt') || ''}` }
                    });
                    if (lotRes.ok) {
                        const lotJson = await lotRes.json();
                        const items = Array.isArray(lotJson.items) ? lotJson.items : (lotJson.item?.items || []);
                        const allComplete = items.length > 0 && items.every(it => (it.state && it.state.trim() !== '') && (it.technician && it.technician.trim() !== ''));
                        if (allComplete) lotJustFinished = true;
                    }
                } catch (_) { /* ignorer */ }
            }
            // Si le lot vient d'être terminé, demander au backend de le marquer finished (historique, traçabilité, PDF)
            if (lotJustFinished && this.currentEditingLotId) {
                try {
                    const putLotUrl = `${api.getServerUrl()}/api/lots/${this.currentEditingLotId}`;
                    const finishedAt = new Date().toISOString();
                    const putResponse = await fetch(putLotUrl, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${localStorage.getItem('workspace_jwt') || ''}`
                        },
                        body: JSON.stringify({
                            status: 'finished',
                            finished_at: finishedAt
                        })
                    });
                    if (putResponse.ok) {
                        logger.debug('✅ Lot marqué terminé (status=finished, finished_at)', { lotId: this.currentEditingLotId, finished_at: finishedAt });
                        // Générer le PDF et créer le dossier /mnt/team/#TEAM/#TRAÇABILITÉ/AAAA/MM/ (Electron uniquement)
                        this.generateLotPdfOnFinished(this.currentEditingLotId, finishedAt).catch(err => {
                            logger.warn('⚠️ Génération PDF automatique (dossier traçabilité):', err);
                        });
                    } else {
                        logger.warn('⚠️ Le serveur n’a pas mis à jour le lot (status/finished_at). Le lot peut ne pas apparaître dans Historique/Traçabilité.', await putResponse.text());
                    }
                } catch (err) {
                    logger.warn('⚠️ Erreur lors de la finalisation du lot:', err);
                }
            }

            // Recharger la liste des lots (inventaire n'affiche que les lots actifs)
            await this.loadLots();

            // Réappliquer en mémoire les valeurs qu'on vient d'envoyer (notamment os) au cas où le backend ne les renvoie pas dans GET
            const itemId = this.currentEditingItemId;
            for (const lot of this.lots) {
                const it = lot.items && lot.items.find(i => i.id == itemId);
                if (it) {
                    it.state = state;
                    it.technician = technician || null;
                    it.os = osValue || 'linux';
                    break;
                }
            }
            this.renderLots();

            if (lotJustFinished) {
                this.showNotification('🎉 Lot terminé ! Il apparaît dans Historique et Traçabilité.', 'success');
            } else {
                this.showNotification('PC mis à jour', 'success');
            }

        } catch (error) {
            logger.error('❌ Erreur sauvegarde PC:', error);
            this.showNotification('Erreur lors de la mise à jour', 'error');
        }
    }

    /**
     * Générer le PDF du lot et créer le dossier traçabilité (/mnt/team/#TEAM/#TRAÇABILITÉ/AAAA/MM/)
     * puis envoyer le PDF au serveur. Appelé automatiquement quand un lot est marqué terminé.
     */
    async generateLotPdfOnFinished(lotId, finishedAt) {
        if (!lotId || !window.electron?.invoke) return;
        const basePath = '/mnt/team/#TEAM/#TRAÇABILITÉ';
        const dateForFile = (finishedAt && String(finishedAt).slice(0, 10)) || new Date().toISOString().slice(0, 10);
        let lot;
        try {
            const serverUrl = api.getServerUrl();
            const res = await fetch(`${serverUrl}/api/lots/${lotId}`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('workspace_jwt') || ''}` }
            });
            if (!res.ok) return;
            const data = await res.json();
            lot = data.item || data;
            if (lot && !lot.items && data.items) lot.items = data.items;
        } catch (e) {
            logger.warn('Chargement lot pour PDF:', e);
            return;
        }
        if (!lot || !Array.isArray(lot.items)) return;
        const lotName = (lot.lot_name || lot.name) ? String(lot.lot_name || lot.name).trim() : `Lot_${lotId}`;
        const result = await window.electron.invoke('generate-lot-pdf', {
            lotId: String(lotId),
            lotName,
            date: dateForFile,
            items: lot.items,
            created_at: lot.created_at,
            finished_at: lot.finished_at,
            recovered_at: lot.recovered_at,
            basePath
        });
        if (!result?.success || !result.pdf_path) return;
        try {
            const readResult = await window.electron.invoke('read-file-as-base64', { path: result.pdf_path });
            if (!readResult?.success || !readResult.base64) return;
            await fetch(`${api.getServerUrl()}/api/lots/${lotId}/pdf`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('workspace_jwt') || ''}`
                },
                body: JSON.stringify({
                    pdf_base64: readResult.base64,
                    lot_name: lotName,
                    date: dateForFile
                })
            });
        } catch (_) { /* envoi serveur optionnel */ }
        const year = dateForFile.slice(0, 4);
        const monthNum = parseInt(dateForFile.slice(5, 7), 10);
        const moisNoms = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
        const monthName = monthNum >= 1 && monthNum <= 12 ? moisNoms[monthNum - 1] : dateForFile.slice(5, 7);
        this.showNotification(`PDF enregistré dans ${basePath}/${year}/${monthName}/`, 'success');
    }

    /**
     * Appliquer les filtres
     */
    applyFilters() {
        const filterState = document.getElementById('filter-state').value;
        const classSuffix = filterState === 'Non défini' ? 'non-defini' : filterState.replace(/\s+/g, '-');
        document.querySelectorAll('.item-row').forEach(row => {
            if (filterState === '') {
                row.style.display = '';
            } else {
                const rowState = row.classList.toString();
                if (rowState.includes(`item-${classSuffix}`)) {
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
        this.currentEditingLotId = null;
    }
}
