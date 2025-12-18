# Workspace v2.0

Application de gestion de workspace avec Electron, Fastify et TypeScript.

## 🎯 Architecture

- **Monorepo** avec npm workspaces
- **Serveur (Electron)**: Application Electron avec backend Fastify + TypeScript + SQLite3 + Dashboard monitoring
- **Client (Electron)**: Application Electron avec interface utilisateur Vanilla JS + Web Components
- **Communication**: HTTP REST API + WebSocket temps réel
- **Déploiement**: Deux applications séparées pour déploiement sur machines différentes (via Proxmox)

## 🚀 Démarrage rapide

### Prérequis

- Node.js 18+ LTS
- npm 8+

### Installation

```bash
# Installer toutes les dépendances
npm install

# Créer le fichier .env (copier depuis .env.example)
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

**Note**: Le serveur Electron démarre automatiquement le backend Fastify en interne et affiche un dashboard de monitoring.

### Build

```bash
# Build du backend TypeScript
npm run build

# Démarrer en production
npm start
```

## 📁 Structure du projet

```
workspace/
├── apps/
│   ├── server/               # Application Electron Serveur
│   │   ├── src/              # Backend TypeScript + Fastify
│   │   │   ├── api/          # Routes REST
│   │   │   ├── models/       # Modèles de données
│   │   │   ├── lib/          # Utilitaires
│   │   │   ├── db/           # Couche base de données
│   │   │   ├── config/       # Configuration
│   │   │   ├── middleware/   # Middlewares
│   │   │   └── types/        # Types TypeScript
│   │   ├── public/           # Dashboard Electron
│   │   │   ├── index.html    # Dashboard monitoring
│   │   │   └── assets/       # CSS, JS dashboard
│   │   ├── main.js           # Entry point Electron (démarre backend + dashboard)
│   │   ├── preload.js        # Preload Electron
│   │   └── package.json
│   └── client/               # Application Electron Client
│       ├── public/
│       │   ├── pages/        # Pages HTML
│       │   ├── components/   # Composants
│       │   └── assets/       # CSS, JS, images
│       ├── main.js           # Entry point Electron
│       ├── preload.js        # Preload Electron
│       └── package.json
├── data/                     # Base de données SQLite
├── Jarvis/                   # Standards AI
├── .env                      # Variables d'environnement
└── package.json              # Root package
```

## 🔧 Configuration

Voir `.env.example` pour toutes les variables disponibles.

Variables principales:
- `PORT`: Port du serveur (défaut: 8060)
- `DATABASE_PATH`: Chemin de la base SQLite
- `JWT_SECRET`: Secret pour JWT (CHANGER EN PRODUCTION)
- `DB_POOL_SIZE`: Taille du pool de connexions (défaut: 5)

## 🧪 Tests

```bash
# Lancer les tests
npm test

# Vérification TypeScript
npm run type-check

# Linting
npm run lint

# Formatage
npm run format
```

## 📚 Documentation

- [Architecture](docs/architecture/ARCHITECTURE.md)
- [Guide de développement](docs/guides/DEVELOPMENT.md)
- [API Documentation](docs/api/API.md)
- [Structure du projet](docs/architecture/PROJECT_STRUCTURE.md)

## 🔐 Sécurité

- Authentification JWT
- Mots de passe hashés avec bcrypt (12 rounds minimum)
- CORS configuré
- Helmet pour la sécurité des headers
- Connection pooling pour éviter les locks DB
- Prepared statements uniquement (pas d'injection SQL)

## 🎨 Design System

Basé sur le design system défini dans `Jarvis/Instructions.mdc`:
- Couleurs: Bleu (#3E3B8C), Jaune (#F2BC1B), Orange (#F28241)
- Spacing: Système d'unités basé sur 8px
- Typography: System fonts

## 📦 Tech Stack

**Backend**:
- TypeScript 5.3+ (strict mode)
- Fastify 4.24+
- SQLite3 5.1+ avec connection pooling
- WebSocket (ws 8.18+)
- JWT + bcrypt

**Frontend**:
- Vanilla JS ES6+
- Web Components
- Electron 39+
- HTML5 + CSS3

**Outils**:
- tsx (dev)
- tsc (build)
- Jest (tests)
- ESLint + Prettier

## 🤝 Contribution

1. Suivre les standards définis dans `Jarvis/Instructions.mdc`
2. Utiliser TypeScript strict mode pour le backend
3. Pas de `any` type (sauf cas justifiés)
4. Tests obligatoires (coverage > 80%)
5. ESLint + Prettier avant commit

## 📄 Licence

Voir fichier [LICENSE](LICENSE)
