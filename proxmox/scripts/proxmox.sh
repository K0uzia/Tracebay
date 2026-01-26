# =============== Native PostgreSQL install (no Docker) ===============
install_postgres_native() {
  info "Installation de la base PostgreSQL (mode natif, hors Docker)"
  local sql_file="$REPO_ROOT/proxmox/app/db/install_postgres.sql"
  if ! command -v psql >/dev/null 2>&1; then
    err "psql n'est pas installé. Installez PostgreSQL (apt install postgresql)"
  fi
  if [[ ! -f "$sql_file" ]]; then
    err "Script SQL introuvable: $sql_file"
  fi
  sudo -u postgres psql -f "$sql_file" && ok "Base et tables créées (PostgreSQL natif)"
}
#!/usr/bin/env bash

# Proxmox Backend Installer & Manager (Debian 13 Trixie)
# All assets and configs stay within the repo tree.

set -euo pipefail
IFS=$'\n\t'

# =============== Colors (no emojis) ===============
CYAN="\033[0;36m"; BLUE="\033[0;34m"; GREEN="\033[0;32m"; YELLOW="\033[1;33m"; RED="\033[0;31m"; RESET="\033[0m"; BOLD="\033[1m"

log() { echo -e "${CYAN}[proxmox]${RESET} $*"; }
info() { echo -e "${BLUE}INFO${RESET} $*"; }
ok() { echo -e "${GREEN}OK${RESET}   $*"; }
warn() { echo -e "${YELLOW}WARN${RESET} $*"; }
err() { echo -e "${RED}ERR${RESET}  $*"; exit 1; }

