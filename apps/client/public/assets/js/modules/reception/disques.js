/**
 * DISQUES - Module JS
 * Traçabilité des disques shreddés : saisie S/N, type, taille ; détection auto ; enregistrement via API.
 * Même disposition que Entrée (pas d'historique sur cette page).
 * Les disques de la session en cours sont conservés en mémoire au changement d'onglet.
 */

import getLogger from '../../config/Logger.js';
import { createSession } from './disquesApi.js';

const logger = getLogger();

/** Cache des disques de la session en cours (persiste au changement d'onglet) */
let sessionDisksCache = [];

/** Interfaces selon le type : HDD = SATA ou SAS ; SSD = M.2, NVMe ou SATA */
const INTERFACES_HDD = [{ value: 'SATA', label: 'SATA' }, { value: 'SAS', label: 'SAS' }];
const INTERFACES_SSD = [{ value: 'M.2', label: 'M.2' }, { value: 'NVMe', label: 'NVMe' }, { value: 'SATA', label: 'SATA' }];
const INTERFACES_ALL = [{ value: 'SATA', label: 'SATA' }, { value: 'SAS', label: 'SAS' }, { value: 'NVMe', label: 'NVMe' }, { value: 'M.2', label: 'M.2' }];

/** Shred automatique : SSD → Secure E. + Sanitize, HDD → DoD */
function getShredForDisk(disk) {
    const t = (disk.disk_type || '').toUpperCase();
    if (t === 'SSD') return 'Secure E. + Sanitize';
    if (t === 'HDD') return 'DoD';
    return '-';
}

export default class DisquesManager {
    constructor(modalManager) {
        this.modalManager = modalManager;
        this.sessionDisks = Array.isArray(sessionDisksCache) ? [...sessionDisksCache] : [];
        this.lsblkPendingDisks = [];
        this.listeners = [];
        this.init();
    }

    async init() {
        logger.debug('Initialisation DisquesManager');
        this.setupEventListeners();
        this.renderSessionTable();
        this.focusSerialInput();
        logger.debug('DisquesManager prêt');
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
                <td>${i + 1}</td>
                <td>${escapeHtml(d.serial || '-')}</td>
                <td>${escapeHtml(d.marque || '-')}</td>
                <td>${escapeHtml(d.modele || '-')}</td>
                <td>${escapeHtml(d.size || '-')}</td>
                <td>${escapeHtml(d.disk_type || '-')}</td>
                <td>${escapeHtml(d.interface || '-')}</td>
                <td>${escapeHtml(d.shred || '-')}</td>
                <td class="th-action">${editBtn}<button type="button" class="btn btn-sm disques-remove" data-index="${i}" title="Retirer"><i class="fa-solid fa-trash-alt"></i></button></td>
            `;
            tbody.appendChild(tr);
        });
        if (emptyMsg) emptyMsg.style.display = this.sessionDisks.length ? 'none' : 'block';
        if (saveBtn) saveBtn.disabled = this.sessionDisks.length === 0;
    }

    /**
     * Ajoute un disque. disk peut être un objet complet ou (serial, interface, size) pour lsblk.
     * Shred est calculé automatiquement : SSD → Secure E. + Sanitize, HDD → DoD.
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
                shred: '', // calculé ci-dessous
                autoDetected: !!diskOrSerial.autoDetected || !!fromLsblk
            };
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
        }
        d.shred = getShredForDisk(d);
        if (!d.serial) {
            window.app?.showNotification?.('Saisissez un numéro de série', 'warning');
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
        const marqueInput = document.getElementById('disques-marque');
        const modeleInput = document.getElementById('disques-modele');
        const sizeSelect = document.getElementById('disques-size');
        const sizeCustom = document.getElementById('disques-size-custom');
        const diskTypeSelect = document.getElementById('disques-disk-type');
        const interfaceSelect = document.getElementById('disques-interface');

        this.updateInterfaceOptions(diskTypeSelect?.value);

        const addFromForm = () => {
            this.addDisk({
                serial: serialInput?.value?.trim() || '',
                marque: marqueInput?.value?.trim() || '',
                modele: modeleInput?.value?.trim() || '',
                size: this.getEffectiveSize(),
                disk_type: diskTypeSelect?.value || '',
                interface: interfaceSelect?.value || 'SATA'
            });
            if (serialInput) serialInput.value = '';
        };

        if (serialInput) {
            this.addListener(serialInput, 'keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    addFromForm();
                }
            });
        }

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
    }

    openEditDiskModal(index) {
        const d = this.sessionDisks[index];
        if (!d) return;
        this._editingDiskIndex = index;
        const modal = document.getElementById('modal-disques-edit-disk');
        if (!modal) return;
        document.getElementById('disques-edit-serial').value = d.serial || '';
        document.getElementById('disques-edit-marque').value = d.marque || '';
        document.getElementById('disques-edit-modele').value = d.modele || '';
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
        const d = {
            serial,
            marque: (document.getElementById('disques-edit-marque')?.value || '').trim() || '-',
            modele: (document.getElementById('disques-edit-modele')?.value || '').trim() || '-',
            size: size || '-',
            disk_type: (document.getElementById('disques-edit-disk-type')?.value || '').trim() || '-',
            interface: (document.getElementById('disques-edit-interface')?.value || 'SATA').trim(),
            shred: '',
            autoDetected: true
        };
        d.shred = getShredForDisk(d);
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
        const nameEl = document.getElementById('disques-session-name');
        const sessionName = (nameEl && nameEl.value) ? nameEl.value.trim() : '';
        const dateStr = new Date().toISOString().slice(0, 10);
        const btnSave = document.getElementById('disques-btn-save');
        if (btnSave) btnSave.disabled = true;
        try {
            const disksPayload = this.sessionDisks.map(({ autoDetected, ...rest }) => rest);
            await createSession({ name: sessionName || undefined, date: dateStr, disks: disksPayload });
            this.sessionDisks = [];
            this.renderSessionTable();
            if (nameEl) nameEl.value = '';
            window.app?.showNotification?.('Session enregistrée en traçabilité', 'success');
        } catch (err) {
            logger.error('createSession:', err);
            window.app?.showNotification?.(err?.message || 'Erreur lors de l\'enregistrement', 'error');
        } finally {
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
