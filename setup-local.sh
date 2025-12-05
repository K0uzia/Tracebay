#!/usr/bin/env bash
# ------------------------------------------------------------------------------
# setup-local.sh — Setup local pour Workspace Electron + Node.js + SQLite3
#   - Idempotent, lisible, avec logs.
#   - Installe dépendances npm, initialise la DB SQLite, configure l'env.
#
# USAGE:
#   ./setup-local.sh info         # affiche versions & état
#   ./setup-local.sh deps         # installe Node.js, npm, SQLite3 (si nécessaire)
#   ./setup-local.sh init         # crée data/, initialise BDD, génère bin/ & .env
#   ./setup-local.sh reset        # réinitialise la DB depuis la migration
#   ./setup-local.sh dev          # lance le serveur Node + Electron
#   ./setup-local.sh server       # lance juste le serveur Node (npm run server)
#   ./setup-local.sh db.shell     # ouvre un shell sqlite
#   ./setup-local.sh db.backup    # sauvegarde la DB
#   ./setup-local.sh build        # construit l'app Electron
#
# ENV (personnalisables):
#   PORT=3000 DATA_DIR=./data DB_FILE=database.sqlite
# ------------------------------------------------------------------------------

set -euo pipefail

# --- Paths & défauts ----------------------------------------------------------
ROOT="$(pwd)"
DATA_DIR="${DATA_DIR:-$ROOT/data}"
DB_FILE="${DB_FILE:-database.sqlite}"
DB_PATH="$DATA_DIR/$DB_FILE"
PORT="${PORT:-3000}"

# --- Logging helpers ----------------------------------------------------------
log() { printf '· %s\n' "$*"; }
ok() { printf '✅ %s\n' "$*"; }
warn() { printf '⚠️  %s\n' "$*"; }
err() { printf '❌ %s\n' "$*" >&2; }
die() {
    err "$*"
    exit 1
}

need() { command -v "$1" >/dev/null 2>&1 || die "Manque binaire: $1"; }

# --- Common checks / ensure ---------------------------------------------------
ensure_dirs() { 
    mkdir -p "$DATA_DIR" "$ROOT/bin" "$ROOT/config"
    log "Répertoires créés: data/, bin/, config/"
}

ensure_env() {
    local env_file="$ROOT/.env"
    [[ -f "$env_file" ]] && return 0
    
    cat >"$env_file" <<ENV
# Workspace - Configuration locale
NODE_ENV=development
PORT=$PORT
DB_PATH=./data/$DB_FILE
DB_DSN=sqlite:./data/$DB_FILE

# Chat Widget (optionnel)
CHAT_API_URL=http://localhost:$PORT

# PDF (optionnel)
PDF_OUTPUT_DIR=./public/src/pdf

ENV
    ok "Créé .env (personnalise-le au besoin)"
}

ensure_gitignore() {
    local gitignore="$ROOT/.gitignore"
    [[ -f "$gitignore" ]] || touch "$gitignore"
    
    local items=("node_modules" "data/" ".env" "*.log" "dist/" ".env.local")
    for item in "${items[@]}"; do
        grep -qF "$item" "$gitignore" 2>/dev/null || echo "$item" >>"$gitignore"
    done
    ok ".gitignore mis à jour"
}

get_migration_file() {
    # Cherche les fichiers de migration courants
    if [[ -f "$ROOT/migrations/init.sql" ]]; then
        echo "$ROOT/migrations/init.sql"
    elif [[ -f "$ROOT/migrations/schema.sql" ]]; then
        echo "$ROOT/migrations/schema.sql"
    elif [[ -f "$ROOT/migrations/sqlite_init.sql" ]]; then
        echo "$ROOT/migrations/sqlite_init.sql"
    elif [[ -f "$ROOT/migrations/tables.sql" ]]; then
        echo "$ROOT/migrations/tables.sql"
    else
        return 1
    fi
}

# --- Package manager / Node.js ------------------------------------------------
detect_pkg() {
    if command -v dnf >/dev/null 2>&1; then
        echo "dnf"
    elif command -v apt-get >/dev/null 2>&1; then
        echo "apt"
    else echo "unknown"; fi
}

install_deps() {
    local pm pkgs
    pm="$(detect_pkg)"
    case "$pm" in
        dnf)
            pkgs=(nodejs npm sqlite3)
            log "Installer via dnf: ${pkgs[*]}"
            if command -v sudo >/dev/null 2>&1; then
                sudo dnf install -y "${pkgs[@]}"
            else
                dnf install -y "${pkgs[@]}"
            fi
            ;;
        apt)
            pkgs=(nodejs npm sqlite3)
            log "Installer via apt: ${pkgs[*]}"
            if command -v sudo >/dev/null 2>&1; then
                sudo apt-get update
                sudo apt-get install -y "${pkgs[@]}"
            else
                apt-get update
                apt-get install -y "${pkgs[@]}"
            fi
            ;;
        *)
            die "Gestionnaire de paquets non supporté. Installe manuellement :
  - Fedora/RHEL : nodejs npm sqlite3
  - Debian/Ubuntu : nodejs npm sqlite3"
            ;;
    esac

    ok "Dépendances système installées."
}

