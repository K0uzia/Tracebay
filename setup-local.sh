#!/usr/bin/env bash
# ==============================================================================
# setup-local.sh — Workspace Setup (Electron + Node.js + SQLite3)
#   Simplifié avec electron-builder uniquement (no electron-forge)
#
# USAGE:
#   ./setup-local.sh init         # Setup complet
#   ./setup-local.sh deps         # Installe Node.js, npm, SQLite3
#   ./setup-local.sh info         # État système
#   ./setup-local.sh dev          # Serveur Node + Electron
#   ./setup-local.sh server       # Juste serveur Node
#   ./setup-local.sh db.shell     # Shell SQLite
#   ./setup-local.sh db.backup    # Backup DB
#   ./setup-local.sh build        # Build electron-builder
# ==============================================================================

set -euo pipefail

ROOT="$(pwd)"
DATA_DIR="${DATA_DIR:-$ROOT/data}"
DB_FILE="${DB_FILE:-database.sqlite}"
DB_PATH="$DATA_DIR/$DB_FILE"
PORT="${PORT:-8060}"

log() { printf '· %s\n' "$*"; }
ok() { printf '✅ %s\n' "$*"; }
warn() { printf '⚠️  %s\n' "$*"; }
err() { printf '❌ %s\n' "$*" >&2; }
die() { err "$*"; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "Manque: $1"; }

# --- Helpers ------------------------------------------------------------------
ensure_dirs() { 
    mkdir -p "$DATA_DIR" "$ROOT/bin" "$ROOT/config"
    log "Répertoires: data/ bin/ config/"
}

ensure_env() {
    [[ -f "$ROOT/.env" ]] && return 0
    cat >"$ROOT/.env" <<ENV
NODE_ENV=development
PORT=$PORT
DB_PATH=./data/$DB_FILE
DB_DSN=sqlite:./data/$DB_FILE
CHAT_API_URL=http://localhost:$PORT
PDF_OUTPUT_DIR=./public/src/pdf
ENV
    ok ".env créé"
}

ensure_gitignore() {
    local gitignore="$ROOT/.gitignore"
    [[ -f "$gitignore" ]] || touch "$gitignore"
    for item in node_modules data/ .env "*.log" dist/ .env.local out/; do
        grep -qF "$item" "$gitignore" 2>/dev/null || echo "$item" >>"$gitignore"
    done
    ok ".gitignore mis à jour"
}

get_migration_file() {
    for f in ./migrations/{init,schema,sqlite_init,tables}.sql; do
        [[ -f "$f" ]] && echo "$f" && return 0
    done
    return 1
}

detect_pkg() {
    command -v dnf >/dev/null 2>&1 && echo "dnf" && return
    command -v apt-get >/dev/null 2>&1 && echo "apt" && return
    echo "unknown"
}

install_deps() {
    local pm pkgs
    pm="$(detect_pkg)"
    case "$pm" in
        dnf)
            log "Installer: nodejs npm sqlite3 (dnf)"
            command -v sudo >/dev/null 2>&1 && sudo dnf install -y nodejs npm sqlite3 || dnf install -y nodejs npm sqlite3
            ;;
        apt)
            log "Installer: nodejs npm sqlite3 (apt)"
            command -v sudo >/dev/null 2>&1 && { sudo apt-get update; sudo apt-get install -y nodejs npm sqlite3; } || { apt-get update; apt-get install -y nodejs npm sqlite3; }
            ;;
        *)
            die "Pkg manager unknown (apt/dnf). Install manuellement: nodejs npm sqlite3"
            ;;
    esac
    ok "Dépendances système installées"
}

npm_install() {
    [[ -d "$ROOT/node_modules" ]] && [[ -f "$ROOT/node_modules/.bin/electron" ]] && log "npm déjà installé" && return
    need npm
    log "npm install..."
    npm install || die "npm install failed"
    ok "npm installé"
}

sqlite_init() {
    need sqlite3
    [[ -f "$DB_PATH" ]] && log "DB déjà présente" && return
    
    if ! mig="$(get_migration_file)"; then
        warn "Migration introuvable, DB vide créée"
        : >"$DB_PATH"
        return
    fi
    
    : >"$DB_PATH"
    sqlite3 "$DB_PATH" <"$mig"
    ok "DB initialisée"
}

