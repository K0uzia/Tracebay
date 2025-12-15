.PHONY: help info init deps setup-env dev server db.init db.reset db.shell db.backup build build-publish publish-github clean check-updates update-deps update-electron audit

help:
	@echo "Workspace - Commandes Makefile:"
	@echo ""
	@echo "Setup:"
	@echo "  make init              # Configuration initiale complète"
	@echo "  make deps              # Installe dépendances système"
	@echo "  make setup-env         # Configure variables d'environnement"
	@echo ""
	@echo "Dev:"
	@echo "  make dev               # Serveur Node + Electron"
	@echo "  make server            # Juste serveur Node (port 3000)"
	@echo ""
	@echo "BD:"
	@echo "  make db.init           # Initialise la BD"
	@echo "  make db.reset          # Réinitialise la BD"
	@echo "  make db.shell          # Shell SQLite3"
	@echo "  make db.backup         # Sauvegarde la BD"
	@echo ""
	@echo "Build & Publication:"
	@echo "  make build             # Build avec electron-builder"
	@echo "  make build-publish     # Build et test publication"
	@echo "  make publish-github    # Build et publication GitHub Releases"
	@echo "  make clean             # Nettoie dist/, out/"
	@echo ""
	@echo "Updates & Maintenance:"
	@echo "  make check-updates     # Vérifier mises à jour npm"
	@echo "  make update-deps       # Mettre à jour dépendances npm"
	@echo "  make update-electron   # Mettre à jour Electron (manual)"
	@echo "  make audit             # Audit sécurité npm"
	@echo ""
	@echo "Info:"
	@echo "  make info              # État du système"

init:
	@./setup-local.sh init

deps:
	@./setup-local.sh deps

info:
	@./setup-local.sh info

dev:
	@./setup-local.sh dev

server:
	@./setup-local.sh server

db.init:
	@./bin/db init

db.reset:
	@./setup-local.sh reset

db.shell:
	@./setup-local.sh db.shell

db.backup:
	@./setup-local.sh db.backup

build:
	@npm run build

clean:
	@echo "🧹 Nettoyage..."
	@rm -rf dist/ out/ build/ *.log
	@echo "✅ Nettoyé"

check-updates:
	@./setup-local.sh check-updates

update-deps:
	@./setup-local.sh update-deps

update-electron:
	@./setup-local.sh update-electron

audit:
	@./setup-local.sh audit

setup-env:
	@bash scripts/setup-env.sh

build-publish:
	@bash scripts/build-publish.sh

publish-github:
	@bash scripts/build-publish.sh --publish
