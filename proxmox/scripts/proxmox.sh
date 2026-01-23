#!/usr/bin/env bash
#
# Proxmox Backend — Gestionnaire Unifié (CT Proxmox)
# Version ANTI-CRASH + installation garantie

set -euo pipefail
IFS=$'\n\t'

# ==========================
# Couleurs & Helpers
# ==========================
RED="\033[0;31m"; GREEN="\033[0;32m"; YELLOW="\033[1;33m"
BLUE="\033[0;34m"; CYAN="\033[0;36m"; BOLD="\033[1m"; RESET="\033[0m"

log() { echo -e "${CYAN}[$(date '+%H:%M:%S')]${RESET} $*"; }
info() { echo -e "${BLUE}➜${RESET} $*"; }
ok() { echo -e "${GREEN}✔${RESET} $*"; }
warn() { echo -e "${YELLOW}⚠${RESET} $*"; }
err() { echo -e "${RED}✖${RESET} $* >&2"; }
title() { echo -e "\n${BOLD}$*${RESET}"; }

require_root() {
  if [[ $EUID -ne 0 ]]; then
    err "Necessite sudo"
    exit 1
  fi
}

# ==========================
# Configuration
# ==========================
WORKDIR="/workspace"
PROXMOX_DIR="$WORKDIR/proxmox"
APP_DIR="$PROXMOX_DIR/app"
DOCKER_DIR="$PROXMOX_DIR/docker"
SERVICE_NAME="workspace-proxmox"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
CTRL_SCRIPT="/usr/local/bin/proxmox"
API_PORT=4000
HEALTH_URL="http://localhost:${API_PORT}/api/health"

display_server_info() {
  local ct_ip=$1
  echo ""
  echo -e "${BOLD}╔════════════════════════════════════════════════════════════════════════════╗${RESET}"
  echo -e "${BOLD}║${RESET}                    ${GREEN}✔ PROXMOX BACKEND - PRET${RESET}                                     ${BOLD}║${RESET}"
  echo -e "${BOLD}╠════════════════════════════════════════════════════════════════════════════╣${RESET}"
  printf "${BOLD}║${RESET}  %-30s │  ${CYAN}%-41s${RESET}  ${BOLD}║${RESET}\n" "IP" "${ct_ip}"
  printf "${BOLD}║${RESET}  %-30s │  ${CYAN}%-41s${RESET}  ${BOLD}║${RESET}\n" "API" "http://${ct_ip}:${API_PORT}"
  printf "${BOLD}║${RESET}  %-30s │  ${CYAN}%-41s${RESET}  ${BOLD}║${RESET}\n" "WS" "ws://${ct_ip}:${API_PORT}/ws"
  echo -e "${BOLD}╚════════════════════════════════════════════════════════════════════════════╝${RESET}"
}

docker_compose() {
  if command -v docker-compose &>/dev/null; then docker-compose "$@"
  elif docker compose version &>/dev/null; then docker compose "$@"
  else echo "Installing docker-compose..." && install_docker_compose; docker-compose "$@"; fi
}

