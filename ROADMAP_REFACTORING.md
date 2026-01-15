# 📋 Roadmap Refactoring & Architecture - Janvier 2026

**Date:** 13 janvier 2026  
**État:** Planning Phase  
**Responsable:** SandersonnDev

---

## 🎯 Objectif Global

Restructurer le projet en 3 applications distinctes avec une architecture scalable :
1. **Client Electron** - App utilisateurs (tchat, agenda, réception)
2. **Server Electron** - Dashboard monitoring centralisé
3. **Proxmox (conteneur)** - Backend API + Base de données centralisée

---

## 📂 Architecture Proposée

### Dossiers Actuels vs Futurs

```
AVANT:
apps/
├── client/
├── server/  (mélange Electron + Express + TypeScript)

APRÈS:
apps/
├── client/           # App Electron - Utilisateurs
├── server/           # Dashboard Electron - Monitoring
└── proxmox/          # 🆕 Backend Fastify pour conteneur

config/               # 🆕 Configuration centralisée
docker/               # 🆕 Dossier Docker
shared/               # 🆕 Code partagé (types, constantes)
docs/                 # 🆕 Documentation
```

---

## 🔧 Tech Stack Recommandée

### Proxmox (Conteneur - Backend API)
| Composant | Technologie | Version | Justification |
|-----------|-------------|---------|--------------|
| Framework | **Fastify** | 4.24+ | 3x plus rapide qu'Express, validation intégrée, performant sous charge |
| Language | **TypeScript** | 5.3+ | Maintenabilité, autocomplétion, fiabilité |
| Database | **PostgreSQL** | 16+ | Scalable, ACID, remplace SQLite |
| Auth | **JWT** | - | Stateless, léger |
| WebSocket | **@fastify/websocket** | - | Temps réel pour tchat/agenda |
| Runtime | **Node.js** | 20+ LTS | Support long terme, dépendances compatibles |

### Client Electron
| Composant | Technologie | Version |
|-----------|-------------|---------|
| Desktop | **Electron** | 39+ |
| Rendering | **Vanilla JS** | ES6+ |
| Config | **proxmox-config.json** | - |

### Server Electron (Dashboard)
| Composant | Technologie | Version |
|-----------|-------------|---------|
| Desktop | **Electron** | 39+ |
| Backend | **Express** | 4.22+ |
| Rendering | **HTML/CSS/JS** | vanilla |
| Config | **proxmox-config.json** | - |

---

## 🔧 GitHub Workflow - Cycle de Refactorisation

### Branching Strategy: Git Flow

```
main (production, releases tagged)
  ↑
dev (integration, feature merges)
  ├─ feature/phase1-cleanup-structure
  ├─ feature/phase2-fastify-migration
  ├─ feature/phase3-docker-deployment
  └─ feature/phase4-monitoring-cicd

Tags:
  v1.0.0 (ancien snapshot)
  v2.0.0 (snapshot before refactor)
  v3.0.0 (current release)
  v4.0.0 (after phase 4)
```

### Workflow pour Chaque Phase

**1️⃣ Avant de démarrer:**
```bash
git checkout dev
git pull origin dev
```

**2️⃣ Créer feature branch (UNE par phase!):**
```bash
git checkout -b feature/phaseN-description
```

**3️⃣ Travail + commits:**
```bash
git add -A
git commit -m "feat: phase N - description"
git push origin feature/phaseN-description
```

**4️⃣ Sur GitHub - Créer PR:**
- Base: `dev`
- Compare: `feature/phaseN-description`
- CI/CD valide (npm, TypeScript, lint, tests)

**5️⃣ Merger:**
- Squash and merge sur GitHub
- Suppression automatique de la feature branch

**6️⃣ Mettre à jour localement:**
```bash
git checkout dev
git pull origin dev
git branch -d feature/phaseN-description
```

### Résultat Final (Après Phase 4)

