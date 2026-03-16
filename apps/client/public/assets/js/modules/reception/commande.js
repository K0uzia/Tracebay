/**
 * COMMANDE - Module Réception
 * Liste de produits (dropdown depuis API), lignes quantité/prix/liens, génération PDF côté client.
 */

import getLogger from '../../config/Logger.js';
import api from '../../config/api.js';

const logger = getLogger();

const COMMANDES_PDF_BASE = '/mnt/team/#TEAM/#COMMANDES/';

function escapeHtml(s) {
    if (s == null) return '';
    const div = document.createElement('div');
    div.textContent = String(s);
    return div.innerHTML;
}

export default class CommandeManager {
    constructor(modalManager) {
        this.modalManager = modalManager;
        this.products = [];
        this.listeners = [];
        this.init();
    }

    async init() {
        logger.debug('Initialisation CommandeManager');
        await this.loadProducts();
        this.refreshProductSelects();
        this.setupEventListeners();
        logger.debug('CommandeManager prêt');
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

    async loadProducts() {
        try {
            const res = await api.get('commandes.products.list', { useCache: false });
            if (!res.ok) {
                this.products = [];
                return;
            }
            const data = await res.json();
            this.products = Array.isArray(data) ? data : (data.items || data.products || []);
            this.refreshProductSelects();
        } catch (err) {
            logger.error('Erreur chargement produits commande:', err);
            this.products = [];
        }
    }

    refreshProductSelects() {
        document.querySelectorAll('.commande-select-product').forEach(sel => {
            const current = sel.value;
            const options = '<option value="">-- Produit --</option>' +
                this.products.map(p => {
                    const id = p.id != null ? p.id : p.name;
                    const name = p.name || p.title || String(id);
                    return `<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`;
                }).join('');
            sel.innerHTML = options;
            if (current && Array.from(sel.options).some(o => o.value === current)) sel.value = current;
        });
    }

    getLinesFromTable() {
        const lines = [];
        document.querySelectorAll('#commande-tbody .commande-line').forEach((row, idx) => {
            const select = row.querySelector('.commande-select-product');
            const quantityInput = row.querySelector('.commande-input-quantite');
            const priceInput = row.querySelector('.commande-input-prix');
            const linkInput = row.querySelector('.commande-input-lien');
            const productId = select?.value ?? '';
            const productName = select?.selectedOptions?.[0]?.textContent ?? this.products.find(p => String(p.id) === String(productId) || String(p.name) === productId)?.name ?? productId;
            lines.push({
                num: idx + 1,
                productId,
                produit: productName,
                quantity: (quantityInput?.value ?? '').trim(),
                price: (priceInput?.value ?? '').trim(),
                link: (linkInput?.value ?? '').trim()
            });
        });
        return lines;
    }

    addTableLine() {
        if (this._addingLine) return;
        this._addingLine = true;
        const tbody = document.getElementById('commande-tbody');
        if (!tbody) {
            this._addingLine = false;
            return;
        }
        const lines = tbody.querySelectorAll('.commande-line');
        const nextIndex = lines.length;
        const tr = document.createElement('tr');
        tr.className = 'commande-line';
        tr.dataset.lineIndex = String(nextIndex);
        tr.innerHTML = `
            <td class="col-num">${nextIndex + 1}</td>
            <td class="col-produit">
                <select class="commande-select-product" data-line="${nextIndex}">
                    <option value="">-- Produit --</option>
                    ${this.products.map(p => {
                        const id = p.id != null ? p.id : p.name;
                        const name = p.name || p.title || String(id);
                        return `<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`;
                    }).join('')}
                </select>
            </td>
            <td class="col-quantite">
                <input type="number" min="0" step="1" class="commande-input-quantite" data-line="${nextIndex}" placeholder="0" inputmode="numeric">
            </td>
            <td class="col-prix">
                <input type="number" min="0" step="0.01" class="commande-input-prix" data-line="${nextIndex}" placeholder="0,00" inputmode="decimal">
            </td>
            <td class="col-liens">
                <input type="text" class="commande-input-lien" data-line="${nextIndex}" placeholder="URL ou référence">
            </td>
            <td class="col-actions">
                <button type="button" class="btn-icon btn-remove-line" data-line="${nextIndex}" title="Supprimer la ligne">
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
        const row = document.querySelector(`#commande-tbody .commande-line[data-line-index="${lineIndex}"]`);
        if (row) row.remove();
        this.updateLineNumbers();
        this.updateRemoveButtonsState();
    }

    updateLineNumbers() {
        document.querySelectorAll('#commande-tbody .commande-line').forEach((row, idx) => {
            row.dataset.lineIndex = String(idx);
            const numCell = row.querySelector('.col-num');
            if (numCell) numCell.textContent = idx + 1;
            row.querySelectorAll('[data-line]').forEach(el => el.dataset.line = String(idx));
        });
    }

    updateRemoveButtonsState() {
        const count = document.querySelectorAll('#commande-tbody .commande-line').length;
        document.querySelectorAll('.btn-remove-line').forEach(btn => {
            btn.disabled = count <= 1;
        });
    }

    attachLineListeners(row) {
        const removeBtn = row?.querySelector('.btn-remove-line');
        if (removeBtn) {
            this.addListener(removeBtn, 'click', () => {
                const lineIndex = removeBtn.dataset.line;
                this.removeTableLine(lineIndex);
            });
        }
    }

    setupEventListeners() {
        const btnAddLine = document.getElementById('commande-btn-add-line');
        if (btnAddLine) {
            this.addListener(btnAddLine, 'click', (e) => {
                e.preventDefault();
                e.stopImmediatePropagation();
                this.addTableLine();
            });
        }

        document.querySelectorAll('#commande-tbody .btn-remove-line').forEach(btn => {
            this.addListener(btn, 'click', () => {
                this.removeTableLine(btn.dataset.line);
            });
        });
        this.updateRemoveButtonsState();

        const btnAddProduct = document.getElementById('commande-btn-add-product');
        if (btnAddProduct) this.addListener(btnAddProduct, 'click', () => this.openAddProductModal());

        const btnSavePdf = document.getElementById('commande-btn-save-pdf');
        if (btnSavePdf) this.addListener(btnSavePdf, 'click', () => this.savePdf());

        const modal = document.getElementById('commande-modal-add-product');
        if (modal) {
            const form = document.getElementById('commande-form-add-product');
            if (form) {
                this.addListener(form, 'submit', (e) => {
                    e.preventDefault();
                    this.submitAddProduct();
                });
            }
            modal.querySelectorAll('[data-close-modal]').forEach(btn => {
                this.addListener(btn, 'click', () => {
                    modal.close();
                });
            });
            modal.querySelectorAll('[data-modal-close]').forEach(btn => {
                this.addListener(btn, 'click', () => {
                    modal.close();
                });
            });
        }
    }

    openAddProductModal() {
        const modal = document.getElementById('commande-modal-add-product');
        const input = document.getElementById('commande-new-product-name');
        if (modal && input) {
            input.value = '';
            modal.showModal();
            input.focus();
        }
    }

    async submitAddProduct() {
        if (this._submittingAddProduct) return;
        const input = document.getElementById('commande-new-product-name');
        const modal = document.getElementById('commande-modal-add-product');
        const submitBtn = modal?.querySelector('button[type="submit"]');
        if (!input?.value?.trim()) {
            window.app?.showNotification?.('Saisissez un nom de produit', 'warning');
            return;
        }
        const name = input.value.trim();
        this._submittingAddProduct = true;
        if (submitBtn) submitBtn.disabled = true;
        try {
            const res = await api.post('commandes.products.create', { name });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                window.app?.showNotification?.(errData?.message || `Erreur ${res.status}`, 'error');
                return;
            }
            await this.loadProducts();
            input.value = '';
            modal?.close();
            window.app?.showNotification?.('Produit ajouté', 'success');
        } catch (err) {
            logger.error('Erreur ajout produit:', err);
            window.app?.showNotification?.(err?.message || 'Erreur lors de l\'ajout', 'error');
        } finally {
            this._submittingAddProduct = false;
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    async savePdf() {
        const nameInput = document.getElementById('commande-name');
        const commandeName = (nameInput?.value ?? '').trim();
        if (!commandeName) {
            window.app?.showNotification?.('Saisissez le nom de la commande', 'warning');
            nameInput?.focus();
            return;
        }

        const lines = this.getLinesFromTable();
        const dateStr = new Date().toISOString().slice(0, 10);

        const invoke = window.electron?.invoke || window.electronAPI?.invoke;
        if (!invoke) {
            window.app?.showNotification?.('Génération PDF disponible uniquement dans l\'application desktop', 'warning');
            return;
        }

        try {
            window.app?.showNotification?.('Génération du PDF...', 'info');
            const result = await invoke('generate-commande-pdf', {
                commandeName,
                date: dateStr,
                lines,
                basePath: COMMANDES_PDF_BASE
            });
            if (result?.success && result.pdf_path) {
                window.app?.showNotification?.('PDF enregistré : ' + result.pdf_path, 'success');
                try {
                    const createRes = await api.post('commandes.create', {
                        commande_name: commandeName,
                        date: dateStr,
                        pdf_path: result.pdf_path,
                        lines
                    });
                    if (!createRes.ok) logger.warn('Backend commandes.create:', createRes.status);
                } catch (apiErr) {
                    logger.warn('Backend commandes.create non disponible:', apiErr);
                }
            } else {
                window.app?.showNotification?.(result?.error || 'Échec génération PDF', 'error');
            }
        } catch (err) {
            logger.error('Génération PDF commande:', err);
            window.app?.showNotification?.(err?.message || err?.error || 'Erreur génération PDF', 'error');
        }
    }
}
