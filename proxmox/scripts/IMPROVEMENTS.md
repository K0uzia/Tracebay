# Proxmox Script - Améliorations v2.0

## 📋 Résumé des changements

Le script `proxmox.sh` a été entièrement révisé pour offrir une meilleure UX et des fonctionnalités simplifiées.

### ✨ Nouvelles fonctionnalités

#### 1. **Commandes simplifiées**
Les commandes sont maintenant plus intuitives avec des alias :
- `proxmox up` / `on` / `start` → Démarrer les services
- `proxmox down` / `off` / `stop` → Arrêter les services
- `proxmox build` / `rebuild` → Construire et redémarrer
- `proxmox status` / `st` → Afficher le statut

#### 2. **Affichage des IPs en tableau propre**
Après chaque action (start, rebuild), un tableau unifié affiche :
- ✅ État du service
- 🌐 IP du serveur et port
- 📍 Endpoints (HTTP, WebSocket, Health Check)

Exemple d'affichage :
```
╔════════════════════════════════════════════════════════════════════════════╗
║                   ✅ PROXMOX BACKEND - READY                             ║
╠════════════════════════════════════════════════════════════════════════════╣
║ Server Information                                                         ║
├────────────────────────────────────────────────────────────────────────────┤
║  IP Address                        │  192.168.1.100                       ║
║  Port                              │  4000                                 ║
├────────────────────────────────────────────────────────────────────────────┤
║ API Endpoints                                                              ║
├────────────────────────────────────────────────────────────────────────────┤
║  HTTP API                          │  http://192.168.1.100:4000          ║
║  WebSocket                         │  ws://192.168.1.100:4000/ws         ║
║  Health Check                      │  http://192.168.1.100:4000/api/health║
╚════════════════════════════════════════════════════════════════════════════╝
```

#### 3. **Fonction centralisée d'affichage**
Nouvelle fonction `display_server_info()` pour afficher les informations de manière cohérente :
- Réutilisée dans `cmd_start()`, `cmd_rebuild()`, et `cmd_status()`
- Affichage unifié du tableau

#### 4. **Status amélioré**
Commande `proxmox status` / `proxmox st` qui affiche :
- État systemd (ACTIVE/INACTIVE)
- Santé API (ONLINE/OFFLINE)
- Informations réseau
- Endpoints API
- Containers Docker en cours d'exécution

#### 5. **Rebuild avec affichage des IPs**
Après un rebuild et redémarrage automatique, affiche les IPs et endpoints
directement sans besoin de faire `proxmox status`

#### 6. **Affichage lors du start**
Au démarrage, affiche immédiatement les endpoints après attente de santé

### 🎯 Améliorations de l'UX

#### Avant vs Après
| Aspect | Avant | Après |
|--------|-------|-------|
| Commandes | `proxmox start/stop/restart` | `proxmox up/down` ou `on/off` |
| Affichage info | À faire manuellement `status` | Auto après `up`, `build` |
| Tableaux | Inégal, multiples formats | Unifié, propre, cohérent |
| Recherche IPs | Pas automatique | Intégré partout |

### 📝 Détails techniques

#### Modifications principales

**1. Ajout fonction `display_server_info()`**
```bash
# Display server info in a clean table
display_server_info() {
  local ct_ip=$1
  # Affiche le tableau avec les IPs et endpoints
}
```

**2. Mise à jour `cmd_start()`**
- Appel `display_server_info()` après démarrage réussi

**3. Mise à jour `cmd_rebuild()`**
- Appel `display_server_info()` après redémarrage réussi

**4. Refonte `cmd_status()`**
- Tableau principal unifié avec état et IPs
- Meilleur alignement et présentation

**5. Dispatcher avec aliases**
```bash
case "$COMMAND" in
  up|on|start)
    cmd_start
    ;;
  down|off|stop)
    cmd_stop
    ;;
  build|rebuild)
    cmd_rebuild
    ;;
  status|st)
    cmd_status
    ;;
  # ... autres commandes
esac
```

### 🚀 Utilisation

**Démarrer le service et voir les IPs :**
```bash
proxmox up
# ou
proxmox on
# ou
proxmox start
```

**Arrêter le service :**
```bash
proxmox down
# ou
proxmox off
# ou
proxmox stop
```

**Voir le statut avec les IPs :**
```bash
proxmox status
# ou
proxmox st
```

**Rebuilder et redémarrer :**
```bash
proxmox build
# ou
proxmox rebuild
```

### ✅ Validation

- ✔️ Script bash syntaxe valide (pas d'erreur `bash -n`)
- ✔️ Aide complète et cohérente
- ✔️ Tous les tableaux formatés uniformément
- ✔️ Commandes simplifiées et intuitives
- ✔️ Affichage auto des IPs partout
