export default class CalendarRenderer {
  constructor(config) {
    this.calendarGrid = config.calendarGrid;
    this.calendarLabel = config.calendarLabel;
    this.loadingIndicator = config.loadingIndicator;
    this.errorIndicator = config.errorIndicator;
    this.detailsPanel = config.detailsPanel;
    this.onEventClick = config.onEventClick;
    this.onDayClick = config.onDayClick;
  }

  updateLabel(view, currentDate) {
    if (!this.calendarLabel) return;

    let label = '';
    if (view === 'week') {
      const weekStart = this.getWeekStart(currentDate);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      label = `Semaine du ${this.formatDateFR(weekStart)} au ${this.formatDateFR(weekEnd)}`;
    } else if (view === 'month') {
      label = currentDate.toLocaleString('fr-FR', { month: 'long', year: 'numeric' });
    } else if (view === 'year') {
      label = currentDate.getFullYear().toString();
    }
    this.calendarLabel.textContent = label;
  }

  resetDetails() {
    if (!this.detailsPanel) return;
    this.detailsPanel.innerHTML = '<p class="calendar-details-empty">Sélectionner un événement pour voir les détails</p>';
  }

  showLoading() {
    this.loadingIndicator?.removeAttribute('hidden');
    this.errorIndicator?.setAttribute('hidden', '');
  }

  hideLoading() {
    this.loadingIndicator?.setAttribute('hidden', '');
  }

  showError(message) {
    this.errorIndicator?.removeAttribute('hidden');
    if (this.errorIndicator) this.errorIndicator.textContent = message;
    this.hideLoading();
  }

  renderWeek(currentDate, events) {
    const weekStart = this.getWeekStart(currentDate);
    const days = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + i);
      const dateStr = this.formatLocalISODate(date);
      const dayEvents = this.filterEventsByDate(events, dateStr);

