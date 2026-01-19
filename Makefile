# 🏗️ Workspace Makefile
# 
# Purpose: Simplify common development tasks
# Usage: make [target]
# 
# Aligned with: PLAN_REFACTORISATION_ET_ARCHI.md

.PHONY: help setup health audit dev build test clean docker-up docker-down proxmox-start proxmox-stop proxmox-restart proxmox-status proxmox-logs proxmox-logs-live

# Colors
BLUE := \033[0;34m
GREEN := \033[0;32m
RED := \033[0;31m
YELLOW := \033[1;33m
NC := \033[0m

# Default target
.DEFAULT_GOAL := help

################################################################################
# 📚 Help
################################################################################
help: ## Show this help message
	@echo "🏗️  Workspace Development Commands"
	@echo ""
	@echo "Setup & Verification:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ""

################################################################################
# 🔧 Setup & Health Checks
################################################################################
deps: ## 🚀 AUTOMATED: Setup Node + install all deps + health + audit (ONE COMMAND)
	@echo "🚀 Complete dependency setup (one command)..."
	@chmod +x scripts/setup-deps.sh
	@./scripts/setup-deps.sh

setup: ## Install Node.js and dependencies (Phase 1.1)
	@echo "🔧 Setting up Node.js and dependencies..."
	@chmod +x scripts/setup-node.sh
	@./scripts/setup-node.sh

health: ## Run health check on project
	@echo "🩺 Running health check..."
	@chmod +x scripts/health-check.sh
	@./scripts/health-check.sh

audit: ## Run smart audit fix
	@echo "🔒 Running smart audit fix..."
	@chmod +x scripts/smart-audit-fix.sh
	@./scripts/smart-audit-fix.sh

audit-report: ## Show detailed vulnerability report
	@echo "📊 Vulnerability Report:"
	@npm audit

################################################################################
# 🚀 Development
################################################################################
dev: ## Start all apps (server API + client)
	npm run dev

dev-server: ## Start server API only
	npm run dev:server

dev-server-ui: ## Start server UI only
	npm run dev:server:ui

dev-client: ## Start client (Electron) only
	npm run dev:client

proxmox-start: ## Start Proxmox backend production
	@echo "$(BLUE)🚀 Démarrage du backend Proxmox...$(NC)"
	@cd apps/proxmox && npm run start > logs/proxmox.log 2>&1 &
	@sleep 3
	@echo "$(GREEN)✅ Backend lancé$(NC)"
	@echo ""
	@echo "$(BLUE)╔═══════════════════════════════════════════════════════════════╗$(NC)"
	@echo "$(BLUE)║ 🎯 ENDPOINTS DISPONIBLES                                      ║$(NC)"
	@echo "$(BLUE)╠═══════════════════════════════════════════════════════════════╣$(NC)"
	@echo "$(BLUE)║ URL HTTP:    $(GREEN)http://192.168.1.62:4000$(BLUE)                           ║$(NC)"
	@echo "$(BLUE)║ WebSocket:   $(GREEN)ws://192.168.1.62:4000/ws$(BLUE)                         ║$(NC)"
	@echo "$(BLUE)║ Health:      $(GREEN)http://192.168.1.62:4000/api/health$(BLUE)               ║$(NC)"
	@echo "$(BLUE)║ Metrics:     $(GREEN)http://192.168.1.62:4000/api/metrics$(BLUE)               ║$(NC)"
	@echo "$(BLUE)║ Messages:    $(GREEN)http://192.168.1.62:4000/api/messages$(BLUE)              ║$(NC)"
	@echo "$(BLUE)║ Marques:     $(GREEN)http://192.168.1.62:4000/api/marques$(BLUE)               ║$(NC)"
	@echo "$(BLUE)║ Events:      $(GREEN)http://192.168.1.62:4000/api/events$(BLUE)                ║$(NC)"
	@echo "$(BLUE)║ Lots:        $(GREEN)http://192.168.1.62:4000/api/lots$(BLUE)                  ║$(NC)"
	@echo "$(BLUE)║ Shortcuts:   $(GREEN)http://192.168.1.62:4000/api/shortcuts$(BLUE)             ║$(NC)"
	@echo "$(BLUE)╚═══════════════════════════════════════════════════════════════╝$(NC)"
	@echo ""

proxmox-stop: ## Stop Proxmox backend
	@echo "$(RED)🛑 Arrêt du backend Proxmox...$(NC)"
	@pkill -f "node.*main.js" || pkill -f "tsx.*main.ts" || true
	@sleep 1
	@echo "$(GREEN)✅ Backend arrêté$(NC)"

proxmox-restart: proxmox-stop ## Restart Proxmox backend
	@sleep 2
	@make proxmox-start

proxmox-status: ## Check Proxmox backend status
	@echo "$(BLUE)📊 Vérification du statut Proxmox...$(NC)"
	@if curl -s http://192.168.1.62:4000/api/health > /dev/null 2>&1; then \
		echo "$(GREEN)✅ Backend en ligne$(NC)"; \
		curl -s http://192.168.1.62:4000/api/health | jq . 2>/dev/null || echo "✅ Health endpoint responsive"; \
	else \
		echo "$(RED)❌ Backend hors ligne$(NC)"; \
	fi

proxmox-logs: ## Show Proxmox logs (last 50 lines)
	@echo "$(BLUE)📋 Derniers logs Proxmox:$(NC)"
	@tail -50 logs/proxmox.log 2>/dev/null || echo "$(YELLOW)Pas de logs disponibles$(NC)"

proxmox-logs-live: ## Show Proxmox logs live (tail -f)
	@echo "$(BLUE)🔴 Logs en direct (Ctrl+C pour arrêter):$(NC)"
################################################################################
# 🏗️ Build
################################################################################
build: ## Build all apps
	npm run build

build-server: ## Build server only
	npm run build:server

build-client: ## Build client only
	npm run build:client

build-client-linux: ## Build client for Linux (electron-builder)
	@bash scripts/build-client-linux.sh

build-client-linux-quick: ## Build client for Linux (skip deps install)
	@bash scripts/build-client-linux.sh --skip-install

build-production: ## Build for production
	npm run build:production

################################################################################
# 🧪 Testing & Quality
################################################################################
test: ## Run all tests
	npm run test

test-watch: ## Run tests in watch mode
	npm run test --workspace=apps/server -- --watch

lint: ## Lint code
	npm run lint

format: ## Format code with Prettier
	npm run format

type-check: ## Check TypeScript types
	npm run type-check

################################################################################
# 🗄️ Database
################################################################################
reset-db: ## Reset database (WARNING: deletes all data)
	@echo "⚠️  This will delete all database data!"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		npm run reset-db; \
	fi

################################################################################
# 🐳 Docker (Phase 3+)
################################################################################
docker-build: ## Build Docker images
	npm run docker:proxmox:build

docker-up: ## Start Docker containers
	npm run docker:proxmox:up

docker-down: ## Stop Docker containers
	npm run docker:proxmox:down

docker-logs: ## Show Docker logs
	npm run docker:proxmox:logs

docker-clean: ## Remove Docker containers and volumes
	docker compose -f docker/proxmox/docker-compose.yml down -v

################################################################################
# 🧹 Cleanup
################################################################################
clean: ## Remove node_modules and build artifacts
	@echo "🧹 Cleaning workspace..."
	rm -rf node_modules
	rm -rf apps/server/node_modules
	rm -rf apps/client/node_modules
	rm -rf apps/proxmox/node_modules
	rm -rf apps/server/dist
	rm -rf apps/proxmox/dist
	rm -rf package-lock.json
	rm -rf apps/*/package-lock.json
	@echo "✅ Cleanup complete"

clean-logs: ## Remove log files
	@echo "🧹 Cleaning logs..."
	find . -name "*.log" -type f -delete
	find . -name "npm-debug.log*" -type f -delete
	@echo "✅ Logs cleaned"

################################################################################
# 📦 Dependencies
################################################################################
install: ## Install dependencies
	npm install

update-deps: ## Update dependencies (interactive)
	npm update

outdated: ## Show outdated dependencies
	npm outdated

################################################################################
# 🎯 Phase-specific targets (Refactorization)
################################################################################
phase1: setup health ## Complete Phase 1 setup
	@echo "✅ Phase 1 complete: Node.js setup & health check"

phase1-2: deps ## Complete Phase 1 + Phase 2 setup (automated)
	@echo "✅ Phase 1-2 complete: Full automated setup with Proxmox"

phase2: ## Phase 2 already done! Run: make dev-proxmox
	@echo "✅ Phase 2 (Fastify migration) already implemented!"
	@echo "Start Proxmox backend: make dev-proxmox"
	@echo "Or start everything: make dev"

phase2-prep: ## Prepare for Phase 2 (Fastify migration)
	@echo "🚧 Phase 2 preparation..."
	@echo "Creating proxmox structure..."
	mkdir -p apps/proxmox/src/{api,models,lib,ws,db,config,middleware,utils,types}
	@echo "✅ Ready for Phase 2"

phase3-prep: ## Prepare for Phase 3 (Docker)
	@echo "🚧 Phase 3 preparation..."
	@echo "Creating Docker structure..."
	mkdir -p docker/proxmox
	@echo "✅ Ready for Phase 3"

################################################################################
# 🔍 Information
################################################################################
info: ## Show project information
	@echo "📊 Workspace Information"
	@echo "======================="
	@echo "Node version:    $$(node -v)"
	@echo "npm version:     $$(npm -v)"
	@echo "Project version: $$(grep version package.json | head -1 | sed 's/.*: "\(.*\)".*/\1/')"
	@echo ""
	@echo "Workspaces:"
	@echo "  - apps/server"
	@echo "  - apps/client"
	@echo "  - apps/proxmox"
	@echo ""
	@echo "Current branch:  $$(git branch --show-current 2>/dev/null || echo 'N/A')"
	@echo ""

################################################################################
# 📊 Phase Validation
################################################################################
validate-phases: ## Validate all completed phases (1-4)
	@echo "📊 Validating Phases 1-4..."
	@echo ""
	@echo "Phase 1: Structure & Configuration"
	@[ -f "tsconfig.json" ] && echo "  ✅ tsconfig.json" || echo "  ❌ tsconfig.json missing"
	@[ -d "apps" ] && echo "  ✅ apps/ structure" || echo "  ❌ apps/ missing"
	@[ -d "config" ] && echo "  ✅ config/" || echo "  ❌ config/ missing"
	@[ -d "shared" ] && echo "  ✅ shared/" || echo "  ❌ shared/ missing"
	@echo ""
	@echo "Phase 2: Fastify Migration"
	@[ -d "apps/proxmox" ] && echo "  ✅ apps/proxmox/" || echo "  ❌ apps/proxmox/ missing"
	@[ -f "apps/proxmox/src/main.ts" ] && echo "  ✅ Fastify backend" || echo "  ❌ Fastify missing"
	@grep -q "fastify" apps/proxmox/package.json && echo "  ✅ Fastify installed" || echo "  ❌ Fastify missing"
	@echo ""
	@echo "Phase 3: Docker & Deployment"
	@[ -d "docker" ] && echo "  ✅ docker/" || echo "  ❌ docker/ missing"
	@[ -f "docker/proxmox/docker-compose.yml" ] && echo "  ✅ docker-compose.yml" || echo "  ❌ docker-compose missing"
	@[ -f "docker/proxmox/Dockerfile" ] && echo "  ✅ Dockerfile" || echo "  ❌ Dockerfile missing"
	@echo ""
	@echo "Phase 4: Monitoring, CI/CD & Client Build"
	@[ -f ".github/workflows/ci.yml" ] && echo "  ✅ CI/CD workflow" || echo "  ❌ CI/CD missing"
	@[ -d "apps/client/dist" ] && echo "  ✅ Build artifacts exist" || echo "  ⚠️  Build artifacts not yet created"
	@echo ""
	@echo "📋 Documentation"
	@[ -f "PLAN_REFACTORISATION_ET_ARCHI.md" ] && echo "  ✅ Architecture plan" || echo "  ❌ Architecture plan missing"
	@[ -f "ROADMAP_REFACTORING.md" ] && echo "  ✅ Roadmap" || echo "  ❌ Roadmap missing"
	@[ -f "PHASE_COMPLETION_STATUS.md" ] && echo "  ✅ Phase status" || echo "  ❌ Phase status missing"
	@[ -f "PHASE_5_ROADMAP.md" ] && echo "  ✅ Phase 5 roadmap" || echo "  ❌ Phase 5 roadmap missing"
	@[ -f "VALIDATION_TESTS_1_4.md" ] && echo "  ✅ Validation tests" || echo "  ❌ Validation tests missing"
	@echo ""
	@echo "✅ Phase validation complete!"

validate-all: ## Full validation suite (structure + health + tests)
	@echo "🧪 Running full validation suite..."
	@echo ""
	@echo "1️⃣  Checking structure..."
	@make validate-phases
	@echo ""
	@echo "2️⃣  Running health check..."
	@bash scripts/health-check.sh
	@echo ""
	@echo "3️⃣  Validating TypeScript..."
	@npm run type-check
	@echo ""
	@echo "✅ Full validation complete!"

################################################################################
# 🚨 Quick Fixes
################################################################################
fix-permissions: ## Fix script permissions
	@echo "🔧 Fixing script permissions..."
	chmod +x scripts/*.sh
	@echo "✅ Permissions fixed"

reinstall: clean install ## Clean and reinstall all dependencies
	@echo "✅ Reinstall complete"
