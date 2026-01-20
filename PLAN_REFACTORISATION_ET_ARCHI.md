# 🏗️ PLAN REFACTORISATION & ARCHITECTURE AVANCÉE

**Date création:** 15 janvier 2026  
**Alignement:** ROADMAP_REFACTORING.md  
**Objectif:** Feuille de route détaillée pour atteindre 3 apps (Client + Server Dashboard + Proxmox Backend)

---

## 🔧 GUIDE RAPIDE: GitHub Workflow par Phase

### Template Généralisé pour Toutes les Phases

```bash
# ✅ AVANT DE DÉMARRER
git checkout dev
git pull origin dev

# ✅ CRÉER FEATURE BRANCH (une par phase!)
git checkout -b feature/phaseN-description

# ✅ FAIRE LES CHANGEMENTS
# ... travail ...

# ✅ VÉRIFIER
git status
git diff --stat

# ✅ COMMITER
git add -A
git commit -m "feat: phase N - description

CHANGES:
- Changement 1
- Changement 2
- ...

TESTING:
- Test 1
- Test 2

READY FOR NEXT PHASE? YES"

# ✅ POUSSER
git push origin feature/phaseN-description

# ✅ SUR GITHUB
# 1. Create Pull Request
# 2. Base: dev
# 3. Compare: feature/phaseN-description
# 4. Décrire changements
# 5. Attendre CI/CD ✅
# 6. Squash and merge

# ✅ APRÈS MERGE
git checkout dev
git pull origin dev
git branch -d feature/phaseN-description

# ✅ RECOMMENCER POUR PHASE N+1
```

### Phase 1 à 4: Checklist par Phase

| Phase | Branche | Base | Durée | Commits |
|-------|---------|------|-------|---------|
| 1 | `feature/phase1-cleanup-structure` | dev | 1 sem | ~5 |
| 2 | `feature/phase2-fastify-migration` | dev | 2 sem | ~8 |
| 3 | `feature/phase3-docker-deployment` | dev | 1 sem | ~5 |
| 4 | `feature/phase4-monitoring-cicd` | dev | 1 sem | ~8 |

### Résultat Final sur GitHub

```
Repository: workspace

Branches (Active):
  main (production)
  dev (integration) ← branch principale de travail

Pull Requests (Closed):
  #4 Phase 4: Monitoring, CI/CD & Client Integration ✅
  #3 Phase 3: Docker & Deployment ✅
  #2 Phase 2: Fastify Migration & Database Models ✅
  #1 Phase 1: Structure & Configuration ✅

Releases:
  v4.0.0 (latest) ← Après toutes phases
  v3.0.0 (current)
  v2.0.0 (snapshot)
  v1.0.0 (snapshot)

Tags:
  v4.0.0 → main (Release 4.0.0)
  v3.0.0 → main (Audit state)
  v2.0.0 → App-V3 snapshot
  v1.0.0 → Apps-V2 snapshot

GitHub Actions:
  CI/CD: npm install, build, test, lint ✅
  Docker: Build & push images ✅
  Release: Automated on tags ✅
```

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
        apiUrl: 'http://192.168.1.62:4000',
        wsUrl: 'ws://192.168.1.62:4000/ws'
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
        apiUrl: 'http://192.168.1.62:4000',
        wsUrl: 'ws://192.168.1.62:4000/ws'
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

#### 1.5 GitHub Workflow pour Phase 1

**Objectif:** Publier Phase 1 sur GitHub avec PR

**Workflow:**

