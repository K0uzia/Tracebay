// /public/assets/js/modules/agenda/agenda.js - Calendar with Home Design
// Version Workspace 1.0 - Adapté pour stockage local (localStorage)
// Structure prête pour intégration BDD

import AgendaStore from './AgendaStore.js';

// Réinitialiser les variables globales à chaque chargement du module
let currentDate = new Date();
let currentView = 'week'; // 'week', 'month', 'year'

// Fonction de cleanup globale
function cleanupAgenda() {
    // Retirer les listeners en clonant les éléments pour supprimer tous les listeners
    const elementsToClean = [
        ...document.querySelectorAll('[data-calendar-nav]'),
        ...document.querySelectorAll('.calendar-view-btn'),
        ...document.querySelectorAll('[data-close]'),
        document.getElementById('createEventForm'),
        document.getElementById('editEventForm'),
        document.getElementById('triggerDeleteBtn'),
        document.getElementById('confirmDeleteBtn'),
        document.getElementById('create_all_day'),
        document.getElementById('edit_all_day'),
        document.getElementById('addEventBtn')
    ].filter(el => el !== null);
    
    elementsToClean.forEach(el => {
        const newEl = el.cloneNode(true);
        el.parentNode?.replaceChild(newEl, el);
    });
}

// Color management
class ColorManager {
    constructor() {
        this.storageKey = 'agenda_favorite_colors';
        this.defaultColors = ['#3788d8', '#43c466', '#fdb544'];
        this.initializeFavorites();
    }

    initializeFavorites() {
        const stored = localStorage.getItem(this.storageKey);
        if (!stored) {
            localStorage.setItem(this.storageKey, JSON.stringify(this.defaultColors));
        }
    }

    getFavorites() {
        try {
            return JSON.parse(localStorage.getItem(this.storageKey)) || this.defaultColors;
        } catch (e) {
            return this.defaultColors;
        }
    }

    addFavorite(color) {
        const favorites = this.getFavorites();
        if (!favorites.includes(color)) {
            favorites.unshift(color);
            if (favorites.length > 12) favorites.pop();
            localStorage.setItem(this.storageKey, JSON.stringify(favorites));
        }
    }

    removeFavorite(color) {
        const favorites = this.getFavorites().filter(c => c !== color);
        localStorage.setItem(this.storageKey, JSON.stringify(favorites));
    }
}

// Classe principale pour gérer l'agenda (pour future utilisation)
class AgendaManager {
    constructor() {
        this.currentDate = new Date();
        this.currentView = 'week';
        this.selectedEvent = null;
        this.colorManager = new ColorManager();
        this.eventListeners = new Map();
        this.initialized = false;
    }
}

/* ===========================================
   SETUP FUNCTIONS
   =========================================== */

function setupNavigation() {
    // Navigation (Previous/Next buttons)
    document.querySelectorAll('[data-calendar-nav]').forEach(btn => {
        btn.addEventListener('click', () => {
            const delta = parseInt(btn.getAttribute('data-calendar-nav'));
            if (currentView === 'week') {
                currentDate.setDate(currentDate.getDate() + delta * 7);
            } else if (currentView === 'month') {
                currentDate.setMonth(currentDate.getMonth() + delta);
            } else if (currentView === 'year') {
                currentDate.setFullYear(currentDate.getFullYear() + delta);
            }
            renderCalendar().catch(err => console.error('❌ Erreur rendu:', err));
        });
    });

    // Add Event button
    document.getElementById('addEventBtn')?.addEventListener('click', () => {
        openCreateModal(new Date());
    });
}

function setupViewSwitch() {
    // Calendar view switch buttons (Week/Month/Year)
    document.querySelectorAll('.calendar-view-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.calendar-view-btn').forEach(b => b.classList.remove('is-active'));
            btn.classList.add('is-active');
            currentView = btn.getAttribute('data-calendar-view');
            renderCalendar().catch(err => console.error('❌ Erreur rendu:', err));
        });
    });
}

/* ===========================================
   CORE RENDERING LOGIC (NEW HOME DESIGN)
   =========================================== */

