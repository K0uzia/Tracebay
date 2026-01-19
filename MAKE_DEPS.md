# 🚀 MAKE DEPS - One Command Setup

## What is `make deps`?

**Single command that automates EVERYTHING:**

```bash
make deps
```

This ONE command does all of this automatically:

1. ✅ **Verify Node.js 20+** installed
2. ✅ **Clean old node_modules** (all workspaces)
3. ✅ **Install dependencies** (root + server + client + proxmox)
4. ✅ **Run health check** (7 verification checks)
5. ✅ **Audit & fix vulnerabilities** (smart fix)
6. ✅ **Verify TypeScript** compilation
7. ✅ **Show final status** with next steps

## Why Use `make deps`?

- **Minimal effort** - One command = complete setup
- **Smart automation** - Fixes issues automatically
- **Safe** - Includes health checks and rollback
- **Transparent** - Shows exactly what it's doing
- **Phase aware** - Works with Phase 2 Proxmox backend

## Usage

### First Time Setup

```bash
cd workspace
make deps      # That's it! ☕

# When done:
make dev       # Start development
```

### After Git Pull

```bash
make deps      # Sync dependencies + audit
make dev       # Start with fresh setup
```

### If Something Breaks

```bash
make clean     # Remove all artifacts
make deps      # Fresh complete setup
```

## What Gets Installed

| Component | Version | Type |
|-----------|---------|------|
| Node.js | 20.x LTS | Runtime |
| npm | 10.x | Package manager |
| Root packages | Latest | Workspace |
| Server packages | Latest | Express + TypeScript |
| Client packages | Latest | Electron |
| Proxmox packages | Latest | Fastify + WebSocket |

## Thresholds & Safety

### Automatic Fixes Applied

- **Critical vulnerabilities:** Fix aggressively if found
- **High vulnerabilities:** Safe fix applied
- **Moderate/Low:** Reported only

### Verification Checks

- Node version >= 20.11.0 ✅
- npm version >= 10.0.0 ✅
- No critical forbidden packages ✅
- TypeScript compiles ✅
- Health check passes ✅

## Examples

### Complete Fresh Setup

```bash
# Clone repo
git clone https://github.com/SandersonnDev/workspace.git
cd workspace

# One command setup
make deps

# ✅ All done! Start coding:
make dev
```

### Update After Major Changes

```bash
# Pull latest code
git pull origin dev

# Re-setup everything
make deps

# Continue work
make dev
```

### Specific App Setup

After `make deps`, you can start individual apps:

```bash
make dev-server    # Start server only
make dev-client    # Start client only  
make dev-proxmox   # Start Proxmox backend
```

## Output Example

```
🚀 Complete dependency setup (one command)...

════════════════════════════════════════
[1/7] Verifying Node.js 20+
════════════════════════════════════════
✅ Node.js v20.20.0
✅ npm 10.8.2

════════════════════════════════════════
[2/7] Cleaning old dependencies
════════════════════════════════════════
ℹ️  Removing node_modules...
✅ Old dependencies cleaned

════════════════════════════════════════
[3/7] Installing npm dependencies (all workspaces)
════════════════════════════════════════
ℹ️  Root dependencies...
✅ Root installed
ℹ️  Server dependencies...
✅ Server installed
ℹ️  Client dependencies...
✅ Client installed
ℹ️  Proxmox backend dependencies...
✅ Proxmox installed

════════════════════════════════════════
[4/7] Running health check
════════════════════════════════════════
✅ Health check passed

════════════════════════════════════════
[5/7] Checking and fixing vulnerabilities
════════════════════════════════════════
✅ No vulnerabilities found

════════════════════════════════════════
[6/7] Verifying TypeScript compilation
════════════════════════════════════════
ℹ️  Checking apps/server TypeScript...
✅ apps/server TypeScript OK
ℹ️  Checking apps/proxmox TypeScript...
✅ apps/proxmox TypeScript OK

════════════════════════════════════════
[7/7] Setup Summary
════════════════════════════════════════

═══════════════════════════════════════
🎉 WORKSPACE SETUP COMPLETE!
═══════════════════════════════════════

Versions:
  Node.js: v20.20.0
  npm: 10.8.2

Status:
  ✅ Node.js setup
  ✅ Dependencies installed
  ✅ Health check passed
  ✅ Vulnerabilities audited
  ✅ TypeScript verified

All checks passed!

Next Commands:
  make dev              - Start development
  make dev-server       - Start server only
  make dev-client       - Start client only
  make dev-proxmox      - Start Proxmox backend
  make health           - Run health check
  make help             - Show all commands

═══════════════════════════════════════
```

## Troubleshooting

### Problem: Node.js not installed

**Error:** `Node.js not found. Please install Node 20+ first`

**Solution:**
```bash
# Option 1: Use NodeSource (apt)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install nodejs

# Option 2: Use NVM (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20

# Then retry:
make deps
```

### Problem: npm permissions error

**Error:** `npm ERR! code EACCES`

**Solution:**
```bash
# Fix npm permissions
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH=~/.npm-global/bin:$PATH

# Add to ~/.bashrc or ~/.zshrc:
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc

# Retry:
make deps
```

### Problem: Stuck on installation

**Error:** Installation takes forever or freezes

**Solution:**
```bash
# Cancel (Ctrl+C) and try:
make clean          # Remove everything
make deps           # Fresh start

# If still stuck, use faster registry:
npm config set registry https://registry.npmjs.org
make clean
make deps
```

## Related Commands

```bash
make help           # Show all available commands
make setup          # Node.js only (Phase 1.1)
make health         # Run health check
make audit          # Fix vulnerabilities
make clean          # Remove node_modules
make info           # Show project info
```

## For Developers

### Before Committing

```bash
make lint           # Check code style
make type-check     # Verify TypeScript
make test           # Run tests
make health         # Final check
```

### When Adding Dependencies

```bash
npm install package-name --save
make health         # Verify health
```

### When Updating Dependencies

```bash
npm update
make deps           # Re-run full setup to audit
```

---

**Created:** 19 janvier 2026  
**Phase:** Automated Setup (Phase 1-2+)  
**Status:** ✅ Production Ready  
**Aligned with:** PLAN_REFACTORISATION_ET_ARCHI.md
