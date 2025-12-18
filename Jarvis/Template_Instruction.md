# 🎯 INSTRUCTIONS - Project

## 🔗 HIERARCHY & PRIORITY SYSTEM

```
┌─────────────────────────────────────────────────┐
│ LEVEL 1 (OVERRIDE) - Instructions.mdc           │ ← TU ES ICI
│ Project-specific directives                     │
│ Overrides EVERYTHING                            │
└─────────────────────────────────────────────────┘
              ▲
              │ cascades if not specified
              ▼
┌─────────────────────────────────────────────────┐
│ LEVEL 2 (MEDIUM) - .ai-core standards           │
│ General best practices                          │
│ Used as defaults                                │
└─────────────────────────────────────────────────┘
              ▲
              │ cascades if not specified
              ▼
┌─────────────────────────────────────────────────┐
│ LEVEL 3 (LOW) - Common sense                    │
│ Industry standards (SOLID, DRY, etc)            │
└─────────────────────────────────────────────────┘
```

**Rule Application**:
```
If INSTRUCTIONS.mdc defines → Use that (ignore .ai-core)
Else if .ai-core defines    → Use that
Else                        → Use industry standards
```

---

## 🚀 EXCEPTIONS & TECH STACK OVERRIDES

### ✅ Acceptés (Override .ai-core):
- **Node.js** (18+) - Backend runtime
- **Electron** (39+) - Desktop framework
- **Fastify** (4.24+) - HTTP server [UPGRADE from Express]
- **SQLite3** (5.1+) + Connection Pool - Multi-client database
- **TypeScript** (5.3+) - Type safety [MANDATORY - NEW]
- **CommonJS** (backend only) - Module system [DEPRECATED]
- **WebSocket** (ws) - Real-time comms
- **Jest** - Testing framework
- **Web Components** (std) - Frontend encapsulation [NEW]

### ❌ Rejetés (Keep .ai-core):
- TypeScript → ✅ **MANDATORY** (except legacy code)
- React/Vue → ❌ Vanilla JS only
- Dark mode → ❌ Removed
- GraphQL → ❌ REST only
- Docker → ❌ Native only

---

## 🎯 PROJECT METADATA

```yaml
Project: Workspace v2.0
Type: Electron + Fastify + TypeScript monorepo
Status: Phase 3b (TypeScript migration), Phase 4+ in progress
Infrastructure: 8/10 (Intermediate-Advanced)

Tech Stack:
  Runtime: Node.js 18+ LTS, Electron 39+
  Backend Language: TypeScript 5.3+ (strict mode - MANDATORY)
  HTTP Server: Fastify 4.24+ (replaces Express)
  Database: SQLite3 5.1+ + Connection Pool (Phase 1)
  Database Future: PostgreSQL 15+ (Phase 2)
  Frontend: Vanilla JS (ES6+), CSS3, Web Components
  Security: JWT 9.1+, BCRYPTJS 2.4.3+, Helmet 7.1+
  RealTime: WebSocket (ws 8.18+)
  Package: npm workspaces
  Build Tool: tsx 4.7+ (dev), tsc (prod)

Standards Applied:
  Architecture: SOLID + Design Patterns
  Language: TypeScript (strict mode - no any)
  Security: OWASP Top 10, CWE, CVE
  Code Quality: ESLint 8+ + Prettier 3+ (enforced)
  Type Safety: TypeScript strict mode (no implicit any)
  Testing: Jest 29+ (80%+ coverage target)
  Accessibility: WCAG 2.1 AA
  Concurrency: SQLite3 pool + PostgreSQL ready
```

---

## 📦 TECHNOLOGY STACK (Definitive)

### Production Stack
| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| **Desktop** | Electron | 39+ | Mandatory |
| **Frontend** | Vanilla JS | ES6+ | No frameworks |
| **Frontend Components** | Web Components | std | Shadow DOM encapsulation |
| **Backend Language** | TypeScript | 5.3+ | Type safety (MANDATORY) |
| **HTTP Server** | Fastify | 4.24+ | Replaces Express (40% faster) |
| **Database** | SQLite3 + Pool | 5.1+ | Multi-client, queue-based |
| **Database Future** | PostgreSQL | 15+ | Phase 2 scalability |
| **Runtime** | Node.js | 18+ LTS | LTS |
| **RealTime** | WebSocket (ws) | 8.18+ | Chat & monitoring |
| **Security** | JWT, BCRYPT | 9.1, 5.1+ | Auth & crypto |
| **HTTP Client** | fetch/axios | native | No jQuery |

