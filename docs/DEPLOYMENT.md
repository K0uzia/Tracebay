# Deployment Guide - Proxmox Backend

## Prerequisites
- Docker Engine 20+
- Docker Compose v2

### Installer Docker sur Proxmox (hôte Debian/Proxmox)
```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-plugin curl
sudo systemctl enable --now docker
docker --version
docker compose version
```

## Préparer l'environnement
```bash
cp docker/proxmox/.env.example docker/proxmox/.env
# Éditer docker/proxmox/.env (LOG_LEVEL, DATABASE_URL si besoin)
```

## Lancer via script automatisé (recommandé)
```bash
chmod +x docker/proxmox/run-proxmox.sh
./docker/proxmox/run-proxmox.sh
```
Le script vérifie docker, valide la config, build, démarre, attend les healthchecks (db puis proxmox) et teste `/api/health`.

## Lancer manuellement
```bash
docker compose -f docker/proxmox/docker-compose.yml config -q
docker compose -f docker/proxmox/docker-compose.yml up --build -d
```

## Environment Variables (.env)
```
NODE_ENV=production
PORT=4000
LOG_LEVEL=info
DATABASE_URL=postgres://workspace:SECRET_RETIRE@db:5432/workspace
```

## Services
- Proxmox API: http://localhost:4000
- PostgreSQL: localhost:5432 (workspace/workspace/SECRET_RETIRE)

## Healthcheck
- Proxmox: http://localhost:4000/api/health

## Stop & Clean
```bash
docker compose -f docker/proxmox/docker-compose.yml down -v
```
