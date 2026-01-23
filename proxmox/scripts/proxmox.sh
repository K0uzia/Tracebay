#!/usr/bin/env bash
#
# Proxmox Backend — Gestionnaire Unifié (CT Proxmox)
# Self-Update + Rebuild automatique depuis GitHub

set -euo pipefail
IFS=$'\n\t'

# ==========================
# 🔄 SELF-UPDATE INTELLIGENT
# ==========================
SCRIPT_PATH="${BASH_SOURCE[0]}"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
GLOBAL_SCRIPT="/usr/local/bin/proxmox"
GITHUB_URL="https://raw.githubusercontent.com/SandersonnDev/workspace/proxmox/proxmox/scripts/proxmox.sh"
TMP_SCRIPT="/tmp/proxmox-update.sh"

# Si exécuté depuis /usr/local/bin ET /workspace existe → self-update
if [[ "$SCRIPT_PATH" == "$GLOBAL_SCRIPT" && -d /workspace ]]; then
  info "🔄 Vérification mise à jour..."
  curl -fsSL "$GITHUB_URL" -o "$TMP_SCRIPT" 2>/dev/null || true
  if [[ -f "$TMP_SCRIPT" && $(diff "$SCRIPT_PATH" "$TMP_SCRIPT" >/dev/null 2>&1; echo $?) -ne 0 ]]; then
    cp "$TMP_SCRIPT" "$SCRIPT_PATH" && chmod +x "$SCRIPT_PATH"
    ok "✅ Script mis à jour ! Re-lancement..."
    exec "$SCRIPT_PATH" "$@"
  fi
  rm -f "$TMP_SCRIPT"
fi

# ==========================
# Couleurs & Helpers
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

# ==========================
# Configuration (ARCHI FIXE)
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
  echo -e "${BOLD}╔════════════════════════════════════════════════════════════════════════════╗${RESET}"
  echo -e "${BOLD}║${RESET}                    ${GREEN}✅ PROXMOX BACKEND - PRÊT${RESET}                                     ${BOLD}║${RESET}"
  echo -e "${BOLD}╠════════════════════════════════════════════════════════════════════════════╣${RESET}"
  printf "${BOLD}║${RESET}  %-30s │  ${CYAN}%-41s${RESET}  ${BOLD}║${RESET}\n" "IP" "${ct_ip}"
  printf "${BOLD}║${RESET}  %-30s │  ${CYAN}%-41s${RESET}  ${BOLD}║${RESET}\n" "API" "http://${ct_ip}:${API_PORT}"
  printf "${BOLD}║${RESET}  %-30s │  ${CYAN}%-41s${RESET}  ${BOLD}║${RESET}\n" "WS" "ws://${ct_ip}:${API_PORT}/ws"
  echo -e "${BOLD}╚════════════════════════════════════════════════════════════════════════════╝${RESET}"
}

docker_compose() {
  if docker compose version &>/dev/null; then docker compose "$@"
  elif command -v docker-compose &>/dev/null; then docker-compose "$@"
  else err "Docker Compose non trouvé"; exit 1; fi
}

# ==========================
# LOGS ULTRA-LISIBLES
# ==========================
cmd_logs() {
  local mode="${1:-}"
  case "$mode" in
    "live") info "🔴 Logs temps réel"; journalctl -u "$SERVICE_NAME" -f | grep --color=always -E "\[.*(GET|POST|WS)" || journalctl -u "$SERVICE_NAME" -f ;;
    "http") info "🌐 HTTP"; journalctl -u "$SERVICE_NAME" -n 100 | grep --color=always -E "(GET|POST)" | tail -20 ;;
    "ws") info "⚡ WS"; journalctl -u "$SERVICE_NAME" -n 50 | grep --color=always -E "(WS|websocket)" | tail -15 ;;
    *) info "📋 Logs"; journalctl -u "$SERVICE_NAME" -n 100 | grep --color=always -E "(GET|POST|WS|error)" | tail -30 ;;
  esac
}

