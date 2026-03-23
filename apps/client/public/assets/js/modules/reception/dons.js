/**
 * DONS - Module Réception
 * Tableau type / marque / modèle / S/N / date / stagiaire, génération certificat PDF.
 */

import getLogger from '../../config/Logger.js';
import api from '../../config/api.js';

const logger = getLogger();

const DONS_PDF_BASE = '/mnt/team/#TEAM/#TRAÇABILITÉ/don_stagiaires';

function escapeHtml(s) {
    if (s == null) return '';
    const div = document.createElement('div');
    div.textContent = String(s);
    return div.innerHTML;
}

/** Convertit YYYY-MM-DD en DD/MM/AAAA */
function formatDateDDMMAAAA(isoDate) {
    if (!isoDate || typeof isoDate !== 'string') return isoDate || '';
    const parts = isoDate.trim().split(/[-/]/);
    if (parts.length !== 3) return isoDate;
    const [y, m, d] = parts;
    if (y.length === 4 && m.length <= 2 && d.length <= 2) return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
    if (d.length === 4 && m.length <= 2 && y.length <= 2) return `${y.padStart(2, '0')}/${m.padStart(2, '0')}/${d}`;
    return isoDate;
}

export default class DonsManager {
    constructor(modalManager) {
        this.modalManager = modalManager;
        this.marques = [];
        this.modeles = [];
        this.listeners = [];
        this.init();
    }

    async init() {
        logger.debug('Initialisation DonsManager');
        await this.loadReferenceData();
        this.updateMarqueSelects();
        this.setupEventListeners();
        this.addFirstLineIfEmpty();
        logger.debug('DonsManager prêt');
    }

    destroy() {
        this.listeners.forEach(({ element, event, handler }) => {
            element?.removeEventListener(event, handler);
        });
        this.listeners = [];
    }

    addListener(element, event, handler) {
        if (element) {
            element.addEventListener(event, handler);
            this.listeners.push({ element, event, handler });
        }
    }

    async loadReferenceData() {
        try {
            const marquesRes = await api.get('marques.list');
            if (!marquesRes.ok) throw new Error('Erreur chargement marques');
            const marquesData = await marquesRes.json();
            this.marques = Array.isArray(marquesData) ? marquesData : (marquesData.items || marquesData.marques || []);

            const modelesRes = await api.get('marques.all');
            if (!modelesRes.ok) throw new Error('Endpoint modèles non trouvé');
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
            logger.debug('Dons: marques/modèles chargés', this.marques.length, this.modeles.length);
        } catch (error) {
            logger.error('Erreur chargement données dons:', error);
            this.marques = [];
            this.modeles = [];
        }
    }

    updateMarqueSelects() {
        const selects = document.querySelectorAll('.dons-select-marque, #select-marque-for-modele');
        selects.forEach(select => {
            if (!select) return;
            const currentValue = select.value;
            const isModeleModal = select.id === 'select-marque-for-modele';
            select.innerHTML = isModeleModal
                ? '<option value="">-- Sélectionner une marque --</option>'
                : '<option value="">Marque...</option>';
            this.marques.forEach(marque => {
                const option = document.createElement('option');
                option.value = marque.id;
                option.textContent = marque.name;
                select.appendChild(option);
            });
            if (currentValue) select.value = currentValue;
        });
    }

