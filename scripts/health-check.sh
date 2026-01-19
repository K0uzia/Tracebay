#!/bin/bash

################################################################################
# 🩺 WORKSPACE HEALTH CHECK SCRIPT
# 
# Purpose: Verify all dependencies and system requirements
# Usage: ./scripts/health-check.sh
# 
# Aligned with: PLAN_REFACTORISATION_ET_ARCHI.md
################################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ERRORS=0
WARNINGS=0

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}🩺 Workspace Health Check${NC}"
echo -e "${BLUE}================================${NC}"
echo ""

################################################################################
# 1. Node.js version
################################################################################
echo -e "${YELLOW}[1/7]${NC} Checking Node.js version..."

REQUIRED_NODE_MAJOR=20
CURRENT_NODE_VERSION=$(node -v | sed 's/v//')
CURRENT_NODE_MAJOR=$(echo $CURRENT_NODE_VERSION | cut -d. -f1)

if [ "$CURRENT_NODE_MAJOR" -ge "$REQUIRED_NODE_MAJOR" ]; then
    echo -e "${GREEN}✅ Node.js v${CURRENT_NODE_VERSION} (OK)${NC}"
else
    echo -e "${RED}❌ Node.js v${CURRENT_NODE_VERSION} (Required: v${REQUIRED_NODE_MAJOR}+)${NC}"
    ERRORS=$((ERRORS + 1))
fi

echo ""

################################################################################
# 2. npm version
################################################################################
echo -e "${YELLOW}[2/7]${NC} Checking npm version..."

REQUIRED_NPM_MAJOR=10
CURRENT_NPM_VERSION=$(npm -v)
CURRENT_NPM_MAJOR=$(echo $CURRENT_NPM_VERSION | cut -d. -f1)

if [ "$CURRENT_NPM_MAJOR" -ge "$REQUIRED_NPM_MAJOR" ]; then
    echo -e "${GREEN}✅ npm v${CURRENT_NPM_VERSION} (OK)${NC}"
else
    echo -e "${RED}❌ npm v${CURRENT_NPM_VERSION} (Required: v${REQUIRED_NPM_MAJOR}+)${NC}"
    ERRORS=$((ERRORS + 1))
fi

echo ""

################################################################################
# 3. Dependencies installed
################################################################################
echo -e "${YELLOW}[3/7]${NC} Checking dependencies..."

if [ ! -d "node_modules" ]; then
    echo -e "${RED}❌ node_modules not found. Run 'npm install'${NC}"
    ERRORS=$((ERRORS + 1))
else
    echo -e "${GREEN}✅ Root dependencies installed${NC}"
fi

# With npm workspaces, apps use root node_modules (symlinked)
# Check if workspace packages are accessible via root
if [ -d "node_modules" ]; then
    if npm list --workspace=apps/server &>/dev/null; then
        echo -e "${GREEN}✅ Server workspace configured${NC}"
    else
        echo -e "${YELLOW}⚠️  apps/server workspace not configured${NC}"
        WARNINGS=$((WARNINGS + 1))
    fi
    
    if npm list --workspace=apps/client &>/dev/null; then
        echo -e "${GREEN}✅ Client workspace configured${NC}"
    else
        echo -e "${YELLOW}⚠️  apps/client workspace not configured${NC}"
        WARNINGS=$((WARNINGS + 1))
    fi
fi

echo ""

################################################################################
# 4. TypeScript compiler
################################################################################
echo -e "${YELLOW}[4/7]${NC} Checking TypeScript..."

