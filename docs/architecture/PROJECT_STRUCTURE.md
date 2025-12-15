# 📁 Structure du Projet

## Vue d'ensemble

```
workspace/
├── Configuration & Build
├── Backend (Node.js/Express)
├── Frontend (HTML/CSS/JS)
├── Database (SQLite)
├── Documentation
└── Scripts Utilitaires
```

## Arborescence détaillée

```
workspace/
│
├── 📋 Configuration Files
│   ├── package.json           # Dependencies, scripts
│   ├── .env                   # Environment variables (auto-generated)
│   ├── Makefile               # Command shortcuts
│   ├── LICENSE                # Project license
│   └── .gitignore             # Git exclusions
│
├── 🚀 Backend (Express API)
│   ├── main.js                # Electron main process
│   ├── preload.js             # Electron IPC bridge
│   ├── server.js              # Express application
│   ├── database.js            # SQLite setup & connection
│   │
│   ├── routes/                # API endpoints
│   │   └── agenda.js          # /api/agenda/* endpoints
│   │
│   ├── models/                # Data access layer
│   │   └── events.js          # Event CRUD operations
│   │
│   └── data/                  # Runtime data
│       └── database.sqlite    # SQLite database file
│
├── 🎨 Frontend (public/)
│   ├── index.html             # Main entry point
│   │
│   ├── assets/                # Static resources
│   │   │
│   │   ├── css/               # Stylesheets
│   │   │   ├── global.css     # Import all CSS modules
│   │   │   ├── default/       # Base styles
│   │   │   │   ├── normalize.css
│   │   │   │   ├── variables.css
│   │   │   │   └── section.css
│   │   │   └── modules/       # Feature-specific styles
│   │   │       ├── home.css
│   │   │       ├── agenda.css
│   │   │       ├── chat-widget.css
│   │   │       ├── modal.css
│   │   │       ├── dossier.css
│   │   │       ├── reception.css
│   │   │       ├── shortcut.css
│   │   │       ├── option.css
│   │   │       └── appli.css
│   │   │
│   │   ├── js/                # JavaScript modules
│   │   │   ├── global.js      # App initialization
│   │   │   ├── config/        # Config files
│   │   │   │   ├── ChatSecurityConfig.js
│   │   │   │   └── PDFConfig.js
│   │   │   └── modules/       # Feature modules
│   │   │       ├── agenda/
│   │   │       │   └── agenda.js
│   │   │       ├── chat/
│   │   │       │   ├── ChatManager.js
│   │   │       │   ├── ChatSecurityManager.js
│   │   │       │   └── ChatWidgetManager.js
│   │   │       ├── modal/
│   │   │       │   └── universalModal.js
│   │   │       ├── nav/
│   │   │       │   └── NavManager.js
│   │   │       ├── pdf/
│   │   │       │   └── PDFManager.js
│   │   │       └── time/
│   │   │           └── TimeManager.js
│   │   │
│   │   └── src/               # Assets & Media
│   │       ├── icons/         # Icon files
│   │       ├── img/           # Images
│   │       └── pdf/           # PDF templates
│   │
│   ├── components/            # Reusable HTML components
│   │   ├── header.html
│   │   ├── footer.html
│   │   └── chat-widget.html
│   │
│   ├── pages/                 # Page templates
│   │   ├── home.html
│   │   ├── agenda.html
│   │   ├── application.html
│   │   ├── dossier.html
│   │   ├── reception.html
│   │   ├── shortcut.html
│   │   └── option.html
│   │
│   └── index.html             # Main HTML
│
├── 📚 Documentation
│   ├── INDEX.md               # Doc navigation hub
│   │
│   ├── setup/
│   │   ├── SETUP.md           # Installation guide
│   │   └── QUICK_START.md     # 5-minute quickstart
│   │
│   ├── guides/
│   │   ├── DEVELOPMENT.md     # Dev workflow & setup
│   │   ├── JAVASCRIPT.md      # JS standards
│   │   └── STYLES.md          # CSS conventions
│   │
│   ├── api/
│   │   ├── API.md             # REST endpoints reference
│   │   └── DATABASE.md        # Schema & SQL
│   │
│   ├── features/
│   │   ├── AGENDA.md          # Calendar documentation
│   │   ├── MODALS.md          # Modal system
│   │   └── CHAT.md            # Chat widget
│   │
│   ├── architecture/
│   │   ├── ARCHITECTURE.md    # System design
│   │   └── PROJECT_STRUCTURE.md (this file)
│   │
│   └── Legacy docs (to organize)
│       ├── 1-INTÉGRATION-DYNAMIQUE.md
│       ├── 2-ELECTRON.md
│       ├── 3-JAVASCRIPT.md
│       ├── 4-FONT-AWESOME.md
│       ├── 5-CHAT-WIDGET.md
│       └── ... (more files)
│
├── 🔧 Scripts & Automation
│   ├── bin/
│   │   ├── dev               # Launch dev environment
│   │   ├── server            # Start Express server only
│   │   ├── db                # Database utilities
│   │   └── info              # Show project info
│   │
│   ├── setup-local.sh        # Initial setup script
│   └── Makefile              # Command shortcuts
│
├── 📏 Rules & Standards
│   ├── rules/
│   │   ├── manifest.mdc
│   │   ├── ai-manifest.mdc
│   │   ├── chat-security.mdc
│   │   └── prompts/          # AI guidelines
│   │       ├── accessibility.mdc
│   │       ├── collaboration.mdc
│   │       ├── design.mdc
│   │       ├── devops.mdc
│   │       ├── ergonomie.mdc
│   │       ├── internationalisation.mdc
│   │       ├── perf.mdc
│   │       ├── refactoring.mdc
│   │       ├── security_audit.mdc
│   │       ├── security.mdc
│   │       └── testing.mdc
│
├── README.md                 # Project overview
└── node_modules/            # Dependencies (installed by npm)
```