    updateModeleSelect(marqueId, selectElement) {
        if (!marqueId || !selectElement) return;
        const currentValue = selectElement.value;
        const filtered = this.modeles.filter(m => m.marque_id == marqueId);
        selectElement.innerHTML = '<option value="">Modèle...</option>';
        filtered.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.name;
            selectElement.appendChild(opt);
        });
        if (currentValue && filtered.some(m => m.id == currentValue)) selectElement.value = currentValue;
    }

    getLinesFromTable() {
        const lines = [];
        document.querySelectorAll('#dons-tbody .dons-line').forEach((row, idx) => {
            const typeSelect = row.querySelector('.dons-select-type');
            const typeOther = row.querySelector('.dons-input-type-other');
            const marqueSelect = row.querySelector('.dons-select-marque');
            const modeleSelect = row.querySelector('.dons-select-modele');
            const snInput = row.querySelector('.dons-input-sn');
            const dateInput = row.querySelector('.dons-input-date');
            const stagiaireInput = row.querySelector('.dons-input-stagiaire');

            const typeVal = typeSelect?.value || '';
            const typeDisplay = typeVal === 'autres' && typeOther?.value?.trim()
                ? typeOther.value.trim()
                : (typeSelect?.selectedOptions?.[0]?.textContent || typeVal || '-');
            const marqueName = marqueSelect?.selectedOptions?.[0]?.textContent || '-';
            const modeleName = modeleSelect?.selectedOptions?.[0]?.textContent || '-';

            lines.push({
                num: idx + 1,
                type: typeDisplay,
                typeCode: typeVal,
                typeOther: typeOther?.value?.trim() || '',
                marqueId: marqueSelect?.value || '',
                marqueName,
                modeleId: modeleSelect?.value || '',
                modeleName,
                serialNumber: (snInput?.value ?? '').trim(),
                date: (dateInput?.value ?? '').trim(),
                stagiaire: (stagiaireInput?.value ?? '').trim()
            });
        });
        return lines;
    }

    addTableLine() {
        if (this._addingLine) return;
        this._addingLine = true;
        const tbody = document.getElementById('dons-tbody');
        if (!tbody) {
            this._addingLine = false;
            return;
        }
        const lines = tbody.querySelectorAll('.dons-line');
        const nextIndex = lines.length;
        const today = new Date().toISOString().slice(0, 10);
        const tr = document.createElement('tr');
        tr.className = 'dons-line';
        tr.dataset.lineIndex = String(nextIndex);
        tr.innerHTML = `
            <td class="col-num" data-label="N°">${nextIndex + 1}</td>
            <td class="col-type" data-label="Type">
                <div class="type-cell-wrapper">
                    <select class="dons-select-type" name="type">
                        <option value="">Type...</option>
                        <option value="portable">Portable</option>
                        <option value="fixe">Fixe</option>
                        <option value="ecran">Écran</option>
                        <option value="autres">Autres</option>
                    </select>
                    <input type="text" class="dons-input-type-other" name="type_other" placeholder="Précisez..." style="display:none;" maxlength="100">
                </div>
            </td>
            <td class="col-marque" data-label="Marque">
                <select class="dons-select-marque" name="marque">
                    <option value="">Marque...</option>
                    ${this.marques.map(m => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('')}
                </select>
            </td>
            <td class="col-modele" data-label="Modèle">
                <select class="dons-select-modele" name="modele">
                    <option value="">Modèle...</option>
                </select>
            </td>
            <td class="col-sn" data-label="S/N">
                <input type="text" class="dons-input-sn" placeholder="S/N" maxlength="100">
            </td>
            <td class="col-date" data-label="Date">
                <input type="date" class="dons-input-date" value="${today}" title="Cliquez pour choisir la date">
            </td>
            <td class="col-stagiaire" data-label="Stagiaire AFPA">
                <input type="text" class="dons-input-stagiaire" placeholder="Nom stagiaire" maxlength="255">
            </td>
            <td class="col-actions" data-label="Action">
                <button type="button" class="btn-remove-line" data-line="${nextIndex}" title="Supprimer la ligne">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
        this.attachLineListeners(tr);
        this.updateLineNumbers();
        this.updateRemoveButtonsState();
        setTimeout(() => { this._addingLine = false; }, 0);
    }

    removeTableLine(lineIndex) {
        const row = document.querySelector(`#dons-tbody .dons-line[data-line-index="${lineIndex}"]`);
        if (row) row.remove();
        this.updateLineNumbers();
        this.updateRemoveButtonsState();
    }

    updateLineNumbers() {
        document.querySelectorAll('#dons-tbody .dons-line').forEach((row, idx) => {
            row.dataset.lineIndex = String(idx);
            const numCell = row.querySelector('.col-num');
            if (numCell) numCell.textContent = idx + 1;
            const removeBtn = row.querySelector('.btn-remove-line');
            if (removeBtn) removeBtn.dataset.line = String(idx);
        });
    }

    updateRemoveButtonsState() {
        const count = document.querySelectorAll('#dons-tbody .dons-line').length;
        document.querySelectorAll('#dons-tbody .btn-remove-line').forEach(btn => {
            btn.disabled = count <= 1;
        });
    }

    attachLineListeners(row) {
        const removeBtn = row?.querySelector('.btn-remove-line');
        if (removeBtn) {
            this.addListener(removeBtn, 'click', () => {
                this.removeTableLine(removeBtn.dataset.line);
            });
        }
        const typeSelect = row?.querySelector('.dons-select-type');
        const typeOther = row?.querySelector('.dons-input-type-other');
        if (typeSelect && typeOther) {
            this.addListener(typeSelect, 'change', () => {
                const isAutres = typeSelect.value === 'autres';
                typeOther.style.display = isAutres ? 'inline-block' : 'none';
                if (isAutres) typeOther.focus();
                else typeOther.value = '';
            });
        }
        const marqueSelect = row?.querySelector('.dons-select-marque');
        const modeleSelect = row?.querySelector('.dons-select-modele');
        if (marqueSelect && modeleSelect) {
            this.addListener(marqueSelect, 'change', () => {
                if (marqueSelect.value) {
                    this.updateModeleSelect(marqueSelect.value, modeleSelect);
                } else {
                    modeleSelect.innerHTML = '<option value="">Modèle...</option>';
                }
            });
        }
    }

    addFirstLineIfEmpty() {
        const tbody = document.getElementById('dons-tbody');
        if (tbody && tbody.querySelectorAll('.dons-line').length === 0) {
            this.addTableLine();
        }
    }

    setupEventListeners() {
        const btnAddLine = document.getElementById('dons-btn-add-line');
        if (btnAddLine) {
            this.addListener(btnAddLine, 'click', (e) => {
                e.preventDefault();
                e.stopImmediatePropagation();
                this.addTableLine();
            });
        }

        document.querySelectorAll('#dons-tbody .btn-remove-line').forEach(btn => {
            this.addListener(btn, 'click', () => this.removeTableLine(btn.dataset.line));
        });
        this.updateRemoveButtonsState();

        const btnSavePdf = document.getElementById('dons-btn-save-pdf');
        if (btnSavePdf) this.addListener(btnSavePdf, 'click', () => this.savePdf());

        const btnSubmitMarque = document.getElementById('btn-submit-marque');
        if (btnSubmitMarque) this.addListener(btnSubmitMarque, 'click', () => this.submitNewMarque());

        const btnSubmitModele = document.getElementById('btn-submit-modele');
        if (btnSubmitModele) this.addListener(btnSubmitModele, 'click', () => this.submitNewModele());

        const btnAddModele = document.getElementById('dons-btn-add-modele');
        if (btnAddModele) {
            this.addListener(btnAddModele, 'click', () => {
                setTimeout(() => this.populateMarqueSelect(), 150);
            });
        }

        this.addListener(document, 'change', (e) => {
            if (e.target.classList.contains('dons-select-marque')) {
                const row = e.target.closest('tr');
                const modeleSelect = row?.querySelector('.dons-select-modele');
                if (modeleSelect && e.target.value) {
                    this.updateModeleSelect(e.target.value, modeleSelect);
                }
            }
        });
    }

    populateMarqueSelect() {
        const select = document.getElementById('select-marque-for-modele');
        if (!select) return;
        select.innerHTML = '<option value="">-- Sélectionner une marque --</option>';
        this.marques.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.name;
            select.appendChild(opt);
        });
    }

    async submitNewMarque() {
        const input = document.getElementById('input-new-marque');
        if (!input?.value?.trim()) {
            window.app?.showNotification?.('Saisissez un nom de marque', 'warning');
            return;
        }
        const name = input.value.trim();
        try {
            const response = await api.post('marques.list', { name });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            this.marques.push({ id: data.id || this.marques.length + 1, name });
            this.updateMarqueSelects();
            input.value = '';
            this.modalManager.close('modal-add-marque');
            window.app?.showNotification?.('Marque ajoutée', 'success');
        } catch (err) {
            logger.error('Erreur ajout marque:', err);
            window.app?.showNotification?.(err?.message || 'Erreur lors de l\'ajout', 'error');
        }
    }

    async submitNewModele() {
        const selectMarque = document.getElementById('select-marque-for-modele');
        const inputModele = document.getElementById('input-new-modele');
        if (!selectMarque?.value || !inputModele?.value?.trim()) {
            window.app?.showNotification?.('Remplissez marque et modèle', 'warning');
            return;
        }
        const marqueId = parseInt(selectMarque.value, 10);
        const name = inputModele.value.trim();
        const serverUrl = api.getServerUrl?.() || window.SERVER_CONFIG?.serverUrl || '';
        const path = `/api/marques/${marqueId}/modeles`;
        try {
            const response = await fetch(`${serverUrl}${path}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('workspace_jwt') || ''}`
                },
                body: JSON.stringify({ name })
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            this.modeles.push({ id: data.id || this.modeles.length + 1, name, marque_id: marqueId });
            this.updateMarqueSelects();
            inputModele.value = '';
            selectMarque.value = '';
            this.modalManager.close('modal-add-modele');
            window.app?.showNotification?.('Modèle ajouté', 'success');
        } catch (err) {
            logger.error('Erreur ajout modèle:', err);
            window.app?.showNotification?.(err?.message || 'Erreur lors de l\'ajout', 'error');
        }
    }

    async savePdf() {
        const lines = this.getLinesFromTable();
        if (lines.length === 0) {
            window.app?.showNotification?.('Ajoutez au moins une ligne', 'warning');
            return;
        }
        const lotName = document.getElementById('dons-lot-name')?.value?.trim() || null;
        const dateStr = new Date().toISOString().slice(0, 10);

        const invoke = window.electron?.invoke || window.electronAPI?.invoke;
        if (!invoke) {
            window.app?.showNotification?.('Génération PDF disponible uniquement dans l\'application desktop', 'warning');
            return;
        }

        const payload = {
            lotName: lotName || 'don',
            date: formatDateDDMMAAAA(dateStr),
            lines: lines.map(l => ({
                num: l.num,
                type: l.type,
                marqueName: l.marqueName,
                modeleName: l.modeleName,
                serialNumber: l.serialNumber,
                date: formatDateDDMMAAAA(l.date),
                stagiaire: l.stagiaire
            })),
            basePath: DONS_PDF_BASE
        };

        try {
            window.app?.showNotification?.('Génération du certificat...', 'info');
            const result = await invoke('generate-don-pdf', payload);
            if (result?.success && result.pdf_path) {
                window.app?.showNotification?.('Certificat enregistré : ' + result.pdf_path, 'success');
                try {
                    const createRes = await api.post('dons.create', {
                        lot_name: lotName || null,
                        date: dateStr,
                        pdf_path: result.pdf_path,
                        lines: payload.lines
                    });
                    if (!createRes.ok) {
                        let detail = `HTTP ${createRes.status}`;
                        try {
                            const errData = await createRes.json();
                            detail = errData?.message || errData?.error || detail;
                        } catch (_) { /* keep default detail */ }
                        logger.warn('Backend dons.create:', createRes.status, detail);
                        window.app?.showNotification?.(`PDF local créé mais enregistrement serveur impossible (${detail})`, 'warning');
                    }
                } catch (apiErr) {
                    logger.warn('Backend dons.create non disponible:', apiErr);
                    window.app?.showNotification?.(`PDF local créé mais serveur indisponible (${apiErr?.message || 'erreur inconnue'})`, 'warning');
                }
            } else {
                window.app?.showNotification?.(result?.error || 'Échec génération PDF', 'error');
            }
        } catch (err) {
            logger.error('Génération PDF dons:', err);
            window.app?.showNotification?.(err?.message || err?.error || 'Erreur génération PDF', 'error');
        }
    }
}
