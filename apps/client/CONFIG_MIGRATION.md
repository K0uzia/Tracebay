# Migration vers Configuration Centralisée

## Fichiers créés

1. **`config/connection.json`** - Fichier de configuration centralisé unique
2. **`public/config/connection.json`** - Copie accessible depuis le frontend
3. **`public/assets/js/config/ServerConfig.js`** - Module de chargement de la config
4. **`public/assets/js/config/ApiClient.js`** - Client API centralisé
5. **`public/assets/js/config/ServerHelper.js`** - Helpers globaux

## Fichiers modifiés

1. **`public/assets/js/config/ConnectionConfig.js`** - Utilise maintenant ServerConfig
2. **`public/app.js`** - Initialise ServerConfig en premier
3. **`main.js`** - Utilise `connection.json` au lieu de `server-config.json`
4. **`public/assets/js/modules/auth/AuthManager.js`** - Utilise ServerHelper
5. **`public/assets/js/modules/shortcut/ShortcutManager.js`** - Partiellement migré

## Fichiers à migrer

Les modules suivants doivent être mis à jour pour utiliser `ServerHelper` :

### Modules de réception
- `public/assets/js/modules/reception/gestion-lots.js`
- `public/assets/js/modules/reception/inventaire.js`
- `public/assets/js/modules/reception/tracabilite.js`
- `public/assets/js/modules/reception/historique.js`

### Autres modules
- `public/assets/js/modules/system/SystemInfoManager.js`
- `public/assets/js/modules/chat/ChatManager.js`
- `public/assets/js/modules/chat/ChatWidgetManager.js`
- `public/assets/js/global.js`

## Pattern de migration

### Avant
```javascript
const serverUrl = (window.APP_CONFIG && window.APP_CONFIG.serverUrl) || 'http://localhost:8060';
const response = await fetch(`${serverUrl}/api/lots`);
```

### Après
```javascript
import { getServerUrl, getEndpointUrl } from '../../config/ServerHelper.js';

const response = await fetch(getEndpointUrl('lots.list'));
// ou pour un endpoint avec paramètres
const response = await fetch(getEndpointUrl(`lots.get`).replace(':id', lotId));
```

## Utilisation de ServerHelper

```javascript
import { getServerUrl, getServerWsUrl, getEndpointUrl, getEndpoint } from '../../config/ServerHelper.js';

// Obtenir l'URL du serveur
const serverUrl = getServerUrl();

// Obtenir l'URL WebSocket
const wsUrl = getServerWsUrl();

// Obtenir l'URL complète d'un endpoint
const url = getEndpointUrl('auth.login'); // -> 'http://192.168.1.62:4000/api/auth/login'

// Obtenir juste le chemin de l'endpoint
const endpoint = getEndpoint('auth.login'); // -> '/api/auth/login'
```

## Endpoints disponibles dans connection.json

Tous les endpoints sont définis dans `config/connection.json` sous la clé `endpoints`.
Utilisez la notation pointée pour accéder aux endpoints imbriqués :
- `health` -> `/api/health`
- `auth.login` -> `/api/auth/login`
- `lots.list` -> `/api/lots`
- `lots.get` -> `/api/lots/:id`
- `shortcuts.categories.list` -> `/api/shortcuts/categories`
