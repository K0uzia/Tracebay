/**
 * GESTION DES LOTS - MODULE JS
 * Gère la saisie des lots de matériel reconditionné
 * Vanilla JS ES6+ - Pas de frameworks
 */

export default class GestionLotsManager {
    constructor(modalManager) {
        this.modalManager = modalManager;
        this.currentRowNumber = 1;
        this.marques = [];
        this.modeles = [];
        this.lots = [];
        this.eventsAttached = false;
        
        this.init();
    }

    /**
     * Initialisation
     */
    async init() {
        console.log('🚀 Initialisation GestionLotsManager');
        
        await this.loadReferenceData();
        this.setupEventListeners();
        
        // Ajouter une première ligne par défaut SCAN pour le scan
        setTimeout(() => {
            const tbody = document.getElementById('lot-table-body');
            if (tbody) {
                const row = this.createRow('', 'scan');
                tbody.appendChild(row);
                console.log('➕ Ligne SCAN initiale ajoutée');
            }
        }, 400);
        
        console.log('✅ GestionLotsManager prêt');
    }

    /**
     * Charger les données de référence (marques, modèles) depuis l'API
     */
    async loadReferenceData() {
        try {
            const serverUrl = (window.APP_CONFIG && window.APP_CONFIG.serverUrl) || 'http://localhost:8060';
            
            // Charger les marques
            const marquesRes = await fetch(`${serverUrl}/api/marques`);
            if (!marquesRes.ok) throw new Error('Erreur chargement marques');
            const marquesData = await marquesRes.json();
            this.marques = marquesData.items || [];
            
            // Charger tous les modèles
            const modelesRes = await fetch(`${serverUrl}/api/marques/all`);
            if (!modelesRes.ok) {
                // Endpoint alternatif si /all n'existe pas
                throw new Error('Endpoint modèles non trouvé');
            }
            const modelesData = await modelesRes.json();
            this.modeles = modelesData.items || [];
            
            console.log('📦 Données chargées:', this.marques.length, 'marques', this.modeles.length, 'modèles');
            
            // Remplir les selects de marques
            this.updateMarqueSelects();
        } catch (error) {
            console.error('❌ Erreur chargement données:', error);
            // Charger données par défaut en cas d'erreur
            this.loadDefaultData();
        }
    }

    /**
     * Charger données par défaut (fallback)
     */
    loadDefaultData() {
        this.marques = [
            { id: 1, name: 'Dell' },
            { id: 2, name: 'HP' },
            { id: 3, name: 'Lenovo' }
        ];
        this.modeles = [
            { id: 1, name: 'Latitude 5410', marque_id: 1 },
            { id: 2, name: 'ProBook 450', marque_id: 2 },
            { id: 3, name: 'ThinkPad T14', marque_id: 3 }
        ];
        console.log('ℹ️ Données par défaut chargées');
        this.updateMarqueSelects();
    }

    /**
     * Mettre à jour tous les selects de marques
     */
    updateMarqueSelects() {
        const selects = document.querySelectorAll('select[name="marque"], #select-marque-for-modele');
        selects.forEach(select => {
            const currentValue = select.value;
            select.innerHTML = '<option value="">-- Sélectionner une marque --</option>';
            this.marques.forEach(marque => {
                const option = document.createElement('option');
                option.value = marque.id;
                option.textContent = marque.name;
                select.appendChild(option);
            });
            select.value = currentValue;
        });
    }

    /**
     * Mettre à jour les modèles basé sur la marque sélectionnée
     */
    updateModeleSelect(marqueId, selectElement) {
        const filteredModeles = this.modeles.filter(m => m.marque_id == marqueId);
        selectElement.innerHTML = '<option value="">-- Sélectionner un modèle --</option>';
        filteredModeles.forEach(modele => {
            const option = document.createElement('option');
            option.value = modele.id;
            option.textContent = modele.name;
            selectElement.appendChild(option);
        });
    }

