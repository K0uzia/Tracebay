# Guide Développeur - Chat Widget

## 🚀 Démarrage Rapide

### Initialisation (Automatique)
Le widget est automatiquement initialisé au chargement de la page.

```javascript
// Dans global.js
import ChatWidgetManager from './modules/ChatWidgetManager.js';

window.chatWidgetManager = new ChatWidgetManager({
    wrapperId: 'chat-widget-wrapper',
    buttonId: 'chat-widget-btn',
    panelId: 'chat-widget-panel',
    closeButtonId: 'chat-widget-close',
    pseudoModalId: 'chat-widget-pseudo-modal',
    notificationBadgeId: 'chat-notification-badge'
});
```

## 📚 API ChatWidgetManager

### Constructor

```javascript
new ChatWidgetManager(options)
```

**Options:**
```javascript
{
    wrapperId: 'chat-widget-wrapper',      // ID du wrapper
    buttonId: 'chat-widget-btn',           // ID du bouton flottant
    panelId: 'chat-widget-panel',          // ID du panel
    closeButtonId: 'chat-widget-close',    // ID du bouton fermeture
    pseudoModalId: 'chat-widget-pseudo-modal', // ID du modal pseudo
    notificationBadgeId: 'chat-notification-badge', // ID du badge
    securityConfig: {}                     // Config ChatSecurityManager
}
```

### Méthodes publiques

#### togglePanel()
```javascript
widget.togglePanel();
// Ouvre ou ferme le panel selon l'état actuel
```

#### openPanel()
```javascript
widget.openPanel();
// Ouvre le panel
```

#### closePanel()
```javascript
widget.closePanel();
// Ferme le panel
```

#### showPseudoModal()
```javascript
widget.showPseudoModal();
// Affiche le modal de sélection du pseudo
```

#### hidePseudoModal()
```javascript
widget.hidePseudoModal();
// Masque le modal de pseudo
```

#### checkAndShowPseudoModal()
```javascript
widget.checkAndShowPseudoModal();
// Affiche le modal seulement si aucun pseudo n'existe
```

#### getChatManager()
```javascript
const chatManager = widget.getChatManager();
// Retourne l'instance ChatManager interne
```

#### updateNotificationBadge()
```javascript
widget.updateNotificationBadge();
// Met à jour le badge avec le nombre de messages
```

#### clearNotifications()
```javascript
widget.clearNotifications();
// Efface le badge de notification
```

#### showNotification(message, type)
```javascript
widget.showNotification('Nouveau message!', 'info');
// Types: 'info', 'success', 'warning', 'error'
// À implémenter selon les besoins
```

## 🔄 Accès à ChatManager

Le widget expose l'instance ChatManager :

```javascript
const widget = window.chatWidgetManager;
const chatManager = widget.getChatManager();

// Propriétés
chatManager.pseudo              // Pseudo actuel
chatManager.messages            // Array de messages
chatManager.PSEUDO_MIN_LENGTH   // Minimum 2
chatManager.PSEUDO_MAX_LENGTH   // Maximum 20
chatManager.MESSAGE_MAX_LENGTH  // Maximum 500

// Méthodes
chatManager.sendMessage()       // Envoyer un message
chatManager.clearChat()         // Effacer tous les messages
chatManager.confirmPseudo()     // Confirmer le pseudo
chatManager.modifyPseudo()      // Modifier le pseudo
```

## 🎨 Personnalisation CSS

### Variables CSS utilisées

```css
/* Couleurs principales */
--bleu1        : #3e3b8c (couleur primaire)
--bleu2        : #6c68b9 (couleur secondaire)
--blanc        : #ffffff
--text         : 0.9rem sans-serif
--text2        : #5d5d5d
--text3        : #999999

/* Espacements */
--unit-1       : 4px
--unit-2       : 8px
--unit-3       : 12px
--unit-4       : 16px

/* Animations */
--transition   : 0.2s ease-in-out
--radius-small : 4px
--radius-medium: 8px
```

### Modifier les styles

Créer un fichier CSS custom et l'importer après `chat-widget.css` :

```css
/* Custom Chat Widget Styles */

.chat-widget-btn {
    width: 70px !important;
    height: 70px !important;
    background-color: #ff6b6b !important;
}

.chat-widget-header {
    background: linear-gradient(135deg, #ff6b6b 0%, #ff4757 100%) !important;
}
```

## 🔧 Événements

### Événements gérés automatiquement

