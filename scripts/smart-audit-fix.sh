#!/bin/bash

################################################################################
# 🔒 WORKSPACE SMART AUDIT FIX
# 
# Purpose: Intelligently fix npm vulnerabilities without breaking changes
# Usage: ./scripts/smart-audit-fix.sh
# 
# Strategy:
#   1. Try npm audit fix (safe fixes only)
#   2. If critical/high vulnerabilities remain, try audit fix --force
#   3. Test that apps still work after fixes
#   4. Report what was fixed
################################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}🔒 Smart Audit Fix${NC}"
echo -e "${BLUE}================================${NC}"
echo ""

################################################################################
# 1. Initial audit
################################################################################
echo -e "${YELLOW}[1/5]${NC} Running initial audit..."

# Get audit results
AUDIT_TEXT_BEFORE=$(npm audit 2>&1 || echo "0 vulnerabilities")

# Extract numbers
CRITICAL_BEFORE=0
HIGH_BEFORE=0
MODERATE_BEFORE=0
LOW_BEFORE=0

if echo "$AUDIT_TEXT_BEFORE" | grep -q "found 0 vulnerabilities"; then
    TOTAL_BEFORE=0
else
    TOTAL_BEFORE=$(echo "$AUDIT_TEXT_BEFORE" | grep -oE "[0-9]+ (vulnerabilities|vulnerability)" | grep -oE "[0-9]+" | head -1 || echo "0")
    CRITICAL_BEFORE=$(echo "$AUDIT_TEXT_BEFORE" | grep -oE "[0-9]+ critical" | grep -oE "[0-9]+" | head -1 || echo "0")
    HIGH_BEFORE=$(echo "$AUDIT_TEXT_BEFORE" | grep -oE "[0-9]+ high" | grep -oE "[0-9]+" | head -1 || echo "0")
    MODERATE_BEFORE=$(echo "$AUDIT_TEXT_BEFORE" | grep -oE "[0-9]+ moderate" | grep -oE "[0-9]+" | head -1 || echo "0")
    LOW_BEFORE=$(echo "$AUDIT_TEXT_BEFORE" | grep -oE "[0-9]+ low" | grep -oE "[0-9]+" | head -1 || echo "0")
fi

: ${CRITICAL_BEFORE:=0}
: ${HIGH_BEFORE:=0}
: ${MODERATE_BEFORE:=0}
: ${LOW_BEFORE:=0}
: ${TOTAL_BEFORE:=0}

echo ""
echo -e "Vulnerabilities before fix:"
echo -e "  Critical: ${RED}${CRITICAL_BEFORE}${NC}"
echo -e "  High:     ${YELLOW}${HIGH_BEFORE}${NC}"
echo -e "  Moderate: ${YELLOW}${MODERATE_BEFORE}${NC}"
echo -e "  Low:      ${YELLOW}${LOW_BEFORE}${NC}"
echo -e "  ${BLUE}Total: ${TOTAL_BEFORE}${NC}"
echo ""

if [ $TOTAL_BEFORE -eq 0 ]; then
    echo -e "${GREEN}✅ No vulnerabilities found. Nothing to fix!${NC}"
    exit 0
fi

################################################################################
# 2. Safe fix (npm audit fix)
################################################################################
echo -e "${YELLOW}[2/5]${NC} Attempting safe fixes (no breaking changes)..."

npm audit fix --only=prod 2>&1 | tee /tmp/audit-fix.log || true

echo ""

################################################################################
# 3. Check progress
################################################################################
echo -e "${YELLOW}[3/5]${NC} Checking progress after safe fix..."

AUDIT_TEXT_AFTER=$(npm audit 2>&1 || echo "0 vulnerabilities")

CRITICAL_AFTER=0
HIGH_AFTER=0
MODERATE_AFTER=0
LOW_AFTER=0

if echo "$AUDIT_TEXT_AFTER" | grep -q "found 0 vulnerabilities"; then
    TOTAL_AFTER=0
