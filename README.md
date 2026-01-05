# Workspace v2.0

Application de gestion de workspace avec deux applications Electron distinctes : un serveur backend (Fastify + TypeScript + Dashboard) et un client interface utilisateur.

## 🎯 Architecture

- **Monorepo** avec npm workspaces
- **Serveur (Electron)**: Application Electron avec backend Fastify + TypeScript + SQLite3 + Dashboard monitoring
- **Client (Electron)**: Application Electron avec interface utilisateur Vanilla JS + Web Components
- **Communication**: HTTP REST API + WebSocket temps réel
- **Déploiement**: Deux applications séparées (via Proxmox)

### Vue d'ensemble

```
┌─────────────────────────────┐         HTTP/WS         ┌─────────────────────────────┐
│  apps/client (Electron)     │  ◄──────────────────►   │  apps/server (Electron)     │
│                             │                          │                             │
│  ┌───────────────────────┐  │                          │  ┌───────────────────────┐  │
│  │  Interface            │  │                          │  │  Dashboard            │  │
│  │  Utilisateur          │  │                          │  │  Monitoring           │  │
│  └───────────────────────┘  │                          │  └───────────────────────┘  │
│                             │                          │                             │
│  ┌───────────────────────┐  │                          │  ┌───────────────────────┐  │
│  │  API Client           │  │    REST API (8060)       │  │  Fastify Server       │  │
│  │  (fetch/WebSocket)    │──┼──────────────────────────┼─►│  TypeScript           │  │
│  └───────────────────────┘  │                          │  └───────────────────────┘  │
│                             │                          │           │                 │
│                             │                          │           ▼                 │
│                             │                          │  ┌───────────────────────┐  │
│                             │                          │  │  SQLite3 + Pool       │  │
│                             │                          │  │  (5 connexions)       │  │
│                             │                          │  └───────────────────────┘  │
└─────────────────────────────┘                          └─────────────────────────────┘
      Machine Cliente                                           Machine Serveur
```

## 🚀 Démarrage rapide

### Prérequis

- Node.js 18+ LTS
- npm 8+

### Installation

```bash
# Installer toutes les dépendances
npm install

# Créer le fichier .env
cp .env.example .env
```

### Développement

```bash
# Démarrer les deux applications Electron en parallèle
npm run dev

# Ou séparément:
npm run dev:server  # Application Electron serveur (Backend Fastify + Dashboard)
npm run dev:client  # Application Electron client (Interface utilisateur)
```

### Mode production

```bash
# Build du backend TypeScript
npm run build

# Démarrer
npm start
```

## 📁 Structure du projet

```
workspace/
├── apps/
│   ├── server/               # Application Electron Serveur
│   │   ├── src/              # Backend TypeScript + Fastify
│   │   │   ├── config/       # Configuration
│   │   │   ├── db/           # Couche base de données + pool
│   │   │   ├── lib/          # JWT, Password, Errors
│   │   │   ├── middleware/   # Auth, Logger, ErrorHandler
│   │   │   ├── models/       # User, Event, Message (CRUD)
│   │   │   ├── types/        # Types TypeScript
│   │   │   └── main.ts       # Entry point Fastify
│   │   ├── public/           # Dashboard Electron + monitoring
│   │   ├── main.js           # Entry point Electron
│   │   ├── preload.js        # Preload Electron
│   │   └── package.json
│   │
│   └── client/               # Application Electron Client
│       ├── public/
│       │   ├── pages/        # Pages HTML
│       │   ├── components/   # Composants HTML
│       │   ├── assets/       # CSS, JS
│       │   └── index.html    # Page principale
│       ├── config/           # Configuration serveur
│       ├── main.js           # Entry point Electron
│       ├── preload.js        # Preload Electron
│       └── package.json
│
├── data/                     # Base de données SQLite (gitignored)
├── Jarvis/                   # Standards AI + patterns
├── .env                      # Variables d'environnement
├── package.json              # Root + workspaces
├── tsconfig.json             # TypeScript root
└── README.md                 # Cette documentation
```

## 🔧 Configuration

Voir `.env.example` pour toutes les variables disponibles.

Variables principales:
- `PORT`: Port du serveur (défaut: 8060)
- `DATABASE_PATH`: Chemin de la base SQLite
- `JWT_SECRET`: Secret pour JWT ⚠️ **CHANGER EN PRODUCTION**
- `DB_POOL_SIZE`: Taille du pool de connexions (défaut: 5)

## 🧪 Tests

```bash
# Lancer tous les tests
npm test

# Tests avec coverage
npm test -- --coverage
```

## 🔍 Qualité du code

```bash
# TypeScript compilation
npm run type-check

# Linting
npm run lint

# Formatting
npm run format
```

## 📜 Historique

Voir [CHANGELOG](./CHANGELOG-V2.md) pour les détails des versions.

## 🤝 Contribution

Voir [Jarvis/Instructions.mdc](./Jarvis/Instructions.mdc) pour les standards du projet.

## 📄 Licence

MIT

## ✨ Avantages de cette architecture

### Séparation des préoccupations
- **Serveur**: Gestion des données, logique métier, monitoring
- **Client**: Interface utilisateur, expérience utilisateur

### Déploiement flexible
- Serveur déployé sur une machine/VM dédiée
- Clients déployés sur différentes machines
- Scalabilité: Plusieurs clients se connectent au même serveur

### Sécurité
- Backend isolé dans l'application serveur
- Authentification JWT pour chaque client
- Base de données non accessible directement

### Maintenance
- Mise à jour du serveur sans toucher aux clients
- Mise à jour des clients sans redémarrer le serveur
- Monitoring centralisé sur le dashboard serveur
