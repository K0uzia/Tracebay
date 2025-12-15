# 🚀 Guide Complet de Refactorisation - Workspace v2.0

**Document de référence pour transformer l'application monolithique en architecture client-serveur distribuée.**

## 📌 Respect Intégral des Règles du Projet
Toutes les modifications respectent le dossier `rules/`:
- ✅ `manifest.mdc` - Architecture, sécurité, modularité
- ✅ `naming-convention.mdc` - Nommage CSS/JS explicite
- ✅ `chat-security.mdc` - Sécurité du chat
- ✅ `security.mdc` - CSP stricte, validation, sanitization
- ✅ `design.mdc` - SOLID principles, patterns, tests
- ✅ `testing.mdc` - Tests unitaires et intégration
- ✅ `refactoring.mdc` - Code lisible, maintenable

---

## 📋 État Actuel du Projet

| Élément | Location | Rôle |
|---------|----------|------|
| **Localisation** | `/home/goupil/Développement/workspace` | Répertoire racine |
| **Entry points** | `main.js`, `preload.js`, `server.js` | Lancement Electron + serveur |
| **Frontend** | `/public/app.js` | Interface utilisateur (HTML/CSS/JS) |
| **Backend** | `server.js`, `routes/`, `models/`, `database.js` | Logique métier, API, DB |
| **Configuration** | `forge.config.js` | Config Electron Forge |
| **Scripts** | `Makefile`, `setup-local.sh` | Automatisation dev |
| **Logs** | `logger.js`, `chat-logger.js` | Gestion logs applicatif |
| **Database** | `database.js` (SQLite) | Données persistantes |

---

## 🎯 Objectif Principal

**Refactoriser en DEUX applications Electron indépendantes mais communicantes via HTTP/WebSocket.**

### Pourquoi ?
- **Serveur autonome** : peut tourner seul (mode headless, déploiement distant)
- **Client léger** : ne contient aucune donnée, tout passe par le serveur
- **Scalabilité** : plusieurs clients peuvent se connecter au même serveur
- **Séparation des responsabilités** : backend ≠ frontend (SOLID principles)
- **Sécurité centralisée** : données sensibles restent sur le serveur

### Modèle : Client-Serveur Distribué
```
┌─────────────────┐         HTTP/WebSocket         ┌─────────────────┐
│     CLIENT      │◄────────────────────────────►│     SERVEUR     │
│   (UI seulement)│                              │ (Données + API) │
└─────────────────┘                              └─────────────────┘
   localhost:3000                                   localhost:8060
```

---

## 🏗️ Architecture Cible

### 1️⃣ APP CLIENT (`/apps/client/`) - Interface Utilisateur
   ├── main.js (minimal - lancement Electron + connexion serveur)
   ├── preload.js (API IPC exposée au renderer)
   ├── public/
   │   ├── index.html (interface utilisateur)
   │   ├── assets/
   │   │   ├── css/ (toute la structure actuelle)
   │   │   │   ├── components/
   │   │   │   │   ├── auth-modal.css
   │   │   │   │   ├── footer.css
   │   │   │   │   └── header.css
   │   │   │   ├── default/
   │   │   │   │   ├── normalize.css
   │   │   │   │   ├── section.css
   │   │   │   │   └── variables.css
   │   │   │   └── modules/ (tous les css)
   │   │   ├── js/ (toute la structure actuelle)
   │   │   ├── components/ (tous les fichiers)
   │   │   ├── pages/ (tous les fichiers)
   │   │   └── src/ (tous les fichiers)
   │   └── app.js (logique UI uniquement - appels HTTP/WS au serveur)
   ├── forge.config.js (config Electron pour client)
   └── package.json (dépendances client - Electron, etc.)

