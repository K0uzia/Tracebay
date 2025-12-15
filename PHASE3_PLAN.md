# 📋 Phase 3: Adapt Server - DETAILED IMPLEMENTATION PLAN

**Status**: 🚀 **READY TO START**  
**Client Status**: ✅ Phase 2 COMPLETE - All client modules configured for remote server  
**Estimated Duration**: 2-3 hours  
**Complexity Level**: **HIGH** (Express routes, database, WebSocket, authentication)

---

## 🎯 Phase 3 Objectives

### Primary Goals
1. ✅ Move database initialization to server
2. ✅ Set up Express API on port 8060
3. ✅ Implement JWT authentication system
4. ✅ Adapt all routes for HTTP API
5. ✅ Configure WebSocket for real-time chat
6. ✅ Create server dashboard/monitoring UI
7. ✅ Add logging and error handling
8. ✅ Enable CORS for client communication

### Secondary Goals
1. ✅ Environment variable configuration
2. ✅ Security headers (Helmet, CSP)
3. ✅ Request validation and sanitization
4. ✅ Database migration helpers
5. ✅ Server health check endpoint

---

## 📁 Directory Structure (Target)

```
apps/server/
├── main.js                          [TO ADAPT]
├── preload.js                       [ALREADY COPIED]
├── server.js                        [TO ADAPT] ← Main Express app
├── package.json                     [ALREADY CREATED]
├── forge.config.js                  [ALREADY CREATED]
├── .env.example                     [TO CREATE] ← Config template
│
├── data/                            [DATABASE]
│   └── workspace.db                 [SQLite3 database]
│
├── routes/                          [HTTP API ROUTES]
│   ├── auth.js                      [TO ADAPT] - /api/auth/*
│   ├── agenda.js                    [TO ADAPT] - /api/agenda/*
│   ├── shortcuts.js                 [TO ADAPT] - /api/shortcuts/*
│   ├── monitoring.js                [TO CREATE] - /api/monitoring/*
│   ├── health.js                    [TO CREATE] - /api/health
│   └── terminal.js                  [TO CREATE] - /api/terminal/* (optional)
│
├── models/                          [DATA MODELS]
│   └── events.js                    [TO ADAPT]
│
├── middleware/                      [TO CREATE]
│   ├── auth.js                      [Auth verification]
│   ├── errorHandler.js              [Error handling]
│   ├── validation.js                [Input validation]
│   └── cors.js                      [CORS config]
│
├── lib/                             [UTILITIES]
│   ├── jwt.js                       [JWT token management]
│   ├── database.js                  [ALREADY EXISTS] ← Move to server
│   ├── password.js                  [Password hashing]
│   └── logger.js                    [ALREADY EXISTS] ← Centralize
│
├── websocket/                       [REAL-TIME COMMUNICATION] - TO CREATE
│   ├── chatHandler.js               [Chat WebSocket handler]
│   ├── connectionManager.js         [Connection tracking]
│   └── messageValidator.js          [Message validation]
│
├── public/                          [DASHBOARD UI] - TO CREATE
│   ├── index.html                   [Dashboard entry point]
│   ├── app.js                       [Dashboard page manager]
│   ├── assets/
│   │   ├── css/
│   │   │   ├── dashboard.css        [Dashboard styling]
│   │   │   ├── monitoring.css       [Monitoring panel]
│   │   │   └── terminal.css         [Terminal styling]
│   │   └── js/
│   │       ├── DashboardPageManager.js
│   │       ├── modules/
│   │       │   ├── monitoring/ServerMonitor.js
│   │       │   ├── logs/LogsViewer.js
│   │       │   ├── terminal/TerminalManager.js
│   │       │   └── performance/PerformanceMonitor.js
│   │       └── config/DashboardConfig.js
│   └── pages/
│       ├── monitoring.html          [Live monitoring)
│       ├── logs.html                [Log viewer]
│       ├── terminal.html            [Terminal emulator]
│       └── settings.html            [Server settings]
│
└── config/                          [CONFIGURATION] - TO CREATE
    ├── database.config.js           [DB connection options]
    ├── jwt.config.js                [JWT settings]
    ├── cors.config.js               [CORS policies]
    └── server.config.js             [Server settings]
```

---

## 🔧 Detailed Implementation Steps

### STEP 1: Prepare Server Environment (0.5 hours)

