# Proxmox Backend - Branche Dédiée

Cette branche contient **uniquement** les fichiers nécessaires au déploiement du backend Proxmox.

## 🚀 Installation en une commande

```bash
curl -fsSL https://raw.githubusercontent.com/SandersonnDev/workspace/proxmox/scripts/proxmox-setup.sh | sudo bash -s install
```

## 📋 Contenu de cette branche

- `apps/proxmox/` - Backend TypeScript (Node.js + Express + PostgreSQL + WebSocket)
- `docker/proxmox/` - Configuration Docker Compose
- `scripts/proxmox-setup.sh` - Script d'installation et gestion automatiques
- `PROXMOX_README.md` - Documentation complète

## 🎮 Commandes disponibles

Après installation, utilisez simplement :

```bash
proxmox start       # Démarre le backend
proxmox stop        # Arrête le backend
proxmox restart     # Redémarre le backend
proxmox status      # Affiche le statut
proxmox dbreset     # Réinitialise la BDD
proxmox debug on    # Active les logs détaillés
proxmox debug off   # Désactive les logs détaillés
proxmox logs        # Affiche les logs
proxmox logs live   # Logs en temps réel
```

## 📖 Documentation complète

Voir **[PROXMOX_README.md](PROXMOX_README.md)** pour :
- Instructions d'installation détaillées
- Configuration des variables d'environnement
- Gestion du service systemd
- Dépannage et logs
- Mise à jour et maintenance

## 🔧 Architecture

```
┌─────────────────────────────────────┐
│   Backend Proxmox (Docker)          │
│                                     │
│  ┌──────────────────────────────┐   │
│  │  API HTTP/WebSocket          │   │
│  │  (Express + TypeScript)      │   │
│  └──────────┬───────────────────┘   │
│             │                       │
│  ┌──────────▼───────────────────┐   │
│  │  PostgreSQL Database         │   │
│  │  (Docker Compose)            │   │
│  └──────────────────────────────┘   │
│                                     │
│  Ports: 4000 (API/WS)               │
└─────────────────────────────────────┘
        ▲
        │  HTTP/WebSocket
        │
   [Clients externes]
```

## 🎯 Caractéristiques

✅ **Installation automatisée** - Script tout-en-un  
✅ **Service systemd** - Démarrage automatique au boot  
✅ **Auto-restart** - Redémarrage en cas de crash  
✅ **Mode debug** - Logs détaillés client ↔ serveur  
✅ **Gestion simple** - Commandes intuitives  
✅ **Docker Compose** - Isolation et reproductibilité  
✅ **Health checks** - Monitoring intégré  
✅ **PostgreSQL** - Base de données robuste

## 🌐 Endpoints

Une fois le backend démarré :

- **API HTTP** : `http://<IP>:4000`
- **WebSocket** : `ws://<IP>:4000/ws`
- **Health** : `http://<IP>:4000/api/health`
- **Metrics** : `http://<IP>:4000/api/metrics`

## 📝 Notes

- **Branche dédiée** : Seuls les fichiers Proxmox sont présents
- **Prérequis** : Debian 13 (Trixie) ou compatible
- **Pas de Makefile** : Commandes simples et directes
- **Mode production** : Optimisé pour 24h/24

---

**Pour plus d'informations** : Consultez [PROXMOX_README.md](PROXMOX_README.md)