    /**
     * Configuration des événements avec délégation
     */
    setupEventListeners() {
        console.log('🔧 Configuration événements');
        
        // Vérifier qu'on n'attache pas les événements en double (flag global)
        if (window.__gestionLotsEventsAttached) {
            console.log('ℹ️ Événements déjà attachés globalement, skip');
            return;
        }
        window.__gestionLotsEventsAttached = true;
        this.eventsAttached = true;
        
        // Attacher directement aux boutons - pas de délégation pour éviter les conflits
        const attachButton = (id, handler) => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log(`🖱️ Clic sur ${id}`);
                    handler();
                });
                console.log(`✅ ${id} attaché`);
            } else {
                console.warn(`⚠️ ${id} non trouvé`);
            }
        };

        // Attendre que le DOM soit stable
        setTimeout(() => {
            attachButton('btn-add-manual', () => this.addManualRow());
            attachButton('btn-save-lot', () => this.saveLot());
            attachButton('btn-cancel-lot', () => this.cancelLot());
            attachButton('btn-submit-marque', () => this.submitNewMarque());
            attachButton('btn-submit-modele', () => this.submitNewModele());
            
            // Gérer le changement de marque dans le formulaire d'ajout de modèle
            const selectMarque = document.getElementById('select-marque-for-modele');
            if (selectMarque) {
                selectMarque.addEventListener('change', (e) => {
                    console.log('📦 Marque sélectionnée pour modèle:', e.target.value);
                });
            }
            
            // Gérer les changements de marques dans les lignes du tableau
            document.addEventListener('change', (e) => {
                if (e.target.name === 'marque') {
                    const row = e.target.closest('tr');
                    if (row) {
                        const modeleSelect = row.querySelector('select[name="modele"]');
                        if (modeleSelect && e.target.value) {
                            this.updateModeleSelect(e.target.value, modeleSelect);
                        }
                    }
                }
            });
            
            // Autres boutons
            attachButton('btn-confirm-clear-lot', () => this.confirmCancelLot());
            attachButton('btn-apply-mass', () => this.applyMassValues());
            
            // Select all checkbox
            const selectAll = document.getElementById('select-all');
            if (selectAll) {
                selectAll.addEventListener('change', (e) => {
                    const checkboxes = document.querySelectorAll('.row-checkbox');
                    checkboxes.forEach(cb => cb.checked = e.target.checked);
                });
                console.log('✅ select-all attaché');
            }
            
            // Populer les selects de masse
            this.populateMassSelects();
            
            // Boutons de confirmation modale
            attachButton('btn-confirm-mass-apply', () => this.confirmMassApply());
            attachButton('btn-confirm-delete-row', () => this.confirmDeleteRow());
            
            // Bouton add-modele pour remplir le select
            const btnAddModele = document.getElementById('btn-add-modele');
            if (btnAddModele) {
                btnAddModele.addEventListener('click', () => {
                    setTimeout(() => this.populateMarqueSelect(), 150);
                });
                console.log('✅ btn-add-modele attaché');
            }
        }, 300);

        // Scan de code-barres
        let barcodeBuffer = '';
        let barcodeTimeout;

        document.addEventListener('keydown', (e) => {
            // Ignorer si on tape dans un input
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

            if (e.key === 'Enter' && barcodeBuffer.length > 3) {
                this.addRowFromScan(barcodeBuffer);
                barcodeBuffer = '';
            } else if (e.key.length === 1) {
                barcodeBuffer += e.key;
                clearTimeout(barcodeTimeout);
                barcodeTimeout = setTimeout(() => {
                    barcodeBuffer = '';
                }, 100);
            }
        });

        console.log('✅ Événements configurés');
    }

    /**
     * Ajouter une ligne depuis un scan
     */
    addRowFromScan(serialNumber) {
        console.log('📷 Scan détecté:', serialNumber);
        
        const tbody = document.getElementById('lot-table-body');
        if (!tbody) return;

        const row = this.createRow(serialNumber, 'scan');
        tbody.appendChild(row);
        
        this.showNotification('Appareil scanné ajouté', 'success');
    }

    /**
     * Ajouter une ligne manuellement
     */
    addManualRow() {
        console.log('➕ Ajout manuel');
        
        const tbody = document.getElementById('lot-table-body');
        if (!tbody) return;

        const row = this.createRow('', 'manual');
        tbody.appendChild(row);
        
        // Focus sur le champ S/N
        const snInput = row.querySelector('input[name="serial_number"]');
        if (snInput) snInput.focus();
        
        this.showNotification('Ligne ajoutée', 'success');
    }

    /**
     * Créer une ligne de tableau
     */
    createRow(serialNumber = '', entryType = 'manual') {
        const row = document.createElement('tr');
        const now = new Date();
        const rowNum = this.currentRowNumber++;

        row.innerHTML = `
            <td>
                <input type="checkbox" class="row-checkbox" title="Sélectionner cette ligne">
            </td>
            <td>
                <span>${rowNum}</span>
            </td>
            <td>
                <input type="text" name="serial_number" value="${serialNumber}" placeholder="S/N" required>
            </td>
            <td>
                <select name="type" required>
                    <option value="">Type...</option>
                    <option value="portable">Portable</option>
                    <option value="fixe">Fixe</option>
                    <option value="ecran">Écran</option>
                </select>
            </td>
            <td>
                <select name="marque" required>
                    <option value="">Marque...</option>
                    ${this.marques.map(m => `<option value="${m.id}">${m.name}</option>`).join('')}
                </select>
            </td>
            <td>
                <select name="modele" required>
                    <option value="">Modèle...</option>
                    ${this.modeles.map(m => `<option value="${m.id}">${m.name}</option>`).join('')}
                </select>
            </td>
            <td>
                <span class="entry-badge ${entryType}">${entryType === 'scan' ? 'SCAN' : 'MANUEL'}</span>
            </td>
            <td>
                <button type="button" class="btn-delete-row" title="Supprimer cette ligne">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
            <!-- Champs cachés pour date et heure (traçabilité interne) -->
            <input type="hidden" name="date" value="${now.toISOString().split('T')[0]}">
            <input type="hidden" name="time" value="${now.toTimeString().slice(0, 5)}">
        `;
        
        // Attacher les événements
        const deleteBtn = row.querySelector('.btn-delete-row');
        const marqueSelect = row.querySelector('select[name="marque"]');
        const modeleSelect = row.querySelector('select[name="modele"]');
        
        // Événement changement de marque - FILTRE LES MODÈLES
        if (marqueSelect) {
            marqueSelect.addEventListener('change', (e) => {
                if (e.target.value) {
                    this.updateModeleSelect(e.target.value, modeleSelect);
                } else {
                    modeleSelect.innerHTML = '<option value="">Modèle...</option>';
                }
            });
        }
        
        // Événement suppression
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => this.deleteRow(row));
        }

        return row;
    }

    /**
     * Enregistrer le lot
     */
    async saveLot() {
        console.log('💾 Enregistrement du lot');
        
        const tbody = document.getElementById('lot-table-body');
        if (!tbody) return;

        const rows = tbody.querySelectorAll('tr');
        if (rows.length === 0) {
            this.showNotification('Aucune ligne à enregistrer', 'error');
            return;
        }

        const lotData = [];
        let isValid = true;

        rows.forEach((row, index) => {
            const snInput = row.querySelector('[name="serial_number"]');
            const typeSelect = row.querySelector('[name="type"]');
            const marqueSelect = row.querySelector('[name="marque"]');
            const modeleSelect = row.querySelector('[name="modele"]');
            const dateInput = row.querySelector('[name="date"]');
            const timeInput = row.querySelector('[name="time"]');
            const entryBadge = row.querySelector('.entry-badge');
            const entryType = entryBadge?.classList.contains('scan') ? 'scan' : 'manual';

            if (!snInput.value || !typeSelect.value || !marqueSelect.value || !modeleSelect.value) {
                isValid = false;
                row.style.backgroundColor = '#ffebee';
                return;
            }

            lotData.push({
                numero: index + 1,
                serialNumber: snInput.value,
                type: typeSelect.value,
                marqueId: marqueSelect.value,
                modeleId: modeleSelect.value,
                entryType,
                date: dateInput.value,
                time: timeInput.value
            });
        });

        if (!isValid) {
            this.showNotification('Veuillez remplir tous les champs obligatoires', 'error');
            return;
        }

        // Récupérer les informations optionnelles du lot
        const lotName = document.getElementById('input-lot-name')?.value?.trim() || null;
        const lotDetails = document.getElementById('textarea-lot-details')?.value?.trim() || null;

        try {
            console.log('📤 Envoi des données:', { items: lotData, lotName, lotDetails });
            const serverUrl = (window.APP_CONFIG && window.APP_CONFIG.serverUrl) || 'http://localhost:8060';
            const response = await fetch(`${serverUrl}/api/lots`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: lotData, lotName, lotDetails })
            });

            if (!response.ok) {
                const msg = `HTTP ${response.status}`;
                throw new Error(msg);
            }

            const data = await response.json();
            const lotId = data?.id;
            this.showNotification(`Lot #${lotId || ''} enregistré (${lotData.length} articles)`, 'success');
            
            // Générer le PDF du lot
            setTimeout(async () => {
                try {
                    const pdfResponse = await fetch(`${serverUrl}/api/lots/${lotId}/pdf`, { method: 'POST' });
                    if (pdfResponse.ok) {
                        console.log('✅ PDF généré');
                    }
                } catch (pdfError) {
                    console.warn('⚠️ Erreur génération PDF:', pdfError);
                }
                
                // Rediriger vers l'inventaire
                setTimeout(() => {
                    // Utiliser le système de navigation interne
                    const receptionNav = document.querySelector('[data-page="inventaire"][data-reception-page="true"]');
                    if (receptionNav) {
                        receptionNav.click();
                        console.log('✅ Navigation vers Inventaire');
                    } else {
                        console.log('⚠️ Bouton inventaire non trouvé, redirection URL');
                        window.location.href = '/pages/reception.html?section=inventaire';
                    }
                }, 500);
            }, 500);
        } catch (error) {
            console.error('❌ Erreur sauvegarde:', error);
            this.showNotification('Erreur lors de l\'enregistrement', 'error');
        }
    }

    /**
     * Annuler / Réinitialiser
     */
    cancelLot() {
        console.log('🔄 Réinitialisation');
        
        // Ouvrir la modale de confirmation
        this.modalManager.open('modal-clear-lot');
    }

    /**
     * Confirmer l'annulation du lot
     */
    confirmCancelLot() {
        const tbody = document.getElementById('lot-table-body');
        if (tbody) tbody.innerHTML = '';
        
        // Réinitialiser les champs d'information du lot
        const lotNameInput = document.getElementById('input-lot-name');
        const lotDetailsInput = document.getElementById('textarea-lot-details');
        if (lotNameInput) lotNameInput.value = '';
        if (lotDetailsInput) lotDetailsInput.value = '';
        
        this.currentRowNumber = 1;
        
        // Ajouter une nouvelle ligne SCAN par défaut
        setTimeout(() => {
            const row = this.createRow('', 'scan');
            tbody.appendChild(row);
        }, 100);
        
        this.modalManager.close('modal-clear-lot');
        this.showNotification('Nouveau lot initialisé', 'success');
    }

    /**
     * Soumettre une nouvelle marque
     */
    async submitNewMarque() {
        console.log('📋 Soumission marque');
        
        const input = document.getElementById('input-new-marque');
        if (!input || !input.value.trim()) {
            this.showNotification('Veuillez saisir un nom de marque', 'error');
            return;
        }

        const newMarque = input.value.trim();

        try {
            // Appel API réel
            const response = await fetch(`${window.APP_CONFIG?.serverUrl || 'http://localhost:8060'}/api/marques`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newMarque })
            });
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            
            // Ajouter à la liste locale
            this.marques.push({
                id: data.id || this.marques.length + 1,
                name: newMarque
            });
            
            this.showNotification(`Marque "${newMarque}" ajoutée`, 'success');
            this.modalManager.close('modal-add-marque');
            input.value = '';
            this.updateMarqueSelects();
        } catch (error) {
            console.error('❌ Erreur ajout marque:', error);
            this.showNotification('Erreur lors de l\'ajout de la marque', 'error');
        }
    }

    /**
     * Soumettre un nouveau modèle
     */
    async submitNewModele() {
        console.log('📋 Soumission modèle');
        
        const selectMarque = document.getElementById('select-marque-for-modele');
        const inputModele = document.getElementById('input-new-modele');

        if (!selectMarque || !inputModele || !selectMarque.value || !inputModele.value.trim()) {
            this.showNotification('Veuillez remplir tous les champs', 'error');
            return;
        }

        const marqueId = parseInt(selectMarque.value);
        const newModele = inputModele.value.trim();

        try {
            // Appel API réel
            const response = await fetch(`${window.APP_CONFIG?.serverUrl || 'http://localhost:8060'}/api/marques/${marqueId}/modeles`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newModele })
            });
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            
            // Ajouter à la liste locale
            this.modeles.push({
                id: data.id || this.modeles.length + 1,
                name: newModele,
                marque_id: marqueId
            });
            
            this.showNotification(`Modèle "${newModele}" ajouté`, 'success');
            this.modalManager.close('modal-add-modele');
            inputModele.value = '';
            selectMarque.value = '';
            this.populateMassSelects();
            
        } catch (error) {
            console.error('❌ Erreur ajout modèle:', error);
            this.showNotification('Erreur lors de l\'ajout du modèle', 'error');
        }
    }

    /**
     * Remplir le select des marques dans la modale
     */
    populateMarqueSelect() {
        const select = document.getElementById('select-marque-for-modele');
        if (!select) return;

        select.innerHTML = `
            <option value="">-- Sélectionner une marque --</option>
            ${this.marques.map(m => `<option value="${m.id}">${m.name}</option>`).join('')}
        `;
    }
    
    /**
     * Remplir les selects d'application en masse (modale)
     */
    populateMassSelects() {
        const modalMassMarque = document.getElementById('modal-mass-marque');
        const modalMassModele = document.getElementById('modal-mass-modele');
        
        if (modalMassMarque) {
            modalMassMarque.innerHTML = `
                <option value="">-- Non modifier --</option>
                ${this.marques.map(m => `<option value="${m.id}">${m.name}</option>`).join('')}
            `;
        }
        
        if (modalMassModele) {
            modalMassModele.innerHTML = `
                <option value="">-- Non modifier --</option>
                ${this.modeles.map(m => `<option value="${m.id}">${m.name}</option>`).join('')}
            `;
        }
    }
    
    /**
     * Supprimer une ligne
     */
    deleteRow(row) {
        // Stocker la ligne pour suppression dans la modale
        this.rowToDelete = row;
        this.modalManager.open('modal-confirm-delete');
    }
    
    /**
     * Confirmer la suppression d'une ligne
     */
    confirmDeleteRow() {
        if (this.rowToDelete) {
            this.rowToDelete.remove();
            this.showNotification('Ligne supprimée', 'success');
            this.renumberRows();
            this.modalManager.close('modal-confirm-delete');
            this.rowToDelete = null;
        }
    }
    
    /**
     * Renuméroter les lignes après suppression
     */
    renumberRows() {
        const tbody = document.getElementById('lot-table-body');
        if (!tbody) return;
        
        const rows = tbody.querySelectorAll('tr');
        rows.forEach((row, index) => {
            const numCell = row.querySelector('td:nth-child(2) span');
            if (numCell) numCell.textContent = index + 1;
        });
        
        this.currentRowNumber = rows.length + 1;
    }
    
    /**
     * Ouvrir la modale d'application en masse
     */
    applyMassValues() {
        const selectedRows = document.querySelectorAll('.row-checkbox:checked');
        
        if (selectedRows.length === 0) {
            this.showNotification('Sélectionnez au moins une ligne', 'error');
            return;
        }
        
        // Ouvrir la modale
        this.modalManager.open('modal-mass-apply');
        
        // Stocker le nombre de lignes sélectionnées
        const infoDiv = document.getElementById('mass-apply-info');
        if (infoDiv) {
            infoDiv.textContent = `${selectedRows.length} ligne(s) sélectionnée(s)`;
        }
    }
    
    /**
     * Confirmer l'application en masse
     */
    confirmMassApply() {
        const massType = document.getElementById('modal-mass-type')?.value;
        const massMarque = document.getElementById('modal-mass-marque')?.value;
        const massModele = document.getElementById('modal-mass-modele')?.value;
        
        const selectedRows = document.querySelectorAll('.row-checkbox:checked');
        
        if (selectedRows.length === 0) {
            this.showNotification('Aucune ligne sélectionnée', 'error');
            return;
        }
        
        selectedRows.forEach(checkbox => {
            const row = checkbox.closest('tr');
            if (!row) return;
            
            if (massType) {
                const typeSelect = row.querySelector('[name="type"]');
                if (typeSelect) typeSelect.value = massType;
            }
            
            if (massMarque) {
                const marqueSelect = row.querySelector('[name="marque"]');
                if (marqueSelect) marqueSelect.value = massMarque;
            }
            
            if (massModele) {
                const modeleSelect = row.querySelector('[name="modele"]');
                if (modeleSelect) modeleSelect.value = massModele;
            }
        });
        
        this.showNotification(`Valeurs appliquées à ${selectedRows.length} ligne(s)`, 'success');
        this.modalManager.close('modal-mass-apply');
        
        // Réinitialiser les selects et checkboxes
        document.getElementById('modal-mass-type').value = '';
        document.getElementById('modal-mass-marque').value = '';
        document.getElementById('modal-mass-modele').value = '';
        document.querySelectorAll('.row-checkbox').forEach(cb => cb.checked = false);
        document.getElementById('select-all').checked = false;
    }



    /**
     * Afficher une notification
     */
    showNotification(message, type = 'info') {
        console.log(`[${type.toUpperCase()}] ${message}`);
        
        // Créer la notification visuelle
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        
        let icon = '';
        if (type === 'success') icon = '<i class="fa-solid fa-check-circle"></i>';
        else if (type === 'error') icon = '<i class="fa-solid fa-exclamation-circle"></i>';
        else icon = '<i class="fa-solid fa-info-circle"></i>';
        
        notification.innerHTML = `${icon}<span>${message}</span>`;
        document.body.appendChild(notification);
        
        // Retirer après 3 secondes
        setTimeout(() => {
            notification.classList.add('hide');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    /**
     * Nettoyer/Détruire le manager
     */
    destroy() {
        console.log('🧹 Destruction GestionLotsManager');
        
        // Réinitialiser les flags pour permettre la réattachement des événements
        this.eventsAttached = false;
        window.__gestionLotsEventsAttached = false;
        
        // Réinitialiser les données
        this.lots = [];
        this.currentRowNumber = 1;
        
        // Vider le tableau
        const tbody = document.getElementById('lot-table-body');
        if (tbody) tbody.innerHTML = '';
        
        console.log('✅ GestionLotsManager nettoyé');
    }
}