      const column = this.createDayColumn(date, days[i], dayEvents, date.getDate());
      this.calendarGrid.appendChild(column);
    }
  }

  renderMonth(currentDate, events) {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const startDate = this.getMonthStart(firstDay);
    const todayStr = this.formatLocalISODate(new Date());

    for (let i = 0; i < 42; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      const dateStr = this.formatLocalISODate(date);
      const dayEvents = this.filterEventsByDate(events, dateStr);

      const dayElement = this.createDayElement(date, month, todayStr, dayEvents);
      this.calendarGrid.appendChild(dayElement);
    }
  }

  renderYear(currentDate, events) {
    const year = currentDate.getFullYear();

    for (let month = 0; month < 12; month++) {
      const monthDate = new Date(year, month, 1);
      const monthEvents = events.filter(ev => {
        const eventDate = new Date(ev.start);
        return eventDate.getMonth() === month && eventDate.getFullYear() === year;
      });

      const card = this.createMonthCard(monthDate, monthEvents);
      this.calendarGrid.appendChild(card);
    }
  }

  createDayColumn(date, dayName, events, dayNumber) {
    const column = document.createElement('div');
    column.className = 'calendar-day';

    const header = document.createElement('div');
    header.className = 'calendar-day-header';
    header.innerHTML = `
            <span class="calendar-day-name">${dayName}</span>
            <span class="calendar-day-number">${dayNumber}</span>
        `;
    column.appendChild(header);

    const eventContainer = this.createEventContainer(events);
    column.appendChild(eventContainer);

    column.addEventListener('click', (e) => {
      if (e.target === column || e.target === header || e.target.parentElement === header) {
        this.onDayClick?.(date);
      }
    });

    return column;
  }

  createDayElement(date, currentMonth, todayStr, events) {
    const dateStr = this.formatLocalISODate(date);
    const dayElement = document.createElement('div');
    dayElement.className = 'calendar-day';

    if (date.getMonth() !== currentMonth) {
      dayElement.classList.add('other-month');
    }
    if (dateStr === todayStr) {
      dayElement.classList.add('today');
    }

    const header = document.createElement('div');
    header.className = 'calendar-day-header';
    header.innerHTML = `
            <span class="calendar-day-name">${date.toLocaleDateString('fr-FR', { weekday: 'short' })}</span>
            <span class="calendar-day-number">${date.getDate()}</span>
        `;
    dayElement.appendChild(header);

    const eventsContainer = this.createEventContainer(events);
    dayElement.appendChild(eventsContainer);

    dayElement.addEventListener('click', (e) => {
      if (e.target === dayElement || e.target === header || e.target.parentElement === header) {
        this.onDayClick?.(date);
      }
    });

    return dayElement;
  }

  createMonthCard(monthDate, events) {
    const card = document.createElement('div');
    card.className = 'calendar-month';

    const header = document.createElement('div');
    header.className = 'calendar-day-header';
    header.innerHTML = `
            <span class="calendar-day-name">${monthDate.toLocaleDateString('fr-FR', { month: 'long' })}</span>
            <span class="calendar-month-number">${events.length} évènement(s)</span>
        `;
    card.appendChild(header);

    const eventContainer = this.createEventContainer(events.slice(0, 4));
    card.appendChild(eventContainer);

    return card;
  }

  createEventContainer(events) {
    const container = document.createElement('div');
    container.className = 'calendar-events';

    if (events.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'calendar-details-empty';
      empty.textContent = '—';
      container.appendChild(empty);
    } else {
      events.forEach(ev => {
        const chip = this.createEventChip(ev);
        container.appendChild(chip);
      });
    }

    return container;
  }

  createEventChip(ev) {
    const button = document.createElement('button');
    button.className = 'calendar-event-chip';
    button.type = 'button';

    const timeStr = ev.start.substring(11, 16);

    const titleEl = document.createElement('div');
    titleEl.className = 'calendar-event-chip-title';
    titleEl.textContent = ev.title;

    const timeEl = document.createElement('div');
    timeEl.className = 'calendar-event-chip-time';
    timeEl.textContent = timeStr;

    button.appendChild(titleEl);
    button.appendChild(timeEl);

    const eventColor = ev.color || '#3788d8';
    button.style.backgroundColor = eventColor + '20';
    button.style.borderLeft = `4px solid ${eventColor}`;
    button.style.alignItems = 'flex-start';

    button.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onEventClick?.(ev);
    });

    return button;
  }

  displayEventDetails(ev, onEditClick) {
    if (!this.detailsPanel) return;

    const startDate = new Date(ev.start.replace(' ', 'T'));
    const endDate = new Date(ev.end.replace(' ', 'T'));

    const startDateStr = ev.start.substring(0, 10);
    const endDateStr = ev.end.substring(0, 10);
    const isSameDay = startDateStr === endDateStr;

    const startDateLabel = startDate.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    const endDateLabel = endDate.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    const startTime = startDate.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit'
    });

    const endTime = endDate.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit'
    });

    let dateTimeLabel = '';
    if (isSameDay) {
      dateTimeLabel = `${startDateLabel}<br><strong>Heure: </strong>${startTime} à ${endTime}`;
    } else {
      dateTimeLabel = `${startDateLabel} à ${endDateLabel}`;
    }

    this.detailsPanel.innerHTML = `
        <div class="detail-content">
            <h3>${ev.title}</h3>
            <p><strong>Période: </strong>${dateTimeLabel}</p>
            ${ev.description ? `<p><strong>Lieux:</strong> ${ev.description}</p>` : ''}
        </div>
            <button type="button" class="btn btn-primary" id="detail-edit-btn">Éditer</button>
        `;

    document.getElementById('detail-edit-btn')?.addEventListener('click', () => {
      onEditClick?.(ev);
    });
  }

  filterEventsByDate(events, dateStr) {
    return events.filter(ev => {
      const eventStart = ev.start.substring(0, 10);
      const eventEnd = ev.end.substring(0, 10);
      return dateStr >= eventStart && dateStr <= eventEnd;
    });
  }

  getWeekStart(date) {
    const weekStart = new Date(date);
    const day = weekStart.getDay();
    const diff = weekStart.getDate() - (day === 0 ? 6 : day - 1);
    weekStart.setDate(diff);
    return weekStart;
  }

  getMonthStart(firstDay) {
    const startDate = new Date(firstDay);
    const dayOfWeek = startDate.getDay();
    const adjustedDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    startDate.setDate(1 - adjustedDay);
    return startDate;
  }

  formatLocalISODate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  formatDateFR(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    return `${day}/${month}/${year}`;
  }

  clear() {
    if (this.calendarGrid) {
      this.calendarGrid.innerHTML = '';
    }
  }
}
