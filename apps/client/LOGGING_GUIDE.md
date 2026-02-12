# Guide d'utilisation du Logger et ErrorHandler

## Logger

### Import

```javascript
import getLogger from './config/Logger.js';

const logger = getLogger();
```

### Utilisation

```javascript
// Debug (développement uniquement)
logger.debug('Message de debug', { data: 'value' });

// Info
logger.info('Information', { userId: 123 });

// Warning
logger.warn('Avertissement', { reason: 'timeout' });

// Error
logger.error('Erreur', error, { context: 'additional data' });
```

### Configuration

Le niveau de log peut être configuré via la variable d'environnement `LOG_LEVEL` :
- `DEBUG` : Tous les logs
- `INFO` : Info, Warn, Error (défaut)
- `WARN` : Warn et Error uniquement
- `ERROR` : Error uniquement
- `NONE` : Aucun log

```javascript
// Changer le niveau programmatiquement
logger.setLevel('WARN');
logger.disable(); // Désactiver complètement
logger.enable();  // Réactiver
```

---

## ErrorHandler

### Import

```javascript
import getErrorHandler from './config/ErrorHandler.js';

const errorHandler = getErrorHandler();
```

### Utilisation

#### Erreurs API

```javascript
try {
    const response = await api.get('endpoint');
    // ...
} catch (error) {
    errorHandler.handleApiError(error, 'contexte de l\'erreur');
    // Retourne { userMessage, logMessage, error }
}
```

#### Erreurs de validation

```javascript
if (!isValid) {
    errorHandler.handleValidationError('Message d\'erreur', 'nomDuChamp');
}
```

#### Erreurs réseau

```javascript
catch (error) {
    if (error.name === 'NetworkError') {
        errorHandler.handleNetworkError(error);
    }
}
```

#### Erreurs WebSocket

```javascript
websocket.onerror = (error) => {
    errorHandler.handleWebSocketError(error);
};
```

#### Messages de succès/info

```javascript
errorHandler.showSuccess('Opération réussie');
errorHandler.showInfo('Information importante');
errorHandler.showWarning('Attention');
```

### Callbacks de notification

Pour intégrer avec votre système de notifications UI :

```javascript
import getErrorHandler from './config/ErrorHandler.js';

const errorHandler = getErrorHandler();

// Enregistrer un callback pour les notifications
errorHandler.onNotification((message, type) => {
    // type: 'error', 'success', 'info', 'warn'
    // Afficher dans votre UI (modal, toast, etc.)
    showNotification(message, type);
});
```

---

## Migration depuis console.log

### Avant
```javascript
console.log('Chargement des données...');
console.error('Erreur:', error);
```

### Après
```javascript
import getLogger from './config/Logger.js';
const logger = getLogger();

logger.info('Chargement des données...');
logger.error('Erreur', error);
```

---

## Migration depuis gestion d'erreurs manuelle

### Avant
```javascript
try {
    const response = await fetch(url);
    if (!response.ok) {
        alert('Erreur ' + response.status);
    }
} catch (error) {
    console.error(error);
    alert('Erreur de connexion');
}
```

### Après
```javascript
import getErrorHandler from './config/ErrorHandler.js';
const errorHandler = getErrorHandler();

try {
    const response = await api.get('endpoint');
    // ...
} catch (error) {
    errorHandler.handleApiError(error, 'contexte');
    // Message utilisateur affiché automatiquement
}
```

---

## Bonnes pratiques

1. **Utiliser logger.info** pour les informations importantes
2. **Utiliser logger.debug** pour le debug (sera désactivé en production)
3. **Utiliser errorHandler.handleApiError** pour toutes les erreurs API
4. **Ne pas utiliser console.log** directement dans le code de production
5. **Configurer LOG_LEVEL** selon l'environnement (DEBUG en dev, INFO/WARN en prod)
