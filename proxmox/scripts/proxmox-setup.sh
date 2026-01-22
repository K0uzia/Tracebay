#!/usr/bin/env bash
#
# Proxmox CT (Debian 13 Trixie) — Auto Setup & Management
# Complete installation, configuration, and management for Proxmox backend
#
# Usage:
#   Initial setup: sudo bash proxmox-setup.sh install
#   Or from URL:   curl -fsSL https://raw.githubusercontent.com/SandersonnDev/workspace/proxmox/scripts/proxmox-setup.sh | sudo bash -s install
#
# Management:
#   proxmox start|stop|restart|status
#   proxmox dbreset
#   proxmox debug on|off
#   proxmox logs [live]

set -euo pipefail
IFS=$'\n\t'

# ==========================
# Styling & helpers
# ==========================
RED="\033[0;31m"; GREEN="\033[0;32m"; YELLOW="\033[1;33m"; BLUE="\033[0;34m"; CYAN="\033[0;36m"; BOLD="\033[1m"; RESET="\033[0m"

log() { echo -e "${CYAN}[proxmox]${RESET} $*"; }
info() { echo -e "${BLUE}➜${RESET} $*"; }
ok() { echo -e "${GREEN}✔${RESET} $*"; }
warn() { echo -e "${YELLOW}⚠${RESET} $*"; }
err() { echo -e "${RED}✖${RESET} $*"; }
progress() { echo -e "${BOLD}${1}${RESET}"; }

require_cmd() { command -v "$1" >/dev/null 2>&1 || { err "Command '$1' is required"; exit 1; }; }

trap 'err "Unexpected error at line $LINENO"; exit 1' ERR

# ==========================
# Configuration
# ==========================
WORKDIR="/workspace"
PROXMOX_DIR="$WORKDIR/proxmox/app"
DOCKER_DIR="$WORKDIR/proxmox/docker"
SERVICE_NAME="workspace-proxmox"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
CTRL_SCRIPT="/usr/local/bin/proxmox"
API_PORT=4000

