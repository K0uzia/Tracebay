#!/bin/bash
# Script de migration idempotente pour déploiements existants Proxmox
# Ajoute les colonnes manquantes et relâche les contraintes NOT NULL

set -e

echo "🔄 Migration PostgreSQL pour Proxmox..."

docker exec -it workspace-db psql -U workspace -d workspace <<EOF

-- Ajouter les colonnes manquantes à lots si elles n'existent pas
ALTER TABLE IF EXISTS lots
  ADD COLUMN IF NOT EXISTS name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'received',
  ADD COLUMN IF NOT EXISTS item_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMP DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Relâcher la contrainte NOT NULL sur serial_number
ALTER TABLE IF EXISTS lot_items
  ALTER COLUMN serial_number DROP NOT NULL;

-- Créer les tables manquantes (marques, modeles) si nécessaire
CREATE TABLE IF NOT EXISTS marques (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS modeles (
  id SERIAL PRIMARY KEY,
  marque_id INTEGER NOT NULL REFERENCES marques(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

SELECT 'Migration terminée avec succès ✅' as status;

EOF

echo "✅ Migration PostgreSQL complétée"
echo ""
echo "Redémarrage du conteneur proxmox pour recharger le code..."
docker restart workspace-proxmox
sleep 5

echo ""
echo "🧪 Tests post-migration:"
curl -s http://localhost:4000/api/health | jq '.status'
curl -s http://localhost:4000/api/lots | jq '.success'
echo ""
echo "✅ Prêt pour fonctionner!"
