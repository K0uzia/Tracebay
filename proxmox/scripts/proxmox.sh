#!/usr/bin/env bash
#
# Proxmox Backend — Gestionnaire Unifié
# Installation, gestion et diagnostics en un seul script
#
# Usage:
#   sudo bash proxmox.sh install    - Installation initiale
#   proxmox up/on                   - Démarrer services
#   proxmox down/off                - Arrêter services
#   proxmox status                  - Statut avec IPs
#   proxmox restart                 - Redémarrer services
#   proxmox logs [live|http|ws|db] - Logs détaillés Node/Express/WS
#   proxmox diag                    - Diagnostics complets
#   proxmox build                   - Mettre à jour/rebuild
#   proxmox reset-db                - Reset base (ATTENTION)

set -euo pipefail
IFS=$'\n\t'

# ==========================
# Self-Update Check
# ==========================
SCRIPT_PATH="${BASH_SOURCE[0]}"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
GLOBAL_SCRIPT="/usr/local/bin/proxmox"
GITHUB_RAW="https://raw.githubusercontent.com/SandersonnDev/workspace/proxmox/proxmox/scripts/proxmox.sh"

if [[ "$SCRIPT_PATH" == "$GLOBAL_SCRIPT" && -d /workspace ]]; then
  SCRIPT_PATH="/workspace/proxmox/scripts/proxmox.sh"
  if [[ -f "$SCRIPT_PATH" ]]; then
    exec bash "$SCRIPT_PATH" "$@"
  fi
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
    err "Nécessite les droits root. Utilisez sudo."
    exit 1
  fi
}

display_server_info() {
  local ct_ip=$1
  echo ""
  echo -e "${BOLD}╔════════════════════════════════════════════════════════════════════════════╗${RESET}"
  echo -e "${BOLD}║${RESET}                    ${GREEN}✅ PROXMOX BACKEND - PRÊT${RESET}                                     ${BOLD}║${RESET}"
  echo -e "${BOLD}╠════════════════════════════════════════════════════════════════════════════╣${RESET}"
  echo -e "${BOLD}║${RESET} Informations Serveur                                                  ${BOLD}║${RESET}"
  echo -e "${BOLD}├────────────────────────────────────────────────────────────────────────────┤${RESET}"
  printf "${BOLD}║${RESET}  %-30s │  ${CYAN}%-41s${RESET}  ${BOLD}║${RESET}\n" "Adresse IP" "${ct_ip}"
  printf "${BOLD}║${RESET}  %-30s │  ${CYAN}%-41s${RESET}  ${BOLD}║${RESET}\n" "Port" "${API_PORT}"
  echo -e "${BOLD}├────────────────────────────────────────────────────────────────────────────┤${RESET}"
  echo -e "${BOLD}║${RESET} Points d'accès API                                                      ${BOLD}║${RESET}"
  echo -e "${BOLD}├────────────────────────────────────────────────────────────────────────────┤${RESET}"
  printf "${BOLD}║${RESET}  %-30s │  ${CYAN}%-41s${RESET}  ${BOLD}║${RESET}\n" "API HTTP" "http://${ct_ip}:${API_PORT}"
  printf "${BOLD}║${RESET}  %-30s │  ${CYAN}%-41s${RESET}  ${BOLD}║${RESET}\n" "WebSocket" "ws://${ct_ip}:${API_PORT}/ws"
  printf "${BOLD}║${RESET}  %-30s │  ${CYAN}%-41s${RESET}  ${BOLD}║${RESET}\n" "Santé" "http://${ct_ip}:${API_PORT}/api/health"
  echo -e "${BOLD}╚════════════════════════════════════════════════════════════════════════════╝${RESET}"
  echo ""
}

docker_compose() {
  if docker compose version &>/dev/null; then
    docker compose "$@"
  elif command -v docker-compose &>/dev/null; then
    docker-compose "$@"
  else
    err "Docker Compose non trouvé"
    exit 1
  fi
}

# ==========================
# Configuration (ARCHI RESPECTÉE)
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