### Development Stack
| Tool | Purpose | Version |
|------|---------|---------|
| **TypeScript** | Type checking | 5.3+ |
| **tsx** | TS execution (dev) | 4.7+ |
| **ESLint** | Code quality | 8+ |
| **Prettier** | Formatting | 3+ |
| **Jest** | Testing | 29+ |
| **Supertest** | HTTP testing | 6.3+ |
| **Electron Forge** | Packaging | 7+ |

---

## 🏗️ ARCHITECTURE DECISÕES

### Module System

**Backend (TypeScript - MANDATORY)**:
```typescript
// ✅ Use TypeScript with ES6 modules
import Fastify, { FastifyInstance } from 'fastify';

export const myFunction = async (): Promise<string> => {
  return 'result';
};

// ✅ Use interfaces for types (MANDATORY)
interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

export interface UserService {
  getUser(id: string): Promise<User | null>;
  createUser(user: Omit<User, 'id' | 'createdAt'>): Promise<User>;
}

// ✅ Export types
export type { User, UserService };
```

**Frontend (ES6+ - JavaScript)**:
```javascript
// ✅ Use ES6 modules
export const handleMessage = (msg) => {
  console.log(msg);
};

export function setupChat() {
  // Implementation
}

// ✅ Web Components for encapsulation
class ChatWidget extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
  }

  render() {
    this.shadowRoot.innerHTML = `<div>Chat</div>`;
  }
}

customElements.define('chat-widget', ChatWidget);
```

**CommonJS is COMPLETELY DEPRECATED**:
```javascript
// ❌ DO NOT USE (backend or frontend)
const express = require('express');
module.exports = myFunction;
```

### Database Strategy
```
**Phase 1 (NOW - Multi-client support):**
- SQLite3 5.1+ with Connection Pool
- Max 5 concurrent connections
- Queue-based request handling
- Handles 5-10 simultaneous clients

**Phase 2 (Week 4+ - Full scalability):**
- PostgreSQL 15+ (on-premise)
- Unlimited concurrent connections
- Full transaction support
- Handles 50+ simultaneous clients

**Implementation:**
- Keep abstraction layer in `models/`
- Enable migration without code changes
- Use promise-based interface (no callbacks)

**Why NOT better-sqlite3?**
- ❌ Synchronous = blocks all clients
- ❌ No queue handling
- ✅ Only for single-client Electron apps
- ⚠️ Your case: multi-client on network
```
### 🔄 Database Concurrency Strategy

**Current Situation:**
```
├─ Clients per machine: 1 (Electron app)
├─ Total clients: Multiple (network-wide)
├─ Concurrent requests: 3-5 per second
└─ Critical: SQLite only supports 1 writer at a time
```

**Problem with better-sqlite3:**
```
❌ Synchronous = blocks all clients
❌ No queue mechanism
❌ Causes lock timeouts with 5+ clients
```

**Solution: SQLite3 + Connection Pool**

```javascript
// filepath: apps/server/src/db/pool.ts

import sqlite3 from 'sqlite3';

class SQLitePool {
  private connections: Database[] = [];
  private queue: Array<(db: Database) => void> = [];
  private inUse = new Set<Database>();

  constructor(private path: string, private maxSize: number = 5) {
    this.initPool();
  }

  async getConnection(): Promise<Database> {
    if (this.connections.length > 0) {
      const db = this.connections.pop()!;
      this.inUse.add(db);
      return db;
    }

    // Wait for available connection
    return new Promise((resolve) => {
      this.queue.push((db) => {
        this.inUse.add(db);
        resolve(db);
      });
    });
  }

  releaseConnection(db: Database): void {
    this.inUse.delete(db);
    
    if (this.queue.length > 0) {
      const callback = this.queue.shift()!;
      callback(db);
    } else {
      this.connections.push(db);
    }
  }

  async query<T>(sql: string, params: any[] = []): Promise<T[]> {
    const db = await this.getConnection();
    try {
      return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows as T[]);
        });
      });
    } finally {
      this.releaseConnection(db);
    }
  }
}

export default SQLitePool;
```

**Phase 2: PostgreSQL Migration**
- When: Week 4+
- Why: Unlimited concurrency, transactions, production-ready
- Where: On-premise (same server as Node.js)
- How: Change connection string only

