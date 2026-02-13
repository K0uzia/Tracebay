/**
 * TRAÇABILITÉ - MODULE JS
 * Affiche tous les lots avec accès aux PDFs et email
 */

import api from '../../config/api.js';
import getLogger from '../../config/Logger.js';
const logger = getLogger();


export default class TracabiliteManager {
    constructor(modalManager) {
        this.modalManager = modalManager;
        this.lots = [];
        this.currentEmailLotId = null;
        this.init();
    }

    async init() {
        logger.debug('🚀 Initialisation TracabiliteManager');
        await this.loadLots();
        this.setupEventListeners();
        logger.debug('✅ TracabiliteManager prêt');
    }

    /**
     * Charger tous les lots
     */
    async loadLots() {
        try {
            // Séparer l'endpoint des query params
            const serverUrl = api.getServerUrl();
            const endpoint = '/api/lots';
            const url = `${serverUrl}${endpoint}?status=all`;
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('workspace_jwt') || ''}`
                }
            });
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            logger.debug('Données lots reçues:', data);
            
            // Gérer les deux formats : tableau direct ou avec wrapper
            const lots = Array.isArray(data) ? data : (data.items || data.lots || []);
            
            // S'assurer que chaque lot a un tableau items
            this.lots = lots.map(lot => ({
                ...lot,
                items: Array.isArray(lot.items) ? lot.items : []
            })).sort((a, b) => 
                new Date(b.created_at) - new Date(a.created_at)
            );
            
            logger.info('📦 Lots traçabilité chargés:', { count: this.lots.length });
            
            logger.debug(`📦 ${this.lots.length} lot(s) chargé(s)`);
            this.renderTable();
        } catch (error) {
            logger.error('❌ Erreur chargement lots:', error);
            this.showNotification('Erreur lors du chargement des lots', 'error');
        }
    }

    /**
     * Afficher les lots groupés par année et mois
     */
    renderTable() {
        const container = document.getElementById('tracabilite-grouped');
        if (!container) return;

        // Filtrer pour les lots terminés uniquement
        const finishedLots = this.lots.filter(lot => {
            const total = lot.total || 0;
            const pending = lot.pending || 0;
            return pending === 0 && total > 0;
        });

        if (finishedLots.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fa-solid fa-inbox"></i>
                    <p>Aucun lot terminé</p>
                    <small>Les lots terminés apparaîtront ici</small>
                </div>
            `;
            return;
        }

        // Grouper les lots par année, puis par mois
        const grouped = this.groupByYearMonth(finishedLots);
        
        // Générer le HTML
        let html = '';
        for (const [year, months] of Object.entries(grouped)) {
            html += `<div class="year-section" data-year="${year}">
                <div class="year-header">
                    <h2><i class="fa-solid fa-calendar"></i> ${year}</h2>
                </div>`;
            
            for (const [month, lots] of Object.entries(months)) {
                html += `<div class="month-section" data-month="${month}">
                    <div class="month-header">
                        <h3><i class="fa-solid fa-calendar-days"></i> ${this.getMonthName(parseInt(month))} (${lots.length} lot${lots.length > 1 ? 's' : ''})</h3>
                    </div>
                    <div class="lots-list">`;
                
                for (const lot of lots) {
                    html += this.createLotCard(lot);
                }
                
                html += `</div></div>`;
            }
            
            html += `</div>`;
        }

        container.innerHTML = html;
        this.attachRowEventListeners();
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

