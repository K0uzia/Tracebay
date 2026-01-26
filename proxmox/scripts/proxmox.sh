#!/usr/bin/env bash

# =============== Proxmox Backend Installer & Manager ===============
# Version 2.0 : Reset Complet CLI + Détection Logs Crash
# Debian 13 Trixie

set -euo pipefail
IFS=$'\n\t'

# =============== Configuration ===============
DB_NAME_DEFAULT="workspace_db"
DB_USER_DEFAULT="Admin"
DB_PASS_DEFAULT="SECRET_RETIRE"
DB_PORT_DEFAULT=5432
API_PORT_DEFAULT=4000

# =============== Colors ===============
CYAN="\033[0;36m"; BLUE="\033[0;34m"; GREEN="\033[0;32m"; YELLOW="\033[1;33m"; RED="\033[0;31m"; RESET="\033[0m"; BOLD="\033[1m"

# =============== Paths ===============
SCRIPT_PATH="${BASH_SOURCE[0]}"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DOCKER_DIR="$REPO_ROOT/proxmox/docker"
APP_SRC_DIR="$REPO_ROOT/proxmox/app"
SERVICE_NAME="proxmox-backend"
GLOBAL_CLI="/usr/local/bin/proxmox"
CLI_SOURCE="/usr/local/lib/proxmox-cli.sh"
ENV_FILE="$DOCKER_DIR/.env"

# =============== Logging ===============
log() { echo -e "${CYAN}[proxmox]${RESET} $*"; }
info() { echo -e "${BLUE}INFO${RESET} $*"; }
ok() { echo -e "${GREEN}OK${RESET}   $*"; }
warn() { echo -e "${YELLOW}WARN${RESET} $*"; }
err() { echo -e "${RED}ERR${RESET}  $*"; exit 1; }

# =============== Helpers ===============
require_root() {
  if [[ $EUID -ne 0 ]]; then err "Ce script doit être exécuté en tant que root."; fi
}

get_ip() { hostname -I | awk '{print $1}'; }

stop_and_clean() {
  warn "Arrêt et Nettoyage complet..."
  systemctl stop "$SERVICE_NAME" 2>/dev/null || true
  if [[ -f "$DOCKER_DIR/docker-compose.yml" ]]; then
    cd "$DOCKER_DIR"
    docker compose down -v --remove-orphans 2>/dev/null || true
  fi
  ok "Nettoyage terminé."
}

ensure_paths() {
  if [[ ! -d "$APP_SRC_DIR" ]]; then err "Répertoire source introuvable: $APP_SRC_DIR"; fi
  mkdir -p "$DOCKER_DIR"
  mkdir -p "$(dirname "$CLI_SOURCE")"
  mkdir -p "$DOCKER_DIR/logs"
}

git_update() {
  if [[ -d "$REPO_ROOT/.git" ]]; then
    info "Mise à jour du dépôt Git..."
    cd "$REPO_ROOT"
    git fetch --all
    git reset --hard origin/proxmox || git reset --hard origin/main || true
  fi
}

generate_env() {
  info "Génération de la configuration (.env)"
  local ct_ip=$(get_ip)
  cat > "$ENV_FILE" <<EOF
# Configuration générée automatiquement par proxmox.sh
NODE_ENV=production
API_PORT=${API_PORT_DEFAULT}
PORT=${API_PORT_DEFAULT}
LOG_LEVEL=info
DB_HOST=db
DB_PORT=${DB_PORT_DEFAULT}
DB_NAME=${DB_NAME_DEFAULT}
DB_USER=${DB_USER_DEFAULT}
DB_PASSWORD=${DB_PASS_DEFAULT}
DB_POOL_MIN=2
DB_POOL_MAX=10
COMPOSE_PROJECT_NAME=proxmox
EOF
  ok "Config générée (IP: $ct_ip)"
}

