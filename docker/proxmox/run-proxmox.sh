#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.yml"
ENV_FILE="$SCRIPT_DIR/.env"

log() {
  echo "[proxmox-setup] $*"
}

die() {
  echo "[proxmox-setup] ERROR: $*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "$1 is required but not installed"
}

ensure_env_file() {
  if [[ -f "$ENV_FILE" ]]; then
    log "✅ Using existing $ENV_FILE"
    return
  fi

  if [[ -f "$SCRIPT_DIR/.env.example" ]]; then
    log "📋 Creating $ENV_FILE from .env.example"
    cp "$SCRIPT_DIR/.env.example" "$ENV_FILE"
    log "⚠️  Created $ENV_FILE. Edit it if needed, then rerun:"
    log "   nano $ENV_FILE"
    log "   $0"
    exit 0
  else
    die "Missing $ENV_FILE and .env.example"
  fi
}

compose() {
  docker compose -f "$COMPOSE_FILE" "$@"
}

wait_healthy() {
  local service="$1"
  local timeout="${2:-60}"
  local start
  start=$(date +%s)

  log "⏳ Waiting for $service to be healthy (timeout: ${timeout}s)..."

  while true; do
    local cid status now elapsed
    cid=$(compose ps -q "$service" || true)
    
    if [[ -z "$cid" ]]; then
      die "Service $service is not running"
    fi

    status=$(docker inspect --format '{{.State.Health.Status}}' "$cid" 2>/dev/null || echo "none")
    
    if [[ "$status" == "healthy" ]]; then
      log "✅ $service is healthy"
      return 0
    fi

    now=$(date +%s)
    elapsed=$((now - start))

    if [[ $elapsed -gt $timeout ]]; then
      die "$service failed to become healthy after ${timeout}s. Status: $status"
    fi

    sleep 2
  done
}

main() {
  log "======================================"
  log "🚀 Proxmox Docker Compose Setup"
  log "======================================"
  log ""

  # Check requirements
  log "📦 Checking requirements..."
  require_cmd "docker"
  require_cmd "docker compose" || require_cmd "docker-compose"
  require_cmd "curl"
  log "✅ All required commands found"
  log ""

  # Ensure .env file exists
  ensure_env_file

  # Build image
  log "🔨 Building Proxmox image..."
  if compose build --no-cache proxmox; then
    log "✅ Image built successfully"
  else
    die "Failed to build image"
  fi
  log ""

  # Start services
  log "🔄 Starting services..."
  if compose up -d; then
    log "✅ Services started"
  else
    die "Failed to start services"
  fi
  log ""

  # Wait for database
  log "🗄️  Starting database..."
  wait_healthy "db" 60
  log ""

  # Initialize database
  log "🔧 Initializing database..."
  sleep 3  # Give PostgreSQL time to be fully ready
  log "✅ Database ready"
  log ""

  # Wait for proxmox
  log "🚀 Starting Proxmox API..."
  wait_healthy "proxmox" 60
  log ""

  # Test health endpoint
  log "🧪 Testing health endpoint..."
  if curl -f http://localhost:4000/api/health >/dev/null 2>&1; then
    log "✅ Health endpoint responding"
  else
    log "⚠️  Health endpoint not responding yet, waiting..."
    sleep 5
    curl -f http://localhost:4000/api/health || die "Health endpoint failed"
    log "✅ Health endpoint now responding"
  fi
  log ""

  # Success
  log "======================================"
  log "✨ Setup complete!"
  log "======================================"
  log ""
  log "Services running:"
  log "  📚 PostgreSQL: postgres://localhost:5432/workspace"
  log "  🚀 Proxmox API: http://localhost:4000"
  log "  💬 WebSocket: ws://localhost:4000/ws"
  log ""
  log "Useful commands:"
  log "  docker compose logs -f                  # View all logs"
  log "  docker compose logs -f proxmox          # View Proxmox logs"
  log "  docker compose logs -f db               # View DB logs"
  log "  docker compose exec db psql -U workspace -d workspace"
  log "  docker compose restart                  # Restart all services"
  log "  docker compose down                     # Stop services"
  log ""
  log "📖 See DEPLOYMENT.md for more information"
  log ""
}

main "$@"
      break
    fi
    now=$(date +%s)
    if (( now - start > timeout )); then
      die "Service $service not healthy after ${timeout}s (last status: ${status:-unknown})"
    fi
    sleep 2
  done
}

main() {
  require_cmd docker
  require_cmd curl

  ensure_env_file

  log "Validating compose file"
  compose config -q

  log "Building and starting stack"
  compose up --build -d

  log "Waiting for db health"
  wait_healthy db 90

  log "Waiting for proxmox health"
  wait_healthy proxmox 90

  log "Checking HTTP health endpoint"
  curl -fsS http://localhost:4000/api/health >/dev/null

  log "Stack is up and healthy"
  compose ps
}

main "$@"
