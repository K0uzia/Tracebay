# 📅 Agenda (Calendar)

## Vue d'ensemble

L'agenda est le module calendrier du projet. Il permet de créer, éditer, supprimer et afficher les événements dans une vue calendrier.

## Fichiers clés

```
public/
├── pages/
│   └── agenda.html              # Page HTML
├── assets/
│   ├── css/modules/
│   │   └── agenda.css           # Styles agenda
│   └── js/modules/
│       └── agenda/
│           └── agenda.js        # Logique agenda

routes/
└── agenda.js                     # API endpoints

models/
└── events.js                     # CRUD operations

database.js                        # Schema (events, event_recurrences)
```

## Architecture

```
┌─────────────────────────────────────────────┐
│         Frontend (public/)                   │
│  ┌────────────────────────────────────────┐  │
│  │   agenda.html (HTML template)          │  │
│  │   - Navigation (prev/next month)      │  │
│  │   - Calendar grid (days)              │  │
│  │   - Event list                        │  │
│  └────────────────────────────────────────┘  │
│                    │                          │
│  ┌────────────────────────────────────────┐  │
│  │   agenda.js (Controller)               │  │
│  │   - Load events from API              │  │
│  │   - Render calendar UI                │  │
│  │   - Handle user interactions          │  │
│  │   - Show/hide modals                  │  │
│  └────────────────────────────────────────┘  │
│                    │                          │
└────────────────────┼──────────────────────────┘
                     │
              HTTP REST API
              (fetch calls)
                     │
┌────────────────────┼──────────────────────────┐
│       Backend (routes/)                       │
│  ┌────────────────────────────────────────┐  │
│  │   routes/agenda.js                     │  │
│  │   - GET  /api/agenda/events           │  │
│  │   - POST /api/agenda/events           │  │
│  │   - PUT  /api/agenda/events/:id       │  │
│  │   - DELETE /api/agenda/events/:id     │  │
│  └────────────────────────────────────────┘  │
│                    │                          │
│  ┌────────────────────────────────────────┐  │
│  │   models/events.js (Data Layer)        │  │
│  │   - CRUD operations                   │  │
│  │   - Validation                        │  │
│  │   - Database queries                  │  │
│  └────────────────────────────────────────┘  │
│                    │                          │
│  ┌────────────────────────────────────────┐  │
│  │   database.js (SQLite)                 │  │
│  │   - events table                      │  │
│  │   - event_recurrences table           │  │
│  └────────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

## Base de données

### Table: events

```sql
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  start_time TEXT NOT NULL,      -- ISO 8601 format
  end_time TEXT NOT NULL,        -- ISO 8601 format
  location TEXT,
  color TEXT DEFAULT '#3788d8',  -- Hex color
  user_id INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT                -- Soft delete
);
```

### Table: event_recurrences

```sql
CREATE TABLE event_recurrences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  recurrence_type TEXT,  -- 'daily', 'weekly', 'monthly', 'yearly'
  recurrence_end TEXT,   -- ISO 8601 (optional)
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (event_id) REFERENCES events(id)
);
```

## API Endpoints

### Lister les événements

```http
GET /api/agenda/events?start=2024-01-01&end=2024-01-31
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "title": "Team Meeting",
      "description": "Weekly standup",
      "start_time": "2024-01-15T10:00:00",
      "end_time": "2024-01-15T11:00:00",
      "location": "Conference Room A",
      "color": "#3788d8"
    }
  ]
}
```

### Créer un événement

```http
POST /api/agenda/events
Content-Type: application/json

{
  "title": "New Event",
  "description": "Event description",
  "start_time": "2024-01-15T14:00:00",
  "end_time": "2024-01-15T15:00:00",
  "location": "Room B",
  "color": "#27ae60"
}
```

### Modifier un événement

```http
PUT /api/agenda/events/1
Content-Type: application/json

{
  "title": "Updated Event",
  "description": "New description",
  "start_time": "2024-01-15T15:00:00",
  "end_time": "2024-01-15T16:00:00"
}
```

### Supprimer un événement

```http
DELETE /api/agenda/events/1
```

## Frontend Usage

### Charger les événements

```javascript
// Dans public/assets/js/modules/agenda/agenda.js