# =============== SQL Script ===============
prepare_sql_script() {
  cat <<'SQLEOF' > /tmp/proxmox_schema.sql
\c workspace_db
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE,
  password VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  username VARCHAR(50),
  title VARCHAR(255) NOT NULL,
  start TIMESTAMP NOT NULL,
  "end" TIMESTAMP NOT NULL,
  description TEXT,
  location VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  username VARCHAR(50),
  text TEXT NOT NULL,
  conversation_id INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS lots (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255),
  item_count INTEGER,
  description TEXT,
  status VARCHAR(50),
  received_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS lot_items (
  id SERIAL PRIMARY KEY,
  lot_id INTEGER REFERENCES lots(id) ON DELETE CASCADE,
  serial_number VARCHAR(255),
  type VARCHAR(50),
  marque_id INTEGER,
  modele_id INTEGER,
  entry_type VARCHAR(50),
  entry_date DATE,
  entry_time TIME
);
CREATE TABLE IF NOT EXISTS marques (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) UNIQUE NOT NULL
);
CREATE TABLE IF NOT EXISTS modeles (
  id SERIAL PRIMARY KEY,
  marque_id INTEGER REFERENCES marques(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL
);
CREATE TABLE IF NOT EXISTS shortcut_categories (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  order_index INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, name)
);
CREATE TABLE IF NOT EXISTS shortcuts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  url VARCHAR(255) NOT NULL,
  category_id INTEGER REFERENCES shortcut_categories(id) ON DELETE SET NULL,
  order_index INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_events_user_id ON events(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_lot_items_lot_id ON lot_items(lot_id);
CREATE INDEX IF NOT EXISTS idx_shortcuts_user_id ON shortcuts(user_id);
SQLEOF
}

run_db_setup() {
  prepare_sql_script
  info "Configuration de la base de données..."
  if command -v docker >/dev/null 2>&1; then
    cd "$DOCKER_DIR"
    docker compose up -d db
    info "Attente PostgreSQL..."
    for i in {1..30}; do
      if docker compose exec -T db pg_isready -U "$DB_USER_DEFAULT" >/dev/null 2>&1; then
        ok "PostgreSQL prêt"; break
      fi
      echo -n "."; sleep 1
    done
    echo
    sleep 2
    docker compose exec -T db psql -U "$DB_USER_DEFAULT" -d "$DB_NAME_DEFAULT" < /tmp/proxmox_schema.sql && ok "Tables créées." || warn "Erreur Tables."
    docker compose down
  fi
  rm -f /tmp/proxmox_schema_sql
}

npm_build() {
  info "Build Node.js..."
  cd "$APP_SRC_DIR"
  npm install --legacy-peer-deps && npm run build
  ok "Build terminé."
}

docker_build_images() {
  info "Construction images..."
  cd "$DOCKER_DIR"
  docker compose build --no-cache
  ok "Images prêtes."
}