## Key Files Explained

### Root Level

| File | Purpose |
|------|---------|
| `package.json` | Node.js dependencies & scripts |
| `main.js` | Electron main process entry point |
| `server.js` | Express.js application |
| `database.js` | SQLite connection & initialization |
| `preload.js` | Electron preload (IPC) |
| `Makefile` | Shortcut commands |
| `README.md` | Project overview |

### Backend Files

| File | Purpose | Exports |
|------|---------|---------|
| `server.js` | Express app setup | Express instance |
| `database.js` | SQLite setup | `dbPromise`, `initializeTables` |
| `routes/agenda.js` | API routes | Express router |
| `models/events.js` | CRUD operations | Functions (create, update, delete, etc) |

### Frontend Assets

| Directory | Contents |
|-----------|----------|
| `public/assets/css/` | All stylesheets (CSS) |
| `public/assets/js/` | All JavaScript modules |
| `public/assets/src/` | Images, icons, PDFs |
| `public/components/` | Reusable HTML snippets |
| `public/pages/` | Full page templates |

### Documentation Structure

| Folder | Content |
|--------|---------|
| `docs/setup/` | Installation & quickstart |
| `docs/guides/` | Dev workflow, standards |
| `docs/api/` | REST API & database schema |
| `docs/features/` | Feature documentation |
| `docs/architecture/` | System design & structure |

## Module Organization

### JavaScript Modules (`public/assets/js/modules/`)

```
modules/
├── agenda/
│   └── agenda.js              # Calendar UI & logic
├── chat/
│   ├── ChatManager.js         # Main chat logic
│   ├── ChatWidgetManager.js   # DOM management
│   └── ChatSecurityManager.js # Security & validation
├── modal/
│   └── universalModal.js      # Reusable modal dialog
├── nav/
│   └── NavManager.js          # Navigation bar
├── pdf/
│   └── PDFManager.js          # PDF generation/handling
└── time/
    └── TimeManager.js         # Date/time utilities
```

Each module is self-contained and can be loaded independently.

### CSS Architecture

```
css/
├── global.css                 # Single import point
├── default/
│   ├── normalize.css          # Browser reset
│   ├── variables.css          # CSS variables
│   └── section.css            # Base element styles
└── modules/
    ├── home.css               # Home page
    ├── agenda.css             # Calendar
    ├── chat-widget.css        # Chat
    ├── modal.css              # Modals
    └── ...                    # Other pages
```

## Environment & Configuration

### .env File
Located in workspace root, contains:
```
NODE_ENV=development
PORT=3000
DATABASE_PATH=./data/database.sqlite
DEBUG=true
```

Auto-generated by `setup-local.sh` if missing.

### package.json Scripts
```json
{
  "scripts": {
    "dev": "bin/dev",
    "start": "electron .",
    "server": "bin/server"
  }
}
```

## Data Flow

### API Request Example

```
1. User action in browser (agenda.html)
   ↓
2. JavaScript calls fetch('/api/agenda/events')
   ↓
3. Express routes handler (routes/agenda.js)
   ↓
4. Model methods (models/events.js)
   ↓
5. Database query (database.js → SQLite)
   ↓
6. Response returned to frontend
   ↓
7. JavaScript updates DOM (agenda.js)
```

## Dependencies

### Production Dependencies
- `express` - HTTP server
- `sqlite3` - Database
- `cors` - Cross-origin requests
- `dotenv` - Environment variables

### Development Dependencies
- `electron` - Desktop app
- `electron-builder` - App bundling

See `package.json` for full list and versions.

## Database Schema

### Main Tables
- `events` - Calendar events
- `event_recurrences` - Recurring event rules
- `users` - User accounts (if applicable)
- `event_shares` - Event sharing permissions
- `notifications` - User notifications

See [DATABASE.md](../api/DATABASE.md) for full schema.

## Port Configuration

- **Default API Port**: 3000
- **Configurable via**: `PORT` environment variable
- **Example**: `PORT=8080 npm run server`

## Entry Points

### Desktop App
```bash
npm run dev          # Full app with Electron
```

### API Only
```bash
npm run server       # Express only
```

### Database Management
```bash
make db.init         # Initialize database
make db.reset        # Clear and reinitialize
make db.shell        # SQLite shell access
```

## File Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| JS files | camelCase | `chatManager.js` |
| CSS files | kebab-case | `chat-widget.css` |
| Components | .html | `header.html` |
| Classes | PascalCase | `ChatManager` |
| Functions | camelCase | `createEvent()` |
| Constants | UPPER_SNAKE_CASE | `MAX_EVENTS` |

## Quick Navigation

Need help with...?

- **Setup**: See [SETUP.md](../setup/SETUP.md)
- **API**: See [API.md](../api/API.md)
- **Database**: See [DATABASE.md](../api/DATABASE.md)
- **Dev Workflow**: See [DEVELOPMENT.md](../guides/DEVELOPMENT.md)
- **Styles**: See [STYLES.md](../guides/STYLES.md)
- **Features**: See folders in [docs/features/](../features/)

---

**Last updated**: Auto-generated from current project structure
