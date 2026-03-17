/**
 * DISQUES - Module JS
 * Traçabilité des disques shreddés : saisie S/N, type, taille ; détection auto ; enregistrement via API.
 * Même disposition que Entrée (pas d'historique sur cette page).
 * Les disques de la session en cours sont conservés en mémoire au changement d'onglet.
 */

import getLogger from '../../config/Logger.js';
import api from '../../config/api.js';
import { createSession } from './disquesApi.js';

const logger = getLogger();

/** Cache des disques de la session en cours (persiste au changement d'onglet) */
let sessionDisksCache = [];

/** Interfaces selon le type : HDD = SATA ou SAS ; SSD = M.2, NVMe ou SATA */
const INTERFACES_HDD = [{ value: 'SATA', label: 'SATA' }, { value: 'SAS', label: 'SAS' }];
const INTERFACES_SSD = [{ value: 'M.2', label: 'M.2' }, { value: 'NVMe', label: 'NVMe' }, { value: 'SATA', label: 'SATA' }];
const INTERFACES_ALL = [{ value: 'SATA', label: 'SATA' }, { value: 'SAS', label: 'SAS' }, { value: 'NVMe', label: 'NVMe' }, { value: 'M.2', label: 'M.2' }];

/** Shred : si déjà défini (ex. Destruction physique) on garde, sinon SSD → Secure E. + Sanitize, HDD → DoD */
function getShredForDisk(disk) {
    const existing = (disk.shred || '').trim();
    if (existing && existing === 'Destruction physique') return existing;
    const t = (disk.disk_type || '').toUpperCase();
    if (t === 'SSD') return 'Secure E. + Sanitize';
    if (t === 'HDD') return 'DoD';
    return '-';
}

const VALUE_AUTRE = '__autre__';

export default class DisquesManager {
    constructor(modalManager) {
        this.modalManager = modalManager;
        this.sessionDisks = Array.isArray(sessionDisksCache) ? [...sessionDisksCache] : [];
        this.lsblkPendingDisks = [];
        this.marques = [];
        this.modeles = [];
        this.listeners = [];
        this.init();
    }

