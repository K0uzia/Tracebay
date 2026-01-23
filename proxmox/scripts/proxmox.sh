#!/bin/bash

# Script d'installation automatisé pour serveur backend Proxmox
# Compatible Debian 13 (Trixie) - Conteneur LXC
# Version: 1.0 - Date: Janvier 2026

set -e

# Couleurs pour l'affichage status
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Variables globales
SCRIPT_DIR="/opt/proxmox-workspace"
PROJECT_DIR="$SCRIPT_DIR/backend"
SERVICE_NAME="workspace-proxmox"
API_PORT=4000
DATA_DIR="/opt/proxmox-data"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.yml"

echo -e "${BLUE}=== DÉBUT INSTALLATION SERVEUR PROXMOX BACKEND ===${NC}"

# 1. MISE À JOUR SYSTÈME & INSTALLATION DÉPENDANCES
echo -e "${BLUE}1. Mise à jour système et installation dépendances...${NC}"
apt update && apt upgrade -y
apt install -y curl wget git docker.io docker-compose jq nodejs npm systemd-journal-remote iproute2 net-tools

# Activation Docker
systemctl enable docker --now
usermod -aG docker $USER

# 2. CRÉATION STRUCTURE RÉPERTOIRES
echo -e "${BLUE}2. Création structure répertoires...${NC}"
mkdir -p "$DATA_DIR"/{db,logs,backups,certs}
mkdir -p "$SCRIPT_DIR"
cd "$SCRIPT_DIR"

# 3. CLONAGE PROJET & CONFIGURATION
echo -e "${BLUE}3. Clonage projet backend...${NC}"
if [ ! -d "$PROJECT_DIR" ]; then
    git clone -b proxmox https://github.com/votre-org/proxmox-workspace.git backend
fi
cd backend

# Détection IP automatique
CONTAINER_IP=$(hostname -I | awk '{print $1}')
echo "IP détectée: $CONTAINER_IP"

# 4. GÉNÉRATION FICHIER .ENV
echo -e "${BLUE}4. Génération fichier .env...${NC}"
cat > .env << EOF
# Configuration Serveur Proxmox Workspace
NODE_ENV=production
PORT=$API_PORT
HOST=$CONTAINER_IP
API_URL=http://${CONTAINER_IP}:$API_PORT

# JWT Security
JWT_SECRET=$(openssl rand -base64 48)
JWT_EXPIRES=7d

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=proxmox_workspace
DB_USER=proxmox_user
DB_PASSWORD=$(openssl rand -base64 24)

# Paths
DATA_PATH=$DATA_DIR
LOGS_PATH=$DATA_DIR/logs
BACKUPS_PATH=$DATA_DIR/backups

# Proxmox Integration
PROXMOX_HOST=localhost
PROXMOX_PORT=8006
PROXMOX_USER=root@pam
PROXMOX_TOKEN_ID=workspace-api
PROXMOX_TOKEN_SECRET=$(openssl rand -base64 32)

# Features
CHAT_ENABLED=true
AGENDA_ENABLED=true
RECEPTION_ENABLED=true
ACCOUNTS_ENABLED=true
SHORTCUTS_ENABLED=true
EOF

# 5. CONSTRUCTION BACKEND NODE.JS
echo -e "${BLUE}5. Construction backend Node.js...${NC}"
npm ci --production
npm run build

# 6. DOCKER COMPOSE POUR SERVICES
cat > "$COMPOSE_FILE" << 'EOF'
version: '3.8'

services:
  backend:
    build: .
    ports:
      - "4000:4000"
    env_file:
      - .env
    volumes:
      - /opt/proxmox-data:/app/data
      - /var/run/docker.sock:/var/run/docker.sock
    restart: unless-stopped
    networks:
      - proxmox-net

  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: proxmox_workspace
      POSTGRES_USER: proxmox_user
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - /opt/proxmox-data:/data
    secrets:
      - db_password
    restart: unless-stopped
    networks:
      - proxmox-net

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    restart: unless-stopped
    networks:
      - proxmox-net

volumes:
  postgres_data:
  redis_data:

secrets:
  db_password:
    file: /opt/proxmox-data/db_password.txt

networks:
  proxmox-net:
    driver: bridge
EOF

# Secrets Docker
echo "$(grep DB_PASSWORD .env | cut -d'=' -f2)" > "$DATA_DIR/db_password.txt"

# 7. SERVICE SYSTEMD
cat > /etc/systemd/system/$SERVICE_NAME.service << EOF
[Unit]
Description=Proxmox Workspace Backend
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$PROJECT_DIR
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ExecStartPre=/usr/bin/docker-compose -f $COMPOSE_FILE pull
ExecStart=/usr/bin/docker-compose -f $COMPOSE_FILE up -d
ExecStop=/usr/bin/docker-compose -f $COMPOSE_FILE down
TimeoutStopSec=30
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable $SERVICE_NAME