### 2️⃣ APP SERVEUR (`/apps/server/`) - Logique Métier + Dashboard
   ├── main.js (lancement Electron + démarrage serveur Express)
   ├── preload.js (API IPC exposée au renderer)
   ├── public/ (interface de monitoring identique au client)
   │   ├── index.html (dashboard serveur - même structure que client)
   │   ├── app.js (PageManager pour charger les pages du dashboard)
   │   └── assets/
   │   │   ├── css/
   │   │   │   ├── global.css (styles globaux dashboard)
   │   │   │   ├── components/
   │   │   │   │   ├── dashboard-header.css
   │   │   │   │   ├── terminal.css
   │   │   │   │   ├── logs-panel.css
   │   │   │   │   └── stats.css
   │   │   │   ├── default/
   │   │   │   │   ├── normalize.css
   │   │   │   │   ├── section.css
   │   │   │   │   └── variables.css
   │   │   │   └── modules/
   │   │   │       ├── connections.css (clients connectés)
   │   │   │       ├── messages.css (flux messages)
   │   │   │       ├── database.css (état DB)
   │   │   │       ├── performance.css (statistiques)
   │   │   │       └── terminal.css (terminal/commandes)
   │   │   └── js/
   │   │       ├── global.js
   │   │       ├── config/
   │   │       └── modules/
   │   │           ├── dashboard/
   │   │           │   ├── DashboardController.js
   │   │           │   ├── DashboardStore.js
   │   │           │   ├── ServerMonitor.js (WebSocket)
   │   │           │   └── TerminalManager.js
   │   │           ├── logs/
   │   │           │   └── LogsRenderer.js
   │   │           ├── stats/
   │   │           │   └── StatsRenderer.js
   │   │           └── terminal/
   │   │               └── CommandExecutor.js
   │   └── components/ (réutilisables)
   │       ├── dashboard-header.html
   │       ├── terminal-panel.html
   │       ├── logs-panel.html
   │       ├── stats-panel.html
   │       └── clients-panel.html
   ├── pages/ (pages du dashboard)
   │   ├── monitoring.html (affichage temps réel)
   │   ├── logs.html (historique logs)
   │   ├── terminal.html (interface commandes)
   │   └── settings.html (configuration serveur)
   ├── src/ (assets statiques)
   │   ├── icons/
   │   └── img/
   │
   ├── server.js (Express + WebSocket sur port configurable)
   ├── routes/
   │   ├── agenda.js
   │   ├── auth.js
   │   ├── shortcuts.js
   │   └── monitoring.js (nouveaux endpoints pour dashboard)
   ├── models/events.js
   ├── database.js (SQLite - source de vérité unique)
   ├── logger.js (logs centralisés)
   ├── chat-logger.js (logs messages chat du client)
   ├── updates.js (endpoint HTTP pour mises à jour client)
   ├── ServerMonitor.js (gestion des événements pour dashboard)
   │
   ├── .env (variables d'environnement - non commité)
   │   ├── PORT=8060
   │   ├── JWT_SECRET=...
   │   └── NODE_ENV=production
   ├── data/database.sqlite (DB SQLite)
   ├── forge.config.js (config Electron pour serveur)
   └── package.json (dépendances serveur)

### 📁 Structure Racine Finale
/home/goupil/Développement/workspace/
├── apps/
│   ├── client/
│   │   ├── main.js
│   │   ├── preload.js
│   │   ├── public/
│   │   ├── forge.config.js
│   │   └── package.json
│   └── server/
│       ├── main.js
│       ├── preload.js
│       ├── server.js
│       ├── routes/
│       ├── models/
│       ├── database.js
│       ├── logger.js
│       ├── chat-logger.js
│       ├── updates.js
│       ├── public/
│       ├── data/ (database.sqlite)
│       ├── .env (non commité sauf template)
│       ├── forge.config.js
│       └── package.json
├── rules/ (RÉFÉRENCE - ne pas modifier)
├── docs/ (documentation)
├── scripts/ (setup, build, utilities)
├── Makefile (commandes dev unifiées)
├── setup-local.sh (initialisation)
├── package.json (root - workspaces npm)
└── .gitignore (apps/*/node_modules, apps/*/dist, .env)

---

## ✅ Contraintes Critiques (15 règles non-négociables)

### 1️⃣ Sécurité (manifest.mdc §1 + security.mdc)
- **CSP stricte** : Pas de `style="..."`, pas de `onclick="..."`, pas de `<script>` inline
   - Utiliser classes CSS (fichiers `.css` externes)
   - Utiliser `addEventListener()` (fichiers `.js` externes)
- **Validation stricte** : Toutes les entrées utilisateur validées
- **Sanitization** : Tous les logs/messages échappés en HTML (pas `innerHTML`)
- **Pas de secrets en dur** : Utiliser `.env` (JWT_SECRET, DB_PATH, etc.)
- **Authentification JWT** : Tokens sécurisés, stockés localStorage
- **Logging sécurisé** : Jamais exposer tokens/passwords dans les logs

### 2️⃣ Architecture Modulaire (design.mdc) 
  - **SOLID principles** : Responsabilité unique, ouvert à l'extension
- **Design patterns** : Observer (événements), Factory (multi-instances), Strategy
- **Séparation claire** : Backend (server.js) ≠ Frontend (public/)
- **Modules réutilisables** : AuthManager, ChatSecurityManager, ServerMonitor
- **Chemins relatifs** : Chaque app indépendante, imports/assets locaux

### 3️⃣ Nommage Explicite (naming-convention.mdc)
- **CSS** : `section`, `section-title`, `section-contain`, `grid`, `grid-item`, `block`, `block-title`, `block-content`, `action-block`
- **JavaScript Classes** : `PascalCase` (AuthManager, ServerMonitor, ChatSecurityManager)
- **JavaScript Methods/Properties** : `camelCase` (getCurrentUser, processMessage)
- **Fichiers** : Module + responsabilité claire (AuthManager.js, DashboardPageManager.js)
- **À éviter** : contain-1, capsule-info, section-time (utiliser les conventions universelles)

### 4️⃣ Tests Obligatoires (testing.mdc)
- ✅ Communication **HTTP/WebSocket** entre client et serveur
- ✅ **Deux `forge.config.js` séparés** (client et serveur)
- ✅ **Serveur indépendant** (zéro dépendance client, mode standalone)
- ✅ **Client sans données locales** (tout via HTTP/WS au serveur)
- ✅ **Database.js côté serveur** (source de vérité unique)
- ✅ **Chat-logger.js & updates.js côté serveur**
- ✅ **`.env` serveur uniquement** (JWT_SECRET, NODE_ENV, DATABASE_PATH)
- ✅ **Logs terminal : ZÉRO ERREUR** au démarrage (console propre)
- ✅ **DevTools propre** (client ET server séparés, pas de pollution)
- ✅ **Performance optimale** (dépendances minimales, tree-shaking, lazy loading)

---

## 🔄 Plan de Migration (5 Phases)

### Phase 1: Préparation & Structure
**Objectif** : Créer la structure de dossiers et copier les fichiers existants

**Tâches** :
1. Créer `/apps/client/` et `/apps/server/` (dossiers vides)
2. Copier le frontend :
   - Client : `/public/` entièrement (html, css, js, assets, components, pages, src)
3. Copier le backend :
   - Server : `server.js`, `routes/`, `models/`, `database.js`, `logger.js`, `chat-logger.js`, `updates.js`
4. Créer `forge.config.js` dans chaque app (configurations séparées)
5. Créer `package.json` dans chaque app (dépendances séparées)
6. Créer `package.json` root avec workspaces npm

---

### Phase 2: Adapter Client
**Objectif** : Supprimer backend, adapter main.js et app.js pour HTTP/WebSocket

**Tâches** :
1. **Supprimer du client** : `server.js`, `routes/`, `models/`, `database.js`, `logger.js`, `chat-logger.js`, `updates.js`

2. **Adapter `main.js`** :
   - Supprimer démarrage serveur local
   - Ajouter connexion HTTP/WS au serveur (localhost:8060)
   - Garder IPC pour communication main ↔ renderer
   - Respecter CSP : pas de scripts inline

3. **Adapter `app.js`** :
   - Remplacer appels API locaux par requêtes HTTP/WS
   - Format : `http://localhost:8060/api/agenda`, `ws://localhost:8060/chat`
   - Utiliser naming-convention.mdc pour CSS (block, grid, etc.)
   - Valider/sanitizer toutes les entrées avant affichage
   - Ajouter aria-labels et alt text (accessibilité)

4. **Modules client sécurisés** :
   - `AuthManager.js` : Validation tokens JWT, gestion session
   - `ChatSecurityManager.js` : Filtrer URLs, bloquer domaines dangereux, prévenir XSS
   - `ChatWidgetManager.js` : WebSocket sécurisé (validation messages)

5. **Tests unitaires** :
   - `AuthManager.test.js` : tokens valides/expirés/invalides
   - `ChatSecurityManager.test.js` : XSS, domaines bloqués, protocoles

**Validation** : Assets chargés ✓ | UI visible ✓ | Console propre ✓ | CSP respectée ✓

---

### Phase 3: Adapter Serveur
**Objectif** : Créer dashboard monitoring identique au client, adapter backend

**Tâches** :
1. **Structure `/apps/server/public/`** (identique au client) :
   - `app.js` avec `DashboardPageManager` (similaire à `PageManager`)
   - `assets/css/` : global.css + modules (logs, terminal, connections, stats)
   - `assets/js/modules/` : controllers de monitoring (DashboardController, ServerMonitor)
   - `components/` : dashboard-header.html, terminal-panel.html, logs-panel.html, stats-panel.html
   - `pages/` : monitoring.html, logs.html, terminal.html, settings.html
   - `src/` : icons/, img/ (assets statiques)

2. **Utiliser naming-convention.mdc** : section, block, grid, action-block

3. **Adapter `index.html` du serveur** : Même structure que client, CSP stricte

4. **`app.js` du serveur** :
   - `DashboardPageManager` : charge pages du dashboard
   - `ServerMonitor` : WebSocket → événements serveur temps réel
   - `TerminalManager` : exécuter commandes serveur (whitelist stricte)
   - `LogsRenderer` : afficher logs app + chat + erreurs
   - Sanitization : tous les logs échappés avant affichage (prévenir XSS)

5. **`server.js` sécurisé** :
   - Express servant le dashboard (`/`)
   - Routes API existantes (`/api/agenda`, `/api/auth`, `/api/shortcuts`)
   - Route monitoring : `/api/monitoring` (WebSocket, auth requise)
   - Route terminal : `/api/terminal/execute` (POST, validation stricte)
   - CORS configuré : seulement localhost en dev
   - Helmet pour durcir headers HTTP

6. **Modules de monitoring** :
   - `ServerMonitor.js` : émettre événements (logs, connexions, messages, stats)
   - `TerminalManager.js` : exécuter commandes sécurisées (whitelist)
   - `LogsRenderer.js` : formater logs + échapper HTML
   - `StatsCollector.js` : mémoire, uptime, connexions (observer pattern)

7. **Tests unitaires** :
   - `ServerMonitor.test.js` : émission événements, reconnexions
   - `TerminalManager.test.js` : blocage commandes non-autorisées
   - `LogsRenderer.test.js` : échappement HTML, format logs

**Validation** : Dashboard démarre ✓ | WebSocket fonctionne ✓ | Logs visibles ✓ | CSP respectée ✓

---

### Phase 4: Intégration & Scripts
**Objectif** : Créer scripts d'automatisation et configuration finale

**Tâches** :
1. **Makefile (racine)** :
   ```makefile
   make client    # Démarrer l'app client
   make server    # Démarrer l'app serveur
   make all       # Démarrer client + serveur en parallèle
   make build     # Builder les deux apps
   make test      # Exécuter tous les tests
   make lint      # ESLint + JSDoc check
   make clean     # Nettoyer dist, node_modules
   ```

2. **setup-local.sh** :
   - Installer dépendances : `npm install` dans `/apps/client` et `/apps/server`
   - Initialiser DB serveur si nécessaire
   - Vérifier variables d'environnement (.env.example → .env)
   - Validation : chemins corrects, permissions

3. **.env.example → .env (serveur seulement)** :
   ```
   PORT=8060
   JWT_SECRET=<généré_automatiquement>
   NODE_ENV=development
   DATABASE_PATH=./data/database.sqlite
   ```

4. **.gitignore** :
   ```
   /apps/*/node_modules
   /apps/*/dist
   /apps/server/.env (non commité)
   /apps/server/data/database.sqlite (optionnel)
   ```

5. **ESLint config (root + chaque app)** :
   - Règles strictes : no-eval, no-inline-scripts, prefer-const
   - Pas de code mort, warnings en erreurs
   - JSDoc pour fonctions critiques

**Validation** : All scripts work ✓ | Paths correct ✓ | .env secure ✓

---

### Phase 5: Tests & Validation
**Objectif** : Tester tout et valider chaque contrainte

**Tests Unitaires (Obligatoires)** :
- [ ] `AuthManager.test.js` : tokens valides/expirés/invalides
- [ ] `ChatSecurityManager.test.js` : XSS, domaines bloqués, protocoles
- [ ] `ServerMonitor.test.js` : événements, reconnexions, buffering
- [ ] `TerminalManager.test.js` : commandes autorisées/bloquées
- [ ] `LogsRenderer.test.js` : échappement HTML, format logs

**Tests d'Intégration** :
- [ ] Client se connecte au serveur (HTTP request + réponse)
- [ ] WebSocket fonctionne (send/receive message)
- [ ] Authentification : login → token stocké → requête authentifiée
- [ ] Chat : message envoyé → logger reçoit → dashboard affiche

**Validation Manuelle** :
- [ ] Client démarre sans erreur (console vide)
- [ ] Serveur démarre sans erreur (mode standalone)
- [ ] Client se connecte au serveur (Network tab: WebSocket 101)
- [ ] Requête HTTP basique : GET /api/agenda → réponse JSON
- [ ] WebSocket : send message → server logs → client reçoit ACK
- [ ] Database accessible depuis serveur (SELECT count(*) users)
- [ ] Chat-logger enregistre messages (voir /api/monitoring)
- [ ] Dashboard visible, tous les modules chargés, logs temps réel
- [ ] Logs console propres (0 erreurs CORS, 404, XSS, etc.)
- [ ] Assets du client chargés correctement (CSS, JS, images)
- [ ] **CSP stricte respectée** (Network tab: no violations)
- [ ] **Nommage CSS** : section, block, grid, action-block utilisés partout
- [ ] **Formatage code** : ESLint 0 erreurs + JSDoc commenté

**Documentation Finale** :
- [ ] `README.md` : guide démarrage rapide
- [ ] `ARCHITECTURE.md` : diagramme + flux communication
- [ ] `API.md` : endpoints client + monitoring
- [ ] `SECURITY.md` : stratégie sécurité (CSP, validation, sanitization)

---

## 📦 Livrables Finaux

1. ✅ Documentation d'architecture (client-serveur distribué)
2. ✅ Guide migration (5 phases détaillées)
3. ✅ Structure dossiers avec descriptions
4. ✅ Makefile complet (client, server, all, test, lint, build)
5. ✅ setup-local.sh automatisé
6. ✅ Checklist validation (20+ points)
7. ✅ Tests unitaires et intégration
8. ✅ Documentation sécurité (CSP, sanitization, authentification)
9. ✅ ESLint config (zéro violation)
10. ✅ Respect intégral des rules/

---

## 🔌 Flux de Communication

```
╔════════════════════════════════════════════════════════════════════════════╗
║                          ARCHITECTURE CLIENT-SERVEUR                       ║
╚════════════════════════════════════════════════════════════════════════════╝

┌─────────────────────────────────┐         ┌──────────────────────────────────┐
│   CLIENT (Electron App)         │         │   SERVEUR (Electron App)         │
├─────────────────────────────────┤         ├──────────────────────────────────┤
│                                 │         │                                  │
│  index.html                     │         │  index.html (Dashboard)          │
│  ├─ app.js (PageManager)        │         │  ├─ app.js (DashboardPageManager)│
│  ├─ components/                 │         │  ├─ components/                  │
│  └─ assets/                     │         │  └─ assets/                      │
│      ├─ css/ (UI utilisateur)   │         │      ├─ css/ (Dashboard UI)      │
│      └─ js/ (Logique métier)    │         │      └─ js/ (Monitoring/Logs)   │
│                                 │         │                                  │
│  localStorage: token JWT        │         │  public/ ← dashboard visuel      │
│                                 │         │  database.sqlite ← source vérité │
│  Aucune donnée persistante      │         │  logs/ (app + chat)              │
│                                 │         │                                  │
└──────────────┬──────────────────┘         └────────────────┬─────────────────┘
               │                                             │
               │         HTTP Requests                      │
               ├──────────────────────────────────────────>│ /api/agenda
               │  POST /api/agenda                         │ /api/auth
               │  GET /api/shortcuts                       │ /api/shortcuts
               │  POST /api/auth/login                     │
               │                                            │
               │ <─────────────────────────────────────────┤
               │         JSON Response                      │
               │ {data: [...], status: ok}                 │
               │                                            │
               │                                            ▼
               │                                    Express Server
               │                                    ├─ routes/
               │                                    ├─ database.js
               │                                    ├─ models/
               │                                    └─ logger.js
               │
               │    WebSocket (Chat)                  ▲
               ├──────────────────────────────────>│
               │ {type: "message", text: "..."}     │ Emmet vers Dashboard
               │                                    │ ServerMonitor
               │ <─────────────────────────────────┤
               │ {type: "message_received"}         │
               │                                    ▼
               │                         Dashboard (WebSocket)
               │                         ├─ Logs: "Message envoyé"
               │                         ├─ Terminal: affiche commandes
               │                         ├─ Stats: +1 message
               │                         └─ Connections: Client X actif
               │
               ▼
            IPC (Electron - optionnel)
            Gestion fenêtres Electron

===== DONNÉES RÉSIDUELLES =====
CLIENT: localStorage = {token: "jwt_xxx", username: "Alice"}
SERVEUR: database.sqlite = {users[], messages[], agendas[], etc...}
```

---

## 🎯 Principes Clés de Migration (Règles du Projet)

### 1️⃣ Architecture Modulaire (design.mdc)
- Client: PageManager charge pages (home, agenda, chat, etc.)
- Serveur: DashboardPageManager charge pages monitoring (logs, terminal, stats)
- Séparation claire: backend (server.js) ≠ frontend (public/)
- Modules réutilisables (AuthManager, ChatSecurityManager, ServerMonitor)
- Observer pattern pour événements (ServerMonitor émetteur, Dashboard écouteur)

### 2️⃣ Nommage Explicite (naming-convention.mdc)
- **CSS** : `section`, `section-title`, `section-contain`, `grid`, `grid-item`, `block`, `block-title`, `block-content`, `action-block`
- **JavaScript** : `PascalCase` classes (AuthManager, ServerMonitor), `camelCase` propriétés/méthodes
- **Fichiers** : module + responsabilité claire (AuthManager.js, ChatSecurityManager.js)
- **À éviter** : contain-1, capsule-info, section-time → utiliser conventions universelles

### 3️⃣ Sécurité Stricte (security.mdc)
- **CSP stricte** : ZÉRO styles inline, ZÉRO scripts inline, ZÉRO onclick
- **Validation stricte** : toutes les entrées utilisateur validées
- **Sanitization** : tous les logs/messages échappés en HTML (textContent, pas innerHTML)
- **Secrets** : JWT_SECRET, DB_PATH en .env (jamais en dur)
- **Authentification** : tokens JWT sécurisés, stockés localStorage
- **Logging sécurisé** : jamais exposer tokens/passwords

### 4️⃣ Tests Obligatoires (testing.mdc)
- AuthManager, ChatSecurityManager, ServerMonitor, TerminalManager, LogsRenderer
- Tests d'intégration: HTTP, WebSocket, authentification, chat
- Coverage minimum : 70% composants critiques
- Tests d'erreurs : cas limites, injections, timeouts

### 5️⃣ Performance & Optimisation (manifest.mdc §5)
- Dépendances minimales (pas de jQuery, moment.js si natif suffit)
- Bundling léger avec tree-shaking
- Lazy loading : PageManager charge pages on-demand
- WebSocket sain : reconnexion, buffering, heartbeat
- Caching : localStorage pour tokens, sessionStorage pour temporaire

### 6️⃣ Documentation (manifest.mdc §4)
- JSDoc : chaque classe/fonction critique commentée
- README.md : démarrage rapide, architecture, dépannage
- ARCHITECTURE.md : diagramme communication, patterns utilisés
- SECURITY.md : CSP, validation, sanitization, secrets

---

## ✅ Checklist de Validation - Respect des Règles

### Manifeste (manifest.mdc)
- [ ] Architecture modulaire, testable, évolutive
- [ ] Séparation claire des responsabilités
- [ ] Dépendances minimales (pas de frameworks inutiles)
- [ ] Code auto-explicite (bon nommage, structure claire)
- [ ] Tests unitaires pour composants critiques
- [ ] Sécurité par conception (validation entrées, sanitization, pas de secrets)
- [ ] Logs explicites, pas de verbosité inutile
- [ ] Performance optimale (mémoire, bundling léger)

### Nommage (naming-convention.mdc)
- [ ] CSS: section, section-title, section-contain, grid, grid-item, block, block-title, block-content, action-block
- [ ] JS Classes: PascalCase (AuthManager, ServerMonitor)
- [ ] JS Functions/Properties: camelCase (processMessage, getCurrentUser)
- [ ] Pas de noms numérotés (contain-1 → grid-item)
- [ ] Pas d'anciennes conventions (capsule-info → block)

### Design & Architecture (design.mdc)
- [ ] Principes SOLID appliqués
- [ ] Design patterns (Observer pour événements, Factory si multi-instances)
- [ ] Nommage explicite (classes, fonctions, modules)
- [ ] Gestion centralisée des erreurs
- [ ] Tests unitaires pour chaque composant critique
- [ ] Interface publique claire et cohérente

### Sécurité (security.mdc, chat-security.mdc)
- [ ] CSP stricte: **pas de styles inline** (classes CSS uniquement)
- [ ] CSP stricte: **pas de scripts inline** (fichiers .js externes)
- [ ] CSP stricte: **pas d'onclick="..."** (addEventListener)
- [ ] Validation stricte entrées utilisateur
- [ ] Sanitization HTML (échappement, pas innerHTML)
- [ ] Pas de secrets en dur (utiliser .env)
- [ ] Authentification JWT (tokens sécurisés)
- [ ] Logging sécurisé (pas d'exposition tokens/passwords)
- [ ] ChatSecurityManager: filtrage URLs, domaines bloqués, XSS

### Tests (testing.mdc)
- [ ] AuthManager.test.js: tokens valides/expirés/invalides
- [ ] ChatSecurityManager.test.js: XSS, domaines, protocoles
- [ ] ServerMonitor.test.js: événements, reconnexions
- [ ] TerminalManager.test.js: commandes autorisées/bloquées
- [ ] LogsRenderer.test.js: échappement HTML
- [ ] Tests d'intégration: HTTP, WebSocket, authentification, chat

### Refactoring (refactoring.mdc)
- [ ] Code lisible et maintenable
- [ ] Séparation responsabilités
- [ ] Fonctions simples, pas complexes
- [ ] Optimisation performance
- [ ] Tests mis à jour avec modifications

---

## 📖 Notes d'Utilisation

### Pour les développeurs
1. **Lire d'abord** : Ce guide en entier (30 min)
2. **Parcourir** : Les fichiers rules/ pour comprendre les standards
3. **Suivre** : Les 5 phases dans l'ordre (pas de saut)
4. **Valider** : Chaque phase avant de passer à la suivante
5. **Documenter** : Chaque changement significatif

### Pour les reviewers
1. Vérifier la **checklist de validation** (Phase 5)
2. Tester les **cas limites** (tests d'erreurs)
3. Vérifier la **conformité CSP** (Network tab DevTools)
4. Valider le **nommage CSS/JS** (conventions)
5. Vérifier **zéro secrets** en dur (grep JWT_SECRET, password, etc.)

### Pour la maintenance future
- Consulter `ARCHITECTURE.md` pour comprendre le flux
- Consulter `SECURITY.md` pour les mises à jour sécurité
- Consulter `API.md` pour les nouveaux endpoints
- Utiliser `Makefile` pour automatiser les tâches

---

**Document de référence complet. Réviser annuellement avec les évolutions de rules/**