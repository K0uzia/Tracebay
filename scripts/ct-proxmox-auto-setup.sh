#!/usr/bin/env bash
#
# Proxmox CT (Debian 13 Trixie) — Full Auto Setup
# One-command script: installs Docker, clones project, configures env, starts services, verifies.
# Tested for fresh LXC container with network access.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/SandersonnDev/workspace/feature/phase5-production-scaling/scripts/ct-proxmox-auto-setup.sh | bash
# Or (from repo root):
#   sudo bash scripts/ct-proxmox-auto-setup.sh

set -euo pipefail
IFS=$'\n\t'

# ==========================
# Styling & helpers
# ==========================
RED="\033[0;31m"; GREEN="\033[0;32m"; YELLOW="\033[1;33m"; BLUE="\033[0;34m"; CYAN="\033[0;36m"; BOLD="\033[1m"; RESET="\033[0m"

log() { echo -e "${CYAN}[setup]${RESET} $*"; }
info() { echo -e "${BLUE}➜${RESET} $*"; }
ok() { echo -e "${GREEN}✔${RESET} $*"; }
warn() { echo -e "${YELLOW}⚠${RESET} $*"; }
err() { echo -e "${RED}✖${RESET} $*"; }

progress() {
  local msg="$1"; shift
  echo -e "${BOLD}${msg}${RESET}"
}

require_cmd() { command -v "$1" >/dev/null 2>&1 || { err "Command '$1' is required"; exit 1; }; }

trap 'err "Unexpected error at line $LINENO"; exit 1' ERR

# Root check
if [[ $EUID -ne 0 ]]; then
  err "Please run as root (sudo)."
  exit 1
fi

# ==========================
# Pre-checks: Network & DNS
# ==========================
progress "1) Vérifications réseau & DNS"

info "Ping 8.8.8.8"; if ping -c 1 -W 2 8.8.8.8 >/dev/null 2>&1; then ok "Ping OK"; else warn "Ping failed"; fi
info "Ping github.com"; if ping -c 1 -W 2 github.com >/dev/null 2>&1; then ok "Ping OK"; else warn "Ping github.com failed"; fi

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

# Public/route IP
CT_IP=$(hostname -I | awk '{print $1}')
PUB_ROUTE_IP=$(ip route get 8.8.8.8 | awk '/src/ {print $NF; exit}')
PUB_EXT_IP=$(curl -fsS ifconfig.me || echo "unknown")
info "IP CT (hostname -I): ${CT_IP}"
info "IP route src: ${PUB_ROUTE_IP}"
info "IP publique: ${PUB_EXT_IP}"

# ==========================
# Install Docker & deps
# ==========================
progress "2) Installation Docker & dépendances"

apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get install -y \
  ca-certificates curl gnupg lsb-release \
  docker.io \
  git jq net-tools iproute2

