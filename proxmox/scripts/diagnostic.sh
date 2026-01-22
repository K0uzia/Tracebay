#!/usr/bin/env bash
# Diagnostic script for Proxmox Backend

set -euo pipefail

RED="\033[0;31m"; GREEN="\033[0;32m"; YELLOW="\033[1;33m"; BLUE="\033[0;34m"; CYAN="\033[0;36m"; BOLD="\033[1m"; RESET="\033[0m"

log() { echo -e "${CYAN}[diagnostic]${RESET} $*"; }
ok() { echo -e "${GREEN}✔${RESET} $*"; }
warn() { echo -e "${YELLOW}⚠${RESET} $*"; }
err() { echo -e "${RED}✖${RESET} $*"; }

echo -e "${BOLD}═══════════════════════════════════════════════${RESET}"
echo -e "${BOLD}   Proxmox Backend — Diagnostic${RESET}"
echo -e "${BOLD}═══════════════════════════════════════════════${RESET}"
echo ""

# Check Docker
log "Checking Docker..."
if command -v docker &> /dev/null; then
  DOCKER_VERSION=$(docker --version)
  ok "$DOCKER_VERSION"
else
  err "Docker not found"
fi

# Check Docker Compose
log "Checking docker compose..."
if docker compose version &> /dev/null; then
  ok "$(docker compose version)"
else
  err "docker compose not working"
fi

# Check Node.js
log "Checking Node.js..."
if command -v node &> /dev/null; then
  NODE_VERSION=$(node --version)
  NPM_VERSION=$(npm --version)
  ok "Node $NODE_VERSION, npm $NPM_VERSION"
else
  err "Node.js not found"
fi

# Check workspace
log "Checking workspace..."
if [[ -d /workspace/proxmox ]]; then
  ok "Workspace found at /workspace/proxmox"
else
  err "Workspace not found"
  exit 1
fi

# Check git branch
log "Checking git branch..."
cd /workspace
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
if [[ "$BRANCH" == "proxmox" ]]; then
  ok "On branch: $BRANCH"
else
  warn "Not on proxmox branch (currently: $BRANCH)"
fi

# Check dependencies
log "Checking npm dependencies..."
if [[ -f package.json ]]; then
  ok "package.json found"
  if [[ -d node_modules ]]; then
    ok "node_modules found"
  else
    warn "node_modules not found - run: npm install"
  fi
else
  err "package.json not found"
fi

# Check proxmox app
log "Checking proxmox app..."
if [[ -f proxmox/app/package.json ]]; then
  ok "proxmox/app/package.json found"
  if [[ -d proxmox/app/node_modules ]]; then
    ok "proxmox/app/node_modules found"
  else
    warn "proxmox/app/node_modules not found"
  fi
else
  err "proxmox/app/package.json not found"
fi

# Check Docker files
log "Checking Docker files..."
if [[ -f proxmox/docker/Dockerfile ]]; then
  ok "proxmox/docker/Dockerfile found"
else
  err "Dockerfile not found"
fi

if [[ -f proxmox/docker/docker-compose.yml ]]; then
  ok "proxmox/docker/docker-compose.yml found"
else
  err "docker-compose.yml not found"
fi

if [[ -f proxmox/docker/.env ]]; then
  ok "proxmox/docker/.env found"
else
  warn "proxmox/docker/.env not found - will be created by setup"
fi

# Check systemd service
log "Checking systemd service..."
if [[ -f /etc/systemd/system/workspace-proxmox.service ]]; then
  ok "systemd service found"
  SYSTEMD_STATUS=$(systemctl is-active workspace-proxmox 2>/dev/null || echo "unknown")
  if [[ "$SYSTEMD_STATUS" == "active" ]]; then
    echo -e "  Status: ${GREEN}ACTIVE${RESET}"
  else
    echo -e "  Status: ${YELLOW}$SYSTEMD_STATUS${RESET}"
  fi
else
  warn "systemd service not installed yet"
fi

# Check ports
log "Checking ports..."
if netstat -tlnp 2>/dev/null | grep -q ":4000 "; then
  ok "Port 4000 is open"
else
  warn "Port 4000 is not open"
fi

# Check proxmox command
log "Checking proxmox command..."
if [[ -f /usr/local/bin/proxmox ]]; then
  ok "proxmox command found"
else
  warn "proxmox command not found"
fi

# Check Docker containers
log "Checking Docker containers..."
if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "proxmox"; then
  ok "Proxmox container exists"
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "proxmox"; then
    ok "Proxmox container is running"
  else
    warn "Proxmox container is not running"
  fi
else
  warn "Proxmox container not created yet"
fi

echo ""
echo -e "${BOLD}═══════════════════════════════════════════════${RESET}"
echo -e "${BOLD}   Recommendations:${RESET}"
echo -e "${BOLD}═══════════════════════════════════════════════${RESET}"
echo ""

# Recommendations
if ! [[ -d /workspace/proxmox/node_modules ]]; then
  echo "1. Install root dependencies:"
  echo "   cd /workspace/proxmox && npm install"
  echo ""
fi

if ! [[ -d /workspace/proxmox/app/node_modules ]]; then
  echo "2. Install proxmox dependencies:"
  echo "   npm install --workspace=proxmox/app"
  echo ""
fi

if ! [[ -f /etc/systemd/system/workspace-proxmox.service ]]; then
  echo "3. Setup systemd service:"
  echo "   sudo bash /workspace/proxmox/scripts/proxmox-setup.sh install"
  echo ""
fi

if ! docker ps 2>/dev/null | grep -q "proxmox"; then
  echo "4. Start Docker services:"
  echo "   cd /workspace/proxmox/docker"
  echo "   docker compose build --no-cache"
  echo "   docker compose up -d"
  echo ""
fi

echo -e "${GREEN}✔ Diagnostic complete${RESET}"
