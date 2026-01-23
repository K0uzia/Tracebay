#!/usr/bin/env bash
#
# Proxmox Backend — Gestionnaire Unifié (CT Proxmox)
# Self-Update + Rebuild propre

set -euo pipefail
IFS=$'\n\t'

# ==========================
# Self-Update intelligent
# ==========================
SCRIPT_PATH="${BASH_SOURCE[0]}"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
GLOBAL_SCRIPT="/usr/local/bin/proxmox"
GITHUB_URL="https://raw.githubusercontent.com/SandersonnDev/workspace/proxmox/proxmox/scripts/proxmox.sh"
TMP_SCRIPT="/tmp/proxmox-update.sh"

if [[ "$SCRIPT_PATH" == "$GLOBAL_SCRIPT" && -d /workspace ]]; then
  info "Verification mise a jour..."
  curl -fsSL "$GITHUB_URL" -o "$TMP_SCRIPT" 2>/dev/null || true
  if [[ -f "$TMP_SCRIPT" && $(diff "$SCRIPT_PATH" "$TMP_SCRIPT" >/dev/null 2>&1; echo $?) -ne 0 ]]; then
    cp "$TMP_SCRIPT" "$SCRIPT_PATH" && chmod +x "$SCRIPT_PATH"
    ok "Script mis a jour ! Re-lancement..."
    exec "$SCRIPT_PATH" "$@"
  fi
  rm -f "$TMP_SCRIPT"
fi

# ==========================
# Couleurs & Helpers UI
# ==========================
RED="\033[0;31m"; GREEN="\033[0;32m"; YELLOW="\033[1;33m"
BLUE="\033[0;34m"; CYAN="\033[0;36m"; BOLD="\033[1m"; RESET="\033[0m"

log() { echo -e "${CYAN}[$(date '+%H:%M:%S')]${RESET} $*"; }
info() { echo -e "${BLUE}➜${RESET} $*"; }
ok() { echo -e "${GREEN}✔${RESET} $*"; }
warn() { echo -e "${YELLOW}⚠${RESET} $*"; }
err() { echo -e "${RED}✖${RESET} $*"; }
title() { echo -e "\n${BOLD}$*${RESET}"; }

require_root() {
  if [[ $EUID -ne 0 ]]; then
    err "Necessite les droits root. Utilisez sudo."
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
  echo -e "${BOLD}║${RESET} Informations Serveur                                                  ${BOLD}║${RESET}"
  echo -e "${BOLD}├────────────────────────────────────────────────────────────────────────────┤${RESET}"
  printf "${BOLD}║${RESET}  %-30s │  ${CYAN}%-41s${RESET}  ${BOLD}║${RESET}\n" "Adresse IP" "${ct_ip}"
  printf "${BOLD}║${RESET}  %-30s │  ${CYAN}%-41s${RESET}  ${BOLD}║${RESET}\n" "Port" "${API_PORT}"
  echo -e "${BOLD}├────────────────────────────────────────────────────────────────────────────┤${RESET}"
  echo -e "${BOLD}║${RESET} Points d'acces API                                                      ${BOLD}║${RESET}"
  echo -e "${BOLD}├────────────────────────────────────────────────────────────────────────────┤${RESET}"
  printf "${BOLD}║${RESET}  %-30s │  ${CYAN}%-41s${RESET}  ${BOLD}║${RESET}\n" "API HTTP" "http://${ct_ip}:${API_PORT}"
  printf "${BOLD}║${RESET}  %-30s │  ${CYAN}%-41s${RESET}  ${BOLD}║${RESET}\n" "WebSocket" "ws://${ct_ip}:${API_PORT}/ws"
  printf "${BOLD}║${RESET}  %-30s │  ${CYAN}%-41s${RESET}  ${BOLD}║${RESET}\n" "Sante" "http://${ct_ip}:${API_PORT}/api/health"
  echo -e "${BOLD}╚════════════════════════════════════════════════════════════════════════════╝${RESET}"
  echo ""
}

docker_compose() {
  if docker compose version &>/dev/null; then docker compose "$@"
  elif command -v docker-compose &>/dev/null; then docker-compose "$@"
  else err "Docker Compose non trouve"; exit 1; fi
}