async function renderCalendar() {
    // Reset details panel
    resetDetails();

    // Update calendar grid class based on view
    calendarGrid.className = `calendar-grid calendar-grid--${currentView}`;
    calendarGrid.innerHTML = '';

    // Update label
    updateCalendarLabel();

    // Show loading
    loadingIndicator?.removeAttribute('hidden');
    errorIndicator?.setAttribute('hidden', '');

    try {
        // Fetch events from local store
        const { startDate, endDate } = getDateRange();
        const events = await AgendaStore.getEventsByRange(startDate, endDate);

        // Render based on current view
        if (currentView === 'week') {
            renderWeekView(events);
        } else if (currentView === 'month') {
            renderMonthView(events);
        } else if (currentView === 'year') {
            renderYearView(events);
        }

        loadingIndicator?.setAttribute('hidden', '');
    } catch (err) {
        console.error('❌ Erreur rendu calendrier:', err);
        errorIndicator?.removeAttribute('hidden');
        errorIndicator.textContent = 'Erreur lors du chargement du calendrier';
        loadingIndicator?.setAttribute('hidden', '');
    }
}

function resetDetails() {
    if (!detailsPanel) return;
    selectedEvent = null;
    detailsPanel.innerHTML = `<p class="calendar-details-empty">Sélectionner un événement pour voir les détails</p>`;
}

function updateCalendarLabel() {
    let label = '';
    if (currentView === 'week') {
        const weekStart = new Date(currentDate);
        const day = weekStart.getDay();
        const diff = weekStart.getDate() - (day === 0 ? 6 : day - 1);
        weekStart.setDate(diff);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        
        const startDateStr = formatDateFR(weekStart);
        const endDateStr = formatDateFR(weekEnd);
        label = `Semaine du ${startDateStr} au ${endDateStr}`;
    } else if (currentView === 'month') {
        label = currentDate.toLocaleString('fr-FR', { month: 'long', year: 'numeric' });
    } else if (currentView === 'year') {
        label = currentDate.getFullYear().toString();
    }
    calendarLabel.textContent = label;
}

function getDateRange() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    let startDate, endDate;

    if (currentView === 'week') {
        startDate = new Date(currentDate);
        const day = startDate.getDay();
        const diff = startDate.getDate() - (day === 0 ? 6 : day - 1);
        startDate.setDate(diff);
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
    } else if (currentView === 'month') {
        startDate = new Date(year, month, 1);
        let dayOfWeek = startDate.getDay();
        let adjustedDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        startDate.setDate(1 - adjustedDay);
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 41);
    } else if (currentView === 'year') {
        startDate = new Date(year, 0, 1);
        endDate = new Date(year, 11, 31);
    }

    return {
        startDate: formatLocalISODate(startDate),
        endDate: formatLocalISODate(endDate)
    };
}

function renderWeekView(events) {
    const weekStart = new Date(currentDate);
    const day = weekStart.getDay();
    const diff = weekStart.getDate() - (day === 0 ? 6 : day - 1);
    weekStart.setDate(diff);

    const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
    for (let i = 0; i < 7; i++) {
        const date = new Date(weekStart);
        date.setDate(weekStart.getDate() + i);
        const dateStr = formatLocalISODate(date);

        // Vérifier les événements qui incluent cette date
        const dayEvents = events.filter(ev => {
            const eventStart = ev.start.substring(0, 10); // YYYY-MM-DD
            const eventEnd = ev.end.substring(0, 10);     // YYYY-MM-DD
            return dateStr >= eventStart && dateStr <= eventEnd;
        });
        
        const column = document.createElement('div');
        column.className = 'calendar-day';

        const header = document.createElement('div');
        header.className = 'calendar-day-header';
        header.innerHTML = `
            <span class="calendar-day-name">${days[i]}</span>
            <span class="calendar-day-number">${date.getDate()}</span>
        `;
        column.appendChild(header);

        const eventContainer = document.createElement('div');
        eventContainer.className = 'calendar-events';

        if (dayEvents.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'calendar-details-empty';
            empty.textContent = '—';
            eventContainer.appendChild(empty);
        } else {
            dayEvents.forEach((event) => {
                const chip = createEventChip(event);
                eventContainer.appendChild(chip);
            });
        }

        column.appendChild(eventContainer);

        // Click to create event
        column.addEventListener('click', (e) => {
            if (e.target === column || e.target === header || e.target.parentElement === header) {
                openCreateModal(date);
            }
        });

        calendarGrid.appendChild(column);
    }
}

