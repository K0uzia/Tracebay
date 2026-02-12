# Simplification de la connexion API

## ✅ Ce qui a été simplifié

### Avant (complexe)
- **4 fichiers** : ServerConfig.js, ApiClient.js, ServerHelper.js, ConnectionConfig.js
- Chaque module devait importer différents helpers
- Fallbacks hardcodés partout
- Gestion manuelle des URLs et endpoints

### Après (simple)
- **1 seul fichier** : `api.js` - Point d'entrée unique
- Import simple : `import api from './config/api.js'`
- Pas de fallbacks à gérer manuellement
- Authentification automatique

## 📁 Structure simplifiée

```
apps/client/
├── config/
│   └── connection.json          # Configuration unique
├── public/
│   ├── config/
│   │   └── connection.json     # Copie pour frontend
│   └── assets/js/config/
│       ├── api.js               # ⭐ Module API unique et simplifié
│       └── ConnectionConfig.js # Wrapper simplifié (pour compatibilité)
```

## 🔄 Migration des modules

### Modules migrés ✅
- `AuthManager.js` - Utilise maintenant `api.post('auth.login')`
- `ServerConnectionManager.js` - Utilise `api.get('health')`
- `SystemInfoManager.js` - Utilise `api.get('health')`
- `app.js` - Initialise `api.js` en premier
- `global.js` - Utilise `api.getServerUrl()`

### Modules à migrer (exemples)
- `ShortcutManager.js`
- `gestion-lots.js`
- `inventaire.js`
- `tracabilite.js`
- `historique.js`
- `ChatManager.js`
- `ChatWidgetManager.js`

## 📝 Exemple d'utilisation

### Avant
```javascript
const serverUrl = window.APP_CONFIG?.serverUrl || 'http://localhost:8060';
const response = await fetch(`${serverUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ username, password })
});
const data = await response.json();
```

### Après
```javascript
import api from './config/api.js';

const response = await api.post('auth.login', { username, password });
const data = await response.json();
```

## 🎯 Avantages

1. **Code plus court** : 1 ligne au lieu de 10+
2. **Pas de fallbacks** : Gérés automatiquement
3. **Authentification automatique** : Token ajouté automatiquement
4. **Type-safe** : Endpoints définis dans connection.json
5. **Maintenance facile** : Un seul endroit à modifier

## 🔧 Configuration

Tout est dans `config/connection.json` :
- Environnements (local, proxmox, production)
- Endpoints API organisés par catégories
- Paramètres de connexion

Pour changer l'environnement, modifiez simplement `"mode": "proxmox"` dans le fichier JSON.
