# Proxmox Backend - Docker

## Prerequisites
- Docker Engine 20+
- Docker Compose v2

### Installer Docker sur Proxmox
```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-plugin curl
sudo systemctl enable --now docker
```

## Quick Start (script)
```bash
cp .env.example .env
chmod +x run-proxmox.sh
./run-proxmox.sh
```

## Quick Start (manuel)
```bash
docker compose -f docker/proxmox/docker-compose.yml config -q
docker compose -f docker/proxmox/docker-compose.yml up --build -d
```

Services:
- Proxmox API: http://localhost:4000
- PostgreSQL : non publié sur le réseau, accès par `docker compose exec db psql` (secrets dans `.env`, voir docs/DEPLOYMENT.md)

Healthcheck:
- Proxmox: http://localhost:4000/api/health

Stop & Clean:
```bash
docker compose -f docker/proxmox/docker-compose.yml down -v
```
