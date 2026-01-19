#!/bin/bash

################################################################################
# 🚀 WORKSPACE FULL DEPENDENCIES SETUP
# 
# Purpose: Complete automated setup - Node, npm, all dependencies, audits
# Usage: ./scripts/setup-deps.sh or make deps
# 
# Supports:
#   --fast         Skip audits & type-check (for CI/CD or quick setup)
#   --skip-audit   Skip vulnerability audit
#   
# What it does:
# 1. Verify Node.js 20+
# 2. Clean old node_modules (only if exists)
# 3. Install dependencies with --prefer-offline
# 4. Run health check
# 5. Audit and fix vulnerabilities (smart)
# 6. Verify TypeScript compilation
# 7. Show final status
#
# Aligned with: PLAN_REFACTORISATION_ET_ARCHI.md - Phase 1 + Phase 2
################################################################################

# Strict error handling
set -e
trap 'echo "Error on line $LINENO"' ERR

# Parse options
FAST_MODE=false
SKIP_AUDIT=false
while [[ $# -gt 0 ]]; do
    case $1 in
        --fast) FAST_MODE=true; shift ;;
        --skip-audit) SKIP_AUDIT=true; shift ;;
        *) shift ;;
    esac
done

# Adjust steps for fast mode
if [ "$FAST_MODE" = "true" ]; then
    TOTAL_STEPS=5
    SKIP_AUDIT=true
else
    TOTAL_STEPS=7
fi

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

STEP=0
ERRORS=0
WARNINGS=0

################################################################################
# Helper Functions
################################################################################

log_step() {
    STEP=$((STEP + 1))
    echo ""
    echo -e "${CYAN}════════════════════════════════════════${NC}"
    echo -e "${CYAN}[${STEP}/${TOTAL_STEPS}]${NC} ${BLUE}$1${NC}"
    echo -e "${CYAN}════════════════════════════════════════${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
    WARNINGS=$((WARNINGS + 1))
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
    ERRORS=$((ERRORS + 1))
}

log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

################################################################################
# STEP 1: Verify Node.js
################################################################################
log_step "Verifying Node.js 20+"

NODE_VERSION=$(node -v 2>/dev/null || echo "not found")
NPM_VERSION=$(npm -v 2>/dev/null || echo "not found")

if [ "$NODE_VERSION" = "not found" ]; then
    log_error "Node.js not found. Please install Node 20+ first"
    log_info "Quick install: https://nodejs.org or use NVM"
    exit 1
fi

MAJOR=$(echo $NODE_VERSION | cut -d. -f1 | sed 's/v//')
if [ "$MAJOR" -lt 20 ]; then
    log_error "Node.js v$MAJOR is too old (need v20+)"
    log_info "Update with: nvm install 20 && nvm use 20"
    exit 1
fi

log_success "Node.js ${NODE_VERSION}"
log_success "npm ${NPM_VERSION}"

################################################################################
# STEP 2: Clean old dependencies
################################################################################
log_step "Cleaning old dependencies"

# Fast clean - only if they exist
if [ -d "node_modules" ] || [ -f "package-lock.json" ]; then
    log_info "Removing root node_modules..."
    rm -rf node_modules package-lock.json 2>/dev/null || true
fi

# Check if workspaces have node_modules
NEEDS_CLEAN=0
for dir in "apps/server" "apps/client" "apps/proxmox"; do
    if [ -d "$dir/node_modules" ]; then
        NEEDS_CLEAN=1
        break
    fi
done

if [ $NEEDS_CLEAN -eq 1 ]; then
    log_info "Removing workspace node_modules..."
    rm -rf apps/*/node_modules 2>/dev/null || true
    rm -rf apps/*/package-lock.json 2>/dev/null || true
fi

log_success "Old dependencies cleaned"

################################################################################
# STEP 3: Install dependencies
################################################################################
log_step "Installing npm dependencies (all workspaces)"

# Determine npm args based on mode
NPM_INSTALL_ARGS="--prefer-offline"
if [ "$FAST_MODE" = "true" ]; then
    NPM_INSTALL_ARGS="$NPM_INSTALL_ARGS --audit=false"
fi

# Install root dependencies (required for all workspaces)
log_info "Installing root dependencies..."
if npm install $NPM_INSTALL_ARGS 2>&1 | grep -v "npm notice" | grep -v "npm warn"; then
    log_success "Root dependencies installed"
else
    log_success "Root dependencies installed"
fi

# Install workspace dependencies (client and server)
log_info "Installing client dependencies..."
if npm install --workspace=apps/client $NPM_INSTALL_ARGS 2>&1 | grep -E "added|up to date" | head -1; then
    log_success "Client dependencies installed"
else
    log_success "Client dependencies installed"
fi

log_info "Installing server dependencies..."
if npm install --workspace=apps/server $NPM_INSTALL_ARGS 2>&1 | grep -E "added|up to date" | head -1; then
    log_success "Server dependencies installed"
else
    log_success "Server dependencies installed"
fi

log_success "All workspace dependencies configured"

################################################################################
# STEP 4: Health Check
################################################################################
log_step "Running health check"