```bash
# 1️⃣ AVANT DE COMMENCER (si tu reprends après une pause)
git checkout dev
git pull origin dev
git status

# 2️⃣ CRÉER LA FEATURE BRANCH (si pas déjà créée)
git checkout -b feature/phase1-cleanup-structure

# 3️⃣ FAIRE LES CHANGEMENTS
# - Node.js update
# - npm cleanup
# - Créer dossiers structure
# - Créer config/network.config.ts
# - Ajouter package.json/tsconfig.json pour proxmox
# - Créer .env.example

# 4️⃣ VÉRIFIER LES CHANGEMENTS
git status
git diff --stat
# Devrait montrer: ~30 fichiers changés

# 5️⃣ COMMITER PROPREMENT
git add -A

git commit -m "feat: phase 1 - structure + config + cleanup dépendances

PHASE 1 CHANGES:
- Upgrade Node.js to v20 LTS (from 18.19.1)
- Remove unused dependencies (puppeteer, jest, supertest, ts-jest)
- Create proxmox app structure (src/, docker/)
- Create config/network.config.ts for multi-env configuration
- Create apps/proxmox with package.json and tsconfig.json
- Create docker/ directory for deployment setup
- Create shared/ directory for shared types and utilities
- Create .env.example for Proxmox configuration
- Add README files to all new modules

IMPACTS:
- npm install now faster (no puppeteer errors)
- Node 20 LTS unlocks newer dependencies
- Ready for Phase 2: Fastify migration"

# 6️⃣ POUSSER SUR GITHUB
git push origin feature/phase1-cleanup-structure

# Output devrait montrer:
# * [new branch]      feature/phase1-cleanup-structure -> feature/phase1-cleanup-structure
# 
# Create a pull request for 'feature/phase1-cleanup-structure' on GitHub by visiting:
#      https://github.com/SandersonnDev/workspace/pull/new/feature/phase1-cleanup-structure
```

**7️⃣ CRÉER LA PR SUR GITHUB:**

```
GitHub.com → Pull Requests → "New Pull Request"
  ├─ Compare: feature/phase1-cleanup-structure
  ├─ Base: dev
  ├─ Title: "Phase 1: Structure & Configuration"
  ├─ Description: (copier le message du commit)
  │   ```
  │   # Phase 1: Préparation
  │   
  │   ## Changements
  │   - ✅ Node.js v20 LTS
  │   - ✅ Cleanup dépendances
  │   - ✅ Structure proxmox
  │   - ✅ Config centralisée
  │   
  │   ## Tests effectués
  │   - `npm install` passes
  │   - `npm run dev` works
  │   
  │   ## Prêt pour Phase 2? OUI
  │   ```
  └─ Create pull request
```

**8️⃣ REVIEW & APPROVAL:**

```
Actions post-création PR:
- GitHub Actions s'exécute (linting, tests)
- Attendre validation ✅
- Approuver soi-même (ou attendre feedback)
- Merger: "Squash and merge" (recommandé)
```

**9️⃣ MERGER ET NETTOYER:**

```bash
# Sur GitHub: Click "Squash and merge"

# Localement (après merge):
git checkout dev
git pull origin dev

# Supprimer la branche locale
git branch -d feature/phase1-cleanup-structure

# Vérifier que tout est à jour
git log --oneline -5
# Devrait montrer le commit de Phase 1
```

**✅ Résultat:**

```bash
$ git branch -a
* dev
  main
  remotes/origin/HEAD -> origin/main
  remotes/origin/dev
  remotes/origin/feature/phase1-cleanup-structure (DELETE après merge)
  remotes/origin/main

$ git log --oneline
abc1234 (HEAD -> dev) Merge pull request #1 Phase 1: Structure & Configuration
def5678 feat: phase 1 - structure + config + cleanup dépendances
xyz9012 (tag: v3.0.0, origin/main) Audit + RoadMap Refactorisation
```

**Checklist:**
- [ ] Feature branch poussée
- [ ] PR créée (base: dev)
- [ ] CI/CD jobs passent
- [ ] PR mergée dans dev
- [ ] Feature branch supprimée
- [ ] dev mis à jour localement

**Impact:** 🟢 HAUT - Phase 1 complete et documentée

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

#### 2.6 GitHub Workflow pour Phase 2

**Objectif:** Publier Migration Fastify sur GitHub

