# Deployment Guide - Proxmox Backend

## Prerequisites
- Docker Engine 20+
- Docker Compose v2

## Build & Run (Local)
```bash
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
