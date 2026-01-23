#!/usr/bin/env bash
#
# 🚀 Gestionnaire Proxmox Backend - Version PRO
# Interface FR + Barre progression + Nettoyage total + Logs propres

set -euo pipefail
IFS=$'\n\t'

# Forcer ANSI
export TERM=xterm-256color
export LC_ALL=C.UTF-8

# ==========================
# COULEURS SIMPLES
# ==========================
RED="\033[0;31m"; GREEN="\033[0;32m"; YELLOW="\033[1;33m"
BLUE="\033[0;34m"; CYAN="\033[0;36m"; MAGENTA="\033[0;35m"
BOLD="\033[1m"; RESET="\033[0m"

ARROW="-->"; CHECK="✓"; WARN="!"; ERROR="✘"

log() { echo -e "${CYAN}[PROXMOX]${RESET} $1"; }
info() { echo -e "${BLUE}${ARROW}${RESET} $1"; }
ok() { echo -e "${GREEN}${CHECK}${RESET} $1"; }
warn() { echo -e "${YELLOW}${WARN}${RESET} $1"; }
err() { echo -e "${RED}${ERROR}${RESET} $1"; }
title() { echo -e "\n${BOLD}═${MAGENTA} $1 ${BOLD}═${RESET}\n"; }

# BARRE DE PROGRESSION
progress_bar() {
  local percent=$1; local width=50; local done=$((percent*width/100)); local left=$((width-done))
  printf "\r${GREEN}[%-${done}s%-${left}s] ${BOLD}${percent}%%${RESET}" "$(printf '%*s' "$done" '' | tr ' ' '#')" "$(printf '%*s' "$left" '' | tr ' ' ' ')"
}

# ==========================
# CONFIG
# ==========================
WORKDIR="/workspace"
PROXMOX_DIR="$WORKDIR/proxmox"
APP_DIR="$PROXMOX_DIR/app"
DOCKER_DIR="$PROXMOX_DIR/docker"
SERVICE_NAME="workspace-proxmox"
API_PORT=4000
HEALTH_URL="http://localhost:${API_PORT}/api/health"

docker_compose() {
  command -v docker-compose >/dev/null 2>&1 && docker-compose "$@" || docker compose "$@"
}

require_root() { [[ $EUID -ne 0 ]] && { err "❌ Root requis (sudo)"; exit 1; }; }

