# 📦 Structure du projet - Workspace v2.0

## Vue d'ensemble

Ce document décrit la structure complète du projet et les composants implémentés.

## 🏗️ Architecture

### Deux applications Electron distinctes

#### 1️⃣ Application Serveur (apps/server)
- **Type**: Application Electron avec backend intégré
- **Backend**: Fastify + TypeScript + SQLite3 avec connection pooling
- **Dashboard**: Interface de monitoring en temps réel
- **Port**: 8060
- **Déploiement**: Machine serveur (via Proxmox)

#### 2️⃣ Application Client (apps/client)
- **Type**: Application Electron pure interface
- **Frontend**: Vanilla JS + Web Components
- **Connexion**: API REST + WebSocket vers le serveur
- **Déploiement**: Machines clientes (via Proxmox)

## 📂 Structure détaillée

```
workspace/
│
├── apps/
│   │
│   ├── server/                              # Backend Electron + Fastify
│   │   ├── src/
│   │   │   ├── main.ts                      # Entry point serveur Fastify
│   │   │   ├── config/
│   │   │   │   ├── env.ts                   # Configuration centralisée
│   │   │   │   └── logger.ts                # Logger personnalisé
│   │   │   ├── db/
│   │   │   │   ├── schema.sql               # Schéma SQLite complet
│   │   │   │   ├── connection.ts            # Wrapper connexion DB
│   │   │   │   └── pool.ts                  # Connection pooling (5 max)
│   │   │   ├── lib/
│   │   │   │   ├── jwt.ts                   # Gestion JWT (7j expiration)
│   │   │   │   ├── password.ts              # Hashing bcrypt (12 rounds)
│   │   │   │   └── errors.ts                # Classes d'erreurs custom
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts                  # Middleware authentification
│   │   │   │   ├── errorHandler.ts          # Gestion erreurs globale
│   │   │   │   └── logger.ts                # Logger HTTP requests
│   │   │   ├── models/
│   │   │   │   ├── User.ts                  # CRUD utilisateurs
│   │   │   │   ├── Event.ts                 # CRUD événements
│   │   │   │   └── Message.ts               # CRUD messages
│   │   │   ├── types/
│   │   │   │   ├── api.ts                   # Types API
│   │   │   │   ├── database.ts              # Types DB
│   │   │   │   ├── websocket.ts             # Types WebSocket
│   │   │   │   └── index.ts                 # Export centralisé
│   │   │   └── routes/                      # Routes REST (à ajouter)
│   │   │
│   │   ├── public/                          # Dashboard Electron
│   │   │   ├── index.html                   # Dashboard monitoring
│   │   │   ├── app.js                       # App dashboard
│   │   │   ├── test.html                    # Tests API
│   │   │   └── assets/
│   │   │       ├── css/
│   │   │       │   ├── global.css
│   │   │       │   ├── dashboard.css
│   │   │       │   └── server-dashboard.css
│   │   │       └── js/
│   │   │
│   │   ├── main.js                          # Entry point Electron
│   │   ├── preload.js                       # Preload Electron
│   │   ├── server.js                        # Demarre le serveur Fastify
│   │   ├── database.js                      # Gestion DB
│   │   ├── logger.js                        # Logger
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── forge.config.js                  # Electron Forge config
│   │
│   └── client/                              # Frontend Electron
│       ├── public/
│       │   ├── index.html                   # Page principale
│       │   ├── app.js                       # App client
│       │   ├── pages/
│       │   │   ├── home.html
│       │   │   ├── agenda.html
│       │   │   ├── application.html
│       │   │   ├── dossier.html
│       │   │   ├── reception.html
│       │   │   ├── shortcut.html
│       │   │   └── option.html
│       │   ├── components/
│       │   │   ├── header.html
│       │   │   ├── footer.html
│       │   │   ├── auth-modal.html
│       │   │   └── chat-widget.html
│       │   └── assets/
│       │       ├── css/
│       │       │   ├── global.css
│       │       │   ├── variables.css
│       │       │   ├── components/
│       │       │   │   ├── header.css
│       │       │   │   ├── footer.css
│       │       │   │   ├── auth-modal.css
│       │       │   │   └── chat-widget.css
│       │       │   └── modules/
│       │       │       ├── home.css
│       │       │       ├── agenda.css
│       │       │       ├── appli.css
│       │       │       ├── dossier.css
│       │       │       └── ...
│       │       ├── js/
│       │       │   ├── global.js
│       │       │   ├── config/
│       │       │   └── modules/
│       │       └── icons/
│       │
│       ├── config/
│       │   └── server-config.json           # Configuration serveur
│       ├── main.js                          # Entry point Electron
│       ├── preload.js                       # Preload Electron
│       ├── package.json
│       └── forge.config.js                  # Electron Forge config
│
├── data/                                    # Base de données SQLite
│   └── .gitignore                           # Ignore DB files
│
├── Jarvis/                                  # Standards AI
│   ├── Instructions.mdc                     # Standards projet
│   └── .ai-core/
│       ├── patterns.json
│       ├── rules.json
│       ├── standards.json
│       └── ...
│
├── .env                                     # Variables environnement
├── .env.example                             # Template .env
├── .gitignore                               # Ignore files
├── .eslintrc.json                           # ESLint config
├── .prettierrc.json                         # Prettier config
├── package.json                             # Root + workspaces
├── tsconfig.json                            # TypeScript root config
├── README.md                                # Documentation principale
├── PROJECT_STRUCTURE.md                     # Cette documentation
└── CHANGELOG-V2.md                          # Historique des versions
```