install_docker_compose() {
  COMPOSE_VERSION=$(curl -s --connect-timeout 5 https://api.github.com/repos/docker/compose/releases/latest | jq -r .tag_name || echo "v2.24.0")
  curl -L "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
  chmod +x /usr/local/bin/docker-compose
}

# ==========================
# INSTALLATION ETAPE PAR ETAPE (ANTI-CRASH)
# ==========================
cmd_install() {
  require_root
  
  title "Proxmox Backend - Installation"
  
  # ETAPE 1: DNS + APT (ultra-robuste)
  title "1/7 Systeme de base"
  info "Correction DNS si besoin..."
  if ! ping -c1 8.8.8.8 &>/dev/null; then
    echo "nameserver 8.8.8.8" > /etc/resolv.conf
    echo "nameserver 8.8.4.4" >> /etc/resolv.conf
  fi
  
  info "APT update (progressif)..."
  apt-get update -o Acquire::http::Timeout=10 -o Acquire::ftp::Timeout=10 || true
  apt-get install -y -o Acquire::Retries=3 docker.io git jq curl ca-certificates net-tools iproute2 || true
  systemctl enable docker --now || true
  ok "Systeme OK"

  # ETAPE 2: WORKSPACE
  title "2/7 Workspace /workspace"
  mkdir -p "$WORKDIR"
  cd "$WORKDIR"
  if [[ ! -d .git ]]; then
    git clone -b proxmox https://github.com/SandersonnDev/workspace.git .
    ok "Clone OK"
  else
    git checkout proxmox && git pull origin proxmox
    ok "Update OK: $(git rev-parse --abbrev-ref HEAD)"
  fi

  # ETAPE 3: APP (Makefile style)
  title "3/7 Build proxmox/app"
  cd "$APP_DIR" || { err "APP_DIR $APP_DIR manquant"; exit 1; }
  rm -rf node_modules dist package-lock.json >/dev/null 2>&1 || true
  npm install --no-audit --no-fund || { err "npm install echoue"; exit 1; }
  npm run build || { err "npm run build echoue"; exit 1; }
  mkdir -p logs
  ok "Build OK"

  # ETAPE 4: DOCKER .env
  title "4/7 Docker configuration"
  CT_IP=$(hostname -I | awk '{print $1}')
  cat > "$DOCKER_DIR/.env" <<EOF
NODE_ENV=production
API_PORT=${API_PORT}
LOG_LEVEL=debug
LOG_FORMAT=pretty
DEBUG=proxmox:*,express:*
SERVER_IP=${CT_IP}
DB_HOST=db
DB_NAME=workspace
DB_USER=workspace
DB_PASSWORD=SECRET_RETIRE
JWT_SECRET=$(openssl rand -hex 16)
EOF
  ok ".env OK"

  # ETAPE 5: SYSTEMD
  title "5/7 Service systemd"
  cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Proxmox Backend
After=docker.service network.target
Requires=docker.service

[Service]
Type=simple
User=root
WorkingDirectory=${DOCKER_DIR}
ExecStart=/usr/local/bin/docker-compose up
ExecStop=/usr/local/bin/docker-compose down  
Restart=always
StandardOutput=journal
SyslogIdentifier=proxmox-backend

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  ok "Service OK"

  # ETAPE 6: COMMANDE GLOBALE ✅ CRITIQUE
  title "6/7 Commande proxmox globale"
  SCRIPT_SOURCE="$PWD/../scripts/proxmox.sh"
  if [[ -f "$SCRIPT_SOURCE" ]]; then
    cp "$SCRIPT_SOURCE" "$CTRL_SCRIPT"
    chmod +x "$CTRL_SCRIPT"
    ok "/usr/local/bin/proxmox ✅ INSTALLE"
  else
    err "Script source manquant: $SCRIPT_SOURCE"
    exit 1
  fi

  # ETAPE 7: DOCKER BUILD
  title "7/7 Build Docker"
  cd "$DOCKER_DIR" || { err "DOCKER_DIR manquant"; exit 1; }
  docker_compose build --no-cache >/dev/null 2>&1 || docker_compose build
  ok "Docker OK"

  title "INSTALLATION 100% TERMINEE"
  display_server_info "$CT_IP"
  
  echo -e "${BOLD}TESTEZ:${RESET}"
  echo "  ${GREEN}proxmox status${RESET}"
  echo "  ${GREEN}proxmox up${RESET}"
  echo "  ${GREEN}proxmox logs live${RESET}"
  echo ""
  warn "Services NON demarres - executez: proxmox up"
}

# Autres commandes
cmd_logs() {
  echo ""
  info "Logs (${1:-recent})"
  if [[ "${1:-}" == "live" ]]; then
    journalctl -u "$SERVICE_NAME" -f --no-pager | grep --color=always -E "(GET|POST|WS|error)"
  else
    journalctl -u "$SERVICE_NAME" -n 50 --no-pager | grep --color=always -E "(GET|POST|WS|error)"
  fi
}

cmd_status() {
  local ct_ip=$(hostname -I | awk '{print $1}')
  echo -e "${BOLD}STATUT${RESET}"
  systemctl is-active "$SERVICE_NAME" &>/dev/null && echo "  ${GREEN}✔ Service:${RESET} ACTIF" || echo "  ${RED}✖ Service:${RESET} INACTIF"
  curl -s "$HEALTH_URL" | grep -q ok && echo "  ${GREEN}✔ API:${RESET} OK" || echo "  ${RED}✖ API:${RESET} KO"
  echo "  ${CYAN}URL:${RESET} http://${ct_ip}:${API_PORT}"
}

cmd_start() { require_root; systemctl start "$SERVICE_NAME" && sleep 5 && ok "Demarre" || warn "En demarrage"; }
cmd_stop() { require_root; systemctl stop "$SERVICE_NAME" && ok "Arrete" || true; }
cmd_restart() { require_root; systemctl restart "$SERVICE_NAME" && sleep 5 && ok "Redemarre"; }

cmd_rebuild() {
  require_root
  title "REBUILD (nettoyage + git pull)"
  systemctl stop "$SERVICE_NAME" 2>/dev/null || true
  cd "$WORKDIR" && git pull origin proxmox
  cd "$APP_DIR" && rm -rf node_modules dist && npm install && npm run build
  cd "$DOCKER_DIR" && docker_compose down -v && docker_compose build --no-cache
  systemctl restart "$SERVICE_NAME" && sleep 5
  ok "Rebuild OK"
}

# EXECUTION
COMMAND="${1:-help}"
case "$COMMAND" in
  install) cmd_install ;;
  up|start) cmd_start ;;
  down|stop) cmd_stop ;;
  restart) cmd_restart ;;
  status|st) cmd_status ;;
  logs) cmd_logs "${2:-}" ;;
  rebuild|build) cmd_rebuild ;;
  help|-h|*)
    echo "${BOLD}USAGE:${RESET}
  sudo bash $0 install     → Installation
  proxmox up              → Demarrer  
  proxmox logs live       → Logs temps reel
  proxmox status          → Statut
  proxmox rebuild         → Git pull + rebuild"
    ;;
esac
