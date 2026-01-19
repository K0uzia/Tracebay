#!/bin/bash
# Setup script for Proxmox CT backend installation
set -e

WORKSPACE_DIR="/workspace"
PROXMOX_DIR="$WORKSPACE_DIR/apps/proxmox"
SERVICE_NAME="workspace-proxmox"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
COMMANDS_FILE="/usr/local/bin/proxmox-ctrl"

echo "[*] Workspace Proxmox CT Installation"
echo "======================================"
echo ""

# 1. Check if workspace exists
echo "[*] Verifying workspace directory..."
if [ ! -d "$WORKSPACE_DIR" ]; then
    echo "[ERROR] Workspace directory not found: $WORKSPACE_DIR"
    exit 1
fi
echo "[OK] Workspace found"

# 2. Check if proxmox backend exists
echo "[*] Verifying Proxmox backend..."
if [ ! -d "$PROXMOX_DIR" ]; then
    echo "[ERROR] Proxmox directory not found: $PROXMOX_DIR"
    exit 1
fi
echo "[OK] Proxmox backend found"

# 3. Check Node.js
echo "[*] Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed"
    exit 1
fi
NODE_VERSION=$(node -v)
echo "[OK] Node.js $NODE_VERSION found"

# 4. Check npm
echo "[*] Checking npm..."
if ! command -v npm &> /dev/null; then
    echo "[ERROR] npm is not installed"
    exit 1
fi
NPM_VERSION=$(npm -v)
echo "[OK] npm $NPM_VERSION found"

# 5. Install dependencies
echo "[*] Installing npm dependencies..."
cd "$PROXMOX_DIR"
npm install
echo "[OK] Dependencies installed"

# 6. Create systemd service
echo "[*] Configuring systemd service..."
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
echo "[OK] Systemd service configured"

# 7. Create management commands script
echo "[*] Creating management commands..."
cat > "$COMMANDS_FILE" << 'ENDCMD'
#!/bin/bash
SERVICE_NAME="workspace-proxmox"
HEALTH_URL="http://localhost:4000/api/health"
TIMEOUT=5

check_health() {
    timeout $TIMEOUT curl -s "$HEALTH_URL" > /dev/null 2>&1
    return $?
}

case "${1:-status}" in
    start)
        echo "[*] Starting Proxmox backend..."
        systemctl start "$SERVICE_NAME"
        sleep 2
        if check_health; then
            echo "[OK] Backend is running"
            echo ""
            echo "ENDPOINTS:"
            echo "  HTTP:     http://localhost:4000"
            echo "  WebSocket: ws://localhost:4000/ws"
            echo "  Health:   http://localhost:4000/api/health"
        else
            echo "[WARN] Backend starting, checking logs..."
            journalctl -u "$SERVICE_NAME" -n 20 --no-pager
        fi
        ;;
    stop)
        echo "[*] Stopping Proxmox backend..."
        systemctl stop "$SERVICE_NAME"
        echo "[OK] Backend stopped"
        ;;
    restart)
        echo "[*] Restarting Proxmox backend..."
        systemctl restart "$SERVICE_NAME"
        sleep 2
        if check_health; then
            echo "[OK] Backend restarted"
        else
            echo "[WARN] Backend restarting..."
        fi
        ;;
    status)
        SYSTEMD_STATUS=$(systemctl is-active "$SERVICE_NAME")
        echo "[*] Systemd: $SYSTEMD_STATUS"
        if check_health; then
            echo "[*] Health: ONLINE"
        else
            echo "[*] Health: OFFLINE"
        fi
        ;;
    logs)
        journalctl -u "$SERVICE_NAME" -n 50 --no-pager
        ;;
    logs-live)
        echo "[*] Live logs (Ctrl+C to stop)"
        journalctl -u "$SERVICE_NAME" -f
        ;;
    *)
        cat << HELP
Workspace Proxmox Backend Manager

Usage: proxmox-ctrl <command>

Commands:
  start       Start the backend
  stop        Stop the backend
  restart     Restart the backend
  status      Show status
  logs        Show last 50 logs
  logs-live   Stream logs

Examples:
  proxmox-ctrl start
  proxmox-ctrl restart
  proxmox-ctrl status
  proxmox-ctrl logs-live
HELP
        ;;
esac
ENDCMD

chmod +x "$COMMANDS_FILE"
echo "[OK] Management commands created"

# 8. Create convenience symlinks
echo "[*] Creating command aliases..."
for cmd in start stop restart status logs logs-live; do
    ln -sf "$COMMANDS_FILE" "/usr/local/bin/proxmox-$cmd" 2>/dev/null || true
done
echo "[OK] Aliases created"

# Summary
echo ""
echo "======================================"
echo "[OK] Installation completed!"
echo "======================================"
echo ""
echo "Available commands:"
echo "  proxmox-ctrl start"
echo "  proxmox-ctrl stop"
echo "  proxmox-ctrl restart"
echo "  proxmox-ctrl status"
echo "  proxmox-ctrl logs"
echo "  proxmox-ctrl logs-live"
echo ""
echo "Auto-restart enabled on crash/reboot"
echo ""