# ==========================
# STATUS CORRIGÉ (affichage propre)
# ==========================
cmd_status() {
  local ct_ip=$(hostname -I | awk '{print $1}'); local svc=$(systemctl is-active "$SERVICE_NAME" 2>/dev/null || echo "inactive")
  local health=$([[ "$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL")" == "200" ]] && echo "EN LIGNE" || echo "HORS LIGNE")
  
  cat << EOF
${BOLD}╔════════════════════════════════════════════════════════════════════════════╗
║                    📊 ÉTAT PROXMOX BACKEND                               ║
╠════════════════════════════════════════════════════════════════════════════╣
║ Services                                                                ║
╠════════════════════════════════════════════════════════════════════════════╣
║  Systemd     | $([[ "$svc" == "active" ]] && echo "✓ ACTIF" || echo "! INACTIF")      ║
║  API         | $([[ "$health" == "EN LIGNE" ]] && echo "✓ EN LIGNE" || echo "! HORS LIGNE") ║
╠════════════════════════════════════════════════════════════════════════════╣
║ Réseau                                                                ║
╠════════════════════════════════════════════════════════════════════════════╣
║  IP          | ${BOLD}${ct_ip}${RESET}                              ║
║  Port        | ${BOLD}${API_PORT}${RESET}                            ║
╠════════════════════════════════════════════════════════════════════════════╣
║ API                                                             ║
╠════════════════════════════════════════════════════════════════════════════╣
║  http://${ct_ip}:${API_PORT}                ║
║  ws://${ct_ip}:${API_PORT}/ws              ║
║  http://${ct_ip}:${API_PORT}/api/health    ║
╚════════════════════════════════════════════════════════════════════════════╝

EOF
  
  echo "${BOLD}📦 Conteneurs:${RESET}"
  docker_compose -p workspace ps --format "table {{.Name}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null | sed 's/^/  /'
}

# ==========================
# LOGS NODE/EXPRESS UNIQUEMENT
# ==========================
cmd_logs() {
  local live=${1:-}
  echo "${BOLD}📜 Logs Node/Express${RESET}"
  if [[ $live == "live" ]]; then
    journalctl -u "$SERVICE_NAME" -f -o cat | grep -E "(INFO|WARN|ERROR|GET|POST|Server listening)"
  else
    journalctl -u "$SERVICE_NAME" -n 30 -o cat --no-pager | grep -E "(INFO|WARN|ERROR|GET|POST|Server listening|\[2026)"
  fi
}

# ==========================
# REBUILD avec BARRE PROGRESSION + NETTOYAGE TOTAL
# ==========================
cmd_rebuild() {
  require_root
  title "🔄 RECONSTRUCTION TOTALE (Nettoyage 100%)"
  
  echo -e "${YELLOW}⚠️  SUPPRIME: Docker/Node/BDD/Caches (2-3Go récupérés)${RESET}"
  read -p "Confirmer [o/N]? " -n 1 -r && echo && [[ ! $REPLY =~ ^[oO]$ ]] && exit 0
  
  local space_before=$(df / --output=used | tail -1); local step=0; local total_steps=8
  
  # Étape 1: STOP (12%)
  progress_bar $((++step*100/total_steps)); echo -e "\n${CYAN}1️⃣ Arrêt services...${RESET}"
  systemctl stop "$SERVICE_NAME" 2>/dev/null || true
  docker_compose -p workspace down -v --remove-orphans >/dev/null 2>&1 || true
  
  # Étape 2: Docker CLEAN (25%)
  progress_bar $((++step*100/total_steps)); echo -e "\n${CYAN}2️⃣ Nettoyage Docker...${RESET}"
  docker system prune -a -f --volumes >/dev/null 2>&1
  docker volume prune -f >/dev/null 2>&1
  docker builder prune -a -f >/dev/null 2>&1
  
  # Étape 3: Node CLEAN (37%)
  progress_bar $((++step*100/total_steps)); echo -e "\n${CYAN}3️⃣ Nettoyage Node...${RESET}"
  rm -rf "$APP_DIR/node_modules" "$APP_DIR/dist" "/root/.npm" "/tmp/npm*"
  npm cache clean --force >/dev/null 2>&1
  
  # Étape 4: Logs (50%)
  progress_bar $((++step*100/total_steps)); echo -e "\n${CYAN}4️⃣ Purge logs...${RESET}"
  journalctl --vacuum-time=2s >/dev/null 2>&1
  
  # Étape 5: Git (62%)
  progress_bar $((++step*100/total_steps)); echo -e "\n${CYAN}5️⃣ Code Git...${RESET}"
  cd "$WORKDIR" && git checkout proxmox && git pull origin proxmox >/dev/null 2>&1
  
  # Étape 6: Dépendances (75%)
  progress_bar $((++step*100/total_steps)); echo -e "\n${CYAN}6️⃣ Dépendances...${RESET}"
  cd "$APP_DIR" && npm ci --only=production --no-optional >/dev/null 2>&1 && npm run build >/dev/null 2>&1
  
  # Étape 7: Docker Build SILENCIEUX (87%)
  progress_bar $((++step*100/total_steps)); echo -e "\n${CYAN}7️⃣ Images Docker...${RESET}"
  cd "$DOCKER_DIR"
  docker_compose build --no-cache --progress=plain --pull >/dev/null 2>&1
  
  # Étape 8: Démarrage (100%)
  progress_bar $((++step*100/total_steps)); echo -e "\n${CYAN}8️⃣ Démarrage...${RESET}"
  systemctl daemon-reload && systemctl restart "$SERVICE_NAME"
  sleep 8 && curl -fsS "$HEALTH_URL" >/dev/null 2>&1 && ok "✅ Santé OK" || warn "⚠️  Vérifiez logs"
  
  echo -e "\n${BOLD}📊 ESPACE:${RESET} $(df / --output=used,avail | tail -1 | awk '{printf "%s (%.0f%% libre)\n", $1"/"$2, ($2-$1)/$2*100}')"
  cmd_status
}

# Autres fonctions (simplifiées)
cmd_start() { require_root && systemctl start "$SERVICE_NAME" && sleep 5 && cmd_status; }
cmd_stop() { require_root && systemctl stop "$SERVICE_NAME" && ok "Arrêté"; }
cmd_restart() { require_root && systemctl restart "$SERVICE_NAME" && sleep 5 && cmd_status; }
cmd_diag() { cmd_status && docker system df && df -h /; }

show_help() {
  cat << 'EOF'
🚀 PROXMOX BACKEND MANAGER

📥  Installation    → sudo bash proxmox.sh install
⚙️   Services
  start/up         → Démarrer
  stop/down        → Arrêter  
  restart          → Redémarrer
  status/st        → État

🔧 Maintenance
  logs [live]      → Logs Node/Express
  rebuild          → Reconstruction totale
  diag             → Diagnostic

💾 rebuild = Nettoyage Docker/Node/BDD + Reconstruction
EOF
}

# EXEC
case "${1:-help}" in
  install) echo "Utilisez: sudo bash $0 install"; exit 1 ;;
  start|up|on) cmd_start ;;
  stop|down|off) cmd_stop ;;
  restart) cmd_restart ;;
  status|st) cmd_status ;;
  logs|log) shift; cmd_logs "$@";;
  rebuild|build) cmd_rebuild ;;
  diag) cmd_diag ;;
  help|-h|--help) show_help ;;
  *) show_help; exit 1 ;;
esac