# ==========================
# LOGS ULTRA-LISIBLES 👇 NOUVEAU
# ==========================
cmd_logs() {
  local mode="${1:-}"
  echo ""
  
  case "$mode" in
    "live")
      info "🔴 LOGS TEMPS RÉEL - TOUT (HTTP/WS/DB) - Ctrl+C pour arrêter"
      echo -e "${BOLD}Format: [HH:MM:SS] MÉTHODE /endpoint → 200 OK (45ms) IP:client${RESET}"
      echo ""
      journalctl -u "$SERVICE_NAME" -f --no-pager \
        | grep --color=always -E "\[.*(GET|POST|PUT|DELETE|WS|connect|disconnect|error|warn)" \
        || journalctl -u "$SERVICE_NAME" -f --no-pager
      ;;
    "http")
      info "🌐 LOGS HTTP/ENDPOINTS uniquement (200 dernières lignes)"
      journalctl -u "$SERVICE_NAME" -n 200 --no-pager \
        | grep --color=always -E "\[.*(GET|POST|PUT|DELETE)" \
        | tail -n 50
      ;;
    "ws")
      info "⚡ LOGS WEBSOCKET uniquement (100 dernières lignes)"
      journalctl -u "$SERVICE_NAME" -n 100 --no-pager \
        | grep --color=always -E "\[.*(WS|websocket|connect|disconnect)" \
        | tail -n 30
      ;;
    "db")
      info "🗄️  LOGS DATABASE uniquement (50 dernières lignes)"
      docker logs $(docker ps -q --filter name=proxmox_db_*) 2>&1 | tail -n 50
      ;;
    *)
      info "📋 LOGS RÉCENTS (300 dernières lignes) - Usage: logs [live|http|ws|db]"
      journalctl -u "$SERVICE_NAME" -n 300 --no-pager \
        | grep --color=always -E "\[.*(GET|POST|WS|error|warn)" \
        | tail -n 50
      ;;
  esac
  echo ""
}