# ==========================
# LOGS ULTRA-LISIBLES
# ==========================
cmd_logs() {
  local mode="${1:-}"
  echo ""
  case "$mode" in
    "live")
      info "Logs temps reel - TOUT (HTTP/WS/DB) - Ctrl+C pour arreter"
      echo -e "${BOLD}Format: [HH:MM:SS] METHODE /endpoint -> 200 OK (45ms) IP:client${RESET}"
      journalctl -u "$SERVICE_NAME" -f --no-pager \
        | grep --color=always -E "\[.*(GET|POST|PUT|DELETE|WS|connect|disconnect|error|warn)" \
        || journalctl -u "$SERVICE_NAME" -f --no-pager
      ;;
    "http")
      info "Logs HTTP/ENDPOINTS uniquement (200 dernieres lignes)"
      journalctl -u "$SERVICE_NAME" -n 200 --no-pager \
        | grep --color=always -E "\[.*(GET|POST|PUT|DELETE)" \
        | tail -n 50
      ;;
    "ws")
      info "Logs WEBSOCKET uniquement (100 dernieres lignes)"
      journalctl -u "$SERVICE_NAME" -n 100 --no-pager \
        | grep --color=always -E "\[.*(WS|websocket|connect|disconnect)" \
        | tail -n 30
      ;;
    *)
      info "Logs RECENTS (300 dernieres lignes)"
      journalctl -u "$SERVICE_NAME" -n 300 --no-pager \
        | grep --color=always -E "\[.*(GET|POST|WS|error|warn)" \
        | tail -n 50
      ;;
  esac
  echo ""
}

# ==========================
# INSTALLATION COMPLETE
# ==========================
cmd_install() {
  require_root
  
  title "Proxmox Backend - Installation"
  
  # 1. SYSTEME GLOBAL
  title "1/6 Installation systeme (Docker + Node)"
  apt-get update -y >/dev/null 2>&1
  apt-get install -y docker.io git jq curl ca-certificates gnupg net-tools iproute2 nodejs npm >/dev/null 2>&1
  
  # Docker Compose
  if ! command -v docker-compose &>/dev/null; then
    COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | jq -r .tag_name || echo "v2.24.0")
    curl -L "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    ok "Docker Compose installe"
  fi
  systemctl enable --now docker >/dev/null 2>&1
  ok "Systeme pret"

  # 2. WORKSPACE
  title "2/6 Workspace /workspace/proxmox"
  mkdir -p "$WORKDIR"
  cd "$WORKDIR"
  if [[ ! -d .git ]]; then
    git clone -b proxmox https://github.com/SandersonnDev/workspace.git .
  else
    git checkout proxmox && git pull origin proxmox
  fi
  ok "Depot: $(git rev-parse --abbrev-ref HEAD)"

  # 3. APP BUILD (comme Makefile)
  title "3/6 Build proxmox/app"
  cd "$APP_DIR"
  rm -rf node_modules dist package-lock.json 2>/dev/null || true
  npm install
  npm run build
  mkdir -p "$APP_DIR/logs"
  ok "Build OK -> dist/"

  # 4. DOCKER CONFIG
  title "4/6 Configuration Docker"
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
ALLOWED_ORIGINS=http://localhost:3000,http://${CT_IP}:3000
EOF
  ok ".env cree"

  # 5. SYSTEMD SERVICE
  title "5/6 Service systemd"
  cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Workspace Proxmox Backend API
After=network.target docker.service
Wants=network-online.target
Requires=docker.service

[Service]
Type=simple
User=root
WorkingDirectory=${DOCKER_DIR}
Environment=TERM=screen-256color
ExecStart=/usr/local/bin/docker-compose up
ExecStop=/usr/local/bin/docker-compose down
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=proxmox-backend
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  ok "Service systemd cree"

  # 6. COMMANDE GLOBALE + BUILD
  title "6/6 Commande globale proxmox"
  # COPIE LE SCRIPT ACTUEL VERS /usr/local/bin/
  cp "$SCRIPT_PATH" "$CTRL_SCRIPT"
  chmod +x "$CTRL_SCRIPT"
  ok "Commande 'proxmox' installee -> /usr/local/bin/proxmox"

  title "Build final Docker"
  cd "$DOCKER_DIR"
  docker_compose build --no-cache >/dev/null 2>&1
  ok "Images Docker pretes"

  title "Installation terminée"
  display_server_info "$CT_IP"
  
  echo -e "${BOLD}Commandes disponibles:${RESET}"
  echo "  ${GREEN}proxmox up${RESET}               - Demarrer services"
  echo "  ${GREEN}proxmox logs live${RESET}      - Logs temps reel Node/Express"
  echo "  ${GREEN}proxmox logs http${RESET}      - Logs endpoints uniquement"
  echo "  ${GREEN}proxmox status${RESET}         - Statut avec IPs"
  echo "  ${GREEN}proxmox rebuild${RESET}        - Update Git + rebuild complet"
  echo ""
  warn "Services NON demarres automatiquement"
  info "Exécutez: proxmox up"
}

