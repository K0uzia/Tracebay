/**
 * Gestion des entrées réception (traçabilité) — onglet Entrée
 * Liste GET /api/entrees, création POST /api/entrees
 */

function getServerUrl() {
    return window.app?.connectionConfig?.getServerUrl?.() || window.SERVER_CONFIG?.serverUrl || window.APP_CONFIG?.serverUrl || '';
}

function getAuthHeaders() {
    const token = localStorage.getItem('workspace_jwt') || '';
    return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
}

function escapeHtml(s) {
    if (s == null) return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
}

export default class EntreesManager {
    constructor(containerSelector = '#entrees-reception-container') {
        this.containerSelector = containerSelector;
        this.container = null;
        this.entrees = [];
    }

    init() {
        let root = document.getElementById('entrees-reception-container');
        const recepSection = document.querySelector('.recep-section');
        if (!root && recepSection) {
            root = document.createElement('div');
            root.id = 'entrees-reception-container';
            root.className = 'reception-block';
            recepSection.appendChild(root);
        }
        this.container = root;
        if (this.container) {
            this.loadEntrees();
            this.attachListeners();
        }
    }

    destroy() {
        if (this.container) this.container.innerHTML = '';
        this.container = null;
    }

    async loadEntrees() {
        const url = getServerUrl() + '/api/entrees?limit=100';
        try {
            const res = await fetch(url, { headers: getAuthHeaders() });
            const data = await res.json().catch(() => ({}));
            if (res.status === 401) {
                this.renderError('Connexion requise');
                return;
            }
            if (!res.ok) {
                this.renderError(data.error || `Erreur ${res.status}`);
                return;
            }
            this.entrees = data.data || [];
            this.render();
        } catch (e) {
            this.renderError(e.message || 'Erreur de chargement');
        }
    }

    renderError(message) {
        if (!this.container) return;
        this.container.innerHTML = `
            <h3 class="reception-page-header">Entrées réception</h3>
            <div class="empty-state error-state"><p>${escapeHtml(message)}</p>
                <button type="button" class="btn-primary btn-retry-entrees"><i class="fa-solid fa-sync"></i> Réessayer</button>
            </div>`;
        const btn = this.container.querySelector('.btn-retry-entrees');
        if (btn) btn.addEventListener('click', () => this.loadEntrees());
    }

    render() {
        if (!this.container) return;
        const rows = this.entrees.map(e => `
            <tr>
                <td>${escapeHtml(e.date)}</td>
                <td>${escapeHtml(e.type)}</td>
                <td>${escapeHtml(e.lot_name || '-')}</td>
                <td>${escapeHtml(e.disque_session_name || '-')}</td>
                <td>${escapeHtml(e.description || '-')}</td>
            </tr>`).join('') || '<tr><td colspan="5" class="text-muted">Aucune entrée. Cliquez sur "Nouvelle entrée".</td></tr>';
        this.container.innerHTML = `
            <h3 class="reception-page-header">Entrées réception</h3>
            <p class="text-muted">Journal des entrées (lots, disques, manuelles).</p>
            <div class="toolbar" style="margin-bottom:12px">
                <button type="button" class="btn btn-primary btn-new-entree"><i class="fa-solid fa-plus"></i> Nouvelle entrée</button>
            </div>
            <div class="table-wrap">
                <table class="data-table">
                    <thead><tr><th>Date</th><th>Type</th><th>Lot</th><th>Session disques</th><th>Description</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
        this.attachListeners();
    }

    attachListeners() {
        if (!this.container) return;
        const btn = this.container.querySelector('.btn-new-entree');
        if (btn) btn.addEventListener('click', () => this.openCreateModal());
    }

    openCreateModal() {
        const today = new Date().toISOString().slice(0, 10);
        const content = `
            <div class="form-group">
                <label class="form-label">Date</label>
                <input type="date" class="form-input" id="entree-date" value="${today}">
            </div>
            <div class="form-group">
                <label class="form-label">Type</label>
                <select class="form-input" id="entree-type">
                    <option value="manual">Manuelle</option>
                    <option value="lot">Lot</option>
                    <option value="disque">Disque</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Description (optionnel)</label>
                <input type="text" class="form-input" id="entree-description" placeholder="Commentaire">
            </div>`;
        if (typeof window.modalManager?.open === 'function') {
            window.modalManager.open({
                title: 'Nouvelle entrée',
                body: content,
                primaryLabel: 'Créer',
                onPrimary: () => this.createEntree()
            });
            return;
        }
        const date = document.getElementById('entree-date')?.value || today;
        const type = document.getElementById('entree-type')?.value || 'manual';
        const description = document.getElementById('entree-description')?.value?.trim() || null;
        this.doCreateEntree({ date, type, description });
    }

    createEntree() {
        const date = document.getElementById('entree-date')?.value || new Date().toISOString().slice(0, 10);
        const type = document.getElementById('entree-type')?.value || 'manual';
        const description = document.getElementById('entree-description')?.value?.trim() || null;
        if (window.modalManager?.close) window.modalManager.close();
        this.doCreateEntree({ date, type, description });
    }

    doCreateEntree(payload) {
        const url = getServerUrl() + '/api/entrees';
        fetch(url, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(payload) })
            .then(res => res.json())
            .then(data => {
                if (data.error) { if (window.app?.showNotification) window.app.showNotification(data.error, 'error'); return; }
                if (window.app?.showNotification) window.app.showNotification('Entrée créée', 'success');
                this.loadEntrees();
            })
            .catch(e => { if (window.app?.showNotification) window.app.showNotification(e.message || 'Erreur', 'error'); });
    }
}
