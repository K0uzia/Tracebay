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
    return
  fi

  if [[ -f "$SCRIPT_DIR/.env.example" ]]; then
    cp "$SCRIPT_DIR/.env.example" "$ENV_FILE"
    die "Created $ENV_FILE from .env.example. Please edit it with real values then rerun."
  else
    die "Missing $ENV_FILE and .env.example; add environment variables before running."
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

  while true; do
    local cid status now
    cid=$(compose ps -q "$service" || true)
    [[ -n "$cid" ]] || die "Service $service is not running"
    status=$(docker inspect --format '{{.State.Health.Status}}' "$cid" 2>/dev/null || true)
    if [[ "$status" == "healthy" ]]; then
      log "$service is healthy"
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
