/**
 * HISTORIQUE - MODULE JS
 * Affiche les lots terminés et les sessions disques shreddés (icône PC vs disque)
 */

import api from '../../config/api.js';
import getLogger from '../../config/Logger.js';
import { loadLotsWithItems } from './lotsApi.js';
import { getSessions, getSession, getSessionPdfUrl, updateSession } from './disquesApi.js';
import { OS_OPTIONS, getOsIcon, getOsLabel, getOsOption } from './osOptions.js';
const logger = getLogger();


const VALUE_AUTRE_DISQUES = '__autre__';

export default class HistoriqueManager {
    constructor(modalManager) {
        this.modalManager = modalManager;
        this.lots = [];
        this.sessionsDisques = [];
        this.marques = [];
        this.modeles = [];
        this.init();
    }

    async init() {
        logger.debug('🚀 Initialisation HistoriqueManager');
        await this.loadData();
        this.setupEventListeners();
        logger.debug('✅ HistoriqueManager prêt');
    }

    /**
     * Charger lots terminés + sessions disques
     */
    async loadData() {
        try {
            const [lots, sessions] = await Promise.all([
                loadLotsWithItems({ status: 'finished' }),
                getSessions().catch(() => [])
            ]);
            this.lots = (lots || []).sort((a, b) =>
                new Date(b.finished_at || b.created_at) - new Date(a.finished_at || a.created_at)
            );
            this.sessionsDisques = (sessions || []).sort((a, b) => {
                const da = a.date || (a.created_at || '').slice(0, 10);
                const db = b.date || (b.created_at || '').slice(0, 10);
                return new Date(db) - new Date(da);
            });
            logger.info('📦 Historique : ' + this.lots.length + ' lot(s), ' + this.sessionsDisques.length + ' session(s) disques');
            this.renderLots();
        } catch (error) {
            logger.error('❌ Erreur chargement historique:', error);
            this.lots = [];
            this.sessionsDisques = [];
            this.renderLotsError(error);
        }
    }

    /**
     * Afficher un bloc d'erreur avec bouton Réessayer
     */
    renderLotsError(error) {
        const container = document.getElementById('historique-list');
        if (!container) return;
        const message = error && error.message ? error.message : 'Erreur inconnue';
        container.innerHTML = `
            <div class="empty-state error-state">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <p>Erreur de chargement</p>
                <small>${String(message).replace(/</g, '&lt;')}</small>
                <button type="button" class="btn-retry-lots" id="btn-retry-lots-historique">
                    <i class="fa-solid fa-sync"></i> Réessayer
                </button>
            </div>
        `;
        const btn = document.getElementById('btn-retry-lots-historique');
        if (btn) btn.addEventListener('click', () => this.loadData());
    }

