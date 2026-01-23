#!/bin/bash

# proxmox.sh - Script d'installation automatisé Proxmox Backend (Debian 13 Trixie)
# Gestion complète: install, up, stop, restart, logs, rebuild, status
set -e

# Couleurs pour status
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Répertoires
REPO_DIR="$(pwd)"
PROXMOX_DIR="$REPO_DIR/proxmox"
DOCKER_DIR="$PROXMOX_DIR/docker"
SCRIPTS_DIR="$PROXMOX_DIR/scripts"
APP_DIR="$PROXMOX_DIR/app"
COMPOSE_FILE="$DOCKER_DIR/docker-compose.yml"
ENV_FILE="$APP_DIR/.env"

# Fonction de logging
log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERREUR]${NC} $1" >&2
    exit 1
}

status() {
    echo -e "${BLUE}[STATUS]${NC} $1"
}

# 1. GESTION DÉPÔT EXISTANT
clone_or_update() {
    cd "$REPO_DIR"
    if [ -d ".git" ]; then
        log "Mise à jour du dépôt existant (branche proxmox)"
        git checkout proxmox || git checkout -b proxmox
        git pull origin proxmox || git pull origin main
        log "Dépôt mis à jour: $(git rev-parse --short HEAD)"
    else
        error "Dépôt git non trouvé dans $REPO_DIR. Clonez manuellement d'abord."
    fi
}

# 2. DÉTECTION IP/PORT AUTOMATIQUE
detect_ip_port() {
    IP=$(hostname -I | awk '{print $1}')
    PORT=3000
    [ -z "$IP" ] && error "Impossible de détecter l'IP"
    status "IP détectée: $IP:$PORT"
    echo "API_IP=$IP" > "$ENV_FILE"
    echo "API_PORT=$PORT" >> "$ENV_FILE"
}

# 3. GÉNÉRATION .env COMPLET
generate_env() {
    cat > "$ENV_FILE" << EOF
# Configuration Proxmox Backend
NODE_ENV=production
API_IP=$(hostname -I | awk '{print $1}')
API_PORT=3000

# Database
DB_HOST=db
DB_PORT=5432
DB_NAME=proxmox
DB_USER=proxmox
DB_PASSWORD=secure_password_2026

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES=7d

# Services
REDIS_URL=redis://redis:6379
EOF
    log ".env généré avec IP automatique"
}

# 4. CONSTRUCTION BACKEND NODE.JS
build_backend() {
    log "Installation NPM et build production"
    cd "$APP_DIR"
    npm ci --production
    npm run build
}

# 5. CRÉATION DOCKER-COMPOSE
create_docker_compose() {
    cat > "$COMPOSE_FILE" << 'EOF'
version: '3.8'
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: proxmox
      POSTGRES_USER: proxmox
      POSTGRES_PASSWORD: secure_password_2026
    volumes:
      - ./proxmox_data/db:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U proxmox"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    volumes:
      - ./proxmox_data/redis:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: ../app
      dockerfile: Dockerfile
    ports:
      - "${API_PORT:-3000}:3000"
    environment:
      - NODE_ENV=production
    volumes:
      - ../app:/app
      - ../proxmox_data/logs:/app/logs
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
EOF
}

# 6. CRÉATION DOCKERFILE
create_dockerfile() {
    cat > "$DOCKER_DIR/Dockerfile" << 'EOF'
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
EOF
}

# 7. INITIALISATION BASE DE DONNÉES
init_db() {
    log "Initialisation de la base de données"
    sleep 10 # Attente healthcheck
    docker compose exec -T db psql -U proxmox -d proxmox -f /tmp/schema.sql || true
    # Copie schema.sql dans conteneur si existe
    [ -f "$APP_DIR/src/db/schema.sql" ] && \
        docker compose cp "$APP_DIR/src/db/schema.sql" $(docker compose ps -q db):/tmp/
}

# 8. SERVICE SYSTEMD LOCAL (proxmox.service)
create_local_systemd() {
    mkdir -p "$SCRIPTS_DIR/service"
    cat > "$SCRIPTS_DIR/service/proxmox.service" << EOF
[Unit]
Description=Proxmox Backend Service
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$PROXMOX_DIR
ExecStart=/usr/local/bin/docker compose up -d
ExecStop=/usr/local/bin/docker compose down
Restart=always
RestartSec=5s

[Install]
WantedBy=multi-user.target
EOF
    chmod +x "$SCRIPTS_DIR/service/proxmox.service"
}

