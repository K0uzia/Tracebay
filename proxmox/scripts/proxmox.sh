#!/bin/bash

# Script d'installation automatisé pour serveur backend Proxmox dans conteneur Debian 13
# Couleurs ANSI pour sorties claires
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Fonctions d'affichage coloré
print_header() {
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║ $1 ${BLUE}$(printf ' %.0s' $(seq 1 ${#1}))${NC}"
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
    printf "${BLUE}┌%s┐${NC}\n" $(printf '─%.0s' {1..70})
    printf "${BLUE}│ %-${width}s │${NC}\n" "$(printf '%s' "${headers[0]}")"
    printf "${BLUE}├%s┤${NC}\n" $(printf '─%.0s' {1..70})
    shift
    for row in "$@"; do
        printf "${GREEN}│ %-${width}s │${NC}\n" "$row"
    done
    printf "${BLUE}└%s┘${NC}\n" $(printf '─%.0s' {1..70})
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

# 1. Détection et validation
print_header "Détection environnement"
detect_project_root
cd "$root" || print_error "Impossible d'accéder au répertoire projet"
detect_host_info

# Vérification fichiers essentiels
[[ ! -f "package.json" ]] && print_error "package.json manquant"
[[ ! -f "tsconfig.json" ]] && print_error "tsconfig.json manquant"
print_success "Fichiers projet détectés"

# 2. Installation dépendances Node.js
print_header "Installation dépendances Node.js"
npm ci --only=production || print_error "Échec installation dépendances"

# Build TypeScript
print_header "Compilation TypeScript"
npx tsc --build || print_error "Échec build TypeScript"
print_success "Build terminé"

# 3. Configuration .env automatique
print_header "Configuration environnement"
cat > .env << EOF
NODE_ENV=production
HOST=$IP
PORT=$PORT
DB_HOST=localhost
DB_PORT=5432
DB_NAME=proxmox
DB_USER=proxmox
DB_PASS=securepass123
JWT_SECRET=$(openssl rand -base64 32)
WS_PORT=8080
EOF
print_success ".env configuré: $IP:$PORT"

# 4. Installation Docker et dépendances système
print_header "Installation Docker"
apt-get update
apt-get install -y docker.io docker-compose postgresql postgresql-contrib jq curl
systemctl enable docker postgresql
systemctl start docker postgresql
print_success "Docker et PostgreSQL installés"

# 5. Initialisation base de données
print_header "Initialisation PostgreSQL"
sudo -u postgres psql << EOF
CREATE DATABASE proxmox;
CREATE USER proxmox WITH PASSWORD 'securepass123';
GRANT ALL PRIVILEGES ON DATABASE proxmox TO proxmox;
EOF

# Import schema
[[ -f "proxmox/app/src/db/schema.sql" ]] && {
    sudo -u postgres psql -d proxmox -f proxmox/app/src/db/schema.sql
    print_success "Schéma DB importé"
} || print_warning "schema.sql non trouvé"

# 6. Docker Compose pour backend + DB
cat > docker-compose.yml << 'EOF'
version: '3.8'
services:
  backend:
    build: .
    ports:
      - "3000:3000"
      - "8080:8080"
    environment:
      - NODE_ENV=production
    volumes:
      - .:/app
    depends_on:
      - db
    restart: unless-stopped

  db:
    image: postgres:16
    environment:
      POSTGRES_DB: proxmox
      POSTGRES_USER: proxmox
      POSTGRES_PASSWORD: securepass123
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  pgdata:
EOF
print_success "docker-compose.yml créé"

# 7. Service systemd
cat > /etc/systemd/system/proxmox-backend.service << EOF
[Unit]
Description=Proxmox Backend Server
After=docker.service
Requires=docker.service

[Service]
Type=notify
WorkingDirectory=$(pwd)
ExecStart=/usr/bin/docker-compose up
ExecStop=/usr/bin/docker-compose down
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable proxmox-backend

# 8. CLI locale proxmox
cat > /usr/local/bin/proxmox << 'EOF'
#!/bin/bash
cd "$(dirname "$0")/../../$(basename "$0")" || exit 1

case "$1" in
    install)
        echo "Installation déjà effectuée"
        ;;
    start)
        systemctl start proxmox-backend
        ;;
    stop)
        systemctl stop proxmox-backend
        ;;
    restart)
        systemctl restart proxmox-backend
        ;;
    rebuild)
        docker-compose build --no-cache
        systemctl restart proxmox-backend
        ;;
    logs)
        journalctl -u proxmox-backend -f
        ;;
    status)
        echo "=== STATUT PROXMOX BACKEND ==="
        systemctl is-active proxmox-backend >/dev/null && echo "✓ Service systemd: ACTIF" || echo "✗ Service systemd: INACTIF"
        curl -s http://localhost:3000/api/health | jq .status 2>/dev/null | grep -q "ok" && echo "✓ API /health: OK" || echo "✗ API /health: KO"
        docker ps --format "table {{.Names}}\t{{.Status}}" | grep -E "(backend|db)"
        ;;
    *)
        echo "Usage: proxmox {install|start|stop|restart|rebuild|logs|status}"
        exit 1
        ;;
esac
EOF

chmod +x /usr/local/bin/proxmox
ln -sf "$(pwd)" /usr/local/bin/proxmox-dir

print_success "CLI 'proxmox' installée"

# 9. Lancement initial
print_header "Lancement services"
systemctl start proxmox-backend
sleep 5

# 10. Affichage statut final
print_header "STATUT FINAL"
print_table "INSTALLATION TERMINÉE - Serveur prêt !" \
            "IP: $IP | Port: $PORT | CLI: proxmox status" \
            "Endpoints: chat, agenda, réception, raccourcis, comptes" \
            "WebSocket: ws://$IP:8080"

proxmox status

print_success "🚀 Serveur Proxmox Backend opérationnel !"
print_info "Commandes disponibles: proxmox {start|stop|restart|status|logs}"