#### 1.1 Create .env.example
```bash
# Server Configuration
SERVER_HOST=localhost
SERVER_PORT=8060
NODE_ENV=development

# Database
DATABASE_PATH=./data/workspace.db
DATABASE_INIT=true

# JWT
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRATION=7d

# CORS
CORS_ORIGIN=file://
CORS_CREDENTIALS=true

# Logging
LOG_LEVEL=debug
LOG_DIR=./logs

# Chat
CHAT_MAX_MESSAGE_LENGTH=500
CHAT_MESSAGE_RETENTION=100
CHAT_RATE_LIMIT=5/1s

# Security
HELMET_ENABLED=true
CSP_ENABLED=true
```

#### 1.2 Create database.js location
```
app/server/lib/database.js ← Move from root database.js
```

#### 1.3 Update package.json
- ✅ Already done in Phase 1

---

### STEP 2: Implement Express Server (1 hour)

#### 2.1 Update server.js

**Structure**:
```javascript
// 1. Imports and initialization
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const WebSocket = require('ws');
const http = require('http');

// 2. Load environment
dotenv.config();

// 3. Create Express app
const app = express();
const server = http.createServer(app);

// 4. Middleware
app.use(helmet()); // Security headers
app.use(cors(corsConfig));
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public')); // Dashboard UI

// 5. Database initialization
const db = require('./lib/database.js');
db.initialize();

// 6. Routes
app.use('/api/auth', require('./routes/auth.js'));
app.use('/api/agenda', require('./routes/agenda.js'));
app.use('/api/shortcuts', require('./routes/shortcuts.js'));
app.use('/api/monitoring', require('./routes/monitoring.js'));
app.use('/api/health', require('./routes/health.js'));

// 7. WebSocket setup
const wss = new WebSocket.Server({ server });
require('./websocket/chatHandler.js')(wss);

// 8. Server startup
const PORT = process.env.SERVER_PORT || 8060;
server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
```

**Key Changes**:
- Add `dotenv` for environment variables
- Add `cors` and `helmet` middleware
- Create WebSocket server from http server
- Initialize database on startup
- Serve dashboard UI from `/public/`

#### 2.2 Create JWT middleware
**File**: `middleware/auth.js`

```javascript
const jwt = require('jsonwebtoken');

function verifyToken(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ success: false, message: 'Token required' });
    }
    
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ success: false, message: 'Invalid token' });
    }
}

module.exports = { verifyToken };
```

---

### STEP 3: Adapt Routes (1.5 hours)

#### 3.1 Update auth.js
**Current**: Uses X-User-Id header  
**Target**: Uses JWT tokens

```javascript
// POST /api/auth/register
// - Hash password with bcrypt
// - Create user in database
// - Generate JWT token
// - Return token and user data

// POST /api/auth/login
// - Verify password
// - Generate JWT token
// - Return token and user data

// GET /api/auth/verify (with Bearer token)
// - Verify token validity
// - Return user data

// POST /api/auth/logout
// - Invalidate token (optional)
// - Return success
```

#### 3.2 Update agenda.js
**Target**: RESTful API with JWT auth

```javascript
// GET /api/agenda/events
// - Verify JWT token
// - Return user's events

// POST /api/agenda/events
// - Verify JWT token
// - Validate event data
// - Save to database
// - Return created event

// PUT /api/agenda/events/:id
// - Verify JWT token
// - Validate ownership
// - Update event
// - Return updated event

// DELETE /api/agenda/events/:id
// - Verify JWT token
// - Validate ownership
// - Delete event
// - Return success
```

#### 3.3 Update shortcuts.js
**Target**: Category and shortcut management

```javascript
// GET /api/shortcuts/categories
// - Return user's categories

// POST /api/shortcuts/categories
// - Create new category

// DELETE /api/shortcuts/categories/:id
// - Delete category and shortcuts

// GET /api/shortcuts
// - Return user's shortcuts

// POST /api/shortcuts
// - Create shortcut

// DELETE /api/shortcuts/:id
// - Delete shortcut
```

#### 3.4 Create monitoring.js
**Purpose**: Server monitoring endpoints

```javascript
// GET /api/monitoring/stats
// - Return server stats (uptime, RAM, CPU, etc.)

// GET /api/monitoring/logs
// - Return recent logs

// GET /api/monitoring/connections
// - Return connected users
```

#### 3.5 Create health.js
**Purpose**: Health check for client connection validation

```javascript
// GET /api/health
// - Return { success: true, status: 'ok', timestamp: ... }
```

---

### STEP 4: Implement WebSocket Chat (0.5 hours)

#### 4.1 Create websocket/chatHandler.js

