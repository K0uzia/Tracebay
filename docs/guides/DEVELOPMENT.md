# 👨‍💻 Guide de développement

## Pour les contributeurs

### Cloner et setup

```bash
git clone https://github.com/SandersonnDev/workspace.git
cd workspace
./setup-local.sh init
```

### Lancer en mode dev

```bash
npm run dev
# Cela lance Electron + Express API
# Ouvre aussi automatiquement les DevTools
```

## Structure du code

### Frontend (public/)

```
public/
├── index.html              # Main HTML
├── assets/
│   ├── css/
│   │   ├── global.css     # Imports globales
│   │   └── modules/       # Feature-specific CSS
│   └── js/
│       ├── global.js      # Init
│       └── modules/
│           ├── agenda/    # Calendar
│           ├── modal/     # Dialogs
│           ├── chat/      # Chat
│           └── ...
├── components/            # Reusable HTML
├── pages/                 # Page templates
└── src/                   # Assets
```

### Backend (root)

```
├── main.js                # Electron main
├── preload.js             # Electron preload (IPC)
├── server.js              # Express app
├── database.js            # SQLite config
├── routes/                # API routes
│   └── agenda.js          # /api/agenda/*
└── models/                # Data models
    └── events.js          # Events CRUD
```

## JavaScript Style Guide

### Imports

```javascript
// ES5 (Node.js files)
const express = require('express');
const { dbPromise } = require('../database');

// ES6 (Frontend only, for now)
// Keep using CommonJS in backend
```

### Variable naming

```javascript
// Constants
const MAX_EVENTS = 100;
const DEFAULT_COLOR = '#3788d8';

// Functions
function createEvent(data) { }
const updateEvent = (id, data) => { };

// Classes
class EventManager { }
```

### Comments

```javascript
/**
 * Retrieve events for a date range
 * @param {string} startDate - ISO format
 * @param {string} endDate - ISO format
 * @returns {Promise<Array>} Events
 */
async function getEventsByRange(startDate, endDate) {
  // Implementation
}
```

## CSS Conventions

### File organization

```css
/* 1. Variables */
:root {
  --primary-color: #3788d8;
  --spacing-unit: 8px;
}

/* 2. Base styles */
* {
  margin: 0;
  padding: 0;
}

/* 3. Components */
.button {
  padding: var(--spacing-unit);
}

/* 4. Responsive */
@media (max-width: 768px) {
  /* Mobile styles */
}
```

### Naming conventions

```css
/* BEM Naming */
.component-name { }
.component-name__element { }
.component-name--modifier { }

/* Example */
.event-card { }
.event-card__title { }
.event-card--highlighted { }
```

## Testing

### Manual testing checklist

- [ ] Events CRUD works
- [ ] Calendar views switch
- [ ] Modals open/close
- [ ] API endpoints respond
- [ ] Database saves data
- [ ] No console errors

### API testing

```bash
# Test health
curl http://localhost:3000/api/health

# Test create event
curl -X POST http://localhost:3000/api/agenda/events \
  -H "Content-Type: application/json" \
  -d '{"title":"Test","start_time":"2024-01-15T10:00","end_time":"2024-01-15T11:00"}'

# Test list
curl http://localhost:3000/api/agenda/events
```

## Debugging

### Enable DevTools in Electron

Edit `main.js`:

```javascript
// Uncomment this line
mainWindow.webContents.openDevTools();
```

### Console logging

```javascript
// Frontend
console.log('Debug message');
console.error('Error occurred');

// Backend
console.log('✅ Success');
console.error('❌ Error');
```

### Database debugging

```bash
# Open DB shell
make db.shell

# Query directly
sqlite> SELECT * FROM events LIMIT 5;
```

## Common Tasks

### Add a new API endpoint

1. Create route in `routes/agenda.js`:

```javascript
router.get('/custom', async (req, res) => {
  try {
    // Your code
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
```

2. Use in frontend:

```javascript
const response = await fetch('/api/agenda/custom');
const data = await response.json();
```

### Add a new CSS module

1. Create `public/assets/css/modules/myfeature.css`
2. Import in `global.css`:

```css
@import url('./modules/myfeature.css');
```

3. Use in HTML:

```html
<div class="myfeature">
  <!-- Content -->
</div>
```

### Add a database migration

Migrations run automatically on startup. To add a new table, edit `database.js` and add to the SQL in `initializeTables()`.

## Git Workflow

```bash
# Create feature branch
git checkout -b feature/my-feature

# Make changes
git add .
git commit -m "feat: add my feature"

# Push
git push origin feature/my-feature

# Create pull request on GitHub
```

### Commit message format

```
feat: add user authentication
fix: resolve event filtering bug
docs: update API reference
style: format CSS
refactor: improve event validation
test: add event API tests
```

## Performance Tips

- Minimize database queries (use indexes)
- Cache frequently accessed data
- Use `SELECT` for pagination on large result sets
- Avoid N+1 query problems
- Profile with DevTools in Electron

## Security Checklist

- [ ] Input validation on all API endpoints
- [ ] SQL injection prevention (use parameterized queries)
- [ ] CORS properly configured
- [ ] No sensitive data in logs
- [ ] Use environment variables for secrets
- [ ] CSP headers set

---

**Questions?** Open an issue or read the full [docs](../INDEX.md)