        return `
            <div class="lot-card" data-lot-id="${lot.id}">
                <div class="lot-card-header">
                    <div class="lot-card-title">
                        <h4>Lot #${lot.id}</h4>
                        ${lot.lot_name ? `<span class="lot-name">${lot.lot_name}</span>` : ''}
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
                        <span class="stat-label">Total</span>
                        <span class="stat-value">${total}</span>
                    </div>
                    <div class="stat">
                        <span class="stat-label">Reconditionnés</span>
                        <span class="stat-value">${recond}</span>
                    </div>
                    <div class="stat">
                        <span class="stat-label">Pour pièces</span>
                        <span class="stat-value">${pieces}</span>
                    </div>
                    <div class="stat">
                        <span class="stat-label">HS</span>
                        <span class="stat-value">${hs}</span>
                    </div>
                </div>

                <div class="lot-card-actions">
                    ${lot.pdf_path ? `
                        <a href="${api.getServerUrl()}${lot.pdf_path}?v=${Date.now()}" target="_blank" class="btn-action btn-view">
                            <i class="fa-solid fa-eye"></i> Voir le PDF
                        </a>
                        <button type="button" class="btn-action btn-download-pdf" data-lot-id="${lot.id}" data-pdf-path="${lot.pdf_path}">
                            <i class="fa-solid fa-download"></i> Télécharger PDF
                        </button>
                        <button type="button" class="btn-action btn-send-email" data-lot-id="${lot.id}">
                            <i class="fa-solid fa-envelope"></i> Envoyer par email
                        </button>
                        </button>
                    ` : `
                        <button type="button" class="btn-action btn-generate-pdf" data-lot-id="${lot.id}">
                            <i class="fa-solid fa-file-pdf"></i> Générer PDF
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
        // Générer PDF
        document.querySelectorAll('.btn-generate-pdf').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const lotId = btn.dataset.lotId;
                this.generatePDF(lotId);
            });
        });

        // Télécharger PDF
        document.querySelectorAll('.btn-download-pdf').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const lotId = btn.dataset.lotId;
                const pdfPath = btn.dataset.pdfPath;
                this.downloadPDF(lotId, pdfPath);
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
    }

    /**
     * Télécharger le PDF sur le PC
     */
    async downloadPDF(lotId, pdfPath) {
        try {
            const url = `${api.getServerUrl()}${pdfPath}?v=${Date.now()}`;
            
            // Créer un lien temporaire pour le téléchargement
            const response = await fetch(url);
            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = `lot-${lotId}.pdf`;
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
     * Générer le PDF
     */
    async generatePDF(lotId) {
        try {
            this.showNotification('Génération du PDF...', 'info');
            
            const serverUrl = api.getServerUrl();
            const endpointPath = '/api/lots/:id/pdf'.replace(':id', lotId);
            const fullUrl = `${serverUrl}${endpointPath}`;
            const response = await fetch(fullUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('workspace_jwt') || ''}`
                }
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            this.showNotification('PDF généré avec succès', 'success');
            
            // Recharger les lots
            await this.loadLots();
        } catch (error) {
            logger.error('❌ Erreur génération PDF:', error);
            this.showNotification('Erreur lors de la génération du PDF', 'error');
        }
    }

    /**
     * Ouvrir la modale d'email
     */
    openEmailModal(lotId) {
        this.currentEmailLotId = lotId;
        document.getElementById('email-recipient').value = '';
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
            refreshBtn.addEventListener('click', () => this.loadLots());
        }

        // Filtre statut
        const filterStatus = document.getElementById('filter-tracabilite-status');
        if (filterStatus) {
            filterStatus.addEventListener('change', () => this.applyStatusFilter());
        }

        // Bouton envoyer email
        const sendEmailBtn = document.getElementById('btn-confirm-send-email');
        if (sendEmailBtn) {
            sendEmailBtn.addEventListener('click', () => this.sendEmailPDF());
        }
    }

    /**
     * Appliquer le filtre de statut
     */
    applyStatusFilter() {
        const status = document.getElementById('filter-tracabilite-status').value;
        
        if (status === '' || status === 'finished') {
            // Afficher tous les lots terminés ou garder l'affichage actuel
            const container = document.getElementById('tracabilite-grouped');
            if (container) container.style.display = '';
        } else if (status === 'active') {
            // Pas de lots en cours dans la traçabilité (seulement les terminés)
            const container = document.getElementById('tracabilite-grouped');
            if (container) {
                container.innerHTML = `
                    <div class="empty-state">
                        <i class="fa-solid fa-inbox"></i>
                        <p>Aucun lot en cours</p>
                        <small>Consultez l'inventaire pour les lots en cours</small>
                    </div>
                `;
            }
        }
    }

    /**
     * Envoyer le PDF par email
     */
    async sendEmailPDF() {
        try {
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

            const endpoint = `lots.email`.replace(':id', this.currentEmailLotId);
            const response = await api.post(endpoint, {
                recipient: recipient,
                message: message || null
            });

            if (!response.ok) {
                let errorMessage = `HTTP ${response.status}`;
                try {
                    const data = await response.json();
                    errorMessage = data.message || errorMessage;
                } catch (parseError) {
                    // Si on ne peut pas parser la réponse, utiliser l'erreur HTTP
                    logger.warn('Impossible de parser la réponse d\'erreur:', parseError);
                }
                throw new Error(errorMessage);
            }

            const result = await response.json();
            this.showNotification('Email envoyé avec succès', 'success');
            this.modalManager.close('modal-send-email');

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
        this.currentEmailLotId = null;
    }
}