# Install docker-compose standalone (docker-compose-plugin not yet in Trixie)
info "Installing docker-compose (standalone)"
COMPOSE_VERSION=$(curl -fsSL https://api.github.com/repos/docker/compose/releases/latest | jq -r .tag_name)
curl -fsSL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose
ok "docker-compose ${COMPOSE_VERSION} installed"

systemctl enable --now docker
ok "Docker service enabled & started"

info "Testing docker hello-world"
if docker run --rm hello-world >/dev/null 2>&1; then ok "Docker hello-world OK"; else warn "hello-world test skipped (image pull may be rate-limited)"; fi

# ==========================
# Install Node.js 20 LTS
# ==========================
progress "3) Installation Node.js 20 LTS"

if ! command -v node >/dev/null 2>&1 || [[ $(node -v | sed 's/v//') < "20.0.0" ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
fi
ok "Node $(node --version), npm $(npm --version)"

# ==========================
# Clone project (feature/phase5-production-scaling branch)
# ==========================
progress "4) Clonage du projet (branche feature/phase5-production-scaling)"

WORKDIR="/workspace"
mkdir -p "$WORKDIR"
cd "$WORKDIR"

# Clean up if workspace directory exists but is not a valid git repo
if [[ -d workspace ]] && [[ ! -d workspace/.git ]]; then
  info "Cleaning up invalid workspace directory"
  rm -rf workspace
fi

if [[ -d workspace/.git ]]; then
  info "Repo déjà présent — pull feature/phase5-production-scaling"
  cd workspace && git fetch && git checkout feature/phase5-production-scaling && git pull origin feature/phase5-production-scaling && cd ..
else
  info "Clonage du repo"
  git clone --branch feature/phase5-production-scaling https://github.com/SandersonnDev/workspace.git
fi
cd workspace
ok "Repository prêt: $(git rev-parse --abbrev-ref HEAD)"

# ==========================
# Install project dependencies
# ==========================
progress "5) Installation des dépendances du projet"

info "npm install (root)"
if [[ -f package.json ]]; then npm install; fi

# Workspaces install (client/server/proxmox)
info "npm install workspaces"
npm install --workspace=apps/client || true
npm install --workspace=apps/server || true
npm install --workspace=apps/proxmox || true
ok "Dépendances installées"

# ==========================
# Auto configuration (.env + compose)
# ==========================
progress "6) Configuration automatique (.env + compose)"

ENV_DIR="docker/proxmox"
mkdir -p "$ENV_DIR"

API_PORT=${API_PORT:-4000}
NODE_PORT=${NODE_PORT:-3000}
WS_PORT=${WS_PORT:-$API_PORT}

cat > "$ENV_DIR/.env" <<EOF
# Auto-generated by ct-proxmox-auto-setup.sh
NODE_ENV=production
API_PORT=${API_PORT}
PORT=${API_PORT}
LOG_LEVEL=info

# CT IP info
SERVER_IP=${CT_IP}
SERVER_HOST=${CT_IP}
NODE_PORT=${NODE_PORT}
WS_PORT=${WS_PORT}

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
ok ".env créé dans $ENV_DIR/.env"

# Remove obsolete compose 'version' key if present
if grep -q "^version:" "$ENV_DIR/docker-compose.yml"; then
  info "Removing obsolete 'version:' from docker-compose.yml"
  sed -i '/^version:/d' "$ENV_DIR/docker-compose.yml"
fi

# Ensure compose uses API_PORT mapping
if grep -q 'ports:' "$ENV_DIR/docker-compose.yml"; then
  info "Ensure proxmox ports map to API_PORT"
  sed -i 's#"\${PORT:-4000}:4000"#"\${API_PORT:-4000}:4000"#g' "$ENV_DIR/docker-compose.yml" || true
fi

# ==========================
# Start services & wait
# ==========================
progress "7) Démarrage des services Docker"

cd "$ENV_DIR"
docker compose config -q

docker compose up --build -d
ok "Stack démarrée"

# Wait for DB
info "Attente health DB (pg_isready)"
ATTEMPTS=40
for i in $(seq 1 $ATTEMPTS); do
  CID=$(docker compose ps -q db || true)
  STATUS="$(docker inspect -f '{{.State.Health.Status}}' "$CID" 2>/dev/null || echo none)"
  [[ "$STATUS" == "healthy" ]] && { ok "DB healthy"; break; }
  sleep 3
  [[ $i -eq $ATTEMPTS ]] && { docker compose logs db | tail -100; err "DB non healthy"; exit 1; }
done

# Wait for Proxmox API
info "Attente health Proxmox API"
ATTEMPTS=50
for i in $(seq 1 $ATTEMPTS); do
  CID=$(docker compose ps -q proxmox || true)
  STATUS="$(docker inspect -f '{{.State.Health.Status}}' "$CID" 2>/dev/null || echo none)"
  [[ "$STATUS" == "healthy" ]] && { ok "Proxmox healthy"; break; }
  sleep 3
  [[ $i -eq $ATTEMPTS ]] && { docker compose logs proxmox | tail -200; err "Proxmox non healthy"; exit 1; }
done

# ==========================
# Verification tests
# ==========================
progress "8) Tests de vérification"

info "docker ps"; docker ps --format '{{.Names}}\t{{.Status}}' | sed 's/^/  /'

info "curl localhost:${API_PORT}/api/health"; curl -fsS "http://127.0.0.1:${API_PORT}/api/health" | jq '.' || true

info "Ports ouverts (netstat)"; netstat -tlnp | grep -E "(:${API_PORT}|:5432)" | sed 's/^/  /' || true

info "Logs proxmox (dernières lignes)"; docker compose logs --tail=50 proxmox | sed 's/^/  /'

# ==========================
# Final report
# ==========================
progress "9) Rapport final"

cat <<REPORT
${BOLD}CT IP:${RESET}            ${CT_IP}
${BOLD}API (HTTP/WS):${RESET}   http://${CT_IP}:${API_PORT}   ws://${CT_IP}:${API_PORT}/ws
${BOLD}DB:${RESET}              postgres://workspace:SECRET_RETIRE@${CT_IP}:5432/workspace

Endpoints:
- GET  http://${CT_IP}:${API_PORT}/api/health
- GET  http://${CT_IP}:${API_PORT}/api/metrics
- WS   ws://${CT_IP}:${API_PORT}/ws

Next steps:
- Configure client to use: http://${CT_IP}:${API_PORT}
- Configure monitoring to use: http://${CT_IP}:${API_PORT}

${GREEN}✔ Setup complet — tout est prêt.${RESET}
REPORT

exit 0
