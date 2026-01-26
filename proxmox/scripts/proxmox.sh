
#!/usr/bin/env bash

# =============== Proxmox Backend Installer & Manager ===============
# Debian 13 Trixie
# Configuration : Admin / SECRET_RETIRE / workspace_db

set -euo pipefail
IFS=$'\n\t'

# =============== Configuration (TA CONFIG) ===============
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
  if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then systemctl stop "$SERVICE_NAME"; fi
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
  # Génération avec tes identifiants Admin / SECRET_RETIRE
  cat > "$ENV_FILE" <<EOF
# Configuration générée automatiquement par proxmox.sh

# API Configuration
NODE_ENV=production
API_PORT=${API_PORT_DEFAULT}
PORT=${API_PORT_DEFAULT}
LOG_LEVEL=info

# Database Configuration (Utilise Admin / SECRET_RETIRE)
DB_HOST=db
DB_PORT=${DB_PORT_DEFAULT}
DB_NAME=${DB_NAME_DEFAULT}
DB_USER=${DB_USER_DEFAULT}
DB_PASSWORD=${DB_PASS_DEFAULT}

# DB Pool
DB_POOL_MIN=2
DB_POOL_MAX=10

# Docker
COMPOSE_PROJECT_NAME=proxmox
EOF
  ok "Config générée (IP: $ct_ip) - User DB: $DB_USER_DEFAULT"
}

# =============== SQL Script ===============
prepare_sql_script() {
  cat <<'SQLEOF' > /tmp/proxmox_schema.sql
-- Connection à la BDD workspace_db (gérée par le flag -d de la commande shell)
\c workspace_db

-- Table utilisateurs
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Table événements (agenda)
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

-- Table messages (chat)
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  username VARCHAR(50),
  text TEXT NOT NULL,
  conversation_id INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Table lots (réception)
CREATE TABLE IF NOT EXISTS lots (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255),
  item_count INTEGER,
  description TEXT,
  status VARCHAR(50),
  received_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Table lot_items
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

-- Table marques
CREATE TABLE IF NOT EXISTS marques (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) UNIQUE NOT NULL
);