```typescript
// Connection abstraction (same interface)
import { Pool as PgPool } from 'pg';

class DatabasePool {
  private pool = new PgPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    max: 20, // Auto-pooling
  });

  async query<T>(sql: string, params: any[] = []): Promise<T[]> {
    const result = await this.pool.query(sql, params);
    return result.rows as T[];
  }
}
```
### API Architecture
```
REST endpoints (primary)
WebSocket (secondary - monitoring, chat)
No GraphQL (keep it simple)
```

---

## 🔐 SECURITY MANDATES

```
Must have:
- [ ] JWT with 7-day expiry (configurable)
- [ ] BCRYPT rounds ≥ 12
- [ ] CSP headers (strict)
- [ ] CORS whitelist
- [ ] Input validation (whitelist)
- [ ] Output sanitization
- [ ] No secrets in code (.env only)
- [ ] HTTPS/TLS 1.3+ (production)
- [ ] Database connection pooling (handle concurrency)
- [ ] No database locks on multi-client access (timeout 10s)

Nice to have:
- [ ] Rate limiting
- [ ] CSRF protection
- [ ] Helmet headers
- [ ] Audit logging
```

---

## 📋 INSTRUCTIONS SPECIFIQUES (À Détailler)

### 1️⃣ Quand créer une nouvelle entité (file/folder)

**Rule**:
```
- If backend logic     → apps/server/src/{api,models,lib}
- If frontend UI       → apps/client/public/{components,pages,assets}
- If shared config     → Workspace root + apps/*/config/
- If reusable library  → apps/server/src/lib or common/
```

Example:
```
Feature: "New chat message validation"

Decision Tree:
├─ Is it backend logic?      YES → apps/server/src/lib/ChatValidator.js
│                            NO  → Next question
├─ Is it frontend UI?        YES → apps/client/public/components/ChatWidget.html
│                            NO  → Not applicable
├─ Is it shared config?      YES → ChatConfig.js
                             NO  → Not applicable
```

---

### 2️⃣ Naming Conventions (TypeScript Backend)

```yaml
TypeScript Backend:
  Classes: PascalCase
    ✅ ChatManager, AuthValidator, ServerMonitor
    ❌ chatManager, chat_manager, ChatMgr
  
  Interfaces/Types: PascalCase (no I prefix)
    ✅ User, Message, ApiResponse<T>
    ❌ user, IUser
  
  Functions: camelCase
    ✅ processMessage(), getCurrentUser()
    ❌ ProcessMessage(), process_message()
  
  Constants: UPPER_SNAKE_CASE
    ✅ MAX_MESSAGE_LENGTH, JWT_EXPIRY
    ❌ maxMessageLength, max_message_length
  
  Private/Protected: leadingUnderscore (optional)
    ✅ _validateToken(), private #privateMethod
    ❌ validateToken_ (suffix not used)
  
  Enums: PascalCase values
    ✅ enum Status { Pending, Active }
    ❌ enum Status { PENDING, ACTIVE }

JavaScript Frontend:
  Classes: PascalCase
    ✅ ChatWidget, HeaderComponent
  
  Functions: camelCase
    ✅ handleMessage(), setupChat()
  
  Constants: UPPER_SNAKE_CASE
    ✅ MAX_RETRIES, API_URL

CSS:
  Classes: kebab-case
    ✅ .message-item, .chat-container
    ❌ .messageItem, .message_item, .msg-itm
  
  Variables: kebab-case
    ✅ --primary-color, --unit-2
    ❌ --primaryColor, --primary_color

Files:
  TypeScript Backend: PascalCase
    ✅ ChatManager.ts, AuthValidator.ts, User.ts
    ❌ chat-manager.ts, auth_validator.ts
  
  JavaScript Frontend: camelCase
    ✅ chatWidget.js, setupChat.js
  
  Utilities: camelCase
    ✅ logger.ts, dateUtils.ts, validators.ts
    ❌ Logger.ts, date-utils.ts
  
  Styles: kebab-case
    ✅ chat-widget.css, auth-modal.css
    ❌ ChatWidget.css, authModal.css
  
  Tests: .test.ts or .spec.ts
    ✅ ChatManager.test.ts, User.spec.ts
    ❌ ChatManager_test.ts
```

---

### 3️⃣ Folder Structure Rules