sqlite_reset() {
    need sqlite3
    if ! mig="$(get_migration_file)"; then
        die "Migration introuvable"
    fi
    rm -f "$DB_PATH"
    : >"$DB_PATH"
    sqlite3 "$DB_PATH" <"$mig"
    ok "DB réinitialisée"
}

sqlite_backup() {
    need sqlite3
    [[ -f "$DB_PATH" ]] || die "DB introuvable"
    mkdir -p "$DATA_DIR/backups"
    local ts=$(date +%Y%m%d_%H%M%S)
    cp "$DB_PATH" "$DATA_DIR/backups/database_$ts.sqlite"
    ok "Backup: $DATA_DIR/backups/database_$ts.sqlite"
}

# --- bin/ scripts simplifiés -------------------------------------------------
bin_install() {
    local db="$ROOT/bin/db" server="$ROOT/bin/server" dev="$ROOT/bin/dev"

    [[ -f "$db" ]] || {
        cat >"$db" <<'BASH'
#!/usr/bin/env bash
set -euo pipefail
DB="./data/database.sqlite"
get_migration() {
    for f in ./migrations/{init,schema,sqlite_init,tables}.sql; do
        [[ -f "$f" ]] && echo "$f" && return 0
    done
    return 1
}
mkdir -p ./data
case "${1:-}" in
  init) mig=$(get_migration) && : > "$DB" && sqlite3 "$DB" < "$mig" && echo "✅ DB init" || { : > "$DB"; echo "⚠️  DB vide"; } ;;
  reset) mig=$(get_migration) && rm -f "$DB" && : > "$DB" && sqlite3 "$DB" < "$mig" && echo "✅ DB reset" || { echo "❌ Migration introuvable" >&2; exit 1; } ;;
  shell) sqlite3 "$DB" ;;
  backup) mkdir -p ./data/backups && ts=$(date +%Y%m%d_%H%M%S) && cp "$DB" "./data/backups/database_$ts.sqlite" && echo "✅ ./data/backups/database_$ts.sqlite" ;;
  *) echo "Usage: bin/db {init|reset|shell|backup}" >&2; exit 1 ;;
esac
BASH
        chmod +x "$db"
        ok "bin/db créé"
    }

    [[ -f "$server" ]] || {
        cat >"$server" <<'BASH'
#!/usr/bin/env bash
PORT="${PORT:-3000}"
echo "🔌 Serveur → http://localhost:$PORT"
PORT="$PORT" node server.js
BASH
        chmod +x "$server"
        ok "bin/server créé"
    }

    [[ -f "$dev" ]] || {
        cat >"$dev" <<'BASH'
#!/usr/bin/env bash
PORT="${PORT:-3000}"
echo "⚡ Dev: Serveur + Electron"
PORT="$PORT" npm start
BASH
        chmod +x "$dev"
        ok "bin/dev créé"
    }
}

# --- Updates & Maintenance ---------------------------------------------------
check_updates() {
    need npm
    log "Vérification des mises à jour npm..."
    npm outdated || log "Toutes les dépendances sont à jour"
}

update_deps() {
    need npm
    local choice
    
    log "🔄 Mise à jour des dépendances npm..."
    echo ""
    echo "Options:"
    echo "1) Mettre à jour les mineures/patches (npm update)"
    echo "2) Mettre à jour interactivement (npm update -i)"
    echo "3) Vérifier uniquement (npm outdated)"
    echo ""
    read -p "Choisir [1/2/3]: " choice
    
    case "$choice" in
        1)
            log "Mise à jour standard..."
            npm update
            ok "Dépendances mises à jour"
            ;;
        2)
            log "Mode interactif..."
            npm update -i --save || warn "Mise à jour interactive annulée"
            ;;
        3)
            log "Vérification des versions outdated..."
            npm outdated || log "Toutes les dépendances sont à jour"
            ;;
        *)
            warn "Choix invalide"
            return 1
            ;;
    esac
}

