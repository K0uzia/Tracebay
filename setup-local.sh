#!/usr/bin/env bash
# ==============================================================================
# setup-local.sh — Workspace Setup (Electron + Node.js + SQLite3)
#
# USAGE:
#   ./setup-local.sh help         # Show this help
#   ./setup-local.sh init         # Complete setup
#   ./setup-local.sh install      # Install dependencies only
#   ./setup-local.sh setup-env    # Setup environment variables
#   ./setup-local.sh dev          # Start development (server + client)
#   ./setup-local.sh server       # Start server only
#   ./setup-local.sh clean        # Clean build artifacts
#
# ==============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APPS_SERVER="$ROOT/apps/server"
APPS_CLIENT="$ROOT/apps/client"
PORT="${PORT:-8060}"

# Logging functions
log() { echo -e "${BLUE}→${NC} $*"; }
ok() { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC} $*"; }
err() { echo -e "${RED}✗${NC} $*" >&2; }
die() { err "$*"; exit 1; }

# Check if command exists
need() {
  command -v "$1" >/dev/null 2>&1 || die "Required: $1"
}

# Show help
show_help() {
  cat << 'EOF'
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Workspace Setup Script
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Commands:
  init              Complete setup (install + environment + db)
  install           Install npm dependencies for all apps
  setup-env         Setup environment variables (.env files)
  dev               Start server (port 8060) and client
  server            Start server only (development)
  client            Start client only
  clean             Clean build artifacts and caches
  clean-all         Full cleanup (includes database)
  test              Run all tests
  lint              Run ESLint
  build             Build production distribution

Options:
  PORT              Set server port (default: 8060)
  NODE_ENV          Set environment (default: development)

Examples:
  ./setup-local.sh init
  PORT=3000 ./setup-local.sh server
  NODE_ENV=production ./setup-local.sh build

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EOF
}

# Ensure directories exist
ensure_directories() {
  log "Creating directories..."
  mkdir -p "$ROOT/data"
  mkdir -p "$ROOT/logs"
  mkdir -p "$APPS_SERVER/data"
  mkdir -p "$APPS_SERVER/logs"
  mkdir -p "$APPS_CLIENT/public"
  ok "Directories ready"
}

# Install dependencies
install_deps() {
  log "Installing dependencies..."
  need "node"
  need "npm"
  
  log "Installing root dependencies..."
  npm install --prefer-offline --no-audit
  
  log "Installing server dependencies..."
  cd "$APPS_SERVER"
  npm install --prefer-offline --no-audit
  cd "$ROOT"
  
  log "Installing client dependencies..."
  cd "$APPS_CLIENT"
  npm install --prefer-offline --no-audit
  cd "$ROOT"
  
  ok "All dependencies installed"
}

# Setup environment variables
setup_environment() {
  log "Setting up environment..."
  
  # Check if .env exists
  if [[ ! -f "$APPS_SERVER/.env" ]]; then
    if [[ -f "$APPS_SERVER/.env.example" ]]; then
      log "Creating .env from .env.example..."
      cp "$APPS_SERVER/.env.example" "$APPS_SERVER/.env"
      ok ".env created (customize as needed)"
    else
      log "Creating .env with defaults..."
      cat > "$APPS_SERVER/.env" << ENV
NODE_ENV=development
SERVER_HOST=localhost
SERVER_PORT=$PORT
DATABASE_PATH=./data/workspace.db
JWT_SECRET=dev-secret-change-in-production
LOG_LEVEL=debug
CORS_ORIGIN=file://
ENV
      ok ".env created"
    fi
  else
    warn ".env already exists (skipped)"
  fi
}

# Initialize database
init_database() {
  log "Initializing database..."
  if [[ ! -f "$APPS_SERVER/data/workspace.db" ]]; then
    log "Database will be created on first run"
    ok "Database initialization ready"
  else
    ok "Database already exists"
  fi
}

# Complete initialization
init_all() {
  log "🚀 Starting complete setup..."
  echo ""
  
  ensure_directories
  echo ""
  
  install_deps
  echo ""
  
  setup_environment
  echo ""
  
  init_database
  echo ""
  
  ok "✅ Setup complete!"
  echo ""
  echo "Next steps:"
  echo "  1. Review and update: $APPS_SERVER/.env"
  echo "  2. Start server: npm run server"
  echo "  3. Start client: npm run client"
  echo "  Or use: make all"
}

# Start server
start_server() {
  log "Starting server on port $PORT..."
  cd "$APPS_SERVER"
  npm start
}

# Start client
start_client() {
  log "Starting client..."
  cd "$APPS_CLIENT"
  npm start
}

# Start both
start_both() {
  log "Starting server (port $PORT) and client..."
  (cd "$APPS_SERVER" && npm start) &
  sleep 2
  (cd "$APPS_CLIENT" && npm start) &
  wait
}

# Clean artifacts
clean_build() {
  log "Cleaning build artifacts..."
  rm -rf "$ROOT/dist" "$ROOT/out"
  rm -rf "$APPS_SERVER/dist" "$APPS_SERVER/out"
  rm -rf "$APPS_CLIENT/dist" "$APPS_CLIENT/out"
  ok "Build artifacts removed"
}

# Full cleanup
clean_all() {
  clean_build
  log "Cleaning all artifacts..."
  rm -rf "$ROOT/node_modules" "$APPS_SERVER/node_modules" "$APPS_CLIENT/node_modules"
  rm -f "$APPS_SERVER/data/workspace.db"*
  ok "Full cleanup complete"
}

# Run tests
run_tests() {
  log "Running tests..."
  npm test
}

# Run linter
run_lint() {
  log "Running ESLint..."
  npx eslint apps --max-warnings 0
}

# Build production
build_dist() {
  log "Building production distribution..."
  export NODE_ENV=production
  
  log "Building server..."
  cd "$APPS_SERVER"
  npm run make
  cd "$ROOT"
  
  log "Building client..."
  cd "$APPS_CLIENT"
  npm run make
  cd "$ROOT"
  
  ok "Build complete"
}

# Parse command
COMMAND="${1:-help}"

case "$COMMAND" in
  help)
    show_help
    ;;
  init)
    init_all
    ;;
  install)
    install_deps
    ;;
  setup-env)
    setup_environment
    ;;
  dev)
    start_both
    ;;
  server)
    start_server
    ;;
  client)
    start_client
    ;;
  clean)
    clean_build
    ;;
  clean-all)
    clean_all
    ;;
  test)
    run_tests
    ;;
  lint)
    run_lint
    ;;
  build)
    build_dist
    ;;
  *)
    err "Unknown command: $COMMAND"
    echo ""
    show_help
    exit 1
    ;;
esac
