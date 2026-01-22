#!/usr/bin/env bash
#
# Proxmox Backend — Unified Management Script
# Single script for installation, management, and diagnostics
#
# Usage:
#   sudo bash proxmox.sh install    - Initial setup
#   proxmox start                    - Start services
#   proxmox stop                     - Stop services
#   proxmox restart                  - Restart services
#   proxmox status                   - Show status
#   proxmox logs [live]              - Show logs
#   proxmox diag                     - Run diagnostics
#   proxmox rebuild                  - Rebuild and update
#   proxmox reset-db                 - Reset database

set -euo pipefail
IFS=$'\n\t'

# ==========================
# Colors & Helpers
# ==========================
RED="\033[0;31m"; GREEN="\033[0;32m"; YELLOW="\033[1;33m"
BLUE="\033[0;34m"; CYAN="\033[0;36m"; BOLD="\033[1m"; RESET="\033[0m"

log() { echo -e "${CYAN}[proxmox]${RESET} $*"; }
info() { echo -e "${BLUE}➜${RESET} $*"; }
ok() { echo -e "${GREEN}✔${RESET} $*"; }
warn() { echo -e "${YELLOW}⚠${RESET} $*"; }
err() { echo -e "${RED}✖${RESET} $*"; }
title() { echo -e "\n${BOLD}$*${RESET}"; }

require_root() {
  if [[ $EUID -ne 0 ]]; then
    err "This command requires root. Run with sudo."
    exit 1
  fi
}