**Backend (TypeScript - MANDATORY)**:
```
apps/server/src/
├── api/
│   ├── auth/
│   │   ├── routes.ts        ← TypeScript
│   │   ├── controller.ts    ← TypeScript
│   │   ├── validator.ts     ← TypeScript
│   │   └── types.ts         ← Type definitions
│   ├── agenda/
│   │   ├── routes.ts
│   │   ├── controller.ts
│   │   └── types.ts
│   ├── chat/
│   │   ├── routes.ts
│   │   ├── controller.ts
│   │   └── types.ts
│   └── index.ts             ← Export all routes
├── models/
│   ├── User.ts              ← TypeScript (CRUD operations)
│   ├── Event.ts             ← TypeScript
│   ├── Message.ts           ← TypeScript
│   └── types.ts             ← Shared types
├── lib/
│   ├── jwt.ts               ← TypeScript
│   ├── password.ts          ← TypeScript
│   ├── logger.ts            ← TypeScript
│   ├── errors.ts            ← Error types
│   └── types.ts             ← Type definitions
├── ws/
│   ├── handlers/
│   │   ├── authHandler.ts   ← TypeScript
│   │   ├── chatHandler.ts   ← TypeScript
│   │   ├── monitorHandler.ts ← NEW
│   │   └── index.ts         ← Export handlers
│   ├── server.ts            ← TypeScript
│   └── types.ts             ← WebSocket types
├── db/
│   ├── schema.sql
│   ├── migrations/
│   │   └── 001_init.sql
│   ├── connection.ts        ← Connection factory
│   ├── pool.ts              ← Connection pool implementation
│   └── types.ts             ← Database types
├── config/
│   ├── env.ts               ← Environment config
│   ├── logger.ts            ← Logger config
│   └── types.ts             ← Config types
├── middleware/
│   ├── auth.ts              ← NEW: Auth middleware
│   ├── errorHandler.ts      ← NEW: Error handling
│   └── logger.ts            ← NEW: Request logging
├── utils/
│   ├── validators.ts        ← Input validation
│   ├── sanitizers.ts        ← Output sanitization
│   └── formatters.ts        ← Data formatting
├── types/
│   ├── index.ts             ← Export all types
│   ├── api.ts               ← API types
│   ├── database.ts          ← DB types
│   ├── websocket.ts         ← WebSocket types
│   └── error.ts             ← Error types
├── tsconfig.json            ← TypeScript config
└── main.ts                  ← Electron entry point
```

**Frontend**:
```
apps/client/public/
├── index.html
├── assets/
│   ├── css/
│   │   ├── global.css
│   │   ├── default/
│   │   ├── components/
│   │   └── modules/
│   ├── js/
│   │   ├── global.js
│   │   ├── config/
│   │   └── modules/
│   └── src/
│       ├── icons/
│       ├── images/
│       └── pdf/
├── components/
│   ├── header.html
│   ├── footer.html
│   └── ChatWidget.html
└── pages/
    ├── home.html
    ├── agenda.html
    └── ...
```

---

### 4️⃣ Code Style Standards

#### BACKEND (TypeScript - MANDATORY)

```typescript
// ✅ Always type your functions (MANDATORY)
async function fetchUser(id: string): Promise<User> {
  const user: User = await db.getUser(id);
  return user;
}

// ✅ Use const/let with explicit types
const MAX_ITEMS: number = 10;
let currentIndex: number = 0;

// ✅ Use interfaces for objects (MANDATORY)
interface Message {
  id: string;
  text: string;
  userId: string;
  createdAt: Date;
}

// ✅ Function parameters must have types
const handleMessage = (msg: Message): void => {
  console.log(msg.text);
};

// ✅ Arrow functions with explicit types
const double = (n: number): number => n * 2;

// ✅ Async/await with proper typing
async function processMessages(messages: Message[]): Promise<void> {
  for (const msg of messages) {
    await db.save(msg);
  }
}

// ✅ Error handling with types
interface ApiError {
  code: string;
  message: string;
  status: number;
}

try {
  await fetch('/api/data');
} catch (error: unknown) {
  const apiError = error as ApiError;
  console.error(`${apiError.code}: ${apiError.message}`);
}

// ❌ NEVER use any (except justified cases with comment)
// const data: any = {}; // NO!

// ❌ NO implicit any
// function process(data) { } // NO! Add type

// ❌ NO var (use const/let)
// var OLD_WAY = 'no'; // NO!
```

#### FRONTEND (ES6+ - JavaScript)

