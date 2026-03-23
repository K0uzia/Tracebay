/**
 * TRAÇABILITÉ - MODULE JS
 * Affiche tous les lots avec accès aux PDFs et email
 */

import api from '../../config/api.js';
import getLogger from '../../config/Logger.js';
import { loadLotsWithItems } from './lotsApi.js';
import { getSessions, getSession, getSessionPdfUrl, updateSession } from './disquesApi.js';
const logger = getLogger();


export default class TracabiliteManager {
    constructor(modalManager) {
        this.modalManager = modalManager;
        this.lots = [];
        this.sessionsDisques = [];
        this.commandes = [];
        this.dons = [];
        this.apiIssues = [];
        this.currentEmailLotId = null;
        this.currentEmailSessionId = null;
        this.init();
    }

    async init() {
        logger.debug('🚀 Initialisation TracabiliteManager');
        this.fillYearSelect();
        await this.loadLots();
        this.setupEventListeners();
        logger.debug('✅ TracabiliteManager prêt');
    }

    /**
     * Remplir le select Année (année en cours par défaut)
     */
    fillYearSelect() {
        const select = document.getElementById('filter-tracabilite-year');
        if (!select) return;
        const currentYear = new Date().getFullYear();
        const startYear = currentYear - 10;
        select.innerHTML = '';
        for (let y = currentYear; y >= startYear; y--) {
            const opt = document.createElement('option');
            opt.value = String(y);
            opt.textContent = String(y);
            if (y === currentYear) opt.selected = true;
            select.appendChild(opt);
        }
    }

