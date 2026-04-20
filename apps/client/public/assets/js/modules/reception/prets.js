/**
 * PRÊTS MATÉRIEL – Réception
 *
 * --- Contrat API backend (autre branche) ---
 *
 * POST /api/prets-materiel
 * Body JSON :
 * {
 *   "reference": string | null,
 *   "date": string (ISO YYYY-MM-DD, = date_debut),
 *   "borrower_type": "personne" | "societe",
 *   "borrower_name": string,
 *   "borrower_contact": string | null,
 *   "date_debut", "date_fin": string (ISO),
 *   "remuneration_gratuit": boolean,
 *   "remuneration_montant": number | null,
 *   "lines": [{
 *     "num"?: number,
 *     "type": "pc" | "ecran" | "clavier" | "souris" | "autres",
 *     "type_detail"?: string (résumé « autres », ex. marque · modèle),
 *     "marque"?, "modele"? (optionnels si type « autres »), "serialNumber"? (vide si « autres » ou périph.),
 *     "quantite": number,
 *     "description"?: string (chaîne vide si non utilisé côté UI)
 *   }],
 *   "pdf_path": string
 * }
 *
 * PDF local (IPC generate-pret-materiel-pdf) : champ optionnel "lot_name" (en-tête {{lotName}} du template).
 *
 * GET /api/prets-materiel/tracabilite …
 * GET|PUT /api/prets-materiel/:id
 */

import getLogger from '../../config/Logger.js';
import api from '../../config/api.js';

const logger = getLogger();

const PRETS_PDF_BASE = '/mnt/team/#TEAM/#TRAÇABILITÉ/prets_materiel';

const TYPE_LABELS = {
    pc: 'PC',
    ecran: 'Écran',
    clavier: 'Clavier',
    souris: 'Souris',
    autres: 'Autres'
};

const MODE_PERIPH = ['ecran', 'clavier', 'souris'];

function formatDateISOFromInput(value) {
    if (!value || typeof value !== 'string') return '';
    const t = value.trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : '';
}

function isPeriphType(typeVal) {
    return MODE_PERIPH.includes(String(typeVal || '').toLowerCase());
}

export default class PretsManager {
    constructor(modalManager) {
        this.modalManager = modalManager;
        this.listeners = [];
        this.init();
    }