**Workflow:**

```bash
# 1️⃣ RÉCUPÉRER LES CHANGEMENTS (Phase 1 est mergée)
git checkout dev
git pull origin dev
git status

# 2️⃣ CRÉER NOUVELLE FEATURE BRANCH (par phase!)
git checkout -b feature/phase2-fastify-migration

# 3️⃣ FAIRE LES CHANGEMENTS PHASE 2
# - Créer apps/proxmox/src/main.ts (Fastify setup)
# - Migrer routes Express → Fastify
# - Créer modèles Database (User, Message, Event, ActivityLog)
# - Implémenter WebSocket handlers
# - Créer schema PostgreSQL
# - Tester endpoints

# 4️⃣ VÉRIFIER LES CHANGEMENTS
git status
git diff --stat
# Devrait montrer: ~20 fichiers changés

# 5️⃣ COMMITER PROPREMENT
git add -A

git commit -m "feat: phase 2 - fastify migration + database models

PHASE 2 CHANGES:
- Create apps/proxmox/src/main.ts (Fastify entry point)
- Setup Fastify with Helmet, CORS, WebSocket
- Migrate Express routes to Fastify:
  - /api/auth/* (login, logout, verify)
  - /api/events/* (agenda management)
  - /api/messages/* (chat)
  - /api/shortcuts/* (user shortcuts)
  - /api/lots/* (réception)
- Create TypeScript models:
  - User (getAll, getById, create, update, delete)
  - Message (create, getByConversation, markAsRead)
  - Event (create, update, getRange)
  - ActivityLog (log, getRecent)
- Implement WebSocket handlers:
  - message:send
  - presence:update
  - typing:indicator
- Create PostgreSQL schema (users, messages, events, activity_logs)
- Add indexes for performance

TESTING:
- /api/health endpoint responds
- WebSocket /ws connects
- All routes migrate from Express
- PostgreSQL schema validated

READY FOR PHASE 3? YES"

# 6️⃣ POUSSER SUR GITHUB
git push origin feature/phase2-fastify-migration
```

**7️⃣ CRÉER LA PR SUR GITHUB:**

```
GitHub.com → Pull Requests → "New Pull Request"
  ├─ Compare: feature/phase2-fastify-migration
  ├─ Base: dev
  ├─ Title: "Phase 2: Fastify Migration & Database Models"
  ├─ Description:
  │   ```
  │   # Phase 2: Migration Proxmox
  │   
  │   ## Changements
  │   - ✅ Fastify setup (replaces Express)
  │   - ✅ Routes migrated (8 endpoints)
  │   - ✅ Database models created
  │   - ✅ WebSocket handlers implemented
  │   - ✅ PostgreSQL schema designed
  │   
  │   ## Tests effectués
  │   - Routes respond on localhost:4000
  │   - WebSocket connects
  │   - Database CRUD operations work
  │   
  │   ## Breaking Changes
  │   - Express endpoint format changes (Fastify syntax)
  │   - Client must update API calls
  │   
  │   ## Prêt pour Phase 3? OUI
  │   ```
  └─ Create pull request
```

**8️⃣ CODE REVIEW & MERGE:**

```bash
# GitHub Actions valide:
# - npm install
# - npm run build
# - Type checking
# - Linting

# Une fois approuvé:
# Click "Squash and merge" on GitHub

# Localement (après merge):
git checkout dev
git pull origin dev
git branch -d feature/phase2-fastify-migration

# Vérifier
git log --oneline -5
```

**✅ Résultat:**

```bash
$ git branch -a
* dev
  main
  remotes/origin/dev
  remotes/origin/main

$ git log --oneline
abc1234 (HEAD -> dev) Merge pull request #2 Phase 2: Fastify Migration
def5678 feat: phase 2 - fastify migration + database models
ghi9012 Merge pull request #1 Phase 1: Structure & Configuration
jkl3456 feat: phase 1 - structure + config + cleanup dépendances
```

