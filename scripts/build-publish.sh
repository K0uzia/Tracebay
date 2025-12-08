#!/bin/bash
# build-publish.sh - Build et préparation pour publication GitHub

set -e

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}📦 Build & Préparation Publication${NC}"
echo ""

# Charger les variables d'environnement depuis .env si elle existe
if [ -f .env ]; then
  echo -e "${YELLOW}📂 Chargement du fichier .env...${NC}"
  set -a
  source .env
  set +a
  echo -e "${GREEN}✅ Variables chargées${NC}"
fi

echo ""

# Vérifier que le token GitHub est défini
if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo -e "${RED}❌ Erreur: GITHUB_TOKEN non défini${NC}"
  echo ""
  echo "Solutions:"
  echo ""
  echo "1️⃣  Crée un fichier .env à la racine:"
  echo "   ${GREEN}make setup-env${NC}"
  echo ""
  echo "2️⃣  Ou définis la variable d'environnement:"
  echo "   ${GREEN}export GITHUB_TOKEN='ghp_xxxxxxxxxxxxxxxxxxxxx'${NC}"
  echo ""
  echo "3️⃣  Génère un token GitHub:"
  echo "   ${GREEN}https://github.com/settings/tokens${NC}"
  echo ""
  exit 1
fi

# Exporter comme GH_TOKEN pour electron-builder
export GH_TOKEN="${GITHUB_TOKEN}"

echo -e "${GREEN}✅ Token GitHub trouvé${NC}"
echo ""

# Vérifier que les dépendances sont installées
if [ ! -d "node_modules" ]; then
  echo -e "${YELLOW}📥 Installation des dépendances...${NC}"
  npm install
  echo ""
fi

# Déterminer le type de build
PUBLISH="${1:-}"

if [ "$PUBLISH" = "--publish" ]; then
  echo -e "${YELLOW}🔨 Build & Publication sur GitHub Releases...${NC}"
  npm run build:publish
  echo ""
  echo -e "${GREEN}✅ Publication terminée avec succès!${NC}"
  echo ""
  echo "Vérifiez votre release:"
  echo "  ${BLUE}https://github.com/SandersonnDev/workspace/releases${NC}"
else
  # Build simple
  echo -e "${YELLOW}🔨 Build de l'application...${NC}"
  npm run build

  if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Erreur lors du build${NC}"
    exit 1
  fi

  echo ""
  echo -e "${GREEN}✅ Build réussi${NC}"
  echo ""

  # Afficher le chemin des artifacts
  echo -e "${YELLOW}📦 Artifacts générés:${NC}"
  echo ""
  if [ -d "dist" ]; then
    ls -lh dist/ | grep -E "Workspace|\.AppImage|\.exe|\.dmg" || true
  fi
  if [ -d "out" ]; then
    ls -lh out/ | grep -E "Workspace|\.AppImage|\.exe|\.dmg" || true
  fi

  echo ""
  echo -e "${GREEN}✨ Build prêt pour publication!${NC}"
  echo ""
  echo "Prochaines étapes:"
  echo "  1️⃣  ${GREEN}make publish-github${NC}  # Publier sur GitHub Releases"
  echo "  2️⃣  Va sur: ${BLUE}https://github.com/SandersonnDev/workspace/releases${NC}"
  echo "  3️⃣  Vérifiez que les artifacts sont présents"
fi