```
Releases sur GitHub:
  v4.0.0 (latest)  → Release 4.0.0: Architecture refactoring complete
  v3.0.0           → Release 3.0.0: Current (baseline before changes)
  v2.0.0           → Snapshot App-V3 before refactor
  v1.0.0           → Snapshot Apps-V2 before refactor

Pull Requests (Closed):
  #4 Phase 4: Monitoring, CI/CD & Client Integration
  #3 Phase 3: Docker & Deployment
  #2 Phase 2: Fastify Migration & Database
  #1 Phase 1: Structure & Configuration

Branches:
  main (tagged releases)
  dev (active development)
```

---

## 🚨 Problèmes Identifiés

### 1. Node.js Version (CRITIQUE)
**Problème:** Node v18.19.1 (trop vieux)

**Dépendances bloquées:**
- `@electron/rebuild@4.0.1` → Node >=22.12.0
- `minimatch@10.1.1` → Node 20 || >=22
- `node-abi@4.24.0` → Node >=22.12.0
- `@isaacs/brace-expansion@5.0.0` → Node 20 || >=22
- `@isaacs/balanced-match@4.0.1` → Node 20 || >=22

**Erreur npm update:**
```
npm ERR! code 1
npm ERR! path /home/goupil/Développement/workspace/node_modules/puppeteer
npm ERR! ERROR: Failed to set up chrome-headless-shell v143.0.7499.192!
npm ERR! Error: read ECONNRESET
```

**Solution:** Mettre à jour vers Node 20 LTS (ou 22)

---

### 2. Architecture Confuse (MAJEUR)
**Problème:** 2 architectures incompatibles coexistent

| Approche | Fichiers | État |
|----------|----------|------|
| **Express + WebSocket** | `apps/server/server.js`, `apps/server/routes/*.js` | ✅ Fonctionnelle |
| **Fastify + TypeScript** | `apps/server/src/main.ts` | ❌ Pas utilisée |

**Décision:** Fastify pour Proxmox, Express gardé pour Server Electron

---

### 3. Dépendances Inutiles (MAJEUR)

**À SUPPRIMER:**
- ❌ `puppeteer` - Cause erreur npm, pas utilisé
- ❌ `@fastify/cors`, `@fastify/helmet` - En dev, pas utilisées
- ❌ `jest`, `supertest`, `ts-jest` - Tests non configurés
- ❌ `electron-builder` - Dupliqué client/server
- ❌ `electron-squirrel-startup` - Windows only, optionnel
- ❌ `@electron-forge/plugin-webpack` - À mettre en devDep

**À CONSERVER:**
- ✅ `express`, `cors`, `helmet`, `ws`
- ✅ `jsonwebtoken`, `bcryptjs`
- ✅ `electron`, `@electron-forge/*`
- ✅ `typescript`, `eslint`, `prettier`

---

### 4. Configuration Distribuée (PROBLÈME)

**Problème:** Pas de source unique de configuration réseau
- Client/Server ne savent pas où est le Proxmox
- IP et ports hard-codés potentiellement
- Difficile à déployer

**Solution:** Fichier config centralisé

---

## 📋 Dépendances npm par App

### Workspace Root
```json
{
  "devDependencies": {
    "typescript": "^5.3.0",
    "eslint": "^9.0.0",
    "prettier": "^3.0.0",
    "@types/node": "^20.0.0"
  }
}
```

### apps/client/package.json
```json
{
  "dependencies": {
    "electron": "^39.0.0"
  },
  "devDependencies": {
    "@electron-forge/cli": "^7.0.0",
    "@electron-forge/maker-squirrel": "^7.0.0",
    "@electron-forge/maker-zip": "^7.0.0",
    "@electron-forge/maker-deb": "^7.0.0",
    "electron-updater": "^6.0.0"
  }
}
```

### apps/server/package.json
```json
{
  "dependencies": {
    "express": "^4.22.0",
    "cors": "^2.8.0",
    "helmet": "^7.0.0",
    "ws": "^8.0.0",
    "jsonwebtoken": "^9.0.0",
    "bcryptjs": "^2.4.0",
    "dotenv": "^16.0.0",
    "sqlite3": "^5.0.0",
    "electron": "^39.0.0"
  },
  "devDependencies": {
    "@electron-forge/cli": "^7.0.0",
    "typescript": "^5.3.0"
  }
}
```