**Checklist:**
- [ ] Feature branch créée depuis dev
- [ ] Tous changements Phase 2 commités
- [ ] PR créée (base: dev)
- [ ] CI/CD jobs passent
- [ ] PR mergée
- [ ] dev mis à jour localement
- [ ] Feature branch supprimée

**Impact:** 🟢 HAUT - Backend foundation solid

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

#### 3.3 GitHub Workflow pour Phase 3

**Objectif:** Publier Docker & Deployment sur GitHub

**Workflow:**

```bash
# 1️⃣ RÉCUPÉRER LES CHANGEMENTS (Phase 2 est mergée)
git checkout dev
git pull origin dev
git status

# 2️⃣ CRÉER NOUVELLE FEATURE BRANCH
git checkout -b feature/phase3-docker-deployment

# 3️⃣ FAIRE LES CHANGEMENTS PHASE 3
# - Créer docker/proxmox/Dockerfile
# - Créer docker/proxmox/docker-compose.yml
# - Créer docker/.env.example
# - Créer scripts de deployment
# - Créer docs/DEPLOYMENT.md
# - Tester build Docker

# 4️⃣ VÉRIFIER LES CHANGEMENTS
git status
git diff --stat
# Devrait montrer: ~10 fichiers changés

# 5️⃣ COMMITER PROPREMENT
git add -A

git commit -m "feat: phase 3 - docker setup + deployment

PHASE 3 CHANGES:
- Create docker/proxmox/Dockerfile:
  - Base Node 20 Alpine
  - Install dependencies
  - Expose port 4000
  - Health checks
- Create docker/proxmox/docker-compose.yml:
  - Proxmox service (Fastify)
  - PostgreSQL service
  - Volume management
  - Health checks
- Create docker/.env.example:
  - Database configuration
  - Environment variables
  - Secrets template
- Create deployment documentation:
  - docker/README.md
  - docs/DEPLOYMENT.md
  - Kubernetes manifests (optional)
- Setup CI/CD for Docker builds

TESTING:
- docker-compose up works
- Container healthcheck passes
- Services communicate correctly
- Volume mounts work

READY FOR PHASE 4? YES"

# 6️⃣ POUSSER SUR GITHUB
git push origin feature/phase3-docker-deployment
```

**7️⃣ CRÉER LA PR SUR GITHUB:**

```
GitHub.com → Pull Requests → "New Pull Request"
  ├─ Compare: feature/phase3-docker-deployment
  ├─ Base: dev
  ├─ Title: "Phase 3: Docker & Deployment"
  ├─ Description:
  │   ```
  │   # Phase 3: Docker & Déploiement
  │   
  │   ## Changements
  │   - ✅ Docker containerization
  │   - ✅ docker-compose for local dev
  │   - ✅ PostgreSQL container
  │   - ✅ Deployment documentation
  │   - ✅ CI/CD for Docker builds
  │   
  │   ## Tests effectués
  │   - docker-compose up successful
  │   - Container healthchecks pass
  │   - Services communicate
  │   - Volume mounts work
  │   
  │   ## Prêt pour Phase 4? OUI
  │   ```
  └─ Create pull request
```

**8️⃣ CODE REVIEW & MERGE:**

```bash
# GitHub Actions:
# - Build Docker image
# - Docker compose test
# - Healthcheck validation

# Une fois approuvé:
# Click "Squash and merge" on GitHub

# Localement (après merge):
git checkout dev
git pull origin dev
git branch -d feature/phase3-docker-deployment

# Vérifier
git log --oneline -5
```

**✅ Résultat:**

```bash
$ docker-compose -f docker/proxmox/docker-compose.yml up
# Services démarrent correctement

$ curl http://localhost:4000/api/health
# {"status":"ok","timestamp":"2026-01-15T..."}

$ git log --oneline
abc1234 (HEAD -> dev) Merge pull request #3 Phase 3: Docker & Deployment
def5678 feat: phase 3 - docker setup + deployment
ghi9012 Merge pull request #2 Phase 2: Fastify Migration
...
```

