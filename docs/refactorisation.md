Tu es un expert en architecture Electron et refactorisation de projets.

CONTEXTE DU PROJET ACTUEL:
- Localisation: /home/goupil/Développement/workspace
- Entry points actuels: main.js, preload.js, server.js
- Frontend: /public/app.js (HTML/CSS/JS)
- Backend: server.js, routes/, models/, database.js
- Config: forge.config.js (Electron Forge)
- Scripts: Makefile, setup-local.sh, scripts/
- Logs: logger.js, chat-logger.js
- DB: database.js (SQLite)

OBJECTIF PRINCIPAL:
Refactoriser en DEUX applications Electron indépendantes mais communicantes.

ARCHITECTURE CIBLE:

1. **APP CLIENT** (/apps/client/):
   ├── main.js (minimal, pas de serveur)
   ├── preload.js (IPC client)
   ├── public/
   │   ├── index.html (répertoire actuel)
   │   ├── styles.css (préservés)
   │   └── app.js (logique UI uniquement)
   └── package.json (dépendances client)

2. **APP SERVEUR** (/apps/server/):
   ├── main.js (gestion serveurs + IPC)
   ├── preload.js (IPC serveur)
   ├── server.js (Express/WebSocket)
   ├── routes/
   │   ├── agenda.js
   │   ├── auth.js
   │   └── shortcuts.js
   ├── models/events.js
   ├── database.js (SQLite - à la racine /apps/server ou /data)
   ├── logger.js (logs serveur)
   ├── public/ (UI monitoring serveur - NOUVEAU)
   │   ├── index.html (dashboard)
   │   ├── styles.css
   │   └── dashboard.js
   └── package.json (dépendances serveur)

STRUCTURE RACINE:
/home/goupil/Développement/workspace/
├── apps/
│   ├── client/
│   ├── server/
├── rules/ (RÉFÉRENCE - ne pas modifier)
├── docs/ (documentation)
├── scripts/ (setup, build, utilities)
├── Makefile (commandes dev unifiées)
├── setup-local.sh (initialisation)
├── package.json (root - workspaces)
└── .gitignore (sqlite.db INCLUS pour server)

CONTRAINTES CRITIQUES:
1. ✅ Respecter rules/ comme référence absolue
2. ✅ Chemins relatifs VÉRIFIÉS (IPC, imports, assets)
3. ✅ SQLite VISIBLE dans git (pas ignoré)
4. ✅ Makefile: cibles separées (make client, make server, make all)
5. ✅ setup-local.sh: install deps + init DB séparément
6. ✅ Logs terminal: ZÉRO ERREUR à démarrage
7. ✅ DevTools: console propre (client ET server)
8. ✅ Validation: UI visible, assets chargés, IPC fonctionnel

MIGRATION PAR PHASE:

**Phase 1: Préparation**
- Copier workspace → apps/client/ (structure actuelle)
- Copier workspace → apps/server/ (structure + server.js, routes/, models/)
- Créer package.json root avec workspaces

**Phase 2: Client**
- Supprimer server.js, routes/, models/, database.js de client/
- Adapter main.js: IPC → connection au serveur
- Adapter app.js: appels API → messages IPC

**Phase 3: Serveur**
- main.js: lancer server.js + IPC listeners
- server.js: Express/WebSocket sur port (configurable)
- logger.js: logs centralisés
- Créer public/dashboard.js (UI monitoring)

**Phase 4: Intégration**
- Makefile: commandes dev (client, server, all)
- setup-local.sh: init double avec dossiers séparés
- .gitignore: database INCLUS pour serveur
- Tester IPC: client ↔ serveur

**Phase 5: Validation**
- ✅ Chaque app démarre sans erreur
- ✅ Chemins corrects (assets, imports)
- ✅ IPC fonctionne (test simple)
- ✅ Logs console propres (DevTools)
- ✅ DB SQLite accessible depuis serveur

LIVRABLES:
1. Documentation d'architecture (Markdown)
2. Guide pas-à-pas de migration
3. Structure de dossiers avec descriptions
4. Makefile complet (dev, build, clean)
5. setup-local.sh adapté
6. Checklist de validation (10+ points)

Format: Markdown détaillé, code blocks avec filepath, étapes numérotées, validations explicites.