**JavaScript**:
```javascript
// ✅ Block scope (prefer let/const)
{
  const MAX_ITEMS = 10;
  for (let i = 0; i < MAX_ITEMS; i++) { }
}

// ❌ Function scope (avoid var)
{ var MAX_ITEMS = 10; }
console.log(MAX_ITEMS); // Leaks!

// ✅ Template literals (prefer)
const msg = `Hello ${user.name}, welcome!`;

// ❌ String concatenation (avoid unless necessary)
const msg = 'Hello ' + user.name + ', welcome!';

// ✅ Arrow functions (prefer)
const double = (n) => n * 2;

// ⚠️ Regular functions (use for object methods)
function MyClass() { }
MyClass.prototype.method = function() { };

// ✅ Async/await (prefer)
async function fetchData() {
  const response = await fetch('/api/data');
  return response.json();
}

// ❌ .then() chains (avoid unless necessary)
fetch('/api/data').then(r => r.json());

// ✅ Destructuring (prefer)
const { id, name } = user;
const [first, second] = array;

// ❌ Property access (avoid)
const id = user.id;
const name = user.name;
```

**JSDoc**:
```javascript
/**
 * Process incoming chat message
 * @param {Object} message - Message object
 * @param {string} message.text - Message content
 * @param {string} message.userId - Sender ID
 * @returns {Promise<Object>} Processed message with timestamp
 * @throws {Error} If message validation fails
 * @example
 * const result = await processMessage({
 *   text: 'Hello',
 *   userId: 'user123'
 * });
 */
async function processMessage(message) {
  // Implementation
}
```

---

### 5️⃣ CSS Architecture

```css
/* 1. Variables (must-have) */
:root {
  /* Units */
  --unit: 8px;
  --unit-1: calc(var(--unit) * 1);
  --unit-2: calc(var(--unit) * 2);
  
  /* Colors */
  --color-primary: #3E3B8C;
  --color-secondary: #2D3073;
  --color-accent-1: #F2BC1B;
  --color-accent-2: #F28241;
  --color-bg: #f2f2f2;
  --color-text: #0D0D0D;
  --color-error: #c62828;
  --color-valid: #008000;
  
  /* Typography */
  --font-system: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto;
  --font-h1: 600 1.7rem var(--font-system);
  --font-h2: 600 1.4rem var(--font-system);
  
  /* Spacing */
  --radius-small: 4px;
  --radius-medium: 8px;
  --radius-large: 12px;
  
  /* Shadows */
  --shadow-small: rgba(0,0,0,0.24) 0px 3px 8px;
  --shadow-medium: rgba(0,0,0,0.25) 0px 14px 28px, rgba(0,0,0,0.22) 0px 10px 10px;
  
  /* Transitions */
  --transition: all 0.3s ease;
}

/* 2. Reset/Normalize */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

/* 3. Base Elements */
body {
  font: var(--font-system);
  background: var(--color-bg);
  color: var(--color-text);
}

/* 4. Components */
.button-primary {
  padding: var(--unit-1) var(--unit-3);
  background: var(--color-primary);
  border-radius: var(--radius-small);
  transition: var(--transition);
}

/* 5. Modules */
.chat-container {
  display: grid;
  gap: var(--unit-2);
}

/* 6. Utilities (last) */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
}
```

---

### 6️⃣ API Design (REST with TypeScript)

#### REST Endpoints Pattern

```
GET  /api/events              # List all events
GET  /api/events/:id          # Get single event
POST /api/events              # Create event
PATCH /api/events/:id         # Update event
DELETE /api/events/:id        # Delete event
```

#### Response Format (TypeScript)

```typescript
// ✅ Standard success response
interface ApiResponse<T> {
  success: true;
  data: T;
  error: null;
  timestamp: string;
  code?: string;
}

// ✅ Standard error response
interface ApiErrorResponse {
  success: false;
  data: null;
  error: string;
  code: string;
  timestamp: string;
}

type ApiResult<T> = ApiResponse<T> | ApiErrorResponse;

// ✅ Example implementation with Fastify
import { FastifyRequest, FastifyReply } from 'fastify';

app.get<{ Params: { id: string } }>(
  '/api/events/:id',
  async (req: FastifyRequest, reply: FastifyReply): Promise<ApiResult<Event>> => {
    try {
      const event = await Event.findById(req.params.id);
      
      if (!event) {
        return reply.status(404).send({
          success: false,
          data: null,
          error: 'Event not found',
          code: 'NOT_FOUND',
          timestamp: new Date().toISOString()
        });
      }

      return {
        success: true,
        data: event,
        error: null,
        timestamp: new Date().toISOString()
      };
    } catch (error: unknown) {
      const apiError = error as Error;
      return reply.status(500).send({
        success: false,
        data: null,
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        timestamp: new Date().toISOString()
      });
    }
  }
);
```