**Checklist:**
- [ ] Feature branch créée depuis dev
- [ ] Dockerfile créé et testé
- [ ] docker-compose.yml créé
- [ ] PR créée (base: dev)
- [ ] CI/CD Docker jobs passent
- [ ] PR mergée
- [ ] dev mis à jour localement

**Impact:** 🟢 HAUT - Production containerized

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

#### 4.3 GitHub Workflow pour Phase 4

**Objectif:** Publier Client Integration & Monitoring sur GitHub

**Workflow:**

```bash
# 1️⃣ RÉCUPÉRER LES CHANGEMENTS (Phase 3 est mergée)
git checkout dev
git pull origin dev
git status

# 2️⃣ CRÉER NOUVELLE FEATURE BRANCH
git checkout -b feature/phase4-monitoring-cicd

# 3️⃣ FAIRE LES CHANGEMENTS PHASE 4
# - Mettre à jour Client pour utiliser Proxmox
# - Mettre à jour connection-config.json
# - Créer routes monitoring Proxmox
# - Ajouter stats WebSocket
# - Créer CI/CD workflows GitHub
# - Ajouter tests et linting

# 4️⃣ VÉRIFIER LES CHANGEMENTS
git status
git diff --stat
# Devrait montrer: ~15 fichiers changés

# 5️⃣ COMMITER PROPREMENT
git add -A

git commit -m "feat: phase 4 - monitoring + ci/cd + client integration

PHASE 4 CHANGES:
- Update Client Electron to use Proxmox backend:
  - Update connection-config.json (point to Proxmox)
  - Update API client (new endpoints)
  - Update WebSocket connection
- Create monitoring endpoints in Proxmox:
  - /api/monitoring/stats (live stats)
  - /api/monitoring/logs (activity logs)
  - /ws monitoring channel
- Update Server Dashboard:
  - Real-time stats from Proxmox
  - Activity feed updates
  - User presence tracking
- Setup GitHub Actions CI/CD:
  - npm install validation
  - TypeScript compilation check
  - ESLint + Prettier linting
  - Docker build and push
  - Automated releases
- Add comprehensive tests:
  - API endpoints
  - WebSocket handlers
  - Database operations
- Create documentation:
  - API.md (all endpoints)
  - WEBSOCKET.md (message format)
  - DATABASE.md (schema)
  - DEPLOYMENT.md (production setup)
  - TROUBLESHOOTING.md (common issues)

TESTING:
- Client connects to Proxmox
- Chat works end-to-end
- Agenda syncs correctly
- Dashboard shows live stats
- All tests pass
- CI/CD jobs succeed

READY FOR PRODUCTION? YES"

# 6️⃣ POUSSER SUR GITHUB
git push origin feature/phase4-monitoring-cicd
```

**7️⃣ CRÉER LA PR SUR GITHUB:**

```
GitHub.com → Pull Requests → "New Pull Request"
  ├─ Compare: feature/phase4-monitoring-cicd
  ├─ Base: dev
  ├─ Title: "Phase 4: Monitoring, CI/CD & Client Integration"
  ├─ Description:
  │   ```
  │   # Phase 4: Monitoring, Tests & CI/CD
  │   
  │   ## Changements
  │   - ✅ Client connected to Proxmox backend
  │   - ✅ Monitoring endpoints created
  │   - ✅ Real-time stats via WebSocket
  │   - ✅ GitHub Actions CI/CD setup
  │   - ✅ Comprehensive tests added
  │   - ✅ Full documentation created
  │   
  │   ## Tests effectués
  │   - Client to Proxmox connection successful
  │   - Chat end-to-end working
  │   - Agenda synchronization verified
  │   - Dashboard stats updating in real-time
  │   - All unit tests pass
  │   - All integration tests pass
  │   
  │   ## CI/CD Workflows Added
  │   - npm install validation
  │   - TypeScript compilation
  │   - ESLint linting
  │   - Unit tests
  │   - Docker build & push
  │   - Automated releases
  │   
  │   ## REFACTORISATION COMPLÈTE? OUI ✅
  │   ```
  └─ Create pull request
```

