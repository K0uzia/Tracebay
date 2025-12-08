#!/bin/bash
# setup-env.sh - Configuration sécurisée des variables d'environnement

set -euo pipefail

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}⚙️  Configuration du fichier .env${NC}"
echo ""

# Vérifier si .env existe déjà
if [ -f .env ]; then
  echo -e "${YELLOW}ℹ️  .env existe déjà${NC}"
  read -p "Veux-tu le remplacer? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Annulé"
    exit 0
  fi
fi

echo ""
echo -e "${BLUE}📖 Instructions pour générer un GitHub Token:${NC}"
echo ""
echo "1. Va sur: ${GREEN}https://github.com/settings/tokens${NC}"
echo "2. Clique sur ${GREEN}'Generate new token'${NC}"
echo "3. Sélectionne ${GREEN}'Generate new token (classic)'${NC}"
echo "4. Configure:"
echo "   - Nom: ${GREEN}workspace-build-token${NC}"
echo "   - Expiration: ${GREEN}90 jours (ou custom)${NC}"
echo "   - Permissions: Sélectionne ${GREEN}'repo'${NC} (full control)"
echo "5. Clique ${GREEN}'Generate token'${NC}"
echo "6. ${RED}⚠️  Copie immédiatement le token (tu ne pourras pas le revoir!)${NC}"
echo ""

# Demander le token
read -s -p "Colle ton GitHub Token: " GITHUB_TOKEN
echo ""

if [ -z "$GITHUB_TOKEN" ]; then
  echo -e "${RED}❌ Token vide${NC}"
  exit 1
fi

# Valider le format du token
if [[ ! $GITHUB_TOKEN =~ ^ghp_[A-Za-z0-9_]{36,}$ ]]; then
  echo -e "${YELLOW}⚠️  Le token ne semble pas avoir le bon format${NC}"
  echo "Format attendu: ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
  read -p "Continuer quand même? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Annulé"
    exit 1
  fi
fi

# Créer le fichier .env
cat > .env << ENV
# GitHub Token pour la publication des releases
# Généré le: $(date)
# ⚠️  NE PARTAGE JAMAIS CE FICHIER AVEC QUELQU'UN D'AUTRE
# ⚠️  NE COMMIT PAS CE FICHIER EN GIT

GITHUB_TOKEN=$GITHUB_TOKEN
ENV

# Sécuriser le fichier (lecture seule pour l'utilisateur)
chmod 600 .env

echo ""
echo -e "${GREEN}✅ .env créé avec succès${NC}"
echo ""
echo -e "${YELLOW}⚠️  IMPORTANT:${NC}"
echo "   • Ce fichier contient une clé secrète"
echo "   • Assure-toi qu'il est dans ${GREEN}.gitignore${NC}"
echo "   • Ne le partage JAMAIS avec quelqu'un"
echo "   • Si le token est exposé, revoque-le immédiatement"
echo ""
echo -e "${GREEN}✨ Prêt pour les builds!${NC}"
echo ""
echo "Commandes disponibles:"
echo "  ${GREEN}make publish${NC}        # Build & prépare publication"
echo "  ${GREEN}make publish-github${NC} # Publie sur GitHub Releases"