async function loadEvents(startDate, endDate) {
  const params = new URLSearchParams({
    start: startDate.toISOString().split('T')[0],
    end: endDate.toISOString().split('T')[0]
  });
  
  const response = await fetch(`/api/agenda/events?${params}`);
  const result = await response.json();
  
  if (result.success) {
    renderCalendar(result.data);
  } else {
    console.error('Failed to load events:', result.message);
  }
}
```

### Créer un événement

```javascript
async function createEvent(eventData) {
  const response = await fetch('/api/agenda/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(eventData)
  });
  
  const result = await response.json();
  
  if (result.success) {
    console.log('Event created:', result.data);
    loadEvents(currentStart, currentEnd); // Refresh
  } else {
    alert('Error: ' + result.message);
  }
}
```

### Éditer un événement

```javascript
async function updateEvent(eventId, eventData) {
  const response = await fetch(`/api/agenda/events/${eventId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(eventData)
  });
  
  const result = await response.json();
  
  if (result.success) {
    console.log('Event updated');
    loadEvents(currentStart, currentEnd); // Refresh
  }
}
```

### Supprimer un événement

```javascript
async function deleteEvent(eventId) {
  if (!confirm('Are you sure?')) return;
  
  const response = await fetch(`/api/agenda/events/${eventId}`, {
    method: 'DELETE'
  });
  
  const result = await response.json();
  
  if (result.success) {
    console.log('Event deleted');
    loadEvents(currentStart, currentEnd); // Refresh
  }
}
```

## HTML Structure

### Page agenda

```html
<div class="agenda">
  <!-- Navigation -->
  <div class="agenda__header">
    <button class="btn btn--secondary" id="prevMonth">← Prev</button>
    <h2 id="monthDisplay">January 2024</h2>
    <button class="btn btn--secondary" id="nextMonth">Next →</button>
  </div>
  
  <!-- Calendar grid -->
  <div class="agenda__calendar">
    <div class="weekdays">
      <div class="weekday">Mon</div>
      <div class="weekday">Tue</div>
      <!-- ... -->
    </div>
    <div class="days" id="calendarGrid">
      <!-- Days generated by JS -->
    </div>
  </div>
  
  <!-- Events list -->
  <div class="agenda__events" id="eventsList">
    <!-- Events displayed here -->
  </div>
  
  <!-- Action button -->
  <button class="btn btn--primary" id="createEventBtn">+ Create Event</button>
</div>
```

## CSS Classes

```css
/* Container */
.agenda { }
.agenda__header { }
.agenda__calendar { }
.agenda__events { }

/* Calendar grid */
.weekdays { }
.weekday { }
.days { }
.day { }
.day--today { }           /* Current day */
.day--selected { }        /* Clicked day */
.day--other-month { }     /* Days from prev/next month */
.day__events { }          /* Events in this day */

/* Events */
.event-item { }
.event-item__title { }
.event-item__time { }
.event-item__location { }
.event-item--highlight { }

/* Buttons */
.btn--create { }
.btn--delete { }
```

## Workflow d'utilisation

### 1. Affichage initial
```
User loads page
  ↓
Frontend fetches events for current month
  ↓
Backend queries database
  ↓
Events displayed on calendar
```

### 2. Créer un événement
```
User clicks "Create Event"
  ↓
Modal dialog opens
  ↓
User enters event details
  ↓
User submits form
  ↓
Frontend POST to /api/agenda/events
  ↓
Backend validates & stores in database
  ↓
Frontend refreshes calendar
```

### 3. Éditer un événement
```
User clicks on event
  ↓
Modal shows current details
  ↓
User modifies fields
  ↓
User clicks Save
  ↓
Frontend PUT to /api/agenda/events/:id
  ↓
Backend updates database
  ↓
Frontend refreshes calendar
```

### 4. Supprimer un événement
```
User right-clicks on event or clicks delete button
  ↓
Confirmation dialog
  ↓
User confirms
  ↓
Frontend DELETE /api/agenda/events/:id
  ↓
Backend soft-deletes in database
  ↓
Frontend refreshes calendar
```

## Recurring Events

Les événements récurrents sont supportés via la table `event_recurrences`.

```javascript
// Créer un événement récurrent
const eventData = {
  title: 'Weekly Meeting',
  start_time: '2024-01-01T10:00:00',
  end_time: '2024-01-01T11:00:00',
  recurrence: {
    type: 'weekly',        // 'daily', 'weekly', 'monthly', 'yearly'
    endDate: '2024-12-31'  // Optional
  }
};

await createEvent(eventData);
```

## Validation

Events require:
- ✅ `title` - Non-empty string
- ✅ `start_time` - Valid ISO 8601 datetime
- ✅ `end_time` - Valid ISO 8601 datetime after start_time
- ⚠️ `description`, `location`, `color` - Optional

```javascript
// Validation example
const errors = [];

if (!data.title || data.title.trim() === '') {
  errors.push('Title is required');
}

if (!data.start_time) {
  errors.push('Start time is required');
}

if (new Date(data.end_time) <= new Date(data.start_time)) {
  errors.push('End time must be after start time');
}

if (errors.length > 0) {
  throw new Error(errors.join(', '));
}
```

## Performance Tips

- Cache events for current month in frontend
- Use pagination for large date ranges
- Implement lazy loading for events
- Index database by date range (start_time, end_time)
- Debounce navigation buttons

## Testing

### Manual test checklist

- [ ] Load calendar shows current month
- [ ] Navigate prev/next months
- [ ] Create event with form
- [ ] Edit event details
- [ ] Delete event with confirmation
- [ ] Search events by title
- [ ] Filter by date range
- [ ] Handle timezone conversions
- [ ] No console errors
- [ ] Responsive on mobile

---

**See also:** [API Reference](../api/API.md) | [Database Schema](../api/DATABASE.md) | [Architecture](../architecture/ARCHITECTURE.md)
