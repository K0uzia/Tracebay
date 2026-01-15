# 🏗️ PLAN REFACTORISATION & ARCHITECTURE AVANCÉE

**Date création:** 15 janvier 2026  
**Alignement:** ROADMAP_REFACTORING.md  
**Objectif:** Feuille de route détaillée pour atteindre 3 apps (Client + Server Dashboard + Proxmox Backend)

---

## 🎯 Architecture Cible (Final State)

```
┌─────────────────────────────┐         HTTP/WS         ┌──────────────────┐
│  CLIENT ELECTRON            │  ◄──────────────────►   │ PROXMOX BACKEND  │
│  (Utilisateurs)             │                          │ (Fastify/Node)   │
│                             │                          │                  │
│ - Interface utilisateur     │                          │ ✅ API REST      │
│ - Pages (agenda, etc)       │                          │ ✅ WebSocket     │
│ - Chat, monitoring local    │                          │ ✅ PostgreSQL    │
│                             │                          │ ✅ Monitoring    │
└─────────────────────────────┘                          │ ✅ Auth JWT      │
                                                          └──────────────────┘
              △
              │ HTTP/WS
              │
        ┌─────────────────────────────┐
        │ SERVER ELECTRON DASHBOARD   │
        │ (Monitoring centralisé)     │
        │                             │
        │ ✅ Live activity feed       │
        │ ✅ User statistics          │
        │ ✅ System health            │
        │ ✅ Performance metrics      │
        └─────────────────────────────┘
```

**Caractéristiques:**
- Client léger et performant
- Server élastique (scalable)
- Backend décorrelé (peut tourner partout)
- Communication fiable (HTTP + WS)
- Monitoring centralisé

---

## 📋 PLAN DÉTAILLÉ PAR PHASE

### PHASE 1: PRÉPARATION (Semaine 1)

#### 1.1 Node.js Update → CRITIQUE

**Objectif:** Débloquer npm et dépendances modernes

```bash
# Actions
1. Node 18.19.1 → 20.11 LTS (ou 22 récent)
2. npm install (devrait passer)
3. Tester build entier
```

**Fichiers:**
- `.nvmrc` - Créer
- `package.json` - engines field

**Checklist:**
- [ ] Node 20+ installé localement
- [ ] `npm list` sans erreurs
- [ ] CI/CD config updated (.github/workflows si existe)
- [ ] `.nvmrc` commité

**Risques:** Aucun - Node 20 LTS 100% compatible

**Impact:** 🟢 HAUT - Débloque tout

---

#### 1.2 Nettoyer Dépendances

**Objectif:** Retirer packages inutiles

```json
// À RETIRER
{
  "puppeteer": "X",                    // ❌ Cause erreur, jamais utilisé
  "jest": "X",                         // ❌ Pas de tests configurés
  "supertest": "X",
  "ts-jest": "X",
  "@fastify/cors": "X",                // ❌ Dead Fastify deps
  "@fastify/helmet": "X",
  "electron-squirrel-startup": "X"     // ❌ Windows only, optionnel
}

// CONSOLIDER
{
  "@electron-forge/plugin-webpack": "->devDependencies"  // Mettre en devDep
}
```

**Commandes:**
```bash
# apps/server/
npm uninstall puppeteer jest supertest ts-jest @fastify/cors @fastify/helmet electron-squirrel-startup

# apps/client/
npm uninstall electron-squirrel-startup

# Root
npm update --depth=3
```

**Fichiers:**
- `/apps/server/package.json`
- `/apps/client/package.json`
- `/package.json`

**Checklist:**
- [ ] `npm list` sans warnings
- [ ] `npm update` fonctionne
- [ ] Apps toujours démarrent (`npm run dev`)
- [ ] Package-lock.json actualisé

**Impact:** 🟢 MOYEN - Installation 50% plus rapide

---

#### 1.3 Créer Structure de Dossiers

**Objectif:** Préparer structure pour Phase 2-3

