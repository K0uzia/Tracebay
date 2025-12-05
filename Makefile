.PHONY: dev server db.init db.reset db.shell db.backup info build help

help:
	@echo "Workspace - Commandes disponibles:"
	@echo "  make dev        - Lance serveur + Electron"
	@echo "  make server     - Lance juste le serveur Node"
	@echo "  make db.init    - Initialise la DB"
	@echo "  make db.reset   - Réinitialise la DB"
	@echo "  make db.shell   - Ouvre shell SQLite"
	@echo "  make db.backup  - Sauvegarde la DB"
	@echo "  make build      - Construit l'app Electron"
	@echo "  make info       - Infos système"

dev: ; bin/dev
server: ; bin/server
db.init: ; bin/db init
db.reset: ; bin/db reset
db.shell: ; bin/db shell
db.backup: ; bin/db backup
build: ; npm run build

info:
	@node -v
	@npm -v
	@sqlite3 --version || true
	@echo "Port: 3000"
	@echo "DB: ./data/database.sqlite"
