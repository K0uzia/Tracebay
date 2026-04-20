# Deployment Guide - Proxmox Backend

## Prerequisites
- Docker Engine 20+ (ou Docker sur Debian 13 Trixie)
- Docker Compose v2 (intégré dans Docker Engine 20+)
- Curl (pour healthcheck)

### Installer Docker sur Debian 13 Trixie (Container LXC)

```bash
# Mettre à jour les paquets
sudo apt-get update && sudo apt-get upgrade -y

# Installer Docker
sudo apt-get install -y docker.io docker-compose-plugin curl

# Activer et démarrer Docker
sudo systemctl enable --now docker
sudo usermod -aG docker $USER

# Vérifier l'installation
docker --version
docker compose version
```

**Note:** Après `usermod`, déconnecter et reconnecter votre session pour appliquer les changements de groupe.

## Préparer l'environnement

```bash
# Cloner ou naviguer vers le repo
cd /home/user/workspace

# Copier la configuration d'environnement
cp docker/proxmox/.env.example docker/proxmox/.env

# Éditer si besoin (optionnel - les valeurs par défaut fonctionnent)
nano docker/proxmox/.env
```

## Configuration Docker Compose

La configuration est optimisée pour Debian 13 Trixie :

```yaml
# Services :
- db (PostgreSQL 16 Bookworm) : localhost:5432
- proxmox (Node.js 20 Fastify) : localhost:4000

# Networks :
- workspace-network (bridge)

# Volumes :
- postgres_data (persistence)
- logs (application logs)
```

## Lancer les services

### Option 1 : Via script automatisé (recommandé)

```bash
chmod +x docker/proxmox/run-proxmox.sh
./docker/proxmox/run-proxmox.sh
```

Le script :
1. Vérifie que Docker est disponible
2. Valide la configuration .env
3. Build l'image Proxmox
4. Démarre les services (db puis proxmox)
5. Attend les healthchecks
6. Teste `/api/health`

### Option 2 : Manuellement

```bash
# Naviguer vers le répertoire docker
cd docker/proxmox

# Valider la syntaxe
docker compose config -q

# Démarrer les services en background
docker compose up --build -d

# Consulter les logs
docker compose logs -f proxmox
docker compose logs -f db
```

## Vérifier le démarrage

```bash
# Status des services
docker compose ps

# Logs en temps réel
docker compose logs -f

# Test du healthcheck
curl -s http://localhost:4000/api/health | jq .

# Résultat attendu :
# {
#   "status": "ok",
#   "timestamp": "2026-01-19T...",
#   "uptime": 15.234,
#   "cache": { ... },
#   "memory": { ... }
# }
```

## Configuration

### Variables d'environnement (.env)

```bash
# Application
NODE_ENV=production          # production ou development
PORT=4000                    # Port Fastify
LOG_LEVEL=info              # debug, info, warn, error

# PostgreSQL
DB_HOST=db                  # Hostname du service PostgreSQL
DB_PORT=5432                # Port PostgreSQL
DB_NAME=workspace           # Nom de la base
DB_USER=workspace           # Utilisateur
DB_PASSWORD=SECRET_RETIRE         # Mot de passe (CHANGER EN PRODUCTION!)

# Connection Pool (Phase 5 Optimization)
DB_POOL_MIN=2               # Min connections
DB_POOL_MAX=10              # Max connections
DB_IDLE_TIMEOUT=30000       # Timeout connexions inactives (ms)
DB_CONNECTION_TIMEOUT=2000  # Timeout création connexion (ms)
```

### PostgreSQL Configuration

Le fichier `postgres.conf` est optimisé pour :
- **Ressources limitées** : 512MB-1GB RAM
- **Proxmox CT** : Performance sans surcharger le host
- **Queries > 100ms** : Logging automatique
- **Locale** : UTF-8 + UTC

## Endpoints

### Health Check
```bash
curl http://localhost:4000/api/health
```

### Metrics
```bash
curl http://localhost:4000/api/metrics
```

### API Base
- Chat: `POST /api/messages`
- Événements: `GET /api/events`
- Utilisateurs: `GET /api/monitoring/stats`

### WebSocket
```bash
ws://localhost:4000/ws
```

## Gestion des services

### Arrêter les services
```bash
docker compose down

# Arrêter et supprimer tous les volumes (DANGEREUX!)
docker compose down -v
```

### Redémarrer
```bash
docker compose restart
docker compose restart proxmox      # Redémarrer un service
```

### Consulter les logs
```bash
docker compose logs -f              # Tous les services
docker compose logs -f proxmox      # Proxmox uniquement
docker compose logs -f db           # PostgreSQL uniquement
docker compose logs --tail=100      # Dernières 100 lignes
```

### Exécuter des commandes dans le conteneur
```bash
docker compose exec proxmox npm run build
docker compose exec db psql -U workspace -d workspace
```

## Problèmes courants

### PostgreSQL ne démarre pas
```bash
# Vérifier les logs
docker compose logs db

# Problème possible : permissions des volumes
sudo chown 999:999 docker/proxmox/postgres_data -R
docker compose restart db
```

### Port déjà utilisé
```bash
# Changer le port dans .env
PORT=4001

# Redémarrer
docker compose restart proxmox
```

### Connexion DB refusée
```bash
# Vérifier la configuration
docker compose exec proxmox cat /app/apps/proxmox/dist/db/index.js | grep "dbConfig"

# Ou tester la connexion
docker compose exec db psql -U workspace -h localhost -c "SELECT 1"
```

### Effacer les données et recommencer
```bash
# ATTENTION : ceci supprime toutes les données!
docker compose down -v
rm -rf docker/proxmox/logs/*
docker compose up --build -d
```

## Validation PDF disques (traçabilité)

Les certificats PDF des sessions disques sont stockés sous `/mnt/team/#TEAM/#TRAÇABILITÉ/Disques/AAAA/Mois` (ou le chemin défini par `DISQUES_PDF_BASE`). Pour valider dans le CT Proxmox :

1. **Créer une session disques** (POST `/api/disques/sessions` avec `date` et `disks`) puis vérifier qu’un fichier PDF existe sous le dossier Disques (ex. `.../Disques/2026/Mars/...`).
2. **Ouvrir le PDF** : GET `/api/disques/sessions/:id/pdf` doit renvoyer 200 et le flux PDF.
3. **Supprimer ou renommer le fichier** sur le disque : GET `/api/disques/sessions/:id/pdf` doit renvoyer 404 avec `{"error":"PDF file not found"}`.
4. **Régénérer** : POST `/api/disques/sessions/:id/regenerate-pdf` (body `{}`) puis GET à nouveau : 200 et PDF servi.

Vérifier que le process backend a les droits d’écriture sur le dossier (ex. `DISQUES_PDF_BASE` ou `/mnt/team/#TEAM/#TRAÇABILITÉ/Disques`).

## Production Checklist

- [ ] Changer `DB_PASSWORD` en production
- [ ] Définir `NODE_ENV=production`
- [ ] Changer `LOG_LEVEL=warn` en production
- [ ] Configurer les limites de ressources (RAM/CPU)
- [ ] Setup des backups PostgreSQL
- [ ] Configurer un reverse proxy (nginx)
- [ ] SSL/TLS (certificats Let's Encrypt)
- [ ] Monitoring (Prometheus/Grafana)
- [ ] Logs centralisés (ELK stack optionnel)