**8️⃣ CODE REVIEW & MERGE:**

```bash
# GitHub Actions:
# - npm install and build
# - TypeScript type checking
# - ESLint linting
# - All tests pass
# - Docker image builds
# - Automated release creation

# Une fois approuvé:
# Click "Squash and merge" on GitHub

# Localement (après merge):
git checkout dev
git pull origin dev
git branch -d feature/phase4-monitoring-cicd

# Vérifier
git log --oneline -5
```

**✅ Résultat Final:**

```bash
$ git branch -a
* dev
  main
  remotes/origin/dev
  remotes/origin/main

$ git log --oneline
abc1234 (HEAD -> dev) Merge pull request #4 Phase 4: Monitoring & CI/CD
def5678 feat: phase 4 - monitoring + ci/cd + client integration
ghi9012 Merge pull request #3 Phase 3: Docker & Deployment
jkl3456 Merge pull request #2 Phase 2: Fastify Migration
mno5678 Merge pull request #1 Phase 1: Structure & Configuration
pqr9012 (tag: v3.0.0) Audit + RoadMap Refactorisation

$ git tag
v1.0.0 (ancien snapshot)
v2.0.0 (ancien snapshot)
v3.0.0 (release courante)
v4.0.0 (à créer après Phase 4)

$ github.com/SandersonnDev/workspace
  ├─ Branches: main, dev
  ├─ Pull Requests: #1, #2, #3, #4 (tous mergés)
  ├─ Releases: v1.0.0, v2.0.0, v3.0.0, v4.0.0
  └─ Actions: CI/CD passing ✅
```

**✅ REFACTORISATION 100% COMPLÈTE**

```bash
✅ Phase 1: Node upgrade + Structure
✅ Phase 2: Fastify migration + Database
✅ Phase 3: Docker containerization
✅ Phase 4: Monitoring + CI/CD + Integration

Architecture cible atteinte:
├─ Client Electron (léger)
├─ Server Dashboard (monitoring)
└─ Proxmox Backend (Fastify + PostgreSQL)
```

**Checklist finale:**
- [ ] Feature branch créée depuis dev
- [ ] Tous changements Phase 4 commités
- [ ] PR créée (base: dev)
- [ ] Tous CI/CD jobs passent
- [ ] PR mergée
- [ ] dev mis à jour localement
- [ ] Tag v4.0.0 créé sur main
- [ ] Release créée sur GitHub

**Impact:** 🟢 CRITIQUE - Refactorisation Complète!

---

## 🚀 POST-REFACTORISATION (BONUS)

### Créer une Release v4.0.0

Après que Phase 4 soit mergée dans dev:

```bash
# 1️⃣ FUSIONNER dev DANS main
git checkout main
git pull origin main
git merge dev

# 2️⃣ CRÉER TAG v4.0.0
git tag v4.0.0 -m "Release v4.0.0: Complete architecture refactoring
- Phase 1: Node upgrade & structure
- Phase 2: Fastify migration
- Phase 3: Docker containerization
- Phase 4: Monitoring & CI/CD"

# 3️⃣ POUSSER VERS GITHUB
git push origin main
git push origin v4.0.0

# 4️⃣ CRÉER RELEASE SUR GITHUB
GitHub.com → Releases → "Create a new release"
  ├─ Tag: v4.0.0
  ├─ Target: main
  ├─ Title: Release 4.0.0 - Architecture Refactoring Complete
  ├─ Description: [Voir RELEASE_NOTES.md]
  └─ Publish release
```

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