function renderMonthView(events) {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDayOfMonth = new Date(year, month, 1);
    let dayOfWeek = firstDayOfMonth.getDay();
    let adjustedDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

    const startDate = new Date(year, month, 1 - adjustedDay);
    const todayStr = formatLocalISODate(new Date());

    for (let i = 0; i < 42; i++) {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + i);
        const dateStr = formatLocalISODate(date);

        const dayElement = document.createElement('div');
        dayElement.className = 'calendar-day';

        if (date.getMonth() !== month) {
            dayElement.classList.add('other-month');
        }
        if (dateStr === todayStr) {
            dayElement.classList.add('today');
        }

        // Day header
        const header = document.createElement('div');
        header.className = 'calendar-day-header';
        header.innerHTML = `
            <span class="calendar-day-name">${date.toLocaleDateString('fr-FR', { weekday: 'short' })}</span>
            <span class="calendar-day-number">${date.getDate()}</span>
        `;
        dayElement.appendChild(header);

        // Events container
        const eventsContainer = document.createElement('div');
        eventsContainer.className = 'calendar-events';

        // Vérifier les événements qui incluent cette date
        const dayEvents = events.filter(ev => {
            const eventStart = ev.start.substring(0, 10); // YYYY-MM-DD
            const eventEnd = ev.end.substring(0, 10);     // YYYY-MM-DD
            return dateStr >= eventStart && dateStr <= eventEnd;
        });

        if (dayEvents.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'calendar-details-empty';
            empty.textContent = '—';
            eventsContainer.appendChild(empty);
        } else {
            // Afficher tous les événements avec scroll
            dayEvents.forEach(ev => {
                const chip = createEventChip(ev);
                eventsContainer.appendChild(chip);
            });
        }

        dayElement.appendChild(eventsContainer);

        // Click to create event
        dayElement.addEventListener('click', (e) => {
            if (e.target === dayElement || e.target === header || e.target.parentElement === header) {
                openCreateModal(date);
            }
        });

        calendarGrid.appendChild(dayElement);
    }
}

function renderYearView(events) {
    const year = currentDate.getFullYear();

    for (let month = 0; month < 12; month++) {
        const monthDate = new Date(year, month, 1);
        const card = document.createElement('div');
        card.className = 'calendar-month';

        const monthEvents = events.filter(ev => {
            const eventDate = new Date(ev.start);
            return eventDate.getMonth() === month && eventDate.getFullYear() === year;
        });

        const header = document.createElement('div');
        header.className = 'calendar-day-header';
        header.innerHTML = `
            <span class="calendar-day-name">${monthDate.toLocaleDateString('fr-FR', { month: 'long' })}</span>
            <span class="calendar-month-number">${monthEvents.length} évènement(s)</span>
        `;
        card.appendChild(header);

        const eventContainer = document.createElement('div');
        eventContainer.className = 'calendar-events';

        if (monthEvents.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'calendar-details-empty';
            empty.textContent = '—';
            eventContainer.appendChild(empty);
        } else {
            // Afficher jusqu'à 4 événements avec scroll pour les autres
            monthEvents.slice(0, 4).forEach((event) => {
                const chip = createEventChip(event);
                eventContainer.appendChild(chip);
            });
        }

        card.appendChild(eventContainer);
        calendarGrid.appendChild(card);
    }
}

function createEventChip(ev) {
    const button = document.createElement('button');
    button.className = 'calendar-event-chip';
    button.type = 'button';

    const timeStr = ev.start.substring(11, 16); // HH:MM

    // Créer la structure HTML interne
    const titleEl = document.createElement('div');
    titleEl.className = 'calendar-event-chip-title';
    titleEl.textContent = ev.title;

    const timeEl = document.createElement('div');
    timeEl.className = 'calendar-event-chip-time';
    timeEl.textContent = timeStr;

    button.appendChild(titleEl);
    button.appendChild(timeEl);

    // Gestion du style des events dans l'agenda
    const eventColor = ev.color || '#3788d8';
    const backgroundColor = eventColor + '20'; // Ajouter la transparence
    button.style.backgroundColor = backgroundColor;
    button.style.borderLeft = `4px solid ${eventColor}`;
    button.style.alignItems = 'flex-start';

    button.addEventListener('click', (e) => {
        e.stopPropagation();
        displayEventDetails(ev);
    });

    return button;
}