#### HTTP Status Codes

| Status | Use Case | Example |
|--------|----------|---------|
| 200 | Success | GET returns data |
| 201 | Created | POST creates resource |
| 204 | No Content | DELETE successful |
| 400 | Bad Request | Invalid input |
| 401 | Unauthorized | Missing JWT |
| 403 | Forbidden | No permission |
| 404 | Not Found | Resource doesn't exist |
| 500 | Server Error | Unexpected error |

---

### 7️⃣ Testing Strategy

```javascript
// File: apps/server/src/lib/__tests__/ChatValidator.test.js

describe('ChatValidator', () => {
  describe('validateMessage()', () => {
    it('should accept valid messages', () => {
      const msg = { text: 'Hello', userId: 'user1' };
      expect(() => ChatValidator.validateMessage(msg)).not.toThrow();
    });
    
    it('should reject messages with XSS', () => {
      const msg = { text: '<script>alert("xss")</script>', userId: 'user1' };
      expect(() => ChatValidator.validateMessage(msg)).toThrow();
    });
    
    it('should reject empty messages', () => {
      const msg = { text: '', userId: 'user1' };
      expect(() => ChatValidator.validateMessage(msg)).toThrow();
    });
  });
});

// Test Coverage Targets:
// - Critical paths (auth, data validation): 100%
// - Major features (chat, agenda): 80%+
// - Utilities: 70%+
// - Overall: 70%+ minimum
```

---

### 8️⃣ Environment & Configuration

**File: `.env.example`**
```bash
# === BACKEND ===
NODE_ENV=development
PORT=8060

# === DATABASE (Phase 1: SQLite + Pool) ===
DATABASE_PATH=./data/database.sqlite
DB_POOL_SIZE=5
DB_POOL_TIMEOUT=10000

# === DATABASE (Phase 2: PostgreSQL - Optional) ===
# Uncomment when ready to migrate to PostgreSQL
# DB_HOST=localhost
# DB_PORT=5432
# DB_NAME=workspace
# DB_USER=postgres
# DB_PASSWORD=your_password

# === SECURITY ===
JWT_SECRET=your-secret-key-here-change-in-production
JWT_EXPIRY=7d
BCRYPT_ROUNDS=12

# === FEATURES ===
ENABLE_CHAT=true
ENABLE_MONITORING=true
ENABLE_DEBUG=false
LOG_LEVEL=info

# === DEVELOPMENT ONLY ===
DEBUG=false
GITHUB_TOKEN=ghp_xxxxx
```

**Loading Strategy (TypeScript)**:
```typescript
// File: apps/server/src/config/env.ts
import dotenv from 'dotenv';

dotenv.config();

interface Config {
  env: string;
  port: number;
  database: {
    path: string;
    poolSize: number;
    poolTimeout: number;
  };
  jwt: {
    secret: string;
    expiry: string;
  };
  bcrypt: {
    rounds: number;
  };
  features: {
    chat: boolean;
    monitoring: boolean;
    debug: boolean;
  };
  log: {
    level: string;
  };
}

const config: Config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '8060', 10),
  database: {
    path: process.env.DATABASE_PATH || './data/database.sqlite',
    poolSize: parseInt(process.env.DB_POOL_SIZE || '5', 10),
    poolTimeout: parseInt(process.env.DB_POOL_TIMEOUT || '10000', 10),
  },
  jwt: {
    secret: process.env.JWT_SECRET || (
      process.env.NODE_ENV === 'production'
        ? (() => { throw new Error('JWT_SECRET is required in production'); })()
        : 'SECRET_RETIRE'
    ),
    expiry: process.env.JWT_EXPIRY || '7d',
  },
  bcrypt: {
    rounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
  },
  features: {
    chat: process.env.ENABLE_CHAT === 'true',
    monitoring: process.env.ENABLE_MONITORING === 'true',
    debug: process.env.ENABLE_DEBUG === 'true',
  },
  log: {
    level: process.env.LOG_LEVEL || 'info',
  },
};

// Validate required config
if (config.env === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required in production');
}

export default config;
```

