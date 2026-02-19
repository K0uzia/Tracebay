# Workspace v2.0

Application Electron client pour la gestion de workspace. Se connecte à un serveur backend déployé séparément (sur Proxmox).

## 🎯 Architecture

- **Monorepo** avec npm workspaces
- **Client (Electron)**: Application Electron avec interface utilisateur Vanilla JS + Web Components
- **Communication**: HTTP REST API + WebSocket temps réel via module API centralisé
- **Déploiement**: Client déployé localement, serveur sur Proxmox (192.168.1.62:4000)

### Vue d'ensemble

```
┌─────────────────────────────┐         HTTP/WS         ┌─────────────────────────────┐
│  apps/client (Electron)     │  ◄──────────────────►   │  Serveur Backend            │
│                             │                          │  (Proxmox - 192.168.1.62)  │
│  ┌───────────────────────┐  │                          │                             │
│  │  Interface            │  │                          │  ┌───────────────────────┐  │
│  │  Utilisateur          │  │                          │  │  API REST + WebSocket │  │
│  └───────────────────────┘  │                          │  └───────────────────────┘  │
│                             │                          │                             │
│  ┌───────────────────────┐  │    REST API (4000)       │                             │
│  │  Module API           │──┼──────────────────────────┼─►                           │
│  │  (api.js centralisé)  │  │                          │                             │
│  └───────────────────────┘  │                          │                             │
│                             │                          │                             │
└─────────────────────────────┘                          └─────────────────────────────┘
      Machine Cliente                                           Serveur Proxmox
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
# Démarrer l'application client Electron
npm run dev

# Ou directement:
npm start --workspace=apps/client
```

### Mode production

```bash
# Build de l'application client
npm run build

# Démarrer
npm start
```

## 📁 Structure du projet

```
workspace/
├── apps/
│   └── client/               # Application Electron Client
│       ├── public/
│       │   ├── pages/        # Pages HTML
│       │   ├── components/   # Composants HTML
│       │   ├── assets/       # CSS, JS
│       │   │   └── js/
│       │   │       ├── config/
│       │   │       │   └── api.js  # Module API centralisé
│       │   │       └── modules/    # Modules fonctionnels
│       │   └── index.html    # Page principale
│       ├── config/
│       │   └── connection.json  # Configuration serveur centralisée
│       ├── main.js           # Entry point Electron
│       ├── preload.js        # Preload Electron
│       └── package.json
│
├── Jarvis/                   # Standards AI + patterns
├── package.json              # Root + workspaces
└── README.md                 # Cette documentation
```

## 🔧 Configuration

La configuration du serveur est centralisée dans `apps/client/config/connection.json`.

### Configuration de connexion

Modifier le fichier `apps/client/config/connection.json` pour changer l'environnement :

```json
{
  "mode": "proxmox",  // "local", "proxmox", ou "production"
  "environments": {
    "proxmox": {
      "url": "http://192.168.1.62:4000",
      "ws": "ws://192.168.1.62:4000"
    }
  }
}
```

Tous les endpoints API sont également définis dans ce fichier.

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

### Architecture simplifiée
- **API centralisée**: Un seul module `api.js` pour toutes les requêtes HTTP
- **Configuration unique**: Un seul fichier `connection.json` pour toute la config
- **Code modulaire**: Modules ES6 bien organisés

### Déploiement flexible
- Client déployé localement sur chaque machine
- Serveur déployé sur Proxmox (192.168.1.62:4000)
- Configuration facile via `connection.json`

### Sécurité
- Content Security Policy (CSP) configurée
- Authentification JWT pour chaque client
- Module API centralisé avec authentification automatique

### Maintenance
- Configuration centralisée facile à modifier
- Code simplifié et modulaire
- Migration progressive vers le module API centralisé
