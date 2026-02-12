# Intégration des Routes de Monitoring sur le Serveur Node

## Structure actuelle sur Proxmox

```
~/workspace/
├── apps/          # Dossier existant
├── docs/
├── docker/
├── proxmox/
├── package.json
└── ...
```

## Fichiers à copier sur le serveur

Sur votre serveur Proxmox, dans `~/workspace/apps/server/` :

1. Créer `apps/server/routes/monitoring.js` → Copier le contenu depuis ce repo
2. Créer `apps/server/views/monitoring.html` → Copier le contenu depuis ce repo
3. Créer `apps/server/migrations/create_client_errors_table.sql` → Copier depuis ce repo

## Étapes d'intégration

### 1. Créer la table en base de données

```bash
# Sur le serveur Proxmox
cd ~/workspace
sqlite3 database.sqlite < apps/server/migrations/create_client_errors_table.sql

# Ou si votre DB est ailleurs, adapter le chemin
```

### 2. Intégrer les routes dans le serveur

Trouver le fichier principal du serveur (probablement dans `apps/server/` ou à la racine). Ajouter :

```javascript
// Importer les routes de monitoring
const monitoringRoutes = require('./apps/server/routes/monitoring');

// Enregistrer les routes (après les autres app.use())
app.use('/api/monitoring', monitoringRoutes);
app.use('/monitoring', monitoringRoutes);
```

**Si votre structure est différente**, adapter le chemin :
- Si routes dans `apps/server/src/routes/` → `require('./apps/server/src/routes/monitoring')`
- Si routes à la racine → `require('./routes/monitoring')`

### 3. Configurer la connexion à la base de données

Le code utilise `req.app.get('db')`. Dans votre fichier serveur principal, ajouter :

```javascript
// Exemple avec SQLite3
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.sqlite'); // Adapter le chemin

app.set('db', db);
```

### 4. Configurer le cookie parser (pour l'authentification)

Si pas déjà présent, ajouter :

```javascript
const cookieParser = require('cookie-parser');
app.use(cookieParser());
```

### 5. Variable d'environnement (optionnel)

Pour changer le mot de passe admin du dashboard :

```bash
export MONITORING_ADMIN_TOKEN=votre_mot_de_passe_securise
```

Par défaut, le mot de passe est `SECRET_RETIRE` (à changer en production).

## Vérification

1. Redémarrer le serveur Node
2. Accéder à `http://192.168.1.62:4000/monitoring`
3. Vous devriez voir la page de login
4. Entrer le mot de passe (par défaut: `SECRET_RETIRE`)

## Structure finale attendue sur le serveur

Sur votre serveur Proxmox (`~/workspace/`), créer :

```
~/workspace/
├── apps/
│   └── server/
│       ├── routes/
│       │   └── monitoring.js          # NOUVEAU - Copier depuis ce repo
│       ├── views/
│       │   └── monitoring.html        # NOUVEAU - Copier depuis ce repo
│       └── migrations/
│           └── create_client_errors_table.sql  # NOUVEAU - Copier depuis ce repo
├── package.json
└── server.js (ou app.js ou main.js)    # MODIFIER pour ajouter les routes
```

**OU** si votre serveur utilise une structure différente (ex: `apps/server/src/`), adapter les chemins dans le code.

## Commandes SSH pour copier et intégrer les fichiers

### Option 1 : Depuis votre machine locale (recommandé)

**Étape 1 : Créer les dossiers sur le serveur**

```bash
ssh root@192.168.1.62 "mkdir -p ~/workspace/apps/server/routes ~/workspace/apps/server/views ~/workspace/apps/server/migrations"
```

**Étape 2 : Copier les fichiers**

Depuis la racine de ce repo (`/home/goupil/Documents/workspace/`) :

```bash
# Copier le fichier de routes
scp apps/server/routes/monitoring.js root@192.168.1.62:~/workspace/apps/server/routes/

# Copier le fichier HTML du dashboard
scp apps/server/views/monitoring.html root@192.168.1.62:~/workspace/apps/server/views/

# Copier la migration SQL
scp apps/server/migrations/create_client_errors_table.sql root@192.168.1.62:~/workspace/apps/server/migrations/
```

**Étape 3 : Se connecter au serveur et créer la table**

```bash
ssh root@192.168.1.62
cd ~/workspace
sqlite3 database.sqlite < apps/server/migrations/create_client_errors_table.sql
```

**Étape 4 : Intégrer les routes dans le serveur**

Trouver le fichier principal du serveur (probablement `server.js`, `app.js`, ou `apps/server/src/main.ts`) et ajouter :

```javascript
const monitoringRoutes = require('./apps/server/routes/monitoring');
app.use('/api/monitoring', monitoringRoutes);
app.use('/monitoring', monitoringRoutes);
```

**Étape 5 : Redémarrer le serveur**

```bash
# Si vous utilisez PM2
pm2 restart workspace-server

# Ou si vous utilisez systemd
systemctl restart workspace-server

# Ou simplement relancer votre script
node server.js
```

### Option 2 : Tout faire directement en SSH

**Se connecter au serveur :**

```bash
ssh root@192.168.1.62
cd ~/workspace
```

**Créer les dossiers :**

```bash
mkdir -p apps/server/routes
mkdir -p apps/server/views
mkdir -p apps/server/migrations
```

**Créer les fichiers directement sur le serveur :**

Utiliser `nano` ou `vi` pour créer les fichiers en copiant le contenu depuis ce repo :

```bash
# Créer monitoring.js
nano apps/server/routes/monitoring.js
# Coller le contenu de apps/server/routes/monitoring.js depuis ce repo

# Créer monitoring.html
nano apps/server/views/monitoring.html
# Coller le contenu de apps/server/views/monitoring.html depuis ce repo

# Créer create_client_errors_table.sql
nano apps/server/migrations/create_client_errors_table.sql
# Coller le contenu de apps/server/migrations/create_client_errors_table.sql depuis ce repo
```

**Créer la table :**

```bash
sqlite3 database.sqlite < apps/server/migrations/create_client_errors_table.sql
```

**Modifier le fichier serveur principal :**

```bash
# Trouver le fichier principal
ls -la | grep -E "(server|app|main)\.(js|ts)"

# Éditer le fichier (remplacer par le nom réel)
nano server.js
# Ou
nano apps/server/src/main.ts
```

Ajouter les lignes d'intégration (voir Étape 4 ci-dessus).

**Redémarrer le serveur** (voir Étape 5 ci-dessus).
