#!/bin/bash

# Script pour lancer le serveur et l'application Electron en développement
# Utilisation: ./start-dev.sh

echo "🚀 Démarrage du serveur API..."
cd /home/goupil/Développement/workspace/apps/server
npm run start:api &
SERVER_PID=$!
echo "✅ Serveur lancé (PID: $SERVER_PID)"

# Attendre que le serveur soit prêt
sleep 3

echo "🚀 Démarrage de l'application Electron..."
cd /home/goupil/Développement/workspace/apps/client
npm start

# Au fermeture de l'app, tuer le serveur
kill $SERVER_PID 2>/dev/null || true
echo "🛑 Serveur arrêté"