-- Table modèles
CREATE TABLE IF NOT EXISTS modeles (
  id SERIAL PRIMARY KEY,
  marque_id INTEGER REFERENCES marques(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL
);

-- Table catégories de raccourcis
CREATE TABLE IF NOT EXISTS shortcut_categories (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  order_index INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- Table raccourcis
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_events_user_id ON events(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_lot_items_lot_id ON lot_items(lot_id);
CREATE INDEX IF NOT EXISTS idx_shortcuts_user_id ON shortcuts(user_id);
SQLEOF
}

run_db_setup() {
  prepare_sql_script
  info "Configuration de la base de données (Tables)..."
  if command -v docker >/dev/null 2>&1; then
    cd "$DOCKER_DIR"
    # 1. On démarre uniquement la DB
    docker compose up -d db
    info "Attente PostgreSQL (User: $DB_USER_DEFAULT)..."
    
    # 2. On attend que la DB soit prête
    for i in {1..30}; do
      if docker compose exec -T db pg_isready -U "$DB_USER_DEFAULT" >/dev/null 2>&1; then
        ok "PostgreSQL prêt"
        break
      fi
      echo -n "."
      sleep 1
    done
    echo

    # 3. On injecte les tables dans workspace_db avec l'utilisateur Admin
    info "Injection du schéma..."
    if docker compose exec -T db psql -U "$DB_USER_DEFAULT" -d "$DB_NAME_DEFAULT" < /tmp/proxmox_schema.sql; then
        ok "Tables créées avec succès."
    else
        warn "Erreur lors de la création des tables."
    fi

    # 4. On éteint tout
    docker compose down
  else
    warn "Docker non trouvé, impossible de configurer la DB."
  fi
  rm -f /tmp/proxmox_schema.sql
}

npm_build() {
  info "Build Node.js..."
  cd "$APP_SRC_DIR"
  if [[ -f "package.json" ]]; then
    npm install --legacy-peer-deps
    npm run build
    ok "Build terminé."
  else
    warn "package.json introuvable."
  fi
}

docker_build_images() {
  info "Construction images Docker..."
  cd "$DOCKER_DIR"
  if [[ -f "docker-compose.yml" ]]; then
    docker compose build --no-cache
    ok "Images prêtes."
  else
    warn "docker-compose.yml introuvable."
  fi
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
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME"
  ok "Service Systemd activé."
}

# =============== CLI Installation ===============
install_cli() {
  info "Installation CLI..."
  cat > "$CLI_SOURCE" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
CYAN="\033[0;36m"; BLUE="\033[0;34m"; GREEN="\033[0;32m"; YELLOW="\033[1;33m"; RED="\033[0;31m"; RESET="\033[0m"; BOLD="\033[1m"

# Helpers CLI
ok() { echo -e "${GREEN}OK${RESET}   $*"; }
warn() { echo -e "${YELLOW}WARN${RESET} $*"; }
err() { echo -e "${RED}ERR${RESET}  $*"; }

SCRIPT_PATH="${BASH_SOURCE[0]}"
if [[ -L "$SCRIPT_PATH" ]]; then SCRIPT_PATH="$(readlink -f "$SCRIPT_PATH")"; fi
REPO_ROOT="$(cd "$(dirname "$SCRIPT_PATH")/../.." && pwd)"
DOCKER_DIR="$REPO_ROOT/proxmox/docker"
SERVICE_NAME="proxmox-backend"
API_URL="http://localhost:4000"

draw_table_header() {
  local border="+-------------------------+-------------------------+"
  echo "$border"
  printf "| %-23s | %-23s |\n" "$1" "$2"
  echo "$border"
}

draw_table_row() {
  printf "| %-23s | %-23s |\n" "$1" "$2"
}

draw_table_footer() {
  echo "+-------------------------+-------------------------+"
}

status_table() {
  local ip svc api_cont db_cont api_status
  ip=$(hostname -I | awk '{print $1}')
  svc=$(systemctl is-active "$SERVICE_NAME" 2>/dev/null || echo "inactive")
  
  if curl -fsS "$API_URL/api/health" >/dev/null 2>&1; then api_status="${GREEN}ONLINE${RESET}"; else api_status="${RED}OFFLINE${RESET}"; fi
  if docker ps --filter name=workspace-proxmox --format '{{.Status}}' | grep -iq "running"; then api_cont="${GREEN}RUNNING${RESET}"; else api_cont="${RED}STOPPED${RESET}"; fi
  if docker ps --filter name=workspace-db --format '{{.Status}}' | grep -iq "running"; then db_cont="${GREEN}RUNNING${RESET}"; else db_cont="${RED}STOPPED${RESET}"; fi

  echo -e "\n${CYAN}${BOLD}=== Proxmox Backend Status ===${RESET}\n"
  draw_table_header "Service" "État"
  draw_table_row "Systemd" "${svc^^}"
  draw_table_row "Container API" "$api_cont"
  draw_table_row "Container DB" "$db_cont"
  draw_table_row "API Health" "$api_status"
  draw_table_row "Accès" "http://$ip:4000"
  draw_table_footer
  echo
  
  echo -e "${BLUE}Endpoints disponibles :${RESET}"
  draw_table_header "Type" "Route"
  local endpoints=(
    "GET:/api/health"
    "GET:/api/metrics"
    "GET:/api/monitoring/stats"
    "POST:/api/auth/login"
    "POST:/api/auth/register"
    "POST:/api/auth/logout"
    "POST:/api/auth/verify"
    "GET:/api/events"
    "POST:/api/events"
    "GET:/api/messages"
    "POST:/api/messages"
    "GET:/api/lots"
    "POST:/api/lots"
    "GET:/api/shortcuts"
    "POST:/api/shortcuts"
    "GET:/api/shortcuts/categories"
    "POST:/api/shortcuts/categories"
    "GET:/api/marques"
    "GET:/api/marques/all"
    "GET:/api/agenda/events"
  )
  
  for ep in "${endpoints[@]}"; do
    IFS=':' read -r type route <<< "$ep"
    draw_table_row "$type" "http://$ip:4000$route"
  done
  draw_table_footer
  echo
}

run_tests() {
  set +e
  local user="AdminTest"
  local pass="SECRET_RETIRE"
  local token=""
  local cleanup_ids=()

  echo -e "\n${CYAN}--- [TEST API CLIENT COMPLET] ---${RESET}\n"

  echo "1. Configuration utilisateur de test..."
  curl -s -X POST "$API_URL/api/auth/register" -H "Content-Type: application/json" -d "{\"username\":\"$user\",\"password\":\"$pass\"}" >/dev/null
  ok "Utilisateur $user prêt"

  echo "2. Authentification..."
  token=$(curl -s -X POST "$API_URL/api/auth/login" -H "Content-Type: application/json" -d "{\"username\":\"$user\",\"password\":\"$pass\"}" | grep -o '"token":"[^"]*"' | cut -d '"' -f4)
  if [[ -z "$token" ]]; then 
    echo -e "${RED}Login FAIL${RESET}"; 
    return 1; 
  fi
  ok "Login OK"

  declare -A payloads
  payloads[/api/auth/login]("{\"username\":\"$user\",\"password\":\"$pass\"}")
  payloads[/api/auth/logout]("{}")
  payloads[/api/auth/verify]("{}")
  payloads[/api/events]("{\"title\":\"Test Auto\",\"start\":\"2026-01-01T10:00:00Z\",\"end\":\"2026-01-01T11:00:00Z\",\"description\":\"Test\",\"location\":\"Salle Test\"}")
  payloads[/api/marques]("{\"name\":\"TestMarque\"}")
  payloads[/api/messages]("{\"text\":\"Test cleanup\",\"pseudo\":\"AdminTest\"}")
  payloads[/api/lots]("{\"itemCount\":1,\"description\":\"Lot Test API\"}")
  payloads[/api/shortcuts]("{\"title\":\"API Test\",\"url\":\"https://test.local\"}")
  payloads[/api/shortcuts/categories]("{\"name\":\"Catégorie API\"}")

  declare -A endpoints
  endpoints[GET]="/api/health /api/metrics /api/monitoring/stats /api/events /api/messages /api/lots /api/shortcuts /api/shortcuts/categories /api/marques /api/marques/all /api/agenda/events /api/auth/verify"
  endpoints[POST]="/api/auth/login /api/auth/logout /api/auth/verify /api/events /api/messages /api/lots /api/shortcuts /api/shortcuts/categories /api/marques"

  local protected="/api/metrics /api/monitoring/stats /api/events /api/messages /api/lots /api/shortcuts /api/shortcuts/categories /api/marques /api/marques/all /api/agenda/events /api/auth/logout /api/auth/verify"

  echo "3. Tests des Endpoints..."
  for method in GET POST; do
    for ep in ${endpoints[$method]}; do
      [[ -z "$ep" ]] && continue
      local url="$API_URL$ep"
      local http_code="000"
      
      local extra_args=()
      if [[ " $protected " == *" $ep "* && -n "$token" ]]; then
        extra_args+=(-H "Authorization: Bearer $token")
      fi
      
      if [[ "$ep" == "/api/events" || "$ep" == "/api/messages" || "$ep" == "/api/shortcuts" || "$ep" == "/api/shortcuts/categories" ]]; then
        url+="?userId=1"
      fi

      if [[ "$method" == "POST" ]]; then
        local data="${payloads[$ep]:-\"{}}\""
        http_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$url" -H "Content-Type: application/json" "${extra_args[@]}" -d "$data")
      else
        http_code=$(curl -s -o /dev/null -w "%{http_code}" "$url" "${extra_args[@]}")
      fi
      
      if [[ "$http_code" == "200" || "$http_code" == "201" || "$http_code" == "204" ]]; then
        echo -e "${GREEN}OK${RESET}   $method $ep"
      else
        echo -e "${RED}FAIL${RESET} $method $ep ($http_code)"
      fi
    done
  done

  echo "4. Nettoyage..."
  code=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$API_URL/api/auth/user/$user" -H "Authorization: Bearer $token")
  if [[ "$code" == "200" || "$code" == "204" ]]; then ok "Utilisateur de test supprimé"; else warn "Suppression impossible (Code: $code)"; fi

  echo -e "\n${GREEN}--- TESTS TERMINÉS ---${RESET}\n"
  set -e
}

case "${1:-status}" in
  start|up)
    echo "Démarrage du service Systemd..."
    systemctl start "$SERVICE_NAME"
    sleep 3
    status_table ;;
  stop|down)
    systemctl stop "$SERVICE_NAME" && echo "Services arrêtés." ;;
  restart)
    systemctl restart "$SERVICE_NAME"
    sleep 3
    status_table ;;
  rebuild)
    cd "$DOCKER_DIR" && docker compose build --no-cache && systemctl restart "$SERVICE_NAME" && sleep 3 && status_table ;;
  logs)
    shift || true
    if [[ "${1:-}" == "live" ]]; then journalctl -u "$SERVICE_NAME" -f; else journalctl -u "$SERVICE_NAME" -n 50 --no-pager; fi ;;
  status|st)
    status_table ;;
  test-api)
    run_tests ;;
  help|--help|-h)
    echo "Usage: proxmox [start|stop|restart|rebuild|logs|status|test-api]" ;;
  *)
    status_table ;;
