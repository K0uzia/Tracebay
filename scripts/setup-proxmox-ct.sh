#!/bin/bash

# Setup script for Proxmox CT backend installation
# Installs dependencies, configures auto-restart, and provides management commands

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

WORKSPACE_DIR="/workspace"
PROXMOX_DIR="$WORKSPACE_DIR/apps/proxmox"
SERVICE_NAME="workspace-proxmox"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
COMMANDS_FILE="/usr/local/bin/proxmox-ctrl"

echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║ 🚀 WORKSPACE PROXMOX CT INSTALLATION SETUP                    ║${NC}"
echo -e "${BLUE)╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# 1. Check if workspace exists
echo -e "${BLUE}1. Vérification du répertoire workspace...${NC}"
if [ ! -d "$WORKSPACE_DIR" ]; then
    echo -e "${RED}❌ Le répertoire $WORKSPACE_DIR n'existe pas${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Workspace trouvé${NC}"

# 2. Check if proxmox backend exists
echo -e "${BLUE}2. Vérification du backend Proxmox...${NC}"
if [ ! -d "$PROXMOX_DIR" ]; then
    echo -e "${RED}❌ Le répertoire $PROXMOX_DIR n'existe pas${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Backend trouvé${NC}"

# 3. Check Node.js
echo -e "${BLUE}3. Vérification de Node.js...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js n'est pas installé${NC}"
    exit 1
fi
NODE_VERSION=$(node -v)
echo -e "${GREEN}✅ Node.js $NODE_VERSION${NC}"

# 4. Check npm
echo -e "${BLUE}4. Vérification de npm...${NC}"
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm n'est pas installé${NC}"
    exit 1
fi
NPM_VERSION=$(npm -v)
echo -e "${GREEN}✅ npm $NPM_VERSION${NC}"

# 5. Install dependencies
echo -e "${BLUE}5. Installation des dépendances...${NC}"
cd "$PROXMOX_DIR"
npm install
echo -e "${GREEN}✅ Dépendances installées${NC}"

# 6. Create systemd service
echo -e "${BLUE}6. Configuration du service systemd...${NC}"
cat > "$SERVICE_FILE" << 'EOF'
[Unit]
Description=Workspace Proxmox Backend API
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/workspace/apps/proxmox
ExecStart=/usr/bin/npm run start
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=workspace-proxmox

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
echo -e "${GREEN}✅ Service systemd configuré${NC}"

# 7. Create management commands script
echo -e "${BLUE}7. Création des commandes de gestion...${NC}"
cat > "$COMMANDS_FILE" << 'EOF'
#!/bin/bash

# Workspace Proxmox Backend Management Commands
# Usage: proxmox-ctrl [start|stop|restart|status|logs|logs-live]

SERVICE_NAME="workspace-proxmox"
PROXMOX_DIR="/workspace/apps/proxmox"
HEALTH_URL="http://localhost:4000/api/health"
TIMEOUT=5

BLUE='\033[0;34m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

check_health() {
    timeout $TIMEOUT curl -s "$HEALTH_URL" > /dev/null 2>&1
    return $?
}

get_status_text() {
    if check_health; then
        echo -e "${GREEN}en ligne${NC}"
        return 0
    else
        if systemctl is-active --quiet "$SERVICE_NAME"; then
            echo -e "${YELLOW}gelé/pas réactif${NC}"
            return 2
        fi
        echo -e "${RED}hors ligne${NC}"
        return 1
    fi
}