# ==========================
# 🚀 INSTALLATION COMPLETE
# ==========================
cmd_install() {
  require_root
  title "🎯 PROXMOX BACKEND INSTALLATION"
  
  # 1. SYSTEME GLOBAL
  title "1️⃣ Docker + Node (système)"
  apt-get update -y && apt-get install -y docker.io git jq curl ca-certificates gnupg net-tools iproute2
  
  # Docker Compose
  if ! command -v docker-compose &>/dev/null; then
    COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | jq -r .tag_name || echo "v2.24.0")
    curl -L "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
  fi
  systemctl enable --now docker
  
  # Node.js 20
  if ! command -v node &>/dev/null || [[ $(node -v | cut -d v -f 2 | cut -d . -f 1) -lt 20 ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
  fi
  ok "✅ Système prêt"

  # 2. WORKSPACE
  title "2️⃣ /workspace/proxmox"
  mkdir -p "$WORKDIR"
  cd "$WORKDIR"
  if [[ ! -d .git ]]; then
    git clone -b proxmox https://github.com/SandersonnDev/workspace.git .
  else
    git checkout proxmox && git pull origin proxmox
  fi
  ok "✅ Dépôt: $(git rev-parse --abbrev-ref HEAD)"

  # 3. APP Build
  title "3️⃣ proxmox/app"
  cd "$APP_DIR" && npm install && npm run build
  mkdir -p "$APP_DIR/logs"
  ok "✅ Build OK"

  # 4. Docker Config
  title "4️⃣ Docker .env"
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

  # 5. Systemd
  title "5️⃣ Service"
  cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Proxmox Backend
After=docker.service network.target
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
  cp "$0" "$CTRL_SCRIPT" && chmod +x "$CTRL_SCRIPT"

  # 6. Docker Build
  title "6️⃣ Docker Build"
  cd "$DOCKER_DIR" && docker_compose build --no-cache
  ok "✅ Installation terminée !"

  display_server_info "$CT_IP"
  echo -e "${GREEN}proxmox up${RESET}     → Démarrer"
  echo -e "${GREEN}proxmox logs live${RESET} → Logs temps réel"
}

# ==========================
# 🔥 REBUILD = NETTOYAGE TOTAL + UPDATE
# ==========================
cmd_rebuild() {
  require_root
  title "🧹🔥 REBUILD COMPLET - Nettoyage + Update Git"
  
  echo -e "${YELLOW}⚠️  Nettoyage AGRESSIF en cours...${RESET}"
  
  # 1️⃣ ARRÊT SERVICES
  info "1️⃣ Arrêt services..."
  systemctl stop "$SERVICE_NAME" 2>/dev/null || true
  
  # 2️⃣ NETTOYAGE DOCKER TOTAL
  info "2️⃣ Nettoyage Docker (images/volumes/cache)..."
  docker_compose -f "$DOCKER_DIR/docker-compose.yml" down -v --remove-orphans 2>/dev/null || true
  docker image prune -a -f >/dev/null 2>&1
  docker container prune -f >/dev/null 2>&1
  docker volume prune -f >/dev/null 2>&1
  docker system prune -a -f >/dev/null 2>&1
  docker builder prune -a -f >/dev/null 2>&1
  ok "Docker nettoyé ✅"

  # 3️⃣ NETTOYAGE FICHIERS
  info "3️⃣ Nettoyage fichiers workspace..."
  cd "$WORKDIR"
  rm -rf "$APP_DIR/dist" "$APP_DIR/node_modules" "$APP_DIR/logs"/*.log 2>/dev/null || true
  rm -rf "$DOCKER_DIR"/build/ "$DOCKER_DIR"/.dockerignore 2>/dev/null || true
  ok "Fichiers nettoyés ✅"

  # 4️⃣ GIT PULL FRAIS
  info "4️⃣ Git pull proxmox..."
  cd "$WORKDIR"
  git fetch --all
  git checkout proxmox
  git pull origin proxmox
  ok "Git: $(git log --oneline -1)"

  # 5️⃣ REBUILD APP
  info "5️⃣ Rebuild proxmox/app..."
  cd "$APP_DIR"
  rm -rf node_modules package-lock.json
  npm install --no-optional
  npm run build
  mkdir -p "$APP_DIR/logs"
  ok "App rebuild ✅"

  # 6️⃣ REGÉN .env
  info "6️⃣ Régénération .env..."
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
  ok ".env régénéré ✅"

  # 7️⃣ REBUILD DOCKER
  info "7️⃣ Docker build --no-cache..."
  cd "$DOCKER_DIR"
  docker_compose build --no-cache
  ok "Docker reconstruit ✅"

  # 8️⃣ RESTART
  info "8️⃣ Redémarrage service..."
  systemctl daemon-reload
  systemctl restart "$SERVICE_NAME"
  sleep 8
  
  # Vérif santé
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    CT_IP=$(hostname -I | awk '{print $1}')
    display_server_info "$CT_IP"
    ok "🎉 REBUILD 100% RÉUSSI !"
  else
    warn "⏳ Service en redémarrage... → proxmox logs live"
  fi
}


# Commandes simples
cmd_start() { require_root; systemctl start "$SERVICE_NAME" && sleep 5 && curl -s "$HEALTH_URL" && ok "✅ En ligne" || warn "⏳ En démarrage"; }
cmd_stop() { require_root; systemctl stop "$SERVICE_NAME"; ok "🛑 Arrêté"; }
cmd_status() { systemctl status "$SERVICE_NAME" --no-pager -l | head -20; docker_compose ps; }
cmd_restart() { require_root; systemctl restart "$SERVICE_NAME"; sleep 5; ok "🔄 Redémarré"; }

# Switch
COMMAND="${1:-help}"
case "$COMMAND" in
  install) cmd_install ;;
  rebuild|build|update) cmd_rebuild ;;
  up|start) cmd_start ;;
  down|stop) cmd_stop ;;
  restart) cmd_restart ;;
  status|st) cmd_status ;;
  logs) cmd_logs "${2:-}" ;;
  diag) ls -la "$PROXMOX_DIR" && docker images | grep proxmox && systemctl status "$SERVICE_NAME" --no-pager -l ;;
  help|-h|*)
    echo "${BOLD}🎯 Proxmox Backend${RESET}
${GREEN}sudo bash $0 install${RESET}     → Installation complète
${GREEN}proxmox rebuild${RESET}         → 🔥 UPDATE git + rebuild
${GREEN}proxmox up${RESET}             → Démarrer
${GREEN}proxmox logs live${RESET}      → Logs temps réel
${GREEN}proxmox status${RESET}         → Statut"
    ;;
esac