```bash
# Nouvelles structures

mkdir -p apps/proxmox/src/{api,models,lib,ws,db,config,middleware,utils,types}
mkdir -p config/
mkdir -p docker/proxmox/
mkdir -p shared/types/
mkdir -p shared/utils/
mkdir -p docs/
```

**Fichiers à créer:**

```
config/
├── network.config.ts                  # Config réseau centralisée
├── environments.json                  # Configs par env
└── README.md

docker/
├── proxmox/
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── .env.example
│   └── README.md

shared/
├── types/
│   ├── api.ts                        # Types API partagés
│   ├── messages.ts                   # WebSocket messages
│   └── events.ts                     # Events monitoring
└── utils/
    └── constants.ts

docs/
├── ARCHITECTURE.md                    # Vue complète
├── API.md                             # Endpoints
├── DATABASE.md                        # Schéma
├── DEPLOYMENT.md                      # Guide deployment
├── WEBSOCKET.md                       # Format messages
└── NETWORK.md                         # Config réseau

apps/proxmox/
├── src/main.ts                       # Entry point Fastify
├── package.json
├── tsconfig.json
├── Dockerfile
├── docker-entrypoint.sh
└── README.md
```

**Checklist:**
- [ ] Dossiers créés
- [ ] `.gitkeep` dans dossiers vides
- [ ] README.md dans chaque dossier principal

**Impact:** 🟢 BAS - Setup infrastructure

---

#### 1.4 Créer Config Réseau Centralisée

**Objectif:** Une source unique pour config serveur

**Fichier:** `config/network.config.ts`

```typescript
export const NETWORK_CONFIG = {
  environments: {
    development: {
      client: {
        port: 3000,
        apiUrl: 'http://localhost:4000',
        wsUrl: 'ws://localhost:4000/ws'
      },
      server: {
        port: 5000,
        apiUrl: 'http://localhost:4000',
        wsUrl: 'ws://localhost:4000/ws'
      },
      proxmox: {
        port: 4000,
        host: 'localhost',
        database: 'sqlite',
        dbPath: './data/dev.db'
      }
    },
    production: {
      client: {
        port: 3000,
        apiUrl: 'https://api.workspace.local:4000',
        wsUrl: 'wss://api.workspace.local:4000/ws'
      },
      server: {
        port: 5000,
        apiUrl: 'https://api.workspace.local:4000',
        wsUrl: 'wss://api.workspace.local:4000/ws'
      },
      proxmox: {
        port: 4000,
        host: 'api.workspace.local',
        database: 'postgresql',
        dbHost: 'db.workspace.local',
        dbPort: 5432,
        dbName: 'workspace'
      }
    }
  }
};

export const getConfig = (env: 'development' | 'production') => {
  return NETWORK_CONFIG.environments[env];
};
```

**Checklist:**
- [ ] Fichier créé
- [ ] Tests config dev/prod
- [ ] Client peut charger depuis config
- [ ] Server utilise depuis config

**Impact:** 🟡 MOYEN - Fusion prochaine

---

### PHASE 2: MIGRATION PROXMOX (Semaines 2-3)

#### 2.1 Fastify Setup

**Objectif:** Créer backend Fastify moderne

**Fichier:** `apps/proxmox/src/main.ts`

