# Guide de démarrage - Workspace v2.0

## 📋 Prérequis

- Node.js 18+ LTS
- npm 8+
- Git

## 🚀 Installation

### 1. Cloner le projet

```bash
git clone <repo-url>
cd workspace
```

### 2. Installer les dépendances

```bash
# Installe toutes les dépendances (root + workspaces)
npm install
```

### 3. Configuration

```bash
# Copier le fichier d'exemple
cp .env.example .env

# Éditer .env selon vos besoins
# IMPORTANT: Changer JWT_SECRET en production
nano .env
```

### 4. Vérifier l'installation

```bash
# Vérifier TypeScript
npm run type-check

# Vérifier le linting
npm run lint
```

## 🏃 Démarrage

### Mode développement

```bash
# Démarrer les deux applications Electron en parallèle
npm run dev
```

Ou séparément:

```bash
# Terminal 1 - Application Electron Serveur (Backend + Dashboard)
npm run dev:server

# Terminal 2 - Application Electron Client (Interface utilisateur)
npm run dev:client
```

**Architecture**:
- L'application serveur Electron démarre automatiquement le backend Fastify (port 8060)
- Le dashboard de monitoring s'affiche dans une fenêtre Electron
- L'application client Electron se connecte au serveur via HTTP/WebSocket

### Mode production

```bash
# Build du backend
npm run build

# Démarrer
npm start
```

## 🧪 Tests

```bash
# Lancer tous les tests
npm test

# Tests avec coverage
npm test -- --coverage

# Tests en watch mode
npm test -- --watch
```

## 🔍 Vérifications qualité

```bash
# TypeScript compilation
npm run type-check

# Linting
npm run lint

# Formatage automatique
npm run format
```

## 📁 Structure des workspaces

Le projet utilise npm workspaces:

```json
{
  "workspaces": [
    "apps/server",
    "apps/client"
  ]
}
```

### Commandes workspace

```bash
# Installer une dépendance dans un workspace
npm install <package> --workspace=apps/server

# Lancer un script dans un workspace
npm run dev --workspace=apps/server

# Lancer un script dans tous les workspaces
npm run test --workspaces
```

## 🔧 Configuration TypeScript

Le projet utilise TypeScript strict mode:

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true
  }
}
```

## 🗄️ Base de données

### Initialisation

La base de données SQLite est initialisée automatiquement au premier démarrage.

Fichier: `data/database.sqlite`

### Schéma

Le schéma est appliqué depuis `apps/server/src/db/schema.sql`

Tables:
- `users` - Utilisateurs
- `events` - Événements agenda
- `messages` - Messages chat

### Connection Pool

Le projet utilise un pool de 5 connexions SQLite pour éviter les locks:

```typescript
const pool = await initializePool();
const result = await pool.execute(async (conn) => {
  return conn.all('SELECT * FROM users');
});
```

## 🔐 Sécurité

### JWT

- Secret configurable via `JWT_SECRET`
- Expiration: 7 jours (configurable via `JWT_EXPIRY`)
- Stockage: localStorage (client), memory (serveur)

### Mots de passe

- Hashing: bcrypt
- Rounds: 12 (configurable via `BCRYPT_ROUNDS`)

### Headers

- Helmet activé
- CORS configuré
- CSP strict

## 🎨 Frontend

### Composants

Les composants sont chargés dynamiquement:

```javascript
await loadComponent('#header', 'components/header.html');
```

### API Client

Client centralisé avec gestion du JWT:

```javascript
// Login
const response = await window.api.post('/api/auth/login', {
  username: 'user',
  password: 'pass'
});

// Requête authentifiée
const data = await window.api.get('/api/events');
```

## 📝 Standards de code

### Backend TypeScript

- Classes: `PascalCase` (User, EventModel)
- Functions: `camelCase` (getUser, createEvent)
- Constants: `UPPER_SNAKE_CASE` (MAX_LENGTH)
- Fichiers: `PascalCase.ts` (User.ts, EventModel.ts)

### Frontend JavaScript

- Classes: `PascalCase` (ApiClient)
- Functions: `camelCase` (loadComponent)
- Fichiers: `camelCase.js` (global.js, apiClient.js)

### CSS

- Classes: `kebab-case` (.main-header)
- Variables: `kebab-case` (--color-primary)

## 🐛 Debugging

### Backend

Le serveur utilise un logger personnalisé:

```typescript
import logger from './config/logger.js';

logger.info('Message info');
logger.error('Erreur', { error: err });
```

### Frontend

Ouvrir DevTools Electron:
- Mode dev: DevTools ouverts automatiquement
- Ou: View → Toggle Developer Tools

## 📚 Documentation

- [Architecture](docs/architecture/ARCHITECTURE.md)
- [API](docs/api/API.md)
- [Standards](Jarvis/Instructions.mdc)

## ❓ Problèmes courants

### Port déjà utilisé

```bash
# Changer le port dans .env
PORT=8061
```

### Base de données locked

Le connection pooling devrait éviter ce problème. Si ça persiste:

```bash
# Augmenter la taille du pool dans .env
DB_POOL_SIZE=10
```

### Tests échouent

```bash
# Nettoyer et réinstaller
rm -rf node_modules package-lock.json
npm install
```

## 🆘 Support

Voir la documentation dans `docs/` ou consulter `Jarvis/Instructions.mdc` pour les standards.
