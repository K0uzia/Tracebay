# 📦 Workspace - Application Electron de gestion collaborative

[![MIT License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Electron](https://img.shields.io/badge/Electron-39+-blue.svg)](https://www.electronjs.org/)

## 🎯 À propos

**Workspace** est une application Electron pour la gestion collaborative avec :
- 📅 **Agenda** (jour, semaine, mois, année)
- 💬 **Chat** intégré
- 📄 **Gestion de documents**
- 🗄️ **Base de données** SQLite
- 🔐 **Sécurité** renforcée

## 🚀 Démarrage rapide

```bash
# Setup initial (une seule fois)
./setup-local.sh init

# Lancer l'app (API + GUI)
npm run dev
# ou
make dev

# Juste Electron
npm start

# Juste l'API
npm run server
```

## 📁 Structure du projet

```
workspace/
├── public/                      # Front-end
│   ├── assets/

```

## 🛠️ Commandes utiles

```bash
# Setup & Installation
./setup-local.sh init          # Configuration initiale complète
./setup-local.sh info          # État du projet
./setup-local.sh deps          # Installer dépendances système

# Développement
npm run dev                    # Electron + API (recommandé)
npm start                      # Juste Electron
npm run server                 # Juste API

# Commandes Make
make dev                       # Electron + API
make server                    # Juste API
make db.init                   # Initialiser DB
make db.reset                  # Réinitialiser DB
make db.shell                  # Shell SQLite
make db.backup                 # Sauvegarder DB
make help                      # Aide Make
```

## 🗄️ Base de données

**Tables** :
- `events` - Événements
- `users` - Utilisateurs
- `event_shares` - Partages
- `notifications` - Notifications
- `event_recurrences` - Récurrences

```bash
# Accéder à la DB
make db.shell

# Sauvegarder
make db.backup

# Réinitialiser
make db.reset
```

## 🔌 API REST

```bash
GET    /api/agenda/events          # Lister
GET    /api/agenda/events/:id      # Détail
POST   /api/agenda/events          # Créer
PUT    /api/agenda/events/:id      # Modifier
DELETE /api/agenda/events/:id      # Supprimer
GET    /api/agenda/search          # Rechercher
GET    /api/agenda/stats           # Stats
```

Voir [docs/api/API.md](docs/api/API.md) pour plus.

## 📚 Documentation

- **[Setup](docs/setup/SETUP.md)** - Installation
- **[Architecture](docs/architecture/ARCHITECTURE.md)** - Vue d'ensemble
- **[Development](docs/guides/DEVELOPMENT.md)** - Pour contribuer
- **[Agenda](docs/features/AGENDA.md)** - Calendrier
- **[Modals](docs/features/MODALS.md)** - Système de modales
- **[Chat](docs/features/CHAT.md)** - Chat widget

## ✅ État du projet

| Composant | État |
|-----------|------|
| Structure | ✅ Organisée |
| Electron | ✅ Fonctionnel |
| API | ✅ Fonctionnelle |
| Base de données | ✅ SQLite3 |
| CSS | ✅ Modulaire |
| Documentation | ✅ Complète |

## 🔒 Sécurité

- CSP (Content Security Policy) configurée
- Validation des entrées
- CORS activé
- Isolation de contexte Electron
- Soft delete (audit trail)

## 📄 License

MIT - Voir [LICENSE](LICENSE)

## 👤 Auteur

**Sandersonn** - [GitHub](https://github.com/SandersonnDev)

---

**Dernière mise à jour** : Décembre 2025


Pour des questions ou des problèmes :
1. Consulter la documentation dans `docs/`
2. Vérifier la checklist `VALIDATION-CHECKLIST.md`
3. Vérifier les logs console (F12)
4. Vérifier `docs/8-DATABASE-SETUP.md` et `docs/9-MODALES-GUIDE.md`

---

**Dernière mise à jour:** 2024
**Version:** 1.0.0
