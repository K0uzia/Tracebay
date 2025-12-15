# Setup Simplifié - Workspace Electron

Ce projet utilise **electron-builder uniquement** pour une gestion simplifiée du packaging et du build.

## ✅ Installation rapide

```bash
# Configuration initiale complète
./setup-local.sh init

# Ou avec make
make init
```

## 🚀 Commandes principales

### Setup & Infos
```bash
./setup-local.sh init        # Configuration complète
./setup-local.sh deps        # Installe Node.js, npm, SQLite3
./setup-local.sh info        # État du système
```

### Développement
```bash
./setup-local.sh dev         # Lance serveur Node + Electron
./setup-local.sh server      # Juste le serveur Node (port 3000)

# Ou avec make
make dev
make server
```

### Base de données
```bash
./setup-local.sh reset       # Réinitialise la BD
./setup-local.sh db.shell    # Shell SQLite3
./setup-local.sh db.backup   # Sauvegarde la BD
```

### Build & Deploy
```bash
./setup-local.sh build       # Build avec electron-builder
./setup-local.sh build       # Génère AppImage (Linux)

npm run build:win            # Windows (.exe + NSIS)
npm run build:mac            # macOS (.dmg)
npm run build:linux          # Linux (.AppImage)
```

## 📦 Scripts npm

```bash
npm start                    # Lance Electron
npm run dev                  # Lance serveur Node + Electron
npm run server              # Juste le serveur Node
npm run build               # Build tout
npm run build:win           # Build Windows
npm run build:mac           # Build macOS
npm run build:linux         # Build Linux
```

## 🗺️ Makefile (plus simple)

```bash
make help       # Liste toutes les commandes
make init       # Setup initial
make dev        # Mode développement
make server     # Serveur uniquement
make build      # Build avec electron-builder
make clean      # Nettoie dist/, out/
```

## 📁 Structure après `make init`

```
workspace/
├── bin/
│   ├── db          # Scripts de BD
│   ├── dev         # Lance Electron
│   └── server      # Lance serveur
├── data/
│   ├── database.sqlite    # Votre BD
│   └── backups/           # Backups auto
├── dist/           # Fichiers buildés
├── node_modules/   # Dépendances npm
└── .env           # Configuration locale
```

## 🔧 Variables d'environnement

```bash
PORT=3000                          # Port serveur Node
DATA_DIR=./data                    # Répertoire données
DB_FILE=database.sqlite            # Fichier BD
NODE_ENV=development               # development | production
```

## 📋 Dépendances installées

### Système (installées avec `./setup-local.sh deps`)
- Node.js + npm
- SQLite3

### npm (dans package.json)
- **electron** - Framework desktop
- **electron-builder** - Build & packaging
- **express** - Serveur web
- **sqlite3** - Base de données
- **cors** - CORS middleware
- **dotenv** - Variables d'environnement

## 🎯 Workflow typique

```bash
# Première fois
./setup-local.sh init

# Pour développer
make dev              # Serveur + Electron

# Pour tester le build
make build            # Génère ./dist/Workspace-1.0.0.AppImage

# Exécuter l'app
./dist/Workspace-1.0.0.AppImage

# Nettoyer avant commit
make clean
```

## 🤔 FAQ

**Q: Où sont les fichiers buildés ?**
R: Dans `./dist/` (Linux AppImage) et `./out/` (autre plateforme)

**Q: Comment changer le port ?**
R: `PORT=3001 ./setup-local.sh server` ou modifiez `.env`

**Q: Comment faire un backup de la BD ?**
R: `./setup-local.sh db.backup`

**Q: Erreur "Manque: electron" ?**
R: Lancez `npm install` ou `./setup-local.sh init`

## 📖 Pour plus d'infos

- [Electron](https://www.electronjs.org/)
- [Electron Builder](https://www.electron.build/)
- [Express](https://expressjs.com/)
- [SQLite3](https://www.sqlite.org/)
