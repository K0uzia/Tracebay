#!/usr/bin/env bash
#
# 🚀 PROXMOX BACKEND - DÉTECTION AUTOMATIQUE N'IMPORTE OÙ
# Fonctionne depuis ~/workspace/ OU ~/proxmox/scripts/

set -euo pipefail

# 🔥 DÉTECTION INTELLIGENTE DU RÉPERTOIRE RACINE
SCRIPT_PATH="${BASH_SOURCE[0]}"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"

# Trouve ~/workspace automatiquement (3 niveaux max)
ROOT_DIR=""
for dir in "$SCRIPT_DIR" "../" "../../" "../../../"; do
  if [[ -d "$dir/workspace" ]]; then
    ROOT_DIR="$dir/workspace"
    break
  fi
done

if [[ -z "$ROOT_DIR" ]]; then
  echo "❌ Erreur: workspace/ non trouvé. Exécutez depuis workspace/ ou proxmox/scripts/"
  exit 1
fi

# Chemins absolus
APP_DIR="$ROOT_DIR/proxmox/app"
DOCKER_DIR="$ROOT_DIR/proxmox/docker"
SERVICE_NAME="workspace-proxmox"

echo "✅ Racine détectée: $ROOT_DIR"

# Couleurs
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BOLD='\033[1m'; RESET='\033[0m'

log() { echo -e "${GREEN}[OK]${RESET} $1"; }
warn() { echo -e "${YELLOW}[!]${RESET} $1"; }
title() { echo -e "\n${BOLD}=== $1 ===${RESET}\n"; }

# ==========================
# INSTALLATION UNIVERSELLE
# ==========================
install() {
  title "INSTALLATION (depuis $SCRIPT_DIR)"
  
  # 1. Paquets + Docker
  echo -e "nameserver 8.8.8.8" > /etc/resolv.conf
  apt-get update -qq >/dev/null
  apt-get install -y -qq docker.io nodejs npm git curl jq net-tools >/dev/null
  systemctl enable --now docker >/dev/null 2>&1
  log "Docker prêt"
  
  # 2. FIX npm ci → npm install
  cd "$APP_DIR"
  rm -rf node_modules package-lock.json 2>/dev/null || true
  npm install >/dev/null 2>&1
  log "package-lock.json généré"
  
  # 3. .env + systemd
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
  systemctl enable $SERVICE_NAME >/dev/null 2>&1
  systemctl start $SERVICE_NAME
  
  # 4. Symlink global
  cp "$0" /usr/local/bin/proxmox
  chmod +x /usr/local/bin/proxmox
  
  log "✅ INSTALLÉ ! API: http://$IP:4000"
}

start() { systemctl start $SERVICE_NAME && sleep 5 && log "http://$(hostname -I|awk '{print \$1}'):4000"; }
stop() { systemctl stop $SERVICE_NAME; log "Stoppé"; }
status() {
  IP=$(hostname -I | awk '{print $1}')
  echo -e "${BOLD}🌐 http://${IP}:4000${RESET}"
  systemctl is-active $SERVICE_NAME >/dev/null 2>&1 && echo "${GREEN}✅ Service ACTIF${RESET}" || echo "${YELLOW}⚠️ Service STOP${RESET}"
  [[ -d "$DOCKER_DIR" ]] && cd "$DOCKER_DIR" && docker compose ps 2>/dev/null | grep Up || true
}
rebuild() {
  systemctl stop $SERVICE_NAME 2>/dev/null || true
  cd "$APP_DIR" && rm -rf node_modules dist && npm install
  cd "$DOCKER_DIR" && docker compose down -v 2>/dev/null || true
  docker compose up -d --build
  systemctl restart $SERVICE_NAME
  log "Rebuild OK"
}
logs() { journalctl -u $SERVICE_NAME -f; }

case "${1:-help}" in
  install) install ;;
  start|up) start ;;
  stop|down) stop ;;
  status|st) status ;;
  restart) stop && sleep 2 && start ;;
  rebuild|build) rebuild ;;
  logs|log) logs ;;
  *) echo "Usage: $0 {install|start|stop|status|rebuild|logs}"; exit 1 ;;
esac
