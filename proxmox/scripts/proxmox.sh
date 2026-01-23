#!/usr/bin/env bash
#
# 🚀 Gestionnaire Proxmox Backend - VERSION CORRIGÉE ✅
# Clone → bash proxmox.sh install → FIN (one-shot)
#
# Utilisation:
#   bash proxmox.sh install     → Installation complète (auto)
#   proxmox start/stop/status   → Gestion services

set -euo pipefail
IFS=$'\n\t'

# ==========================
# CONFIGURATION
# ==========================
SCRIPT_PATH="${BASH_SOURCE[0]}"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
GLOBAL_SCRIPT="/usr/local/bin/proxmox"

# Couleurs
RED="\033[0;31m"; GREEN="\033[0;32m"; YELLOW="\033[1;33m"
BLUE="\033[0;34m"; CYAN="\033[0;36m"; MAGENTA="\033[0;35m"
BOLD="\033[1m"; RESET="\033[0m"

log() { echo -e "${CYAN}[PROXMOX]${RESET} $1"; }
info() { echo -e "${BLUE}--> $1${RESET}"; }
ok() { echo -e "${GREEN}✅ $1${RESET}"; }
warn() { echo -e "${YELLOW}⚠️  $1${RESET}"; }
title() { echo -e "\n${BOLD}🔥 $1 🔥${RESET}\n"; }

# FIX #1: require_root intelligent (skip si déjà root)
require_root() {
  if [[ $EUID -ne 0 ]]; then
    if command -v sudo >/dev/null 2>&1; then
      exec sudo "$0" "$@"
    else
      warn "sudo absent, tentative en root courant..."
    fi
  fi
}

# Config chemins
WORKDIR="/workspace"
PROXMOX_DIR="$WORKDIR/proxmox"
APP_DIR="$PROXMOX_DIR/app"
DOCKER_DIR="$PROXMOX_DIR/docker"
SERVICE_NAME="workspace-proxmox"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
API_PORT=4000
HEALTH_URL="http://localhost:${API_PORT}/api/health"

docker_compose() {
  if command -v docker-compose >/dev/null 2>&1; then docker-compose "$@"
  elif docker compose version >/dev/null 2>&1; then docker compose "$@"
  else echo "docker compose $@"; fi
}

# ==========================
# INSTALLATION ONE-SHOT ✅
# ==========================
cmd_install() {
  title "🚀 INSTALLATION AUTOMATIQUE (One-shot)"
  
  # 1. DNS/Réseau
  info "Correction DNS..."
  echo -e "nameserver 8.8.8.8\nnameserver 1.1.1.1" > /etc/resolv.conf
  
  # 2. Paquets essentiels
  info "Installation Docker/Node..."
  apt-get update -qq
  apt-get install -y -qq docker.io nodejs npm git curl jq net-tools iproute2
  systemctl enable --now docker >/dev/null 2>&1
  
  # 3. Node 20 (si absent)
  if ! node -v | grep -q "v20"; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
    apt-get install -y -qq nodejs >/dev/null 2>&1
  fi
  
  # 4. FIX npm ci → npm install d'abord
  info "Préparation dépendances (fix npm ci)..."
  cd "$WORKDIR/proxmox/app" && rm -rf node_modules package-lock.json
  npm install >/dev/null 2>&1
  cp package-lock.json ..  # Backup pour Docker
  
  # 5. Service systemd
  mkdir -p "$DOCKER_DIR"
  CT_IP=$(hostname -I | awk '{print $1}')
  
  cat > "$DOCKER_DIR/.env" << EOF
NODE_ENV=production
API_PORT=${API_PORT}
LOG_LEVEL=info
SERVER_IP=${CT_IP}
DB_HOST=db
DB_NAME=workspace
DB_USER=workspace
DB_PASSWORD=SECRET_RETIRE
JWT_SECRET=$(openssl rand -hex 32)
ALLOWED_ORIGINS=*
EOF
  
  cat > "$SERVICE_FILE" << EOF
[Unit]
Description=Workspace Proxmox Backend
After=docker.service network.target
Requires=docker.service

[Service]
Type=simple
User=root
WorkingDirectory=${DOCKER_DIR}
ExecStart=$(command -v docker-compose 2>/dev/null || echo "docker compose") up -d
ExecStop=$(command -v docker-compose 2>/dev/null || echo "docker compose") down
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
  
  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME" >/dev/null 2>&1
  
  # 6. Installation commande globale
  cp "$0" "$GLOBAL_SCRIPT" && chmod +x "$GLOBAL_SCRIPT"
  
  # 7. Démarrage auto
  systemctl start "$SERVICE_NAME"
  
  ok "🎉 INSTALLATION TERMINÉE !"
  display_server_info "$CT_IP"
}