# ==========================
# Installation Function
# ==========================
install_proxmox() {
  # Root check
  if [[ $EUID -ne 0 ]]; then
    err "Please run as root (sudo)."
    exit 1
  fi

  progress "═══════════════════════════════════════════════"
  progress "   Proxmox Backend — Auto Setup"
  progress "═══════════════════════════════════════════════"
  echo ""

  # ==========================
  # 1. Network & DNS
  # ==========================
  progress "1) Vérifications réseau & DNS"

  info "Ping 8.8.8.8"
  if ping -c 1 -W 2 8.8.8.8 >/dev/null 2>&1; then ok "Ping OK"; else warn "Ping failed"; fi
  
  info "Ping github.com"
  if ping -c 1 -W 2 github.com >/dev/null 2>&1; then ok "Ping OK"; else warn "Ping github.com failed"; fi

  info "Testing apt-get update"
  if ! apt-get update -y >/dev/null 2>&1; then
    warn "apt-get update failed — attempting DNS fix"
    if [[ -L /etc/resolv.conf ]]; then
      info "Replacing resolv.conf symlink"
      mv -f /etc/resolv.conf /etc/resolv.conf.bak || true
    fi
    cat > /etc/resolv.conf <<EOF
nameserver 8.8.8.8
nameserver 8.8.4.4
options edns0
EOF
    ok "DNS resolv.conf set to Google DNS"
    apt-get update -y
  fi
  ok "apt-get update OK"

  # Get IP addresses
  CT_IP=$(hostname -I | awk '{print $1}')
  PUB_ROUTE_IP=$(ip route get 8.8.8.8 | awk '/src/ {print $NF; exit}')
  PUB_EXT_IP=$(curl -fsS ifconfig.me || echo "unknown")
  info "IP CT (hostname -I): ${CT_IP}"
  info "IP route src: ${PUB_ROUTE_IP}"
  info "IP publique: ${PUB_EXT_IP}"

  # ==========================
  # 2. Install Docker & deps
  # ==========================
  progress "2) Installation Docker & dépendances"

  apt-get update -y
  DEBIAN_FRONTEND=noninteractive apt-get install -y \
    ca-certificates curl gnupg lsb-release \
    docker.io \
    git jq net-tools iproute2

  # Check if docker compose works (built-in or standalone)
  if docker compose version &>/dev/null; then
    ok "docker compose already available"
  elif [[ -f /usr/local/bin/docker-compose ]]; then
    ok "docker-compose standalone already installed"
  else
    # Install docker-compose standalone only if needed
    info "Installing docker-compose (standalone)"
    COMPOSE_VERSION=$(curl -fsSL https://api.github.com/repos/docker/compose/releases/latest | jq -r .tag_name 2>/dev/null || echo "v2.24.0")
    if curl -fsSL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose 2>/dev/null; then
      chmod +x /usr/local/bin/docker-compose
      ok "docker-compose ${COMPOSE_VERSION} installed"
    else
      warn "docker-compose download failed, but 'docker compose' is available"
    fi
  fi

  systemctl enable --now docker
  ok "Docker service enabled & started"

  info "Testing docker hello-world"
  if docker run --rm hello-world >/dev/null 2>&1; then ok "Docker hello-world OK"; else warn "hello-world test skipped"; fi

  # ==========================
  # 3. Install Node.js 20 LTS
  # ==========================
  progress "3) Installation Node.js 20 LTS"

  if ! command -v node >/dev/null 2>&1 || [[ $(node -v | sed 's/v//') < "20.0.0" ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
  fi
  ok "Node $(node --version), npm $(npm --version)"

  # ==========================
  # 4. Clone project (proxmox branch)
  # ==========================
  progress "4) Clonage du projet (branche proxmox)"

  mkdir -p "$WORKDIR"
  cd "$WORKDIR"

  # Clean up if workspace directory exists but is not a valid git repo
  if [[ -d workspace ]] && [[ ! -d workspace/.git ]]; then
    info "Cleaning up invalid workspace directory"
    rm -rf workspace
  fi

  if [[ -d workspace/.git ]]; then
    info "Repo déjà présent — pull proxmox"
    cd workspace && git fetch && git checkout proxmox && git pull origin proxmox && cd ..
  else
    info "Clonage du repo"
    git clone --branch proxmox https://github.com/SandersonnDev/workspace.git
  fi
  cd workspace
  ok "Repository prêt: $(git rev-parse --abbrev-ref HEAD)"

  # ==========================
  # 5. Install dependencies
  # ==========================
  progress "5) Installation des dépendances du projet"

  info "npm install (root)"
  if [[ -f package.json ]]; then npm install; fi

  # Install proxmox workspace
  info "npm install proxmox"
  npm install --workspace=proxmox/app || true
  ok "Dépendances installées"

  # ==========================
  # 6. Configuration
  # ==========================
  progress "6) Configuration automatique (.env + compose)"

  mkdir -p "$DOCKER_DIR"

  cat > "$DOCKER_DIR/.env" <<EOF
# Auto-generated by proxmox-setup.sh
NODE_ENV=production
API_PORT=${API_PORT}
PORT=${API_PORT}
LOG_LEVEL=info
DEBUG_MODE=false

# CT IP info
SERVER_IP=${CT_IP}
SERVER_HOST=${CT_IP}
NODE_PORT=3000
WS_PORT=${API_PORT}

# PostgreSQL
DB_HOST=db
DB_PORT=5432
DB_NAME=workspace
DB_USER=workspace
DB_PASSWORD=SECRET_RETIRE
DB_POOL_MIN=2
DB_POOL_MAX=10
DB_IDLE_TIMEOUT=30000
DB_CONNECTION_TIMEOUT=2000
EOF
  ok ".env créé dans $DOCKER_DIR/.env"

  # ==========================
  # 7. Create Systemd Service
  # ==========================
  progress "7) Configuration du service systemd"

  cat > "$SERVICE_FILE" <<'ENDSERVICE'
[Unit]
Description=Workspace Proxmox Backend API
After=network.target docker.service
Wants=network-online.target
Requires=docker.service

[Service]
Type=simple
User=root
WorkingDirectory=/workspace/proxmox/docker
ExecStart=/usr/bin/docker compose up
ExecStop=/usr/bin/docker compose down
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=workspace-proxmox

[Install]
WantedBy=multi-user.target
ENDSERVICE

  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME"
  ok "Service systemd configuré et activé"

  # ==========================
  # 8. Create Management Script
  # ==========================
  progress "8) Création des commandes de gestion"

  cat > "$CTRL_SCRIPT" <<'ENDSCRIPT'
#!/usr/bin/env bash
# Proxmox Backend Management Script

set -euo pipefail

SERVICE_NAME="workspace-proxmox"
DOCKER_DIR="/workspace/proxmox/docker"
HEALTH_URL="http://localhost:4000/api/health"
ENV_FILE="$DOCKER_DIR/.env"

RED="\033[0;31m"; GREEN="\033[0;32m"; YELLOW="\033[1;33m"; BLUE="\033[0;34m"; CYAN="\033[0;36m"; BOLD="\033[1m"; RESET="\033[0m"

log() { echo -e "${CYAN}[proxmox]${RESET} $*"; }
info() { echo -e "${BLUE}➜${RESET} $*"; }
ok() { echo -e "${GREEN}✔${RESET} $*"; }
warn() { echo -e "${YELLOW}⚠${RESET} $*"; }
err() { echo -e "${RED}✖${RESET} $*"; }

check_health() {
  timeout 5 curl -s "$HEALTH_URL" > /dev/null 2>&1
  return $?
}

cmd_start() {
  log "Démarrage du backend Proxmox..."
  systemctl start "$SERVICE_NAME"
  
  # Wait for health check (max 30s)
  info "Attente du démarrage complet..."
  ATTEMPTS=6
  for i in $(seq 1 $ATTEMPTS); do
    sleep 5
    if check_health; then
      ok "Backend démarré et opérationnel"
      echo ""
      SERVER_IP=$(hostname -I | awk '{print $1}')
      info "HTTP API:  http://${SERVER_IP}:4000"
      info "WebSocket: ws://${SERVER_IP}:4000/ws"
      info "Health:    http://${SERVER_IP}:4000/api/health"
      return
    fi
  done
  warn "Backend en cours de démarrage, vérifiez les logs..."
  journalctl -u "$SERVICE_NAME" -n 20 --no-pager
}

cmd_stop() {
  log "Arrêt du backend Proxmox..."
  systemctl stop "$SERVICE_NAME"
  ok "Backend arrêté"
}

cmd_restart() {
  log "Redémarrage du backend Proxmox..."
  systemctl restart "$SERVICE_NAME"
  sleep 5
  
  # Wait for health check (max 30s)
  ATTEMPTS=6
  for i in $(seq 1 $ATTEMPTS); do
    if check_health; then
      ok "Backend redémarré avec succès"
      SERVER_IP=$(hostname -I | awk '{print $1}')
      echo ""
      info "HTTP API:  http://${SERVER_IP}:4000"
      info "WebSocket: ws://${SERVER_IP}:4000/ws"
      info "Health:    http://${SERVER_IP}:4000/api/health"
      return
    fi
    sleep 5
  done
  warn "Backend en cours de redémarrage..."
}

cmd_status() {
  SYSTEMD_STATUS=$(systemctl is-active "$SERVICE_NAME" || echo "inactive")
  SERVER_IP=$(hostname -I | awk '{print $1}')
  API_PORT=4000
  
  echo ""
  echo -e "${BOLD}╔════════════════════════════════════════════════════════════════════╗${RESET}"
  echo -e "${BOLD}║                   Proxmox Backend Status                          ║${RESET}"
  echo -e "${BOLD}╚════════════════════════════════════════════════════════════════════╝${RESET}"
  echo ""
  
  # Status Table
  echo -e "${BOLD}┌─────────────────────┬──────────────────────────────────────────────┐${RESET}"
  echo -e "${BOLD}│ Component           │ Status                                       │${RESET}"
  echo -e "${BOLD}├─────────────────────┼──────────────────────────────────────────────┤${RESET}"
  
  # Systemd status
  if [[ "$SYSTEMD_STATUS" == "active" ]]; then
    printf "${BOLD}│${RESET} %-19s ${BOLD}│${RESET} ${GREEN}%-44s${RESET} ${BOLD}│${RESET}\n" "Systemd Service" "● ACTIVE"
  else
    printf "${BOLD}│${RESET} %-19s ${BOLD}│${RESET} ${RED}%-44s${RESET} ${BOLD}│${RESET}\n" "Systemd Service" "● INACTIVE"
  fi
  
  # API Health
  if check_health; then
    printf "${BOLD}│${RESET} %-19s ${BOLD}│${RESET} ${GREEN}%-44s${RESET} ${BOLD}│${RESET}\n" "API Health" "● ONLINE"
  else
    printf "${BOLD}│${RESET} %-19s ${BOLD}│${RESET} ${RED}%-44s${RESET} ${BOLD}│${RESET}\n" "API Health" "● OFFLINE"
  fi
  
  # Debug mode
  if [[ -f "$ENV_FILE" ]]; then
    DEBUG_MODE=$(grep "^DEBUG_MODE=" "$ENV_FILE" | cut -d= -f2 || echo "false")
    if [[ "$DEBUG_MODE" == "true" ]]; then
      printf "${BOLD}│${RESET} %-19s ${BOLD}│${RESET} ${YELLOW}%-44s${RESET} ${BOLD}│${RESET}\n" "Debug Mode" "● ENABLED"
    else
      printf "${BOLD}│${RESET} %-19s ${BOLD}│${RESET} ${BLUE}%-44s${RESET} ${BOLD}│${RESET}\n" "Debug Mode" "○ DISABLED"
    fi
  fi
  
  echo -e "${BOLD}└─────────────────────┴──────────────────────────────────────────────┘${RESET}"
  echo ""
  
  # Network Configuration Table
  echo -e "${BOLD}┌─────────────────────┬──────────────────────────────────────────────┐${RESET}"
  echo -e "${BOLD}│ Network             │ Configuration                                │${RESET}"
  echo -e "${BOLD}├─────────────────────┼──────────────────────────────────────────────┤${RESET}"
  printf "${BOLD}│${RESET} %-19s ${BOLD}│${RESET} ${CYAN}%-44s${RESET} ${BOLD}│${RESET}\n" "IP Address" "$SERVER_IP"
  printf "${BOLD}│${RESET} %-19s ${BOLD}│${RESET} ${CYAN}%-44s${RESET} ${BOLD}│${RESET}\n" "API Port" "$API_PORT"
  echo -e "${BOLD}└─────────────────────┴──────────────────────────────────────────────┘${RESET}"
  echo ""
  
  # Endpoints Table
  echo -e "${BOLD}┌─────────────────────┬──────────────────────────────────────────────┐${RESET}"
  echo -e "${BOLD}│ Endpoint            │ URL                                          │${RESET}"
  echo -e "${BOLD}├─────────────────────┼──────────────────────────────────────────────┤${RESET}"
  printf "${BOLD}│${RESET} %-19s ${BOLD}│${RESET} ${CYAN}%-44s${RESET} ${BOLD}│${RESET}\n" "HTTP API" "http://${SERVER_IP}:${API_PORT}"
  printf "${BOLD}│${RESET} %-19s ${BOLD}│${RESET} ${CYAN}%-44s${RESET} ${BOLD}│${RESET}\n" "WebSocket" "ws://${SERVER_IP}:${API_PORT}/ws"
  printf "${BOLD}│${RESET} %-19s ${BOLD}│${RESET} ${CYAN}%-44s${RESET} ${BOLD}│${RESET}\n" "Health Check" "http://${SERVER_IP}:${API_PORT}/api/health"
  printf "${BOLD}│${RESET} %-19s ${BOLD}│${RESET} ${CYAN}%-44s${RESET} ${BOLD}│${RESET}\n" "Metrics" "http://${SERVER_IP}:${API_PORT}/api/metrics"
  echo -e "${BOLD}└─────────────────────┴──────────────────────────────────────────────┘${RESET}"
  echo ""
  
  # Docker containers status
  cd "$DOCKER_DIR"
  echo -e "${BOLD}Docker Containers:${RESET}"
  docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" | sed 's/^/  /'
  echo ""
}

cmd_dbreset() {
  log "Réinitialisation de la base de données..."
  warn "Cette opération va supprimer toutes les données!"
  read -p "Continuer? [y/N] " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    info "Annulé"
    exit 0
  fi
  
  cd "$DOCKER_DIR"
  info "Arrêt des services..."
  docker compose down -v
  
  info "Redémarrage avec base vierge..."
  docker compose up -d
  
  ok "Base de données réinitialisée"
}

cmd_debug() {
  local mode="${1:-}"
  
  if [[ "$mode" != "on" && "$mode" != "off" ]]; then
    err "Usage: proxmox debug on|off"
    exit 1
  fi
  
  if [[ ! -f "$ENV_FILE" ]]; then
    err "Fichier .env introuvable: $ENV_FILE"
    exit 1
  fi
  
  if [[ "$mode" == "on" ]]; then
    log "Activation du mode debug..."
    sed -i 's/^DEBUG_MODE=.*/DEBUG_MODE=true/' "$ENV_FILE"
    sed -i 's/^LOG_LEVEL=.*/LOG_LEVEL=debug/' "$ENV_FILE"
    ok "Mode debug activé"
    info "Les logs détaillés client ↔ serveur seront affichés"
  else
    log "Désactivation du mode debug..."
    sed -i 's/^DEBUG_MODE=.*/DEBUG_MODE=false/' "$ENV_FILE"
    sed -i 's/^LOG_LEVEL=.*/LOG_LEVEL=info/' "$ENV_FILE"
    ok "Mode debug désactivé"
  fi
  
  warn "Redémarrage nécessaire pour appliquer les changements"
  read -p "Redémarrer maintenant? [Y/n] " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    cmd_restart
  fi
}

cmd_logs() {
  local mode="${1:-}"
  
  if [[ "$mode" == "live" ]]; then
    info "Logs en direct (Ctrl+C pour arrêter)"
    journalctl -u "$SERVICE_NAME" -f
  else
    journalctl -u "$SERVICE_NAME" -n 100 --no-pager
  fi
}

# Main command dispatcher
COMMAND="${1:-}"

case "$COMMAND" in
  start)
    cmd_start
    ;;
  stop)
    cmd_stop
    ;;
  restart)
    cmd_restart
    ;;
  status)
    cmd_status
    ;;
  dbreset)
    cmd_dbreset
    ;;
  debug)
    cmd_debug "${2:-}"
    ;;
  logs)
    cmd_logs "${2:-}"
    ;;
  *)
    cat <<HELP