## 🎯 Fonctionnalités implémentées

### ✅ Serveur (apps/server)

**Architecture**
- Application Electron serveur avec backend Fastify intégré
- Dashboard de monitoring en temps réel
- TypeScript 5.3+ strict mode
- Structure modulaire par domaine

**Base de données**
- SQLite3 avec connection pooling (5 connexions)
- Schéma complet (users, events, messages)
- Modèles avec CRUD complet
- Prepared statements (protection SQL injection)
- Indexes pour performance

**Sécurité**
- JWT authentication (7 jours expiration)
- Bcrypt password hashing (12 rounds)
- Helmet (headers sécurisés)
- CORS configuré
- Middleware auth

**Configuration**
- Variables d'environnement centralisées
- Logger personnalisé
- Gestion d'erreurs centralisée

### ✅ Client (apps/client)

**Interface**
- Vanilla JS + Web Components
- Structure modulaire avec composants réutilisables
- Design system CSS
- Pages: home, agenda, dossier, application, réception, shortcut, options
- Composants: header, footer, auth-modal, chat-widget

**Connectivité**
- API client centralisé (fetch/WebSocket)
- Configuration serveur flexible
- Support hors-ligne avec cache

**Sécurité**
- Preload Electron pour isolation des contextes
- No direct node integration

## 🔄 Communication Serveur-Client

### REST API
- `GET /api/health` - Vérification santé serveur
- `/api/users/*` - Gestion utilisateurs
- `/api/events/*` - Gestion événements
- `/api/messages/*` - Gestion messages

### WebSocket
- Connection: `ws://localhost:8060`
- Messages temps réel
- Notifications

## 🚀 Scripts disponibles

```bash
# Développement
npm run dev              # Démarrer les deux apps
npm run dev:server      # Démarrer serveur seulement
npm run dev:client      # Démarrer client seulement

# Build
npm run build           # Compiler TypeScript
npm run build:server    # Build serveur
npm run build:client    # Build client

# Production
npm start               # Démarrer apps
npm start:server        # Démarrer serveur
npm start:client        # Démarrer client

# Qualité
npm run type-check      # Vérifier TypeScript
npm run lint            # ESLint
npm run format          # Prettier
npm test                # Tests
```

## 📝 Notes de développement

- Le serveur démarre automatiquement le backend Fastify
- Les clients se connectent au serveur via HTTP/WebSocket
- Chaque machine cliente a une configuration serveur (`apps/client/config/server-config.json`)
- Le database path par défaut est `~/.config/workspace/workspace.db`
- Les logs serveur sont disponibles dans le terminal Electron

## 🔐 Sécurité

- JWT tokens stockés en mémoire (client)
- Passwords hashés en base (serveur)
- No credentials dans les fichiers
- HTTPS recommandé en production