install_systemd() {
  info "Configuration Systemd..."
  cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=Proxmox Backend (Docker)
After=network-online.target docker.service
Wants=network-online.target docker.service
[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${DOCKER_DIR}
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=0
[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME"
  ok "Service activé."
}

install_cli() {
  info "Installation CLI (V2)..."
  # On force l'écrasement
  cat > "$CLI_SOURCE" <<'CLISCRIPT'
#!/usr/bin/env bash
set -euo pipefail

CYAN=$'\033[0;36m'; BLUE=$'\033[0;34m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'; RED=$'\033[0;31m'; RESET=$'\033[0m'; BOLD=$'\033[1m'

ok() { echo -e "${GREEN}OK${RESET}   $*"; }
warn() { echo -e "${YELLOW}WARN${RESET} $*"; }
err() { echo -e "${RED}ERR${RESET}  $*"; }
header() { echo -e "${CYAN}${BOLD}$*${RESET}"; }

# Fonction robuste pour trouver l'API
get_api_name() {
  docker ps -a --format "{{.Names}}" | grep -E "workspace-proxmox|proxmox.*api" | head -1
}
# Fonction robuste pour trouver la DB
get_db_name() {
  docker ps -a --format "{{.Names}}" | grep -E "workspace-db|proxmox.*db" | head -1
}

show_diagnostics() {
  echo ""
  header "=== DIAGNOSTIC DOCKER ==="
  api_name=$(get_api_name)
  db_name=$(get_db_name)
  
  echo "1. Conteneurs détectés :"
  docker ps -a --filter "name=proxmox" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" || true
  echo ""
  
  echo "2. Logs API (${api_name:-Inconnu}) :"
  if [[ -n "$api_name" ]]; then
    docker logs "$api_name" --tail 50
  else
    warn "Impossible de trouver le conteneur API."
  fi
  echo ""
  
  echo "3. Logs DB (${db_name:-Inconnu}) :"
  if [[ -n "$db_name" ]]; then
    docker logs "$db_name" --tail 20
  else
    warn "Impossible de trouver le conteneur DB."
  fi
  echo ""
}

status_table() {
  api_name=$(get_api_name)
  db_name=$(get_db_name)
  
  api_status="${RED}STOPPED${RESET}"
  db_status="${RED}STOPPED${RESET}"
  sys_status=$(systemctl is-active proxmox-backend 2>/dev/null || echo "unknown")
  
  if [[ -n "$api_name" ]] && docker inspect "$api_name" --format '{{.State.Status}}' | grep -iq "running"; then api_status="${GREEN}RUNNING${RESET}"; fi
  if [[ -n "$db_name" ]] && docker inspect "$db_name" --format '{{.State.Status}}' | grep -iq "running"; then db_status="${GREEN}RUNNING${RESET}"; fi
  
  ip=$(hostname -I | awk '{print $1}')
  echo -e "\n${CYAN}${BOLD}=== Proxmox Status ===${RESET}\n"
  echo "Systemd: ${sys_status^^}"
  echo "API:     $api_status ($api_name)"
  echo "DB:      $db_status ($db_name)"
  echo "URL:     http://$ip:4000"
  echo ""
}

run_tests() {
  set +e
  header "=== TEST API ==="
  echo "1. Register Test User..."
  curl -s -X POST "http://localhost:4000/api/auth/register" -H "Content-Type: application/json" -d '{"username":"AdminTest","password":"SECRET_RETIRE"}' > /dev/null
  ok "User Ready"
  
  echo "2. Login..."
  resp=$(curl -s -X POST "http://localhost:4000/api/auth/login" -H "Content-Type: application/json" -d '{"username":"AdminTest","password":"SECRET_RETIRE"}')
  if echo "$resp" | grep -q "token"; then
    ok "Login SUCCESS"
  else
    err "Login FAIL"
    show_diagnostics
  fi
  set -e
}

# Commande principale
cmd="${1:-status}"
case "$cmd" in
  start)
    header "Démarrage Systemd..."
    systemctl start proxmox-backend
    sleep 5
    # Vérification sans 'local'
    is_running=false
    api_name=$(get_api_name)
    if [[ -n "$api_name" ]] && docker inspect "$api_name" --format '{{.State.Status}}' | grep -iq "running"; then
      is_running=true
    fi
    
    if [[ "$is_running" == "false" ]]; then
      echo -e "${RED}CRASH OU ÉCHEC AU DÉMARRAGE${RESET}"
      show_diagnostics
    else
      status_table
    fi
    ;;
  stop) systemctl stop proxmox-backend && ok "Arrêté." ;;
  restart) 
    systemctl restart proxmox-backend 
    sleep 5 
    status_table 
    ;;
  status) status_table ;;
  debug) show_diagnostics ;;
  test-api) run_tests ;;
  *) 
    echo "Usage: proxmox [start|stop|restart|status|debug|test-api]"
    echo "  debug : Affiche les logs bruts pour identifier les crashs"
    ;;
esac
CLISCRIPT

  chmod +x "$CLI_SOURCE"
  # Force le symlink
  ln -sf "$CLI_SOURCE" "$GLOBAL_CLI"
  ok "CLI installée."
}

# =============== Main ===============
cmd_install() {
  require_root
  log "=== INSTALLATION V2 ==="
  stop_and_clean
  ensure_paths
  git_update
  generate_env
  npm_build
  docker_build_images
  run_db_setup
  install_systemd
  install_cli
  ok "Installation terminée."
}

cmd_start() { /usr/local/bin/proxmox start; }
cmd_stop() { require_root; systemctl stop "$SERVICE_NAME"; ok "Arrêté."; }
cmd_restart() { require_root; systemctl restart "$SERVICE_NAME"; sleep 3; /usr/local/bin/proxmox status; }
cmd_status() { /usr/local/bin/proxmox status; }
cmd_debug() { /usr/local/bin/proxmox debug; }

COMMAND="${1:-help}"
case "$COMMAND" in
  install) cmd_install ;;
  start) cmd_start ;;
  stop) cmd_stop ;;
  restart) cmd_restart ;;
  status) cmd_status ;;
  debug) cmd_debug ;;
  *) echo "Usage: $0 [install|start|stop|restart|status|debug]" ;;
esac