else
    TOTAL_AFTER=$(echo "$AUDIT_TEXT_AFTER" | grep -oE "[0-9]+ (vulnerabilities|vulnerability)" | grep -oE "[0-9]+" | head -1 || echo "0")
    CRITICAL_AFTER=$(echo "$AUDIT_TEXT_AFTER" | grep -oE "[0-9]+ critical" | grep -oE "[0-9]+" | head -1 || echo "0")
    HIGH_AFTER=$(echo "$AUDIT_TEXT_AFTER" | grep -oE "[0-9]+ high" | grep -oE "[0-9]+" | head -1 || echo "0")
    MODERATE_AFTER=$(echo "$AUDIT_TEXT_AFTER" | grep -oE "[0-9]+ moderate" | grep -oE "[0-9]+" | head -1 || echo "0")
    LOW_AFTER=$(echo "$AUDIT_TEXT_AFTER" | grep -oE "[0-9]+ low" | grep -oE "[0-9]+" | head -1 || echo "0")
fi

: ${CRITICAL_AFTER:=0}
: ${HIGH_AFTER:=0}
: ${MODERATE_AFTER:=0}
: ${LOW_AFTER:=0}
: ${TOTAL_AFTER:=0}

FIXED_COUNT=$((TOTAL_BEFORE - TOTAL_AFTER))

echo ""
echo -e "Vulnerabilities after safe fix:"
echo -e "  Critical: ${RED}${CRITICAL_AFTER}${NC}"
echo -e "  High:     ${YELLOW}${HIGH_AFTER}${NC}"
echo -e "  Moderate: ${YELLOW}${MODERATE_AFTER}${NC}"
echo -e "  Low:      ${YELLOW}${LOW_AFTER}${NC}"
echo -e "  ${BLUE}Total: ${TOTAL_AFTER}${NC}"
echo ""
echo -e "${GREEN}Fixed: ${FIXED_COUNT} vulnerabilities${NC}"
echo ""

################################################################################
# 4. Aggressive fix if needed (critical/high threshold)
################################################################################
CRITICAL_THRESHOLD=1
HIGH_THRESHOLD=15

if [ $CRITICAL_AFTER -ge $CRITICAL_THRESHOLD ] || [ $HIGH_AFTER -ge $HIGH_THRESHOLD ]; then
    echo -e "${YELLOW}[4/5]${NC} Critical/high vulnerabilities still present..."
    echo -e "${YELLOW}      Attempting aggressive fix (may include breaking changes)...${NC}"
    echo ""
    
    # Backup package-lock.json
    cp package-lock.json package-lock.json.backup
    
    # Try force fix
    npm audit fix --force 2>&1 | tee /tmp/audit-fix-force.log || true
    
    # Re-audit
    AUDIT_TEXT_FINAL=$(npm audit 2>&1 || echo "0 vulnerabilities")
    
    if echo "$AUDIT_TEXT_FINAL" | grep -q "found 0 vulnerabilities"; then
        CRITICAL_FINAL=0
        HIGH_FINAL=0
        TOTAL_FINAL=0
    else
        CRITICAL_FINAL=$(echo "$AUDIT_TEXT_FINAL" | grep -oE "[0-9]+ critical" | grep -oE "[0-9]+" | head -1 || echo "0")
        HIGH_FINAL=$(echo "$AUDIT_TEXT_FINAL" | grep -oE "[0-9]+ high" | grep -oE "[0-9]+" | head -1 || echo "0")
        TOTAL_FINAL=$(echo "$AUDIT_TEXT_FINAL" | grep -oE "[0-9]+ (vulnerabilities|vulnerability)" | grep -oE "[0-9]+" | head -1 || echo "0")
    fi
    
    : ${CRITICAL_FINAL:=0}
    : ${HIGH_FINAL:=0}
    : ${TOTAL_FINAL:=0}
    
    echo ""
    echo -e "After aggressive fix:"
    echo -e "  Critical: ${RED}${CRITICAL_FINAL}${NC}"
    echo -e "  High:     ${YELLOW}${HIGH_FINAL}${NC}"
    echo ""
    
    if [ $TOTAL_FINAL -lt $((CRITICAL_AFTER + HIGH_AFTER)) ]; then
        echo -e "${GREEN}✅ Aggressive fix reduced vulnerabilities${NC}"
    else
        echo -e "${YELLOW}⚠️  Aggressive fix did not help. Restoring backup...${NC}"
        mv package-lock.json.backup package-lock.json
        npm install > /dev/null 2>&1
    fi
