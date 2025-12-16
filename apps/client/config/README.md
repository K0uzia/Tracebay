# Configuration Serveur - Client Workspace

Ce fichier configure la connexion du client Electron vers le serveur (local, Proxmox, ou production).

## Modes disponibles

### `local` (développement)
Serveur sur la même machine :
```json
{
  "url": "http://localhost:8060",
  "ws": "ws://localhost:8060"
}
```

### `proxmox` (VM/LXC Proxmox)
Serveur sur une VM Proxmox dans le LAN :
```json
{
  "url": "http://192.168.1.50:8060",
  "ws": "ws://192.168.1.50:8060",
  "host": "proxmox-ws.local"
}
```

**Configuration requise :**
- IP fixe ou réservation DHCP pour la VM
- Port 8060 accessible depuis le LAN
- Pare-feu VM : autoriser le port 8060

### `production` (serveur public)
Serveur exposé sur Internet :
```json
{
  "url": "https://workspace.example.com",
  "ws": "wss://workspace.example.com",
  "host": "workspace.example.com"
}
```

## Sélection du mode

### Via fichier config
Modifier `server-config.json` :
```json
{
  "mode": "proxmox",
  ...
}
```

### Via variable d'environnement
```bash
SERVER_MODE=proxmox npm start
```

## Paramètres de connexion

- `healthCheckInterval` : Intervalle de vérification de santé (ms)
- `reconnectDelay` : Délai entre les tentatives de reconnexion (ms)
- `maxReconnectAttempts` : Nombre maximum de tentatives

## Exemple d'utilisation avec Proxmox

1. **Créer une VM Debian dans Proxmox**
   - 2 vCPU, 4 Go RAM
   - IP statique : `192.168.1.50`

2. **Installer le serveur dans la VM**
   ```bash
   cd /home/goupil/workspace/apps/server
   npm install
   node server.js
   ```

3. **Configurer le client**
   - Modifier `server-config.json` : `"mode": "proxmox"`
   - Ajuster l'IP dans la section `proxmox`

4. **Lancer le client**
   ```bash
   cd /home/goupil/workspace/apps/client
   npm start
   ```

## Vérification

Le client affiche au démarrage :
```
📡 Mode serveur: proxmox
🔗 URL: http://192.168.1.50:8060
🔌 WebSocket: ws://192.168.1.50:8060
```

Le footer affiche l'état du serveur :
- 🟢 **En ligne** : Connecté
- 🔴 **Déconnecté** : Connexion perdue
- ⚪ **Hors ligne** : Échec après plusieurs tentatives

## Dépannage

### Connexion impossible
- Vérifier que le serveur écoute sur `0.0.0.0:8060` (pas `127.0.0.1`)
- Vérifier le pare-feu de la VM : `sudo ufw allow 8060`
- Tester avec curl : `curl http://192.168.1.50:8060/api/health`

### WebSocket ne se connecte pas
- Vérifier la config CORS du serveur
- Vérifier que le serveur WebSocket écoute sur `0.0.0.0`
- Consulter les logs du client (F12 → Console)

### Reconnexions fréquentes
- Augmenter `healthCheckInterval` dans `server-config.json`
- Vérifier la stabilité du réseau
- Consulter les logs serveur dans la VM