function displayEventDetails(ev) {
    selectedEvent = ev;

    if (!detailsPanel) return;

    const startDate = new Date(ev.start.replace(' ', 'T'));
    const endDate = new Date(ev.end.replace(' ', 'T'));

    // Extraire les dates et heures
    const startDateStr = ev.start.substring(0, 10); // YYYY-MM-DD
    const endDateStr = ev.end.substring(0, 10);     // YYYY-MM-DD
    const isSameDay = startDateStr === endDateStr;

    // Formater les dates
    const startDateLabel = startDate.toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });

    const endDateLabel = endDate.toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });

    const startTime = startDate.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
    });

    const endTime = endDate.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
    });

    // Construire le label de date/heure
    let dateTimeLabel = '';
    if (isSameDay) {
        // Même jour: afficher la date et les heures
        dateTimeLabel = `${startDateLabel}<br><strong>Heure: </strong>${startTime} à ${endTime}`;
    } else {
        // Plusieurs jours: afficher la plage complète
        dateTimeLabel = `${startDateLabel} à ${endDateLabel}`;
    }

    detailsPanel.innerHTML = `
    <div class="detail-content">
        <h3>${ev.title}</h3>
        <p><strong>Période: </strong>${dateTimeLabel}</p>
        ${ev.description ? `<p><strong>Lieux:</strong> ${ev.description}</p>` : ''}
    </div>
        <button type="button" class="btn btn-primary" id="detail-edit-btn">Éditer</button>
    `;

    document.getElementById('detail-edit-btn')?.addEventListener('click', () => {
        openEditModal(ev);
    });
}

/* ===========================================
   MODAL LOGIC
   =========================================== */

function showModal(modalEl) {
    modalEl.showModal();
    // NE PAS appeler updateColorPalettes() ici
}

function closeModal(modalEl) {
    modalEl.close();
}

function updateColorPalettes() {
    // Update create modal palette
    updateColorPalette('create');
    // Update edit modal palette
    updateColorPalette('edit');
}

function updateColorPalette(modalType) {
    const favorites = colorManager.getFavorites();
    const container = document.getElementById(`${modalType}-color-favorites`);
    const colorInput = document.getElementById(`${modalType}_color`);

    if (!container) return;

    container.innerHTML = '';
    
    // Afficher chaque couleur favorite avec un bouton de suppression
    favorites.forEach(color => {
        const wrapper = document.createElement('div');
        wrapper.className = 'color-favorite-wrapper';
        wrapper.style.position = 'relative';
        wrapper.style.display = 'inline-block';

        // Bouton de couleur
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'color-favorite-btn';
        btn.style.backgroundColor = color;
        btn.title = color;
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            colorInput.value = color;
        });
        wrapper.appendChild(btn);

        // Bouton de suppression (icône Font Awesome)
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'color-favorite-delete';
        deleteBtn.title = 'Supprimer cette couleur';
        deleteBtn.innerHTML = '<i class="fas fa-times"></i>';
        deleteBtn.style.position = 'absolute';
        deleteBtn.style.top = '-8px';
        deleteBtn.style.right = '-8px';
        deleteBtn.style.width = '20px';
        deleteBtn.style.height = '20px';
        deleteBtn.style.padding = '0';
        deleteBtn.style.borderRadius = '50%';
        deleteBtn.style.backgroundColor = '#e74c3c';
        deleteBtn.style.color = 'white';
        deleteBtn.style.border = 'none';
        deleteBtn.style.cursor = 'pointer';
        deleteBtn.style.display = 'flex';
        deleteBtn.style.alignItems = 'center';
        deleteBtn.style.justifyContent = 'center';
        deleteBtn.style.fontSize = '10px';
        deleteBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            colorManager.removeFavorite(color);
            updateColorPalette(modalType);
        });
        wrapper.appendChild(deleteBtn);

        container.appendChild(wrapper);
    });
}