    async init() {
        logger.debug('Initialisation DisquesManager');
        await this.loadReferenceData();
        this.setupEventListeners();
        this.renderSessionTable();
        this.focusSerialInput();
        logger.debug('DisquesManager prêt');
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
            this.updateDisquesMarqueSelect();
        } catch (err) {
            logger.error('Erreur chargement marques/modèles disques:', err);
            this.marques = [];
            this.modeles = [];
            this.updateDisquesMarqueSelect();
        }
    }

    updateDisquesMarqueSelect() {
        const sel = document.getElementById('disques-marque');
        const selModeleModal = document.getElementById('disques-select-marque-for-modele');
        [sel, selModeleModal].forEach(s => {
            if (!s) return;
            const current = s.value;
            s.innerHTML = '<option value="">-- Marque --</option>' +
                this.marques.map(m => `<option value="${escapeHtml(String(m.id))}">${escapeHtml(m.name)}</option>`).join('') +
                `<option value="${VALUE_AUTRE}">Autre</option>`;
            if (current && Array.from(s.options).some(o => o.value === current)) s.value = current;
        });
        const marqueId = sel?.value && sel.value !== VALUE_AUTRE ? sel.value : '';
        this.updateDisquesModeleSelect(marqueId, document.getElementById('disques-modele'));
    }

    updateDisquesModeleSelect(marqueId, selectElement) {
        const sel = selectElement || document.getElementById('disques-modele');
        if (!sel) return;
        const current = sel.value;
        const filtered = marqueId && marqueId !== VALUE_AUTRE
            ? this.modeles.filter(m => String(m.marque_id) === String(marqueId))
            : [];
        sel.innerHTML = '<option value="">-- Modèle --</option>' +
            filtered.map(m => `<option value="${escapeHtml(String(m.id))}">${escapeHtml(m.name)}</option>`).join('') +
            `<option value="${VALUE_AUTRE}">Autre</option>`;
        if (current && Array.from(sel.options).some(o => o.value === current)) sel.value = current;
    }

    async submitNewMarque() {
        const input = document.getElementById('disques-input-new-marque');
        if (!input?.value?.trim()) {
            window.app?.showNotification?.('Veuillez saisir un nom de marque', 'warning');
            return;
        }
        const newMarque = input.value.trim();
        const exists = this.marques.some(m => (m.name || '').trim().toLowerCase() === newMarque.toLowerCase());
        if (exists) {
            window.app?.showNotification?.('Cette marque existe déjà', 'warning');
            return;
        }
        try {
            const response = await api.post('marques.list', { name: newMarque });
            if (!response.ok) throw new Error('HTTP ' + response.status);
            const data = await response.json();
            this.marques.push({ id: data.id || this.marques.length + 1, name: newMarque });
            window.app?.showNotification?.(`Marque "${newMarque}" ajoutée`, 'success');
            this.modalManager?.close?.('disques-modal-add-marque');
            input.value = '';
            this.updateDisquesMarqueSelect();
        } catch (err) {
            logger.error('submitNewMarque:', err);
            window.app?.showNotification?.(err?.message || 'Erreur lors de l\'ajout de la marque', 'error');
        }
    }

    async submitNewModele() {
        const selectMarque = document.getElementById('disques-select-marque-for-modele');
        const inputModele = document.getElementById('disques-input-new-modele');
        if (!selectMarque?.value || !inputModele?.value?.trim()) {
            window.app?.showNotification?.('Veuillez choisir une marque et saisir un modèle', 'warning');
            return;
        }
        const marqueId = selectMarque.value;
        const newModele = inputModele.value.trim();
        const exists = this.modeles.some(m => m.marque_id == marqueId && (m.name || '').trim().toLowerCase() === newModele.toLowerCase());
        if (exists) {
            window.app?.showNotification?.('Ce modèle existe déjà pour cette marque', 'warning');
            return;
        }
        try {
            const serverUrl = api.getServerUrl();
            const url = `${serverUrl}/api/marques/${marqueId}/modeles`;
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('workspace_jwt') || ''}`
                },
                body: JSON.stringify({ name: newModele })
            });
            if (!res.ok) throw new Error(await res.text().catch(() => 'HTTP ' + res.status));
            const data = await res.json();
            this.modeles.push({
                id: data.id || this.modeles.length + 1,
                name: newModele,
                marque_id: parseInt(marqueId, 10)
            });
            window.app?.showNotification?.(`Modèle "${newModele}" ajouté`, 'success');
            this.modalManager?.close?.('disques-modal-add-modele');
            inputModele.value = '';
            selectMarque.value = '';
            this.updateDisquesMarqueSelect();
        } catch (err) {
            logger.error('submitNewModele:', err);
            window.app?.showNotification?.(err?.message || 'Erreur lors de l\'ajout du modèle', 'error');
        }
    }

    addListener(el, event, handler) {
        if (!el) return;
        el.addEventListener(event, handler);
        this.listeners.push({ element: el, event, handler });
    }

    destroy() {
        sessionDisksCache = [...(this.sessionDisks || [])];
        this.listeners.forEach(({ element, event, handler }) => {
            element?.removeEventListener(event, handler);
        });
        this.listeners = [];
        logger.debug('Destruction DisquesManager (session conservée: ' + sessionDisksCache.length + ' disque(s))');
    }

    focusSerialInput() {
        const input = document.getElementById('disques-serial');
        if (input) setTimeout(() => input.focus(), 100);
    }

    getEffectiveSize() {
        const sel = document.getElementById('disques-size');
        const custom = document.getElementById('disques-size-custom');
        const v = sel?.value || '';
        if (v === 'autre' && custom?.value?.trim()) return custom.value.trim();
        return v || '';
    }

    getMarqueFromForm() {
        const sel = document.getElementById('disques-marque');
        const autre = document.getElementById('disques-marque-autre');
        if (sel?.value === VALUE_AUTRE && autre?.value?.trim()) return autre.value.trim();
        if (sel?.value && sel.value !== VALUE_AUTRE) {
            const m = this.marques.find(x => String(x.id) === String(sel.value));
            return m ? m.name : sel.value;
        }
        return '';
    }

    getModeleFromForm() {
        const sel = document.getElementById('disques-modele');
        const autre = document.getElementById('disques-modele-autre');
        if (sel?.value === VALUE_AUTRE && autre?.value?.trim()) return autre.value.trim();
        if (sel?.value && sel.value !== VALUE_AUTRE) {
            const m = this.modeles.find(x => String(x.id) === String(sel.value));
            return m ? m.name : sel.value;
        }
        return '';
    }

    renderSessionTable() {
        const tbody = document.getElementById('disques-session-tbody');
        const emptyMsg = document.getElementById('disques-session-empty');
        const saveBtn = document.getElementById('disques-btn-save');
        if (!tbody) return;
        tbody.innerHTML = '';
        this.sessionDisks.forEach((d, i) => {
            const tr = document.createElement('tr');
            const canEdit = d.autoDetected === true;
            const editBtn = canEdit
                ? `<button type="button" class="btn btn-sm disques-edit" data-index="${i}" title="Éditer S/N, marque, modèle, taille, type, interface"><i class="fa-solid fa-pencil"></i></button>`
                : '';
            tr.innerHTML = `
                <td data-label="N°">${i + 1}</td>
                <td data-label="S/N">${escapeHtml(d.serial || '-')}</td>
                <td data-label="Marque">${escapeHtml(d.marque || '-')}</td>
                <td data-label="Modèle">${escapeHtml(d.modele || '-')}</td>
                <td data-label="Taille">${escapeHtml(d.size || '-')}</td>
                <td data-label="Type">${escapeHtml(d.disk_type || '-')}</td>
                <td data-label="Interface">${escapeHtml(d.interface || '-')}</td>
                <td data-label="Shred">${escapeHtml(d.shred || '-')}</td>
                <td class="th-action" data-label="Action">${editBtn}<button type="button" class="btn btn-sm disques-remove" data-index="${i}" title="Retirer"><i class="fa-solid fa-trash-alt"></i></button></td>
            `;
            tbody.appendChild(tr);
        });
        if (emptyMsg) emptyMsg.style.display = this.sessionDisks.length ? 'none' : 'block';
        if (saveBtn) saveBtn.disabled = this.sessionDisks.length === 0;
    }

    /**
     * Ajoute un disque. disk peut être un objet complet ou (serial, interface, size) pour lsblk.
     * Shred : Destruction physique si physicalDestruction, sinon calcul auto (SSD/HDD).
     */
    addDisk(diskOrSerial, interfaceOrUndef, sizeOrUndef, fromLsblk = false) {
        let d;
        if (diskOrSerial && typeof diskOrSerial === 'object') {
            d = {
                serial: (diskOrSerial.serial || '').trim(),
                marque: (diskOrSerial.marque || '').trim() || '-',
                modele: (diskOrSerial.modele || '').trim() || '-',
                size: (diskOrSerial.size || '').trim() || '-',
                disk_type: (diskOrSerial.disk_type || '').trim() || '-',
                interface: (diskOrSerial.interface || '').trim() || '-',
                shred: (diskOrSerial.shred || '').trim() || '',
                autoDetected: !!diskOrSerial.autoDetected || !!fromLsblk
            };
            if (diskOrSerial.physicalDestruction === true) d.shred = 'Destruction physique';
            else if (!d.shred) d.shred = getShredForDisk(d);
        } else {
            d = {
                serial: (diskOrSerial || '').trim(),
                marque: '-',
                modele: '-',
                size: (sizeOrUndef || '').trim() || '-',
                disk_type: '-',
                interface: (interfaceOrUndef || 'SATA').trim(),
                shred: '',
                autoDetected: false
            };
            d.shred = getShredForDisk(d);
        }
        if (!d.serial) {
            window.app?.showNotification?.('Saisissez un numéro de série', 'warning');
            return;
        }
        const serialNorm = (d.serial || '').trim().toUpperCase();
        const alreadyScanned = this.sessionDisks.some(ex => (ex.serial || '').trim().toUpperCase() === serialNorm);
        if (alreadyScanned) {
            window.app?.showNotification?.('Déjà scanné', 'warning');
            return;
        }
        this.sessionDisks.push(d);
        this.renderSessionTable();
        this.focusSerialInput();
        window.app?.showNotification?.('Disque ajouté', 'success');
    }

    /**
     * Met à jour les options du select Interface selon le Type (HDD / SSD).
     * HDD → SATA, SAS ; SSD → M.2, NVMe, SATA.
     */
    updateInterfaceOptions(diskType) {
        const sel = document.getElementById('disques-interface');
        if (!sel) return;
        const list = (diskType || '').toUpperCase() === 'HDD' ? INTERFACES_HDD
            : (diskType || '').toUpperCase() === 'SSD' ? INTERFACES_SSD
                : INTERFACES_ALL;
        const current = sel.value;
        sel.innerHTML = list.map(o => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join('');
        const hasCurrent = list.some(o => o.value === current);
        sel.value = hasCurrent ? current : (list[0]?.value || 'SATA');
    }

    removeDisk(index) {
        this.sessionDisks.splice(index, 1);
        this.renderSessionTable();
    }

    setupEventListeners() {
        const serialInput = document.getElementById('disques-serial');
        const sizeSelect = document.getElementById('disques-size');
        const sizeCustom = document.getElementById('disques-size-custom');
        const diskTypeSelect = document.getElementById('disques-disk-type');
        const interfaceSelect = document.getElementById('disques-interface');

        this.updateInterfaceOptions(diskTypeSelect?.value);

        const destructionPhysiqueCheck = document.getElementById('disques-destruction-physique');
        const addFromForm = () => {
            this.addDisk({
                serial: serialInput?.value?.trim() || '',
                marque: this.getMarqueFromForm() || '-',
                modele: this.getModeleFromForm() || '-',
                size: this.getEffectiveSize(),
                disk_type: diskTypeSelect?.value || '',
                interface: interfaceSelect?.value || 'SATA',
                physicalDestruction: destructionPhysiqueCheck?.checked === true
            });
            if (serialInput) serialInput.value = '';
            if (destructionPhysiqueCheck) destructionPhysiqueCheck.checked = false;
        };

        const btnAdd = document.getElementById('disques-btn-add');
        if (btnAdd) this.addListener(btnAdd, 'click', addFromForm);

        if (sizeSelect) {
            this.addListener(sizeSelect, 'change', () => {
                const show = sizeSelect.value === 'autre';
                if (sizeCustom) sizeCustom.style.display = show ? 'inline-block' : 'none';
            });
        }

        if (diskTypeSelect) {
            this.addListener(diskTypeSelect, 'change', () => this.updateInterfaceOptions(diskTypeSelect.value));
        }

        const marqueSelect = document.getElementById('disques-marque');
        const marqueAutre = document.getElementById('disques-marque-autre');
        const modeleSelect = document.getElementById('disques-modele');
        const modeleAutre = document.getElementById('disques-modele-autre');
        if (marqueSelect) {
            this.addListener(marqueSelect, 'change', () => {
                const isAutre = marqueSelect.value === VALUE_AUTRE;
                if (marqueAutre) marqueAutre.style.display = isAutre ? 'inline-block' : 'none';
                if (!isAutre) marqueAutre.value = '';
                this.updateDisquesModeleSelect(marqueSelect.value === VALUE_AUTRE ? '' : marqueSelect.value, modeleSelect);
                if (modeleAutre) modeleAutre.style.display = 'none';
                modeleAutre.value = '';
            });
        }
        if (modeleSelect) {
            this.addListener(modeleSelect, 'change', () => {
                const isAutre = modeleSelect.value === VALUE_AUTRE;
                if (modeleAutre) modeleAutre.style.display = isAutre ? 'inline-block' : 'none';
                if (!isAutre) modeleAutre.value = '';
            });
        }

        const btnAddMarque = document.getElementById('disques-btn-add-marque');
        if (btnAddMarque) this.addListener(btnAddMarque, 'click', () => this.modalManager?.open?.('disques-modal-add-marque'));
        const btnAddModele = document.getElementById('disques-btn-add-modele');
        if (btnAddModele) this.addListener(btnAddModele, 'click', () => {
            const sel = document.getElementById('disques-select-marque-for-modele');
            if (sel) {
                sel.innerHTML = '<option value="">-- Sélectionner une marque --</option>' +
                    this.marques.map(m => `<option value="${escapeHtml(String(m.id))}">${escapeHtml(m.name)}</option>`).join('');
            }
            this.modalManager?.open?.('disques-modal-add-modele');
        });
        const btnSubmitMarque = document.getElementById('disques-btn-submit-marque');
        if (btnSubmitMarque) this.addListener(btnSubmitMarque, 'click', () => this.submitNewMarque());
        const btnSubmitModele = document.getElementById('disques-btn-submit-modele');
        if (btnSubmitModele) this.addListener(btnSubmitModele, 'click', () => this.submitNewModele());

        const btnLsblk = document.getElementById('disques-btn-lsblk');
        if (btnLsblk) this.addListener(btnLsblk, 'click', () => this.runLsblk());

        const btnNewSession = document.getElementById('disques-btn-new-session');
        if (btnNewSession) this.addListener(btnNewSession, 'click', () => {
            this.sessionDisks = [];
            this.renderSessionTable();
            this.focusSerialInput();
            window.app?.showNotification?.('Nouvelle session', 'info');
        });

        const btnSave = document.getElementById('disques-btn-save');
        if (btnSave) this.addListener(btnSave, 'click', () => this.saveSession());

        const lsblkAddSelected = document.getElementById('lsblk-btn-add-selected');
        if (lsblkAddSelected) this.addListener(lsblkAddSelected, 'click', () => this.addLsblkSelected());

        const sessionTable = document.getElementById('disques-session-table');
        if (sessionTable) {
            const onTableClick = (e) => {
                const removeBtn = e.target.closest('.disques-remove');
                if (removeBtn && removeBtn.dataset.index != null) {
                    this.removeDisk(parseInt(removeBtn.dataset.index, 10));
                    return;
                }
                const editBtn = e.target.closest('.disques-edit');
                if (editBtn && editBtn.dataset.index != null) {
                    this.openEditDiskModal(parseInt(editBtn.dataset.index, 10));
                }
            };
            sessionTable.addEventListener('click', onTableClick);
            this.listeners.push({ element: sessionTable, event: 'click', handler: onTableClick });
        }

        const btnSaveEditDisk = document.getElementById('disques-edit-disk-save');
        if (btnSaveEditDisk) this.addListener(btnSaveEditDisk, 'click', () => this.saveEditDisk());

        const editSizeSelect = document.getElementById('disques-edit-size');
        if (editSizeSelect) {
            this.addListener(editSizeSelect, 'change', () => {
                const custom = document.getElementById('disques-edit-size-custom');
                if (custom) custom.style.display = editSizeSelect.value === 'autre' ? 'inline-block' : 'none';
            });
        }
        const editDiskType = document.getElementById('disques-edit-disk-type');
        if (editDiskType) {
            this.addListener(editDiskType, 'change', () => this.updateEditInterfaceOptions(editDiskType.value));
        }
        const editMarqueSel = document.getElementById('disques-edit-marque');
        const editMarqueAutre = document.getElementById('disques-edit-marque-autre');
        const editModeleSel = document.getElementById('disques-edit-modele');
        const editModeleAutre = document.getElementById('disques-edit-modele-autre');
        if (editMarqueSel) {
            this.addListener(editMarqueSel, 'change', () => {
                const isAutre = editMarqueSel.value === VALUE_AUTRE;
                if (editMarqueAutre) editMarqueAutre.style.display = isAutre ? 'inline-block' : 'none';
                if (!isAutre) editMarqueAutre.value = '';
                this.updateDisquesModeleSelect(editMarqueSel.value === VALUE_AUTRE ? '' : editMarqueSel.value, editModeleSel);
                if (editModeleAutre) {
                    editModeleAutre.style.display = 'none';
                    editModeleAutre.value = '';
                }
            });
        }
        if (editModeleSel) {
            this.addListener(editModeleSel, 'change', () => {
                const isAutre = editModeleSel.value === VALUE_AUTRE;
                if (editModeleAutre) editModeleAutre.style.display = isAutre ? 'inline-block' : 'none';
                if (!isAutre) editModeleAutre.value = '';
            });
        }
    }

    openEditDiskModal(index) {
        const d = this.sessionDisks[index];
        if (!d) return;
        this._editingDiskIndex = index;
        const modal = document.getElementById('modal-disques-edit-disk');
        if (!modal) return;
        document.getElementById('disques-edit-serial').value = d.serial || '';
        const marqueVal = (d.marque || '').trim();
        const modeleVal = (d.modele || '').trim();
        const editMarqueSel = document.getElementById('disques-edit-marque');
        const editMarqueAutre = document.getElementById('disques-edit-marque-autre');
        const editModeleSel = document.getElementById('disques-edit-modele');
        const editModeleAutre = document.getElementById('disques-edit-modele-autre');
        if (editMarqueSel) {
            const marqueMatch = this.marques.find(m => (m.name || '').trim() === marqueVal);
            if (marqueMatch) {
                editMarqueSel.value = String(marqueMatch.id);
                if (editMarqueAutre) editMarqueAutre.style.display = 'none';
                editMarqueAutre.value = '';
                this.updateDisquesModeleSelect(marqueMatch.id, editModeleSel);
                const modeleMatch = this.modeles.find(m => (m.name || '').trim() === modeleVal && m.marque_id == marqueMatch.id);
                if (editModeleSel) {
                    if (modeleMatch) {
                        editModeleSel.value = String(modeleMatch.id);
                        if (editModeleAutre) editModeleAutre.style.display = 'none';
                        editModeleAutre.value = '';
                    } else {
                        editModeleSel.value = VALUE_AUTRE;
                        if (editModeleAutre) {
                            editModeleAutre.style.display = 'inline-block';
                            editModeleAutre.value = modeleVal;
                        }
                    }
                }
            } else {
                editMarqueSel.value = VALUE_AUTRE;
                if (editMarqueAutre) {
                    editMarqueAutre.style.display = 'inline-block';
                    editMarqueAutre.value = marqueVal;
                }
                if (editModeleSel) {
                    editModeleSel.innerHTML = '<option value="">-- Modèle --</option><option value="' + VALUE_AUTRE + '">Autre</option>';
                    editModeleSel.value = VALUE_AUTRE;
                    if (editModeleAutre) {
                        editModeleAutre.style.display = 'inline-block';
                        editModeleAutre.value = modeleVal;
                    }
                }
            }
        }
        const sizeVal = (d.size || '').trim();
        const sizeSelect = document.getElementById('disques-edit-size');
        const sizeCustom = document.getElementById('disques-edit-size-custom');
        if (sizeSelect) {
            const hasOption = Array.from(sizeSelect.options).some(o => o.value === sizeVal);
            sizeSelect.value = hasOption ? sizeVal : (sizeVal ? 'autre' : '');
            if (sizeCustom) {
                sizeCustom.style.display = sizeSelect.value === 'autre' ? 'inline-block' : 'none';
                sizeCustom.value = sizeSelect.value === 'autre' ? sizeVal : '';
            }
        }
        document.getElementById('disques-edit-disk-type').value = d.disk_type || '';
        this.updateEditInterfaceOptions(d.disk_type);
        document.getElementById('disques-edit-interface').value = d.interface || 'SATA';
        const editDestructionCheck = document.getElementById('disques-edit-destruction-physique');
        if (editDestructionCheck) editDestructionCheck.checked = (d.shred || '') === 'Destruction physique';
        this.modalManager?.open?.('modal-disques-edit-disk');
    }

    updateEditInterfaceOptions(diskType) {
        const sel = document.getElementById('disques-edit-interface');
        if (!sel) return;
        const list = (diskType || '').toUpperCase() === 'HDD' ? INTERFACES_HDD
            : (diskType || '').toUpperCase() === 'SSD' ? INTERFACES_SSD
                : INTERFACES_ALL;
        const current = sel.value;
        sel.innerHTML = list.map(o => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join('');
        sel.value = list.some(o => o.value === current) ? current : (list[0]?.value || 'SATA');
    }

    saveEditDisk() {
        if (this._editingDiskIndex == null) return;
        const serial = (document.getElementById('disques-edit-serial')?.value || '').trim();
        if (!serial) {
            window.app?.showNotification?.('S/N obligatoire', 'warning');
            return;
        }
        const sizeSelect = document.getElementById('disques-edit-size');
        const sizeCustom = document.getElementById('disques-edit-size-custom');
        const size = (sizeSelect?.value === 'autre' && sizeCustom?.value?.trim()) ? sizeCustom.value.trim() : (sizeSelect?.value || '');
        const editDestructionCheck = document.getElementById('disques-edit-destruction-physique');
        const editMarqueSel = document.getElementById('disques-edit-marque');
        const editMarqueAutre = document.getElementById('disques-edit-marque-autre');
        const editModeleSel = document.getElementById('disques-edit-modele');
        const editModeleAutre = document.getElementById('disques-edit-modele-autre');
        let marque = '-';
        if (editMarqueSel?.value === VALUE_AUTRE && editMarqueAutre?.value?.trim()) marque = editMarqueAutre.value.trim();
        else if (editMarqueSel?.value && editMarqueSel.value !== VALUE_AUTRE) {
            const m = this.marques.find(x => String(x.id) === String(editMarqueSel.value));
            marque = m ? m.name : '-';
        }
        let modele = '-';
        if (editModeleSel?.value === VALUE_AUTRE && editModeleAutre?.value?.trim()) modele = editModeleAutre.value.trim();
        else if (editModeleSel?.value && editModeleSel.value !== VALUE_AUTRE) {
            const m = this.modeles.find(x => String(x.id) === String(editModeleSel.value));
            modele = m ? m.name : '-';
        }
        const d = {
            serial,
            marque,
            modele,
            size: size || '-',
            disk_type: (document.getElementById('disques-edit-disk-type')?.value || '').trim() || '-',
            interface: (document.getElementById('disques-edit-interface')?.value || 'SATA').trim(),
            shred: editDestructionCheck?.checked ? 'Destruction physique' : '',
            autoDetected: true
        };
        if (!d.shred) d.shred = getShredForDisk(d);
        this.sessionDisks[this._editingDiskIndex] = d;
        this._editingDiskIndex = null;
        this.renderSessionTable();
        this.modalManager?.close?.('modal-disques-edit-disk');
        window.app?.showNotification?.('Ligne mise à jour', 'success');
    }

    async runLsblk() {
        if (typeof window.electron?.invoke !== 'function') {
            window.app?.showNotification?.('Détection automatique disponible uniquement dans l\'application desktop (Linux).', 'warning');
            return;
        }
        try {
            const result = await window.electron.invoke('run-lsblk', {});
            if (!result.success) {
                const msg = result.error || 'Détection échouée';
                window.app?.showNotification?.(msg, 'error');
                return;
            }
            const disks = result.disks || [];
            if (!disks.length) {
                window.app?.showNotification?.('Aucun disque détecté', 'info');
                return;
            }
            this.lsblkPendingDisks = disks;
            this.openLsblkModal(disks);
        } catch (err) {
            logger.error('run-lsblk:', err?.message ?? String(err));
            window.app?.showNotification?.(err?.message || 'Erreur détection automatique', 'error');
        }
    }

    openLsblkModal(disks) {
        const listEl = document.getElementById('lsblk-disks-list');
        if (!listEl) return;
        listEl.innerHTML = disks.map((d, i) => {
            const meta = [d.disk_type || '', d.type || '', d.size || ''].filter(Boolean).join(' · ');
            const modelVendor = [d.vendor, d.model].filter(Boolean).join(' ');
            return `
            <label class="lsblk-disk-row">
                <input type="checkbox" class="lsblk-disk-check" data-index="${i}" checked>
                <span>${escapeHtml(d.serial || d.name || '-')}</span>
                <span class="lsblk-disk-meta">${escapeHtml(meta)}${modelVendor ? ' · ' + escapeHtml(modelVendor) : ''}</span>
            </label>
        `;
        }).join('');
        this.modalManager?.open?.('modal-lsblk-disks');
    }

    addLsblkSelected() {
        const listEl = document.getElementById('lsblk-disks-list');
        if (!listEl) return;
        const checked = listEl.querySelectorAll('.lsblk-disk-check:checked');
        checked.forEach(cb => {
            const i = parseInt(cb.dataset.index, 10);
            const d = this.lsblkPendingDisks[i];
            if (d) this.addDisk({
                serial: d.serial || d.name || '',
                marque: (d.vendor || '').trim() || '-',
                modele: (d.model || '').trim() || '-',
                size: (d.size || '').trim() || '-',
                disk_type: (d.disk_type || '').trim() || '-',
                interface: (d.type || 'SATA').trim(),
                autoDetected: true
            }, undefined, undefined, true);
        });
        this.modalManager?.close?.('modal-lsblk-disks');
        this.lsblkPendingDisks = [];
    }

    async saveSession() {
        if (!this.sessionDisks.length) {
            window.app?.showNotification?.('Aucun disque à enregistrer', 'warning');
            return;
        }
        if (this._savingSession) {
            return;
        }
        this._savingSession = true;
        const nameEl = document.getElementById('disques-session-name');
        const sessionName = (nameEl && nameEl.value) ? nameEl.value.trim() : '';
        const dateStr = new Date().toISOString().slice(0, 10);
        const btnSave = document.getElementById('disques-btn-save');
        if (btnSave) btnSave.disabled = true;
        try {
            const disksPayload = this.sessionDisks.map(({ autoDetected, ...rest }) => rest);
            const session = await createSession({ name: sessionName || undefined, date: dateStr, disks: disksPayload });
            this.sessionDisks = [];
            this.renderSessionTable();
            if (nameEl) nameEl.value = '';
            window.app?.showNotification?.('Session enregistrée en traçabilité', 'success');

            if (window.electron?.invoke && session?.id) {
                const basePath = '/mnt/team/#TEAM/#TRAÇABILITÉ';
                try {
                    window.app?.showNotification?.('Génération du PDF...', 'info');
                    const result = await window.electron.invoke('generate-disques-pdf', {
                        sessionId: session.id,
                        date: session.date || dateStr,
                        name: session.name ?? sessionName,
                        disks: session.disks || disksPayload,
                        basePath
                    });
                    if (result?.success && result.pdf_path) {
                        const readResult = await window.electron.invoke('read-file-as-base64', { path: result.pdf_path });
                        if (readResult?.success && readResult.base64) {
                            const serverUrl = api.getServerUrl();
                            const res = await fetch(`${serverUrl}/api/disques/sessions/${session.id}/pdf`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${localStorage.getItem('workspace_jwt') || ''}`
                                },
                                body: JSON.stringify({
                                    pdf_base64: readResult.base64,
                                    session_name: session.name ?? sessionName,
                                    date: session.date || dateStr,
                                    save_path_hint: basePath
                                })
                            });
                            if (res.ok) {
                                window.app?.showNotification?.('PDF généré et enregistré', 'success');
                            } else {
                                window.app?.showNotification?.('PDF généré en local ; envoi serveur à configurer (POST /api/disques/sessions/:id/pdf)', 'warning');
                            }
                        }
                    }
                } catch (pdfErr) {
                    logger.error('Génération PDF disques après create:', pdfErr);
                    window.app?.showNotification?.(pdfErr?.message || 'PDF non généré (disponible dans l\'app desktop)', 'warning');
                }
            }
        } catch (err) {
            logger.error('createSession:', err);
            window.app?.showNotification?.(err?.message || 'Erreur lors de l\'enregistrement', 'error');
        } finally {
            this._savingSession = false;
            if (btnSave) btnSave.disabled = false;
        }
    }
}

function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
}

function escapeAttr(s) {
    return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