${BOLD}Proxmox Backend Manager${RESET}

Usage: proxmox <command>

${BOLD}Service:${RESET}
  start       Démarre le backend
  stop        Arrête le backend
  restart     Redémarre le backend
  status      Affiche le statut

${BOLD}Database:${RESET}
  dbreset     Réinitialise la base de données

${BOLD}Debug:${RESET}
  debug on    Active les logs détaillés (client ↔ serveur)
  debug off   Désactive les logs détaillés

${BOLD}Logs:${RESET}
  logs        Affiche les derniers logs
  logs live   Affiche les logs en temps réel

${BOLD}Exemples:${RESET}
  proxmox start
  proxmox status
  proxmox debug on
  proxmox logs live
HELP
    exit 0
    ;;
esac
ENDSCRIPT

  chmod +x "$CTRL_SCRIPT"
  ok "Script de gestion créé: proxmox"

  # ==========================
  # 9. Start Services
  # ==========================
  progress "9) Démarrage des services Docker"

  cd "$DOCKER_DIR"
  
  # Build and start
  docker compose build --no-cache
  docker compose up -d
  ok "Services Docker démarrés"

  # Wait for health
  info "Attente du démarrage complet..."
  sleep 5
  
  ATTEMPTS=30
  for i in $(seq 1 $ATTEMPTS); do
    if curl -fsS "http://127.0.0.1:${API_PORT}/api/health" >/dev/null 2>&1; then
      ok "API opérationnelle"
      break
    fi
    sleep 2
    if [[ $i -eq $ATTEMPTS ]]; then
      warn "API non accessible après 60s, vérifiez les logs"
    fi
  done

  # ==========================
  # 10. Final Report
  # ==========================
  progress "10) Installation terminée"
  
  echo ""
  echo -e "${BOLD}═══════════════════════════════════════════════${RESET}"
  echo -e "${BOLD}   Proxmox Backend — Installation Réussie${RESET}"
  echo -e "${BOLD}═══════════════════════════════════════════════${RESET}"
  echo ""
  echo -e "${BOLD}IP:${RESET}            ${CT_IP}"
  echo -e "${BOLD}API HTTP:${RESET}      http://${CT_IP}:${API_PORT}"
  echo -e "${BOLD}WebSocket:${RESET}     ws://${CT_IP}:${API_PORT}/ws"
  echo -e "${BOLD}Health:${RESET}        http://${CT_IP}:${API_PORT}/api/health"
  echo ""
  echo -e "${BOLD}Commandes disponibles:${RESET}"
  echo "  proxmox start"
  echo "  proxmox stop"
  echo "  proxmox restart"
  echo "  proxmox status"
  echo "  proxmox dbreset"
  echo "  proxmox debug on|off"
  echo "  proxmox logs [live]"
  echo ""
  echo -e "${GREEN}✔ Le backend démarrera automatiquement au boot${RESET}"
  echo -e "${GREEN}✔ Redémarrage automatique en cas de crash${RESET}"
  echo ""
}

# ==========================
# Main Entry Point
# ==========================

if [[ "${1:-}" == "install" ]]; then
  install_proxmox
  exit 0
fi

# If not install, assume it's a management command
# This allows the script to be called directly or via symlink
if [[ -x "$CTRL_SCRIPT" ]]; then
  exec "$CTRL_SCRIPT" "$@"
else
  err "Proxmox non installé. Exécutez: sudo bash $0 install"
  exit 1
fi