# ==========================
# FONCTIONS SERVICES
# ==========================
cmd_start() { require_root; systemctl start "$SERVICE_NAME" && wait_health && display_server_info "$(hostname -I | awk '{print $1}')"; }
cmd_stop() { require_root; systemctl stop "$SERVICE_NAME" && ok "Arrêté ✅"; }
cmd_restart() { require_root; systemctl restart "$SERVICE_NAME" && wait_health && ok "Redémarré ✅"; }

wait_health() {
  info "Attente API... (30s max)"
  for i in {1..30}; do sleep 1 && curl -fsS --max-time 2 "$HEALTH_URL" >/dev/null 2>&1 && { ok "API prête !"; return 0; }; done
  warn "API lente au démarrage"
}

cmd_status() { display_server_info "$(hostname -I | awk '{print $1}')"; }
cmd_logs() { journalctl -u "$SERVICE_NAME" -f -o cat; }

cmd_rebuild() {
  require_root
  title "🔄 REBUILD COMPLET"
  
  systemctl stop "$SERVICE_NAME" 2>/dev/null || true
  cd "$APP_DIR" && rm -rf node_modules dist package-lock.json
  npm install && npm run build
  
  cd "$DOCKER_DIR"
  docker_compose down -v --rmi all
  docker system prune -af --volumes
  docker_compose build --no-cache
  docker_compose up -d
  
  systemctl restart "$SERVICE_NAME"
  wait_health
  ok "Rebuild terminé !"
}

display_server_info() {
  local ct_ip=$1
  CT_IP=${ct_ip:-$(hostname -I | awk '{print $1}')}
  echo -e "\n${BOLD}${GREEN}🎉 BACKEND PRÊT !${RESET}"
  echo -e "${BOLD}🌐 API:${RESET} ${CYAN}http://${CT_IP}:4000${RESET}"
  echo -e "${BOLD}📊 Health:${RESET} ${CYAN}http://${CT_IP}:4000/api/health${RESET}"
  echo -e "${BOLD}🔌 WS:${RESET} ${CYAN}ws://${CT_IP}:4000/ws${RESET}"
  
  if systemctl is-active "$SERVICE_NAME" >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Service: ACTIF${RESET}"
  else
    echo -e "${YELLOW}⚠️  Service: INACTIF${RESET}"
  fi
  
  if curl -fsS --max-time 3 "$HEALTH_URL" >/dev/null 2>&1; then
    echo -e "${GREEN}✅ API: EN LIGNE${RESET}"
  else
    echo -e "${YELLOW}⚠️  API: HORS LIGNE${RESET}"
  fi
  echo ""
}

show_help() {
  cat << EOF

${BOLD}${MAGENTA}🚀 PROXMOX BACKEND MANAGER${RESET}

${GREEN}🎯 ONE-SHOT:${RESET}
  bash proxmox.sh install

${GREEN}⚙️  SERVICES:${RESET}
  proxmox start      → Démarrer
  proxmox stop       → Arrêter
  proxmox status     → État
  proxmox restart    → Redémarrer
  proxmox logs       → Logs live

${GREEN}🔧 MAINTENANCE:${RESET}
  proxmox rebuild    → Reconstruction totale
EOF
}

# ==========================
# EXÉCUTION
# ==========================
case "${1:-help}" in
  install) cmd_install ;;
  start|up|on) cmd_start ;;
  stop|down|off) cmd_stop ;;
  restart) cmd_restart ;;
  status|st) cmd_status ;;
  logs|log) cmd_logs ;;
  rebuild|build) cmd_rebuild ;;
  help|-h|--help) show_help ;;
  *) show_help; exit 1 ;;
esac
