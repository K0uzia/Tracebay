# 📥 Installation et Setup

## Prérequis

- Node.js 18+ ([télécharger](https://nodejs.org/))
- npm 9+
- Git

Vérifiez vos versions :

```bash
node --version      # v18.19.1+
npm --version       # 9.2.0+
git --version       # 2.x+
```

## Installation rapide

### 1. Cloner le repository

```bash
git clone https://github.com/SandersonnDev/workspace.git
cd workspace
```

### 2. Setup initial (recommandé)

```bash
./setup-local.sh init
```

Cela va :
- ✅ Créer les répertoires (`data/`, `bin/`, `config/`)
- ✅ Générer `.env` avec configuration par défaut
- ✅ Générer scripts utilitaires
- ✅ Installer dépendances npm
- ✅ Initialiser la base de données SQLite

### 3. Démarrer l'application

```bash
# Option 1: Mode complet (API + Electron)
npm run dev

# Option 2: Juste Electron
npm start

# Option 3: Juste l'API
npm run server
```

L'app accède à **http://localhost:3000**

## Configuration

### Fichier `.env`

Créé automatiquement lors de `./setup-local.sh init`. Vous pouvez le personnaliser :

```bash
# Port du serveur (défaut: 3000)
PORT=3000

# Chemin de la base de données
DB_PATH=./data/database.sqlite

# Environment
NODE_ENV=development

# URLs optionnelles
CHAT_API_URL=http://localhost:3000
PDF_OUTPUT_DIR=./public/src/pdf
```

Pour utiliser un port différent :

```bash
PORT=4000 npm run dev
```

## Installation manuelle

Si vous ne voulez pas utiliser `setup-local.sh` :

```bash
# 1. Installer dépendances
npm install

# 2. Créer fichier .env
cp .env.example .env

# 3. Créer répertoires
mkdir -p data bin config

# 4. Initialiser la DB
./bin/db init

# 5. Lancer l'app
npm run dev
```

## Dépannage

### Erreur: "Command not found: npm"

```bash
# Vérifiez Node.js est installé
which node
node --version

# Réinstallez Node.js depuis https://nodejs.org/
```

### Erreur: "SQLITE_CANTOPEN: unable to open database file"

```bash
# Créez le répertoire data/
mkdir -p data

# Réinitialisez la DB
./bin/db init

# Ou avec make
make db.init
```

### Erreur: "Port 3000 already in use"

```bash
# Utilisez un port différent
PORT=4000 npm run dev

# Ou trouvez ce qui utilise le port 3000
lsof -i :3000
kill -9 <PID>
```

### Erreur: "Module not found"

```bash
# Réinstallez les dépendances
rm -rf node_modules package-lock.json
npm install
```

## Commandes utiles

| Commande | Description |
|----------|-------------|
| `npm run dev` | Electron + API |
| `npm start` | Juste Electron |
| `npm run server` | Juste API |
| `make dev` | Electron + API (via Make) |
| `make server` | Juste API (via Make) |
| `make db.init` | Initialiser DB |
| `make db.reset` | Réinitialiser DB |
| `make db.shell` | Shell SQLite |

## Structure créée

```
workspace/
├── .env                        # Configuration (créé)
├── data/
│   └── database.sqlite        # DB (créée)
├── node_modules/              # Dépendances npm
├── bin/
│   ├── db                     # Utilitaire DB
│   ├── server                 # Lancer serveur
│   └── dev                    # Lancer complet
├── Makefile                   # Commandes Make
└── ...
```

## Verification

Pour vérifier que tout fonctionne :

```bash
./setup-local.sh info
```

Devrait afficher :
- ✅ Versions de Node.js, npm, SQLite
- ✅ npm dependencies installées
- ✅ DB présente avec 5 tables

---

**Prêt ?** Consultez [QUICK_START.md](QUICK_START.md) pour les prochaines étapes !