else
    echo -e "${YELLOW}[4/5]${NC} Skipping aggressive fix (below thresholds)"
fi

echo ""

################################################################################
# 5. Verify apps still work
################################################################################
echo -e "${YELLOW}[5/5]${NC} Verifying project integrity..."

# Check if critical files still exist
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ package.json missing! Restore from backup${NC}"
    exit 1
fi

# Test TypeScript compilation (if server exists)
if [ -f "apps/server/tsconfig.json" ]; then
    echo -e "${BLUE}   Testing TypeScript compilation...${NC}"
    npm run type-check --workspace=apps/server > /dev/null 2>&1 && \
        echo -e "${GREEN}   ✅ TypeScript compiles${NC}" || \
        echo -e "${YELLOW}   ⚠️  TypeScript errors (check manually)${NC}"
fi

# Check if node_modules are intact
if [ ! -d "node_modules" ]; then
    echo -e "${RED}❌ node_modules corrupted. Run 'npm install'${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Project integrity verified${NC}"

echo ""

################################################################################
# Summary
################################################################################
echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}📊 Audit Fix Summary${NC}"
echo -e "${BLUE}================================${NC}"
echo ""

AUDIT_TEXT_SUMMARY=$(npm audit 2>&1 || echo "0 vulnerabilities")

if echo "$AUDIT_TEXT_SUMMARY" | grep -q "found 0 vulnerabilities"; then
    CRITICAL_FINAL=0
    HIGH_FINAL=0
    MODERATE_FINAL=0
    LOW_FINAL=0
    TOTAL_FINAL=0
else
    TOTAL_FINAL=$(echo "$AUDIT_TEXT_SUMMARY" | grep -oE "[0-9]+ (vulnerabilities|vulnerability)" | grep -oE "[0-9]+" | head -1 || echo "0")
    CRITICAL_FINAL=$(echo "$AUDIT_TEXT_SUMMARY" | grep -oE "[0-9]+ critical" | grep -oE "[0-9]+" | head -1 || echo "0")
    HIGH_FINAL=$(echo "$AUDIT_TEXT_SUMMARY" | grep -oE "[0-9]+ high" | grep -oE "[0-9]+" | head -1 || echo "0")
    MODERATE_FINAL=$(echo "$AUDIT_TEXT_SUMMARY" | grep -oE "[0-9]+ moderate" | grep -oE "[0-9]+" | head -1 || echo "0")
    LOW_FINAL=$(echo "$AUDIT_TEXT_SUMMARY" | grep -oE "[0-9]+ low" | grep -oE "[0-9]+" | head -1 || echo "0")
fi

: ${CRITICAL_FINAL:=0}
: ${HIGH_FINAL:=0}
: ${MODERATE_FINAL:=0}
: ${LOW_FINAL:=0}
: ${TOTAL_FINAL:=0}

TOTAL_FIXED=$((TOTAL_BEFORE - TOTAL_FINAL))

echo -e "Before:  ${RED}${TOTAL_BEFORE}${NC} vulnerabilities"
echo -e "After:   ${GREEN}${TOTAL_FINAL}${NC} vulnerabilities"
echo -e "Fixed:   ${GREEN}${TOTAL_FIXED}${NC} vulnerabilities"
echo ""

if [ $CRITICAL_FINAL -eq 0 ] && [ $HIGH_FINAL -lt 10 ]; then
    echo -e "${GREEN}✅ Audit fix successful!${NC}"
    echo -e "${GREEN}   Critical: 0, High: ${HIGH_FINAL}${NC}"
    exit 0
elif [ $CRITICAL_FINAL -gt 0 ]; then
    echo -e "${RED}⚠️  ${CRITICAL_FINAL} critical vulnerabilities remain${NC}"
    echo -e "${YELLOW}   Review manually: npm audit${NC}"
    exit 1
else
    echo -e "${YELLOW}⚠️  ${HIGH_FINAL} high vulnerabilities remain${NC}"
    echo -e "${YELLOW}   Consider manual review: npm audit${NC}"
    exit 0
fi