### apps/proxmox/package.json (NOUVEAU)
```json
{
  "dependencies": {
    "fastify": "^4.24.0",
    "@fastify/cors": "^8.0.0",
    "@fastify/helmet": "^11.0.0",
    "@fastify/websocket": "^9.0.0",
    "jsonwebtoken": "^9.0.0",
    "bcryptjs": "^2.4.0",
    "dotenv": "^16.0.0",
    "pg": "^8.10.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "@types/node": "^20.0.0",
    "@types/pg": "^8.0.0"
  }
}
```

---

## 🏗️ Structure des Fichiers

### Nouveau Dossier: `apps/proxmox/`

```
apps/proxmox/
├── src/
│   ├── main.ts                    # Entry point Fastify
│   ├── config/
│   │   ├── env.ts                 # Variables d'environnement
│   │   └── database.ts            # Config PostgreSQL
│   ├── middleware/
│   │   ├── auth.ts                # JWT middleware
│   │   ├── errorHandler.ts
│   │   └── logger.ts
│   ├── routes/
│   │   ├── auth.ts                # Authentification
│   │   ├── events.ts              # Logs d'activité
│   │   ├── messages.ts            # Historique messages
│   │   ├── agenda.ts              # Événements agenda
│   │   ├── reception.ts           # Opérations réception
│   │   ├── monitoring.ts          # Dashboard data
│   │   └── health.ts              # Health check
│   ├── models/
│   │   ├── User.ts
│   │   ├── Message.ts
│   │   ├── Event.ts
│   │   ├── ActivityLog.ts         # 🆕 Logs des actions
│   │   └── index.ts
│   ├── services/
│   │   ├── auth.service.ts
│   │   ├── monitoring.service.ts
│   │   └── websocket.service.ts
│   ├── types/
│   │   ├── index.ts
│   │   └── proxmox.ts
│   └── ws/
│       └── handlers.ts            # Handlers WebSocket
├── Dockerfile
├── docker-entrypoint.sh
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

### Nouveau Dossier: `config/`

```
config/
├── network.config.ts              # Config réseau centralisée
├── environments.json              # Configs par env
└── README.md
```

### Nouveau Dossier: `docker/`

```
docker/
├── proxmox/
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── .env.example
│   └── README.md
└── dev/
    └── docker-compose.yml
```

### Nouveau Dossier: `shared/`

```
shared/
├── types/
│   ├── api.ts                     # Types API partagés
│   ├── messages.ts                # Format messages WebSocket
│   └── events.ts                  # Events monitoring
└── utils/
    └── constants.ts               # Ports, URLs, constantes
```

---

## 🔌 Configuration Réseau (CLEF)

### `config/network.config.ts`

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
}

export const getConfig = (env: 'development' | 'production') => {
  return NETWORK_CONFIG.environments[env]
}
```

### `apps/proxmox/.env.example`

```bash
NODE_ENV=production
PORT=4000
HOST=0.0.0.0

# DATABASE
DATABASE_TYPE=postgresql
DATABASE_HOST=db.workspace.local
DATABASE_PORT=5432
DATABASE_NAME=workspace
DATABASE_USER=workspace
DATABASE_PASSWORD=changeme

# AUTH
JWT_SECRET=your-secret-key-change-me
JWT_EXPIRY=24h
BCRYPT_ROUNDS=10

# CORS
ALLOWED_ORIGINS=https://client.workspace.local:3000,https://server.workspace.local:5000

# LOGS
LOG_LEVEL=info
LOG_FILE=/var/log/workspace-proxmox/app.log

# MONITORING
ENABLE_ACTIVITY_LOGGING=true
LOG_RETENTION_DAYS=90
```

---

## 📊 Communication Client ↔ Proxmox

### Architecture WebSocket

```
CLIENT (Electron)
    │
    ├─→ REST API (HTTP POST/GET)
    │   - Auth (login/logout)
    │   - Fetch historical data
    │
    └─→ WebSocket (WS)
        - Real-time messages
        - Agenda updates
        - Activity notifications

            ↓↓↓

    PROXMOX (Backend API)
    
    Logs all activities:
    - User connected
    - Message sent: "text", timestamp, userId
    - Calendar event added
    - Reception operations
    
            ↓↓↓

SERVER (Electron Dashboard)
    │
    └─→ WebSocket (WS)
        - Live activity feed
        - Real-time monitoring
        - User statistics
        - System health
```

