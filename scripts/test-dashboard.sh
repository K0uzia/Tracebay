#!/bin/bash

# Script de test pour le dashboard du serveur
# Simule des messages de chat et des requêtes HTTP

echo "🧪 Démarrage des tests du dashboard..."

BASE_URL="http://localhost:8060"
CHAT_ENDPOINT="$BASE_URL/api/monitoring/log-chat"
REQUEST_ENDPOINT="$BASE_URL/api/monitoring/log-request"

# Test 1: Enregistrer un message de chat
echo ""
echo "📝 Test 1: Enregistrement d'un message de chat..."
curl -X POST "$CHAT_ENDPOINT" \
  -H "Content-Type: application/json" \
  -d '{"user": "Alice", "message": "Bonjour tout le monde!"}' \
  -s | jq '.'

# Test 2: Enregistrer une requête GET
echo ""
echo "📡 Test 2: Enregistrement d'une requête GET..."
curl -X POST "$REQUEST_ENDPOINT" \
  -H "Content-Type: application/json" \
  -d '{"method": "GET", "path": "/api/monitoring/stats", "status": 200, "statusText": "OK", "duration": 45}' \
  -s | jq '.'

# Test 3: Enregistrer une requête POST
echo ""
echo "📡 Test 3: Enregistrement d'une requête POST..."
curl -X POST "$REQUEST_ENDPOINT" \
  -H "Content-Type: application/json" \
  -d '{"method": "POST", "path": "/api/auth/login", "status": 200, "statusText": "OK", "duration": 123}' \
  -s | jq '.'

# Test 4: Enregistrer une erreur 404
echo ""
echo "📡 Test 4: Enregistrement d'une requête 404..."
curl -X POST "$REQUEST_ENDPOINT" \
  -H "Content-Type: application/json" \
  -d '{"method": "GET", "path": "/api/notfound", "status": 404, "statusText": "Not Found", "duration": 12}' \
  -s | jq '.'

# Test 5: Enregistrer plusieurs messages
echo ""
echo "💬 Test 5: Enregistrement de plusieurs messages..."
for i in {1..5}; do
  USER="User$i"
  MSG="Ceci est le message numéro $i"
  curl -X POST "$CHAT_ENDPOINT" \
    -H "Content-Type: application/json" \
    -d "{\"user\": \"$USER\", \"message\": \"$MSG\"}" \
    -s > /dev/null
  echo "  ✓ Message $i envoyé"
  sleep 0.2
done

# Test 6: Récupérer les logs de chat
echo ""
echo "📖 Test 6: Récupération des logs de chat..."
curl -X GET "$BASE_URL/api/monitoring/chat-logs?limit=10" -s | jq '.'

# Test 7: Récupérer les logs de requêtes
echo ""
echo "📖 Test 7: Récupération des logs de requêtes..."
curl -X GET "$BASE_URL/api/monitoring/request-logs?limit=10" -s | jq '.'

# Test 8: Vérifier les stats
echo ""
echo "📊 Test 8: Vérification des stats..."
curl -X GET "$BASE_URL/api/monitoring/internal/stats" -s | jq '.stats | {uptime, cpuUsage, memoryUsage, nodeVersion}'

echo ""
echo "✅ Tests terminés!"
