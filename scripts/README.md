# 📜 Scripts Directory

Automation scripts for Workspace project setup, verification, and maintenance.

## 📋 Overview

| Script | Purpose | When to Use |
|--------|---------|-------------|
| `setup-node.sh` | Install Node.js 20+ via NVM | First-time setup, Node version issues |
| `health-check.sh` | Verify system requirements | Before starting work, after npm install |
| `smart-audit-fix.sh` | Fix npm vulnerabilities | When audit shows vulnerabilities |

---

## 🔧 Setup Scripts

### `setup-node.sh`

**Purpose:** Automated Node.js 20+ installation using NVM.

**What it does:**
1. ✅ Checks if NVM is installed (installs if missing)
2. ✅ Reads `.nvmrc` to determine required Node version
3. ✅ Installs correct Node.js version
4. ✅ Sets Node as default
5. ✅ Cleans old `node_modules`
6. ✅ Installs fresh dependencies

**Usage:**
```bash
# Direct execution
./scripts/setup-node.sh

# Via Makefile (recommended)
make setup

# Via npm
npm run setup
```

**Requirements:**
- `curl` (for NVM installation)
- Internet connection
- Bash shell

**Output:**
```
================================
🚀 Workspace Node.js Setup
================================

[1/5] Checking NVM installation...
✅ NVM already installed

[2/5] Installing Node.js 20.11.1...
✅ Node.js v20.20.0 installed and active

[3/5] Checking npm version...
✅ npm 10.8.2 ready

[4/5] Cleaning old dependencies...
✅ Old dependencies cleaned

[5/5] Installing dependencies...
✅ All dependencies installed

================================
🎉 Setup complete!
================================
```

---

## 🩺 Health Check Scripts

### `health-check.sh`

**Purpose:** Comprehensive system verification before development.

**What it checks:**
1. ✅ Node.js version (>= 20)
2. ✅ npm version (>= 10)
3. ✅ Dependencies installed (root, server, client)
4. ✅ TypeScript compiler available
5. ✅ Project structure exists
6. ✅ Forbidden packages (puppeteer, express, better-sqlite3)
7. ✅ Security vulnerabilities

**Usage:**
```bash
# Direct execution
./scripts/health-check.sh

# Via Makefile (recommended)
make health

# Via npm
npm run health-check
```

**Exit Codes:**
- `0` = All checks passed
- `1` = Critical errors found

**Thresholds:**
- Critical vulnerabilities: **0 allowed**
- High vulnerabilities: **< 10 allowed**

**Output Example:**
```
================================
🩺 Workspace Health Check
================================

[1/7] Checking Node.js version...
✅ Node.js v20.20.0 (OK)

[2/7] Checking npm version...
✅ npm v10.8.2 (OK)

[3/7] Checking dependencies...
✅ Root dependencies installed
✅ Server dependencies installed
✅ Client dependencies installed

[4/7] Checking TypeScript...
✅ TypeScript 5.3.3 available

[5/7] Checking project structure...
✅ apps/server/
✅ apps/client/
✅ apps/proxmox/
⚠️  docker/ missing (will be created in Phase 1)

[6/7] Checking for forbidden packages...
✅ No forbidden packages found

[7/7] Checking security vulnerabilities...
⚠️  Vulnerabilities found: 41 (28 high, 1 moderate, 12 low)
   Consider running: npm run audit:smart

================================
📊 Health Check Summary
================================

⚠️  1 warnings found
   Review warnings above
```

---

## 🔒 Security Scripts

### `smart-audit-fix.sh`

**Purpose:** Intelligent vulnerability fixing with safety checks.

**Strategy:**
1. **Initial Audit** - Count vulnerabilities by severity
2. **Safe Fix** - Run `npm audit fix` (no breaking changes)
3. **Progress Check** - Verify improvements
4. **Aggressive Fix** - If critical/high remain, try `npm audit fix --force`
5. **Integrity Check** - Verify project still works

**Thresholds:**
- Critical vulnerabilities: **≥ 1** → Aggressive fix
- High vulnerabilities: **≥ 15** → Aggressive fix

**Usage:**
```bash
# Direct execution
./scripts/smart-audit-fix.sh

# Via Makefile (recommended)
make audit

# Via npm
npm run audit:smart
```

