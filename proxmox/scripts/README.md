# 📜 Proxmox Management Script

Unified script for Proxmox backend installation, deployment, and maintenance.

## 🚀 Quick Start

```bash
# 1. Installation (first time)
sudo bash proxmox.sh install

# 2. Start services
proxmox start

# 3. Check status
proxmox status
```

## 📋 Commands

| Command | Description | Requires Root |
|---------|-------------|---------------|
| `install` | Complete setup & configuration | ✅ Yes |
| `start` | Start backend services | ✅ Yes |
| `stop` | Stop backend services | ✅ Yes |
| `restart` | Restart backend | ✅ Yes |
| `status` | Show detailed status | ❌ No |
| `logs [live]` | Show logs | ❌ No |
| `diag` | Run diagnostics | ❌ No |
| `rebuild` | Update & rebuild | ✅ Yes |
| `reset-db` | Reset database (⚠️ deletes data) | ✅ Yes |

## 📦 Installation Process

```bash
sudo bash proxmox.sh install
```

**Steps:**
1. Check network & DNS
2. Install Docker & Docker Compose  
3. Install Node.js 20 LTS
4. Clone/update repository
5. Install npm dependencies
6. Build TypeScript
7. Generate .env with secure JWT_SECRET
8. Create systemd service (not started)
9. Install `proxmox` command

⚠️ **Important:** Services NOT started automatically. Use `proxmox start`.

## 🎮 Usage Examples

```bash
# Start backend
proxmox start

# Check if running
proxmox status

# View logs in real-time
proxmox logs live

# Update code and rebuild
proxmox rebuild

# Run diagnostics
proxmox diag
```

## 🌐 Endpoints

| Service | URL |
|---------|-----|
| HTTP API | `http://<CT-IP>:4000` |
| WebSocket | `ws://<CT-IP>:4000/ws` |
| Health | `http://<CT-IP>:4000/api/health` |

## ⚙️ Configuration

### Configurer l’email à l’avance (envoi de PDF par mail)

Pour que l’envoi d’email fonctionne dès le premier démarrage, sans rien modifier sur le CT :

1. Dans le dépôt (avant de cloner sur le CT), copiez le fichier exemple :
   ```bash
   cp proxmox/docker/email.env.example proxmox/docker/email.env
   ```
2. Éditez `proxmox/docker/email.env` et remplissez vos valeurs :
   - `MAIL_FROM` : adresse expéditeur (ex. `noreply@votredomaine.com`)
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`
3. Versionnez `email.env` (dépôt privé) ou copiez-le sur le CT dans `proxmox/docker/` avant de lancer le script.
4. Lors de `proxmox.sh install`, le script intègre automatiquement le contenu de `email.env` dans le `.env` généré.

Si `email.env` est absent, le script génère des valeurs par défaut (pas d’envoi réel). Vous pourrez ajouter `email.env` plus tard et relancer `install` ou éditer `.env` puis `proxmox restart`.

### Autres variables

Edit environment: `/workspace/proxmox/docker/.env` (généré par le script)

Key variables:
- `API_PORT` - API port (default: 4000)
- `JWT_SECRET` - Auto-generated at install
- `ALLOWED_ORIGINS` - CORS (IP du CT ajoutée automatiquement)
- `DB_PASSWORD` - Database password

After changes: `proxmox restart`

## 🐛 Troubleshooting

```bash
# Check logs
proxmox logs

# Run diagnostics
proxmox diag

# Check Docker containers
docker ps -a

# Reset everything
proxmox reset-db  # ⚠️ Deletes all data
```

## 📖 Full Documentation

See [DEPLOYMENT.md](../docs/DEPLOYMENT.md) for complete setup guide.