| Événement | Action |
|-----------|--------|
| Click bouton flottant | togglePanel() |
| Click bouton fermeture | closePanel() |
| Key Escape (quand panel ouvert) | closePanel() |
| Key Enter (input message) | ChatManager.sendMessage() |
| Key Enter (input pseudo) | ChatManager.confirmPseudo() |

### Écouter les événements

```javascript
// Le widget n'expose pas d'événements custom pour l'instant
// Vous pouvez accéder aux éléments directement :

const chatWidget = document.getElementById('chat-widget-btn');
chatWidget.addEventListener('click', () => {
    console.log('Button clicked');
});
```

## 📱 Responsive Design

Le widget s'adapte automatiquement selon la taille de l'écran :

```javascript
// Desktop
// window > 1024px
// Panel: 380x600px, Position: bottom 32px, right 32px

// Tablet  
// 768px < window <= 1024px
// Panel: 360x550px, Position: bottom 24px, right 24px

// Mobile
// window <= 480px
// Panel: 100vw x 100vh (fullscreen), Position: bottom 8px, right 8px
```

## 🔐 Sécurité

### Validation Pseudo

```javascript
// Minimum 2 caractères, Maximum 20
// Caractères autorisés: a-zA-Z0-9_-éèêëàâäùûüôöîïœæçÉÈÊËÀÂÄÙÛÜÔÖÎÏŒÆÇ espace
```

### Validation Messages

```javascript
// Maximum 500 caractères
// XSS Prevention via ChatManager (textContent + sanitization)
// Liens filtrés selon ChatSecurityManager
```

### Stockage

```javascript
// localStorage keys
localStorage.getItem('chatPseudo')    // Pseudo utilisateur
localStorage.getItem('chat_messages') // Array de messages JSON
```

## 🧪 Testing

### Test manuel

1. Ouvrir `test-widget.html`
2. Consulter la console (`F12` → Console)
3. Vérifier les logs :
   - `✅ ChatWidgetManager créé`
   - `✅ ChatWidgetManager initialisé`

### Test via code

```javascript
// Accéder au widget
const widget = window.chatWidgetManager;

// Vérifier l'état
console.log('Is open:', widget.isOpen);
console.log('Pseudo:', widget.chatManager.pseudo);
console.log('Messages:', widget.chatManager.messages);

// Tester les méthodes
widget.openPanel();
widget.getChatManager().sendMessage();
widget.closePanel();
```

## 🐛 Debugging

### Console Logs

Le widget affiche des logs détaillés dans la console :

```
🚀 ChatWidgetManager créé
🎯 Initialisation ChatWidgetManager
🔍 Vérification du pseudo...
✅ Pseudo trouvé: MonPseudo
🔗 Attachement des écouteurs...
✅ Écouteurs attachés
✅ ChatWidgetManager initialisé
```

### Vérifier les éléments DOM

```javascript
// Dans la console du navigateur
document.getElementById('chat-widget-wrapper') // Doit exister
document.getElementById('chat-widget-btn')     // Doit exister
document.getElementById('chat-widget-panel')   // Doit exister

// Vérifier si le CSS est appliqué
getComputedStyle(document.getElementById('chat-widget-btn')).position
// Doit retourner "fixed"
```

### Réinitialiser le widget

```javascript
// Effacer les données
localStorage.removeItem('chatPseudo');
localStorage.removeItem('chat_messages');

// Récharger la page
location.reload();
```

## 🔌 Intégration avec d'autres modules

### Avec NavManager

```javascript
// Si vous voulez désactiver le menu burger quand le chat est ouvert
const navManager = window.navManager;
const chatWidget = window.chatWidgetManager;

// Ajouter une classe si panel ouvert
if (chatWidget.isOpen) {
    document.body.classList.add('chat-open');
}
```

### Avec TimeManager

```javascript
// Les deux modules fonctionnent indépendamment
// Pas de conflit de ressources
```

## 📋 Checklist Implémentation

- [x] Fichiers CSS créés et importés
- [x] HTML du widget ajouté à index.html
- [x] ChatWidgetManager créé et importé
- [x] Initialisation dans global.js
- [x] Variables CSS définies
- [x] Animations testées
- [x] Responsive design
- [x] Accessibilité (clavier)
- [x] Sécurité (sanitization)
- [x] Documentation complète

## 📞 Support

Pour toute question, consulter :
- `docs/5-CHAT-WIDGET.md` - Documentation générale
- `public/assets/css/modules/chat-widget.css` - Styles détaillés
- `public/assets/js/modules/ChatWidgetManager.js` - Code source commenté
- `public/assets/js/modules/ChatManager.js` - ChatManager parent