if command -v tsc &> /dev/null; then
    TSC_VERSION=$(tsc --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
    echo -e "${GREEN}✅ TypeScript ${TSC_VERSION} available${NC}"
else
    echo -e "${YELLOW}⚠️  TypeScript not found globally (using local)${NC}"
    WARNINGS=$((WARNINGS + 1))
fi

echo ""

################################################################################
# 5. Project structure
################################################################################
echo -e "${YELLOW}[5/7]${NC} Checking project structure..."

REQUIRED_DIRS=(
    "apps/server"
    "apps/client"
    "apps/proxmox"
    "config"
    "shared"
    "docs"
    "docker"
)

for dir in "${REQUIRED_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        echo -e "${GREEN}✅ ${dir}/${NC}"
    else
        echo -e "${YELLOW}⚠️  ${dir}/ missing (will be created in Phase 1)${NC}"
        WARNINGS=$((WARNINGS + 1))
    fi
done

echo ""

################################################################################
# 6. Forbidden packages check
################################################################################
echo -e "${YELLOW}[6/7]${NC} Checking for forbidden packages..."

# Forbidden packages (puppeteer removed in Phase 1.2)
# Note: express will be removed in Phase 2 (Fastify migration)
FORBIDDEN_PACKAGES=("puppeteer" "better-sqlite3")
FOUND_FORBIDDEN=0

for pkg in "${FORBIDDEN_PACKAGES[@]}"; do
    if grep -q "\"$pkg\"" apps/*/package.json 2>/dev/null; then
        echo -e "${RED}❌ Found forbidden package: ${pkg}${NC}"
        FOUND_FORBIDDEN=1
        ERRORS=$((ERRORS + 1))
    fi
done

# Phase 2 completed: Fastify backend now active (apps/proxmox)
# Express still used in legacy server (apps/server) - migration in progress
if grep -q "\"express\"" apps/server/package.json 2>/dev/null; then
    # Express in legacy server is acceptable during migration
    : # No warning needed
fi

if [ $FOUND_FORBIDDEN -eq 0 ]; then
    echo -e "${GREEN}✅ No critical forbidden packages found${NC}"
fi

echo ""

################################################################################
# 7. Security vulnerabilities
################################################################################
echo -e "${YELLOW}[7/7]${NC} Checking security vulnerabilities..."

# Simple approach: count from npm audit output text
AUDIT_TEXT=$(npm audit 2>&1 || echo "0 vulnerabilities")

# Extract numbers (more robust)
CRITICAL=0
HIGH=0
MODERATE=0
LOW=0

if echo "$AUDIT_TEXT" | grep -q "found 0 vulnerabilities"; then
    TOTAL=0
else
    # Try to extract from summary line
    if echo "$AUDIT_TEXT" | grep -qE "[0-9]+ (vulnerabilities|vulnerability)"; then
        TOTAL=$(echo "$AUDIT_TEXT" | grep -oE "[0-9]+ (vulnerabilities|vulnerability)" | grep -oE "[0-9]+" | head -1)
        
        # Extract by severity
        CRITICAL=$(echo "$AUDIT_TEXT" | grep -oE "[0-9]+ critical" | grep -oE "[0-9]+" | head -1 || echo "0")
        HIGH=$(echo "$AUDIT_TEXT" | grep -oE "[0-9]+ high" | grep -oE "[0-9]+" | head -1 || echo "0")
        MODERATE=$(echo "$AUDIT_TEXT" | grep -oE "[0-9]+ moderate" | grep -oE "[0-9]+" | head -1 || echo "0")
        LOW=$(echo "$AUDIT_TEXT" | grep -oE "[0-9]+ low" | grep -oE "[0-9]+" | head -1 || echo "0")
    else
        TOTAL=0
    fi
fi

# Default to 0 if empty
: ${CRITICAL:=0}
: ${HIGH:=0}
: ${MODERATE:=0}
: ${LOW:=0}
: ${TOTAL:=0}

if [ $CRITICAL -gt 0 ]; then
    echo -e "${RED}❌ Critical vulnerabilities: ${CRITICAL}${NC}"
    ERRORS=$((ERRORS + 1))
elif [ $HIGH -gt 10 ]; then
    echo -e "${RED}❌ High vulnerabilities: ${HIGH} (threshold: 10)${NC}"
    ERRORS=$((ERRORS + 1))
elif [ $TOTAL -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Vulnerabilities found: ${TOTAL} (${HIGH} high, ${MODERATE} moderate, ${LOW} low)${NC}"
    echo -e "${YELLOW}   Consider running: npm run audit:smart${NC}"
    WARNINGS=$((WARNINGS + 1))
else
    echo -e "${GREEN}✅ No vulnerabilities found${NC}"
fi

echo ""

################################################################################
# Summary
################################################################################
echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}📊 Health Check Summary${NC}"
echo -e "${BLUE}================================${NC}"
echo ""

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✨ All checks passed! System healthy.${NC}"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠️  ${WARNINGS} warnings found${NC}"
    echo -e "${YELLOW}   Review warnings above${NC}"
    exit 0
else
    echo -e "${RED}❌ ${ERRORS} errors, ${WARNINGS} warnings${NC}"
    echo -e "${RED}   Fix errors before proceeding${NC}"
    exit 1
fi