function setupColorPickerListeners() {
    // Create modal color handlers
    const createColorBtn = document.getElementById('create_add_color_btn');
    const createColorInput = document.getElementById('create_color');
    
    if (createColorBtn && createColorInput) {
        createColorBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const color = createColorInput.value;
            colorManager.addFavorite(color);
            updateColorPalette('create');
        });
    }

    // Edit modal color handlers
    const editColorBtn = document.getElementById('edit_add_color_btn');
    const editColorInput = document.getElementById('edit_color');
    
    if (editColorBtn && editColorInput) {
        editColorBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const color = editColorInput.value;
            colorManager.addFavorite(color);
            updateColorPalette('edit');
        });
    }
}

function setupModalListeners() {
    // Close button handlers
    document.querySelectorAll('[data-close]').forEach(btn => {
        btn.addEventListener('click', () => {
            const modalId = btn.getAttribute('data-close');
            document.getElementById(modalId)?.close();
        });
    });

    // Color picker listeners
    setupColorPickerListeners();    // Form submissions
    document.getElementById('createEventForm')?.addEventListener('submit', handleCreateSubmit);
    document.getElementById('editEventForm')?.addEventListener('submit', handleEditSubmit);

    // Delete trigger in edit modal
    document.getElementById('triggerDeleteBtn')?.addEventListener('click', () => {
        closeModal(editModal);
        const id = document.getElementById('edit_eventId').value;
        const title = document.getElementById('edit_title').value;
        openDeleteModal(id, title);
    });

    // Delete confirmation
    document.getElementById('confirmDeleteBtn')?.addEventListener('click', handleDeleteConfirm);

    // All day checkbox handler
    document.getElementById('create_all_day')?.addEventListener('change', toggleAllDayFields);
    document.getElementById('edit_all_day')?.addEventListener('change', toggleEditAllDayFields);
}

// --- CREATE ---
function toggleAllDayFields() {
    const allDayCheckbox = document.getElementById('create_all_day');
    const timeSection = document.getElementById('create-time-section');

    if (allDayCheckbox.checked) {
        timeSection?.setAttribute('hidden', '');
    } else {
        timeSection?.removeAttribute('hidden');
    }
}

function toggleEditAllDayFields() {
    const allDayCheckbox = document.getElementById('edit_all_day');
    const timeSection = document.getElementById('edit-time-section');

    if (allDayCheckbox.checked) {
        timeSection?.setAttribute('hidden', '');
    } else {
        timeSection?.removeAttribute('hidden');
    }
}

function openCreateModal(dateObj) {
    const form = document.getElementById('createEventForm');
    form?.reset();

    // Set default color
    const colorInput = document.getElementById('create_color');
    if (colorInput) {
        colorInput.value = '#3788d8';
    }

    // Reset all day checkbox
    const allDayCheckbox = document.getElementById('create_all_day');
    if (allDayCheckbox) {
        allDayCheckbox.checked = false;
        toggleAllDayFields();
    }

    // Pre-fill date and time only if dateObj is provided (clicked on a date)
    if (dateObj) {
        const ymd = formatLocalISODate(dateObj);
        if (document.getElementById('create_date')) {
            document.getElementById('create_date').value = ymd;
        }
        if (document.getElementById('create_end_date')) {
            document.getElementById('create_end_date').value = ymd;
        }
    }

    if (document.getElementById('create_start_time')) {
        document.getElementById('create_start_time').value = '09:00';
    }
    if (document.getElementById('create_end_time')) {
        document.getElementById('create_end_time').value = '10:00';
    }

    syncDateInputs('create_date', 'create_end_date', { forceUpdate: true });

    // Charger les couleurs favorites avant d'afficher le modal
    updateColorPalette('create');
    showModal(createModal);
}

async function handleCreateSubmit(e) {
    e.preventDefault();
    const form = e.target;

    const isAllDay = document.getElementById('create_all_day')?.checked || false;
    const startDate = document.getElementById('create_date')?.value || '';
    const endDate = document.getElementById('create_end_date')?.value || startDate;
    const title = document.getElementById('create_title')?.value || '';
    const color = document.getElementById('create_color')?.value || '#3788d8';
    const description = document.getElementById('create_description')?.value || '';

    if (!title || !startDate || !endDate) {
        alert('Veuillez remplir les champs obligatoires');
        return;
    }

    let startTime = '00:00';
    let endTime = '23:59';

    // If not all day, use the specified times
    if (!isAllDay) {
        startTime = document.getElementById('create_start_time')?.value || '09:00';
        endTime = document.getElementById('create_end_time')?.value || '10:00';
    }

    const event = {
        title,
        start: `${startDate}T${startTime}:00`,
        end: `${endDate}T${endTime}:00`,
        color,
        description,
        all_day: isAllDay
    };

    try {
        const newEvent = await AgendaStore.addEvent(event);
        
        closeModal(createModal);
        await renderCalendar();
        showConfirmationModal('Succès', `L'événement "${title}" a été créé avec succès.`, 'success');
    } catch (error) {
        console.error('❌ Erreur création événement:', error);
        showConfirmationModal('Erreur', 'Une erreur est survenue lors de la création de l\'événement.', 'error');
    }
}