```typescript
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import websocket from '@fastify/websocket';
import { getConfig } from '../../config/network.config';

const config = getConfig(process.env.NODE_ENV as 'development' | 'production');
const proxmoxConfig = config.proxmox;

const fastify = Fastify({
  logger: true,
  bodyLimit: 1048576 // 1MB
});

// Register plugins
await fastify.register(helmet);
await fastify.register(cors, {
  origin: [config.client.apiUrl, config.server.apiUrl],
  credentials: true
});
await fastify.register(websocket);

// Routes
fastify.get('/api/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// WebSocket
fastify.register(async (fastify) => {
  fastify.get('/ws', { websocket: true }, (socket, req) => {
    console.log('WebSocket connected');
    socket.send(JSON.stringify({ type: 'connected' }));
  });
});

// Start
await fastify.listen({ port: proxmoxConfig.port, host: '0.0.0.0' });
console.log(`✅ Proxmox running on http://0.0.0.0:${proxmoxConfig.port}`);
```

**Dépendances à ajouter:**

```bash
npm install fastify @fastify/cors @fastify/helmet @fastify/websocket
npm install --save-dev @types/fastify tsx
```

**Checklist:**
- [ ] apps/proxmox/package.json avec Fastify
- [ ] npm install dans apps/proxmox
- [ ] `npm run dev` de proxmox fonctionne
- [ ] `/api/health` répond
- [ ] WebSocket `/ws` connecte

**Risques:** Aucun - Fastify très stable

**Impact:** 🟢 HAUT - Fondation backend

---

#### 2.2 Migrer Routes Express → Fastify

**Objectif:** Port des endpoints

**Routes prioritaires:**
1. `/api/health` ✅ (déjà fait)
2. `/api/auth/login` (crucial)
3. `/api/auth/logout`
4. `/api/auth/verify`
5. `/api/events` (agenda)
6. `/api/messages` (chat)
7. `/api/shortcuts`
8. `/api/lots` (réception)

**Pattern Fastify pour chaque route:**

```typescript
// apps/proxmox/src/api/auth/routes.ts
import { FastifyInstance } from 'fastify';

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/api/auth/login', async (request, reply) => {
    const { username, password } = request.body as {username: string; password: string};
    // Logique...
    return { success: true, token: '...' };
  });

  fastify.post('/api/auth/logout', async (request, reply) => {
    // Logique...
    return { success: true };
  });
}
```

**Checklist:**
- [ ] Tous endpoints portés
- [ ] Tests manuels (Postman/curl)
- [ ] WebSocket intégré
- [ ] Errors handled

**Impact:** 🟢 HAUT - Débloque client

---

#### 2.3 Modèles Database Proxmox

**Objectif:** Créer modèles TypeScript

**Fichiers:**
```typescript
// apps/proxmox/src/models/User.ts
export class User {
  async getAll() { }
  async getById(id: number) { }
  async create(data) { }
  async update(id, data) { }
  async delete(id) { }
}

// apps/proxmox/src/models/Message.ts
export class Message {
  async create(userId, text) { }
  async getByConversation(id, limit?) { }
  async markAsRead(id) { }
}

// apps/proxmox/src/models/Event.ts
export class Event {
  async create(data) { }
  async update(id, data) { }
  async getRange(from, to) { }
}

// apps/proxmox/src/models/ActivityLog.ts
export class ActivityLog {
  async log(userId, action, metadata?) { }
  async getRecent(limit?) { }
}
```

**Checklist:**
- [ ] Tous modèles typés
- [ ] CRUD complet
- [ ] Tests avec data réelle

**Impact:** 🟡 MOYEN - Support data layer

---

#### 2.4 WebSocket Handlers

**Objectif:** Temps réel structuré

**Fichier:** `apps/proxmox/src/ws/handlers.ts`

```typescript
export const wsHandlers = {
  'message:send': async (ws, data, proxmox) => {
    const message = await proxmox.models.Message.create(data.userId, data.text);
    proxmox.broadcast({ type: 'message:new', data: message });
  },
  
  'presence:update': async (ws, data, proxmox) => {
    proxmox.broadcast({ type: 'presence', data });
  },

  'typing:indicator': async (ws, data, proxmox) => {
    proxmox.broadcast({ type: 'typing', data });
  }
};
```

**Checklist:**
- [ ] Messages structurés (interfaces)
- [ ] Broadcast working
- [ ] User tracking

**Impact:** 🟡 MOYEN - Real-time features

---

#### 2.5 PostgreSQL Migration Prép

**Objectif:** Préparer schema PostgreSQL

**Fichier:** `docs/DATABASE.md`

```sql
-- PostgreSQL schema
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE messages (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  title VARCHAR(255) NOT NULL,
  start_time TIMESTAMP,
  end_time TIMESTAMP
);

