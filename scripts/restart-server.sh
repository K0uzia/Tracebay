#!/bin/bash

# Script pour redémarrer le serveur avec les nouvelles modifications
# Utilise kill et npm start pour assurer un démarrage propre

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔄 Redémarrage du serveur Workspace (Phase 3B)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Répertoire du script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
WORKSPACE_DIR="$(dirname "$SCRIPT_DIR")"
SERVER_DIR="$WORKSPACE_DIR/apps/server"

echo "📁 Répertoires:"
echo "   Workspace: $WORKSPACE_DIR"
echo "   Server: $SERVER_DIR"
echo ""

# Vérifier que le répertoire du serveur existe
if [ ! -d "$SERVER_DIR" ]; then
    echo "❌ Erreur: Le répertoire du serveur n'existe pas: $SERVER_DIR"
    exit 1
fi

# Naviguer vers le répertoire du serveur
cd "$SERVER_DIR"

# Tuer les anciens processus Node.js sur le port 8060
echo "🛑 Arrêt des anciens serveurs..."
if command -v lsof &> /dev/null; then
    PIDS=$(lsof -t -i:8060 2>/dev/null || true)
    if [ ! -z "$PIDS" ]; then
        echo "   Processus trouvés sur le port 8060: $PIDS"
        for PID in $PIDS; do
            echo "   Arrêt du PID $PID..."
            kill -9 $PID 2>/dev/null || true
        done
        sleep 1
    else
        echo "   Aucun processus sur le port 8060"
    fi
else
    echo "   ⚠️  lsof non disponible, saut du nettoyage des ports"
fi

echo ""
echo "📦 Vérification des dépendances..."
if [ ! -d "node_modules" ]; then
    echo "   Installation des dépendances..."
    npm install
else
    echo "   Dépendances déjà installées"
fi

echo ""
echo "🚀 Démarrage du serveur..."
echo "   URL: http://localhost:8060"
echo "   Port: 8060"
echo "   Environnement: development"
echo ""
echo "───────────────────────────────────────────────────────────────"

# Démarrer le serveur
npm start