// --- EDIT ---
function openEditModal(ev) {
    const form = document.getElementById('editEventForm');
    form?.reset();

    document.getElementById('edit_eventId').value = ev.id;
    document.getElementById('edit_title').value = ev.title;

    // Parser start et end pour extraire dates et heures
    const startDate = new Date(ev.start.replace(' ', 'T'));
    const endDate = new Date(ev.end.replace(' ', 'T'));

    const startDateStr = formatLocalISODate(startDate);
    const endDateStr = formatLocalISODate(endDate);
    const startTimeStr = startDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const endTimeStr = endDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    // Set all day checkbox based on event data
    const isAllDay = ev.all_day || (startTimeStr === '00:00' && endTimeStr === '23:59');
    if (document.getElementById('edit_all_day')) {
        document.getElementById('edit_all_day').checked = isAllDay;
        toggleEditAllDayFields();
    }

    if (document.getElementById('edit_date')) {
        document.getElementById('edit_date').value = startDateStr;
    }
    if (document.getElementById('edit_end_date')) {
        document.getElementById('edit_end_date').value = endDateStr;
    }
    if (document.getElementById('edit_start_time')) {
        document.getElementById('edit_start_time').value = startTimeStr;
    }
    if (document.getElementById('edit_end_time')) {
        document.getElementById('edit_end_time').value = endTimeStr;
    }

    document.getElementById('edit_description').value = ev.description || '';

    // Select correct color
    const colorToSelect = ev.color || '#3788d8';
    if (document.getElementById('edit_color')) {
        document.getElementById('edit_color').value = colorToSelect;
    }

    syncDateInputs('edit_date', 'edit_end_date', { forceUpdate: true });
    
    // Charger les couleurs favorites avant d'afficher le modal
    updateColorPalette('edit');
    showModal(editModal);
}

async function handleEditSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const id = document.getElementById('edit_eventId').value;

    // Récupérer les données du formulaire
    const title = document.getElementById('edit_title')?.value || '';
    const startDate = document.getElementById('edit_date')?.value || '';
    const endDate = document.getElementById('edit_end_date')?.value || startDate;
    const isAllDay = document.getElementById('edit_all_day')?.checked || false;
    const startTime = isAllDay ? '00:00' : (document.getElementById('edit_start_time')?.value || '09:00');
    const endTime = isAllDay ? '23:59' : (document.getElementById('edit_end_time')?.value || '10:00');
    const color = document.getElementById('edit_color')?.value || '#3788d8';
    const description = document.getElementById('edit_description')?.value || '';

    if (!title || !startDate || !endDate) {
        alert('Veuillez remplir les champs obligatoires');
        return;
    }

    const updates = {
        title,
        start: `${startDate}T${startTime}:00`,
        end: `${endDate}T${endTime}:00`,
        color,
        description,
        all_day: isAllDay
    };

    try {
        await AgendaStore.updateEvent(id, updates);
        
        closeModal(editModal);
        await renderCalendar();
        showConfirmationModal('Succès', `L'événement "${title}" a été modifié avec succès.`, 'success');
    } catch (error) {
        console.error('❌ Erreur modification événement:', error);
        showConfirmationModal('Erreur', 'Une erreur est survenue lors de la modification de l\'événement.', 'error');
    }
}

// --- DELETE ---
function openDeleteModal(id, title) {
    document.getElementById('delete_eventId').value = id;
    document.getElementById('delete-event-title').textContent = title;
    showModal(deleteModal);
}