CREATE TABLE activity_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  action VARCHAR(255) NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_messages_user ON messages(user_id);
CREATE INDEX idx_messages_created ON messages(created_at);
CREATE INDEX idx_events_user ON events(user_id);
CREATE INDEX idx_activity_logs_user ON activity_logs(user_id);
```

**Checklist:**
- [ ] Schema finalisé
- [ ] Indexes optimisés
- [ ] Migration script prête (SQLite → PostgreSQL)

**Impact:** 🟡 MOYEN - Prépare scaling

---

### PHASE 3: DOCKER & DÉPLOIEMENT (Semaine 4)

#### 3.1 Dockerfile Proxmox

**Fichier:** `docker/proxmox/Dockerfile`

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy source
COPY apps/proxmox ./
COPY config ../config
COPY shared ../shared

# Install deps
RUN npm ci

# Expose port
EXPOSE 4000

# Start
CMD ["npm", "run", "dev"]
```

**Checklist:**
- [ ] Image builds
- [ ] Container starts
- [ ] Port 4000 exposed
- [ ] Volumes mounted correctly

**Impact:** 🟢 MOYEN - Production ready

---

#### 3.2 Docker Compose Dev

**Fichier:** `docker/proxmox/docker-compose.yml`

```yaml
version: '3.8'

services:
  proxmox:
    build: .
    ports:
      - "4000:4000"
    environment:
      NODE_ENV: development
      PORT: 4000
      DATABASE: sqlite
    volumes:
      - ./data:/app/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:4000/api/health"]
      interval: 10s
      timeout: 5s
      retries: 3

  # PostgreSQL (optionnel pour dev)
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: workspace
      POSTGRES_USER: workspace
      POSTGRES_PASSWORD: SECRET_RETIRE
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

**Checklist:**
- [ ] `docker-compose up` fonctionne
- [ ] Services healthcheck ok
- [ ] Client peut se connecter à localhost:4000

**Impact:** 🟡 MOYEN - Env standardisé

---

### PHASE 4: CLIENTS (Semaine 5)

#### 4.1 Mettre à jour Client Electron

**Objectif:** Utiliser Proxmox au lieu de Server Electron

**Changements:**
1. `connection-config.json` → point sur Proxmox
2. API calls → Proxmox endpoints
3. WebSocket → Proxmox WS

```javascript
// connection-config.json
{
  "mode": "proxmox",  // ou "production", "local"
  "proxmox": {
    "url": "http://localhost:4000",
    "ws": "ws://localhost:4000/ws"
  }
}
```

**Checklist:**
- [ ] Client connected to Proxmox
- [ ] Chat working
- [ ] Agenda syncing
- [ ] Réception ops working

**Impact:** 🟢 HAUT - Client compatible

---

#### 4.2 Server Dashboard → Stats Monitoring

**Objectif:** Dashboard récupère stats depuis Proxmox

**Nouvelle route Proxmox:**
```typescript
fastify.get('/api/monitoring/stats', async () => {
  return {
    connectedUsers: connectedCount,
    messagesPerMinute: getMessageRate(),
    eventCount: await Event.count(),
    systemHealth: getHealth()
  };
});
```

**Dashboard subscribe:**
```javascript
const ws = new WebSocket('ws://localhost:4000/ws');
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === 'stats') {
    updateDashboard(msg.data);
  }
};
```

**Checklist:**
- [ ] Dashboard reçoit stats live
- [ ] Graphs updates
- [ ] Reconnection handling

**Impact:** 🟡 MOYEN - Monitoring centralisé

---

## 🎯 OPTIMISATIONS PROPOSÉES

### Performance

#### 1. Caching Redis

**Quoi:** Cache pour requêtes fréquentes

**Où:** Proxmox

**When:** Après Phase 3

```typescript
// Cache messages fréquents
const redis = new Redis();
const messages = await redis.get('messages:latest') || 
                 await db.messages.getLatest();
```

**Impact:** 50% réduction DB queries

---

#### 2. Database Connection Pooling Avancé

**Changement:** SQLite → PgBouncer (PostgreSQL)

**Config:**
```ini
; /etc/pgbouncer/pgbouncer.ini
[databases]
workspace = host=localhost port=5432 dbname=workspace

