#!/bin/bash
# Script complet de rebuild et migration pour Proxmox CT
# À exécuter en root sur le CT

set -e

echo "🚀 Full Proxmox rebuild et migration..."

cd /workspace

# 1) Git pull latest
echo "📥 Récupération du dernier code (branche proxmox)..."
git checkout proxmox
git pull origin proxmox

# 2) Build
echo "🔨 Build TypeScript..."
npm ci --workspace=proxmox/app
npm run build --workspace=proxmox/app

# 3) Rebuild image Docker
echo "🐳 Rebuild image Docker..."
docker build --no-cache -f proxmox/docker/Dockerfile -t workspace-proxmox:latest .
docker tag workspace-proxmox:latest proxmox-proxmox:latest

# 4) Restart compose
echo "♻️  Redémarrage docker-compose..."
cd proxmox/docker
docker-compose down
docker-compose up -d --force-recreate

# 5) Wait for health
echo "⏳ Attente du démarrage..."
sleep 10

# 6) Migrations
echo "🔄 Migrations PostgreSQL..."
docker exec -it workspace-db psql -U workspace -d workspace <<'EOSQL'
ALTER TABLE IF EXISTS lots
  ADD COLUMN IF NOT EXISTS name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'received',
  ADD COLUMN IF NOT EXISTS item_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMP DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

ALTER TABLE IF EXISTS lot_items
  ALTER COLUMN serial_number DROP NOT NULL;

SELECT 'Migration ✅' as status;
EOSQL

# 7) Tests
echo ""
echo "🧪 Tests post-migration:"
curl -s http://localhost:4000/api/health | jq '.'
curl -s http://localhost:4000/api/lots | jq '.'

echo ""
echo "✅ Rebuild Proxmox terminé et migré!"
echo ""
echo "Prêt à utiliser sur le client (dev branch)"
