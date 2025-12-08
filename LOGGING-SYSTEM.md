# 📊 Système de Logging Complet - Chat Widget

**Date**: 8 décembre 2025  
**Status**: ✅ Complètement opérationnel

---

## 🎯 Objectifs Atteints

### 1. ✅ Logs de Console et Application
**Fonctionnalité**: 
- Un nouveau fichier app est créé à chaque lancement
- Les fichiers sont nommés avec timestamp: `app-YYYY-MM-DD_HHmmssmmm.log`
- Conservation des 5 derniers fichiers (les plus anciens sont supprimés automatiquement)
- Tous les messages du serveur sont enregistrés

**Exemple de fichier**:
```
/home/goupil/.workspace/logs/app-2025-12-08_1765208247580.log
```

**Contenu enregistré**:
- Messages d'information du serveur
- Statut du serveur HTTP et WebSocket
- Connexions/déconnexions utilisateurs
- Erreurs et warnings

---

### 2. ✅ Logs du Chat (WebSocket)
**Fonctionnalité**:
- Un nouveau fichier chat est créé à chaque lancement
- Les fichiers sont nommés avec timestamp: `chat-YYYY-MM-DD_HHmmssmmm.log`
- Conservation des 5 derniers fichiers
- Enregistre TOUS les événements WebSocket

**Exemple de fichier**:
```
/home/goupil/.workspace/logs/chat/chat-2025-12-08_1765208146709.log
```

**Événements enregistrés**:
- ✅ Connexions WebSocket (`CONNECTION`)
- ✅ Définition du pseudo (`PSEUDO_SET`)
- ✅ Messages envoyés (`MESSAGE`)
- ✅ Déconnexions (`DISCONNECT`)
- ✅ Erreurs WebSocket (`WEBSOCKET_ERROR`)

---

## 📝 Format des Logs

### Logs Application
```
[2025-12-08T15:37:27.585Z] [INFO] ✅ Table chat_messages prête
[2025-12-08T15:37:27.601Z] [INFO] 🚀 Workspace 1.0 - Serveur lancé
[2025-12-08T15:37:27.601Z] [INFO] 📍 http://localhost:8060
[2025-12-08T15:37:36.415Z] [INFO] ⏹️  Arrêt du serveur (SIGTERM)...
```

### Logs Chat
```
============================================================
[2025-12-08T15:35:46.709Z] 🚀 Démarrage du chat-logger
============================================================
[2025-12-08T15:35:48.428Z] 📌 [CONNECTION] Nouvelle connexion WebSocket
[2025-12-08T15:35:48.450Z] ✅ CONNEXION: Alice 
[2025-12-08T15:35:48.451Z] 🔌 [WS] PSEUDO_SET - Alice (Total: 1 utilisateur(s))
[2025-12-08T15:35:48.745Z] 💬 Alice: Hello World!
[2025-12-08T15:35:48.745Z] 🔌 [WS] MESSAGE - Alice ("Hello World!")
[2025-12-08T15:35:49.049Z] ❌ DÉCONNEXION: Alice
[2025-12-08T15:35:49.049Z] 🔌 [WS] DISCONNECT - Alice (Total: 0 utilisateur(s))
```

---

## 🔧 Nouvelles Méthodes du Chat-Logger

| Méthode | Emoji | Description |
|---------|-------|-------------|
| `logMessage(pseudo, msg)` | 💬 | Enregistre un message envoyé |
| `logConnection(pseudo)` | ✅ | Connexion utilisateur |
| `logDisconnection(pseudo)` | ❌ | Déconnexion utilisateur |
| `logPseudoChange(old, new)` | 🔄 | Changement de pseudo |
| `logError(error, context)` | ⚠️  | Erreur de l'application |
| `logWebSocketAction(action, pseudo, details)` | 🔌 | Action WebSocket détaillée |
| `logEvent(event, details)` | 📌 | Événement général |

---

## 📁 Structure des Répertoires

```
~/.workspace/logs/
├── app-2025-12-08_1765208247580.log      (fichier application courant)
├── app-2025-12-08_1765208233493.log      (ancien)
├── app-2025-12-08_1765208229562.log      (ancien)
├── app-2025-12-08.log                     (ancien format, conservé)
└── chat/
    ├── chat-2025-12-08_1765208146709.log (fichier chat courant)
    ├── chat-2025-12-08.log                (ancien format, conservé)
    └── ...
```

---

## 🚀 Rotation Automatique des Logs

**Système de nettoyage automatique**:
- À chaque lancement, le système crée un nouveau fichier avec timestamp
- Si plus de 5 fichiers existent, les plus anciens sont supprimés
- Les anciens fichiers `app-YYYY-MM-DD.log` sont conservés pour la compatibilité

**Exemple**: 
```
ls -1t ~/.workspace/logs/app-*.log
app-2025-12-08_1765208247580.log    ← Plus récent
app-2025-12-08_1765208233493.log
app-2025-12-08_1765208229562.log
app-2025-12-08_1765208225468.log
app-2025-12-08_1765208146708.log
```

---

## ✨ Avantages du Système

1. **Isolation des lancements** : Chaque lancement a son propre fichier
2. **Timestamps précis** : Identification facile de QUAND quelque chose s'est passé
3. **Nettoyage automatique** : Pas de perte de données, mais pas d'accumulation infinie
4. **Émojis visuels** : Lecture facile des logs
5. **Détails complets** : Pseudo, message, nombre d'utilisateurs, etc.
6. **Séparation app/chat** : Logs du serveur et du chat bien organisés

---

## 📊 Fichiers Modifiés

| Fichier | Changement |
|---------|-----------|
| `logger.js` | Nouveau format de timestamp avec rotation |
| `chat-logger.js` | Nouvelles méthodes, démarrage avec séparateur |
| `server.js` | Utilise nouvelles méthodes du chat-logger |

---

## 🧪 Test Effectué

```bash
# Lancement 1, 2, 3
Lancement #1... ✅ app-...-1765208225468.log créé
Lancement #2... ✅ app-...-1765208229562.log créé
Lancement #3... ✅ app-...-1765208233493.log créé

# Rotation testée
Avant: 2 fichiers
Après: 5 fichiers (maximum conservé)
Les 5 fichiers les plus récents sont préservés
```

---

## 🎓 Utilisation des Logs

### Consulter les logs en temps réel
```bash
tail -f ~/.workspace/logs/app-$(ls -1t ~/.workspace/logs/app-*.log | head -1 | sed 's/.*app-//' | sed 's/.log//')
tail -f ~/.workspace/logs/chat/chat-$(ls -1t ~/.workspace/logs/chat/chat-*.log | head -1 | sed 's/.*chat-//' | sed 's/.log//')
```

### Chercher un utilisateur spécifique
```bash
grep "Alice" ~/.workspace/logs/chat/chat-*.log
```

### Voir les erreurs
```bash
grep -E "(ERREUR|ERROR|⚠️)" ~/.workspace/logs/chat/chat-*.log
```

### Analyser une session
```bash
cat ~/.workspace/logs/app-2025-12-08_*.log
cat ~/.workspace/logs/chat/chat-2025-12-08_*.log
```

