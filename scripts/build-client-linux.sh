#!/usr/bin/env bash

################################################################################
# Build Client Linux Script
# Purpose: Install dependencies and build Electron client for Linux
# Usage: bash scripts/build-client-linux.sh [--skip-install]
################################################################################

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${CYAN}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_step() {
    echo ""
    echo -e "${CYAN}════════════════════════════════════════${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${CYAN}════════════════════════════════════════${NC}"
}

# Parse arguments
SKIP_INSTALL=false
while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-install)
            SKIP_INSTALL=true
            shift
            ;;
        *)
            shift
            ;;
    esac
done

# Navigate to client directory
cd "$(dirname "$0")/../apps/client" || exit 1

log_step "🐧 Building Workspace Client for Linux"

################################################################################
# STEP 1: Verify Node.js
################################################################################
log_step "Step 1/4: Verifying Node.js"

NODE_VERSION=$(node -v 2>/dev/null || echo "not found")
if [ "$NODE_VERSION" = "not found" ]; then
    log_error "Node.js not found. Please install Node.js 20+ first"
    exit 1
fi

MAJOR=$(echo $NODE_VERSION | cut -d. -f1 | sed 's/v//')
if [ "$MAJOR" -lt 20 ]; then
    log_error "Node.js v$MAJOR is too old (need v20+)"
    exit 1
fi

log_success "Node.js ${NODE_VERSION}"
log_success "npm $(npm -v)"

################################################################################
# STEP 2: Install Dependencies
################################################################################
if [ "$SKIP_INSTALL" = "false" ]; then
    log_step "Step 2/4: Installing Dependencies"
    
    log_info "Installing client dependencies..."
    if npm install --prefer-offline 2>&1 | grep -E "added|up to date"; then
        log_success "Dependencies installed"
    else
        log_error "Failed to install dependencies"
        exit 1
    fi
else
    log_step "Step 2/4: Skipping Installation (--skip-install)"
    log_info "Dependencies installation skipped"
fi

################################################################################
# STEP 3: Verify Required Files
################################################################################
log_step "Step 3/4: Verifying Project Structure"

REQUIRED_FILES=(
    "main.js"
    "preload.js"
    "index.html"
    "package.json"
    "forge.config.js"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        log_success "Found: $file"
    else
        log_error "Missing: $file"
        exit 1
    fi
done

################################################################################
# STEP 4: Build for Linux
################################################################################
log_step "Step 4/4: Building Electron App for Linux"

log_info "Building with electron-builder..."
log_warning "This may take several minutes..."

# Build for Linux with live output (no piping to preserve colors and progress)
echo ""
npm run build:linux
BUILD_EXIT_CODE=$?

echo ""
if [ $BUILD_EXIT_CODE -eq 0 ]; then
    log_success "Build completed successfully!"
else
    log_error "Build failed with exit code $BUILD_EXIT_CODE"
    exit 1
fi

################################################################################
# STEP 5: Summary
################################################################################
log_step "🎉 Build Summary"

echo ""
echo -e "${GREEN}Build completed successfully!${NC}"
echo ""

# Find and display built packages
if [ -d "dist" ]; then
    log_info "Built packages in dist/:"
    find dist -type f \( -name "*.deb" -o -name "*.AppImage" -o -name "*.snap" \) -exec ls -lh {} \; 2>/dev/null || log_warning "No package files found yet"
fi

echo ""
echo -e "${CYAN}Next Steps:${NC}"
echo -e "  ${GREEN}cd apps/client/dist${NC}     - View built files"
echo -e "  ${GREEN}sudo dpkg -i *.deb${NC}      - Install .deb package"
echo -e "  ${GREEN}make dev-client${NC}         - Test in development mode"

echo ""
log_success "Done!"