---

## ✅ INSTRUCTIONS COMPLÉMENTAIRES (Détail Complet)

### 1. **Quand créer des tests?**
```
Must test:
- Authentication (all paths)
- Input validation
- Error handling
- Security features (XSS, SQL injection)
- Critical business logic

Should test:
- API endpoints (happy + error paths)
- Database operations
- Utility functions

Nice to test:
- UI interactions
- Style consistency
```

### 2. **Code Review Checklist**
```
Before commit:
- [ ] No console.log() (use logger)
- [ ] No hardcoded values (use config)
- [ ] No var (use const/let)
- [ ] TypeScript strict mode: no 'any' type (backend)
- [ ] All functions have return types (backend)
- [ ] All parameters have types (backend)
- [ ] No @ts-ignore comments (unless justified)
- [ ] ESLint passes: npm run lint
- [ ] Type checking passes: npm run type-check
- [ ] Tests pass: npm test
- [ ] Test coverage > 80%
- [ ] No secrets in code (.env only)
- [ ] TSDoc for public functions (backend)
- [ ] No dead code
- [ ] Performance considered (avoid N+1 queries)
- [ ] Database queries use connection pool
- [ ] Error handling with typed errors
```

### 3. **Git Workflow**
```
Branch naming:
- feature/description
- bugfix/description
- docs/description
- refactor/description

Commit messages:
- feat: Add new feature
- fix: Resolve bug
- docs: Update docs
- refactor: Improve code
- test: Add tests
- chore: Maintenance
```

---

## 🔧 TypeScript Configuration

### tsconfig.json (Backend)

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "removeComments": false
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

### Frontend TypeScript (Optional - ES6 compatible)

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "jsx": "preserve",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["public/**/*"],
  "exclude": ["node_modules"]
}
```

---

## 📦 Build & Scripts

### package.json Scripts

```json
{
  "scripts": {
    "dev": "concurrently \"npm run dev:server\" \"npm run dev:client\"",
    "dev:server": "tsx watch apps/server/src/main.ts",
    "dev:client": "electron apps/client/main.js",
    
    "build": "npm run build:server && npm run build:client",
    "build:server": "tsc --project apps/server/tsconfig.json",
    "build:client": "esbuild apps/client/public/assets/js/global.js --bundle --outfile=dist/client.js",
    
    "start": "node apps/server/dist/main.js",
    "start:electron": "electron .",
    
    "test": "jest --coverage",
    "test:watch": "jest --watch",
    "test:server": "jest apps/server/src/**/*.test.ts",
    
    "lint": "eslint \"apps/**/*.ts\" --fix",
    "format": "prettier --write \"apps/**/*.{ts,js,css,json}\"",
    
    "type-check": "tsc --noEmit",
    "pre-commit": "npm run lint && npm run type-check && npm run test"
  }
}
```

### Running the Project

```bash
# Development mode (watch + reload)
npm run dev

# Production build
npm run build
npm start

# Testing
npm test
npm run test:watch

# Code quality
npm run lint
npm run format
npm run type-check
```

---

## 📝 Template Révisé pour Instructions.mdc

````mdc
# 🎯 INSTRUCTIONS - Workspace v2.0

## 🔗 HIERARCHY & PRIORITY SYSTEM

**Level 1 (HIGHEST)** → This file (Instructions.mdc)
**Level 2 (MEDIUM)** → .ai-core standards  
**Level 3 (LOW)** → Industry best practices

Apply rule: "Use highest level, cascade if not specified"

---

## 🚀 TECH STACK OVERRIDES

### ✅ Acceptés (Project-specific)
- Node.js 18+
- Electron 39+
- Express 4.18+
- SQLite3 5.1+
- CommonJS (backend only)
- WebSocket (ws)
- Jest

### 🚫 Rejetés (Keep .ai-core)
- React, Vue, Angular
- GraphQL
- Dark mode
- Docker (for now)

---

## 📋 DEFINITIVE STRUCTURE

[Inclure sections 2-8 from above]

---

## 🎯 DECISION TREES

### When creating new file:
[Include decision tree example]

### When implementing feature:
[Include feature checklist]

### When writing code:
[Include code quality checklist]

---

## 📚 REFERENCE

- .ai-core/ - General standards
- rules/ - ESLint config
- docs/ - Project documentation