# Guide d'utilisation du module API simplifié

## Import

```javascript
import api from './config/api.js';
```

## Méthodes disponibles

### Requêtes HTTP

```javascript
// GET
const response = await api.get('auth.verify');
const data = await response.json();

// POST
const response = await api.post('auth.login', { username, password });
const data = await response.json();

// PUT
const response = await api.put('lots.update', { id: 1, name: 'Nouveau nom' });
const data = await response.json();

// DELETE
const response = await api.delete('shortcuts.delete', { id: 5 });
const data = await response.json();
```

### Options supplémentaires

```javascript
// Avec headers personnalisés
const response = await api.get('auth.verify', {
    headers: {
        'Custom-Header': 'value'
    }
});

// Avec signal pour annulation
const controller = new AbortController();
const response = await api.get('health', {
    signal: controller.signal
});
```

### URLs et WebSocket

```javascript
// Obtenir l'URL du serveur
const serverUrl = api.getServerUrl(); // 'http://192.168.1.62:4000'

// Obtenir l'URL WebSocket
const wsUrl = api.getWsUrl(); // 'ws://192.168.1.62:4000'

// Obtenir l'URL complète d'un endpoint
const url = api.getUrl('auth.login'); // 'http://192.168.1.62:4000/api/auth/login'
```

## Endpoints disponibles

Tous les endpoints sont définis dans `config/connection.json`. Utilisez la notation pointée :

- `health` → `/api/health`
- `auth.login` → `/api/auth/login`
- `auth.register` → `/api/auth/register`
- `auth.verify` → `/api/auth/verify`
- `lots.list` → `/api/lots`
- `lots.get` → `/api/lots/:id`
- `shortcuts.list` → `/api/shortcuts`
- `shortcuts.categories.list` → `/api/shortcuts/categories`
- etc.

## Authentification automatique

Le module API ajoute automatiquement le token d'authentification depuis `localStorage.getItem('workspace_jwt')` dans les headers si disponible.

## Exemples de migration

### Avant
```javascript
const serverUrl = window.APP_CONFIG?.serverUrl || 'http://localhost:8060';
const response = await fetch(`${serverUrl}/api/auth/login`, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({ username, password })
});
```

### Après
```javascript
import api from './config/api.js';

const response = await api.post('auth.login', { username, password });
```

## Initialisation

Le module s'initialise automatiquement au premier appel. Vous pouvez aussi l'initialiser manuellement :

```javascript
import api from './config/api.js';
await api.init();
```