    /**
     * Afficher les lots + sessions disques (fusionnés, triés par date)
     */
    renderLots() {
        const container = document.getElementById('historique-list');
        if (!container) return;

        const searchText = (document.getElementById('filter-search-historique')?.value || '').trim().toLowerCase();

        const merged = [
            ...this.lots.map(lot => ({ type: 'lot', date: lot.finished_at || lot.created_at, item: lot })),
            ...this.sessionsDisques.map(s => ({ type: 'disque', date: s.date || (s.created_at || '').slice(0, 10), item: s }))
        ].sort((a, b) => new Date(b.date) - new Date(a.date));

        let toRender = merged;
        if (searchText) {
            toRender = merged.filter(({ type, item }) => {
                // Recherche sur le texte affiché dans le titre (h3) de la carte
                if (type === 'lot') {
                    const id = String(item.id || '');
                    const lotName = String(item.lot_name || item.name || '').trim();
                    const titleText = ('Lot #' + id + (lotName ? ' | ' + lotName : '')).toLowerCase();
                    return titleText.includes(searchText);
                }
                if (type === 'disque') {
                    const name = (item.name || '').trim() || 'Lot disques';
                    const titleText = name.toLowerCase();
                    return titleText.includes(searchText);
                }
                return false;
            });
        }

        if (toRender.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-inbox"></i>
                    <p>${merged.length === 0 ? 'Aucun élément' : 'Aucun résultat'}</p>
                    <small>${merged.length === 0 ? 'Lots terminés et sessions disques apparaîtront ici' : 'Modifiez la recherche'}</small>
                </div>
            `;
            return;
        }

        container.innerHTML = toRender.map(({ type, item }) =>
            type === 'lot' ? this.createLotElement(item) : this.createDisqueElement(item)
        ).join('');
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
        
        // Vérifier si le lot peut être récupéré (tous les items doivent avoir un état et un technicien)
        const items = Array.isArray(lot.items) ? lot.items : [];
        const totalItems = lot.total !== undefined ? lot.total : items.length;
        
        // Calculer pending si non fourni
        let pending = lot.pending !== undefined ? lot.pending : 0;
        if (pending === 0 && items.length > 0) {
            // Un item est "pending" s'il n'a pas d'état défini OU pas de technicien
            pending = items.filter(item => 
                !item.state || item.state.trim() === '' || 
                !item.technician || item.technician.trim() === ''
            ).length;
        }
        
        // Le lot peut être récupéré s'il est terminé : soit tous les items ont état + technicien, soit le backend l'a marqué (status + finished_at)
        const isFinishedFromItems = total > 0 && pending === 0 && items.length > 0 && items.every(item => 
            item.state && item.state.trim() !== '' && 
            item.technician && item.technician.trim() !== ''
        );
        const isFinishedFromBackend = lot.status === 'finished' && lot.finished_at != null && lot.finished_at !== '';
        const isFinished = isFinishedFromItems || isFinishedFromBackend;
        const canRecover = (isFinishedFromItems && items.length > 0 && items.every(item => 
            item.state && item.state.trim() !== '' && 
            item.technician && item.technician.trim() !== ''
        )) || isFinishedFromBackend;
        
        logger.debug(`Lot ${lot.id} - canRecover:`, { 
            isFinished, 
            canRecover, 
            total, 
            pending, 
            itemsCount: items.length,
            finished_at: lot.finished_at,
            status: lot.status,
            items: items.map(item => ({ id: item.id, state: item.state, technician: item.technician }))
        });
        const recoveryButtonClass = isRecovered ? 'btn-recovered' : (canRecover ? 'btn-to-recover' : 'btn-to-recover disabled');
        const recoveryButtonText = isRecovered ? '✓ Récupéré' : (canRecover ? 'Récupérer' : 'Récupérer (incomplet)');
        const recoveryButtonDisabled = isRecovered || !canRecover;

        return `
            <div class="historique-lot-card" data-type="lot" data-lot-id="${lot.id}">
                <div class="historique-lot-header">
                    <div class="historique-lot-title">
                        <h3><i class="fa-solid fa-desktop historique-type-icon" aria-hidden="true"></i> Lot #${lot.id}${lot.lot_name ? ' | ' + this.escapeHtml(lot.lot_name) : ''}</h3>
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
                        <button type="button" class="btn-view-details" data-lot-id="${lot.id}" title="Afficher les détails du lot (PC, états, techniciens)">
                            <i class="fa-solid fa-eye" aria-hidden="true"></i> Voir détails
                        </button>
                        <button type="button" class="btn-edit-lot" data-lot-id="${lot.id}" title="Modifier le nom du lot">
                            <i class="fa-solid fa-edit" aria-hidden="true"></i> Éditer lot
                        </button>
                        <button type="button" class="btn-edit-items" data-lot-id="${lot.id}" title="Modifier le matériel (état, technicien par PC)">
                            <i class="fa-solid fa-list-check" aria-hidden="true"></i> Éditer matériel
                        </button>
                        <button type="button" class="${recoveryButtonClass}" data-lot-id="${lot.id}" ${recoveryButtonDisabled ? 'disabled' : ''} title="${!canRecover && !isRecovered ? 'Tous les items doivent avoir un état et un technicien' : 'Marquer le lot comme récupéré'}">
                            ${recoveryButtonText}
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Formater une date en DD/MM/AAAA (sans heure)
     */
    formatDateDDMMYYYY(dateStr) {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '-';
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
    }

    /**
     * Créer un élément de session disques. Nom seul dans le titre, date dans le badge "Créé le". Option « Récupérer » (historique/traçabilité uniquement, pas les PDF).
     */
    createDisqueElement(session) {
        const name = (session.name || '').trim() || 'Lot disques';
        const dateFormatted = this.formatDateDDMMYYYY(session.date || (session.created_at || '').slice(0, 10));
        const count = Array.isArray(session.disks) ? session.disks.length : (session.disk_count ?? 0);
        const isRecovered = session.recovered_at != null && session.recovered_at !== '';
        const recoveryBadgeClass = isRecovered ? 'badge-recovered' : 'badge-to-recover';
        const recoveryBadgeText = isRecovered
            ? `Récupéré le ${this.formatDateTime(session.recovered_at)}`
            : 'À récupérer';
        const recoveryButtonClass = isRecovered ? 'btn-recovered' : 'btn-to-recover btn-to-recover-disque';
        const recoveryButtonText = isRecovered ? '✓ Récupéré' : 'Récupérer';
        return `
            <div class="historique-lot-card historique-disque-card" data-type="disque" data-session-id="${session.id}">
                <div class="historique-lot-header">
                    <div class="historique-lot-title">
                        <h3><i class="fa-solid fa-hard-drive historique-type-icon" aria-hidden="true"></i> ${this.escapeHtml(name)}</h3>
                        <span class="${recoveryBadgeClass}">${recoveryBadgeText}</span>
                        <span class="badge-created">Créé le ${this.escapeHtml(dateFormatted)}</span>
                    </div>
                    <div class="historique-lot-stats">
                        <span class="historique-stat"><i class="fa-solid fa-hard-drive" aria-hidden="true"></i> <strong>${count}</strong> disque(s)</span>
                    </div>
                    <div class="historique-lot-actions">
                        <button type="button" class="btn-view-details btn-view-disque" data-session-id="${session.id}" title="Afficher la liste des disques de cette session">
                            <i class="fa-solid fa-eye" aria-hidden="true"></i> Voir détails
                        </button>
                        <button type="button" class="btn-edit-disque-name" data-session-id="${session.id}" title="Modifier le nom de la session">
                            <i class="fa-solid fa-edit" aria-hidden="true"></i> Éditer le nom
                        </button>
                        <button type="button" class="btn-edit-disque-items" data-session-id="${session.id}" title="Modifier S/N, marque, modèle des disques">
                            <i class="fa-solid fa-list-check" aria-hidden="true"></i> Éditer matériel
                        </button>
                        <button type="button" class="${recoveryButtonClass}" data-session-id="${session.id}" ${isRecovered ? 'disabled' : ''} title="Marquer comme récupéré (traçabilité uniquement, pas les PDF)">
                            ${recoveryButtonText}
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    escapeHtml(s) {
        const div = document.createElement('div');
        div.textContent = s;
        return div.innerHTML;
    }

    escapeAttr(s) {
        return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;');
    }

    /**
     * Attacher les événements aux lots et sessions disques
     */
    attachLotEventListeners() {
        document.querySelectorAll('.btn-view-details[data-lot-id]').forEach(btn => {
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

        document.querySelectorAll('.btn-view-disque').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const sessionId = btn.dataset.sessionId;
                this.viewDisqueSessionDetails(sessionId);
            });
        });

        document.querySelectorAll('.btn-edit-disque-name').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.editDisqueSessionName(btn.dataset.sessionId);
            });
        });

        document.querySelectorAll('.btn-edit-disque-items').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.editDisqueItems(btn.dataset.sessionId);
            });
        });

        document.querySelectorAll('.btn-to-recover-disque').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const sessionId = btn.dataset.sessionId;
                this.markDisqueSessionAsRecovered(sessionId);
            });
        });
    }

    /**
     * Marquer une session disques comme récupérée (historique/traçabilité uniquement, pas les PDF).
     */
    async markDisqueSessionAsRecovered(sessionId) {
        const session = this.sessionsDisques.find(s => String(s.id) === String(sessionId));
        if (!session) return;
        const button = document.querySelector(`.btn-to-recover-disque[data-session-id="${sessionId}"]`);
        if (button) {
            button.disabled = true;
            button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> En cours...';
        }
        try {
            const data = await updateSession(sessionId, { recovered_at: new Date().toISOString() });
            session.recovered_at = data.recovered_at ?? data.session?.recovered_at ?? new Date().toISOString();
            this.showNotification('Lot disques marqué comme récupéré', 'success');
            this.renderLots();
        } catch (err) {
            logger.error('Erreur récupération lot disques:', err);
            this.showNotification(err?.message || 'Erreur lors de la mise à jour', 'error');
            if (button) {
                button.disabled = false;
                button.textContent = 'Récupérer';
            }
        }
    }

    /**
     * Ouvrir la modale d'édition du nom de la session disques
     */
    editDisqueSessionName(sessionId) {
        const session = this.sessionsDisques.find(s => String(s.id) === String(sessionId));
        if (!session) return;
        this.currentEditingSessionId = sessionId;
        const input = document.getElementById('input-disque-session-name');
        if (input) input.value = (session.name || '').trim();
        this.modalManager.open('modal-edit-disque-name');
    }

    /**
     * Sauvegarder le nom de la session disques
     */
    async saveDisqueSessionName() {
        if (!this.currentEditingSessionId) return;
        const input = document.getElementById('input-disque-session-name');
        const newName = input?.value?.trim() ?? '';
        if (!newName) {
            this.showNotification('Le nom ne peut pas être vide', 'warning');
            return;
        }
        try {
            const serverUrl = api.getServerUrl();
            const url = `${serverUrl}/api/disques/sessions/${this.currentEditingSessionId}`;
            const res = await fetch(url, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('workspace_jwt') || ''}` },
                body: JSON.stringify({ name: newName })
            });
            if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
            const session = this.sessionsDisques.find(s => String(s.id) === String(this.currentEditingSessionId));
            if (session) session.name = newName;
            this.currentEditingSessionId = null;
            this.modalManager.close('modal-edit-disque-name');
            this.renderLots();
            this.showNotification('Nom mis à jour', 'success');
        } catch (err) {
            logger.error('saveDisqueSessionName:', err);
            this.showNotification(err?.message || 'Erreur lors de la mise à jour', 'error');
        }
    }

    async loadReferenceDataDisques() {
        try {
            const marquesRes = await api.get('marques.list');
            if (!marquesRes.ok) return;
            const marquesData = await marquesRes.json();
            this.marques = Array.isArray(marquesData) ? marquesData : (marquesData.items || marquesData.marques || []);
            const modelesRes = await api.get('marques.all');
            if (!modelesRes.ok) return;
            const modelesData = await modelesRes.json();
            const marquesAvecModeles = Array.isArray(modelesData) ? modelesData : (modelesData.items || []);
            this.modeles = [];
            marquesAvecModeles.forEach(marque => {
                if (marque.modeles && Array.isArray(marque.modeles)) {
                    marque.modeles.forEach(modele => {
                        this.modeles.push({
                            id: modele.id,
                            name: modele.name,
                            marque_id: marque.id
                        });
                    });
                }
            });
        } catch (err) {
            logger.error('loadReferenceDataDisques:', err);
            this.marques = [];
            this.modeles = [];
        }
    }

    /**
     * Ouvrir la modale d'édition du matériel (disques) d'un lot disques
     */
    async editDisqueItems(sessionId) {
        const session = this.sessionsDisques.find(s => String(s.id) === String(sessionId));
        if (!session) return;
        await this.loadReferenceDataDisques();
        const full = await getSession(sessionId).catch(() => session);
        const disks = Array.isArray(full.disks) ? full.disks : [];
        this.currentEditingSessionId = sessionId;
        document.getElementById('modal-edit-disque-session-title').textContent = (full.name || '').trim() || 'Lot disques';
        const container = document.getElementById('modal-edit-disque-items-list');
        if (!container) return;
        const sizeOpts = ['', '250 Go', '500 Go', '1 To', '2 To', '4 To', '8 To', 'autre'];
        const typeOpts = ['', 'HDD', 'SSD'];
        const ifaceOpts = ['SATA', 'SAS', 'NVMe', 'M.2'];
        container.innerHTML = disks.map((d, i) => {
            const sizeVal = (d.size || '').trim();
            const sizeOpt = sizeOpts.includes(sizeVal) ? sizeVal : (sizeVal ? 'autre' : '');
            const marqueVal = (d.marque || '').trim();
            const modeleVal = (d.modele || '').trim();
            const marqueMatch = this.marques.find(m => (m.name || '').trim() === marqueVal);
            const marqueId = marqueMatch ? marqueMatch.id : null;
            const modelesForMarque = marqueId ? this.modeles.filter(m => m.marque_id == marqueId) : [];
            const modeleMatch = modelesForMarque.find(m => (m.name || '').trim() === modeleVal);
            const marqueSelVal = marqueMatch ? marqueMatch.id : (marqueVal ? VALUE_AUTRE_DISQUES : '');
            const modeleSelVal = modeleMatch ? modeleMatch.id : (modeleVal ? VALUE_AUTRE_DISQUES : '');
            const marqueOpts = '<option value="">-- Marque --</option>' +
                this.marques.map(m => `<option value="${m.id}" ${marqueSelVal === m.id ? 'selected' : ''}>${this.escapeHtml(m.name)}</option>`).join('') +
                `<option value="${VALUE_AUTRE_DISQUES}" ${marqueSelVal === VALUE_AUTRE_DISQUES ? 'selected' : ''}>Autre</option>`;
            const modeleOpts = '<option value="">-- Modèle --</option>' +
                modelesForMarque.map(m => `<option value="${m.id}" ${modeleSelVal === m.id ? 'selected' : ''}>${this.escapeHtml(m.name)}</option>`).join('') +
                `<option value="${VALUE_AUTRE_DISQUES}" ${modeleSelVal === VALUE_AUTRE_DISQUES ? 'selected' : ''}>Autre</option>`;
            const showMarqueAutre = marqueSelVal === VALUE_AUTRE_DISQUES;
            const showModeleAutre = modeleSelVal === VALUE_AUTRE_DISQUES;
            return `<div class="historique-disque-edit-row disques-edit-form" data-disk-index="${i}">
                <span class="historique-disque-edit-num">${i + 1}.</span>
                <div class="form-group"><label>S/N *</label><input type="text" class="disque-edit-serial" value="${this.escapeAttr(d.serial || '')}" placeholder="S/N"></div>
                <div class="form-group"><label>Marque</label><div class="disques-marque-row"><select class="disque-edit-marque">${marqueOpts}</select><input type="text" class="disque-edit-marque-autre" value="${showMarqueAutre ? this.escapeAttr(marqueVal) : ''}" placeholder="Autre marque" style="display:${showMarqueAutre ? 'inline-block' : 'none'};"></div></div>
                <div class="form-group"><label>Modèle</label><div class="disques-modele-row"><select class="disque-edit-modele">${modeleOpts}</select><input type="text" class="disque-edit-modele-autre" value="${showModeleAutre ? this.escapeAttr(modeleVal) : ''}" placeholder="Autre modèle" style="display:${showModeleAutre ? 'inline-block' : 'none'};"></div></div>
                <div class="form-group"><label>Taille</label><div class="disques-size-row"><select class="disque-edit-size-select">${sizeOpts.map(o => `<option value="${o}" ${sizeOpt === o ? 'selected' : ''}>${o || '--'}</option>`).join('')}</select><input type="text" class="disque-edit-size-custom" value="${sizeOpt === 'autre' ? this.escapeAttr(sizeVal) : ''}" placeholder="Ex: 512 Go" style="display:${sizeOpt === 'autre' ? 'inline-block' : 'none'};"></div></div>
                <div class="form-group"><label>Type</label><select class="disque-edit-type">${typeOpts.map(o => `<option value="${o}" ${(d.disk_type || '') === o ? 'selected' : ''}>${o || '--'}</option>`).join('')}</select></div>
                <div class="form-group"><label>Interface</label><select class="disque-edit-interface">${ifaceOpts.map(o => `<option value="${o}" ${(d.interface || '') === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
                <div class="form-group"><label class="disques-checkbox-label"><input type="checkbox" class="disque-edit-destruction-physique" ${(d.shred || '') === 'Destruction physique' ? 'checked' : ''}> Destruction physique</label></div>
            </div>`;
        }).join('');
        container.querySelectorAll('.disque-edit-size-select').forEach(sel => {
            sel.addEventListener('change', () => {
                const row = sel.closest('.historique-disque-edit-row');
                const custom = row?.querySelector('.disque-edit-size-custom');
                if (custom) custom.style.display = sel.value === 'autre' ? 'inline-block' : 'none';
            });
        });
        container.querySelectorAll('.disque-edit-marque').forEach(sel => {
            sel.addEventListener('change', () => {
                const row = sel.closest('.historique-disque-edit-row');
                const marqueAutre = row?.querySelector('.disque-edit-marque-autre');
                const modeleSel = row?.querySelector('.disque-edit-modele');
                const modeleAutre = row?.querySelector('.disque-edit-modele-autre');
                const isAutre = sel.value === VALUE_AUTRE_DISQUES;
                if (marqueAutre) {
                    marqueAutre.style.display = isAutre ? 'inline-block' : 'none';
                    if (!isAutre) marqueAutre.value = '';
                }
                if (modeleSel) {
                    const marqueId = sel.value && sel.value !== VALUE_AUTRE_DISQUES ? sel.value : '';
                    const filtered = marqueId ? this.modeles.filter(m => m.marque_id == marqueId) : [];
                    modeleSel.innerHTML = '<option value="">-- Modèle --</option>' +
                        filtered.map(m => `<option value="${m.id}">${this.escapeHtml(m.name)}</option>`).join('') +
                        `<option value="${VALUE_AUTRE_DISQUES}">Autre</option>`;
                }
                if (modeleAutre) {
                    modeleAutre.style.display = 'none';
                    modeleAutre.value = '';
                }
            });
        });
        container.querySelectorAll('.disque-edit-modele').forEach(sel => {
            sel.addEventListener('change', () => {
                const row = sel.closest('.historique-disque-edit-row');
                const modeleAutre = row?.querySelector('.disque-edit-modele-autre');
                const isAutre = sel.value === VALUE_AUTRE_DISQUES;
                if (modeleAutre) {
                    modeleAutre.style.display = isAutre ? 'inline-block' : 'none';
                    if (!isAutre) modeleAutre.value = '';
                }
            });
        });
        this.modalManager.open('modal-edit-disque-items');
    }

    /**
     * Enregistrer les modifications du matériel (lot disques)
     */
    async applyDisqueItemsEdits() {
        if (!this.currentEditingSessionId) return;
        const container = document.getElementById('modal-edit-disque-items-list');
        if (!container) return;
        const rows = container.querySelectorAll('.historique-disque-edit-row[data-disk-index]');
        const disks = [];
        for (const row of rows) {
            const serial = row.querySelector('.disque-edit-serial')?.value?.trim();
            const sizeSelect = row.querySelector('.disque-edit-size-select');
            const sizeCustom = row.querySelector('.disque-edit-size-custom');
            const size = (sizeSelect?.value === 'autre' && sizeCustom?.value?.trim()) ? sizeCustom.value.trim() : (sizeSelect?.value || '');
            if (!serial) {
                this.showNotification('Chaque disque doit avoir un S/N', 'warning');
                return;
            }
            const t = (row.querySelector('.disque-edit-type')?.value || '').toUpperCase();
            const destructionPhysique = row.querySelector('.disque-edit-destruction-physique')?.checked === true;
            const shred = destructionPhysique ? 'Destruction physique' : (t === 'SSD' ? 'Secure E. + Sanitize' : t === 'HDD' ? 'DoD' : '');
            const marqueSel = row.querySelector('.disque-edit-marque');
            const marqueAutre = row.querySelector('.disque-edit-marque-autre');
            const modeleSel = row.querySelector('.disque-edit-modele');
            const modeleAutre = row.querySelector('.disque-edit-modele-autre');
            let marque = null;
            if (marqueSel?.value === VALUE_AUTRE_DISQUES && marqueAutre?.value?.trim()) marque = marqueAutre.value.trim();
            else if (marqueSel?.value && marqueSel.value !== VALUE_AUTRE_DISQUES) {
                const m = this.marques.find(x => String(x.id) === String(marqueSel.value));
                marque = m ? m.name : null;
            }
            let modele = null;
            if (modeleSel?.value === VALUE_AUTRE_DISQUES && modeleAutre?.value?.trim()) modele = modeleAutre.value.trim();
            else if (modeleSel?.value && modeleSel.value !== VALUE_AUTRE_DISQUES) {
                const m = this.modeles.find(x => String(x.id) === String(modeleSel.value));
                modele = m ? m.name : null;
            }
            disks.push({
                serial,
                marque,
                modele,
                size: size || null,
                disk_type: row.querySelector('.disque-edit-type')?.value || null,
                interface: row.querySelector('.disque-edit-interface')?.value || null,
                shred
            });
        }
        try {
            const serverUrl = api.getServerUrl();
            const url = `${serverUrl}/api/disques/sessions/${this.currentEditingSessionId}`;
            const res = await fetch(url, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('workspace_jwt') || ''}` },
                body: JSON.stringify({ disks })
            });
            if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
            const session = this.sessionsDisques.find(s => String(s.id) === String(this.currentEditingSessionId));
            if (session) session.disks = disks;
            this.currentEditingSessionId = null;
            this.modalManager.close('modal-edit-disque-items');
            this.renderLots();
            this.showNotification('Matériel mis à jour', 'success');
        } catch (err) {
            logger.error('applyDisqueItemsEdits:', err);
            this.showNotification(err?.message || 'Erreur lors de l\'enregistrement', 'error');
        }
    }

    /**
     * Afficher les détails d'une session disques
     */
    async viewDisqueSessionDetails(sessionId) {
        const session = this.sessionsDisques.find(s => String(s.id) === String(sessionId));
        if (!session) return;
        const full = await getSession(sessionId).catch(() => session);
        const name = (full.name || '').trim() || 'Lot disques';
        const dateFormatted = this.formatDateDDMMYYYY(full.date || (full.created_at || '').slice(0, 10));
        const disks = Array.isArray(full.disks) ? full.disks : [];
        document.getElementById('modal-disque-title').textContent = name;
        document.getElementById('modal-disque-total').textContent = disks.length;
        const tbody = document.getElementById('modal-disque-items');
        if (tbody) {
            tbody.innerHTML = disks.map((d, i) => {
                const t = (d.disk_type || '').toUpperCase();
                const shredDisplay = d.shred || (t === 'SSD' ? 'Secure E. + Sanitize' : t === 'HDD' ? 'DoD' : '-');
                return `
                <tr>
                    <td>${i + 1}</td>
                    <td>${this.escapeHtml((d.serial != null ? d.serial : d.serial_number) || '-')}</td>
                    <td>${this.escapeHtml(d.marque || '-')}</td>
                    <td>${this.escapeHtml(d.modele || '-')}</td>
                    <td>${this.escapeHtml(d.size || '-')}</td>
                    <td>${this.escapeHtml(d.disk_type || '-')}</td>
                    <td>${this.escapeHtml(d.interface || '-')}</td>
                    <td>${this.escapeHtml(shredDisplay)}</td>
                </tr>
            `;
            }).join('');
        }
        this.modalManager.open('modal-disque-details');
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
        logger.debug('Items du lot:', JSON.stringify({ 
            lotId, 
            itemsCount: items.length, 
            lotItemsRaw: lot.items,
            lotItemsType: Array.isArray(lot.items) ? 'array' : typeof lot.items,
            items: items.slice(0, 5)
        }, null, 2));
        
        const formatItemDateTime = (it) => {
            if (it.created_at) return this.formatDateTime(it.created_at);
            if (it.state_changed_at) return this.formatDateTime(it.state_changed_at);
            if (it.date && it.time) return `${it.date} ${it.time}`;
            return '-';
        };
        itemsContainer.innerHTML = items.map((item, idx) => `
            <tr>
                <td>${idx + 1}</td>
                <td>${item.serial_number || '-'}</td>
                <td>${item.type || '-'}</td>
                <td>${item.marque_name || '-'}</td>
                <td>${item.modele_name || '-'}</td>
                <td class="col-os"><i class="fa-brands fa-${getOsIcon(item.os)}" title="${getOsLabel(item.os)}"></i></td>
                <td>
                    <span class="state-badge state-${item.state?.replace(/\s+/g, '-')}">
                        ${item.state || '-'}
                    </span>
                </td>
                <td>${item.technician || '-'}</td>
                <td>${formatItemDateTime(item)}</td>
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
            refreshBtn.addEventListener('click', async () => {
                refreshBtn.disabled = true;
                try {
                    await this.loadData();
                } finally {
                    refreshBtn.disabled = false;
                }
            });
        }

        // Recherche
        const searchInput = document.getElementById('filter-search-historique');
        if (searchInput) {
            searchInput.addEventListener('input', () => this.renderLots());
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

        // Bouton sauvegarder le nom de la session disques
        const saveDisqueNameBtn = document.getElementById('btn-save-disque-name');
        if (saveDisqueNameBtn) {
            saveDisqueNameBtn.addEventListener('click', () => this.saveDisqueSessionName());
        }

        // Bouton appliquer les modifications du matériel (lot disques)
        const applyDisqueItemsBtn = document.getElementById('btn-apply-disque-items-edits');
        if (applyDisqueItemsBtn) {
            applyDisqueItemsBtn.addEventListener('click', () => this.applyDisqueItemsEdits());
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
        logger.debug('💾 Sauvegarde nom lot:', JSON.stringify({ lotId: this.currentEditingLotId, newName, fullUrl }, null, 2));
        fetch(fullUrl, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('workspace_jwt') || ''}`
            },
            body: JSON.stringify({ lot_name: newName })
        })
        .then(async res => {
            logger.debug('📡 Réponse sauvegarde nom:', JSON.stringify({ 
                status: res.status, 
                statusText: res.statusText,
                ok: res.ok 
            }, null, 2));
            
            if (res.ok) {
                const data = await res.json();
                logger.debug('✅ Nom du lot mis à jour:', JSON.stringify(data, null, 2));
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
            logger.debug('🔄 Récupération lot:', JSON.stringify({ lotId, fullUrl, endpointPath }, null, 2));
            const response = await fetch(fullUrl, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('workspace_jwt') || ''}`
                },
                body: JSON.stringify({ recovered_at: new Date().toISOString() })
            });
            
            logger.debug('📡 Réponse récupération:', JSON.stringify({ 
                status: response.status, 
                statusText: response.statusText,
                ok: response.ok 
            }, null, 2));
            
            if (!response.ok) {
                const errorText = await response.text();
                logger.error('❌ Erreur réponse récupération:', JSON.stringify({ 
                    status: response.status, 
                    errorText,
                    lotId 
                }, null, 2));
                throw new Error(`Erreur ${response.status}: ${errorText}`);
            }
            
            const data = await response.json();
            logger.debug('📡 Données récupération reçues:', JSON.stringify(data, null, 2));
            
            // Mettre à jour localement
            lot.recovered_at = data.item?.recovered_at || data.recovered_at || new Date().toISOString();
            logger.debug('✅ Lot mis à jour localement:', JSON.stringify({ lotId, recovered_at: lot.recovered_at }, null, 2));
            
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
        logger.debug('Items du lot pour édition:', JSON.stringify({ 
            lotId, 
            itemsCount: items.length, 
            lotItemsRaw: lot.items,
            lotItemsType: Array.isArray(lot.items) ? 'array' : typeof lot.items,
            items: items.slice(0, 5)
        }, null, 2));

        const formatItemDateTime = (it) => {
            if (it.created_at) return this.formatDateTime(it.created_at);
            if (it.state_changed_at) return this.formatDateTime(it.state_changed_at);
            if (it.date && it.time) return `${it.date} ${it.time}`;
            return '-';
        };
        this.currentEditingLotId = lotId;
        const itemsContainer = document.getElementById('modal-edit-items-body');
        if (itemsContainer) {
            itemsContainer.innerHTML = items.map((item, idx) => {
                const itemState = item.state || '';
                return `
                <tr data-item-id="${item.id}">
                    <td><span class="item-number">${idx + 1}</span></td>
                    <td><span class="item-text">${item.serial_number || '-'}</span></td>
                    <td><span class="item-text">${item.type || '-'}</span></td>
                    <td><span class="item-text">${item.marque_name || '-'}</span></td>
                    <td><span class="item-text">${item.modele_name || '-'}</span></td>
                    <td class="col-os">
                        <select class="item-os-select" data-item-id="${item.id}">
                            ${OS_OPTIONS.map(o => `<option value="${o.value}" ${getOsOption(item.os).value === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
                        </select>
                    </td>
                    <td>
                        <select class="item-state-select" data-item-id="${item.id}">
                            <option value="">-- Sélectionner --</option>
                            <option value="Reconditionnés" ${itemState === 'Reconditionnés' ? 'selected' : ''}>Reconditionnés</option>
                            <option value="Pour pièces" ${itemState === 'Pour pièces' ? 'selected' : ''}>Pour pièces</option>
                            <option value="HS" ${itemState === 'HS' ? 'selected' : ''}>HS</option>
                        </select>
                    </td>
                    <td>
                        <input type="text" class="item-technician-input" data-item-id="${item.id}" value="${item.technician || ''}" placeholder="Technicien">
                    </td>
                    <td><span class="item-text">${formatItemDateTime(item)}</span></td>
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
            const osSelect = row.querySelector('.item-os-select');

            if (itemId && technicianInput) {
                const state = stateSelect.value.trim();
                const technician = technicianInput.value.trim();
                const os = osSelect ? (osSelect.value || 'linux') : 'linux';
                
                // Valider que l'état est défini
                if (!state || state === '') {
                    this.showNotification('Veuillez sélectionner un état pour tous les items', 'warning');
                    return;
                }
                
                updates.push({
                    itemId,
                    state: state,
                    technician: technician || null,
                    os: os || 'linux'
                });
            }
        });

        if (updates.length === 0) {
            this.showNotification('Aucun élément à mettre à jour', 'info');
            return;
        }

        // Valider que tous les items ont un état et un technicien
        const invalidUpdates = updates.filter(u => !u.state || u.state.trim() === '' || !u.technician || u.technician.trim() === '');
        if (invalidUpdates.length > 0) {
            this.showNotification('Tous les items doivent avoir un état et un technicien', 'warning');
            return;
        }

        // Envoyer les mises à jour
        Promise.all(updates.map(async update => {
            const serverUrl = api.getServerUrl();
            const endpointPath = '/api/lots/items/:id'.replace(':id', update.itemId);
            const fullUrl = `${serverUrl}${endpointPath}`;
            logger.debug('💾 Mise à jour item:', JSON.stringify({ itemId: update.itemId, state: update.state, technician: update.technician, os: update.os, fullUrl }, null, 2));
            const response = await fetch(fullUrl, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('workspace_jwt') || ''}`
                },
                body: JSON.stringify({
                    state: update.state,
                    technician: update.technician || null,
                    os: update.os || 'linux'
                })
            });
            if (!response.ok) {
                let errorText = '';
                try {
                    errorText = await response.text();
                    // Essayer de parser comme JSON pour un meilleur affichage
                    try {
                        const errorJson = JSON.parse(errorText);
                        logger.error('❌ Erreur mise à jour item:', JSON.stringify({ 
                            status: response.status, 
                            error: errorJson,
                            itemId: update.itemId 
                        }, null, 2));
                        const errorMessage = errorJson.message || errorJson.error || errorText;
                        throw new Error(`HTTP ${response.status}: ${errorMessage}`);
                    } catch (e) {
                        if (e.message && e.message.startsWith('HTTP')) {
                            throw e; // Re-throw si c'est déjà notre erreur formatée
                        }
                        logger.error('❌ Erreur mise à jour item (texte):', JSON.stringify({ 
                            status: response.status, 
                            errorText,
                            itemId: update.itemId 
                        }, null, 2));
                        throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
                    }
                } catch (e) {
                    if (e.message && e.message.startsWith('HTTP')) {
                        throw e; // Re-throw si c'est déjà notre erreur formatée
                    }
                    logger.error('❌ Erreur lors de la lecture de la réponse:', e);
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
            }
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
        this.sessionsDisques = [];
    }
}