[pgbouncer]
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 25
```

**Impact:** Support 1000+ concurrent clients

---

#### 3. Message Compression

**WebSocket:** Activer compression sur gros messages

```typescript
await fastify.register(websocket, {
  options: {
    perMessageDeflate: {
      zlibDeflateOptions: {
        level: 3
      }
    }
  }
});
```

**Impact:** 70% réduction bandwidth

---

### Maintenabilité

#### 1. Logging Structuré

**Current:** `console.log('message')`  
**Target:** Structured JSON logging

```typescript
import pino from 'pino';
const logger = pino({
  level: process.env.LOG_LEVEL || 'info'
});

logger.info({ userId: 123, action: 'login' }, 'User logged in');
// Output: {"level":30,"time":"...","userId":123,"action":"login","msg":"..."}
```

**Dépendance:** `npm install pino pino-pretty`

**Impact:** Logging production-ready

---

#### 2. Observabilité: Prometheus

**Metrics:** HTTP requests, WebSocket connections, DB latency

```typescript
import prometheus from '@fastify/prometheus';

await fastify.register(prometheus, {
  endpoint: '/metrics'
});

// Metrics available at http://localhost:4000/metrics
```

**Impact:** Monitoring précis, alertes

---

#### 3. Tests Automatisés (Enfin!)

**Setup Jest:**

```bash
npm install --save-dev jest @types/jest ts-jest supertest
```

**Fichier:** `apps/proxmox/jest.config.js`

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts']
};
```

**Premier test:**

```typescript
// apps/proxmox/src/__tests__/health.test.ts
describe('Health endpoint', () => {
  it('should return 200 OK', async () => {
    const response = await fastify.inject({
      method: 'GET',
      url: '/api/health'
    });
    expect(response.statusCode).toBe(200);
  });
});
```

**Checklist:**
- [ ] 10+ tests critiques
- [ ] Coverage > 50%
- [ ] CI/CD runs tests

**Impact:** Refactoring safe

---

#### 4. Linting & Formatting Préservé

**ESLint:**
```bash
npm run lint -- --fix
```

**Prettier:**
```bash
npm run format
```

**Pre-commit hook:**
```bash
npx husky install
npx husky add .husky/pre-commit "npm run lint && npm run format"
```

**Impact:** Code quality consistent

---

### Sécurité

#### 1. Rate Limiting

```typescript
import rateLimit from '@fastify/rate-limit';

await fastify.register(rateLimit, {
  max: 100,
  timeWindow: '15 minutes'
});
```

**Impact:** Protection DDoS

---

#### 2. JWT Refresh Tokens

**Actuellement:** Token expire après 7j, renew nécessite re-login

**À faire:** Refresh tokens

```typescript
// Token short-lived (1h)
// Refresh token long-lived (7j)
await fastify.post('/api/auth/refresh', async (req) => {
  const { refreshToken } = req.body;
  if (!isValidRefreshToken(refreshToken)) throw new Error('Invalid');
  
  const newAccessToken = sign({ /* ... */ }, { expiresIn: '1h' });
  return { accessToken: newAccessToken };
});
```

**Impact:** Security + UX

---

#### 3. Input Validation Schema

**Current:** Pas de validation centralisée  
**Target:** Zod ou Joi

```typescript
import { z } from 'zod';

const LoginSchema = z.object({
  username: z.string().min(3).max(255),
  password: z.string().min(8).max(255)
});

fastify.post('/api/auth/login', async (req) => {
  const data = LoginSchema.parse(req.body);
  // ...
});
```

**Impact:** XSS/Injection prevention

---

## 📊 TIMELINE RÉALISTE

| Phase | Durée | Effort | Risque |
|-------|-------|--------|--------|
| Phase 1: Préparation | 3-4j | 40h | 🟢 Bas |
| Phase 2: Proxmox | 10-14j | 80h | 🟡 Moyen |
| Phase 3: Docker | 3-4j | 40h | 🟢 Bas |
| Phase 4: Clients | 5-7j | 60h | 🟡 Moyen |
| **Total** | **4-5 semaines** | **220h** | - |

