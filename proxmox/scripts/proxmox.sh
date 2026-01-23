#!/usr/bin/env bash
#
# 🚀 PROXMOX BACKEND - VERSION FONCTIONNELLE LOCALE
# Exécuter depuis ~/workspace/proxmox/scripts/

set -euo pipefail

# ==========================
# CONFIGURATION ABSOLUE
# ==========================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKDIR="/workspace"
APP_DIR="${WORKDIR}/proxmox/app"
DOCKER_DIR="${WORKDIR}/proxmox/docker"
SERVICE_NAME="workspace-proxmox"

# Couleurs simples
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BOLD='\033[1m'; RESET='\033[0m'

log() { echo -e "${GREEN}[OK]${RESET} $1"; }
warn() { echo -e "${YELLOW}[!]${RESET} $1"; }
title() { echo -e "\n${BOLD}=== $1 ===${RESET}\n"; }

# ==========================
# INSTALLATION LOCALE ✅
# ==========================
install() {
  title "INSTALLATION LOCALE (exécuté depuis scripts/)"
  
  # 1. DNS + Paquets
  echo -e "nameserver 8.8.8.8\nnameserver 1.1.1.1" > /etc/resolv.conf
  apt-get update -qq
  apt-get install -y -qq docker.io nodejs npm git curl jq
  
  systemctl enable --now docker >/dev/null 2>&1
  log "Docker OK"
  
  # 2. FIX npm ci → npm install d'abord
  cd "$APP_DIR"
  rm -rf node_modules package-lock.json 2>/dev/null || true
  npm install >/dev/null 2>&1
  log "Dépendances générées (package-lock.json OK)"
  
  # 3. Service systemd
  cd "$DOCKER_DIR"
  IP=$(hostname -I | awk '{print $1}')
  
  cat > .env << EOF
NODE_ENV=production
API_PORT=4000
SERVER_IP=$IP
DB_HOST=db
DB_USER=workspace
DB_PASSWORD=SECRET_RETIRE
EOF
  
  cat > /etc/systemd/system/$SERVICE_NAME.service << EOF
[Unit]
Description=Workspace Proxmox
After=docker.service
Requires=docker.service

[Service]
Type=simple
User=root
WorkingDirectory=$DOCKER_DIR
ExecStart=docker compose up -d
ExecStop=docker compose down
Restart=always

[Install]
WantedBy=multi-user.target
EOF
  
  systemctl daemon-reload
  systemctl enable $SERVICE_NAME
  systemctl start $SERVICE_NAME
  
  # 4. Symlink local → global
  cp "$SCRIPT_DIR/proxmox.sh" /usr/local/bin/proxmox
  chmod +x /usr/local/bin/proxmox
  
  log "✅ INSTALL TERMINÉE ! API: http://$IP:4000"
}

# ==========================
# COMMANDES SIMPLES
# ==========================
start() { systemctl start $SERVICE_NAME && sleep 5 && log "API: http://$(hostname -I|awk '{print \$1}'):4000"; }
stop() { systemctl stop $SERVICE_NAME; log "Stoppé"; }
status() {
  IP=$(hostname -I | awk '{print $1}')
  echo -e "${BOLD}🌐 API:${RESET} http://${IP}:4000"
  echo -e "${BOLD}📊 Health:${RESET} http://${IP}:4000/api/health"
  systemctl is-active $SERVICE_NAME >/dev/null 2>&1 && echo -e "${GREEN}✅ Service: ACTIF${RESET}" || echo -e "${YELLOW}⚠️ Service: STOP${RESET}"
  docker compose ps 2>/dev/null | grep Up || echo "⚠️ Pas de conteneurs"
}

rebuild() {
  systemctl stop $SERVICE_NAME 2>/dev/null || true
  cd "$APP_DIR" && rm -rf node_modules dist && npm install
  cd "$DOCKER_DIR" && docker compose down -v && docker compose up -d --build
  systemctl restart $SERVICE_NAME
  log "Rebuild OK"
}

logs() { journalctl -u $SERVICE_NAME -f; }

# ==========================
# EXÉCUTION
# ==========================
case "${1:-help}" in
  install) install ;;
  start|up) start ;;
  stop|down) stop ;;
  status|st) status ;;
  restart) stop && start ;;
  rebuild|build) rebuild ;;
  logs|log) logs ;;
  *) echo "Usage: $0 {install|start|stop|status|rebuild|logs}"; exit 1 ;;
esac