case "${1:-status}" in
    start)
        echo -e "${BLUE}🚀 Démarrage du backend Proxmox...${NC}"
        systemctl start "$SERVICE_NAME"
        sleep 2
        if check_health; then
            echo -e "${GREEN}✅ Backend démarré et opérationnel${NC}"
            echo ""
            echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
            echo -e "${BLUE}║ 🎯 ENDPOINTS DISPONIBLES                                      ║${NC}"
            echo -e "${BLUE)╠═══════════════════════════════════════════════════════════════╣${NC}"
            echo -e "${BLUE}║ URL HTTP:    ${GREEN}http://localhost:4000${BLUE}                              ║${NC}"
            echo -e "${BLUE}║ WebSocket:   ${GREEN}ws://localhost:4000/ws${BLUE}                            ║${NC}"
            echo -e "${BLUE}║ Health:      ${GREEN}http://localhost:4000/api/health${BLUE}                  ║${NC}"
            echo -e "${BLUE}║ Metrics:     ${GREEN}http://localhost:4000/api/metrics${BLUE}                  ║${NC}"
            echo -e "${BLUE}║ Auth:        ${GREEN}http://localhost:4000/api/auth/*${BLUE}                   ║${NC}"
            echo -e "${BLUE}║ Events:      ${GREEN}http://localhost:4000/api/events${BLUE}                   ║${NC}"
            echo -e "${BLUE}║ Messages:    ${GREEN}http://localhost:4000/api/messages${BLUE}                 ║${NC}"
            echo -e "${BLUE}║ Marques:     ${GREEN}http://localhost:4000/api/marques${BLUE}                  ║${NC}"
            echo -e "${BLUE)║ Lots:        ${GREEN}http://localhost:4000/api/lots${BLUE}                     ║${NC}"
            echo -e "${BLUE}║ Shortcuts:   ${GREEN}http://localhost:4000/api/shortcuts${BLUE}                ║${NC}"
            echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════╝${NC}"
        else
            echo -e "${YELLOW}⚠️  Backend en cours de démarrage (verifiez les logs)${NC}"
            journalctl -u "$SERVICE_NAME" -n 20 --no-pager
        fi
        ;;
    stop)
        echo -e "${RED}🛑 Arrêt du backend Proxmox...${NC}"
        systemctl stop "$SERVICE_NAME"
        sleep 1
        echo -e "${GREEN}✅ Backend arrêté${NC}"
        ;;
    restart)
        echo -e "${BLUE}🔄 Redémarrage du backend Proxmox...${NC}"
        systemctl restart "$SERVICE_NAME"
        sleep 2
        if check_health; then
            echo -e "${GREEN}✅ Backend redémarré et opérationnel${NC}"
        else
            echo -e "${YELLOW}⚠️  Backend en cours de démarrage${NC}"
        fi
        ;;
    status)
        echo -e "${BLUE}📊 Statut du backend Proxmox:${NC}"
        echo ""
        SYSTEMD_STATUS=$(systemctl is-active "$SERVICE_NAME")
        echo -e "  Systemd:      $SYSTEMD_STATUS"
        echo -e "  Health:       $(get_status_text)"
        
        if [ "$SYSTEMD_STATUS" = "active" ]; then
            PID=$(systemctl show -p MainPID --value "$SERVICE_NAME")
            echo -e "  PID:          $PID"
            echo -e "  Memory:       $(ps aux | grep "[n]ode.*main.js" | awk '{print $6}')KB"
        fi
        echo ""
        ;;
    logs)
        echo -e "${BLUE}📋 Derniers logs Proxmox:${NC}"
        journalctl -u "$SERVICE_NAME" -n 50 --no-pager
        ;;
    logs-live)
        echo -e "${BLUE}🔴 Logs en direct (Ctrl+C pour arrêter):${NC}"
        journalctl -u "$SERVICE_NAME" -f
        ;;
    help)
        cat << HELP
${BLUE}Workspace Proxmox Backend Manager${NC}

Usage: proxmox-ctrl <command>

Commands:
  ${GREEN}start${NC}        Démarrer le backend Proxmox
  ${GREEN}stop${NC}         Arrêter le backend Proxmox
  ${GREEN}restart${NC}      Redémarrer le backend Proxmox
  ${GREEN}status${NC}       Afficher le statut du backend
  ${GREEN}logs${NC}         Afficher les derniers logs
  ${GREEN}logs-live${NC}    Afficher les logs en direct
  ${GREEN}help${NC}         Afficher cette aide

Examples:
  proxmox-ctrl start       # Démarrer le serveur
  proxmox-ctrl restart     # Redémarrer le serveur
  proxmox-ctrl status      # Voir le statut
  proxmox-ctrl logs        # Voir les logs
  proxmox-ctrl logs-live   # Voir les logs en temps réel

HELP
        ;;
    *)
        echo -e "${RED}Commande inconnue: $1${NC}"
        echo "Utilisez: proxmox-ctrl help"
        exit 1
        ;;
esac
EOF

chmod +x "$COMMANDS_FILE"
echo -e "${GREEN}✅ Commandes créées${NC}"

# 8. Create convenience symlinks
echo -e "${BLUE}8. Création des alias de commandes...${NC}"
for cmd in start stop restart status logs logs-live; do
    ln -sf "$COMMANDS_FILE" "/usr/local/bin/proxmox-$cmd" 2>/dev/null || true
done
echo -e "${GREEN}✅ Alias créés${NC}"

# Summary
echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║ ✅ INSTALLATION TERMINÉE                                      ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}Commandes disponibles:${NC}"
echo "  ${YELLOW}proxmox-ctrl start${NC}       # Démarrer"
echo "  ${YELLOW}proxmox-ctrl stop${NC}        # Arrêter"
echo "  ${YELLOW}proxmox-ctrl restart${NC}     # Redémarrer"
echo "  ${YELLOW}proxmox-ctrl status${NC}      # Statut"
echo "  ${YELLOW}proxmox-ctrl logs${NC}        # Logs"
echo "  ${YELLOW}proxmox-ctrl logs-live${NC}   # Logs en direct"
echo ""
echo -e "${YELLOW}Le serveur redémarrera automatiquement en cas de crash ou redémarrage du CT${NC}"
echo ""
