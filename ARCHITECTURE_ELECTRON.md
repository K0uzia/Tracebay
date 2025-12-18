# 🏗️ Architecture Deux Applications Electron

## Vue d'ensemble

Le projet Workspace v2.0 est composé de **deux applications Electron distinctes** :

### 1️⃣ Application Serveur (apps/server)
- **Type**: Application Electron avec backend intégré
- **Backend**: Fastify + TypeScript + SQLite3 avec connection pooling
- **Dashboard**: Interface de monitoring en temps réel
- **Port**: 8060
- **Déploiement**: Machine serveur (via Proxmox)

### 2️⃣ Application Client (apps/client)
- **Type**: Application Electron pure interface
- **Frontend**: Vanilla JS + Web Components
- **Connexion**: API REST + WebSocket vers le serveur
- **Déploiement**: Machines clientes (via Proxmox)

## 📡 Communication

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

## 🎯 Avantages de cette architecture

### Séparation des préoccupations
- **Serveur**: Gestion des données, logique métier, monitoring
- **Client**: Interface utilisateur, expérience utilisateur

### Déploiement flexible (Proxmox)
- Serveur déployé sur une VM/Container Proxmox dédié
- Clients déployés sur différentes machines/VMs
- Scalabilité: Plusieurs clients peuvent se connecter au même serveur

### Sécurité
- Backend isolé dans l'application serveur
- Authentification JWT pour chaque client
- Base de données non accessible directement par les clients

### Maintenance
- Mise à jour du serveur sans toucher aux clients
- Mise à jour des clients sans redémarrer le serveur
- Monitoring centralisé sur le dashboard serveur

## 🚀 Démarrage

### Développement local

```bash
# Démarrer les deux applications
npm run dev

# Ou séparément:
npm run dev:server  # Application serveur
npm run dev:client  # Application client
```

### Production (Proxmox)

#### Machine Serveur
```bash
cd apps/server
npm install
npm run build        # Compile TypeScript
npm start           # Lance Electron serveur + backend
```

#### Machines Clientes
```bash
cd apps/client
npm install
npm start           # Lance Electron client
```

**Configuration**: Les clients doivent être configurés pour pointer vers l'IP du serveur Proxmox dans `apps/client/public/assets/js/global.js` :

```javascript
const config = {
  apiUrl: 'http://192.168.x.x:8060',  // IP du serveur Proxmox
  wsUrl: 'ws://192.168.x.x:8060',
};
```

## 📦 Build pour distribution

### Serveur
```bash
cd apps/server
npm run build:linux    # Pour Linux (Proxmox)
# ou
npm run build:win      # Pour Windows
npm run build:mac      # Pour macOS
```

Crée un exécutable installable dans `apps/server/out/`

### Client
```bash
cd apps/client
npm run build:linux    # Pour Linux (Proxmox)
# ou
npm run build:win      # Pour Windows
npm run build:mac      # Pour macOS
```

Crée un exécutable installable dans `apps/client/out/`

## 🔧 Configuration

### Serveur (.env)
```bash
NODE_ENV=production
PORT=8060
DATABASE_PATH=./data/database.sqlite
DB_POOL_SIZE=5
JWT_SECRET=votre-secret-production
```

### Client
Configurer l'URL du serveur dans `apps/client/public/assets/js/global.js`

## 🌐 Déploiement Proxmox

### VM Serveur
1. Créer une VM/Container Linux sur Proxmox
2. Installer Node.js 18+
3. Cloner le repo
4. Installer et builder l'application serveur
5. Configurer le firewall pour autoriser le port 8060
6. Lancer l'application serveur

### VMs/Containers Clients
1. Créer des VMs/Containers pour chaque poste client
2. Installer Node.js 18+ (ou distribuer l'exécutable)
3. Installer l'application client
4. Configurer l'URL du serveur
5. Lancer l'application client

## 🔒 Sécurité

- Serveur accessible uniquement sur le réseau interne Proxmox
- Authentification JWT obligatoire
- CORS configuré pour whitelist les IPs clientes
- Helmet pour sécuriser les headers HTTP
- Base de données avec prepared statements

## 📊 Monitoring

Le dashboard serveur affiche en temps réel:
- État du serveur (online/offline)
- Uptime
- Ressources système (CPU, RAM)
- Statistiques base de données (connexions pool)
- Clients connectés
- Logs d'activité
- Actions de contrôle

## 🔄 Mise à jour

### Serveur
1. Arrêter l'application serveur
2. Mettre à jour le code
3. Rebuild: `npm run build`
4. Redémarrer: `npm start`

### Client
1. Distribuer la nouvelle version
2. Les utilisateurs ferment et relancent l'application
3. Ou utiliser electron-updater pour auto-update

## 📝 Notes importantes

- Les deux applications sont **indépendantes** mais **communiquent** via HTTP/WS
- Le serveur **doit être démarré en premier**
- Les clients se connectent automatiquement au démarrage
- En cas de déconnexion, le client tente de se reconnecter automatiquement
- Le dashboard serveur permet de monitorer tous les clients connectés

---

**Architecture créée le**: 18 décembre 2025
**Version**: 2.0.0
**Adaptée pour**: Déploiement Proxmox multi-machines