# =============== Paths detection ===============
SCRIPT_PATH="${BASH_SOURCE[0]}"
SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# discover key paths
find_path() {
  local name="$1"; shift
    set +e
    local api_url="http://localhost:4000"
    echo "--- [TEST API] ---"
    # Utilisateur de test
    local test_user="Test_Admin"
    local test_pass="Test@123"
    # 1. Login pour obtenir un token
    token=$(curl -s -X POST "$api_url/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"'$test_user'","password":"'$test_pass'"}' | grep -o '"token":"[^"]*"' | cut -d '"' -f4)
    # Si login échoue, tente de créer le compte
    if [[ -z "$token" ]]; then
      echo "[INFO] Création du compte de test $test_user..."
      curl -s -X POST "$api_url/api/auth/register" -H 'Content-Type: application/json' -d '{"username":"'$test_user'","password":"'$test_pass'"}' >/dev/null
      # Re-tente le login
      token=$(curl -s -X POST "$api_url/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"'$test_user'","password":"'$test_pass'"}' | grep -o '"token":"[^"]*"' | cut -d '"' -f4)
    fi
    if [[ -z "$token" ]]; then echo "[FAIL] Login impossible, tests protégés ignorés"; fi

    # 2. Définir les endpoints et payloads
    declare -A endpoints
    endpoints[GET]="/api/health /api/metrics /api/monitoring/stats /api/events /api/messages /api/lots /api/shortcuts /api/shortcuts/categories /api/marques /api/marques/all /api/agenda/events"
    endpoints[POST]="/api/auth/login /api/auth/logout /api/auth/verify /api/events /api/messages /api/lots /api/shortcuts /api/shortcuts/categories"

    # Payloads valides pour chaque POST
    declare -A payloads
    payloads[/api/auth/login]='{"username":"'$test_user'","password":"'$test_pass'"}'
    payloads[/api/auth/logout]='{}'
    payloads[/api/auth/verify]='{}'
    payloads[/api/events]='{"title":"Réunion API","start":"2026-01-26T10:00:00Z","end":"2026-01-26T11:00:00Z","description":"Test automatique","location":"Salle API"}'
    payloads[/api/messages]='{"text":"Ceci est un test API","pseudo":"'$test_user'"}'
    payloads[/api/lots]='{"itemCount":1,"description":"Lot test via API"}'
    payloads[/api/shortcuts]='{"title":"API Test","url":"https://test.local"}'
    payloads[/api/shortcuts/categories]='{"name":"Catégorie API"}'

    # Endpoints nécessitant Authorization
    protected="/api/metrics /api/monitoring/stats /api/events /api/messages /api/lots /api/shortcuts /api/shortcuts/categories /api/marques /api/marques/all /api/agenda/events /api/auth/logout /api/auth/verify"

    for method in GET POST; do
      for ep in ${endpoints[$method]}; do
        if [[ -z "$ep" ]]; then continue; fi
        extra_args=()
        # Ajout du token si protégé
        if [[ " $protected " == *" $ep "* && -n "$token" ]]; then
          extra_args+=( -H "Authorization: Bearer $token" )
        fi
        # Ajout userId dans query si events/messages/shortcuts
        url="$api_url$ep"
        if [[ "$ep" == "/api/events" || "$ep" == "/api/messages" || "$ep" == "/api/shortcuts" || "$ep" == "/api/shortcuts/categories" ]]; then
          url+="?userId=1"
        fi
        if [[ "$method" == "POST" ]]; then
          data=${payloads[$ep]:-"{}"}
            echo -n "POST $ep ... "
            http_code=$(curl -s -o /tmp/proxapi_resp.json -w "%{http_code}" -X POST "$url" -H 'Content-Type: application/json' "${extra_args[@]}" -d "$data")
          else
            echo -n "GET $ep ... "
            http_code=$(curl -s -o /tmp/proxapi_resp.json -w "%{http_code}" "$url" "${extra_args[@]}")
          fi
          if [[ "$http_code" == "200" || "$http_code" == "201" ]]; then
            echo "OK"
          else
            echo "FAIL ($http_code)"
            cat /tmp/proxapi_resp.json
          fi
      done
    done
    set -e
  }
DB_PORT=${DB_PORT_DEFAULT}
DB_NAME=${DB_NAME_DEFAULT}
DB_USER=${DB_USER_DEFAULT}
DB_PASSWORD=${DB_PASS_DEFAULT}
DB_POOL_MIN=2
DB_POOL_MAX=10
EOF
  ok ".env créé dans $DOCKER_DIR"
}

# =============== NPM install & build ===============
npm_build() {
  info "Installation des dépendances"
  cd "$APP_SRC_DIR"
  npm install --legacy-peer-deps
  info "Compilation TypeScript (production)"
  npm run build
  ok "Build terminé"
}

# =============== DB init ===============
init_db() {
  set +e
  local api_url="http://localhost:4000"
  echo "--- [TEST API] ---"
  # Utilisateur de test
  local test_user="Test_Admin"
  local test_pass="Test@123"
  # 1. Login pour obtenir un token
  token=$(curl -s -X POST "$api_url/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"'$test_user'","password":"'$test_pass'"}' | grep -o '"token":"[^"]*"' | cut -d '"' -f4)
  # Si login échoue, tente de créer le compte
  if [[ -z "$token" ]]; then
    echo "[INFO] Création du compte de test $test_user..."
    curl -s -X POST "$api_url/api/auth/register" -H 'Content-Type: application/json' -d '{"username":"'$test_user'","password":"'$test_pass'"}' >/dev/null
    # Re-tente le login
    token=$(curl -s -X POST "$api_url/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"'$test_user'","password":"'$test_pass'"}' | grep -o '"token":"[^"]*"' | cut -d '"' -f4)
  fi
  if [[ -z "$token" ]]; then echo "[FAIL] Login impossible, tests protégés ignorés"; fi

  # 2. Définir les endpoints et payloads
  declare -A endpoints
  endpoints[GET]="/api/health /api/metrics /api/monitoring/stats /api/events /api/messages /api/lots /api/shortcuts /api/shortcuts/categories /api/marques /api/marques/all /api/agenda/events"
  endpoints[POST]="/api/auth/login /api/auth/logout /api/auth/verify /api/events /api/messages /api/lots /api/shortcuts /api/shortcuts/categories"

  # Payloads valides pour chaque POST
  declare -A payloads
  payloads[/api/auth/login]='{"username":"'$test_user'","password":"'$test_pass'"}'
  payloads[/api/auth/logout]='{}'
  payloads[/api/auth/verify]='{}'
  payloads[/api/events]='{"title":"Réunion API","start":"2026-01-26T10:00:00Z","end":"2026-01-26T11:00:00Z","description":"Test automatique","location":"Salle API"}'
  payloads[/api/messages]='{"text":"Ceci est un test API","pseudo":"'$test_user'"}'
  payloads[/api/lots]='{"itemCount":1,"description":"Lot test via API"}'
  payloads[/api/shortcuts]='{"title":"API Test","url":"https://test.local"}'
  payloads[/api/shortcuts/categories]='{"name":"Catégorie API"}'

  # Endpoints nécessitant Authorization
  protected="/api/metrics /api/monitoring/stats /api/events /api/messages /api/lots /api/shortcuts /api/shortcuts/categories /api/marques /api/marques/all /api/agenda/events /api/auth/logout /api/auth/verify"

  for method in GET POST; do
    for ep in ${endpoints[$method]}; do
      if [[ -z "$ep" ]]; then continue; fi
      extra_args=()
      # Ajout du token si protégé
      if [[ " $protected " == *" $ep "* && -n "$token" ]]; then
        extra_args+=( -H "Authorization: Bearer $token" )
      fi
      # Ajout userId dans query si events/messages/shortcuts
      url="$api_url$ep"
      if [[ "$ep" == "/api/events" || "$ep" == "/api/messages" || "$ep" == "/api/shortcuts" || "$ep" == "/api/shortcuts/categories" ]]; then
        url+="?userId=1"
      fi
      if [[ "$method" == "POST" ]]; then
        data=${payloads[$ep]:-"{}"}
        echo -n "POST $ep ... "
        http_code=$(eval curl -s -o /dev/null -w "%{http_code}" -X POST "$url" -H 'Content-Type: application/json' "${extra_args[@]}" -d "$data")
      else
        echo -n "GET $ep ... "
        http_code=$(eval curl -s -o /dev/null -w "%{http_code}" "$url" "${extra_args[@]}")
      fi
      if [[ "$http_code" == "200" || "$http_code" == "201" ]]; then echo "OK"; else echo "FAIL ($http_code)"; fi
    done
  done
  set -e
}
}

# =============== Docker build/up ===============
docker_build() {
  info "Construction des images Docker"
  cd "$DOCKER_DIR"
  docker compose down -v || true
  docker compose build --no-cache
}

docker_up() {
  info "Démarrage des services Docker"
  cd "$DOCKER_DIR"
  docker compose up -d
}

# =============== systemd (linked service file) ===============
install_systemd() {
  info "Préparation service systemd (lien vers dépôt)"
  cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Workspace Proxmox Backend
After=network-online.target docker.service
Wants=network-online.target docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$DOCKER_DIR
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=0
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
  systemctl link "$SERVICE_FILE" >/dev/null 2>&1 || true
  systemctl enable "$SERVICE_NAME" >/dev/null 2>&1 || true
  ok "Service systemd prêt (${SERVICE_FILE})"
}

# =============== CLI global ===============
install_cli() {

  info "Installation de la commande globale proxmox"
  cat > "$CLI_SOURCE" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
CYAN="\033[0;36m"; BLUE="\033[0;34m"; GREEN="\033[0;32m"; YELLOW="\033[1;33m"; RED="\033[0;31m"; RESET="\033[0m"; BOLD="\033[1m"

# Détection robuste du chemin racine du dépôt
SCRIPT_PATH="${BASH_SOURCE[0]}"
if [[ -L "$SCRIPT_PATH" ]]; then
  SCRIPT_PATH="$(readlink -f "$SCRIPT_PATH")"
fi
SCRIPTS_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
REPO_ROOT="$(cd "$SCRIPTS_DIR/../.." && pwd)"
DOCKER_DIR="$REPO_ROOT/proxmox/docker"
SERVICE_NAME="workspace-proxmox"
HEALTH_URL="http://localhost:4000/api/health"

status_table() {
  local ct_ip api_health svc_state node_state port
  ct_ip=$(hostname -I | awk '{print $1}')
  port=4000
  svc_state=$(systemctl is-active "$SERVICE_NAME" 2>/dev/null || echo inactive)
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then api_health="ONLINE"; else api_health="OFFLINE"; fi
  if docker ps --filter name=workspace-proxmox --format '{{.Status}}' | grep -Eqi 'running|up|healthy'; then node_state="RUNNING"; else node_state="STOPPED"; fi

  echo -e "${CYAN}${BOLD}Proxmox Backend - Statut${RESET}"
  local border="+----------------------+----------------------+"
  local fmt="| %-20s | %-20s |\n"

  echo "$border"
  printf "$fmt" "Clé" "Valeur"
  echo "$border"
  printf "$fmt" "Systemd" "${svc_state^^}"
  printf "$fmt" "API Health" "$api_health"
  printf "$fmt" "Node/Express" "$node_state"
  printf "$fmt" "IP" "$ct_ip"
  printf "$fmt" "Port" "$port"
  echo "$border"
  echo

  echo "Endpoints documentés/configurés :"
  border="+-------------------------+--------------------------------------+"
  fmt="| %-23s | %-36s |\n"
  echo "$border"
  printf "$fmt" "Type" "URL"
  echo "$border"

  local endpoints=(
    "/api/health"
    "/api/metrics"
    "/api/monitoring/stats"
    "/api/auth/login"
    "/api/auth/logout"
    "/api/auth/verify"
    "/api/events"
    "/api/messages"
    "/api/lots"
    "/api/shortcuts"
    "/api/shortcuts/categories"
    "/api/marques"
    "/api/marques/all"
    "/api/agenda/events"
    "/ws"
  )

  for ep in "${endpoints[@]}"; do
    if [[ "$ep" == "/ws" ]]; then
      printf "$fmt" "WebSocket" "ws://$ct_ip:$port/ws"
    else
      printf "$fmt" "HTTP" "http://$ct_ip:$port$ep"
    fi
  done
  echo "$border"
  echo
  echo -e "${BLUE}Containers Docker:${RESET}"
  docker ps --format '  {{.Names}}  {{.Status}}  {{.Ports}}'
}


test_api() {
  set +e
  local api_url="http://localhost:4000"
  echo "--- [TEST API] ---"
  # Utilisateur de test
  local test_user="Test_Admin"
  local test_pass="Test@123"
  # 1. Login pour obtenir un token
  token=$(curl -s -X POST "$api_url/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"'$test_user'","password":"'$test_pass'"}' | grep -o '"token":"[^"]*"' | cut -d '"' -f4)
  # Si login échoue, tente de créer le compte
  if [[ -z "$token" ]]; then
    echo "[INFO] Création du compte de test $test_user..."
    curl -s -X POST "$api_url/api/auth/register" -H 'Content-Type: application/json' -d '{"username":"'$test_user'","password":"'$test_pass'"}' >/dev/null
    # Re-tente le login
    token=$(curl -s -X POST "$api_url/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"'$test_user'","password":"'$test_pass'"}' | grep -o '"token":"[^"]*"' | cut -d '"' -f4)
  fi
  if [[ -z "$token" ]]; then echo "[FAIL] Login impossible, tests protégés ignorés"; fi

  # 2. Définir les endpoints et payloads
  declare -A endpoints
  endpoints[GET]="/api/health /api/metrics /api/monitoring/stats /api/events /api/messages /api/lots /api/shortcuts /api/shortcuts/categories /api/marques /api/marques/all /api/agenda/events"
  endpoints[POST]="/api/auth/login /api/auth/logout /api/auth/verify /api/events /api/messages /api/lots /api/shortcuts /api/shortcuts/categories"

  # Payloads valides pour chaque POST
  declare -A payloads
  payloads[/api/auth/login]='{"username":"'$test_user'","password":"'$test_pass'"}'
  payloads[/api/auth/logout]='{}'
  payloads[/api/auth/verify]='{}'
  payloads[/api/events]='{"title":"Réunion API","start":"2026-01-26T10:00:00Z","end":"2026-01-26T11:00:00Z","description":"Test automatique","location":"Salle API"}'
  payloads[/api/messages]='{"text":"Ceci est un test API","pseudo":"'$test_user'"}'
  payloads[/api/lots]='{"itemCount":1,"description":"Lot test via API"}'
  payloads[/api/shortcuts]='{"title":"API Test","url":"https://test.local"}'
  payloads[/api/shortcuts/categories]='{"name":"Catégorie API"}'

  # Endpoints nécessitant Authorization
  protected="/api/metrics /api/monitoring/stats /api/events /api/messages /api/lots /api/shortcuts /api/shortcuts/categories /api/marques /api/marques/all /api/agenda/events /api/auth/logout /api/auth/verify"

  for method in GET POST; do
    for ep in ${endpoints[$method]}; do
      if [[ -z "$ep" ]]; then continue; fi
      extra_args=()
      # Ajout du token si protégé
      if [[ " $protected " == *" $ep "* && -n "$token" ]]; then
        extra_args+=( -H "Authorization: Bearer $token" )
      fi
      # Ajout userId dans query si events/messages/shortcuts
      url="$api_url$ep"
      if [[ "$ep" == "/api/events" || "$ep" == "/api/messages" || "$ep" == "/api/shortcuts" || "$ep" == "/api/shortcuts/categories" ]]; then
        url+="?userId=1"
      fi
      if [[ "$method" == "POST" ]]; then
        data=${payloads[$ep]:-"{}"}
        echo -n "POST $ep ... "
        http_code=$(eval curl -s -o /dev/null -w "%{http_code}" -X POST "$url" -H 'Content-Type: application/json' "${extra_args[@]}" -d "$data")
      else
        echo -n "GET $ep ... "
        http_code=$(eval curl -s -o /dev/null -w "%{http_code}" "$url" "${extra_args[@]}")
      fi
      if [[ "$http_code" == "200" || "$http_code" == "201" ]]; then echo "OK"; else echo "FAIL ($http_code)"; fi
    done
  done
  set -e
}
test_auth() {
  local api_url="http://localhost:4000"
  echo "--- [TEST AUTH] ---"
  # 1. Login
  token=$(curl -s -X POST "$api_url/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"testuser","password":"testpass"}' | grep -o '"token":"[^"]*"' | cut -d '"' -f4)
  if [[ -z "$token" ]]; then echo "Login FAIL"; return 1; else echo "Login OK (token: $token)"; fi
  # 2. Vérification du token
  http_code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$api_url/api/auth/verify" -H "Authorization: Bearer $token")
  if [[ "$http_code" == "200" ]]; then echo "Token verify OK"; else echo "Token verify FAIL ($http_code)"; fi
  # 3. Accès à un endpoint protégé
  http_code=$(curl -s -o /dev/null -w "%{http_code}" "$api_url/api/messages" -H "Authorization: Bearer $token")
  if [[ "$http_code" == "200" ]]; then echo "Endpoint protégé OK"; else echo "Endpoint protégé FAIL ($http_code)"; fi
}


case "${1:-status}" in
  install)
    echo "Utilisez proxmox.sh install dans le dépôt"; exit 0 ;;
  start|up)
    systemctl start "$SERVICE_NAME" && sleep 3 && status_table ;;
  stop|down)
    systemctl stop "$SERVICE_NAME" && status_table ;;
  restart)
    systemctl restart "$SERVICE_NAME" && sleep 3 && status_table ;;
  rebuild)
    cd "$DOCKER_DIR" && docker compose build --no-cache && systemctl restart "$SERVICE_NAME" && sleep 3 && status_table ;;
  logs)
    shift || true
    if [[ "${1:-}" == "live" ]]; then journalctl -u "$SERVICE_NAME" -f; else journalctl -u "$SERVICE_NAME" -n 200 --no-pager; fi ;;
  status|st)
    status_table ;;
  test-api)
    test_api ;;
  test-auth)
    test_auth ;;
  help|--help|-h)
    cat <<EOT
Proxmox CLI - Commandes disponibles :
  proxmox start      Démarrer les services
  proxmox stop       Arrêter les services
  proxmox restart    Redémarrer le backend
  proxmox rebuild    Rebuild complet (code + images)
  proxmox logs       Afficher les logs
  proxmox logs live  Logs en temps réel
  proxmox status     Statut détaillé
  proxmox test-api   Tester tous les endpoints (GET/POST...)
  proxmox test-auth  Vérifier l'authentification (login/token)
  proxmox help       Cette aide
EOT
    ;;
  *)
    status_table ;;
esac
EOF
  chmod +x "$CLI_SOURCE"
  ln -sf "$CLI_SOURCE" "$GLOBAL_CLI"
  ok "CLI globale installée (source: $CLI_SOURCE, lien: $GLOBAL_CLI)"
}

# =============== Status for main script ===============
print_status() {
  local ct_ip api_health svc_state node_state
  ct_ip=$(hostname -I | awk '{print $1}')
  svc_state=$(systemctl is-active "$SERVICE_NAME" 2>/dev/null || echo inactive)
  if curl -fsS "http://localhost:${API_PORT_DEFAULT}/api/health" >/dev/null 2>&1; then api_health="ONLINE"; else api_health="OFFLINE"; fi
  if docker ps --filter name=workspace-proxmox --format '{{.Status}}' | grep -Eqi 'running|up|healthy'; then node_state="RUNNING"; else node_state="STOPPED"; fi
  echo -e "${CYAN}${BOLD}Proxmox Backend - Statut${RESET}"
  printf "%-22s : %s\n" "Systemd" "${svc_state^^}"
  printf "%-22s : %s\n" "API Health" "$api_health"
  printf "%-22s : %s\n" "Node/Express" "$node_state"
  printf "%-22s : %s\n" "IP" "$ct_ip"
  printf "%-22s : %s\n" "Port" "${API_PORT_DEFAULT}"
  printf "%-22s : %s\n" "Endpoints" "chat, agenda, reception, raccourcis, comptes"
  echo
  echo -e "${BLUE}Containers Docker:${RESET}"
  docker ps --format '  {{.Names}}  {{.Status}}  {{.Ports}}'
}

# =============== Main commands ===============
cmd_install() {
  require_root
  ensure_paths
  git_update
  generate_env
  npm_build
  # Si Docker Compose existe, utiliser Docker, sinon installer PostgreSQL natif
  if command -v docker compose >/dev/null 2>&1; then
    docker_build
    docker_up
    init_db
    install_systemd
  else
    install_postgres_native
  fi
  install_cli
  ok "Installation terminée. Démarrage manuel: proxmox start"
  print_status
}

cmd_start() { require_root; systemctl start "$SERVICE_NAME"; sleep 3; print_status; }
cmd_stop() { require_root; systemctl stop "$SERVICE_NAME"; ok "Services arrêtés"; }
cmd_restart() { require_root; systemctl restart "$SERVICE_NAME"; sleep 3; print_status; }
cmd_rebuild() {
  require_root
  docker_build
  docker_up
  # Appliquer le script SQL d'init si Docker
  if command -v docker compose >/dev/null 2>&1; then
    init_db
  else
    install_postgres_native
  fi
  systemctl restart "$SERVICE_NAME" || true
  sleep 3
  print_status
}
test_api() {
  local api_url="http://localhost:4000"
  echo "--- [TEST API] ---"
  # Utilisateur de test
  local test_user="Test_Admin"
  local test_pass="Test@123"
  # 1. Login pour obtenir un token
  token=$(curl -s -X POST "$api_url/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"'$test_user'","password":"'$test_pass'"}' | grep -o '"token":"[^\"]*"' | cut -d '"' -f4)
  # Si login échoue, tente de créer le compte
  if [[ -z "$token" ]]; then
    echo "[INFO] Création du compte de test $test_user..."
    curl -s -X POST "$api_url/api/auth/register" -H 'Content-Type: application/json' -d '{"username":"'$test_user'","password":"'$test_pass'"}' >/dev/null
    # Re-tente le login
    token=$(curl -s -X POST "$api_url/api/auth/login" -H 'Content-Type: application/json' -d '{"username":"'$test_user'","password":"'$test_pass'"}' | grep -o '"token":"[^\"]*"' | cut -d '"' -f4)
  fi
  if [[ -z "$token" ]]; then echo "[FAIL] Login impossible, tests protégés ignorés"; fi

  # 2. Définir les endpoints et payloads
  declare -A endpoints
  endpoints[GET]="/api/health /api/metrics /api/monitoring/stats /api/events /api/messages /api/lots /api/shortcuts /api/shortcuts/categories /api/marques /api/marques/all /api/agenda/events"
  endpoints[POST]="/api/auth/login /api/auth/logout /api/auth/verify /api/events /api/messages /api/lots /api/shortcuts /api/shortcuts/categories"

  # Payloads valides pour chaque POST
  declare -A payloads
  payloads[/api/auth/login]='{"username":"'$test_user'","password":"'$test_pass'"}'
  payloads[/api/auth/logout]='{}'
  payloads[/api/auth/verify]='{}'
  payloads[/api/events]='{"title":"Réunion API","start":"2026-01-26T10:00:00Z","end":"2026-01-26T11:00:00Z","description":"Test automatique","location":"Salle API"}'
  payloads[/api/messages]='{"text":"Ceci est un test API","pseudo":"'$test_user'"}'
  payloads[/api/lots]='{"itemCount":1,"description":"Lot test via API"}'
  payloads[/api/shortcuts]='{"title":"API Test","url":"https://test.local"}'
  payloads[/api/shortcuts/categories]='{"name":"Catégorie API"}'

  # Endpoints nécessitant Authorization
  protected="/api/metrics /api/monitoring/stats /api/events /api/messages /api/lots /api/shortcuts /api/shortcuts/categories /api/marques /api/marques/all /api/agenda/events /api/auth/logout /api/auth/verify"

  for method in GET POST; do
    for ep in ${endpoints[$method]}; do
      if [[ -z "$ep" ]]; then continue; fi
      extra_args=()
      # Ajout du token si protégé
      if [[ " $protected " == *" $ep "* && -n "$token" ]]; then
        extra_args+=( -H "Authorization: Bearer $token" )
      fi
      # Ajout userId dans query si events/messages/shortcuts
      url="$api_url$ep"
      if [[ "$ep" == "/api/events" || "$ep" == "/api/messages" || "$ep" == "/api/shortcuts" || "$ep" == "/api/shortcuts/categories" ]]; then
        url+="?userId=1"
      fi
      if [[ "$method" == "POST" ]]; then
        data=${payloads[$ep]:-"{}"}
        echo -n "POST $ep ... "
        http_code=$(eval curl -s -o /dev/null -w "%{http_code}" -X POST "$url" -H 'Content-Type: application/json' "${extra_args[@]}" -d "$data")
      else
        echo -n "GET $ep ... "
        http_code=$(eval curl -s -o /dev/null -w "%{http_code}" "$url" "${extra_args[@]}")
      fi
      if [[ "$http_code" == "200" || "$http_code" == "201" ]]; then echo "OK"; else echo "FAIL ($http_code)"; fi
    done
  done
}
cmd_logs() { if [[ "${1:-}" == "live" ]]; then journalctl -u "$SERVICE_NAME" -f; else journalctl -u "$SERVICE_NAME" -n 200 --no-pager; fi }
cmd_status() { print_status; }

COMMAND="${1:-help}"
case "$COMMAND" in
  install) cmd_install ;;
  start|up) cmd_start ;;
  stop|down) cmd_stop ;;
  restart) cmd_restart ;;
  rebuild) cmd_rebuild ;;
  logs) shift || true; cmd_logs "$@" ;;
  status|st) cmd_status ;;
  test-api)
    test_api
    ;;
  help|--help|-h|*)
    cat <<EOF
Usage: proxmox.sh [install|start|stop|restart|rebuild|logs|status|test-api]

Commandes disponibles :
  install      Installation complète (dépendances, base, build)
  start        Démarrer les services
  stop         Arrêter les services
  restart      Redémarrer le backend
  rebuild      Rebuild complet (code + images + base)
  logs         Afficher les logs
  status       Statut détaillé
  test-api     Tester tous les endpoints principaux
  help         Cette aide
EOF
    ;;
esac
