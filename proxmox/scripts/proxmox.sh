#!/usr/bin/env bash
#
# 🚀 Gestionnaire Proxmox Backend - Version Française Optimisée
# Script unifié pour installation, gestion et diagnostics
#
# Utilisation:
#   sudo bash proxmox.sh install    - Installation complète
#   proxmox up/on/start            - Démarrer les services
#   proxmox down/off/stop          - Arrêter les services
#   proxmox status                 - Afficher l'état
#   proxmox restart                - Redémarrer
#   proxmox logs [live]            - Voir les logs
#   proxmox diag                   - Diagnostics complets
#   proxmox rebuild                - Reconstruction complète
#   proxmox reset-db               - Reset base de données

set -euo pipefail
IFS=$'\n\t'

# ==========================
# Configuration initiale
# ==========================
SCRIPT_PATH="${BASH_SOURCE[0]}"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
GLOBAL_SCRIPT="/usr/local/bin/proxmox"

# Forcer le support ANSI dans le terminal
export TERM=xterm-256color
export LC_ALL=C.UTF-8

# ==========================
# Couleurs et affichage optimisé
# ==========================
RED="\033[0;31m"; GREEN="\033[0;32m"; YELLOW="\033[1;33m"
BLUE="\033[0;34m"; CYAN="\033[0;36m"; MAGENTA="\033[0;35m"
BOLD="\033[1m"; UNDERLINE="\033[4m"; RESET="\033[0m"

# Symboles ASCII simples (compatibles tous terminaux)
ARROW="-->"; CHECK=" OK "; WARN=" ! "; ERROR="✘"; SPINNER="⏳"

log() { echo -e "${CYAN}[PROXMOX]${RESET} $1"; }
info() { echo -e "${BLUE}${ARROW}${RESET} $1"; }
ok() { echo -e "${GREEN}${CHECK}${RESET} $1"; }
warn() { echo -e "${YELLOW}${WARN}${RESET} $1"; }
err() { echo -e "${RED}${ERROR}${RESET} $1"; }
title() { echo -e "\n${BOLD}═${MAGENTA} $1 ${BOLD}═${RESET}\n"; }

