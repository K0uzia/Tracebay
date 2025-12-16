# Dashboard - Guide d'utilisation

## 📊 Vue d'ensemble

Le dashboard du serveur Workspace offre un monitoring temps réel de tous les paramètres du serveur, incluant:

- **Monitoring**: Statistiques en temps réel (uptime, CPU, mémoire, etc.)
- **Logs**: Journaux système et événements
- **Chat**: Terminal affichant tous les messages de chat
- **Requêtes**: Terminal affichant toutes les requêtes HTTP
- **Connexions**: Liste des clients connectés
- **Statistiques**: Graphiques et statistiques détaillées

## 🚀 Démarrage

Le dashboard est accessible sur http://localhost:8060

### Démarrer le serveur

```bash
cd apps/server
npm start
```

### Accéder au dashboard

Ouvrez dans votre navigateur:
```
http://localhost:8060
```

## 📡 API Endpoints

### Statistiques

**GET** `/api/monitoring/internal/stats`
- Retourne les statistiques du serveur
- Accessible sans authentification

Réponse:
```json
{
  "success": true,
  "stats": {
    "uptime": 300,
    "timestamp": "2025-12-15T18:35:12.721Z",
    "memoryUsage": "8 MB",
    "cpuUsage": "15%",
    "nodeVersion": "v18.0.0",
    "httpStats": {
      "total": 50,
      "success": 45,
      "clientErrors": 3,
      "serverErrors": 2
    }
  }
}
```

### Logs de Chat

**GET** `/api/monitoring/chat-logs?limit=100`
- Récupère les logs de chat récents

**POST** `/api/monitoring/log-chat`
- Enregistre un nouveau message de chat

Corps:
```json
{
  "user": "Alice",
  "message": "Bonjour!"
}
```

### Logs de Requêtes

**GET** `/api/monitoring/request-logs?limit=100`
- Récupère les logs de requêtes HTTP récentes

**POST** `/api/monitoring/log-request`
- Enregistre une nouvelle requête HTTP

Corps:
```json
{
  "method": "GET",
  "path": "/api/monitoring/stats",
  "status": 200,
  "statusText": "OK",
  "duration": 45
}
```

## 🎨 Caractéristiques

### Terminal de Chat
- Affichage en temps réel des messages de chat
- Format: `[HH:MM:SS] <user> message`
- Bouton "Effacer" pour nettoyer les logs
- Défilement automatique vers les nouveaux messages
- Limitation à 500 messages pour les performances

### Terminal de Requêtes
- Affichage en temps réel des requêtes HTTP
- Format: `[HH:MM:SS] METHOD /path → STATUS (duration ms)`
- Couleur-codage par méthode HTTP:
  - GET: Vert (#00ff00)
  - POST: Orange (#ffb700)
  - PUT: Bleu (#00bfff)
  - DELETE: Rouge (#ff6b6b)
- Couleur-codage par status:
  - 2xx (Succès): Vert
  - 4xx (Erreur Client): Orange
  - 5xx (Erreur Serveur): Rouge
- Bouton "Effacer" pour nettoyer les logs
- Limitation à 500 requêtes pour les performances

### Design des Cards
- Grille responsive avec auto-fit
- Hover effect avec élévation (translateY)
- États actif/inactif bien distincts
- Icones FontAwesome 6.4.0
- Responsive sur mobile, tablette et desktop

## 🔄 Rafraîchissement en temps réel

- Les statistiques se mettent à jour toutes les 2 secondes
- Les logs de chat et requêtes se synchronisent automatiquement
- La WebSocket maintient une connexion persistante
- Reconnexion automatique en cas de déconnexion

## 📋 Architecture

### Backend

**Fichiers clés:**
- `server.js`: Configuration du serveur Express
- `routes/monitoring.js`: Endpoints de monitoring
- `lib/ServerLogger.js`: Logging des requêtes et messages
- `middleware/httpRequestTracker.js`: Tracking automatique des requêtes

### Frontend

**Fichiers clés:**
- `public/index.html`: Structure du dashboard
- `public/assets/js/modules/ServerMonitor.js`: Gestion du polling et WebSocket
- `public/assets/js/modules/TerminalLogger.js`: Affichage des terminaux
- `public/assets/js/app.js`: Logique de navigation
- `public/assets/css/modules/terminal.css`: Styles des terminaux
- `public/assets/css/modules/cards.css`: Styles des cards
- `public/assets/css/modules/dashboard.css`: Styles du dashboard

## 🧪 Test Rapide

Pour tester les endpoints sans redémarrer:

```bash
# Logs de chat
curl http://localhost:8060/api/monitoring/chat-logs

# Logs de requêtes
curl http://localhost:8060/api/monitoring/request-logs

# Enregistrer un message
curl -X POST http://localhost:8060/api/monitoring/log-chat \
  -H "Content-Type: application/json" \
  -d '{"user":"Test","message":"Hello!"}'

# Enregistrer une requête
curl -X POST http://localhost:8060/api/monitoring/log-request \
  -H "Content-Type: application/json" \
  -d '{"method":"GET","path":"/test","status":200,"statusText":"OK","duration":10}'
```

## ⚙️ Configuration

### Variables d'environnement

```
SERVER_HOST=localhost
SERVER_PORT=8060
NODE_ENV=development
```

### Limites

- Maximum 500 logs de chat mémorisés
- Maximum 500 requêtes mémorisées
- Polling toutes les 2 secondes

## 🐛 Troubleshooting

### Dashboard ne se charge pas

1. Vérifier que le serveur est en cours d'exécution sur le port 8060
2. Vérifier les erreurs dans la console du navigateur (F12)
3. Vérifier que les fichiers statiques sont accessibles

### Logs ne s'affichent pas

1. Les nouveaux logs apparaissent en bas du terminal
2. Le défilement automatique doit être activé
3. Le bouton "Effacer" peut avoir vidé les logs

### Performance

- Si trop de logs s'accumulent, cliquer "Effacer"
- Le polling toutes les 2 secondes peut être ajusté dans ServerMonitor.js
- Les CSS scan lines peuvent consommer des ressources sur de vieux navigateurs

## 📝 Notes

- Les logs sont stockés en mémoire uniquement (pas de persistence)
- À chaque redémarrage du serveur, les logs sont effacés
- Pour la production, implémenter une vraie base de données pour les logs
- WebSocket peut être remplacé par Server-Sent Events (SSE) si nécessaire

## 🎯 Prochaines étapes

- [ ] Ajouter des filtres sur les logs (par niveau, par utilisateur, etc.)
- [ ] Ajouter un mode "dark/light" 
- [ ] Implémenter la persistence des logs dans la base de données
- [ ] Ajouter des graphiques temps réel
- [ ] Support des alertes (ex: erreur 500)
- [ ] Export des logs (CSV, JSON)
- [ ] Recherche et filtrage avancé
