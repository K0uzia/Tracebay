

L'erreur que tu vois (`line 3: $'Cest not\303\251... command not found`) indique que le fichier `proxmox.sh` sur ta machine est **corrompu** ou contient du texte en clair (probablement mon explication "C'est noté...") au lieu du code Bash.

Cela arrive souvent lors d'un copier-coller manuel ou si le fichier sur le dépôt git n'est pas à jour.

On va **écraser** le fichier actuel avec la version propre définitive. Exécute ces commandes dans `/workspace` :

```bash
cd /workspace

# On écrase le fichier corrompu avec la version propre via 'cat'
cat > proxmox/scripts/proxmox.sh << 'EOF'
#!/usr/bin/env bash

# =============== Proxmox Backend Installer & Manager ===============
# Debian 13 Trixie
set -euo pipefail
IFS=$'\n\t'

# =============== Configuration ===============
DB_USER_DEFAULT="proxmox_user"
DB_PASS_DEFAULT="proxmox_password"
DB_NAME_DEFAULT="proxmox_db"
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
  if [[ $EUID -ne 0 ]]; then err "Ce script doit être exécuté en tant que root (ou via sudo)."; fi
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
    git reset --hard HEAD
    git pull origin proxmox || git pull origin main || warn "Git pull échoué."
  fi
}

generate_env() {
  info "Génération de la configuration (.env)"
  local ct_ip=$(get_ip)
  cat > "$ENV_FILE" <<EOF
NODE_ENV=production
API_PORT=${API_PORT_DEFAULT}
API_HOST=0.0.0.0
DB_HOST=db
DB_PORT=${DB_PORT_DEFAULT}
DB_NAME=${DB_NAME_DEFAULT}
DB_USER=${DB_USER_DEFAULT}
DB_PASSWORD=${DB_PASS_DEFAULT}
COMPOSE_PROJECT_NAME=proxmox
EOF
  ok "Config générée (IP: $ct_ip)"
}

# =============== SQL Script ===============
prepare_sql_script() {
  cat <<'SQLEOF' > /tmp/proxmox_install.sql
CREATE USER proxmox_user WITH PASSWORD 'proxmox_password';
CREATE DATABASE proxmox_db OWNER proxmox_user;
GRANT ALL PRIVILEGES ON DATABASE proxmox_db TO proxmox_user;
\c proxmox_db

CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username VARCHAR(50) UNIQUE NOT NULL, password VARCHAR(255), created_at TIMESTAMP DEFAULT NOW());
CREATE TABLE IF NOT EXISTS events (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, username VARCHAR(50), title VARCHAR(255) NOT NULL, start TIMESTAMP NOT NULL, "end" TIMESTAMP NOT NULL, description TEXT, location VARCHAR(255), created_at TIMESTAMP DEFAULT NOW());
CREATE TABLE IF NOT EXISTS messages (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE SET NULL, username VARCHAR(50), text TEXT NOT NULL, conversation_id INTEGER, created_at TIMESTAMP DEFAULT NOW());
CREATE TABLE IF NOT EXISTS lots (id SERIAL PRIMARY KEY, name VARCHAR(255), item_count INTEGER, description TEXT, status VARCHAR(50), received_at TIMESTAMP DEFAULT NOW(), created_at TIMESTAMP DEFAULT NOW());
CREATE TABLE IF NOT EXISTS lot_items (id SERIAL PRIMARY KEY, lot_id INTEGER REFERENCES lots(id) ON DELETE CASCADE, serial_number VARCHAR(255), type VARCHAR(50), marque_id INTEGER, modele_id INTEGER, entry_type VARCHAR(50), entry_date DATE, entry_time TIME);
CREATE TABLE IF NOT EXISTS marques (id SERIAL PRIMARY KEY, name VARCHAR(255) UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS modeles (id SERIAL PRIMARY KEY, marque_id INTEGER REFERENCES marques(id) ON DELETE CASCADE, name VARCHAR(255) NOT NULL);
CREATE TABLE IF NOT EXISTS shortcut_categories (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, name VARCHAR(255) NOT NULL, order_index INTEGER, created_at TIMESTAMP DEFAULT NOW(), UNIQUE(user_id, name));
CREATE TABLE IF NOT EXISTS shortcuts (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, title VARCHAR(255) NOT NULL, description TEXT, url VARCHAR(255) NOT NULL, category_id INTEGER REFERENCES shortcut_categories(id) ON DELETE SET NULL, order_index INTEGER, created_at TIMESTAMP DEFAULT NOW());

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
    for i in {1..20}; do docker compose exec -T db pg_isready -U "$DB_USER_DEFAULT" >/dev/null 2>&1 && break || sleep 1; done
    docker compose exec -T db psql -U postgres < /tmp/proxmox_install.sql && ok "Base configurée (Docker)."
    docker compose down
  else
    sudo -u postgres psql -f /tmp/proxmox_install.sql && ok "Base configurée (Natif)."
  fi
  rm -f /tmp/proxmox_install.sql
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
  if docker ps --filter name=proxmox --format '{{.Status}}' | grep -iq "running"; then api_cont="${GREEN}RUNNING${RESET}"; else api_cont="${RED}STOPPED${RESET}"; fi
  if docker ps --filter name=proxmox --format '{{.Names}}' | grep -iq "db"; then db_cont="${GREEN}RUNNING${RESET}"; else db_cont="${RED}STOPPED${RESET}"; fi

  echo -e "\n${CYAN}${BOLD}=== Proxmox Backend Status ===${RESET}\n"
  draw_table_header "Service" "État"
  draw_table_row "Systemd" "${svc^^}"
  draw_table_row "Container API" "$api_cont"
  draw_table_row "Container DB" "$db_cont"
  draw_table_row "API Health" "$api_status"
  draw_table_row "Accès" "http://$ip:4000"
  draw_table_footer
  echo
}