# ==========================
# Installation (ARCHI RESPECTÉE + LOGS)
# ==========================
cmd_install() {
  require_root
  
  title "═══════════════════════════════════════════════"
  title "   Proxmox Backend — Installation"
  title "═══════════════════════════════════════════════"
  
  title "1/9 Vérification réseau & DNS"
  if ping -c 1 -W 2 8.8.8.8 >/dev/null 2>&1; then 
    ok "Ping 8.8.8.8 OK"
  else 
    warn "Ping 8.8.8.8 échoué"
  fi
  
  if ! apt-get update -y >/dev/null 2>&1; then
    warn "apt-get update échoué — correction DNS"
    [[ -L /etc/resolv.conf ]] && mv -f /etc/resolv.conf /etc/resolv.conf.bak
    cat > /etc/resolv.conf <<EOF
nameserver 8.8.8.8
nameserver 8.8.4.4
EOF
    apt-get update -y
  fi
  ok "apt-get update OK"
  
  CT_IP=$(hostname -I | awk '{print $1}')
  info "IP CT: ${CT_IP}"
  
  title "2/9 Installation Docker"
  apt-get install -y ca-certificates curl gnupg docker.io git jq net-tools iproute2 >/dev/null 2>&1
  
  if docker_compose version &>/dev/null; then
    ok "docker_compose disponible"
  elif [[ -f /usr/local/bin/docker-compose ]]; then
    ok "docker-compose standalone disponible"
  else
    info "Installation docker-compose standalone"
    COMPOSE_VERSION=$(curl -fsSL https://api.github.com/repos/docker/compose/releases/latest | jq -r .tag_name 2>/dev/null || echo "v2.24.0")
    curl -fsSL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" \
      -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    ok "docker-compose installé"
  fi
  
  systemctl enable --now docker >/dev/null 2>&1
  ok "Docker activé & démarré"
  
  title "3/9 Installation Node.js 20 LTS"
  if ! command -v node >/dev/null 2>&1 || [[ $(node -v | sed 's/v//;s/\..*//') -lt 20 ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
    apt-get install -y nodejs >/dev/null 2>&1
  fi
  ok "Node $(node --version), npm $(npm --version)"
  
  title "4/9 Clonage du dépôt (branche proxmox)"
  mkdir -p "$WORKDIR"
  cd "$WORKDIR"
  
  if [[ -d .git ]]; then
    info "Dépôt existant — mise à jour"
    git fetch && git checkout proxmox && git pull origin proxmox
  else
    info "Clonage du dépôt"
    git clone --branch proxmox https://github.com/SandersonnDev/workspace.git .
  fi
  ok "Dépôt prêt: $(git rev-parse --abbrev-ref HEAD)"
  
  title "5/9 Installation dépendances APP"
  cd "$APP_DIR"
  npm install >/dev/null 2>&1 || { err "Échec installation dépendances"; exit 1; }
  ok "Dépendances installées → proxmox/app/"
  
  title "6/9 Build TypeScript"
  cd "$APP_DIR"
  npm run build >/dev/null 2>&1 || { err "Build échoué"; exit 1; }
  ok "Build terminé → proxmox/app/dist/"
  
  title "7/9 🚀 CONFIGURATION LOGS AVANCÉE"
  # Création dossier logs + rotation
  mkdir -p "$APP_DIR/logs"
  cat > "$APP_DIR/logs/rotate.sh" <<'EOF'
#!/bin/bash
find /workspace/proxmox/app/logs -name "*.log" -mtime +7 -delete
EOF
  chmod +x "$APP_DIR/logs/rotate.sh"
  
  # Configuration .env OPTIMISÉE pour les logs
  if [[ ! -f "$DOCKER_DIR/.env" ]]; then
    cat > "$DOCKER_DIR/.env" <<EOF
# 🚀 PROXMOX BACKEND CONFIGURATION
NODE_ENV=production
API_PORT=${API_PORT}
PORT=${API_PORT}

# 📊 LOGS ULTRA-DÉTAILLÉS
LOG_LEVEL=debug
LOG_FORMAT=pretty
LOG_COLOR=true
DEBUG=proxmox:*,express:*,ws:*

# Serveur
SERVER_IP=${CT_IP}
SERVER_HOST=${CT_IP}
WS_PORT=${API_PORT}

# Base de données
DB_HOST=db
DB_PORT=5432
DB_NAME=workspace
DB_USER=workspace
DB_PASSWORD=SECRET_RETIRE
DB_POOL_MIN=2
DB_POOL_MAX=10

# Sécurité
JWT_SECRET=change-me-$(openssl rand -hex 16)
ALLOWED_ORIGINS=http://localhost:3000,http://${CT_IP}:3000

# Logs fichiers (optionnel)
LOG_DIR=/app/logs
EOF
    ok ".env créé avec LOGS optimisés"
  else
    ok ".env existe (logs déjà configurés)"
  fi
  
  title "8/9 Service systemd + Logs journalctl"
  if docker compose version &>/dev/null 2>&1; then
    DOCKER_COMPOSE_CMD="/usr/bin/docker compose"
  elif command -v docker-compose &>/dev/null; then
    DOCKER_COMPOSE_CMD="$(command -v docker-compose)"
  else
    err "Docker Compose non trouvé"
    exit 1
  fi
  
  cat > "$SERVICE_FILE" <<ENDSERVICE
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
ExecStart=${DOCKER_COMPOSE_CMD} up
ExecStop=${DOCKER_COMPOSE_CMD} down
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=proxmox-backend
# Logs détaillés
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
ENDSERVICE
  
  systemctl daemon-reload
  ok "Service systemd avec LOGS journalctl"
  
  title "9/9 Installation commande 'proxmox'"
  cp "$0" "$CTRL_SCRIPT"
  chmod +x "$CTRL_SCRIPT"
  ok "Commande 'proxmox' installée"
  
  title "10/10 🚀 Build final Docker"
  cd "$DOCKER_DIR"
  docker_compose build --no-cache
  ok "✅ Images Docker prêtes avec logs optimisés !"
  
  title "═══════════════════════════════════════════════"
  title "   🎉 Installation 100% Terminée"
  title "═══════════════════════════════════════════════"
  display_server_info "$CT_IP"
  
  echo -e "${BOLD}🚀 NOUVELLES COMMANDES LOGS:${RESET}"
  echo "  ${GREEN}proxmox logs live${RESET}     → Logs temps réel (HTTP/WS)"
  echo "  ${GREEN}proxmox logs http${RESET}    → Endpoints HTTP uniquement"
  echo "  ${GREEN}proxmox logs ws${RESET}      → WebSocket uniquement"
  echo "  ${GREEN}proxmox logs db${RESET}      → Base PostgreSQL"
  echo ""
  warn "⚠️  Services NON démarrés automatiquement"
  info "Exécutez: proxmox up"
}

# Reste des fonctions (identiques + français)
cmd_start() {
  require_root
  log "🚀 Démarrage Proxmox Backend..."
  cd "$DOCKER_DIR"
  systemctl start "$SERVICE_NAME" || { err "Échec démarrage"; exit 1; }
  
  info "⏳ Attente santé API..."
  for i in {1..30}; do
    sleep 2
    if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
      ok "✅ Backend en ligne !"
      CT_IP=$(hostname -I | awk '{print $1}')
      display_server_info "$CT_IP"
      return 0
    fi
  done
  warn "⏳ Encore en démarrage → proxmox logs live"
}

cmd_stop() { require_root; log "🛑 Arrêt..."; systemctl stop "$SERVICE_NAME"; ok "Arrêté"; }
cmd_restart() { require_root; log "🔄 Redémarrage..."; systemctl restart "$SERVICE_NAME"; sleep 5; ok "Redémarré"; }
cmd_status() { local ct_ip=$(hostname -I | awk '{print $1}'); display_server_info "$ct_ip"; docker_compose ps; }

cmd_diag() {
  title "🔍 Diagnostics Proxmox Backend"
  log "Docker: $(docker --version 2>/dev/null || echo '❌')"
  log "Node: $(node --version 2>/dev/null || echo '❌')"
  log "Dépôt: $(cd "$WORKDIR" && git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '❌')"
  [[ -d "$APP_DIR/dist" ]] && ok "Build OK" || warn "Build manquant"
  systemctl is-active "$SERVICE_NAME" &>/dev/null && ok "Service actif" || warn "Service inactif"
}

cmd_rebuild() {
  require_root
  cd "$WORKDIR"
  git pull origin proxmox
  cd "$APP_DIR" && npm install && npm run build
  cd "$DOCKER_DIR" && docker_compose build --no-cache
  systemctl restart "$SERVICE_NAME"
  ok "Rebuild terminé"
}

cmd_reset_db() {
  require_root
  warn "⚠️  SUPPRESSION BASE DONNÉES !"
  read -p "Confirmer? [y/N] " -n 1 -r && [[ $REPLY =~ ^[Yy]$ ]] || exit 0
  cd "$DOCKER_DIR" && docker_compose down -v && docker_compose up -d db
  ok "Base réinitialisée"
}

# SWITCH
COMMAND="${1:-help}"
case "$COMMAND" in
  install) cmd_install ;;
  up|on|start) cmd_start ;;
  down|off|stop) cmd_stop ;;
  restart) cmd_restart ;;
  status|st) cmd_status ;;
  logs) cmd_logs "${2:-}" ;;
  diag|diagnostic) cmd_diag ;;
  build|rebuild) cmd_rebuild ;;
  reset-db|resetdb) cmd_reset_db ;;
  help|-h|--help|*)
    echo "${BOLD}Proxmox Backend Manager${RESET}
${GREEN}sudo bash proxmox.sh install${RESET}    → Installation complète
${GREEN}proxmox up${RESET}                   → Démarrer
${GREEN}proxmox logs live${RESET}            → 🔥 Logs temps réel détaillés
${GREEN}proxmox logs http${RESET}            → Endpoints HTTP
${GREEN}proxmox logs ws${RESET}              → WebSocket uniquement
${GREEN}proxmox status${RESET}               → Statut + IPs"
    ;;
esac
