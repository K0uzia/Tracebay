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
#   proxmox logs [live]             - Logs Node/Express
#   proxmox diag                    - Diagnostics complets
#   proxmox build                   - Mettre à jour/rebuild
#   proxmox reset-db                - Reset base (ATTENTION)

set -euo pipefail
IFS=$'\n\t'

# ==========================
# Self-Update Check (IDENTIQUE)
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

# UI moderne - Info serveur
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
# Configuration (IDENTIQUE)
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
# Installation IDENTIQUE + français
# ==========================
cmd_install() {
  require_root
  
  title "═══════════════════════════════════════════════"
  title "   Proxmox Backend — Installation"
  title "═══════════════════════════════════════════════"
  
  title "1/8 Vérification réseau & DNS"
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
  
  title "2/8 Installation Docker"
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
  
  title "3/8 Installation Node.js 20 LTS"
  if ! command -v node >/dev/null 2>&1 || [[ $(node -v | sed 's/v//;s/\..*//') -lt 20 ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
    apt-get install -y nodejs >/dev/null 2>&1
  fi
  ok "Node $(node --version), npm $(npm --version)"
  
  title "4/8 Clonage du dépôt (branche proxmox)"
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
  
  title "5/8 Installation des dépendances"
  cd "$APP_DIR"
  info "Installation des dépendances app..."
  npm install || { err "Échec installation dépendances"; exit 1; }
  ok "Dépendances installées"
  
  title "6/8 Build TypeScript"
  cd "$APP_DIR"
  npm run build >/dev/null 2>&1 || { err "Build échoué"; exit 1; }
  ok "Build terminé → dist/"
  
  title "7/8 Configuration (.env + systemd)"
  if [[ ! -f "$DOCKER_DIR/.env" ]]; then
    cat > "$DOCKER_DIR/.env" <<EOF
NODE_ENV=production
API_PORT=${API_PORT}
PORT=${API_PORT}
LOG_LEVEL=debug
DEBUG_MODE=true

SERVER_IP=${CT_IP}
SERVER_HOST=${CT_IP}
WS_PORT=${API_PORT}

DB_HOST=db
DB_PORT=5432
DB_NAME=workspace
DB_USER=workspace
DB_PASSWORD=SECRET_RETIRE
DB_POOL_MIN=2
DB_POOL_MAX=10

JWT_SECRET=change-me-$(openssl rand -hex 16)
ALLOWED_ORIGINS=http://localhost:3000,http://${CT_IP}:3000
EOF
    ok ".env créé"
  else
    ok ".env existe déjà"
  fi
  
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
WorkingDirectory=/workspace/proxmox/docker
ExecStart=${DOCKER_COMPOSE_CMD} up --no-build
ExecStop=${DOCKER_COMPOSE_CMD} down
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=workspace-proxmox

[Install]
WantedBy=multi-user.target
ENDSERVICE
  
  systemctl daemon-reload
  ok "Service systemd créé (non démarré)"
  
  title "8/8 Installation commande 'proxmox'"
  cp "$0" "$CTRL_SCRIPT" 2>/dev/null || cp "$PROXMOX_DIR/scripts/proxmox.sh" "$CTRL_SCRIPT"
  chmod +x "$CTRL_SCRIPT"
  ok "Commande 'proxmox' installée"
  
  title "═══════════════════════════════════════════════"
  title "   Installation Terminée"
  title "═══════════════════════════════════════════════"
  echo ""
  echo -e "${BOLD}IP:${RESET}            ${CT_IP}"
  echo -e "${BOLD}API HTTP:${RESET}      http://${CT_IP}:${API_PORT}"
  echo -e "${BOLD}WebSocket:${RESET}     ws://${CT_IP}:${API_PORT}/ws"
  echo -e "${BOLD}Santé:${RESET}        http://${CT_IP}:${API_PORT}/api/health"
  echo ""
  echo -e "${BOLD}Commandes disponibles:${RESET}"
  echo "  proxmox start      - Démarrer services"
  echo "  proxmox stop       - Arrêter services"
  echo "  proxmox status     - Voir statut"
  echo "  proxmox logs       - Voir logs"
  echo "  proxmox logs live  - Logs temps réel Node/Express"
  echo "  proxmox diag       - Diagnostics"
  echo "  proxmox rebuild    - Mettre à jour/rebuild"
  echo "  proxmox reset-db   - Reset base"
  echo ""
  warn "⚠️  Services NON démarrés automatiquement"
  info "Exécutez 'proxmox start' pour démarrer"
}

# Logs Node/Express améliorés
cmd_logs() {
  local mode="${1:-}"
  if [[ "$mode" == "live" ]]; then
    info "Logs temps réel Node/Express (Ctrl+C pour arrêter)"
    echo "📊 Suivi: requêtes GET/POST, WebSocket, erreurs clients..."
    journalctl -u "$SERVICE_NAME" -f \
      | grep -E "(GET|POST|PUT|DELETE|WS|connect|request|response|error|warn|info)" \
      || journalctl -u "$SERVICE_NAME" -f
  else
    info "Derniers 100 logs"
    journalctl -u "$SERVICE_NAME" -n 100 --no-pager
  fi
}

# Autres fonctions = LOGIQUE IDENTIQUE + français
cmd_start() {
  require_root
  log "Démarrage Proxmox backend..."
  cd "$DOCKER_DIR"
  info "Démarrage service systemd..."
  systemctl start "$SERVICE_NAME" || { err "Échec démarrage service"; exit 1; }
  info "Attente santé services..."
  for i in {1..30}; do
    sleep 2
    if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
      ok "Backend démarré avec succès"
      CT_IP=$(hostname -I | awk '{print $1}')
      display_server_info "$CT_IP"
      return 0
    fi
  done
  warn "Backend encore en démarrage, voir: proxmox logs"
}

cmd_stop() {
  require_root
  log "Arrêt Proxmox backend..."
  systemctl stop "$SERVICE_NAME"
  ok "Backend arrêté"
}

cmd_restart() {
  require_root
  log "Redémarrage Proxmox backend..."
  systemctl restart "$SERVICE_NAME"
  sleep 3
  info "Attente services..."
  for i in {1..30}; do
    if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
      ok "Backend redémarré avec succès"
      return 0
    fi
    sleep 2
  done
  warn "Backend encore en redémarrage"
}

cmd_status() {
  local systemd_status=$(systemctl is-active "$SERVICE_NAME" 2>/dev/null || echo "inactive")
  local ct_ip=$(hostname -I | awk '{print $1}')
  
  echo ""
  echo -e "${BOLD}╔════════════════════════════════════════════════════════════════════════════╗${RESET}"
  echo -e "${BOLD}║${RESET}                   ${CYAN}Rapport Statut Proxmox Backend${RESET}                           ${BOLD}║${RESET}"
  echo -e "${BOLD}╠════════════════════════════════════════════════════════════════════════════╣${RESET}"
  echo -e "${BOLD}║${RESET} Statut Service                                                         ${BOLD}║${RESET}"
  echo -e "${BOLD}├────────────────────────────────────────────────────────────────────────────┤${RESET}"
  
  if [[ "$systemd_status" == "active" ]]; then
    printf "${BOLD}║${RESET}  %-30s │  ${GREEN}%-41s${RESET}  ${BOLD}║${RESET}\n" "Service Systemd" "● ACTIF"
  else
    printf "${BOLD}║${RESET}  %-30s │  ${RED}%-41s${RESET}  ${BOLD}║${RESET}\n" "Service Systemd" "● INACTIF"
  fi
  
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    printf "${BOLD}║${RESET}  %-30s │  ${GREEN}%-41s${RESET}  ${BOLD}║${RESET}\n" "Santé API" "● EN LIGNE"
  else
    printf "${BOLD}║${RESET}  %-30s │  ${RED}%-41s${RESET}  ${BOLD}║${RESET}\n" "Santé API" "● HORS LIGNE"
  fi
  
  echo -e "${BOLD}├────────────────────────────────────────────────────────────────────────────┤${RESET}"
  echo -e "${BOLD}║${RESET} Informations Réseau                                                   ${BOLD}║${RESET}"
  echo -e "${BOLD}├────────────────────────────────────────────────────────────────────────────┤${RESET}"
  printf "${BOLD}║${RESET}  %-30s │  ${CYAN}%-41s${RESET}  ${BOLD}║${RESET}\n" "Adresse IP" "$ct_ip"
  printf "${BOLD}║${RESET}  %-30s │  ${CYAN}%-41s${RESET}  ${BOLD}║${RESET}\n" "Port API" "$API_PORT"
  
  echo -e "${BOLD}├────────────────────────────────────────────────────────────────────────────┤${RESET}"
  echo -e "${BOLD}║${RESET} Points d'accès API                                                      ${BOLD}║${RESET}"
  echo -e "${BOLD}├────────────────────────────────────────────────────────────────────────────┤${RESET}"
  printf "${BOLD}║${RESET}  %-30s │  ${CYAN}%-41s${RESET}  ${BOLD}║${RESET}\n" "API HTTP" "http://${ct_ip}:${API_PORT}"
  printf "${BOLD}║${RESET}  %-30s │  ${CYAN}%-41s${RESET}  ${BOLD}║${RESET}\n" "WebSocket" "ws://${ct_ip}:${API_PORT}/ws"
  printf "${BOLD}║${RESET}  %-30s │  ${CYAN}%-41s${RESET}  ${BOLD}║${RESET}\n" "Santé" "http://${ct_ip}:${API_PORT}/api/health"
  
  echo -e "${BOLD}╚════════════════════════════════════════════════════════════════════════════╝${RESET}"
  echo ""
  
  if command -v docker >/dev/null 2>&1 && [[ -d "$DOCKER_DIR" ]]; then
    echo -e "${BOLD}Conteneurs Docker:${RESET}"
    cd "$DOCKER_DIR"
    docker_compose ps 2>/dev/null | sed 's/^/  /' || true
    echo ""
  fi
}

# Reste des fonctions = ORIGINAL + français uniquement
cmd_diag() {
  title "═══════════════════════════════════════════════"
  title "   Proxmox Backend — Diagnostics"
  title "═══════════════════════════════════════════════"
  echo ""
  
  log "Vérification Docker..."
  command -v docker &> /dev/null && ok "$(docker --version)" || err "Docker non trouvé"
  
  docker_compose version &> /dev/null && ok "$(docker_compose version)" || err "docker_compose ne fonctionne pas"
  
  log "Vérification Node.js..."
  command -v node &> /dev/null && ok "Node $(node --version), npm $(npm --version)" || err "Node.js non trouvé"
  
  log "Vérification dépôt..."
  [[ -d "$WORKDIR/.git" ]] && cd "$WORKDIR" && ok "Dépôt trouvé — branche: $(git rev-parse --abbrev-ref HEAD)" || err "Dépôt non trouvé à $WORKDIR"
  
  log "Vérification structure proxmox..."
  [[ -d "$PROXMOX_DIR" ]] && ok "Dossier proxmox/ trouvé" || err "Dossier proxmox/ non trouvé"
  
  [[ -f "$APP_DIR/package.json" ]] && ok "proxmox/app/package.json trouvé" || err "proxmox/app/package.json non trouvé"
  [[ -d "$APP_DIR/node_modules" ]] && ok "node_modules installé" || warn "node_modules manquant"
  
  [[ -f "$DOCKER_DIR/docker-compose.yml" ]] && ok "proxmox/docker/docker-compose.yml trouvé" || err "docker-compose.yml non trouvé"
  [[ -f "$DOCKER_DIR/.env" ]] && ok "proxmox/docker/.env trouvé" || warn ".env non trouvé"
  
  log "Vérification service systemd..."
  [[ -f "$SERVICE_FILE" ]] && { ok "service systemd installé"; echo "  Statut: $(systemctl is-active "$SERVICE_NAME" 2>/dev/null || echo "inconnu")"; } || warn "service systemd non installé"
  
  log "Vérification ports..."
  netstat -tlnp 2>/dev/null | grep -q ":${API_PORT} " && ok "Port ${API_PORT} ouvert" || warn "Port ${API_PORT} fermé"
  
  log "Vérification conteneurs Docker..."
  docker ps -a 2>/dev/null | grep -q "proxmox" && ok "Conteneurs Proxmox existent" || warn "Aucun conteneur proxmox trouvé"
  docker ps 2>/dev/null | grep -q "proxmox" && ok "Conteneurs en cours d'exécution" || warn "Conteneurs arrêtés"
  
  echo ""
  ok "Diagnostic terminé"
}

cmd_rebuild() {
  require_root
  log "Reconstruction Proxmox backend..."
  cd "$WORKDIR"
  info "Nettoyage cache..."
  cd "$APP_DIR"
  rm -rf dist node_modules/.cache >/dev/null 2>&1
  ok "Cache nettoyé"
  
  info "Récupération dernier code..."
  git fetch && git checkout proxmox && git pull origin proxmox
  ok "Dépôt mis à jour"
  
  info "Installation dépendances..."
  cd "$APP_DIR"
  npm install >/dev/null 2>&1
  ok "Dépendances mises à jour"
  
  info "Build TypeScript..."
  npm run build >/dev/null 2>&1
  ok "Build terminé"
  
  info "Nettoyage Docker..."
  cd "$DOCKER_DIR"
  docker_compose down -v >/dev/null 2>&1 || true
  docker image rm workspace-proxmox >/dev/null 2>&1 || true
  docker image prune -f >/dev/null 2>&1 || true
  ok "Nettoyage Docker terminé"
  
  info "Rebuild images Docker..."
  docker_compose build --no-cache >/dev/null 2>&1
  ok "Images Docker reconstruites"
  
  if systemctl is-active "$SERVICE_NAME" >/dev/null 2>&1; then
    info "Redémarrage services..."
    systemctl restart "$SERVICE_NAME"
    sleep 5
    curl -fsS "$HEALTH_URL" >/dev/null 2>&1 && { ok "Services redémarrés"; CT_IP=$(hostname -I | awk '{print $1}'); display_server_info "$CT_IP"; } || warn "Redémarrage OK mais santé échouée - voir logs"
  else
    warn "Services non lancés — utilisez 'proxmox up'"
  fi
  ok "Rebuild terminé"
}

cmd_reset_db() {
  require_root
  warn "⚠️  Ceci SUPPRIMERA TOUTES les données de la base!"
  read -p "Continuer? [y/N] " -n 1 -r
  echo
  [[ ! $REPLY =~ ^[Yy]$ ]] && { info "Annulé"; exit 0; }
  
  log "Réinitialisation base..."
  cd "$DOCKER_DIR"
  info "Arrêt services..."
  docker_compose down -v
  info "Redémarrage base fraîche..."
  docker_compose up -d
  sleep 5
  ok "Base réinitialisée"
}

# Case SWITCH IDENTIQUE
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
  autorestart)
    case "${2:-status}" in
      enable) cmd_autorestart_enable ;;
      disable) cmd_autorestart_disable ;;
      status|*) cmd_autorestart_status ;;
    esac
    ;;
  help|--help|-h|*)
    cat <<HELP