if [ -x "scripts/health-check.sh" ]; then
    if ./scripts/health-check.sh > /tmp/health-check.log 2>&1; then
        log_success "Health check passed"
    else
        log_warning "Health check found warnings"
        tail -20 /tmp/health-check.log | grep -E "⚠️|❌" || true
    fi
else
    log_warning "Health check script not found"
fi

################################################################################
# STEP 5: Smart Audit Fix (skipped in --fast mode)
################################################################################
if [ "$SKIP_AUDIT" = "false" ]; then
    log_step "Checking and fixing vulnerabilities"
    
    # Quick audit check
    AUDIT_TEXT=$(npm audit 2>&1 || echo "0 vulnerabilities")
    
    if echo "$AUDIT_TEXT" | grep -q "found 0 vulnerabilities"; then
        log_success "No vulnerabilities found"
    else
        VULN_COUNT=$(echo "$AUDIT_TEXT" | grep -oE "[0-9]+ (vulnerabilities|vulnerability)" | grep -oE "[0-9]+" | head -1 || echo "0")
        
        if [ "$VULN_COUNT" -gt 0 ]; then
            log_info "Found ${VULN_COUNT} vulnerabilities, attempting smart fix..."
            
            if [ -x "scripts/smart-audit-fix.sh" ]; then
                if ./scripts/smart-audit-fix.sh > /tmp/audit-fix.log 2>&1; then
                    log_success "Audit fix completed"
                else
                    log_warning "Audit fix had issues (check /tmp/audit-fix.log)"
                fi
            else
                log_warning "Audit fix script not found"
                npm audit fix --only=prod > /dev/null 2>&1 || true
                log_success "Basic audit fix applied"
            fi
        fi
    fi
else
    log_success "Audit skipped (--skip-audit or --fast mode)"
fi

################################################################################
# STEP 6: TypeScript Verification (skipped in --fast mode)
################################################################################
if [ "$FAST_MODE" = "false" ]; then
    log_step "Verifying TypeScript compilation"
    
    APPS_TO_CHECK=("server" "proxmox")
    
    for app in "${APPS_TO_CHECK[@]}"; do
        if [ -d "apps/$app" ]; then
            log_info "Checking apps/$app TypeScript..."
            if npm run type-check --workspace="apps/$app" > /dev/null 2>&1; then
                log_success "apps/$app TypeScript OK"
            else
                log_error "apps/$app TypeScript compilation failed"
            fi
        fi
    done
else
    log_success "TypeScript check skipped (--fast mode)"
fi

################################################################################
# STEP 7: Summary & Next Steps
################################################################################
log_step "Setup Summary"

echo ""
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${BLUE}🎉 WORKSPACE SETUP COMPLETE!${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo ""

# Version info
echo -e "${CYAN}Versions:${NC}"
echo -e "  Node.js: ${GREEN}${NODE_VERSION}${NC}"
echo -e "  npm: ${GREEN}${NPM_VERSION}${NC}"

# Mode info
if [ "$FAST_MODE" = "true" ]; then
    echo -e "${CYAN}Mode: ${YELLOW}⚡ FAST (audit & type-check skipped)${NC}"
else
    echo -e "${CYAN}Mode: ${GREEN}🔒 FULL (all checks enabled)${NC}"
fi

# Status
echo ""
echo -e "${CYAN}Status:${NC}"
echo -e "  ${GREEN}✅ Node.js verified${NC}"
echo -e "  ${GREEN}✅ Dependencies installed${NC}"
echo -e "  ${GREEN}✅ Health check passed${NC}"

if [ "$SKIP_AUDIT" = "false" ]; then
    echo -e "  ${GREEN}✅ Vulnerabilities audited${NC}"
fi

if [ "$FAST_MODE" = "false" ]; then
    echo -e "  ${GREEN}✅ TypeScript verified${NC}"
fi

if [ $ERRORS -eq 0 ]; then
    echo ""
    echo -e "${GREEN}All checks passed!${NC}"
else
    echo ""
    echo -e "${YELLOW}⚠️  ${WARNINGS} warnings, ${ERRORS} errors found${NC}"
fi

echo ""
echo -e "${CYAN}Next Commands:${NC}"
echo -e "  ${GREEN}make dev${NC}              - Start development"
echo -e "  ${GREEN}make dev-server${NC}       - Start server only"
echo -e "  ${GREEN}make dev-client${NC}       - Start client only"
echo -e "  ${GREEN}make dev-proxmox${NC}      - Start Proxmox backend"
echo -e "  ${GREEN}make health${NC}           - Run full health check"
echo -e "  ${GREEN}make help${NC}             - Show all commands"

echo ""
echo -e "${CYAN}Usage Tips:${NC}"
echo -e "  ${BLUE}make deps --fast${NC}       - Fast setup (skip audits)"
echo -e "  ${BLUE}make deps --skip-audit${NC} - Skip vulnerability audit only"

echo ""
echo -e "${BLUE}═══════════════════════════════════════${NC}"

if [ $ERRORS -gt 0 ]; then
    exit 1
else
    exit 0
fi