    /**
     * Charger tous les lots + sessions disques + commandes + dons
     */
    async loadLots() {
        try {
            this.apiIssues = [];
            const serverUrl = api.getServerUrl();
            const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('workspace_jwt') || ''}` };
            const endpointCommandes = (window.SERVER_CONFIG?.getEndpoint?.('commandes.tracabilite')) || '/api/commandes/tracabilite';
            const endpointDons = (window.SERVER_CONFIG?.getEndpoint?.('dons.tracabilite')) || '/api/dons/tracabilite';

            const [lots, sessions, commandesRes, donsRes] = await Promise.all([
                loadLotsWithItems({ status: 'all' }),
                getSessions().catch(() => []),
                fetch(`${serverUrl}${endpointCommandes.startsWith('/') ? endpointCommandes : '/' + endpointCommandes}`, { method: 'GET', headers }).catch(() => ({ ok: false })),
                fetch(`${serverUrl}${endpointDons.startsWith('/') ? endpointDons : '/' + endpointDons}`, { method: 'GET', headers }).catch(() => ({ ok: false }))
            ]);

            this.lots = (lots || []).sort((a, b) =>
                new Date(b.created_at) - new Date(a.created_at)
            );
            this.sessionsDisques = (sessions || []).sort((a, b) => {
                const da = a.date || (a.created_at || '').slice(0, 10);
                const db = b.date || (b.created_at || '').slice(0, 10);
                return new Date(db) - new Date(da);
            });

            if (commandesRes.ok) {
                try {
                    const data = await commandesRes.json();
                    this.commandes = this.extractListFromApiPayload(data, ['commandes', 'items', 'data', 'results', 'rows']);
                    this.commandes.sort((a, b) => this.parseFlexibleDate(b.date || b.created_at) - this.parseFlexibleDate(a.date || a.created_at));
                } catch (_) { this.commandes = []; }
            } else {
                this.commandes = [];
                this.apiIssues.push({
                    module: 'commandes',
                    endpoint: endpointCommandes,
                    status: commandesRes?.status || 'N/A'
                });
            }
            if (donsRes.ok) {
                try {
                    const data = await donsRes.json();
                    this.dons = this.extractListFromApiPayload(data, ['dons', 'items', 'data', 'results', 'rows']);
                    this.dons.sort((a, b) => this.parseFlexibleDate(b.date || b.created_at) - this.parseFlexibleDate(a.date || a.created_at));
                } catch (_) { this.dons = []; }
            } else {
                this.dons = [];
                this.apiIssues.push({
                    module: 'dons',
                    endpoint: endpointDons,
                    status: donsRes?.status || 'N/A'
                });
            }

            logger.info('📦 Traçabilité : ' + this.lots.length + ' lot(s), ' + this.sessionsDisques.length + ' disque(s), ' + this.commandes.length + ' commande(s), ' + this.dons.length + ' don(s)');
            this.renderTable();
        } catch (error) {
            logger.error('❌ Erreur chargement lots:', error);
            this.lots = [];
            this.sessionsDisques = [];
            this.commandes = [];
            this.dons = [];
            this.apiIssues = [];
            this.renderLotsError(error);
        }
    }

    /**
     * Afficher un bloc d'erreur avec bouton Réessayer
     */
    renderLotsError(error) {
        const container = document.getElementById('tracabilite-grouped');
        if (!container) return;
        const message = error && error.message ? error.message : 'Erreur inconnue';
        container.innerHTML = `
            <div class="empty-state error-state">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <p>Erreur de chargement</p>
                <small>${String(message).replace(/</g, '&lt;')}</small>
                <button type="button" class="btn-retry-lots" id="btn-retry-lots-tracabilite">
                    <i class="fa-solid fa-sync"></i> Réessayer
                </button>
            </div>
        `;
        const btn = document.getElementById('btn-retry-lots-tracabilite');
        if (btn) btn.addEventListener('click', () => this.loadLots());
    }

    /**
     * Afficher les lots groupés par année et mois
     */
    renderTable() {
        const container = document.getElementById('tracabilite-grouped');
        if (!container) return;
        const issuesHtml = this.renderApiIssuesBanner();

        // Filtrer pour les lots terminés : soit tous les items ont état + technicien, soit le backend a marqué le lot (status + finished_at)
        const finishedLots = this.lots.filter(lot => {
            const items = Array.isArray(lot.items) ? lot.items : [];
            const total = lot.total !== undefined ? lot.total : items.length;
            
            let pending = lot.pending !== undefined ? lot.pending : 0;
            if (pending === 0 && items.length > 0) {
                pending = items.filter(item => 
                    !item.state || item.state.trim() === '' || 
                    !item.technician || item.technician.trim() === ''
                ).length;
            }
            
            const isFinishedFromItems = total > 0 && pending === 0 && items.length > 0 && items.every(item => 
                item.state && item.state.trim() !== '' && 
                item.technician && item.technician.trim() !== ''
            );
            const isFinishedFromBackend = lot.status === 'finished' && lot.finished_at != null && lot.finished_at !== '';
            const isFinished = isFinishedFromItems || isFinishedFromBackend;
            
            logger.debug(`Lot ${lot.id} - isFinished:`, { 
                isFinished, 
                total, 
                pending, 
                itemsCount: items.length, 
                finished_at: lot.finished_at,
                status: lot.status
            });
            return isFinished;
        });
        
        logger.debug(`📦 Traçabilité: ${this.lots.length} lots chargés, ${finishedLots.length} lots terminés trouvés`);

        // Filtrer par année sélectionnée (défaut : année en cours)
        const yearSelect = document.getElementById('filter-tracabilite-year');
        const selectedYear = yearSelect ? yearSelect.value : String(new Date().getFullYear());
        const lotsForYear = finishedLots.filter(lot => {
            const date = new Date(lot.finished_at || lot.created_at);
            return date.getFullYear().toString() === selectedYear;
        });
        const sessionsForYear = this.sessionsDisques.filter(s => {
            const dateStr = s.date || (s.created_at || '').slice(0, 10);
            const y = this.parseFlexibleDate(dateStr).getFullYear().toString();
            return y === selectedYear;
        });
        const commandesForYear = this.commandes.filter(c => {
            const dateStr = c.date || (c.created_at || '').slice(0, 10);
            const y = this.parseFlexibleDate(dateStr).getFullYear().toString();
            return y === selectedYear;
        });
        const donsForYear = this.dons.filter(d => {
            const dateStr = d.date || (d.created_at || '').slice(0, 10);
            const y = this.parseFlexibleDate(dateStr).getFullYear().toString();
            return y === selectedYear;
        });

        const typeFilter = (document.getElementById('filter-tracabilite-type')?.value) || 'tous';
        const showLots = typeFilter === 'tous' || typeFilter === 'lots';
        const showDisques = typeFilter === 'tous' || typeFilter === 'disques';
        const showCommandes = typeFilter === 'tous' || typeFilter === 'commandes';
        const showDons = typeFilter === 'tous' || typeFilter === 'dons';
        const totalItems = (showLots ? lotsForYear.length : 0) + (showDisques ? sessionsForYear.length : 0) + (showCommandes ? commandesForYear.length : 0) + (showDons ? donsForYear.length : 0);
        if (totalItems === 0) {
            container.innerHTML = `
                ${issuesHtml}
                <div class="empty-state">
                    <i class="fa-solid fa-inbox"></i>
                    <p>Aucun élément pour ${selectedYear}${typeFilter !== 'tous' ? ' (filtre : ' + typeFilter + ')' : ''}</p>
                    <small>Changez d'année ou de type pour afficher les documents</small>
                </div>
            `;
            return;
        }

        // Grouper par année et mois
        const groupedLots = this.groupByYearMonth(lotsForYear);
        const groupedSessions = this.groupByYearMonthSessions(sessionsForYear);
        const groupedCommandes = this.groupByYearMonthCommandes(commandesForYear);
        const groupedDons = this.groupByYearMonthDons(donsForYear);
        const allMonthsByYear = {};
        for (const [year, months] of Object.entries(groupedLots)) {
            if (!allMonthsByYear[year]) allMonthsByYear[year] = {};
            Object.keys(months).forEach(m => { allMonthsByYear[year][m] = true; });
        }
        for (const [year, months] of Object.entries(groupedSessions)) {
            if (!allMonthsByYear[year]) allMonthsByYear[year] = {};
            Object.keys(months).forEach(m => { allMonthsByYear[year][m] = true; });
        }
        for (const [year, months] of Object.entries(groupedCommandes)) {
            if (!allMonthsByYear[year]) allMonthsByYear[year] = {};
            Object.keys(months).forEach(m => { allMonthsByYear[year][m] = true; });
        }
        for (const [year, months] of Object.entries(groupedDons)) {
            if (!allMonthsByYear[year]) allMonthsByYear[year] = {};
            Object.keys(months).forEach(m => { allMonthsByYear[year][m] = true; });
        }

        let html = '';
        for (const [year, monthsSet] of Object.entries(allMonthsByYear)) {
            const months = Object.keys(monthsSet).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
            html += `<div class="year-section" data-year="${year}">
                <div class="year-header">
                    <h2><i class="fa-solid fa-calendar"></i> ${year}</h2>
                </div>`;

            for (const month of months) {
                const lots = (groupedLots[year] && groupedLots[year][month]) || [];
                const sessions = (groupedSessions[year] && groupedSessions[year][month]) || [];
                const commandes = (groupedCommandes[year] && groupedCommandes[year][month]) || [];
                const dons = (groupedDons[year] && groupedDons[year][month]) || [];
                const count = (showLots ? lots.length : 0) + (showDisques ? sessions.length : 0) + (showCommandes ? commandes.length : 0) + (showDons ? dons.length : 0);
                html += `<div class="month-section" data-month="${month}">
                    <div class="month-header">
                        <h3><i class="fa-solid fa-calendar-days"></i> ${this.getMonthName(parseInt(month))} (${count} élément${count !== 1 ? 's' : ''})</h3>
                    </div>
                    <div class="lots-list">`;

                if (showLots) { for (const lot of lots) { html += this.createLotCard(lot); } }
                if (showDisques) { for (const session of sessions) { html += this.createDisqueCard(session); } }
                if (showCommandes) { for (const cmd of commandes) { html += this.createCommandeCard(cmd); } }
                if (showDons) { for (const don of dons) { html += this.createDonCard(don); } }

                html += `</div></div>`;
            }
            html += `</div>`;
        }

        container.innerHTML = `${issuesHtml}${html}`;
        this.attachRowEventListeners();
    }

    renderApiIssuesBanner() {
        if (!Array.isArray(this.apiIssues) || this.apiIssues.length === 0) return '';
        const rows = this.apiIssues.map(i =>
            `<li><strong>${this.escapeHtml(i.module)}</strong> : ${this.escapeHtml(String(i.endpoint))} (HTTP ${this.escapeHtml(String(i.status))})</li>`
        ).join('');
        return `
            <div class="empty-state error-state" style="margin-bottom:1rem;">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <p>Routes API manquantes ou indisponibles</p>
                <small>Les données ci-dessous ne peuvent pas être chargées tant que ces endpoints ne répondent pas.</small>
                <ul style="margin-top:.5rem;text-align:left;display:inline-block;">${rows}</ul>
            </div>
        `;
    }

    /**
     * Grouper les lots par année et mois
     */
    groupByYearMonth(lots) {
        const grouped = {};
        lots.forEach(lot => {
            const date = new Date(lot.finished_at || lot.created_at);
            const year = date.getFullYear().toString();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            if (!grouped[year]) grouped[year] = {};
            if (!grouped[year][month]) grouped[year][month] = [];
            grouped[year][month].push(lot);
        });
        return grouped;
    }

    /**
     * Grouper les sessions disques par année et mois (même règle que les lots)
     */
    groupByYearMonthSessions(sessions) {
        const grouped = {};
        sessions.forEach(s => {
            const dateStr = s.date || (s.created_at || '').slice(0, 10);
            const date = dateStr ? new Date(dateStr) : new Date();
            const year = date.getFullYear().toString();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            if (!grouped[year]) grouped[year] = {};
            if (!grouped[year][month]) grouped[year][month] = [];
            grouped[year][month].push(s);
        });
        return grouped;
    }

    /**
     * Grouper les commandes par année et mois
     */
    groupByYearMonthCommandes(commandes) {
        const grouped = {};
        (commandes || []).forEach(c => {
            const dateStr = (c.date || (c.created_at || '')).toString().slice(0, 10);
            const date = this.parseFlexibleDate(dateStr);
            const year = date.getFullYear().toString();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            if (!grouped[year]) grouped[year] = {};
            if (!grouped[year][month]) grouped[year][month] = [];
            grouped[year][month].push(c);
        });
        return grouped;
    }

    /**
     * Grouper les dons par année et mois
     */
    groupByYearMonthDons(dons) {
        const grouped = {};
        (dons || []).forEach(d => {
            const dateStr = (d.date || (d.created_at || '')).toString().slice(0, 10);
            const date = this.parseFlexibleDate(dateStr);
            const year = date.getFullYear().toString();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            if (!grouped[year]) grouped[year] = {};
            if (!grouped[year][month]) grouped[year][month] = [];
            grouped[year][month].push(d);
        });
        return grouped;
    }

    parseFlexibleDate(raw) {
        const value = String(raw || '').trim();
        if (!value) return new Date(0);
        if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
            const d = new Date(value.slice(0, 10));
            if (!Number.isNaN(d.getTime())) return d;
        }
        const fr = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (fr) {
            const [, dd, mm, yyyy] = fr;
            const d = new Date(`${yyyy}-${mm}-${dd}`);
            if (!Number.isNaN(d.getTime())) return d;
        }
        const fallback = new Date(value);
        return Number.isNaN(fallback.getTime()) ? new Date(0) : fallback;
    }

    extractListFromApiPayload(payload, keys = []) {
        if (Array.isArray(payload)) return payload;
        if (!payload || typeof payload !== 'object') return [];
        for (const key of keys) {
            if (Array.isArray(payload[key])) return payload[key];
        }
        if (payload.data && typeof payload.data === 'object') {
            for (const key of keys) {
                if (Array.isArray(payload.data[key])) return payload.data[key];
            }
            if (Array.isArray(payload.data)) return payload.data;
        }
        return [];
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
     * Créer une carte pour une session disques (même style que lot, accès PDF, régénérer, email)
     */
    createDisqueCard(session) {
        const count = Array.isArray(session.disks) ? session.disks.length : (session.disk_count ?? 0);
        const hasPdf = session.pdf_path != null && session.pdf_path !== '';
        const sessionName = (session.name || '').trim() || 'Lot disques';
        const rawDate = session.date ?? session.created_at ?? '';
        const dateOnly = typeof rawDate === 'string' ? rawDate.slice(0, 10) : (rawDate ? new Date(rawDate).toISOString().slice(0, 10) : '');
        const dateFormatted = dateOnly && /^\d{4}-\d{2}-\d{2}$/.test(dateOnly) ? this.formatDateTime(dateOnly + 'T12:00:00') : '-';
        const basePdfUrl = getSessionPdfUrl(session.id);
        const pdfUrl = `${basePdfUrl}${basePdfUrl.includes('?') ? '&' : '?'}v=${Date.now()}`;
        const isRecovered = session.recovered_at != null && session.recovered_at !== '';

        return `
            <div class="lot-card lot-card-disque" data-session-id="${session.id}">
                <div class="lot-card-header">
                    <div class="lot-card-title">
                        <h4><i class="fa-solid fa-hard-drive"></i> ${this.escapeHtml(sessionName)}</h4>
                    </div>
                    <div class="lot-card-date">
                        <span class="date-label">Date</span>
                        <span class="date-value">${this.escapeHtml(dateFormatted)}</span>
                        ${isRecovered ? `
                            <span class="date-label" style="margin-top: 0.5rem;">Récupéré le</span>
                            <span class="date-value" style="color: #2e7d32; font-weight: 600;">${this.formatDateTime(session.recovered_at)}</span>
                        ` : ''}
                    </div>
                </div>
                <div class="lot-card-stats">
                    <div class="stat">
                        <span class="stat-label"><i class="fa-solid fa-hard-drive" aria-hidden="true"></i> Disques</span>
                        <span class="stat-value">${count}</span>
                    </div>
                </div>
                <div class="lot-card-actions">
                    ${hasPdf ? `
                        <button type="button" class="btn-action btn-open-pdf-location-disque" data-session-id="${session.id}" title="Ouvrir le dossier du PDF">
                            <i class="fa-solid fa-folder-open" aria-hidden="true"></i> Emplacement PDF
                        </button>
                        <button type="button" class="btn-action btn-view-pdf-disque" data-pdf-url="${pdfUrl.replace(/"/g, '&quot;')}" data-download-filename="disques-session-${session.id}.pdf" title="Ouvrir le PDF dans le navigateur">
                            <i class="fa-solid fa-eye" aria-hidden="true"></i> Voir le PDF
                        </button>
                        <button type="button" class="btn-action btn-download-pdf-disque" data-session-id="${session.id}" data-pdf-url="${pdfUrl.replace(/"/g, '&quot;')}" data-download-filename="disques-session-${session.id}.pdf" title="Télécharger le certificat d'effacement (PDF)">
                            <i class="fa-solid fa-download" aria-hidden="true"></i> Télécharger PDF
                        </button>
                        <button type="button" class="btn-action btn-send-email-disque" data-session-id="${session.id}" title="Envoyer le PDF par email">
                            <i class="fa-solid fa-envelope" aria-hidden="true"></i> Envoyer par email
                        </button>
                        <button type="button" class="btn-action btn-regenerate-pdf-disque" data-session-id="${session.id}" title="Régénérer le PDF côté serveur">
                            <i class="fa-solid fa-arrows-rotate"></i> Régénérer le PDF
                        </button>
                    ` : '<span class="text-muted">PDF non généré</span>'}
                </div>
            </div>
        `;
    }

    /**
     * Créer une carte pour une commande (traçabilité)
     */
    createCommandeCard(commande) {
        const name = (commande.commande_name || commande.name || '').trim() || 'Commande';
        const dateStr = commande.date || (commande.created_at || '').slice(0, 10);
        const dateFormatted = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? this.formatDateDDMMYYYY(dateStr) : '-';
        const lineCount = Array.isArray(commande.lines) ? commande.lines.length : (commande.line_count ?? 0);
        const pdfUrl = commande.pdf_url || (commande.pdf_path ? (api.getServerUrl() + (commande.pdf_path.startsWith('/') ? commande.pdf_path : '/' + commande.pdf_path)) : '');
        const hasPdf = pdfUrl && pdfUrl.length > 0;
        const safeUrl = (pdfUrl + (pdfUrl.includes('?') ? '&' : '?') + 'v=' + Date.now()).replace(/"/g, '&quot;');
        const downloadFilename = (name.replace(/\s+/g, '_').replace(/[\\/:*?"<>|]/g, '') || 'commande') + '_' + (dateStr || '') + '.pdf';
        return `
            <div class="lot-card lot-card-commande" data-commande-id="${this.escapeHtml(String(commande.id || ''))}">
                <div class="lot-card-header">
                    <div class="lot-card-title">
                        <h4><i class="fa-solid fa-file-invoice"></i> Commande : ${this.escapeHtml(name)}</h4>
                    </div>
                    <div class="lot-card-date">
                        <span class="date-label">Date</span>
                        <span class="date-value">${this.escapeHtml(dateFormatted)}</span>
                    </div>
                </div>
                <div class="lot-card-stats">
                    <div class="stat">
                        <span class="stat-label">Lignes</span>
                        <span class="stat-value">${lineCount}</span>
                    </div>
                </div>
                <div class="lot-card-actions">
                    ${hasPdf ? `
                        <button type="button" class="btn-action btn-open-pdf-location-commande" data-commande-id="${this.escapeHtml(String(commande.id || ''))}" data-date="${this.escapeHtml(dateStr || '')}" title="Ouvrir le dossier du PDF">
                            <i class="fa-solid fa-folder-open" aria-hidden="true"></i> Emplacement PDF
                        </button>
                        <button type="button" class="btn-action btn-view-pdf-commande" data-pdf-url="${safeUrl}" data-download-filename="${this.escapeHtml(downloadFilename)}" title="Ouvrir le PDF de la commande">
                            <i class="fa-solid fa-eye" aria-hidden="true"></i> Voir le PDF
                        </button>
                        <button type="button" class="btn-action btn-download-pdf-commande" data-pdf-url="${safeUrl}" data-download-filename="${this.escapeHtml(downloadFilename)}" title="Télécharger le PDF de la commande">
                            <i class="fa-solid fa-download" aria-hidden="true"></i> Télécharger PDF
                        </button>
                    ` : '<span class="text-muted">PDF non disponible</span>'}
                </div>
            </div>
        `;
    }

    /**
     * Créer une carte pour un don (certificat)
     */
    createDonCard(don) {
        const lotName = (don.lot_name || don.name || '').trim();
        const title = lotName ? `Don : ${this.escapeHtml(lotName)}` : 'Don #' + (don.id || '');
        const dateStr = don.date || (don.created_at || '').slice(0, 10);
        const dateFormatted = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? this.formatDateDDMMYYYY(dateStr) : '-';
        const stagiaire = (don.stagiaire_afpa || don.stagiaire || '').trim() || '-';
        const pdfUrl = don.pdf_url || (don.pdf_path ? (api.getServerUrl() + (don.pdf_path.startsWith('/') ? don.pdf_path : '/' + don.pdf_path)) : '');
        const hasPdf = pdfUrl && pdfUrl.length > 0;
        const safeUrl = (pdfUrl + (pdfUrl.includes('?') ? '&' : '?') + 'v=' + Date.now()).replace(/"/g, '&quot;');
        const downloadFilename = (lotName ? lotName.replace(/\s+/g, '_').replace(/[\\/:*?"<>|]/g, '') : 'don') + '_' + (dateStr || '') + '.pdf';
        return `
            <div class="lot-card lot-card-don" data-don-id="${this.escapeHtml(String(don.id || ''))}">
                <div class="lot-card-header">
                    <div class="lot-card-title">
                        <h4><i class="fa-solid fa-hand-holding-heart"></i> ${title}</h4>
                    </div>
                    <div class="lot-card-date">
                        <span class="date-label">Date</span>
                        <span class="date-value">${this.escapeHtml(dateFormatted)}</span>
                    </div>
                </div>
                <div class="lot-card-stats">
                    <div class="stat">
                        <span class="stat-label">Stagiaire</span>
                        <span class="stat-value">${this.escapeHtml(stagiaire)}</span>
                    </div>
                </div>
                <div class="lot-card-actions">
                    ${hasPdf ? `
                        <button type="button" class="btn-action btn-open-pdf-location-don" data-don-id="${this.escapeHtml(String(don.id || ''))}" title="Ouvrir le dossier du PDF">
                            <i class="fa-solid fa-folder-open" aria-hidden="true"></i> Emplacement PDF
                        </button>
                        <button type="button" class="btn-action btn-view-pdf-don" data-pdf-url="${safeUrl}" data-download-filename="${this.escapeHtml(downloadFilename)}" title="Ouvrir le certificat de don (PDF)">
                            <i class="fa-solid fa-eye" aria-hidden="true"></i> Voir le certificat
                        </button>
                        <button type="button" class="btn-action btn-download-pdf-don" data-pdf-url="${safeUrl}" data-download-filename="${this.escapeHtml(downloadFilename)}" title="Télécharger le certificat de don (PDF)">
                            <i class="fa-solid fa-download" aria-hidden="true"></i> Télécharger PDF
                        </button>
                    ` : '<span class="text-muted">Certificat non disponible</span>'}
                </div>
            </div>
        `;
    }

    escapeHtml(s) {
        const div = document.createElement('div');
        div.textContent = s;
        return div.innerHTML;
    }

    /**
     * Obtenir le nom du mois
     */
    getMonthName(monthNum) {
        const months = [
            'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
            'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
        ];
        return months[monthNum - 1] || '';
    }

    /**
     * Créer une carte de lot
     */
    createLotCard(lot) {
        const total = lot.total || 0;
        const recond = lot.recond || 0;
        const pieces = lot.pieces || 0;
        const hs = lot.hs || 0;
        const pending = lot.pending || 0;
        const isFinished = pending === 0 && total > 0;
        const isRecovered = lot.recovered_at != null && lot.recovered_at !== '';
        // Chemin PDF : backend peut renvoyer pdf_path, pdf_url, pdfPath, path, document_path
        const pdfPath = lot.pdf_path || lot.pdf_url || lot.pdfPath || lot.path || lot.document_path || '';
        const isGenerating = this._generatingPdfLotId === String(lot.id);
        const dateForFile = lot.finished_at ? this.formatDateForFilename(lot.finished_at) : this.formatDateForFilename(new Date().toISOString());
        const lotDisplayName = (lot.lot_name || lot.name || '').trim();
        const sanitizedName = (lot.lot_name || lot.name || '').replace(/[\s]+/g, '_').replace(/[\\/:*?"<>|]/g, '').trim() || `Lot_${lot.id}`;
        const downloadFileName = `${sanitizedName}_${dateForFile}.pdf`;

        return `
            <div class="lot-card" data-lot-id="${lot.id}">
                <div class="lot-card-header">
                    <div class="lot-card-title">
                        <h4><i class="fa-solid fa-desktop" aria-hidden="true"></i> ${this.escapeHtml(lotDisplayName || `Lot #${lot.id}`)}</h4>
                    </div>
                    <div class="lot-card-date">
                        <span class="date-label">Terminé le</span>
                        <span class="date-value">${this.formatDateTime(lot.finished_at)}</span>
                        ${isRecovered ? `
                            <span class="date-label" style="margin-top: 0.5rem;">Récupéré le</span>
                            <span class="date-value" style="color: #2e7d32; font-weight: 600;">${this.formatDateTime(lot.recovered_at)}</span>
                        ` : ''}
                    </div>
                </div>
                
                <div class="lot-card-stats">
                    <div class="stat">
                        <span class="stat-label"><i class="fa-solid fa-desktop" aria-hidden="true"></i> Total</span>
                        <span class="stat-value">${total}</span>
                    </div>
                    <div class="stat">
                        <span class="stat-label"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Reconditionnés</span>
                        <span class="stat-value">${recond}</span>
                    </div>
                    <div class="stat">
                        <span class="stat-label"><i class="fa-solid fa-screwdriver-wrench" aria-hidden="true"></i> Pour pièces</span>
                        <span class="stat-value">${pieces}</span>
                    </div>
                    <div class="stat">
                        <span class="stat-label"><i class="fa-solid fa-circle-xmark" aria-hidden="true"></i> HS</span>
                        <span class="stat-value">${hs}</span>
                    </div>
                </div>

                <div class="lot-card-actions">
                    ${pdfPath ? `
                        <button type="button" class="btn-action btn-open-pdf-location-lot" data-lot-id="${lot.id}" title="Ouvrir le dossier du PDF">
                            <i class="fa-solid fa-folder-open" aria-hidden="true"></i> Emplacement PDF
                        </button>
                        <button type="button" class="btn-action btn-view-pdf" data-pdf-url="${(api.getServerUrl() + '/api/lots/' + lot.id + '/pdf?v=' + Date.now()).replace(/"/g, '&quot;')}" data-download-filename="${downloadFileName.replace(/"/g, '&quot;')}" title="Ouvrir le PDF du lot dans le navigateur">
                            <i class="fa-solid fa-eye" aria-hidden="true"></i> Voir le PDF
                        </button>
                        <button type="button" class="btn-action btn-download-pdf" data-lot-id="${lot.id}" data-pdf-path="/api/lots/${lot.id}/pdf" data-download-filename="${downloadFileName.replace(/"/g, '&quot;')}" title="Télécharger le PDF du lot">
                            <i class="fa-solid fa-download" aria-hidden="true"></i> Télécharger PDF
                        </button>
                        <button type="button" class="btn-action btn-send-email" data-lot-id="${lot.id}" title="Envoyer le PDF du lot par email">
                            <i class="fa-solid fa-envelope" aria-hidden="true"></i> Envoyer par email
                        </button>
                        <button type="button" class="btn-action btn-regenerate-pdf" data-lot-id="${lot.id}" ${isGenerating ? 'disabled' : ''} title="Recréer le PDF et le dossier local (en cas de bug ou perte)">
                            <i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i> ${isGenerating ? 'Génération...' : 'Régénérer le PDF'}
                        </button>
                    ` : `
                        <button type="button" class="btn-action btn-generate-pdf" data-lot-id="${lot.id}" ${isGenerating ? 'disabled' : ''} title="Générer le PDF du lot">
                            <i class="fa-solid fa-file-pdf" aria-hidden="true"></i> ${isGenerating ? 'Génération...' : 'Générer PDF'}
                        </button>
                    `}
                </div>
            </div>
        `;
    }

    /**
     * Créer une ligne du tableau (obsolète, conservé pour compatibilité)
     */
    createTableRow(lot) {
        return this.createLotCard(lot);
    }

    /**
     * Attacher les événements aux lignes
     */
    attachRowEventListeners() {
        document.querySelectorAll('.btn-open-pdf-location-lot').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openLotPdfLocation(btn.dataset.lotId);
            });
        });
        document.querySelectorAll('.btn-open-pdf-location-disque').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openDisquePdfLocation(btn.dataset.sessionId);
            });
        });
        document.querySelectorAll('.btn-open-pdf-location-commande').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openCommandePdfLocation(btn.dataset.commandeId);
            });
        });
        document.querySelectorAll('.btn-open-pdf-location-don').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openDonPdfLocation(btn.dataset.donId);
            });
        });

        // Générer PDF
        document.querySelectorAll('.btn-generate-pdf').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const lotId = btn.dataset.lotId;
                this.generatePDF(lotId);
            });
        });

        // Voir le PDF avec l'application système (Electron) ou dans un nouvel onglet (navigateur)
        document.querySelectorAll('.btn-view-pdf').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const url = (btn.dataset.pdfUrl || '').replace(/&quot;/g, '"');
                const filename = (btn.dataset.downloadFilename || '').replace(/&quot;/g, '"') || 'lot.pdf';
                this.openPdfWithSystemApp(url, filename);
            });
        });
        document.querySelectorAll('.btn-view-pdf-disque').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const url = (btn.dataset.pdfUrl || '').replace(/&quot;/g, '"');
                const filename = (btn.dataset.downloadFilename || '').replace(/&quot;/g, '"') || 'disques-session.pdf';
                this.openPdfWithSystemApp(url, filename);
            });
        });

        // Télécharger PDF (même nom que l'enregistrement local : NomDuLot_YYYY-MM-DD.pdf)
        document.querySelectorAll('.btn-download-pdf').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const lotId = btn.dataset.lotId;
                const pdfPath = btn.dataset.pdfPath;
                const downloadFilename = (btn.dataset.downloadFilename || '').replace(/&quot;/g, '"');
                this.downloadPDF(lotId, pdfPath, downloadFilename || undefined);
            });
        });

        // Envoyer email
        document.querySelectorAll('.btn-send-email').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const lotId = btn.dataset.lotId;
                this.openEmailModal(lotId);
            });
        });

        // Régénérer le PDF (dossier local + envoi serveur, en cas de bug ou perte)
        document.querySelectorAll('.btn-regenerate-pdf').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const lotId = btn.dataset.lotId;
                this.generatePDF(lotId);
            });
        });

        // Session disques : télécharger PDF
        document.querySelectorAll('.btn-download-pdf-disque').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const url = (btn.dataset.pdfUrl || '').replace(/&quot;/g, '"');
                const filename = btn.dataset.downloadFilename || 'disques-session.pdf';
                this.downloadDisquePdf(url, filename);
            });
        });

        // Session disques : envoyer par email
        document.querySelectorAll('.btn-send-email-disque').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openEmailModalDisque(btn.dataset.sessionId);
            });
        });

        // Session disques : régénérer le PDF
        document.querySelectorAll('.btn-regenerate-pdf-disque').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.regenerateDisquePdf(btn.dataset.sessionId);
            });
        });

        // Commande : voir / télécharger PDF
        document.querySelectorAll('.btn-view-pdf-commande').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const url = (btn.dataset.pdfUrl || '').replace(/&quot;/g, '"');
                const filename = (btn.dataset.downloadFilename || '').replace(/&quot;/g, '"') || 'commande.pdf';
                this.openPdfWithSystemApp(url, filename);
            });
        });
        document.querySelectorAll('.btn-download-pdf-commande').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const url = (btn.dataset.pdfUrl || '').replace(/&quot;/g, '"');
                const filename = (btn.dataset.downloadFilename || '').replace(/&quot;/g, '"') || 'commande.pdf';
                this.downloadDisquePdf(url, filename);
            });
        });

        // Don : voir / télécharger certificat PDF
        document.querySelectorAll('.btn-view-pdf-don').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const url = (btn.dataset.pdfUrl || '').replace(/&quot;/g, '"');
                const filename = (btn.dataset.downloadFilename || '').replace(/&quot;/g, '"') || 'don.pdf';
                this.openPdfWithSystemApp(url, filename);
            });
        });
        document.querySelectorAll('.btn-download-pdf-don').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const url = (btn.dataset.pdfUrl || '').replace(/&quot;/g, '"');
                const filename = (btn.dataset.downloadFilename || '').replace(/&quot;/g, '"') || 'don.pdf';
                this.downloadDisquePdf(url, filename);
            });
        });
    }

    async downloadDisquePdf(url, filename) {
        try {
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('workspace_jwt') || ''}` }
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(downloadUrl);
            this.showNotification('PDF téléchargé avec succès', 'success');
        } catch (err) {
            logger.error('Téléchargement PDF disques:', err);
            this.showNotification('Erreur lors du téléchargement du PDF', 'error');
        }
    }

    getMonthNameFr(monthIdx) {
        const months = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
        return months[Math.max(0, Math.min(11, monthIdx))];
    }

    normalizeDateForPath(dateStr) {
        const raw = String(dateStr || '').trim();
        if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
        const d = new Date(raw);
        if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
        return d.toISOString().slice(0, 10);
    }

    getCandidatePdfPathFromItem(item) {
        const candidates = [
            item?.local_pdf_path,
            item?.localPdfPath,
            item?.pdf_path,
            item?.pdfPath,
            item?.path,
            item?.file_path,
            item?.save_path,
            item?.save_path_hint,
            item?.pdf_directory,
            item?.pdf_dir
        ].filter(Boolean);
        return candidates[0] || null;
    }

    isAllowedLocalPath(candidatePath) {
        const p = String(candidatePath || '').trim();
        if (!p) return false;
        if (/^https?:\/\//i.test(p)) return false;
        if (p.startsWith('/api/')) return false;
        const normalized = p.replace(/\\/g, '/');
        return normalized.startsWith('/mnt/team/#TEAM/');
    }

    toDirectoryPath(candidatePath) {
        if (!candidatePath || /^https?:\/\//i.test(candidatePath)) return null;
        const normalized = String(candidatePath).trim().replace(/\\/g, '/');
        if (/\.pdf$/i.test(normalized)) {
            return normalized.replace(/\/[^/]+$/i, '');
        }
        return normalized;
    }

    buildTracabiliteDir(dateStr) {
        const normalized = this.normalizeDateForPath(dateStr);
        const year = normalized.slice(0, 4);
        const month = parseInt(normalized.slice(5, 7), 10) || 1;
        const monthName = this.getMonthNameFr(month - 1);
        return `/mnt/team/#TEAM/#TRAÇABILITÉ/${year}/${monthName}`;
    }

    async openPathOnDesktop(targetPath) {
        if (!window.electron || typeof window.electron.invoke !== 'function') {
            this.showNotification('Ouverture de dossier disponible uniquement dans l’application desktop', 'warning');
            return;
        }
        try {
            const result = await window.electron.invoke('open-path', { path: targetPath });
            if (!result?.success) {
                this.showNotification(result?.error || 'Impossible d’ouvrir le dossier', 'error');
                return;
            }
            this.showNotification('Emplacement PDF ouvert', 'success');
        } catch (err) {
            logger.error('openPathOnDesktop:', err);
            this.showNotification(err?.message || 'Impossible d’ouvrir le dossier', 'error');
        }
    }

    async openLotPdfLocation(lotId) {
        const lot = this.lots.find(l => String(l.id) === String(lotId));
        if (!lot) return;
        const candidate = this.getCandidatePdfPathFromItem(lot);
        const explicit = this.isAllowedLocalPath(candidate) ? this.toDirectoryPath(candidate) : null;
        const fallback = this.buildTracabiliteDir(lot.finished_at || lot.created_at);
        await this.openPathOnDesktop(explicit || fallback);
    }

    async openDisquePdfLocation(sessionId) {
        const session = this.sessionsDisques.find(s => String(s.id) === String(sessionId));
        if (!session) return;
        const candidate = this.getCandidatePdfPathFromItem(session);
        const explicit = this.isAllowedLocalPath(candidate) ? this.toDirectoryPath(candidate) : null;
        const fallback = this.buildTracabiliteDir(session.date || session.created_at).replace('/#TRAÇABILITÉ/', '/#TRAÇABILITÉ/Disques/');
        await this.openPathOnDesktop(explicit || fallback);
    }

    async openCommandePdfLocation(commandeId) {
        const commande = this.commandes.find(c => String(c.id) === String(commandeId));
        if (!commande) return;
        const candidate = this.getCandidatePdfPathFromItem(commande);
        const explicit = this.isAllowedLocalPath(candidate) ? this.toDirectoryPath(candidate) : null;
        await this.openPathOnDesktop(explicit || '/mnt/team/#TEAM/#COMMANDES');
    }

    async openDonPdfLocation(donId) {
        const don = this.dons.find(d => String(d.id) === String(donId));
        if (!don) return;
        const candidate = this.getCandidatePdfPathFromItem(don);
        const explicit = this.isAllowedLocalPath(candidate) ? this.toDirectoryPath(candidate) : null;
        await this.openPathOnDesktop(explicit || '/mnt/team/#TEAM/#TRAÇABILITÉ/don_stagiaires');
    }

    openEmailModalDisque(sessionId) {
        this.currentEmailSessionId = sessionId;
        this.currentEmailLotId = null;
        document.getElementById('email-recipient').value = '';
        document.getElementById('email-message').value = '';
        this.modalManager.open('modal-send-email');
    }

    async regenerateDisquePdf(sessionId) {
        try {
            if (!window.electron?.invoke) {
                this.showNotification('Régénération PDF disponible dans l\'application desktop (Electron)', 'warning');
                return;
            }
            const session = await getSession(sessionId);
            if (!session?.id) {
                this.showNotification('Session introuvable', 'error');
                return;
            }
            const basePath = '/mnt/team/#TEAM/#TRAÇABILITÉ';
            this.showNotification('Génération du PDF...', 'info');
            const result = await window.electron.invoke('generate-disques-pdf', {
                sessionId: session.id,
                date: session.date || (session.created_at || '').slice(0, 10),
                name: session.name,
                disks: session.disks || [],
                basePath
            });
            if (!result?.success || !result.pdf_path) {
                throw new Error(result?.error || 'Échec génération PDF');
            }
            const readResult = await window.electron.invoke('read-file-as-base64', { path: result.pdf_path });
            if (!readResult?.success || !readResult.base64) {
                throw new Error('Impossible de lire le PDF pour envoi au serveur');
            }
            const serverUrl = api.getServerUrl();
            const res = await fetch(`${serverUrl}/api/disques/sessions/${sessionId}/pdf`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('workspace_jwt') || ''}`
                },
                body: JSON.stringify({
                    pdf_base64: readResult.base64,
                    session_name: session.name,
                    date: session.date || (session.created_at || '').slice(0, 10),
                    save_path_hint: basePath
                })
            });
            const text = await res.text().catch(() => '');
            if (!res.ok) {
                let msg = text || `Erreur serveur ${res.status}`;
                try {
                    const j = JSON.parse(text);
                    if (j?.message) msg = j.message;
                    else if (j?.error) msg = j.error;
                } catch (_) { /* garder msg */ }
                throw new Error(msg);
            }
            this.showNotification('PDF régénéré', 'success');
            await this.loadLots();
            this.renderTable();
        } catch (err) {
            logger.error('Régénération PDF disques:', err);
            this.showNotification(err?.message || 'Régénération PDF non disponible', 'error');
        }
    }

    /**
     * Marquer une session disques comme récupérée (traçabilité uniquement, pas les PDF).
     */
    async markDisqueSessionAsRecovered(sessionId) {
        const session = this.sessionsDisques.find(s => String(s.id) === String(sessionId));
        if (!session) return;
        const btn = document.querySelector(`.btn-recover-disque[data-session-id="${sessionId}"]`);
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> En cours...';
        }
        try {
            const data = await updateSession(sessionId, { recovered_at: new Date().toISOString() });
            session.recovered_at = data.recovered_at ?? data.session?.recovered_at ?? new Date().toISOString();
            this.showNotification('Lot disques marqué comme récupéré', 'success');
            await this.loadLots();
            this.renderTable();
        } catch (err) {
            logger.error('Récupération lot disques:', err);
            this.showNotification(err?.message || 'Erreur lors de la mise à jour', 'error');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-check-double"></i> Récupérer';
            }
        }
    }

    /**
     * Ouvrir le PDF avec l'application système (Electron) ou dans un nouvel onglet (navigateur).
     */
    async openPdfWithSystemApp(pdfUrl, suggestedFilename) {
        if (!pdfUrl || !pdfUrl.trim()) return;
        if (window.electron?.invoke) {
            try {
                const token = localStorage.getItem('workspace_jwt') || '';
                const result = await window.electron.invoke('open-pdf-with-system-app', {
                    url: pdfUrl.trim(),
                    token,
                    suggestedFilename: suggestedFilename || 'tracabilite.pdf'
                });
                if (!result.success) {
                    this.showNotification(result.error || 'Impossible d\'ouvrir le PDF', 'error');
                }
            } catch (err) {
                logger.error('❌ openPdfWithSystemApp:', err);
                this.showNotification('Erreur lors de l\'ouverture du PDF', 'error');
            }
        } else {
            window.open(pdfUrl, '_blank', 'noopener');
        }
    }

    /**
     * Télécharger le PDF sur le PC (même format de nom que l'enregistrement : NomDuLot_YYYY-MM-DD.pdf)
     */
    async downloadPDF(lotId, pdfPath, suggestedFilename) {
        try {
            const baseUrl = pdfPath.startsWith('http') ? '' : api.getServerUrl();
            const pathPart = pdfPath.startsWith('http') ? pdfPath : (pdfPath.startsWith('/') ? pdfPath : '/' + pdfPath);
            const url = `${baseUrl}${pathPart}${pathPart.includes('?') ? '&' : '?'}v=${Date.now()}`;
            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('workspace_jwt') || ''}` }
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const filename = suggestedFilename && /\.pdf$/i.test(suggestedFilename) ? suggestedFilename : `lot-${lotId}.pdf`;

            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(downloadUrl);
            
            this.showNotification('PDF téléchargé avec succès', 'success');
        } catch (error) {
            logger.error('❌ Erreur téléchargement PDF:', error);
            this.showNotification('Erreur lors du téléchargement du PDF', 'error');
        }
    }

    /**
     * Générer le PDF : crée le fichier dans /mnt/team/#TEAM/#TRAÇABILITÉ/AAAA/MM/ puis l'envoie au serveur.
     * La sauvegarde locale est automatique à la finalisation du lot (depuis l'inventaire).
     * Ceci sert aussi pour « Régénérer le PDF » en cas de bug ou perte.
     */
    async generatePDF(lotId) {
        if (this._generatingPdfLotId) return;
        this._generatingPdfLotId = String(lotId);
        this.renderTable();

        let lot = this.lots.find(l => l.id == lotId);
        if (!lot || !Array.isArray(lot.items)) {
            try {
                const serverUrl = api.getServerUrl();
                const res = await fetch(`${serverUrl}/api/lots/${lotId}`, {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('workspace_jwt') || ''}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    lot = data.item || data;
                    if (lot && !lot.items && data.items) lot.items = data.items;
                }
            } catch (e) {
                logger.warn('Chargement détail lot:', e);
            }
        }
        if (!lot) {
            this._generatingPdfLotId = null;
            this.renderTable();
            this.showNotification('Lot introuvable', 'error');
            return;
        }
        const items = Array.isArray(lot.items) ? lot.items : [];
        const lotName = (lot.lot_name || lot.name) ? String(lot.lot_name || lot.name).trim() : `Lot_${lotId}`;
        const dateForFile = lot.finished_at ? this.formatDateForFilename(lot.finished_at) : this.formatDateForFilename(new Date().toISOString());

        const basePath = '/mnt/team/#TEAM/#TRAÇABILITÉ';

        try {
            this.showNotification('Génération du PDF...', 'info');

            if (!window.electron || typeof window.electron.invoke !== 'function') {
                throw new Error('Régénération PDF uniquement dans l\'application desktop (Electron). En navigateur, utilisez l\'app installée.');
            }
            const result = await window.electron.invoke('generate-lot-pdf', {
                lotId: String(lotId),
                lotName,
                date: dateForFile,
                items,
                created_at: lot.created_at,
                finished_at: lot.finished_at,
                recovered_at: lot.recovered_at,
                basePath
            });
            if (!result || !result.success) {
                throw new Error(result?.error || 'Échec génération PDF');
            }
            const localPdfPath = result.pdf_path;

            const readResult = await window.electron.invoke('read-file-as-base64', { path: localPdfPath });
            if (!readResult || !readResult.success || !readResult.base64) {
                throw new Error(readResult?.error || 'Impossible de lire le PDF pour envoi au serveur');
            }

            const serverUrl = api.getServerUrl();
            const endpointPath = '/api/lots/:id/pdf'.replace(':id', lotId);
            const response = await fetch(`${serverUrl}${endpointPath}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('workspace_jwt') || ''}`
                },
                body: JSON.stringify({
                    pdf_base64: readResult.base64,
                    lot_name: lotName,
                    date: dateForFile,
                    save_path_hint: basePath
                })
            });

            const contentType = response.headers.get('Content-Type') || '';
            if (!response.ok) {
                let message = `Erreur serveur ${response.status} : le PDF n'a pas été mis à jour sur le serveur.`;
                try {
                    if (contentType.includes('application/json')) {
                        const err = await response.json();
                        message = err.message || err.error || message;
                    } else {
                        const text = await response.text();
                        if (text) message = text;
                    }
                } catch (_) { /* ok */ }
                throw new Error(message);
            }

            this.showNotification('PDF régénéré : sauvegardé en local et envoyé au serveur.', 'success');
            await this.loadLots();
            this.renderTable();
        } catch (error) {
            logger.error('❌ Erreur génération PDF:', error);
            this.showNotification(error.message || 'Erreur lors de la génération du PDF', 'error');
        } finally {
            this._generatingPdfLotId = null;
            this.renderTable();
        }
    }

    /**
     * Ouvrir la modale d'email
     */
    openEmailModal(lotId) {
        this.currentEmailLotId = lotId;
        this.currentEmailSessionId = null;
        document.getElementById('email-recipient').value = 'destinataire@example.com';
        document.getElementById('email-message').value = '';
        this.modalManager.open('modal-send-email');
    }

    /**
     * Configurer les événements
     */
    setupEventListeners() {
        // Bouton rafraîchir
        const refreshBtn = document.getElementById('btn-refresh-tracabilite');
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

        // Filtre année
        const filterYear = document.getElementById('filter-tracabilite-year');
        if (filterYear) {
            filterYear.addEventListener('change', () => this.renderTable());
        }

        // Filtre type (Lot, Disque, Commande, Don)
        const filterType = document.getElementById('filter-tracabilite-type');
        if (filterType) {
            filterType.addEventListener('change', () => this.renderTable());
        }

        // Bouton envoyer email
        const sendEmailBtn = document.getElementById('btn-confirm-send-email');
        if (sendEmailBtn) {
            sendEmailBtn.addEventListener('click', () => this.sendEmailPDF());
        }
    }

    /**
     * Envoyer le PDF par email
     */
    async sendEmailPDF() {
        try {
            const isSessionDisque = !!this.currentEmailSessionId;
            if (!this.currentEmailLotId && !this.currentEmailSessionId) {
                this.showNotification('Erreur: élément non identifié. Fermez la fenêtre et réessayez.', 'error');
                return;
            }

            const recipient = document.getElementById('email-recipient').value.trim();
            const message = document.getElementById('email-message').value.trim();

            if (!recipient) {
                this.showNotification('Veuillez entrer une adresse email', 'error');
                return;
            }

            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
                this.showNotification('Adresse email invalide', 'error');
                return;
            }

            this.showNotification('Envoi en cours...', 'info');

            const serverUrl = api.getServerUrl();
            let fullUrl, body;
            if (isSessionDisque) {
                fullUrl = `${serverUrl}/api/disques/sessions/${this.currentEmailSessionId}/email`;
                body = JSON.stringify({ email: recipient, subject: `Session disques #${this.currentEmailSessionId} - PDF`, message: message || '' });
            } else {
                const emailPath = window.SERVER_CONFIG?.getEndpoint?.('lots.email') || '/api/lots/:id/email';
                const endpointPath = emailPath.replace(':id', String(this.currentEmailLotId));
                fullUrl = `${serverUrl}${endpointPath.startsWith('/') ? '' : '/'}${endpointPath}`;
                body = JSON.stringify({
                    email: recipient,
                    subject: `Lot #${this.currentEmailLotId} - PDF`,
                    message: message || ''
                });
            }
            const response = await fetch(fullUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('workspace_jwt') || ''}`
                },
                body
            });

            if (!response.ok) {
                let errorMessage = `HTTP ${response.status}`;
                try {
                    const data = await response.json();
                    errorMessage = data.message || errorMessage;
                } catch (parseError) {
                    logger.warn('Impossible de parser la réponse d\'erreur:', parseError);
                }
                throw new Error(errorMessage);
            }

            this.showNotification('Email envoyé avec succès', 'success');
            this.modalManager.close('modal-send-email');
            this.currentEmailLotId = null;
            this.currentEmailSessionId = null;

        } catch (error) {
            logger.error('❌ Erreur envoi email:', error);
            this.showNotification(error.message || 'Erreur lors de l\'envoi de l\'email', 'error');
            // Fermer le modal même en cas d'erreur après un délai
            setTimeout(() => {
                this.modalManager.close('modal-send-email');
            }, 3000);
        }
    }

    /**
     * Formater une date pour un nom de fichier (YYYY-MM-DD)
     */
    formatDateForFilename(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    /**
     * Formater une date
     */
    formatDate(dateStr) {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        return date.toLocaleDateString('fr-FR', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric'
        });
    }

    /**
     * Formater une date et heure
     */
    formatDateTime(dateStr) {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return '-';
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
        logger.debug('🧹 Destruction TracabiliteManager');
        this.lots = [];
        this.sessionsDisques = [];
        this.commandes = [];
        this.dons = [];
        this.currentEmailLotId = null;
        this.currentEmailSessionId = null;
    }
}