${BOLD}Gestionnaire Proxmox Backend${RESET}

${BOLD}Installation:${RESET}
  sudo bash proxmox.sh install    Installation complète

${BOLD}Gestion Services:${RESET}
  proxmox up / on / start         Démarrer services
  proxmox down / off / stop       Arrêter services
  proxmox restart                 Redémarrer
  proxmox status / st             Statut avec IPs/endpoints

${BOLD}Maintenance:${RESET}
  proxmox logs [live]             Logs (live = temps réel Node/Express)
  proxmox diag                    Diagnostics complets
  proxmox build                   Mettre à jour/rebuild
  proxmox reset-db                Reset base (ATTENTION)

${BOLD}Configuration:${RESET}
  proxmox autorestart status      Voir politique auto-restart
  proxmox autorestart enable      Activer auto-restart
  proxmox autorestart disable     Désactiver auto-restart

${BOLD}Exemples:${RESET}
  sudo bash proxmox.sh install
  proxmox up
  proxmox status
  proxmox logs live
  proxmox build

${BOLD}Quick Start:${RESET}
  1. sudo bash proxmox.sh install
  2. proxmox up
  3. proxmox status
HELP
    [[ "$COMMAND" != "help" && "$COMMAND" != "--help" && "$COMMAND" != "-h" ]] && exit 1
    exit 0
    ;;
esac
