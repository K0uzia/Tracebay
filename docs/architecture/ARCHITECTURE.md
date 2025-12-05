# 🏗️ Architecture générale

## Vue d'ensemble

```
┌─────────────────────────────────────────────────┐
│           Electron Main Process                  │
│  (main.js + preload.js)                          │
│  ├─ Window management                           │
│  ├─ IPC communication                           │
│  └─ File system access                          │
└──────────────────┬──────────────────────────────┘
                   │
       ┌───────────┴────────────┐
       │                        │
       ▼                        ▼
  ┌─────────────┐         ┌────────────────────┐
  │   Frontend  │         │  Backend/API       │
  │  (index.html)        │  (Express Server)  │
  │  CSS/JS     │         │  (server.js)       │
  │  in public/ │         │                    │
  └─────────────┘         └────────┬───────────┘
                                   │
                                   ▼
                          ┌─────────────────┐
                          │   SQLite3 DB    │
                          │ data/database   │
                          └─────────────────┘
```

## Composants principaux

### 1. **Frontend (Public)**

- **HTML** : Pages et composants (`public/pages/`, `public/components/`)
- **CSS** : Styles modulaires (`public/assets/css/`)
- **JS** : Modules métier (`public/assets/js/modules/`)

### 2. **Backend/API (Node.js + Express)**

- `server.js` - Express app configuration
- `routes/` - API endpoints
- `models/` - Data access layer
- `database.js` - SQLite configuration

### 3. **Electron**

- `main.js` - Main process
- `preload.js` - Preload script (secure IPC bridge)
- IPC channels for native integration

### 4. **Database**

- SQLite3 in `data/database.sqlite`
- 5 tables: events, users, shares, notifications, recurrences
- Auto-migration on startup

## Flow de communication

```
User Action
    │
    ▼
Frontend (HTML/JS)
    │
    ├─ Store in localStorage (dev)
    └─ OR make HTTP request to API
              │
              ▼
        Express Routes
              │
              ▼
        Models/CRUD
              │
              ▼
        SQLite Database
              │
              ▼
        Return JSON response
              │
              ▼
        Update Frontend UI
```

## Modules Frontend

```
public/assets/js/modules/
├── agenda/
│   ├── agenda.js           # Calendar logic
│   └── AgendaStore.js      # Data abstraction
├── chat/
│   ├── ChatManager.js
│   └── ChatSecurityManager.js
├── modal/
│   └── universalModal.js   # Modal management
├── nav/
│   └── NavManager.js       # Navigation
├── pdf/
│   └── PDFManager.js       # PDF handling
└── time/
    └── TimeManager.js      # Time utilities
```

## Styles CSS

```
public/assets/css/
├── global.css              # Main import
├── default/
│   ├── normalize.css       # Reset
│   ├── variables.css       # CSS variables
│   └── section.css         # Layout
├── components/
│   ├── header.css
│   ├── footer.css
│   └── ...
└── modules/
    ├── agenda.css
    ├── modal.css
    └── ...
```

## API Architecture

### Endpoints pattern

```
GET    /api/agenda/events          # List
GET    /api/agenda/events/:id      # Detail
POST   /api/agenda/events          # Create
PUT    /api/agenda/events/:id      # Update
DELETE /api/agenda/events/:id      # Delete
GET    /api/agenda/search?q=...    # Search
GET    /api/agenda/stats           # Stats
```

### Response format

```json
{
  "success": true,
  "data": { ... },
  "message": "Operation successful"
}
```

## Database Schema

```sql
-- Events table
CREATE TABLE events (
  id INTEGER PRIMARY KEY,
  user_id INTEGER,
  title TEXT NOT NULL,
  description TEXT,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  color TEXT DEFAULT '#3788d8',
  all_day BOOLEAN DEFAULT 0,
  category TEXT,
  created_at DATETIME,
  updated_at DATETIME,
  deleted_at DATETIME,  -- Soft delete
  FOREIGN KEY(user_id) REFERENCES users(id)
);

-- Plus 4 autres tables: users, event_shares, notifications, event_recurrences
```

## Execution Flow

### Startup

```
1. npm run dev
   ├─ Start Express server (port 3000)
   ├─ Initialize SQLite
   ├─ Wait 2 seconds
   └─ Launch Electron
        ├─ Load index.html
        ├─ Inject preload.js
        ├─ Create main window
        └─ Ready to use
```

### User Interaction

```
1. User clicks calendar event
2. Frontend JS handler
3. Open modal (universalModal.js)
4. User fills form
5. Submit form
6. API POST request
7. Server validates
8. Database INSERT
9. Return success
10. Update frontend UI
```

## Security Architecture

```
┌─────────────────────────────────────┐
│    Electron Renderer Process        │
│ (index.html + public JS/CSS)        │
│                                     │
│  nodeIntegration: false ✓           │
│  contextIsolation: true ✓           │
│  preload: preload.js ✓              │
└────────────┬────────────────────────┘
             │ (IPC Bridge - preload.js)
             ▼
┌─────────────────────────────────────┐
│    Electron Main Process            │
│ (main.js - has full Node power)     │
└────────────┬────────────────────────┘
             │ (HTTP requests)
             ▼
┌─────────────────────────────────────┐
│    Express Server                   │
│ (server.js - port 3000)             │
│                                     │
│  CORS enabled ✓                     │
│  Input validation ✓                 │
│  SQL injection prevention ✓         │
└────────────┬────────────────────────┘
             │ (Queries)
             ▼
┌─────────────────────────────────────┐
│    SQLite Database                  │
│ (data/database.sqlite)              │
│                                     │
│  Parameterized queries ✓            │
│  Soft deletes ✓                     │
│  Transactions ✓                     │
└─────────────────────────────────────┘
```

## Technology Stack

| Layer | Technology |
|-------|------------|
| **Desktop** | Electron 39+ |
| **Frontend** | HTML5, CSS3, Vanilla JS |
| **Backend** | Node.js 18+, Express.js |
| **Database** | SQLite3 |
| **Build** | Electron Builder |
| **Package Manager** | npm |

---

**Consultez** [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) pour les détails des fichiers.
