# ⚡ Quick Start

## 5 minutes pour démarrer

### 1. Setup initial (une fois)

```bash
./setup-local.sh init
```

### 2. Lancer l'app

```bash
npm run dev
# L'app Electron se lance sur http://localhost:3000
```

Voilà ! 🎉

## Commandes principales

```bash
# Développement
npm run dev         # Electron + API
npm start           # Juste Electron  
npm run server      # Juste API

# Base de données
make db.shell       # Accéder à la DB
make db.backup      # Sauvegarder
make db.reset       # Réinitialiser

# Info
./setup-local.sh info
make help
```

## Fichiers importants

| Fichier | Rôle |
|---------|------|
| `main.js` | Electron main process |
| `server.js` | Express API server |
| `database.js` | SQLite configuration |
| `public/` | Front-end (HTML/CSS/JS) |
| `routes/` | API endpoints |

## URL & Ports

- **Electron** : Fenêtre desktop
- **API** : http://localhost:3000
- **Health check** : http://localhost:3000/api/health

## Problèmes courants ?

### ❌ "Port already in use"
```bash
PORT=4000 npm run dev
```

### ❌ "Database error"
```bash
make db.reset
```

### ❌ "Module not found"
```bash
npm install
```

## Prochaines étapes

- Consultez [SETUP.md](SETUP.md) pour installation complète
- Lire [DEVELOPMENT.md](../guides/DEVELOPMENT.md) pour contribuer
- Explorer [docs/](../) pour plus

---

**Besoin d'aide ?** Voir `docs/setup/SETUP.md` ou consultez la [documentation complète](../INDEX.md)