update_electron() {
    need npm
    local current_version latest_version
    
    log "Vérification de la version Electron..."
    current_version=$(npm list electron 2>/dev/null | grep electron | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    
    if [[ -z "$current_version" ]]; then
        warn "Impossible de déterminer la version Electron"
        return 1
    fi
    
    log "Version actuelle: $current_version"
    
    # Obtenir la dernière version disponible
    latest_version=$(npm view electron@latest version 2>/dev/null)
    
    if [[ -z "$latest_version" ]]; then
        warn "Impossible de récupérer la dernière version"
        return 1
    fi
    
    log "Dernière version disponible: $latest_version"
    
    if [[ "$current_version" == "$latest_version" ]]; then
        ok "Electron est à jour!"
        return 0
    fi
    
    echo ""
    read -p "Mettre à jour Electron vers $latest_version? (y/n) " -n 1 -r
    echo ""
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log "Mise à jour Electron $current_version → $latest_version..."
        npm install --save-dev electron@latest || die "Erreur lors de la mise à jour"
        ok "Electron mis à jour!"
        
        # Compiler les dépendances natives
        if npm rebuild 2>/dev/null; then
            ok "Dépendances natives recompilées"
        fi
    else
        log "Mise à jour Electron annulée"
    fi
}

audit_security() {
    need npm
    log "Audit de sécurité npm..."
    npm audit || {
        warn "Des vulnérabilités ont été détectées"
        echo ""
        read -p "Appliquer les correctifs automatiques? (y/n) " -n 1 -r
        echo ""
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            npm audit fix || warn "Certains problèmes n'ont pas pu être corrigés automatiquement"
        fi
    }
}

# --- Main commands -----------------------------------------------------------
cmd="${1:-info}"

case "$cmd" in
    info)
        echo "=== Workspace Info ==="
        node -v 2>/dev/null || echo "❌ Node manquant"
        npm -v 2>/dev/null || echo "❌ npm manquant"
        sqlite3 --version 2>/dev/null || echo "⚠️  SQLite3 manquant"
        echo ""
        [[ -d "$ROOT/node_modules" ]] && echo "✅ npm dependencies" || echo "❌ npm dependencies"
        [[ -f "$DB_PATH" ]] && echo "✅ DB: $DB_PATH" || echo "❌ DB manquante"
        [[ -f "$ROOT/.env" ]] && echo "✅ .env" || echo "⚠️  .env absent"
        echo "Port: $PORT | Data: $DATA_DIR"
        ;;
    init)
        need node
        need npm
        log "Setup complet..."
        ensure_dirs
        ensure_env
        ensure_gitignore
        bin_install
        npm_install
        sqlite_init
        ok ""
        ok "✅ Setup terminé!"
        ok "Commandes:"
        ok "  ./bin/server              # Serveur Node"
        ok "  ./bin/dev                 # Electron"
        ok "  ./setup-local.sh build    # Build l'app"
        ;;
    deps)
        install_deps
        npm_install
        ;;
    reset)
        sqlite_reset
        ;;
    dev)
        need node
        log "Serveur + Electron..."
        export PORT="$PORT"
        npm start
        ;;
    server)
        need node
        log "Serveur → http://localhost:$PORT"
        export PORT="$PORT"
        npm run server
        ;;
    db.shell)
        need sqlite3
        [[ -f "$DB_PATH" ]] || die "DB manquante"
        sqlite3 "$DB_PATH"
        ;;
    db.backup)
        sqlite_backup
        ;;
    build)
        need node
        log "Electron Builder..."
        npm run build
        ;;
    check-updates)
        check_updates
        ;;
    update-deps)
        update_deps
        ;;
    update-electron)
        update_electron
        ;;
    audit)
        audit_security
        ;;
    *)
        cat <<HELP
Usage: $0 {info|init|deps|reset|dev|server|db.shell|db.backup|build|check-updates|update-deps|update-electron|audit}

Setup:
  init                 Configuration initiale
  deps                 Dépendances système
  info                 État du système

Dev:
  dev                  Serveur + Electron
  server               Juste serveur Node

DB:
  reset                Réinitialiser
  db.shell             Shell SQLite
  db.backup            Backup

Build:
  build                Electron Builder

Updates & Maintenance:
  check-updates        Vérifier les mises à jour disponibles
  update-deps          Mettre à jour les dépendances npm
  update-electron      Mettre à jour Electron (manual)
  audit                Audit de sécurité npm

ENV:
  PORT=3000 DATA_DIR=./data DB_FILE=database.sqlite
HELP
        exit 1
        ;;
esac