npm_install_if_needed() {
    if [[ -d "$ROOT/node_modules" && -f "$ROOT/node_modules/.bin/electron" ]]; then
        log "Dépendances npm déjà installées (node_modules/ présent)."
        return 0
    fi

    need npm
    log "Installation des dépendances npm..."
    if npm install; then
        ok "npm install terminé."
    else
        die "Échec de npm install. Vérifie ta connexion ou package.json."
    fi
}

# --- SQLite actions -----------------------------------------------------------
sqlite_apply_migration_fresh() {
    need sqlite3
    local mig
    
    if ! mig="$(get_migration_file)"; then
        warn "Aucun fichier de migration trouvé. DB créée vide."
        : >"$DB_PATH"
        return 0
    fi
    
    : >"$DB_PATH"
    sqlite3 "$DB_PATH" <"$mig"
    ok "SQLite initialisée (fresh): $DB_PATH"
}

sqlite_apply_migration_if_absent() {
    need sqlite3
    local mig
    
    if [[ -f "$DB_PATH" ]]; then
        log "DB déjà présente: $DB_PATH (skip init). Utilise 'reset' pour repartir de zéro."
        return 0
    fi
    
    if ! mig="$(get_migration_file)"; then
        warn "Aucun fichier de migration trouvé. DB créée vide."
        : >"$DB_PATH"
        return 0
    fi
    
    : >"$DB_PATH"
    sqlite3 "$DB_PATH" <"$mig"
    ok "SQLite initialisée: $DB_PATH"
}

sqlite_backup() {
    need sqlite3
    
    if [[ ! -f "$DB_PATH" ]]; then
        warn "DB introuvable: $DB_PATH"
        return 1
    fi
    
    local backup_dir="$DATA_DIR/backups"
    mkdir -p "$backup_dir"
    
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_file="$backup_dir/${DB_FILE%.sqlite}_$timestamp.sqlite"
    
    cp "$DB_PATH" "$backup_file"
    ok "Backup créé: $backup_file"
}

# --- Import partners data -----------------------------------------------------
import_partners_if_needed() {
    local import_script="$ROOT/bin/import_partners_from_provider.php"
    if [[ ! -f "$import_script" ]]; then
        warn "Script d'import des partenaires introuvable: $import_script (skip)"
        return 0
    fi
    
    if [[ ! -f "$DB_SQLITE" ]]; then
        warn "Base de données absente, impossible d'importer les partenaires"
        return 0
    fi
    
    log "Import des partenaires depuis PartnersProvider..."
    if php "$import_script" 2>&1; then
        ok "Partenaires importés avec succès"
    else
        warn "Échec de l'import des partenaires (peut être normal si déjà présents)"
    fi
}

# --- bin/ scripts -------------------------------------------------------------
bin_install() {
    local db="$ROOT/bin/db" dev="$ROOT/bin/dev" server="$ROOT/bin/server"

    if [[ ! -f "$db" ]]; then
        cat >"$db" <<'BASH'
#!/usr/bin/env bash
set -euo pipefail
DB="./data/database.sqlite"

get_migration() {
    for f in ./migrations/init.sql ./migrations/schema.sql ./migrations/sqlite_init.sql ./migrations/tables.sql; do
        [[ -f "$f" ]] && echo "$f" && return 0
    done
    return 1
}

mkdir -p ./data
case "${1:-}" in
  init)  
    if mig=$(get_migration); then
      : > "$DB"
      sqlite3 "$DB" < "$mig"
      echo "✅ DB initialized at $DB"
    else
      : > "$DB"
      echo "⚠️  DB créée vide (pas de migration trouvée)"
    fi
    ;;
  reset) 
    if mig=$(get_migration); then
      rm -f "$DB"
      sqlite3 "$DB" < "$mig"
      echo "✅ DB reset"
    else
      echo "❌ Pas de migration trouvée" >&2
      exit 1
    fi
    ;;
  shell) sqlite3 "$DB" ;;
  backup)
    mkdir -p ./data/backups
    ts=$(date +%Y%m%d_%H%M%S)
    cp "$DB" "./data/backups/database_$ts.sqlite"
    echo "✅ Backup: ./data/backups/database_$ts.sqlite"
    ;;
  *) echo "Usage: bin/db {init|reset|shell|backup}" >&2; exit 1;;
esac
BASH
        chmod +x "$db"
        ok "Créé bin/db"
    fi

    if [[ ! -f "$server" ]]; then
        cat >"$server" <<'BASH'
#!/usr/bin/env bash
set -euo pipefail
PORT="${PORT:-3000}"
NODE_ENV="${NODE_ENV:-development}"
echo "🔌 Serveur Node → http://localhost:$PORT"
NODE_ENV="$NODE_ENV" PORT="$PORT" node server.js
BASH
        chmod +x "$server"
        ok "Créé bin/server"
    fi

    if [[ ! -f "$dev" ]]; then
        cat >"$dev" <<'BASH'