```javascript
const jwt = require('jsonwebtoken');
const db = require('../lib/database.js');

module.exports = function(wss) {
    const connectedClients = new Map();
    
    wss.on('connection', (ws, req) => {
        console.log('✅ WebSocket client connected');
        
        ws.on('message', async (data) => {
            try {
                const msg = JSON.parse(data);
                
                if (msg.type === 'auth') {
                    // Verify token and store connection
                    const token = msg.token;
                    const decoded = jwt.verify(token, process.env.JWT_SECRET);
                    
                    const userId = decoded.id;
                    const username = decoded.username;
                    
                    connectedClients.set(ws, { userId, username });
                    
                    // Broadcast user count
                    broadcastUserCount();
                    
                } else if (msg.type === 'message') {
                    // Save message and broadcast
                    const { userId, username } = connectedClients.get(ws);
                    
                    // Save to DB
                    const chatMsg = {
                        user_id: userId,
                        pseudo: username,
                        message: msg.text
                    };
                    
                    // Broadcast to all clients
                    wss.clients.forEach(client => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify({
                                type: 'newMessage',
                                message: chatMsg
                            }));
                        }
                    });
                }
            } catch (error) {
                console.error('❌ WebSocket error:', error);
            }
        });
        
        ws.on('close', () => {
            connectedClients.delete(ws);
            broadcastUserCount();
        });
    });
    
    function broadcastUserCount() {
        const users = Array.from(connectedClients.values());
        const usernames = users.map(u => u.username);
        
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                    type: 'userCount',
                    count: users.length,
                    users: usernames
                }));
            }
        });
    }
};
```

---

### STEP 5: Create Dashboard UI (1 hour)

#### 5.1 Create public/index.html (Dashboard Entry)

```html
<!DOCTYPE html>
<html>
<head>
    <title>Workspace Server Dashboard</title>
    <link rel="stylesheet" href="/assets/css/dashboard.css">
</head>
<body>
    <div id="app">
        <header class="dashboard-header">
            <h1>🖥️ Server Dashboard</h1>
            <div id="server-status"></div>
        </header>
        
        <nav class="dashboard-nav">
            <a href="#monitoring" class="nav-link active">Monitoring</a>
            <a href="#logs" class="nav-link">Logs</a>
            <a href="#terminal" class="nav-link">Terminal</a>
            <a href="#settings" class="nav-link">Settings</a>
        </nav>
        
        <main id="content" class="dashboard-content"></main>
    </div>
    
    <script src="/app.js" type="module"></script>
</body>
</html>
```

#### 5.2 Create public/pages/monitoring.html

```html
<div class="monitoring-page">
    <div class="stats-grid">
        <div class="stat-card">
            <h3>Uptime</h3>
            <p id="stat-uptime">-</p>
        </div>
        <div class="stat-card">
            <h3>RAM Usage</h3>
            <p id="stat-ram">-</p>
        </div>
        <div class="stat-card">
            <h3>Connected Users</h3>
            <p id="stat-users">-</p>
        </div>
        <div class="stat-card">
            <h3>Requests/Min</h3>
            <p id="stat-requests">-</p>
        </div>
    </div>
    
    <div class="charts">
        <canvas id="chart-cpu"></canvas>
        <canvas id="chart-memory"></canvas>
    </div>
</div>
```

#### 5.3 Create public/app.js (Dashboard Page Manager)

```javascript
class DashboardPageManager {
    constructor() {
        this.currentPage = 'monitoring';
        this.init();
    }
    
    init() {
        this.attachNavListeners();
        this.loadPage('monitoring');
    }
    
    attachNavListeners() {
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const page = link.href.split('#')[1];
                this.loadPage(page);
            });
        });
    }
    
    async loadPage(pageName) {
        try {
            const response = await fetch(`/pages/${pageName}.html`);
            const html = await response.text();
            document.getElementById('content').innerHTML = html;
            
            // Initialize page-specific modules
            if (pageName === 'monitoring') {
                this.initMonitoring();
            }
        } catch (error) {
            console.error('Error loading page:', error);
        }
    }
    
    async initMonitoring() {
        // Fetch and display stats
        const response = await fetch('/api/monitoring/stats');
        const data = await response.json();
        
        document.getElementById('stat-uptime').textContent = this.formatUptime(data.uptime);
        document.getElementById('stat-ram').textContent = this.formatBytes(data.memoryUsage);
        document.getElementById('stat-users').textContent = data.connectedUsers;
    }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    window.dashboardManager = new DashboardPageManager();
});
```

---