# 8. COMMANDE GLOBALE 'proxmox'
cat > /usr/local/bin/proxmox << 'EOF'
#!/bin/bash

SERVICE_NAME="workspace-proxmox"
PROJECT_DIR="/opt/proxmox-workspace/backend"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.yml"
API_URL="http://$(hostname -I | awk '{print $1}'):4000"

print_status() {
    echo "╔══════════════════════════════════════════════════════════════════════╗"
    echo "║                          STATUT PROXMOX WORKSPACE                    ║"
    echo "╠══════════════════════════════════════════════════════════════════════╣"
    
    # Service systemd
    if systemctl is-active --quiet $SERVICE_NAME; then
        STATUS_SYSTEMD="${GREEN}✓ ACTIF${NC}"
    else
        STATUS_SYSTEMD="${RED}✗ INACTIF${NC}"
    fi
    
    # API Health
    if curl -s --max-time 5 $API_URL/api/health | grep -q '"status":"ok"'; then
        STATUS_API="${GREEN}✓ EN LIGNE${NC}"
    else
        STATUS_API="${RED}✗ INDISPONIBLE${NC}"
    fi
    
    # Serveur Node
    if docker ps --format "table {{.Names}}\ {{.Status}}" | grep -q "backend"; then
        STATUS_NODE="${GREEN}✓ EN LIGNE${NC}"
    else
        STATUS_NODE="${RED}✗ ARRÊTÉ${NC}"
    fi
    
    IP_PORT="http://$(hostname -I | awk '{print $1}'):4000"
    
    echo "║ SYSTEMD: $STATUS_SYSTEMD  │  NODE.JS: $STATUS_NODE  │  API: $STATUS_API ║"
    echo "║ URL: $IP_PORT                                                     ║"
    echo "╠══════════════════════════════════════════════════════════════════════╣"
    
    echo "║ ENDPOINTS DISPONIBLES:                                            ║"
    echo "║  ✓ /api/chat          ✓ /api/agenda       ✓ /api/reception        ║"
    echo "║  ✓ /api/raccourcis    ✓ /api/comptes     ✓ /api/health            ║"
    echo "╠══════════════════════════════════════════════════════════════════════╣"
    
    echo "║ CONTENEURS DOCKER:                                                ║"
    docker ps --format "║  {{.Names}}\t{{.Status}}\t{{.Ports}}" | while IFS= read -r line; do
        echo "$line"
    done || echo "║  Aucun conteneur actif                                            ║"
    
    echo "╚══════════════════════════════════════════════════════════════════════╝"
}

case "$1" in
    install)
        cd $PROJECT_DIR && docker-compose -f $COMPOSE_FILE up -d --build
        systemctl restart $SERVICE_NAME
        echo -e "\n${GREEN}Installation terminée !${NC}"
        print_status
        ;;
    up|start)
        systemctl start $SERVICE_NAME
        print_status
        ;;
    stop)
        systemctl stop $SERVICE_NAME
        ;;
    restart)
        systemctl restart $SERVICE_NAME
        sleep 3
        print_status
        ;;
    logs)
        journalctl -u $SERVICE_NAME -f
        ;;
    rebuild)
        cd $PROJECT_DIR && docker-compose -f $COMPOSE_FILE down -v
        docker system prune -f
        docker-compose -f $COMPOSE_FILE up -d --build
        print_status
        ;;
    status)
        print_status
        ;;
    *)
        echo "Usage: proxmox {install|up|stop|restart|logs|rebuild|status}"
        exit 1
        ;;
esac
EOF

chmod +x /usr/local/bin/proxmox

# 9. LANCEMENT INITIAL
echo -e "${BLUE}9. Lancement services...${NC}"
proxmox install

# 10. CONFIGURATION FINALE
echo -e "${BLUE}10. Configuration finale...${NC}"
echo 'export PATH=$PATH:/usr/local/bin' >> /root/.bashrc
echo "alias pws='proxmox status'" >> /root/.bashrc

echo -e "\n${GREEN}╔══════════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    ✅ INSTALLATION TERMINÉE ✅                        ${NC}"
echo -e "${GREEN}║                                                                      ${NC}"
echo -e "${GREEN}║ Commandes disponibles:                                              ${NC}"
echo -e "${GREEN}║ • proxmox status     → Afficher statut complet                      ${NC}"
echo -e "${GREEN}║ • proxmox restart    → Redémarrer services                         ${NC}"
echo -e "${GREEN}║ • proxmox logs       → Suivi logs en temps réel                    ${NC}"
echo -e "${GREEN}║ • proxmox rebuild    → Reconstruction complète                     ${NC}"
echo -e "${GREEN}║                                                                      ${NC}"
echo -e "${GREEN}║ Serveur accessible: http://$CONTAINER_IP:$API_PORT                  ${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════════════╝${NC}\n"

# Test final
proxmox status [web:1][web:3][web:5]