**Capacité estimée:** 1 dev = 40h/semaine → 5.5 semaines solo

---

## ⚠️ RISQUES & MITIGATIONS

| Risque | Gravité | Mitigation |
|--------|---------|-----------|
| Breaking change API | 🟠 MOYEN | Version API: v1, v2 parallel |
| Client stops working | 🟠 MOYEN | Feature flag: can fallback to old server |
| Data loss migration | 🔴 CRITIQUE | Backup avant, test migration in staging |
| Performance regression | 🟡 FAIBLE | Load tests PostgreSQL vs SQLite |
| Dev env broken | 🟡 FAIBLE | Docker compose as single source of truth |

---

## ✅ SUCCESS CRITERIA

### Phase 1 (Préparation)
- [ ] Node 20+ running everywhere
- [ ] npm install complète sans erreurs
- [ ] `npm run dev` fonctionne

### Phase 2 (Proxmox)
- [ ] Proxmox `npm run dev` démarre
- [ ] `/api/health` respond
- [ ] Client connect et fonctionne
- [ ] Chat temps réel working
- [ ] PostgreSQL schema finalisée

### Phase 3 (Docker)
- [ ] `docker-compose up` works
- [ ] Container healthcheck passes
- [ ] Production image builds

### Phase 4 (Clients)
- [ ] Client Electron uses Proxmox
- [ ] Server Dashboard shows live stats
- [ ] Load test: 100 concurrent users

---

## 📚 DOCUMENTATION À CRÉER

| Doc | Responsable | Timeline |
|-----|-------------|----------|
| `docs/ARCHITECTURE.md` | Phase 1 | Week 1 |
| `docs/API.md` | Phase 2 | Week 2 |
| `docs/DATABASE.md` | Phase 2 | Week 3 |
| `docs/DEPLOYMENT.md` | Phase 3 | Week 4 |
| `docs/WEBSOCKET.md` | Phase 2 | Week 2 |
| `docs/NETWORK.md` | Phase 1 | Week 1 |
| `docs/TROUBLESHOOTING.md` | Phase 4 | Week 5 |

---

## 🎓 LEARNINGS & BEST PRACTICES

### Patterns à Adopter

✅ **Layered Architecture:**
- Presentation layer (routes)
- Service layer (business logic)
- Data layer (models)

✅ **Dependency Injection:**
```typescript
class UserService {
  constructor(private db: Database) {}
}
```

✅ **Repository Pattern:**
```typescript
class UserRepository {
  async getAll() { }
  async getById(id) { }
}
```

✅ **Event-Driven Updates:**
```typescript
// Instead of polling
emitter.on('user:login', (user) => {
  broadcast({ type: 'user:online', user });
});
```

### Anti-Patterns à Éviter

❌ **God Objects:** Classes avec 1000+ lignes
❌ **Global State:** Variables globales partout
❌ **Magic Strings:** Hardcoded URLs
❌ **Untested Code:** Toujours tester
❌ **Mixed Concerns:** Routes + business logic

---

## 📞 DÉCISIONS CLÉS

✅ **Fastify** pour Proxmox (3x plus rapide qu'Express)  
✅ **PostgreSQL** phase 2 (SQLite insuffisant scale)  
✅ **TypeScript strict** (sécurité type runtime)  
✅ **Monorepo npm workspaces** (simple, maintient structure)  
✅ **Docker Compose** dev (consistency)  
✅ **Pino logging** (structured, performant)  
✅ **JWT** auth (stateless, scalable)  

---

## 🚀 PROCHAINES ÉTAPES

1. **Week 1:** Node update + structure prep (Sprint 1)
2. **Week 2-3:** Proxmox API implementation (Sprint 2)
3. **Week 4:** Docker + deployment (Sprint 3)
4. **Week 5:** Client integration (Sprint 4)
5. **Week 6+:** Optimisations + tests (Ongoing)

**Premier meeting:** Décider priorités au sein de Phase 1