---

## 🚀 Plan d'Action

### Phase 1: Préparation (Semaine 1)
- [ ] Mettre à jour Node.js vers v20 LTS
- [ ] Nettoyer les `package.json` (supprimer dépendances inutiles)
- [ ] Créer la structure de dossiers `apps/proxmox/`, `config/`, `docker/`, `shared/`
- [ ] Créer `config/network.config.ts`
- [ ] Mettre à jour `Jarvis/Instructions.mdc` avec le nouveau tech stack

### Phase 2: Migration Proxmox (Semaine 2-3)
- [ ] Créer `apps/proxmox/src/main.ts` (entry point Fastify)
- [ ] Migrer les routes Express → Fastify
- [ ] Créer les modèles Database (User, Message, Event, ActivityLog)
- [ ] Implémenter WebSocket avec `@fastify/websocket`
- [ ] Créer routes `/health`, `/auth`, `/events`, `/monitoring`

### Phase 3: Docker & Déploiement (Semaine 4)
- [ ] Créer `Dockerfile` pour Proxmox
- [ ] Créer `docker-compose.yml`
- [ ] Tester en local avec Docker
- [ ] Créer `docs/DEPLOYMENT.md`

### Phase 4: Clients (Semaine 5)
- [ ] Mettre à jour Client Electron pour utiliser Proxmox
- [ ] Mettre à jour Server Electron pour utiliser Proxmox
- [ ] Tester communication Client ↔ Proxmox
- [ ] Tester WebSocket temps réel

---

## 📚 Documentation à Créer

| Document | Contenu |
|----------|---------|
| `ARCHITECTURE.md` | Vue d'ensemble de l'architecture |
| `API.md` | Documentation des endpoints Fastify |
| `DEPLOYMENT.md` | Guide de déploiement sur Proxmox |
| `NETWORK.md` | Configuration réseau et ports |
| `WEBSOCKET.md` | Format des messages WebSocket |
| `DATABASE.md` | Schéma PostgreSQL |

---

## 🎯 Avantages de cette Architecture

| Aspect | Bénéfice |
|--------|----------|
| **Scalabilité** | Proxmox peut gérer des milliers de clients WebSocket |
| **Maintenabilité** | Code séparé par app, responsabilités claires |
| **Déploiement** | Dossier Docker prêt à copier-coller |
| **Monitoring** | Dashboard centralisé pour suivre tous les utilisateurs |
| **Performance** | Fastify + PostgreSQL + TypeScript = optimisé |
| **Sécurité** | JWT, CORS, HTTPS, audit logs centralisé |
| **Dev/Prod** | Même code, configs différentes (.env) |

---

## ❓ Points d'Attention

### 1. Migration SQLite → PostgreSQL
**Question:** Quand migrer les données existantes?
**Réponse:** Phase 2 - Créer script de migration

### 2. Rétro-compatibilité
**Question:** Les clients Electron v18 seront-ils compatibles?
**Réponse:** Oui, sauf s'ils utilisent des dépendances Node-specific

### 3. Authentification JWT
**Question:** Tokens persistants sur les clients?
**Réponse:** À définir - localStorage vs secure storage

---

## 🔗 Liens & Références

- **Fastify Docs:** https://www.fastify.io/
- **Electron Docs:** https://www.electronjs.org/docs
- **PostgreSQL Docs:** https://www.postgresql.org/docs/
- **WebSocket Spec:** https://tools.ietf.org/html/rfc6455
- **Node.js LTS:** https://nodejs.org/

---

## 📞 Décisions Prises

✅ **Architecture:** 3 apps distinctes (Client, Server, Proxmox)  
✅ **Backend:** Fastify + TypeScript + PostgreSQL  
✅ **Node.js:** v20 LTS (ou v22)  
✅ **Communication:** REST API + WebSocket  
✅ **Déploiement:** Docker + Docker-Compose  
✅ **Config:** Centralisée dans `config/network.config.ts`  

---

**Prochaines étapes:** Choisir par où commencer la Phase 1 ⬇️