### STEP 6: Database Migration & Configuration (0.5 hours)

#### 6.1 Ensure database.js is in server

**Tasks**:
1. Move/copy database.js from root to `apps/server/lib/database.js`
2. Update database path to `./data/workspace.db`
3. Add initialization check:
   ```javascript
   async function initialize() {
       if (!fs.existsSync('./data')) {
           fs.mkdirSync('./data');
       }
       // Run migrations
       createTables();
   }
   ```

#### 6.2 Create database initialization

```javascript
function createTables() {
    // Users table
    db.run(`CREATE TABLE IF NOT EXISTS users (...)`);
    
    // Events table
    db.run(`CREATE TABLE IF NOT EXISTS events (...)`);
    
    // Chat table
    db.run(`CREATE TABLE IF NOT EXISTS chat_messages (...)`);
    
    // Shortcuts table
    db.run(`CREATE TABLE IF NOT EXISTS shortcuts (...)`);
    
    // Categories table
    db.run(`CREATE TABLE IF NOT EXISTS categories (...)`);
}
```

---

## 📋 Implementation Checklist

### Routes & Endpoints
- [ ] POST `/api/auth/register` - Create user account
- [ ] POST `/api/auth/login` - Authenticate user
- [ ] GET `/api/auth/verify` - Verify JWT token
- [ ] GET `/api/health` - Server health check
- [ ] GET `/api/agenda/events` - List events
- [ ] POST `/api/agenda/events` - Create event
- [ ] PUT `/api/agenda/events/:id` - Update event
- [ ] DELETE `/api/agenda/events/:id` - Delete event
- [ ] GET `/api/shortcuts/categories` - List categories
- [ ] POST `/api/shortcuts/categories` - Create category
- [ ] DELETE `/api/shortcuts/categories/:id` - Delete category
- [ ] GET `/api/shortcuts` - List shortcuts
- [ ] POST `/api/shortcuts` - Create shortcut
- [ ] DELETE `/api/shortcuts/:id` - Delete shortcut
- [ ] GET `/api/monitoring/stats` - Get server stats
- [ ] GET `/api/monitoring/logs` - Get server logs
- [ ] WebSocket `/ws` - Real-time chat

### Middleware
- [ ] CORS configuration
- [ ] Helmet security headers
- [ ] JWT authentication
- [ ] Error handling
- [ ] Request validation
- [ ] Logging

### Database
- [ ] Tables creation
- [ ] Migration helpers
- [ ] Data validation

### Security
- [ ] JWT token generation/verification
- [ ] Password hashing (bcrypt)
- [ ] CORS whitelisting
- [ ] HTTPS ready
- [ ] CSP headers

### Dashboard UI
- [ ] Monitoring page
- [ ] Logs viewer
- [ ] Terminal (optional)
- [ ] Settings page

---

## 🎓 Resources & References

### Key Files to Modify
1. **server.js** - Main Express setup
2. **routes/auth.js** - Authentication API
3. **routes/agenda.js** - Agenda API
4. **routes/shortcuts.js** - Shortcuts API
5. **database.js** - Database initialization
6. **package.json** - Dependencies (already done)

### New Files to Create
1. **middleware/auth.js** - JWT verification
2. **.env.example** - Environment variables
3. **websocket/chatHandler.js** - WebSocket chat
4. **public/app.js** - Dashboard frontend
5. **routes/monitoring.js** - Monitoring API
6. **routes/health.js** - Health check

---

## ⏱️ Time Estimate

| Task | Duration | Status |
|------|----------|--------|
| Environment Setup | 30 min | 🔄 Ready |
| Express Server Setup | 30 min | 🔄 Ready |
| Route Adaptation | 60 min | 🔄 Ready |
| WebSocket Chat | 30 min | 🔄 Ready |
| Dashboard UI | 60 min | 🔄 Ready |
| Database Config | 30 min | 🔄 Ready |
| Testing & Debugging | 30 min | 🔄 Ready |
| **TOTAL** | **4-5 hours** | **Ready** |

---

## 🚀 Next Steps After Phase 3

1. **Phase 4**: Integration & Scripts
   - Makefile setup
   - Installation scripts
   - ESLint configuration
   - Docker containerization (optional)

2. **Phase 5**: Tests & Validation
   - Unit tests
   - Integration tests
   - E2E testing
   - Performance validation

---

**Status**: 🟢 **READY TO START PHASE 3**  
**Next Command**: Run Phase 3 implementation  
**Command**: `Continue with Phase 3 server adaptation`