esac
EOF
  chmod +x "$CLI_SOURCE"
  ln -sf "$CLI_SOURCE" "$GLOBAL_CLI"
  ok "CLI installée."
}

# =============== Main Commands ===============

cmd_install() {
  require_root
  log "=== DÉBUT DE L'INSTALLATION ==="
  ensure_paths
  stop_and_clean
  git_update
  generate_env
  npm_build
  docker_build_images
  run_db_setup
  install_systemd
  install_cli

  echo ""
  ok "=== INSTALLATION TERMINÉE (SERVICES OFF) ==="
  warn "Pour démarrer : ${GREEN}proxmox start${RESET}"
  info "Pour tester :  ${GREEN}proxmox test-api${RESET}"
}

cmd_start() { require_root; systemctl start "$SERVICE_NAME"; sleep 3; /usr/local/bin/proxmox status; }
cmd_stop() { require_root; systemctl stop "$SERVICE_NAME"; ok "Arrêté."; }
cmd_restart() { require_root; systemctl restart "$SERVICE_NAME"; sleep 3; /usr/local/bin/proxmox status; }
cmd_rebuild() { 
  require_root; 
  cmd_stop
  cd "$DOCKER_DIR" && docker compose build --no-cache
  cmd_start
}
cmd_logs() { 
  if [[ "${1:-}" == "live" ]]; then 
    journalctl -u "$SERVICE_NAME" -f; 
  else 
    journalctl -u "$SERVICE_NAME" -n 100 --no-pager; 
  fi 
}
cmd_status() { /usr/local/bin/proxmox status; }
cmd_test() { /usr/local/bin/proxmox test-api; }

# =============== Entry Point ===============
COMMAND="${1:-help}"
case "$COMMAND" in
  install) cmd_install ;;
  start|up) cmd_start ;;
  stop|down) cmd_stop ;;
  restart) cmd_restart ;;
  rebuild) cmd_rebuild ;;
  logs) shift || true; cmd_logs "$@" ;;
  status|st) cmd_status ;;
  test-api) cmd_test ;;
  help|--help|-h|*)
    cat <<EOF
Usage: $0 [install|start|stop|restart|rebuild|logs|status|test-api]

Commandes :
  install      Installation propre complète (State: OFF au final)
  start        Démarrer le service (Systemd + Docker)
  stop         Arrêter les services
  restart      Redémarrer
  rebuild      Rebuild images et redémarrer
  logs         Voir les logs (ajouter 'live')
  status       Tableau de statut complet + Endpoints
  test-api     Test client complet (AdminTest) + Nettoyage auto
EOF
    ;;
esac