async function handleDeleteConfirm() {
    const id = document.getElementById('delete_eventId').value;

    try {
        const success = await AgendaStore.deleteEvent(id);
        if (success) {
            closeModal(deleteModal);
            await renderCalendar();
            showConfirmationModal('Succès', 'L\'événement a été supprimé avec succès.', 'success');
        } else {
            showConfirmationModal('Erreur', 'L\'événement est introuvable.', 'error');
        }
    } catch (error) {
        console.error('❌ Erreur suppression:', error);
        showConfirmationModal('Erreur', 'Une erreur est survenue lors de la suppression.', 'error');
    }
}


/* ===========================================
   CONFIRMATION MODAL
   =========================================== */

function showConfirmationModal(title, message, type = 'success') {
    // Create modal dynamically
    const modal = document.createElement('dialog');
    modal.className = 'universal-modal confirmation-modal';
    
    const iconType = type === 'success' ? 'success' : 'error';
    const iconHTML = type === 'success' 
        ? '<i class="fas fa-check"></i>' 
        : '<i class="fas fa-exclamation-circle"></i>';
    
    const buttonClass = type === 'success' ? 'btn-primary' : 'btn-secondary';
    const buttonText = type === 'success' ? 'Fermer' : 'Ok';
    
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <button type="button" class="modal-close-btn" aria-label="Fermer"><span>&times;</span></button>
            </div>
            <div class="modal-body">
                <div class="confirmation-icon ${iconType}">
                    ${iconHTML}
                </div>
                <p>${title}</p>
                <p style="color: #666; margin-top: 0.5rem;">${message}</p>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn ${buttonClass}" data-close-confirmation>
                    ${buttonText}
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    modal.showModal();
    
    // Close button handler
    const closeBtn = modal.querySelector('.modal-close-btn');
    const confirmBtn = modal.querySelector('[data-close-confirmation]');
    
    const closeHandler = () => {
        modal.close();
        setTimeout(() => modal.remove(), 300);
    };
    
    closeBtn.addEventListener('click', closeHandler);
    confirmBtn.addEventListener('click', closeHandler);
    
    // Auto-close after 3 seconds for success
    if (type === 'success') {
        setTimeout(closeHandler, 3000);
    }
}

/* ===========================================
   HELPERS & UTILITIES
   =========================================== */

// Format date as YYYY-MM-DD (respecting local timezone)
function formatLocalISODate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Format date as JJ/MM/AA (French format for display)
function formatDateFR(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    return `${day}/${month}/${year}`;
}

function formatLocalDateTime(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function syncDateInputs(startId, endId, options = {}) {
    const startInput = document.getElementById(startId);
    const endInput = document.getElementById(endId);
    if (!startInput || !endInput) {
        return;
    }

    const ensureOrder = () => {
        if (!startInput.value) {
            return;
        }

        endInput.min = startInput.value;

        if (!endInput.value || endInput.value < startInput.value) {
            const baseDate = new Date(startInput.value);
            if (Number.isNaN(baseDate.getTime())) {
                return;
            }
            baseDate.setHours(baseDate.getHours() + 1);
            endInput.value = formatLocalDateTime(baseDate);
        }
    };

    if (!startInput.dataset.syncBound) {
        ['change', 'input'].forEach(evt => {
            startInput.addEventListener(evt, ensureOrder);
        });
        startInput.dataset.syncBound = 'true';
    }

    if (options.forceUpdate) {
        ensureOrder();
    }
}

// ========== AUTO-INITIALIZATION ==========
// Initialiser le calendrier au chargement du module
const colorManager = new ColorManager();

const calendarGrid = document.getElementById('dashboard-calendar-grid');
const calendarLabel = document.getElementById('dashboard-calendar-label');
const loadingIndicator = document.getElementById('dashboard-calendar-loading');
const errorIndicator = document.getElementById('dashboard-calendar-error');
const detailsPanel = document.getElementById('public-calendar-details');

const createModal = document.getElementById('agenda-create-modal');
const editModal = document.getElementById('agenda-edit-modal');
const deleteModal = document.getElementById('agenda-delete-modal');

let selectedEvent = null;

// Init
if (calendarGrid) {
    renderCalendar().catch(err => console.error('❌ Erreur initialisation calendrier:', err));
    setupNavigation();
    setupViewSwitch();
    setupModalListeners();
}