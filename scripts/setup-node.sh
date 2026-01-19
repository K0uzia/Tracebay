#!/bin/bash

################################################################################
# 🔧 WORKSPACE NODE.JS SETUP SCRIPT
# 
# Purpose: Install correct Node.js version using NVM
# Usage: ./scripts/setup-node.sh
# 
# Aligned with: PLAN_REFACTORISATION_ET_ARCHI.md - Phase 1.1
################################################################################

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Node version from .nvmrc
REQUIRED_NODE_VERSION=$(cat .nvmrc 2>/dev/null || echo "20.11.1")

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}🚀 Workspace Node.js Setup${NC}"
echo -e "${BLUE}================================${NC}"
echo ""

################################################################################
# 1. Check if NVM is installed
################################################################################
echo -e "${YELLOW}[1/5]${NC} Checking NVM installation..."

if ! command -v nvm &> /dev/null; then
    echo -e "${YELLOW}⚠️  NVM not found. Installing...${NC}"
    
    # Install NVM
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    
    # Load NVM
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    
    echo -e "${GREEN}✅ NVM installed successfully${NC}"
else
    echo -e "${GREEN}✅ NVM already installed${NC}"
    
    # Load NVM if not loaded
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
fi

echo ""

################################################################################
# 2. Install correct Node.js version
################################################################################
echo -e "${YELLOW}[2/5]${NC} Installing Node.js ${REQUIRED_NODE_VERSION}..."

# Install Node from .nvmrc
nvm install

# Use installed version
nvm use

# Set as default
nvm alias default node

CURRENT_NODE_VERSION=$(node -v)
echo -e "${GREEN}✅ Node.js ${CURRENT_NODE_VERSION} installed and active${NC}"

echo ""

################################################################################
# 3. Verify npm version
################################################################################
echo -e "${YELLOW}[3/5]${NC} Checking npm version..."

CURRENT_NPM_VERSION=$(npm -v)
echo -e "${GREEN}✅ npm ${CURRENT_NPM_VERSION} ready${NC}"

echo ""

################################################################################
# 4. Clean old node_modules
################################################################################
echo -e "${YELLOW}[4/5]${NC} Cleaning old dependencies..."

if [ -d "node_modules" ]; then
    echo -e "${YELLOW}   Removing root node_modules...${NC}"
    rm -rf node_modules package-lock.json
fi

if [ -d "apps/server/node_modules" ]; then
    echo -e "${YELLOW}   Removing apps/server/node_modules...${NC}"
    rm -rf apps/server/node_modules apps/server/package-lock.json
fi

if [ -d "apps/client/node_modules" ]; then
    echo -e "${YELLOW}   Removing apps/client/node_modules...${NC}"
    rm -rf apps/client/node_modules apps/client/package-lock.json
fi

if [ -d "apps/proxmox/node_modules" ]; then
    echo -e "${YELLOW}   Removing apps/proxmox/node_modules...${NC}"
    rm -rf apps/proxmox/node_modules apps/proxmox/package-lock.json
fi

echo -e "${GREEN}✅ Old dependencies cleaned${NC}"

echo ""

################################################################################
# 5. Install fresh dependencies
################################################################################
echo -e "${YELLOW}[5/5]${NC} Installing dependencies..."

npm install

echo ""
echo -e "${GREEN}✅ All dependencies installed${NC}"

echo ""
echo -e "${BLUE}================================${NC}"
echo -e "${GREEN}🎉 Setup complete!${NC}"
echo -e "${BLUE}================================${NC}"
echo ""
echo -e "Next steps:"
echo -e "  ${GREEN}1.${NC} Run health check:  ${BLUE}npm run health-check${NC}"
echo -e "  ${GREEN}2.${NC} Run audit:         ${BLUE}npm run audit:smart${NC}"
echo -e "  ${GREEN}3.${NC} Start development: ${BLUE}npm run dev${NC}"
echo ""