# ==========================
# REBUILD AGRESSIF (Nettoyage total)
# ==========================
cmd_rebuild() {
  require_root
  title "Rebuild complet - Nettoyage + Update"
  
  info "1. Arret services"
  systemctl stop "$SERVICE_NAME" 2>/dev/null || true
  
  info "2. Nettoyage Docker total"
  cd "$DOCKER_DIR" 2>/dev/null || true
  docker_compose down -v --remove-orphans 2>/dev/null || true
  docker system prune -a -f >/dev/null 2>&1
  docker volume prune -f >/dev/null 2>&1
  docker builder prune -a -f >/dev/null 2>&1
  
  info "3. Nettoyage fichiers"
  rm -rf "$APP_DIR/dist" "$APP_DIR/node_modules" "$APP_DIR/logs"/*.log 2>/dev/null || true
  
  info "4. Git pull"
  cd "$WORKDIR"
  git fetch && git checkout proxmox && git pull origin proxmox
  
  info "5. Rebuild app (Makefile style)"
  cd "$APP_DIR"
  rm -rf node_modules package-lock.json 2>/dev/null || true
  npm install
  npm run build
  
  info "6. Rebuild Docker"
  cd "$DOCKER_DIR"
  docker_compose build --no-cache
  
  info "7. Restart"
  systemctl daemon-reload
  systemctl restart "$SERVICE_NAME"
  sleep 5
  
  ok "Rebuild termine !"
  cmd_status
}

cmd_start() {
  require_root
  info "Demarrage services..."
  systemctl start "$SERVICE_NAME" || { err "Echec demarrage"; exit 1; }
  info "Attente sante API..."
  for i in {1..30}; do
    sleep 2
    if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
      ok "Backend demarre !"
      CT_IP=$(hostname -I | awk '{print $1}')
      display_server_info "$CT_IP"
      return 0
    fi
  done
  warn "Encore en demarrage -> proxmox logs live"
}

cmd_stop() { require_root; info "Arret..."; systemctl stop "$SERVICE_NAME"; ok "Arrete"; }
cmd_restart() { require_root; info "Redemarrage..."; systemctl restart "$SERVICE_NAME"; sleep 5; ok "Redemarre"; }

cmd_status() {
  local ct_ip=$(hostname -I | awk '{print $1}')
  echo -e "${BOLD}Statut Proxmox Backend${RESET}"
  systemctl is-active "$SERVICE_NAME" >/dev/null 2>&1 && echo "  ${GREEN}✔ Service:${RESET} ACTIF" || echo "  ${RED}✖ Service:${RESET} INACTIF"
  curl -fsS "$HEALTH_URL" >/dev/null 2>&1 && echo "  ${GREEN}✔ API:${RESET} EN LIGNE" || echo "  ${RED}✖ API:${RESET} HORS LIGNE"
  echo "  ${CYAN}IP:${RESET} ${ct_ip}:${API_PORT}"
  echo "  ${CYAN}API:${RESET} http://${ct_ip}:${API_PORT}"
  [[ -d "$DOCKER_DIR" ]] && cd "$DOCKER_DIR" && echo -e "\n${BOLD}Conteneurs:${RESET}\n" && docker_compose ps 2>/dev/null || true
}

# SWITCH
COMMAND="${1:-help}"
case "$COMMAND" in
  install) cmd_install ;;
  rebuild|build|update) cmd_rebuild ;;
  up|on|start) cmd_start ;;
  down|off|stop) cmd_stop ;;
  restart) cmd_restart ;;
  status|st) cmd_status ;;
  logs) cmd_logs "${2:-}" ;;
  diag|diagnostic)
    title "Diagnostics"
    command -v docker &>/dev/null && ok "Docker: $(docker --version)" || err "Docker manquant"
    command -v node &>/dev/null && ok "Node: $(node --version)" || err "Node manquant"
    [[ -d "$PROXMOX_DIR" ]] && ok "Proxmox: OK" || err "Proxmox manquant"
    systemctl is-active "$SERVICE_NAME" &>/dev/null && ok "Service: ACTIF" || warn "Service: INACTIF"
    ;;
  help|-h|--help|*)
    cat <<HELP
${BOLD}Proxmox Backend Manager${RESET}

${BOLD}Installation:${RESET}
  sudo bash proxmox.sh install    Installation complete

${BOLD}Services:${RESET}
  proxmox up                      Demarrer
  proxmox down                    Arreter  
  proxmox restart                 Redemarrer
  proxmox status                  Statut + IPs

${BOLD}Logs:${RESET}
  proxmox logs                    Logs recents
  proxmox logs live               Logs temps reel
  proxmox logs http               Endpoints HTTP
  proxmox logs ws                 WebSocket

${BOLD}Maintenance:${RESET}
  proxmox rebuild                 Git pull + rebuild complet
  proxmox diag                    Diagnostics

${BOLD}Usage:${RESET}
  sudo bash proxmox.sh install
  proxmox up
  proxmox status
  proxmox logs live
HELP
    ;;
esac