require_root() {
  [[ $EUID -ne 0 ]] && { err "❌ Commande réservée root (utilisez sudo)"; exit 1; }
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

# Détection Docker Compose
docker_compose() {
  if command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  elif docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  else
    err "❌ Docker Compose non trouvé"
    exit 1
  fi
}

# ==========================
# AFFICHAGE SERVEUR - Version FR
# ==========================
display_server_info() {
  local ct_ip=$1
  clear
  cat << EOF
${BOLD}${MAGENTA}╔════════════════════════════════════════════════════════════════════════════╗${RESET}
${BOLD}${MAGENTA}║${RESET}                    ${GREEN}✅ BACKEND PROXMOX - PRÊT${RESET}                          ${BOLD}${MAGENTA}║${RESET}
${BOLD}${MAGENTA}╠════════════════════════════════════════════════════════════════════════════╣${RESET}
${BOLD}${MAGENTA}║${RESET} Informations Serveur                                               ${BOLD}${MAGENTA}║${RESET}
${BOLD}${MAGENTA}╠════════════════════════════════════════════════════════════════════════════╣${RESET}
${BOLD}${MAGENTA}║${RESET}  Adresse IP          ${CYAN}|${RESET}  ${BOLD}${ct_ip}${RESET}                           ${BOLD}${MAGENTA}║${RESET}
${BOLD}${MAGENTA}║${RESET}  Port API            ${CYAN}|${RESET}  ${BOLD}${API_PORT}${RESET}                              ${BOLD}${MAGENTA}║${RESET}
${BOLD}${MAGENTA}╠════════════════════════════════════════════════════════════════════════════╣${RESET}
${BOLD}${MAGENTA}║${RESET} Points d'accès API                                                  ${BOLD}${MAGENTA}║${RESET}
${BOLD}${MAGENTA}╠════════════════════════════════════════════════════════════════════════════╣${RESET}
${BOLD}${MAGENTA}║${RESET}  API HTTP            ${CYAN}|${RESET}  http://${ct_ip}:${API_PORT}                 ${BOLD}${MAGENTA}║${RESET}
${BOLD}${MAGENTA}║${RESET}  WebSocket            ${CYAN}|${RESET}  ws://${ct_ip}:${API_PORT}/ws               ${BOLD}${MAGENTA}║${RESET}
${BOLD}${MAGENTA}║${RESET}  Santé (Health)       ${CYAN}|${RESET}  http://${ct_ip}:${API_PORT}/api/health      ${BOLD}${MAGENTA}║${RESET}
${BOLD}${MAGENTA}╚════════════════════════════════════════════════════════════════════════════╝${RESET}

${GREEN}🎉 Backend opérationnel !${RESET}
EOF
}

display_status() {
  local systemd_status=$(systemctl is-active "$SERVICE_NAME" 2>/dev/null || echo "inactive")
  local ct_ip=$(hostname -I | awk '{print $1}')
  
  cat << EOF
${BOLD}${MAGENTA}╔════════════════════════════════════════════════════════════════════════════╗${RESET}
${BOLD}${MAGENTA}║${RESET}                  ${CYAN}📊 RAPPORT D'ÉTAT - PROXMOX${RESET}                           ${BOLD}${MAGENTA}║${RESET}
${BOLD}${MAGENTA}╠════════════════════════════════════════════════════════════════════════════╣${RESET}
${BOLD}${MAGENTA}║${RESET} État des Services                                                   ${BOLD}${MAGENTA}║${RESET}
${BOLD}${MAGENTA}╠════════════════════════════════════════════════════════════════════════════╣${RESET}
EOF

  if [[ "$systemd_status" == "active" ]]; then
    echo -e "${BOLD}${MAGENTA}║${RESET}  Service Systemd     ${CYAN}|${RESET}  ${GREEN}● ACTIF${RESET}                                  ${BOLD}${MAGENTA}║${RESET}"
  else
    echo -e "${BOLD}${MAGENTA}║${RESET}  Service Systemd     ${CYAN}|${RESET}  ${RED}● INACTIF${RESET}                               ${BOLD}${MAGENTA}║${RESET}"
  fi
  
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    echo -e "${BOLD}${MAGENTA}║${RESET}  Santé API          ${CYAN}|${RESET}  ${GREEN}● EN LIGNE${RESET}                              ${BOLD}${MAGENTA}║${RESET}"
  else
    echo -e "${BOLD}${MAGENTA}║${RESET}  Santé API          ${CYAN}|${RESET}  ${YELLOW}● HORS LIGNE${RESET}                          ${BOLD}${MAGENTA}║${RESET}"
  fi
  
  cat << EOF
${BOLD}${MAGENTA}╠════════════════════════════════════════════════════════════════════════════╣${RESET}
${BOLD}${MAGENTA}║${RESET} Réseau                                                                ${BOLD}${MAGENTA}║${RESET}
${BOLD}${MAGENTA}╠════════════════════════════════════════════════════════════════════════════╣${RESET}
${BOLD}${MAGENTA}║${RESET}  Adresse IP          ${CYAN}|${RESET}  ${BOLD}${ct_ip}${RESET}                           ${BOLD}${MAGENTA}║${RESET}
${BOLD}${MAGENTA}║${RESET}  Port API            ${CYAN}|${RESET}  ${BOLD}${API_PORT}${RESET}                              ${BOLD}${MAGENTA}║${RESET}
${BOLD}${MAGENTA}╠════════════════════════════════════════════════════════════════════════════╣${RESET}
${BOLD}${MAGENTA}║${RESET} Points d'accès API                                                  ${BOLD}${MAGENTA}║${RESET}
${BOLD}${MAGENTA}╠════════════════════════════════════════════════════════════════════════════╣${RESET}
${BOLD}${MAGENTA}║${RESET}  API HTTP            ${CYAN}|${RESET}  http://${ct_ip}:${API_PORT}                 ${BOLD}${MAGENTA}║${RESET}
${BOLD}${MAGENTA}║${RESET}  WebSocket            ${CYAN}|${RESET}  ws://${ct_ip}:${API_PORT}/ws               ${BOLD}${MAGENTA}║${RESET}
${BOLD}${MAGENTA}║${RESET}  Santé (Health)       ${CYAN}|${RESET}  http://${ct_ip}:${API_PORT}/api/health      ${BOLD}${MAGENTA}║${RESET}
${BOLD}${MAGENTA}╚════════════════════════════════════════════════════════════════════════════╝${RESET}
EOF
  
  # Conteneurs Docker
  if command -v docker >/dev/null 2>&1 && [[ -d "$DOCKER_DIR" ]]; then
    echo ""
    echo -e "${BOLD}${CYAN}📦 Conteneurs Docker:${RESET}"
    cd "$DOCKER_DIR" 2>/dev/null && docker_compose ps 2>/dev/null | sed 's/^/  /' || true
  fi
  echo ""
}

# ==========================
# INSTALLATION
# ==========================
cmd_install() {
  require_root
  title "🚀 INSTALLATION PROXMOX BACKEND"
  
  # 1. Réseau & DNS
  title "1️⃣  Vérification réseau & DNS"
  ping -c1 -W2 8.8.8.8 >/dev/null 2>&1 || warn "Ping 8.8.8.8 échoué"
  
  if ! apt-get update >/dev/null 2>&1; then
    warn "Correction DNS automatique..."
    echo -e "nameserver 8.8.8.8\nnameserver 1.1.1.1" > /etc/resolv.conf
    chattr +i /etc/resolv.conf 2>/dev/null || true
    apt-get update -y
  fi
  ok "Réseau ✅"
  
  CT_IP=$(hostname -I | awk '{print $1}')
  info "IP CT: ${CT_IP}"
  
  # 2. Docker
  title "2️⃣  Installation Docker"
  apt-get install -y -qq ca-certificates curl gnupg docker.io git jq net-tools iproute2
  systemctl enable --now docker >/dev/null 2>&1
  ok "Docker ✅"
  
  # 3. Node.js 20
  title "3️⃣  Node.js 20 LTS"
  if ! command -v node >/dev/null 2>&1 || [[ $(node -v | cut -d'v' -f2 | cut -d. -f1) -lt 20 ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
    apt-get install -y -qq nodejs
  fi
  ok "Node $(node -v) ✅"
  
  # 4. Dépôt Git
  title "4️⃣  Récupération code (branche proxmox)"
  mkdir -p "$WORKDIR" && cd "$WORKDIR"
  if [[ -d .git ]]; then
    git checkout proxmox && git pull origin proxmox
  else
    git clone --branch proxmox https://github.com/SandersonnDev/workspace.git .
  fi
  ok "Code: $(git rev-parse --abbrev-ref HEAD) ✅"
  
  # 5-6. Dépendances & Build
  title "5️⃣  Dépendances & Build"
  cd "$APP_DIR" && npm install -q && npm run build >/dev/null 2>&1
  ok "Build dist/ ✅"
  
  # 7. Configuration
  title "6️⃣  Configuration"
  mkdir -p "$DOCKER_DIR"
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
  
  # Service systemd
  DOCKER_COMPOSE_CMD=$(command -v docker-compose 2>/dev/null || echo "docker compose")
  cat > "$SERVICE_FILE" << EOF
[Unit]
Description=Backend Proxmox Workspace
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=root
WorkingDirectory=${DOCKER_DIR}
ExecStart=${DOCKER_COMPOSE_CMD} up -d
ExecStop=${DOCKER_COMPOSE_CMD} down
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
  
  systemctl daemon-reload
  ok "Service systemd ✅"
  
  # Installation commande
  cp "$0" "$CTRL_SCRIPT" && chmod +x "$CTRL_SCRIPT"
  ok "Commande 'proxmox' installée ✅"
  
  title "🎉 INSTALLATION TERMINÉE"
  display_server_info "$CT_IP"
  echo -e "${BOLD}Commandes disponibles:${RESET}"
  echo "  proxmox start  | Démarrer"
  echo "  proxmox status | État"
  echo "  proxmox logs   | Logs"
  echo "  proxmox rebuild| Reconstruction"
}

# ==========================
# GESTION SERVICES
# ==========================
cmd_start() { require_root && log "Démarrage..." && systemctl start "$SERVICE_NAME" && wait_health && display_server_info "$(hostname -I | awk '{print $1}')"; }
cmd_stop() { require_root && log "Arrêt..." && systemctl stop "$SERVICE_NAME" && ok "Arrêté ✅"; }
cmd_restart() { require_root && log "Redémarrage..." && systemctl restart "$SERVICE_NAME" && wait_health && ok "Redémarré ✅"; }

wait_health() {
  info "Attente services..."
  for i in {1..30}; do sleep 2 && curl -fsS "$HEALTH_URL" >/dev/null 2>&1 && return 0; done
  warn "Services encore en démarrage"
}

cmd_status() { display_status; }
cmd_logs() { 
  if [[ "${1:-}" == "live" ]]; then
    info "Logs en direct (Ctrl+C pour arrêter)"
    journalctl -u "$SERVICE_NAME" -f -o cat
  else
    info "Derniers logs:"
    journalctl -u "$SERVICE_NAME" -n 50 -o cat --no-pager
  fi
}

cmd_rebuild() {
  require_root
  title "🔄 RECONSTRUCTION COMPLÈTE"
  
  cd "$WORKDIR"
  info "Nettoyage..." && rm -rf "$APP_DIR/dist" "$APP_DIR/node_modules/.cache"
  ok "Nettoyage ✅"
  
  info "Mise à jour code..." && git checkout proxmox && git pull origin proxmox
  ok "Code à jour ✅"
  
  cd "$APP_DIR" && info "Dépendances..." && npm install -q
  ok "Dépendances ✅"
  
  info "Build..." && npm run build >/dev/null 2>&1
  ok "Build ✅"
  
  cd "$DOCKER_DIR" && info "Docker..." 
  docker_compose down -v >/dev/null 2>&1 || true
  docker_compose build --no-cache >/dev/null 2>&1
  [[ $(systemctl is-active "$SERVICE_NAME") == "active" ]] && systemctl restart "$SERVICE_NAME"
  ok "Reconstruction terminée ✅"
}

cmd_diag() {
  title "🔍 DIAGNOSTIC COMPLET"
  log "Docker: $(docker --version 2>/dev/null || echo '❌ Absent')"
  log "Node: $(node -v 2>/dev/null || echo '❌ Absent')"
  log "Répertoire: $([[ -d $PROXMOX_DIR ]] && echo '✅ Présent' || echo '❌ Absent')"
  log "Service: $(systemctl is-active "$SERVICE_NAME" 2>/dev/null || echo '❌ Inactif')"
  log "Port ${API_PORT}: $(ss -tlnp | grep :${API_PORT} >/dev/null && echo '✅ Ouvert' || echo '❌ Fermé')"
  ok "Diagnostic terminé ✅"
}

cmd_reset_db() {
  require_root && warn "⚠️  SUPPRESSION BASE DONNÉES !" && 
  read -p "Confirmer? [o/N] " rep && [[ $rep =~ ^[oO] ]] &&
  cd "$DOCKER_DIR" && docker_compose down -v && docker_compose up -d && ok "Base reset ✅"
}

# ==========================
# AIDE FRANÇAISE
# ==========================
show_help() {
  cat << EOF
${BOLD}${MAGENTA}🚀 GESTIONNAIRE PROXMOX BACKEND${RESET}

${BOLD}📥 Installation:${RESET}
  sudo bash proxmox.sh install     → Installation complète

${BOLD}⚙️  Services:${RESET}
  proxmox start      → Démarrer
  proxmox stop       → Arrêter
  proxmox restart    → Redémarrer
  proxmox status     → État détaillé

${BOLD}🔧 Maintenance:${RESET}
  proxmox logs       → Logs (live pour direct)
  proxmox diag       → Diagnostics
  proxmox rebuild    → Reconstruction
  proxmox reset-db   → Reset base (⚠️ données perdues)

${BOLD}💡 Démarrage rapide:${RESET}
  1. sudo bash proxmox.sh install
  2. proxmox start
  3. proxmox status
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
  logs|log) shift; cmd_logs "$@" ;;
  diag|diagnostic) cmd_diag ;;
  rebuild|build) cmd_rebuild ;;
  reset-db|resetdb) cmd_reset_db ;;
  autorestart|help|-h|--help) show_help ;;
  *) show_help; exit 1 ;;
esac