# 9. COMMANDE STATUS AVEC COULEURS ET TABLEAUX
status_check() {
    clear
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║${NC} ${GREEN}PROXMOX BACKEND STATUS${NC} ${BLUE}║${NC}"
    echo -e "${BLUE}╠══════════════════════════════════════════════════════════════╣${NC}"

    # Service systemd simulé
    if [ -f "$SCRIPTS_DIR/proxmox.pid" ]; then
        SERVICE_STATUS="${GREEN}ACTIF${NC}"
    else
        SERVICE_STATUS="${RED}INACTIF${NC}"
    fi
    printf "${BLUE}║${NC} %-20s: ${SERVICE_STATUS:-(15)} ${BLUE}║${NC}\n" "Service systemd"

    # Serveur Node.js
    if docker compose ps backend | grep -q "Up"; then
        NODE_STATUS="${GREEN}OPERATIONNEL${NC}"
    else
        NODE_STATUS="${RED}ARRETE${NC}"
    fi
    printf "${BLUE}║${NC} %-20s: ${NODE_STATUS:-(15)} ${BLUE}║${NC}\n" "Serveur Node.js"

    # API Health
    HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "http://$(hostname -I | awk '{print $1}'):3000/api/health" || echo "000")
    [ "$HEALTH" = "200" ] && API_STATUS="${GREEN}OK${NC}" || API_STATUS="${RED}KO${NC}"
    printf "${BLUE}║${NC} %-20s: ${API_STATUS:-(15)} ${BLUE}║${NC}\n" "API Backend"

    # IP & Port
    IP_PORT=$(hostname -I | awk '{print $1}'):3000
    printf "${BLUE}║${NC} %-20s: ${BLUE}%s${NC} ${BLUE}║${NC}\n" "IP & Port" "$IP_PORT"

    echo -e "${BLUE}╠══════════════════════════════════════════════════════════════╣${NC}"
    echo -e "${BLUE}║${NC} ${YELLOW}ENDPOINTS DISPONIBLES${NC} ${BLUE}║${NC}"
    echo -e "${BLUE}╠══════════════════════╦══════════════════════════════════════╣${NC}"
    printf "${BLUE}║${NC} %-20s ${BLUE}║${NC} %-30s ${BLUE}║${NC}\n" "Module" "Endpoint" 
    printf "${BLUE}║${NC} %-20s ${BLUE}║${NC} %-30s ${BLUE}║${NC}\n" "chat" "/api/chat/:room"
    printf "${BLUE}║${NC} %-20s ${BLUE}║${NC} %-30s ${BLUE}║${NC}\n" "agenda" "/api/agenda/events"
    printf "${BLUE}║${NC} %-20s ${BLUE}║${NC} %-30s ${BLUE}║${NC}\n" "réception" "/api/reception/info"
    printf "${BLUE}║${NC} %-20s ${BLUE}║${NC} %-30s ${BLUE}║${NC}\n" "raccourcis" "/api/shortcuts"
    printf "${BLUE}║${NC} %-20s ${BLUE}║${NC} %-30s ${BLUE}║${NC}\n" "comptes" "/api/auth/*"
    echo -e "${BLUE}╚══════════════════════╩══════════════════════════════════════╝${NC}"

    # Conteneurs Docker
    echo -e "\n${YELLOW}CONTENEURS DOCKER:${NC}"
    docker compose ps --format "table {{.Name}}\t{{.State}}\t{{.Status}}" | \
    sed "s/Up/${GREEN}Up${NC}/g; s/Exit/${RED}Exit${NC}/g"
}

# COMMANDES PRINCIPALES
case "${1:-}" in
    "install")
        log "🚀 INSTALLATION COMPLÈTE PROXMOX BACKEND"
        clone_or_update
        mkdir -p proxmox_data/{db,redis,logs}
        detect_ip_port
        generate_env
        create_docker_compose
        create_dockerfile
        create_local_systemd
        build_backend
        cd "$PROXMOX_DIR"
        docker compose up -d
        init_db
        log "✅ Installation terminée! API: http://$(hostname -I | awk '{print $1}'):3000"
        status_check
        ;;

    "up")
        cd "$PROXMOX_DIR" && docker compose up -d && status_check
        ;;

    "stop")
        cd "$PROXMOX_DIR" && docker compose down && log "Service arrêté"
        ;;

    "restart")
        $0 stop && sleep 2 && $0 up
        ;;

    "logs")
        cd "$PROXMOX_DIR" && docker compose logs -f --tail=100
        ;;

    "rebuild")
        cd "$PROXMOX_DIR" && docker compose down && docker compose build --no-cache && docker compose up -d
        ;;

    "status")
        status_check
        ;;

    *)
        echo "Usage: $0 {install|up|stop|restart|logs|rebuild|status}"
        exit 1
        ;;
esac
