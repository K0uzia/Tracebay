#!/bin/bash

# Proxmox Backend Manager
# Gère le démarrage, arrêt, redémarrage et statut du backend Proxmox

WORKSPACE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROXMOX_DIR="$WORKSPACE_DIR/apps/proxmox"
PID_FILE="$WORKSPACE_DIR/.proxmox.pid"
LOG_FILE="$WORKSPACE_DIR/logs/proxmox.log"
HEALTH_URL="http://192.168.1.62:4000/api/health"
TIMEOUT=5

# Créer le répertoire logs s'il n'existe pas
mkdir -p "$WORKSPACE_DIR/logs"

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Fonctions
print_status() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✅ $2${NC}"
    else
        echo -e "${RED}❌ $2${NC}"
    fi
}

check_health() {
    timeout $TIMEOUT curl -s "$HEALTH_URL" > /dev/null 2>&1
    return $?
}

get_status_text() {
    if check_health; then
        echo -e "${GREEN}en ligne${NC}"
        return 0
    else
        if [ -f "$PID_FILE" ]; then
            local pid=$(cat "$PID_FILE")
            if kill -0 "$pid" 2>/dev/null; then
                echo -e "${YELLOW}gelé/pas réactif${NC}"
                return 2
            fi
        fi
        echo -e "${RED}hors ligne${NC}"
        return 1
    fi
}

# Commande: START
start() {
    if [ -f "$PID_FILE" ]; then
        local pid=$(cat "$PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            echo -e "${YELLOW}⚠️  Proxmox est déjà en cours d'exécution (PID: $pid)${NC}"
            return 1
        fi
    fi

    echo -e "${BLUE}🚀 Démarrage du backend Proxmox...${NC}"
    cd "$PROXMOX_DIR"
    
    # Compiler TypeScript si nécessaire
    npm run build > /dev/null 2>&1
    
    # Démarrer en arrière-plan
    npm run start >> "$LOG_FILE" 2>&1 &
    local pid=$!
    echo $pid > "$PID_FILE"
    
    # Attendre que le serveur soit prêt
    local max_attempts=30
    local attempt=0
    while [ $attempt -lt $max_attempts ]; do
        if check_health; then
            print_status 0 "Backend Proxmox démarré (PID: $pid)"
            return 0
        fi
        attempt=$((attempt + 1))
        sleep 1
    done
    
    print_status 1 "Timeout: le backend n'a pas répondu dans le délai imparti"
    return 1
}

# Commande: STOP
stop() {
    if [ ! -f "$PID_FILE" ]; then
        echo -e "${YELLOW}⚠️  Aucun processus Proxmox en cours d'exécution${NC}"
        return 1
    fi

    local pid=$(cat "$PID_FILE")
    if ! kill -0 "$pid" 2>/dev/null; then
        echo -e "${YELLOW}⚠️  Le processus (PID: $pid) n'existe pas${NC}"
        rm -f "$PID_FILE"
        return 1
    fi

    echo -e "${BLUE}🛑 Arrêt du backend Proxmox (PID: $pid)...${NC}"
    kill "$pid"
    
    # Attendre l'arrêt
    local max_attempts=10
    local attempt=0
    while [ $attempt -lt $max_attempts ]; do
        if ! kill -0 "$pid" 2>/dev/null; then
            rm -f "$PID_FILE"
            print_status 0 "Backend Proxmox arrêté"
            return 0
        fi
        attempt=$((attempt + 1))
        sleep 1
    done
    
    # Forcer l'arrêt si nécessaire
    kill -9 "$pid" 2>/dev/null
    rm -f "$PID_FILE"
    print_status 0 "Backend Proxmox forcément arrêté"
    return 0
}

# Commande: RESTART
restart() {
    echo -e "${BLUE}🔄 Redémarrage du backend Proxmox...${NC}"
    stop
    sleep 2
    start
}

# Commande: STATUS
status() {
    echo -e "${BLUE}📊 Statut du backend Proxmox:${NC}"
    echo ""
    
    if [ ! -f "$PID_FILE" ]; then
        echo -e "  Statut: $(get_status_text)"
        echo -e "  Aucun fichier PID trouvé"
        return 1
    fi

    local pid=$(cat "$PID_FILE")
    local status_text=$(get_status_text)
    local status_code=$?
    
    echo -e "  PID: $pid"
    echo -e "  Statut: $status_text"
    echo -e "  URL: http://192.168.1.62:4000"
    echo -e "  Health: http://192.168.1.62:4000/api/health"
    echo -e "  WebSocket: ws://192.168.1.62:4000/ws"
    echo ""
    
    if [ $status_code -eq 0 ]; then
        echo -e "  ${GREEN}Le serveur est opérationnel${NC}"
        return 0
    elif [ $status_code -eq 2 ]; then
        echo -e "  ${YELLOW}Le serveur ne répond pas (peut être bloqué)${NC}"
        return 2
    else
        echo -e "  ${RED}Le serveur est arrêté${NC}"
        return 1
    fi
}

# Commande: LOGS
logs() {
    if [ ! -f "$LOG_FILE" ]; then
        echo -e "${YELLOW}⚠️  Pas de fichiers logs${NC}"
        return 1
    fi
    
    echo -e "${BLUE}📋 Derniers logs Proxmox (dernières 50 lignes):${NC}"
    echo ""
    tail -50 "$LOG_FILE"
}

# Commande: LOGS LIVE
logs_live() {
    if [ ! -f "$LOG_FILE" ]; then
        echo -e "${YELLOW}⚠️  Pas de fichiers logs${NC}"
        return 1
    fi
    
    echo -e "${BLUE}🔴 Affichage en direct des logs (Ctrl+C pour arrêter):${NC}"
    echo ""
    tail -f "$LOG_FILE"
}

# Menu aide
show_help() {
    cat << EOF
${BLUE}Proxmox Backend Manager${NC}

Usage: $(basename "$0") <command>

Commandes:
  ${GREEN}start${NC}        Démarrer le backend Proxmox
  ${GREEN}stop${NC}         Arrêter le backend Proxmox
  ${GREEN}restart${NC}      Redémarrer le backend Proxmox
  ${GREEN}status${NC}       Afficher le statut du backend Proxmox
  ${GREEN}logs${NC}         Afficher les derniers logs
  ${GREEN}logs-live${NC}    Afficher les logs en direct
  ${GREEN}help${NC}         Afficher cette aide

Exemples:
  $(basename "$0") start       # Démarrer le serveur
  $(basename "$0") restart     # Redémarrer le serveur
  $(basename "$0") status      # Voir le statut
  $(basename "$0") logs        # Voir les logs
  $(basename "$0") logs-live   # Voir les logs en temps réel

EOF
}

# Main
case "${1:-status}" in
    start)
        start
        ;;
    stop)
        stop
        ;;
    restart)
        restart
        ;;
    status)
        status
        ;;
    logs)
        logs
        ;;
    logs-live)
        logs_live
        ;;
    help)
        show_help
        ;;
    *)
        echo -e "${RED}Commande inconnue: $1${NC}"
        show_help
        exit 1
        ;;
esac
