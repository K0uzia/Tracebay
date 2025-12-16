.PHONY: help client server all build test lint clean install setup dev

# Colors for output
GREEN := \033[0;32m
BLUE := \033[0;34m
YELLOW := \033[0;33m
NC := \033[0m # No Color

help:
	@echo "$(BLUE)Workspace Refactorisation - Available Commands$(NC)"
	@echo ""
	@echo "$(GREEN)Development:$(NC)"
	@echo "  make client       - Start client Electron app"
	@echo "  make server       - Start server Electron app (localhost:8060)"
	@echo "  make all          - Start client + server in parallel"
	@echo ""
	@echo "$(GREEN)Build & Dist:$(NC)"
	@echo "  make build        - Build both apps for production"
	@echo "  make build-client - Build client app only"
	@echo "  make build-server - Build server app only"
	@echo ""
	@echo "$(GREEN)Testing:$(NC)"
	@echo "  make test         - Run all tests (unit + integration)"
	@echo "  make test-unit    - Run unit tests only"
	@echo "  make test-watch   - Run tests in watch mode"
	@echo ""
	@echo "$(GREEN)Code Quality:$(NC)"
	@echo "  make lint         - Run ESLint on all code"
	@echo "  make lint-fix     - Fix ESLint issues automatically"
	@echo ""
	@echo "$(GREEN)Setup & Cleanup:$(NC)"
	@echo "  make install      - Install dependencies for both apps"
	@echo "  make setup        - Full setup (install + env + db)"
	@echo "  make clean        - Remove node_modules, dist, logs"
	@echo "  make clean-all    - Clean + remove database"
	@echo ""
	@echo "$(GREEN)Database:$(NC)"
	@echo "  make db-reset     - Reset database to initial state"
	@echo "  make db-backup    - Create database backup"
	@echo ""

# Development
client:
	@echo "$(YELLOW)Starting Client (Electron)...$(NC)"
	cd apps/client && npm start || true

server:
	@echo "$(YELLOW)Starting Server (Electron)...$(NC)"
	cd apps/server && npm start

all:
	@echo "$(YELLOW)Starting Server & Client in parallel...$(NC)"
	@echo "$(BLUE)Server: http://localhost:8060$(NC)"
	@echo "$(BLUE)Client: Starting...$(NC)"
	@echo ""
	(cd apps/server && npm start) & \
	(sleep 3 && cd apps/client && npm start)

# Build
build: build-client build-server
	@echo "$(GREEN)✓ Both apps built successfully$(NC)"

build-client:
	@echo "$(YELLOW)Building Client...$(NC)"
	cd apps/client && npm run build

build-server:
	@echo "$(YELLOW)Building Server...$(NC)"
	cd apps/server && npm run build

# Testing
test:
	@echo "$(YELLOW)Running all tests...$(NC)"
	npm run test

test-unit:
	@echo "$(YELLOW)Running unit tests...$(NC)"
	npm run test -- --testPathPattern="\.test\.js$$"

test-watch:
	@echo "$(YELLOW)Running tests in watch mode...$(NC)"
	npm run test -- --watch

# Linting
lint:
	@echo "$(YELLOW)Running ESLint...$(NC)"
	npx eslint apps --max-warnings 0

lint-fix:
	@echo "$(YELLOW)Fixing ESLint issues...$(NC)"
	npx eslint apps --fix

# Installation
install:
	@echo "$(YELLOW)Installing dependencies...$(NC)"
	npm install
	cd apps/client && npm install
	cd apps/server && npm install
	@echo "$(GREEN)✓ Dependencies installed$(NC)"

setup: install
	@echo "$(YELLOW)Setting up environment...$(NC)"
	@if [ ! -f apps/server/.env ]; then \
		cp apps/server/.env.example apps/server/.env; \
		echo "$(GREEN)✓ Created apps/server/.env$(NC)"; \
	else \
		echo "$(BLUE)ℹ apps/server/.env already exists$(NC)"; \
	fi
	@echo "$(GREEN)✓ Setup complete!$(NC)"

# Cleanup
clean:
	@echo "$(YELLOW)Cleaning build artifacts & node_modules...$(NC)"
	rm -rf apps/client/node_modules apps/client/dist apps/client/out
	rm -rf apps/server/node_modules apps/server/dist apps/server/out
	rm -rf node_modules
	@echo "$(GREEN)✓ Cleanup complete$(NC)"

clean-all: clean
	@echo "$(YELLOW)Removing database...$(NC)"
	rm -f apps/server/data/database.sqlite*
	@echo "$(GREEN)✓ Full cleanup complete$(NC)"

# Database
db-reset: 
	@echo "$(YELLOW)Resetting database...$(NC)"
	rm -f apps/server/data/database.sqlite*
	@echo "$(GREEN)✓ Database reset$(NC)"

db-backup:
	@echo "$(YELLOW)Backing up database...$(NC)"
	@mkdir -p apps/server/data/backups
	@cp apps/server/data/database.sqlite apps/server/data/backups/database.sqlite.bak.$(shell date +%Y%m%d_%H%M%S)
	@echo "$(GREEN)✓ Database backed up$(NC)"

.DEFAULT_GOAL := help

