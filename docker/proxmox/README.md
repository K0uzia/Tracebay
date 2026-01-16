# Proxmox Backend - Docker

## Prerequisites
- Docker Engine 20+
- Docker Compose v2

## Quick Start
```bash
docker compose -f docker/proxmox/docker-compose.yml up --build -d
```

Services:
- Proxmox API: http://localhost:4000
- PostgreSQL: localhost:5432 (workspace/workspace/SECRET_RETIRE)

## Healthcheck
- Proxmox: http://localhost:4000/api/health

## Stop & Clean
```bash
docker compose -f docker/proxmox/docker-compose.yml down -v
```