    async init() {
        logger.debug('Initialisation PretsManager');
        this.setupEventListeners();
        this.addFirstLineIfEmpty();
        this.syncPayantMontant();
        const dd = document.getElementById('prets-date-debut');
        const df = document.getElementById('prets-date-fin');
        if (dd && !dd.value) dd.value = new Date().toISOString().slice(0, 10);
        if (df && !df.value) {
            const d = new Date();
            d.setMonth(d.getMonth() + 1);
            df.value = d.toISOString().slice(0, 10);
        }
        document.querySelectorAll('#prets-tbody .prets-line').forEach((row) => this.applyTypeModeToRow(row));
        logger.debug('PretsManager prêt');
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

    syncPayantMontant() {
        const payant = document.getElementById('prets-payant');
        const montant = document.getElementById('prets-montant');
        const wrap = document.getElementById('prets-montant-wrap');
        const isPayant = !!payant?.checked;
        if (wrap) wrap.hidden = !isPayant;
        if (!montant) return;
        montant.disabled = !isPayant;
        if (!isPayant) montant.value = '';
    }

    getMetaFromForm() {
        const borrowerType = document.getElementById('prets-borrower-type')?.value || 'personne';
        const lotName = document.getElementById('prets-lot-name')?.value?.trim() || null;
        const reference = document.getElementById('prets-reference')?.value?.trim() || null;
        const borrowerName = document.getElementById('prets-borrower-name')?.value?.trim() || '';
        const borrowerContact = document.getElementById('prets-borrower-contact')?.value?.trim() || null;
        const dateDebut = formatDateISOFromInput(document.getElementById('prets-date-debut')?.value || '');
        const dateFin = formatDateISOFromInput(document.getElementById('prets-date-fin')?.value || '');
        const payant = !!document.getElementById('prets-payant')?.checked;
        const remunerationGratuit = !payant;
        let remunerationMontant = null;
        if (payant) {
            const raw = document.getElementById('prets-montant')?.value;
            const n = raw != null && String(raw).trim() !== '' ? Number(String(raw).replace(',', '.')) : NaN;
            remunerationMontant = Number.isFinite(n) ? n : null;
        }
        return {
            lot_name: lotName,
            reference,
            borrower_type: borrowerType,
            borrower_name: borrowerName,
            borrower_contact: borrowerContact,
            date_debut: dateDebut,
            date_fin: dateFin,
            remuneration_gratuit: remunerationGratuit,
            remuneration_montant: remunerationMontant
        };
    }

    getLinesFromTable() {
        const lines = [];
        document.querySelectorAll('#prets-tbody .prets-line').forEach((row, idx) => {
            const typeSelect = row.querySelector('.prets-select-type');
            const marqueIn = row.querySelector('.prets-in-marque');
            const modeleIn = row.querySelector('.prets-in-modele');
            const snIn = row.querySelector('.prets-in-sn');
            const qtyInput = row.querySelector('.prets-input-qty');

            const typeVal = typeSelect?.value || '';
            const marque = (marqueIn?.value ?? '').trim();
            const modele = (modeleIn?.value ?? '').trim();
            const snRaw = (isPeriphType(typeVal) || typeVal === 'autres') ? '' : (snIn?.value ?? '').trim();
            const qtyRaw = (qtyInput?.value ?? '').trim();
            const quantite = qtyRaw === '' ? 0 : Math.max(0, parseInt(qtyRaw, 10) || 0);

            const autresParts = typeVal === 'autres' ? [marque, modele].filter(Boolean) : [];
            const typeDisplay = typeVal === 'autres'
                ? (autresParts.length ? autresParts.join(' · ') : TYPE_LABELS.autres)
                : (TYPE_LABELS[typeVal] || typeSelect?.selectedOptions?.[0]?.textContent?.trim() || typeVal || '-');

            const typeDetailAutres = typeVal === 'autres' ? (autresParts.join(' · ') || '') : '';

            lines.push({
                num: idx + 1,
                type: typeVal,
                type_detail: typeDetailAutres,
                typeDisplay,
                marque,
                modele,
                serialNumber: typeVal === 'autres' || isPeriphType(typeVal) ? '' : snRaw,
                marqueName: marque,
                modeleName: modele,
                quantite
            });
        });
        return lines;
    }

    addTableLine() {
        if (this._addingLine) return;
        this._addingLine = true;
        const tbody = document.getElementById('prets-tbody');
        if (!tbody) {
            this._addingLine = false;
            return;
        }
        const lines = tbody.querySelectorAll('.prets-line');
        const nextIndex = lines.length;
        const tr = document.createElement('tr');
        tr.className = 'prets-line';
        tr.dataset.lineIndex = String(nextIndex);
        tr.innerHTML = `
            <td class="col-num" data-label="N°">${nextIndex + 1}</td>
            <td class="col-type" data-label="Type">
                <div class="type-cell-wrapper">
                    <select class="prets-select-type" name="type">
                        <option value="">Type…</option>
                        <option value="pc">PC</option>
                        <option value="ecran">Écran</option>
                        <option value="clavier">Clavier</option>
                        <option value="souris">Souris</option>
                        <option value="autres">Autres</option>
                    </select>
                </div>
            </td>
            <td class="col-marque" data-label="Marque"><input type="text" class="prets-in-marque lot-config__input" placeholder="Marque" maxlength="120" autocomplete="off"></td>
            <td class="col-modele" data-label="Modèle"><input type="text" class="prets-in-modele lot-config__input" placeholder="Modèle" maxlength="120" autocomplete="off"></td>
            <td class="col-sn" data-label="S/N">
                <input type="text" class="prets-in-sn lot-config__input" placeholder="N° série" maxlength="120" autocomplete="off">
            </td>
            <td class="col-quantite" data-label="Qté">
                <input type="number" class="prets-input-qty" min="1" step="1" value="1" title="Quantité">
            </td>
            <td class="col-action" data-label="">
                <button type="button" class="btn-remove-line" title="Supprimer la ligne" aria-label="Supprimer la ligne"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
        this.wireLine(tr);
        this.applyTypeModeToRow(tr);
        this.renumberLines();
        this.updateRemoveButtons();
        this._addingLine = false;
    }

    wireLine(row) {
        const typeSelect = row?.querySelector('.prets-select-type');
        if (typeSelect) {
            typeSelect.addEventListener('change', () => {
                this.applyTypeModeToRow(row);
            });
        }
        const btn = row?.querySelector('.btn-remove-line');
        if (btn) {
            btn.addEventListener('click', () => {
                row.remove();
                this.renumberLines();
                this.updateRemoveButtons();
            });
        }
    }

    applyTypeModeToRow(row) {
        if (!row) return;
        const typeVal = row.querySelector('.prets-select-type')?.value || '';
        const tdMarque = row.querySelector('.col-marque');
        const tdModele = row.querySelector('.col-modele');
        const tdSn = row.querySelector('.col-sn');
        const marqueIn = row.querySelector('.prets-in-marque');
        const modeleIn = row.querySelector('.prets-in-modele');
        const snIn = row.querySelector('.prets-in-sn');

        [tdMarque, tdModele, tdSn].forEach((td) => {
            if (!td) return;
            td.hidden = false;
            td.style.removeProperty('display');
        });

        if (typeVal === 'autres') {
            if (marqueIn) {
                marqueIn.placeholder = 'Marque (optionnel)';
                marqueIn.disabled = false;
            }
            if (modeleIn) {
                modeleIn.placeholder = 'Modèle (optionnel)';
                modeleIn.disabled = false;
            }
        } else if (isPeriphType(typeVal)) {
            if (marqueIn) {
                marqueIn.placeholder = 'Marque';
                marqueIn.disabled = false;
            }
            if (modeleIn) {
                modeleIn.placeholder = 'Modèle';
                modeleIn.disabled = false;
            }
        } else {
            if (marqueIn) {
                marqueIn.placeholder = 'Marque';
                marqueIn.disabled = false;
            }
            if (modeleIn) {
                modeleIn.placeholder = 'Modèle';
                modeleIn.disabled = false;
            }
        }

        const snBlocked = typeVal !== 'pc';
        if (tdSn) tdSn.classList.toggle('prets-td--blocked', snBlocked);
        if (snIn) {
            if (snBlocked) {
                snIn.value = '';
                snIn.disabled = true;
            } else {
                snIn.disabled = false;
            }
        }
    }

    renumberLines() {
        document.querySelectorAll('#prets-tbody .prets-line').forEach((row, idx) => {
            row.dataset.lineIndex = String(idx);
            const numCell = row.querySelector('.col-num');
            if (numCell) numCell.textContent = String(idx + 1);
        });
    }

    updateRemoveButtons() {
        const count = document.querySelectorAll('#prets-tbody .prets-line').length;
        document.querySelectorAll('#prets-tbody .btn-remove-line').forEach(btn => {
            btn.disabled = count <= 1;
        });
    }

    addFirstLineIfEmpty() {
        const tbody = document.getElementById('prets-tbody');
        if (tbody && tbody.querySelectorAll('.prets-line').length === 0) {
            this.addTableLine();
        }
    }

    setupEventListeners() {
        const btnAdd = document.getElementById('prets-btn-add-line');
        const btnSave = document.getElementById('prets-btn-save-pdf');
        const payantCb = document.getElementById('prets-payant');
        this.addListener(btnAdd, 'click', () => this.addTableLine());
        this.addListener(btnSave, 'click', () => this.savePdf());
        this.addListener(payantCb, 'change', () => this.syncPayantMontant());

        document.querySelectorAll('#prets-tbody .prets-line').forEach(row => this.wireLine(row));
        this.updateRemoveButtons();
    }

    validate(meta, lines) {
        if (!meta.borrower_name) {
            window.app?.showNotification?.('Indiquez le nom ou la raison sociale de l’emprunteur', 'warning');
            return false;
        }
        if (!meta.date_debut || !meta.date_fin) {
            window.app?.showNotification?.('Renseignez les dates de début et de fin de location', 'warning');
            return false;
        }
        if (meta.date_fin < meta.date_debut) {
            window.app?.showNotification?.('La date de fin doit être postérieure ou égale au début', 'warning');
            return false;
        }
        if (!meta.remuneration_gratuit) {
            if (meta.remuneration_montant == null || meta.remuneration_montant <= 0) {
                window.app?.showNotification?.('Indiquez un montant supérieur à 0 pour un prêt payant', 'warning');
                return false;
            }
        }
        if (lines.length === 0) {
            window.app?.showNotification?.('Ajoutez au moins une ligne de matériel', 'warning');
            return false;
        }
        for (const line of lines) {
            if (!line.type) {
                window.app?.showNotification?.('Chaque ligne doit avoir un type de matériel', 'warning');
                return false;
            }
            if (line.type === 'pc') {
                if (!(line.marque || '').trim() || !(line.modele || '').trim()) {
                    window.app?.showNotification?.('PC : renseignez marque et modèle', 'warning');
                    return false;
                }
                if (!(line.serialNumber || '').trim()) {
                    window.app?.showNotification?.('PC : renseignez le numéro de série', 'warning');
                    return false;
                }
            } else if (isPeriphType(line.type)) {
                if (!(line.marque || '').trim() || !(line.modele || '').trim()) {
                    window.app?.showNotification?.('Écran / clavier / souris : renseignez marque et modèle', 'warning');
                    return false;
                }
            }
            if (!line.quantite || line.quantite < 1) {
                window.app?.showNotification?.('Chaque ligne doit avoir une quantité d’au moins 1', 'warning');
                return false;
            }
        }
        return true;
    }

    buildServerLines(lines) {
        return lines.map((l, i) => ({
            num: i + 1,
            type: l.type,
            type_detail: l.type_detail || '',
            marque: l.marque || '',
            modele: l.modele || '',
            serialNumber: (isPeriphType(l.type) || l.type === 'autres') ? '' : (l.serialNumber || ''),
            quantite: l.quantite,
            description: ''
        }));
    }

    lineForPdf(l) {
        const marqueStr = String(l.marque ?? l.marqueName ?? '').trim();
        const modeleStr = String(l.modele ?? l.modeleName ?? '').trim();
        const typeD = (l.type === 'autres')
            ? ([marqueStr, modeleStr].filter(Boolean).join(' · ') || String(l.type_detail || '').trim() || TYPE_LABELS.autres)
            : (TYPE_LABELS[l.type] || l.type || '-');
        return {
            num: l.num,
            typeDisplay: typeD,
            marqueName: marqueStr || '—',
            modeleName: modeleStr || '—',
            serialNumber: (l.type === 'autres' || isPeriphType(l.type)) ? '—' : (String(l.serialNumber || '').trim() || '—'),
            quantite: l.quantite
        };
    }

    async savePdf() {
        const meta = this.getMetaFromForm();
        const lines = this.getLinesFromTable();
        if (!this.validate(meta, lines)) return;

        const invoke = window.electron?.invoke || window.electronAPI?.invoke;
        if (!invoke) {
            window.app?.showNotification?.('Génération PDF disponible uniquement dans l’application desktop', 'warning');
            return;
        }

        const dateStr = meta.date_debut;
        const ipcLines = lines.map((l) => this.lineForPdf(l));

        const payload = {
            lot_name: meta.lot_name || '',
            reference: meta.reference || '',
            date: dateStr,
            borrower_type: meta.borrower_type,
            borrower_name: meta.borrower_name,
            borrower_contact: meta.borrower_contact || '',
            date_debut: meta.date_debut,
            date_fin: meta.date_fin,
            remuneration_gratuit: meta.remuneration_gratuit,
            remuneration_montant: meta.remuneration_gratuit ? null : meta.remuneration_montant,
            lines: ipcLines,
            basePath: PRETS_PDF_BASE
        };

        const serverBody = {
            reference: meta.reference,
            date: dateStr,
            borrower_type: meta.borrower_type,
            borrower_name: meta.borrower_name,
            borrower_contact: meta.borrower_contact,
            date_debut: meta.date_debut,
            date_fin: meta.date_fin,
            remuneration_gratuit: meta.remuneration_gratuit,
            remuneration_montant: meta.remuneration_gratuit ? null : meta.remuneration_montant,
            lines: this.buildServerLines(lines)
        };

        try {
            window.app?.showNotification?.('Génération du PDF…', 'info');
            const result = await invoke('generate-pret-materiel-pdf', payload);
            if (result?.success && result.pdf_path) {
                window.app?.showNotification?.('Fiche enregistrée : ' + result.pdf_path, 'success');
                try {
                    const createRes = await api.post('pretsMateriel.create', {
                        ...serverBody,
                        pdf_path: result.pdf_path
                    });
                    if (!createRes.ok) {
                        let detail = `HTTP ${createRes.status}`;
                        try {
                            const errData = await createRes.json();
                            detail = errData?.message || errData?.error || detail;
                        } catch (_) { /* keep */ }
                        logger.warn('Backend pretsMateriel.create:', createRes.status, detail);
                        window.app?.showNotification?.(`PDF local créé mais enregistrement serveur impossible (${detail})`, 'warning');
                    }
                } catch (apiErr) {
                    logger.warn('Backend pretsMateriel.create non disponible:', apiErr);
                    window.app?.showNotification?.(`PDF local créé mais serveur indisponible (${apiErr?.message || 'erreur inconnue'})`, 'warning');
                }
            } else {
                window.app?.showNotification?.(result?.error || 'Échec génération PDF', 'error');
            }
        } catch (err) {
            logger.error('Génération PDF prêts:', err);
            window.app?.showNotification?.(err?.message || err?.error || 'Erreur génération PDF', 'error');
        }
    }
}