run_tests() {
  set +e
  local user="AdminTest"
  local pass="SECRET_RETIRE"
  local token=""
  local cleanup_ids=()

  echo -e "\n${CYAN}--- [TEST API CLIENT] ---${RESET}\n"

  echo "1. Configuration utilisateur de test..."
  curl -s -X POST "$API_URL/api/auth/register" -H "Content-Type: application/json" -d "{\"username\":\"$user\",\"password\":\"$pass\"}" >/dev/null
  ok "Utilisateur $user prêt"

  echo "2. Authentification..."
  token=$(curl -s -X POST "$API_URL/api/auth/login" -H "Content-Type: application/json" -d "{\"username\":\"$user\",\"password\":\"$pass\"}" | grep -o '"token":"[^"]*"' | cut -d '"' -f4)
  if [[ -z "$token" ]]; then echo -e "${RED}Login FAIL${RESET}"; return 1; fi
  ok "Login OK"

  echo "3. Tests d'écriture (DB)..."
  echo -n "   - Création Event ... "
  res_ev=$(curl -s -X POST "$API_URL/api/events" -H "Content-Type: application/json" -H "Authorization: Bearer $token" -d '{"title":"Test API Auto","start":"2026-01-01T10:00:00Z","end":"2026-01-01T11:00:00Z","description":"Test","location":"Salle Test"}')
  ev_id=$(echo "$res_ev" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
  if [[ "$ev_id" =~ ^[0-9]+$ ]]; then 
    echo -e "${GREEN}OK (ID: $ev_id)${RESET}"; cleanup_ids+=("events:$ev_id"); 
  else echo -e "${RED}FAIL${RESET}"; fi

  echo -n "   - Création Message ... "
  res_msg=$(curl -s -X POST "$API_URL/api/messages" -H "Content-Type: application/json" -H "Authorization: Bearer $token" -d '{"text":"Test cleanup","pseudo":"AdminTest"}')
  msg_id=$(echo "$res_msg" | grep -o '"id":[0-9]*' | head -1 | cut -d: -f2)
  if [[ "$msg_id" =~ ^[0-9]+$ ]]; then 
    echo -e "${GREEN}OK (ID: $msg_id)${RESET}"; cleanup_ids+=("messages:$msg_id"); 
  else echo -e "${RED}FAIL${RESET}"; fi

  echo "4. Tests de lecture..."
  curl -s -X GET "$API_URL/api/health" >/dev/null && echo -n "   GET /health ... " && echo -e "${GREEN}OK${RESET}" || echo -e "${RED}FAIL${RESET}"
  curl -s -X GET "$API_URL/api/messages" -H "Authorization: Bearer $token" >/dev/null && echo -n "   GET /messages ... " && echo -e "${GREEN}OK${RESET}" || echo -e "${RED}FAIL${RESET}"

  echo "5. Nettoyage..."
  for item in "${cleanup_ids[@]}"; do
    IFS=':' read -r type id <<< "$item"
    echo -n "   - Suppression $type id:$id ... "
    code=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$API_URL/api/$type/$id" -H "Authorization: Bearer $token")
    if [[ "$code" == "200" || "$code" == "204" ]]; then echo -e "${GREEN}OK${RESET}"; else echo -e "SKIP ($code)"; fi
  done
  echo -e "\n${GREEN}--- TESTS TERMINÉS ---${RESET}\n"
  set -e
}

case "${1:-status}" in
  start|up)
    echo "Démarrage du service Systemd..."
    systemctl start "$SERVICE_NAME"
    sleep 2
    status_table ;;
  stop|down)
    systemctl stop "$SERVICE_NAME" && echo "Services arrêtés." ;;
  restart)
    systemctl restart "$SERVICE_NAME"
    sleep 2
    status_table ;;
  rebuild)
    cd "$DOCKER_DIR" && docker compose build --no-cache && systemctl restart "$SERVICE_NAME" && sleep 2 && status_table ;;
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

cmd_start() { require_root; systemctl start "$SERVICE_NAME"; sleep 2; /usr/local/bin/proxmox status; }
cmd_stop() { require_root; systemctl stop "$SERVICE_NAME"; ok "Arrêté."; }
cmd_restart() { require_root; systemctl restart "$SERVICE_NAME"; sleep 2; /usr/local/bin/proxmox status; }
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
  status       Tableau de statut propre
  test-api     Test client complet (AdminTest) + Nettoyage auto
EOF
    ;;
esac
EOF

# On rend le script exécutable
chmod +x proxmox/scripts/proxmox.sh
echo "Script corrigé et sauvegardé."

# Maintenant on relance l'installation
bash proxmox/scripts/proxmox.sh install
```