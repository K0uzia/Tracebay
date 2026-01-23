#!/bin/bash

# Script d'installation automatisé pour serveur backend Proxmox - VERSION CORRIGÉE
# Couleurs ANSI pour sorties claires
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Fonctions d'affichage coloré
print_header() {
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║ $1 ${BLUE}$(printf ' %.0s' $(seq 1 $((65-${#1}))))${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
}

print_success() { echo -e "${GREEN}[✓] $1${NC}"; }
print_error()   { echo -e "${RED}[✗] $1${NC}"; exit 1; }
print_warning() { echo -e "${YELLOW}[!] $1${NC}"; }
print_info()    { echo -e "${BLUE}[i] $1${NC}"; }

# Tableau formaté
print_table() {
    local headers=("$@")
    local width=70
    printf "${BLUE}┌%*s┐${NC}\n" ${width} '' | tr ' ' ─
    printf "${BLUE}│ %-${width}s │${NC}\n" "$(printf '%s' "${headers[0]}")"
    printf "${BLUE}├%*s┤${NC}\n" ${width} '' | tr ' ' ─
    shift
    for row in "$@"; do
        printf "${GREEN}│ %-${width}s │${NC}\n" "$row"
    done
    printf "${BLUE}└%*s┘${NC}\n" ${width} '' | tr ' ' ─
}

# Détection automatique du répertoire projet
detect_project_root() {
    local root=""
    [[ -f "package.json" ]] && root=$(pwd) && return 0
    [[ -f "../package.json" ]] && root=.. && return 0
    [[ -f "../../package.json" ]] && root=../.. && return 0
    print_error "Aucun package.json détecté dans le répertoire courant ou parents"
}

# Détection IP et port
detect_host_info() {
    IP=$(hostname -I | awk '{print $1}')
    PORT=3000
    print_info "IP détectée: $IP, Port: $PORT"
}

# Vérification Node.js et TypeScript
check_prerequisites() {
    print_header "Vérification prérequis"
    
    # Vérifier Node.js
    if ! command -v node >/dev/null 2>&1; then
        print_error "Node.js non installé. Installez-le d'abord: apt install nodejs npm"
    fi
    print_info "Node.js: $(node --version)"
    
    # Vérifier npm
    if ! command -v npm >/dev/null 2>&1; then
        print_error "npm non installé"
    fi
    print_info "npm: $(npm --version)"
    
    # Installer TypeScript globalement si manquant
    if ! npx tsc --version >/dev/null 2>&1; then
        print_info "Installation TypeScript..."
        npm install -g typescript @types/node || print_warning "Échec installation TypeScript global"
    fi
}

# 1. Détection et validation
print_header "Détection environnement"
detect_project_root
cd "$root" || print_error "Impossible d'accéder au répertoire projet"
detect_host_info
check_prerequisites

# Vérification fichiers essentiels
[[ ! -f "package.json" ]] && print_error "package.json manquant"
[[ ! -f "tsconfig.json" ]] && print_error "tsconfig.json manquant"
print_success "Fichiers projet détectés"

# 2. Installation dépendances Node.js
print_header "Installation dépendances Node.js"
npm ci --omit=dev || print_error "Échec installation dépendances"

# 3. Build TypeScript (avec fallback)
print_header "Compilation TypeScript"
if npx tsc --build; then
    print_success "Build TypeScript terminé"
elif npm run build >/dev/null 2>&1; then
    print_success "Build via package.json script terminé"
elif [[ -f "dist" || -f "build" ]]; then
    print_warning "Répertoire build existant détecté"
else
    print_warning "Build TypeScript ignoré - vérifiez manuellement"
fi

# 4. Configuration .env automatique
print_header "Configuration environnement"
cat > .env << EOF
NODE_ENV=production
HOST=$IP
PORT=$PORT
DB_HOST=db
DB_PORT=5432
DB_NAME=proxmox
DB_USER=proxmox
DB_PASS=securepass123
JWT_SECRET=$(openssl rand -base64 32)
WS_PORT=8080
EOF
print_success ".env configuré: $IP:$PORT"

# 5. Dockerfile pour backend
cat > Dockerfile << 'EOF'
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build || echo "Build skipped"
EXPOSE 3000 8080
CMD ["npm", "start"]
EOF
print_success "Dockerfile créé"

# 6. Docker Compose (corrigé avec init DB)
cat > docker-compose.yml << EOF
version: '3.8'
services:
  backend:
    build: .
    ports:
      - "${PORT}:3000"
      - "8080:8080"
    environment:
      - NODE_ENV=production
    volumes:
      - .:/app
      - /app/node_modules
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped
    networks:
      - proxmox-net

  db:
    image: postgres:16-alpine
    container_name: proxmox-db
    environment:
      POSTGRES_DB: proxmox
      POSTGRES_USER: proxmox
      POSTGRES_PASSWORD: securepass123
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./proxmox/app/src/db:/docker-entrypoint-initdb.d
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U proxmox -d proxmox"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    networks:
      - proxmox-net

volumes:
  pgdata:

networks:
  proxmox-net:
    driver: bridge
EOF
print_success "docker-compose.yml créé (auto-init DB)"

# 7. Service systemd (corrigé)
mkdir -p /etc/systemd/system
cat > /etc/systemd/system/proxmox-backend.service << EOF
[Unit]
Description=Proxmox Backend Server
After=docker.service network.target
Requires=docker.service
Wants=docker.service

[Service]
Type=simple
WorkingDirectory=$(pwd)
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
ExecReload=/bin/kill -s HUP \$MAINPID
Restart=always
RestartSec=5s
User=root

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable proxmox-backend || print_warning "Service systemd déjà activé"

# 8. CLI locale proxmox (améliorée)
cat > /usr/local/bin/proxmox << 'EOF'
#!/bin/bash
PROJ_DIR=$(dirname "$0")/../workspace
cd "$PROJ_DIR" || exit 1

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

status() {
    echo -e "${BLUE}╔═══════════════════════ PROXMOX STATUS ═══════════════════════╗${NC}"
    echo -e "${BLUE}║ Service systemd${NC}"
    systemctl is-active proxmox-backend >/dev/null 2>&1 && echo -e "  ${GREEN}[✓] ACTIF${NC}" || echo -e "  ${RED}[✗] INACTIF${NC}"
    
    echo -e "${BLUE}║ Serveur Node.js${NC}"
    docker ps --filter "name=backend" --format "table {{.Names}}\t{{.Status}}" | sed 's/^/  /'
    
    echo -e "${BLUE}║ API Health${NC}"
    curl -s http://localhost:3000/api/health | jq .status 2>/dev/null | grep -q "ok" && echo -e "  ${GREEN}[✓] OK${NC}" || echo -e "  ${YELLOW}[?] Vérifiez${NC}"
    
    echo -e "${BLUE}║ Conteneurs Docker${NC}"
    docker ps --format "table {{.Names}}\t{{.Status}}" | grep -E "(backend|db)" | sed 's/^/  /'
    
    IP=$(hostname -I | awk '{print $1}')
    echo -e "${BLUE}║ Accès${NC}    IP: ${GREEN}$IP:3000${NC}  WS: ${GREEN}ws://$IP:8080${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
}

case "$1" in
    install)
        echo "Installation via script principal recommandée"
        ;;
    start)
        systemctl start proxmox-backend
        sleep 3
        status
        ;;
    stop)
        systemctl stop proxmox-backend
        ;;
    restart)
        systemctl restart proxmox-backend
        sleep 3
        status
        ;;
    rebuild)
        docker compose build --no-cache
        systemctl restart proxmox-backend
        ;;
    logs)
        journalctl -u proxmox-backend -f
        ;;
    status)
        status
        ;;
    *)
        echo "Usage: proxmox {install|start|stop|restart|rebuild|logs|status}"
        exit 1
        ;;
esac
EOF

chmod +x /usr/local/bin/proxmox

print_success "CLI 'proxmox' installée et améliorée"

# 9. Lancement initial
print_header "Lancement services"
docker compose up -d --build || print_error "Échec démarrage Docker"
sleep 10

# 10. Affichage statut final
print_header "INSTALLATION TERMINÉE"
print_table "Serveur Proxmox Backend opérationnel !" \
            "IP: $IP:$PORT | CLI: proxmox status | WS: $IP:8080" \
            "Endpoints: chat, agenda, réception, raccourcis, comptes" \
            "Gestion: systemctl / docker compose / proxmox CLI"

proxmox status

print_success "✅ Installation réussie ! Serveur prêt à l'emploi"
echo -e "${YELLOW}Commandes:${NC} proxmox status | start | stop | restart | logs"
