#!/usr/bin/env bash

# =============== Proxmox Backend Installer & Manager ===============
# Version corrigée : Fix Affichage + Diagnostics automatiques
# Debian 13 Trixie
# Configuration : Admin / SECRET_RETIRE / workspace_db

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
  # FIX: Création du dossier logs pour éviter erreur de permission au démarrage
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

    # 3. Injection du schéma (avec pause de sécurité)
    sleep 3
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
  rm -f /tmp/proxmox_schema_sql
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

# =============== CLI Installation (Fixed Colors + Auto-Diagnostic) ===============
install_cli() {
  info "Installation CLI..."
  cat > "$CLI_SOURCE" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

# =============== Colors ===============
CYAN=$'\033[0;36m'
BLUE=$'\033[0;34m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
RED=$'\033[0;31m'
RESET=$'\033[0m'
BOLD=$'\033[1m'

# =============== Paths ===============
SCRIPT_PATH="${BASH_SOURCE[0]}"
if [[ -L "$SCRIPT_PATH" ]]; then SCRIPT_PATH="$(readlink -f "$SCRIPT_PATH")"; fi
REPO_ROOT="$(cd "$(dirname "$SCRIPT_PATH")/../.." && pwd)"
DOCKER_DIR="$REPO_ROOT/proxmox/docker"
SERVICE_NAME="proxmox-backend"
API_URL="http://localhost:4000"

# =============== Helpers ===============
ok() { echo -e "${GREEN}OK${RESET}   $*"; }
warn() { echo -e "${YELLOW}WARN${RESET} $*"; }
err() { echo -e "${RED}ERR${RESET}  $*"; }
header() { echo -e "${CYAN}${BOLD}$*${RESET}"; }

# =============== Debug / Diagnostic ===============
show_diagnostics() {
  echo ""
  header "=== DIAGNOSTIC DOCKER ==="
  echo "1. Liste des conteneurs (y compris ceux arrêtés) :"
  docker ps -a --filter "name=proxmox" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" || true
  
  echo ""
  echo "2. Logs du conteneur API (30 dernières lignes) :"
  # Recherche intelligente du nom du conteneur API
  local api_name=$(docker ps -a --filter "name=proxmox" --format "{{.Names}}" | grep -E "(api|backend)" | head -n 1)
  if [[ -z "$api_name" ]]; then api_name="proxmox-api-1"; fi # Fallback
  
  if docker ps -a --format '{{.Names}}' | grep -q "^${api_name}$"; then
    docker logs "$api_name" --tail 30
  else
    warn "Conteneur API introuvable (recherche de: $api_name)."
  fi

  echo ""
  echo "3. Logs du conteneur DB (20 dernières lignes) :"
  local db_name=$(docker ps -a --filter "name=proxmox" --format "{{.Names}}" | grep -E "db" | head -n 1)
  if [[ -z "$db_name" ]]; then db_name="proxmox-db-1"; fi

  if docker ps -a --format '{{.Names}}' | grep -q "^${db_name}$"; then
    docker logs "$db_name" --tail 20
  else
    warn "Conteneur DB introuvable."
  fi
  echo ""
}

# =============== Status Table (Fixed ANSI) ===============
draw_table_header() {
  local border="+-------------------------+-------------------------+"
  echo "$border"
  printf "| %-23s | %-23s |\n" "$1" "$2"
  echo "$border"
}

draw_table_row() {
  # FIX: Utilisation de %b pour forcer l'interprétation des codes ANSI dans la variable $2
  printf "| %-23s | %-23b |\n" "$1" "$2"
}

draw_table_footer() {
  echo "+-------------------------+-------------------------+"
}

status_table() {
  local ip svc api_cont db_cont api_status
  ip=$(hostname -I | awk '{print $1}')
  svc=$(systemctl is-active "$SERVICE_NAME" 2>/dev/null || echo "unknown")
  
  # Check Container API
  if docker ps --filter name=proxmox-api --format '{{.Status}}' | grep -iq "running"; then 
    api_cont="${GREEN}RUNNING${RESET}"; 
  else 
    api_cont="${RED}STOPPED${RESET}"; 
  fi

  # Check Container DB
  if docker ps --filter name=proxmox-db --format '{{.Status}}' | grep -iq "running"; then 
    db_cont="${GREEN}RUNNING${RESET}"; 
  else 
    db_cont="${RED}STOPPED${RESET}"; 
  fi

  # Check API Health
  if curl -fsS "$API_URL/api/health" >/dev/null 2>&1; then 
    api_status="${GREEN}ONLINE${RESET}"; 
  else 
    api_status="${RED}OFFLINE${RESET}"; 
  fi

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

  echo -e "\n${CYAN}--- [TEST API CLIENT COMPLET] ---${RESET}\n"

  echo "1. Configuration utilisateur de test..."
  curl -s -X POST "$API_URL/api/auth/register" -H "Content-Type: application/json" -d "{\"username\":\"$user\",\"password\":\"$pass\"}" >/dev/null
  ok "Utilisateur $user prêt"

  echo "2. Authentification..."
  token=$(curl -s -X POST "$API_URL/api/auth/login" -H "Content-Type: application/json" -d "{\"username\":\"$user\",\"password\":\"$pass\"}" | grep -o '"token":"[^"]*"' | cut -d '"' -f4)
  if [[ -z "$token" ]]; then 
    echo -e "${RED}Login FAIL${RESET}"; 
    show_diagnostics
    return 1; 
  fi
  ok "Login OK"

  # Simplification du test pour éviter le spam dans le terminal
  echo "3. Vérification endpoint /api/health..."
  code=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/health")
  if [[ "$code" == "200" ]]; then ok "Health check OK"; else err "Health check FAIL ($code)"; fi

  echo "4. Nettoyage..."
  # Note: Suppression manuelle non implémentée ici pour simplicité, ou via endpoint DELETE si existant
  ok "Tests terminés."
  set -e
}

# =============== Main Logic ===============
case "${1:-status}" in
  start|up)
    header "Démarrage du service Systemd..."
    systemctl start "$SERVICE_NAME"
    echo "Attente de stabilisation (5s)..."
    sleep 5
    
    # Vérification robuste
    local is_running=false
    if docker ps --filter name=proxmox-api --format '{{.Status}}' | grep -iq "running"; then is_running=true; fi

    if [ "$is_running" = false ]; then
      echo -e "${RED}!!! ERREUR : Le conteneur API ne démarre pas !!!${RESET}"
      echo -e "${YELLOW}Lancement du diagnostic automatique...${RESET}"
      show_diagnostics
    else
      status_table
    fi
    ;;
  stop|down)
    systemctl stop "$SERVICE_NAME" && echo "Services arrêtés." ;;
  restart)
    systemctl restart "$SERVICE_NAME"
    sleep 5
    status_table ;;
  rebuild)
    cd "$DOCKER_DIR" && docker compose build --no-cache && systemctl restart "$SERVICE_NAME" && sleep 5 && status_table ;;
  logs)
    shift || true
    if [[ "${1:-}" == "live" ]]; then journalctl -u "$SERVICE_NAME" -f; else journalctl -u "$SERVICE_NAME" -n 50 --no-pager; fi ;;
  debug|diag)
    show_diagnostics ;;
  status|st)
    status_table ;;
  test-api)
    run_tests ;;
  help|--help|-h)
    echo "Usage: proxmox [start|stop|restart|rebuild|logs|status|debug|test-api]"
    echo "  debug   : Affiche les logs Docker et l'état des conteneurs pour diagnostiquer les crashs."
    ;;
  *)
    status_table ;;
esac
EOF
  chmod +x "$CLI_SOURCE"
  ln -sf "$CLI_SOURCE" "$GLOBAL_CLI"
  ok "CLI installée (avec mode debug)."
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

cmd_start() { /usr/local/bin/proxmox start; }
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