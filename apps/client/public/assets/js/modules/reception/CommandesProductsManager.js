/**
 * Gestion des produits de commande (Réception > Commande)
 * Liste, ajout, modification, suppression via API /api/commandes/products
 */

function getServerUrl() {
    return window.app?.connectionConfig?.getServerUrl?.() || window.SERVER_CONFIG?.serverUrl || window.APP_CONFIG?.serverUrl || '';
}

function getAuthHeaders() {
    const token = localStorage.getItem('workspace_jwt') || '';
    return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
}

export default class CommandesProductsManager {
    constructor(containerSelector = '#commande-products-root') {
        this.containerSelector = containerSelector;
        this.container = null;
        this.products = [];
    }

    init() {
        const recepSection = document.querySelector('.recep-section');
        if (!recepSection) return;
        let root = document.getElementById('commande-products-root');
        if (!root) {
            root = document.createElement('div');
            root.id = 'commande-products-root';
            recepSection.appendChild(root);
        }
        this.container = root;
        this.loadProducts();
        this.attachListeners();
    }

    destroy() {
        if (this.container) this.container.innerHTML = '';
        this.container = null;
    }

    async loadProducts() {
        const url = getServerUrl() + '/api/commandes/products';
        try {
            const res = await fetch(url, { headers: getAuthHeaders() });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                this.renderError(data.error || `Erreur ${res.status}`);
                return;
            }
            this.products = data.items || [];
            this.render();
        } catch (e) {
            this.renderError(e.message || 'Erreur de chargement');
        }
    }

    renderError(message) {
        if (!this.container) return;
        this.container.innerHTML = `
            <div class="reception-block">
                <h2 class="reception-page-header">Produits de commande</h2>
                <div class="empty-state error-state"><p>${String(message).replace(/</g, '&lt;')}</p>
                    <button type="button" class="btn-primary btn-retry-products"><i class="fa-solid fa-sync"></i> Réessayer</button>
                </div>
            </div>`;
        const btn = this.container.querySelector('.btn-retry-products');
        if (btn) btn.addEventListener('click', () => this.loadProducts());
    }

    render() {
        if (!this.container) return;
        const rows = this.products.map(p => `
            <tr>
                <td>${escapeHtml(p.name)}</td>
                <td class="actions-cell">
                    <button type="button" class="btn-edit-product btn-sm" data-id="${p.id}" data-name="${escapeHtml(p.name)}" title="Modifier"><i class="fa-solid fa-pen"></i></button>
                    <button type="button" class="btn-delete-product btn-sm" data-id="${p.id}" data-name="${escapeHtml(p.name)}" title="Supprimer"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>`).join('') || '<tr><td colspan="2" class="text-muted">Aucun produit. Cliquez sur "Ajouter un produit".</td></tr>';
        this.container.innerHTML = `
            <div class="reception-block">
                <h2 class="reception-page-header">Produits de commande</h2>
                <p class="text-muted">Liste des produits proposés dans les commandes.</p>
                <div class="toolbar" style="margin-bottom:12px">
                    <button type="button" class="btn btn-primary btn-add-product"><i class="fa-solid fa-plus"></i> Ajouter un produit</button>
                </div>
                <div class="table-wrap">
                    <table class="data-table">
                        <thead><tr><th>Nom</th><th></th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>`;
        this.attachListeners();
    }

    attachListeners() {
        if (!this.container) return;
        const addBtn = this.container.querySelector('.btn-add-product');
        if (addBtn) addBtn.addEventListener('click', () => this.openModal());
        this.container.querySelectorAll('.btn-edit-product').forEach(btn => {
            btn.addEventListener('click', () => this.openModal(btn.dataset.id, btn.dataset.name));
        });
        this.container.querySelectorAll('.btn-delete-product').forEach(btn => {
            btn.addEventListener('click', () => this.deleteProduct(btn.dataset.id, btn.dataset.name));
        });
    }

    openModal(id = null, name = '') {
        const isEdit = id != null;
        const title = isEdit ? 'Modifier le produit' : 'Ajouter un produit';
        const content = `
            <div class="form-group">
                <label class="form-label">Nom du produit</label>
                <input type="text" class="form-input" id="product-name-input" value="${escapeHtml(name)}" placeholder="Ex: Disque dur 1 To">
            </div>`;
        if (typeof window.modalManager?.open === 'function') {
            window.modalManager.open({ title, body: content, primaryLabel: isEdit ? 'Enregistrer' : 'Ajouter', onPrimary: () => this.saveProduct(id); });
            requestAnimationFrame(() => {
                const input = document.getElementById('product-name-input');
                if (input) input.focus();
            });
            return;
        }
        if (typeof window.app?.showNotification === 'function') window.app.showNotification('Modal non disponible', 'error');
        const val = prompt('Nom du produit', name);
        if (val != null && val.trim()) this.saveProduct(id, val.trim());
    }

    saveProduct(id, nameFromPrompt) {
        const name = nameFromPrompt != null ? nameFromPrompt : document.getElementById('product-name-input')?.value?.trim();
        if (!name) {
            if (window.app?.showNotification) window.app.showNotification('Nom requis', 'error');
            return;
        }
        const url = getServerUrl() + (id ? `/api/commandes/products/${id}` : '/api/commandes/products');
        const method = id ? 'PUT' : 'POST';
        fetch(url, { method, headers: getAuthHeaders(), body: JSON.stringify({ name }) })
            .then(res => res.json())
            .then(data => {
                if (data.error) { if (window.app?.showNotification) window.app.showNotification(data.error, 'error'); return; }
                if (window.app?.showNotification) window.app.showNotification(id ? 'Produit mis à jour' : 'Produit ajouté', 'success');
                if (window.modalManager?.close) window.modalManager.close();
                this.loadProducts();
            })
            .catch(e => { if (window.app?.showNotification) window.app.showNotification(e.message || 'Erreur', 'error'); });
    }

    deleteProduct(id, name) {
        if (!confirm(`Supprimer le produit « ${name} » ?`)) return;
        const url = getServerUrl() + `/api/commandes/products/${id}`;
        fetch(url, { method: 'DELETE', headers: getAuthHeaders() })
            .then(res => res.json().catch(() => ({})))
            .then(data => {
                if (data.error) { if (window.app?.showNotification) window.app.showNotification(data.error, 'error'); return; }
                if (window.app?.showNotification) window.app.showNotification('Produit supprimé', 'success');
                this.loadProducts();
            })
            .catch(e => { if (window.app?.showNotification) window.app.showNotification(e.message || 'Erreur', 'error'); });
    }
}

function escapeHtml(s) {
    if (s == null) return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
}