# Detect docker compose command
docker_compose() {
  if docker compose version &>/dev/null; then
    docker compose "$@"
  elif command -v docker-compose &>/dev/null; then
    docker-compose "$@"
  else
    err "Neither 'docker compose' nor 'docker-compose' found"
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

# ==========================
# Function: Installation
# ==========================
cmd_install() {
  require_root
  
  title "═══════════════════════════════════════════════"
  title "   Proxmox Backend — Installation"
  title "═══════════════════════════════════════════════"
  
  # 1. Network & DNS
  title "1/8 Vérification réseau & DNS"
  
  if ping -c 1 -W 2 8.8.8.8 >/dev/null 2>&1; then 
    ok "Ping 8.8.8.8 OK"
  else 
    warn "Ping 8.8.8.8 failed"
  fi
  
  if ! apt-get update -y >/dev/null 2>&1; then
    warn "apt-get update failed — fixing DNS"
    [[ -L /etc/resolv.conf ]] && mv -f /etc/resolv.conf /etc/resolv.conf.bak
    cat > /etc/resolv.conf <<EOF
nameserver 8.8.8.8
nameserver 8.8.4.4
EOF
    apt-get update -y
  fi
  ok "apt-get update OK"
  
  CT_IP=$(hostname -I | awk '{print $1}')
  info "CT IP: ${CT_IP}"
  
  # 2. Install Docker
  title "2/8 Installation Docker"
  
  apt-get install -y ca-certificates curl gnupg docker.io git jq net-tools iproute2 >/dev/null 2>&1
  
  if docker_compose version &>/dev/null; then
    ok "docker_compose available"
  elif [[ -f /usr/local/bin/docker-compose ]]; then
    ok "docker-compose standalone available"
  else
    info "Installing docker-compose standalone"
    COMPOSE_VERSION=$(curl -fsSL https://api.github.com/repos/docker/compose/releases/latest | jq -r .tag_name 2>/dev/null || echo "v2.24.0")
    curl -fsSL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" \
      -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    ok "docker-compose installed"
  fi
  
  systemctl enable --now docker >/dev/null 2>&1
  ok "Docker enabled & started"
  
  # 3. Install Node.js 20
  title "3/8 Installation Node.js 20 LTS"
  
  if ! command -v node >/dev/null 2>&1 || [[ $(node -v | sed 's/v//;s/\..*//') -lt 20 ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
    apt-get install -y nodejs >/dev/null 2>&1
  fi
  ok "Node $(node --version), npm $(npm --version)"
  
  # 4. Clone/Update Repository
  title "4/8 Clonage du dépôt (branche proxmox)"
  
  mkdir -p "$WORKDIR"
  cd "$WORKDIR"
  
  if [[ -d .git ]]; then
    info "Repository exists — updating"
    git fetch && git checkout proxmox && git pull origin proxmox
  else
    info "Cloning repository"
    git clone --branch proxmox https://github.com/SandersonnDev/workspace.git .
  fi
  ok "Repository ready: $(git rev-parse --abbrev-ref HEAD)"
  
  # 5. Install Dependencies
  title "5/8 Installation des dépendances"
  
  [[ -f package.json ]] && npm install >/dev/null 2>&1 || true
  cd "$APP_DIR" && npm install >/dev/null 2>&1
  ok "Dependencies installed"
  
  # 6. Build TypeScript
  title "6/8 Build TypeScript"
  
  cd "$APP_DIR"
  npm run build >/dev/null 2>&1 || { err "Build failed"; exit 1; }
  ok "Build completed → dist/"
  
  # 7. Configuration
  title "7/8 Configuration (.env + systemd)"
  
  # Create .env if not exists
  if [[ ! -f "$DOCKER_DIR/.env" ]]; then
    cat > "$DOCKER_DIR/.env" <<EOF
NODE_ENV=production
API_PORT=${API_PORT}
PORT=${API_PORT}
LOG_LEVEL=info
DEBUG_MODE=false

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
    ok ".env created"
  else
    ok ".env already exists"
  fi
  
  # Detect which docker compose to use
  if docker compose version &>/dev/null 2>&1; then
    DOCKER_COMPOSE_CMD="/usr/bin/docker compose"
  elif command -v docker-compose &>/dev/null; then
    DOCKER_COMPOSE_CMD="$(command -v docker-compose)"
  else
    err "Neither 'docker compose' nor 'docker-compose' found"
    exit 1
  fi
  
  # Create systemd service (manual start)
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
ExecStart=${DOCKER_COMPOSE_CMD} up
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
  ok "Systemd service created (not started)"
  
  # 8. Create Management Command
  title "8/8 Installation de la commande 'proxmox'"
  
  # Copy this script to /usr/local/bin/proxmox
  cp "$0" "$CTRL_SCRIPT" 2>/dev/null || cp "$PROXMOX_DIR/scripts/proxmox.sh" "$CTRL_SCRIPT"
  chmod +x "$CTRL_SCRIPT"
  ok "Command 'proxmox' installed"
  
  # Final report
  title "═══════════════════════════════════════════════"
  title "   Installation Complete"
  title "═══════════════════════════════════════════════"
  echo ""
  echo -e "${BOLD}IP:${RESET}            ${CT_IP}"
  echo -e "${BOLD}API HTTP:${RESET}      http://${CT_IP}:${API_PORT}"
  echo -e "${BOLD}WebSocket:${RESET}     ws://${CT_IP}:${API_PORT}/ws"
  echo -e "${BOLD}Health:${RESET}        http://${CT_IP}:${API_PORT}/api/health"
  echo ""
  echo -e "${BOLD}Available commands:${RESET}"
  echo "  proxmox start      - Start backend services"
  echo "  proxmox stop       - Stop backend services"
  echo "  proxmox restart    - Restart backend"
  echo "  proxmox status     - Show status"
  echo "  proxmox logs       - Show logs"
  echo "  proxmox diag       - Run diagnostics"
  echo "  proxmox rebuild    - Update & rebuild"
  echo "  proxmox reset-db   - Reset database"
  echo ""
  warn "⚠️  Services NOT started automatically"
  info "Run 'proxmox start' to start the backend"
  echo ""
}

# ==========================
# Function: Start
# ==========================
cmd_start() {
  require_root
  
  log "Starting Proxmox backend..."
  
  # Build images first
  cd "$DOCKER_DIR"
  info "Building Docker images..."
  docker_compose build --no-cache >/dev/null 2>&1
  
  # Start services
  systemctl start "$SERVICE_NAME"
  
  # Wait for health check
  info "Waiting for services to start..."
  for i in {1..30}; do
    sleep 2
    if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
      ok "Backend started successfully"
      echo ""
      CT_IP=$(hostname -I | awk '{print $1}')
      info "HTTP API:  http://${CT_IP}:${API_PORT}"
      info "WebSocket: ws://${CT_IP}:${API_PORT}/ws"
      info "Health:    http://${CT_IP}:${API_PORT}/api/health"
      return 0
    fi
  done
  
  warn "Backend still starting, check logs with: proxmox logs"
}

# ==========================
# Function: Stop
# ==========================
cmd_stop() {
  require_root
  
  log "Stopping Proxmox backend..."
  systemctl stop "$SERVICE_NAME"
  ok "Backend stopped"
}

# ==========================
# Function: Restart
# ==========================
cmd_restart() {
  require_root
  
  log "Restarting Proxmox backend..."
  systemctl restart "$SERVICE_NAME"
  
  sleep 3
  info "Waiting for services..."
  for i in {1..30}; do
    if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
      ok "Backend restarted successfully"
      return 0
    fi
    sleep 2
  done
  
  warn "Backend still restarting"
}

# ==========================
# Function: Status
# ==========================
cmd_status() {
  local systemd_status=$(systemctl is-active "$SERVICE_NAME" 2>/dev/null || echo "inactive")
  local ct_ip=$(hostname -I | awk '{print $1}')
  
  echo ""
  title "╔════════════════════════════════════════════════════════════════════╗"
  title "║                   Proxmox Backend Status                          ║"
  title "╚════════════════════════════════════════════════════════════════════╝"
  echo ""
  
  # Component status
  title "┌─────────────────────┬──────────────────────────────────────────────┐"
  title "│ Component           │ Status                                       │"
  title "├─────────────────────┼──────────────────────────────────────────────┤"
  
  if [[ "$systemd_status" == "active" ]]; then
    printf "│ %-19s │ ${GREEN}%-44s${RESET} │\n" "Systemd Service" "● ACTIVE"
  else
    printf "│ %-19s │ ${RED}%-44s${RESET} │\n" "Systemd Service" "● INACTIVE"
  fi
  
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    printf "│ %-19s │ ${GREEN}%-44s${RESET} │\n" "API Health" "● ONLINE"
  else
    printf "│ %-19s │ ${RED}%-44s${RESET} │\n" "API Health" "● OFFLINE"
  fi
  
  title "└─────────────────────┴──────────────────────────────────────────────┘"
  echo ""
  
  # Network info
  title "┌─────────────────────┬──────────────────────────────────────────────┐"
  title "│ Network             │ Configuration                                │"
  title "├─────────────────────┼──────────────────────────────────────────────┤"
  printf "│ %-19s │ ${CYAN}%-44s${RESET} │\n" "IP Address" "$ct_ip"
  printf "│ %-19s │ ${CYAN}%-44s${RESET} │\n" "API Port" "$API_PORT"
  title "└─────────────────────┴──────────────────────────────────────────────┘"
  echo ""
  
  # Endpoints
  title "┌─────────────────────┬──────────────────────────────────────────────┐"
  title "│ Endpoint            │ URL                                          │"
  title "├─────────────────────┼──────────────────────────────────────────────┤"
  printf "│ %-19s │ ${CYAN}%-44s${RESET} │\n" "HTTP API" "http://${ct_ip}:${API_PORT}"
  printf "│ %-19s │ ${CYAN}%-44s${RESET} │\n" "WebSocket" "ws://${ct_ip}:${API_PORT}/ws"
  printf "│ %-19s │ ${CYAN}%-44s${RESET} │\n" "Health Check" "http://${ct_ip}:${API_PORT}/api/health"
  title "└─────────────────────┴──────────────────────────────────────────────┘"
  echo ""
  
  # Docker containers
  if command -v docker >/dev/null 2>&1 && [[ -d "$DOCKER_DIR" ]]; then
    title "Docker Containers:"
    cd "$DOCKER_DIR"
    docker_compose ps 2>/dev/null | sed 's/^/  /' || true
    echo ""
  fi
}

# ==========================
# Function: Logs
# ==========================
cmd_logs() {
  local mode="${1:-}"
  
  if [[ "$mode" == "live" ]]; then
    info "Live logs (Ctrl+C to stop)"
    journalctl -u "$SERVICE_NAME" -f
  else
    journalctl -u "$SERVICE_NAME" -n 100 --no-pager
  fi
}

# ==========================
# Function: Diagnostics
# ==========================
cmd_diag() {
  title "═══════════════════════════════════════════════"
  title "   Proxmox Backend — Diagnostics"
  title "═══════════════════════════════════════════════"
  echo ""
  
  # Docker
  log "Checking Docker..."
  if command -v docker &> /dev/null; then
    ok "$(docker --version)"
  else
    err "Docker not found"
  fi
  
  if docker_compose version &> /dev/null; then
    ok "$(docker_compose version)"
  else
    err "docker_compose not working"
  fi
  
  # Node.js
  log "Checking Node.js..."
  if command -v node &> /dev/null; then
    ok "Node $(node --version), npm $(npm --version)"
  else
    err "Node.js not found"
  fi
  
  # Repository
  log "Checking repository..."
  if [[ -d "$WORKDIR/.git" ]]; then
    cd "$WORKDIR"
    local branch=$(git rev-parse --abbrev-ref HEAD)
    ok "Repository found — branch: $branch"
  else
    err "Repository not found at $WORKDIR"
  fi
  
  # Proxmox structure
  log "Checking proxmox structure..."
  if [[ -d "$PROXMOX_DIR" ]]; then
    ok "proxmox/ directory found"
  else
    err "proxmox/ directory not found"
  fi
  
  if [[ -f "$APP_DIR/package.json" ]]; then
    ok "proxmox/app/package.json found"
    [[ -d "$APP_DIR/node_modules" ]] && ok "node_modules installed" || warn "node_modules missing"
  else
    err "proxmox/app/package.json not found"
  fi
  
  if [[ -f "$DOCKER_DIR/docker-compose.yml" ]]; then
    ok "proxmox/docker/docker-compose.yml found"
  else
    err "docker-compose.yml not found"
  fi
  
  [[ -f "$DOCKER_DIR/.env" ]] && ok "proxmox/docker/.env found" || warn ".env not found"
  
  # Systemd
  log "Checking systemd service..."
  if [[ -f "$SERVICE_FILE" ]]; then
    ok "systemd service installed"
    local status=$(systemctl is-active "$SERVICE_NAME" 2>/dev/null || echo "unknown")
    echo -e "  Status: ${YELLOW}$status${RESET}"
  else
    warn "systemd service not installed"
  fi
  
  # Ports
  log "Checking ports..."
  if netstat -tlnp 2>/dev/null | grep -q ":${API_PORT} "; then
    ok "Port ${API_PORT} is open"
  else
    warn "Port ${API_PORT} is not open"
  fi
  
  # Docker containers
  log "Checking Docker containers..."
  if docker ps -a 2>/dev/null | grep -q "proxmox"; then
    ok "Proxmox containers exist"
    if docker ps 2>/dev/null | grep -q "proxmox"; then
      ok "Containers are running"
    else
      warn "Containers are not running"
    fi
  else
    warn "No proxmox containers found"
  fi
  
  echo ""
  ok "Diagnostic complete"
  echo ""
}

# ==========================
# Function: Rebuild
# ==========================
cmd_rebuild() {
  require_root
  
  log "Rebuilding Proxmox backend..."
  
  cd "$WORKDIR"
  
  # Update repository
  info "Fetching latest code..."
  git fetch && git checkout proxmox && git pull origin proxmox
  ok "Repository updated"
  
  # Install dependencies
  info "Installing dependencies..."
  cd "$APP_DIR"
  npm install >/dev/null 2>&1
  ok "Dependencies updated"
  
  # Build
  info "Building TypeScript..."
  npm run build >/dev/null 2>&1
  ok "Build complete"
  
  # Rebuild Docker images
  info "Rebuilding Docker images..."
  cd "$DOCKER_DIR"
  docker_compose build --no-cache >/dev/null 2>&1
  ok "Docker images rebuilt"
  
  # Restart if running
  if systemctl is-active "$SERVICE_NAME" >/dev/null 2>&1; then
    info "Restarting services..."
    systemctl restart "$SERVICE_NAME"
    sleep 5
    ok "Services restarted"
  else
    warn "Services not running — start with 'proxmox start'"
  fi
  
  ok "Rebuild complete"
}

# ==========================
# Function: Reset Database
# ==========================
cmd_reset_db() {
  require_root
  
  warn "This will DELETE all data in the database!"
  read -p "Continue? [y/N] " -n 1 -r
  echo
  [[ ! $REPLY =~ ^[Yy]$ ]] && { info "Cancelled"; exit 0; }
  
  log "Resetting database..."
  
  cd "$DOCKER_DIR"
  info "Stopping services..."
  docker_compose down -v
  
  info "Restarting with fresh database..."
  docker_compose up -d
  
  sleep 5
  ok "Database reset complete"
}

# ==========================
# Main Command Dispatcher
# ==========================
COMMAND="${1:-help}"

case "$COMMAND" in
  install)
    cmd_install
    ;;
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
  logs)
    cmd_logs "${2:-}"
    ;;
  diag|diagnostic)
    cmd_diag
    ;;
  rebuild)
    cmd_rebuild
    ;;
  reset-db|resetdb)
    cmd_reset_db
    ;;
  help|--help|-h|*)
    cat <<HELP
${BOLD}Proxmox Backend Manager${RESET}

${BOLD}Installation:${RESET}
  sudo bash proxmox.sh install    Install and configure everything

${BOLD}Service Management:${RESET}
  proxmox start                   Start backend services
  proxmox stop                    Stop backend services
  proxmox restart                 Restart backend
  proxmox status                  Show detailed status

${BOLD}Maintenance:${RESET}
  proxmox logs [live]             Show logs (add 'live' for real-time)
  proxmox diag                    Run full diagnostics
  proxmox rebuild                 Update code & rebuild
  proxmox reset-db                Reset database (WARNING: deletes data)

${BOLD}Examples:${RESET}
  sudo bash proxmox.sh install
  proxmox start
  proxmox status
  proxmox logs live

${BOLD}Quick Start:${RESET}
  1. sudo bash proxmox.sh install
  2. proxmox start
  3. proxmox status
HELP
    [[ "$COMMAND" != "help" && "$COMMAND" != "--help" && "$COMMAND" != "-h" ]] && exit 1
    exit 0
    ;;
esac