**Safety Features:**
- ✅ Backs up `package-lock.json` before aggressive fix
- ✅ Restores backup if aggressive fix doesn't help
- ✅ Verifies TypeScript compilation after fix
- ✅ Checks `node_modules` integrity

**Output Example:**
```
================================
🔒 Smart Audit Fix
================================

[1/5] Running initial audit...

Vulnerabilities before fix:
  Critical: 0
  High:     28
  Moderate: 1
  Low:      12
  Total: 41

[2/5] Attempting safe fixes (no breaking changes)...
... (npm audit fix output)

[3/5] Checking progress after safe fix...

Vulnerabilities after safe fix:
  Critical: 0
  High:     15
  Moderate: 1
  Low:      10
  Total: 26

Fixed: 15 vulnerabilities

[4/5] Skipping aggressive fix (below thresholds)

[5/5] Verifying project integrity...
   ✅ TypeScript compiles
✅ Project integrity verified

================================
📊 Audit Fix Summary
================================

Before:  41 vulnerabilities
After:   26 vulnerabilities
Fixed:   15 vulnerabilities

✅ Audit fix successful!
   Critical: 0, High: 15
```

**Exit Codes:**
- `0` = Success (Critical: 0, High < 10)
- `1` = Critical vulnerabilities remain

---

## 🚀 Quick Reference

### First-Time Setup
```bash
# Complete setup (one command)
make setup && make health
```

### Daily Development
```bash
# Before starting work
make health

# If vulnerabilities found
make audit

# Start development
make dev
```

### Troubleshooting

**Problem:** `npm install` fails
```bash
# Solution: Reset and reinstall
make clean
make setup
```

**Problem:** Node version wrong
```bash
# Solution: Re-run setup
make setup
# Or manually with NVM
nvm install
nvm use
```

**Problem:** Too many vulnerabilities
```bash
# Solution: Smart fix
make audit

# If still issues after fix:
npm audit  # Review manually
```

**Problem:** TypeScript errors after npm update
```bash
# Solution: Check compilation
make type-check

# If breaking changes:
git restore package-lock.json
npm install
```

---

## 📚 Related Documentation

- [PLAN_REFACTORISATION_ET_ARCHI.md](../PLAN_REFACTORISATION_ET_ARCHI.md) - Refactoring roadmap
- [Jarvis/Instructions.mdc](../Jarvis/Instructions.mdc) - Development guidelines
- [Makefile](../Makefile) - All available commands
- [package.json](../package.json) - npm scripts

---

## 🔄 Script Lifecycle

```
┌─────────────┐
│  New Setup  │
└──────┬──────┘
       │
       v
┌─────────────────┐
│  setup-node.sh  │  ← Install Node 20+
└──────┬──────────┘
       │
       v
┌──────────────────┐
│ health-check.sh  │  ← Verify system
└──────┬───────────┘
       │
       ├─ OK ──────────────────► [Start Development]
       │
       ├─ Vulnerabilities ──┐
       │                    │
       v                    v
┌──────────────────────┐   ┌──────────────────┐
│ smart-audit-fix.sh   │   │ Manual Review    │
└──────┬───────────────┘   └──────────────────┘
       │
       └────► health-check.sh ────► [Start Development]
```

---

## ⚙️ Environment Variables

Scripts respect these environment variables:

| Variable | Default | Purpose |
|----------|---------|---------|
| `NODE_ENV` | `development` | Environment mode |
| `NVM_DIR` | `~/.nvm` | NVM installation directory |
| `SKIP_HEALTH_CHECK` | `false` | Skip health checks (CI/CD) |

**Example:**
```bash
# Skip health check in CI
SKIP_HEALTH_CHECK=true npm run dev
```

---

## 🐛 Debug Mode

Enable debug output for troubleshooting:

```bash
# Enable bash debug
bash -x scripts/setup-node.sh

# Or set in script
set -x  # Enable debug
set +x  # Disable debug
```

---

**Maintained by:** Workspace Team  
**Last Updated:** 19 janvier 2026  
**Aligned with:** Phase 1 - PLAN_REFACTORISATION_ET_ARCHI.md