#!/usr/bin/env bash
set -euo pipefail
PORT="${PORT:-3000}"
echo "⚡ Mode dev: Serveur Node + Electron"
echo "   → API: http://localhost:$PORT"
PORT="$PORT" npm run dev
BASH
        chmod +x "$dev"
        ok "Créé bin/dev"
    fi
}

# --- Makefile minimal / enrichissement ---------------------------------------
make_inject() {
    local mk="$ROOT/Makefile"
    if [[ ! -f "$mk" ]]; then
        cat >"$mk" <<'MAKE'
.PHONY: dev server db.init db.reset db.shell db.backup info build help

help:
	@echo "Workspace - Commandes disponibles:"
	@echo "  make dev        - Lance serveur + Electron"
	@echo "  make server     - Lance juste le serveur Node"
	@echo "  make db.init    - Initialise la DB"
	@echo "  make db.reset   - Réinitialise la DB"
	@echo "  make db.shell   - Ouvre shell SQLite"
	@echo "  make db.backup  - Sauvegarde la DB"
	@echo "  make build      - Construit l'app Electron"
	@echo "  make info       - Infos système"

dev: ; bin/dev
server: ; bin/server
db.init: ; bin/db init
db.reset: ; bin/db reset
db.shell: ; bin/db shell
db.backup: ; bin/db backup
build: ; npm run build

info:
	@node -v
	@npm -v
	@sqlite3 --version || true
	@echo "Port: 3000"
	@echo "DB: ./data/database.sqlite"
MAKE
        ok "Créé Makefile"
        return
    fi

    if ! grep -qE '^help:' "$mk"; then
        cat >>"$mk" <<'MAKE'

help:
	@echo "Workspace - Commandes disponibles:"
	@echo "  make dev        - Lance serveur + Electron"
	@echo "  make server     - Lance juste le serveur Node"
	@echo "  make db.init    - Initialise la DB"
	@echo "  make db.reset   - Réinitialise la DB"
	@echo "  make db.shell   - Ouvre shell SQLite"
	@echo "  make db.backup  - Sauvegarde la DB"
	@echo "  make build      - Construit l'app Electron"
	@echo "  make info       - Infos système"
MAKE
    fi
    ok "Makefile enrichi (non destructif)"
}

# --- Commands -----------------------------------------------------------------
cmd="${1:-help}"

case "$cmd" in
    info)
        echo "=== Workspace Setup Info ==="
        node -v
        npm -v
        sqlite3 --version || echo "(sqlite3 non installé)"
        echo ""
        echo "Root directory: $ROOT"
        echo "Data directory: $DATA_DIR"
        echo "DB file:        $DB_PATH"
        echo "Port:           $PORT"
        echo ""
        if [[ -d "$ROOT/node_modules" ]]; then
            echo "✅ npm dependencies installées"
        else
            echo "❌ npm dependencies manquantes"
        fi
        if [[ -f "$DB_PATH" ]]; then
            echo "✅ DB présente"
            echo "   Tables: $(sqlite3 "$DB_PATH" ".tables" 2>/dev/null || echo "error")"
        else
            echo "❌ DB absente"
        fi
        ;;
    deps)
        install_deps
        ;;
    init)
        need node
        need npm
        ensure_dirs
        ensure_env
        ensure_gitignore
        bin_install
        make_inject
        npm_install_if_needed
        sqlite_apply_migration_if_absent
        ok ""
        ok "✅ Init terminé!"
        ok "Prochaines étapes:"
        ok "  • make info       - Vérifier l'état"
        ok "  • make server     - Lancer le serveur Node"
        ok "  • make dev        - Lancer Electron + serveur"
        ;;
    reset)
        sqlite_apply_migration_fresh
        ok "DB réinitialisée"
        ;;
    dev)
        need node
        [[ -f "$ROOT/main.js" ]] || die "main.js manquant"
        echo "⚡ Mode dev: Serveur Node + Electron"
        PORT="$PORT" npm run dev
        ;;
    server)
        need node
        echo "🔌 Serveur Node → http://localhost:$PORT"
        PORT="$PORT" npm run server
        ;;
    db.shell)
        need sqlite3
        [[ -f "$DB_PATH" ]] || die "DB absente: $DB_PATH"
        sqlite3 "$DB_PATH"
        ;;
    db.backup)
        sqlite_backup
        ;;
    build)
        need node
        log "Construction de l'app Electron..."
        npm run build
        ;;
    *)
        cat <<USAGE
Usage: $0 {info|deps|init|reset|dev|server|db.shell|db.backup|build}

Raccourcis recommandés:
  ./setup-local.sh init           # Configuration initiale complète
  ./setup-local.sh dev            # Lancer Electron + serveur
  ./setup-local.sh server         # Lancer juste le serveur
  make help                       # Liste les commandes make

ENV:
  PORT=3000 DATA_DIR=./data DB_FILE=database.sqlite
USAGE
        exit 1
        ;;
esac
