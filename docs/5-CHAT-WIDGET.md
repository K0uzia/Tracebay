# Chat Widget - Bouton Flottant Style Facebook

## Vue d'ensemble

Le Chat Widget est un composant flottant positionné en bas à droite de l'écran (style Facebook Messenger ou chat d'assistance client). Il permet aux utilisateurs d'accéder au chat depuis n'importe quelle page de l'application.

## Architecture

### 📁 Fichiers créés

```
public/
├── assets/
│   ├── css/
│   │   └── modules/
│   │       └── chat-widget.css          # Styles du widget
│   └── js/
│       └── modules/
│           └── ChatWidgetManager.js     # Logique du widget
└── components/
    └── chat-widget.html                  # Structure HTML (incluse dans index.html)
```

### 🔗 Fichiers modifiés

- `public/assets/css/global.css` - Import du CSS widget
- `public/assets/js/global.js` - Initialisation du ChatWidgetManager
- `index.html` - Intégration du HTML widget

## Fonctionnalités

### 1. Bouton Flottant
- Position fixe en bas à droite
- Circulaire, 60x60px (responsive)
- Animations au survol
- Badge de notification

### 2. Panel Chat
- Dimensions : 380x600px (responsive)
- Animation apparition/disparition (smooth)
- Gradient header avec icône
- Bouton fermeture

### 3. Modal Pseudo
- S'affiche si aucun pseudo n'est sauvegardé
- Validation du pseudo (2-20 caractères)
- Gestion des erreurs
- Focus automatique

### 4. Zone Messages
- Affichage des messages en temps réel
- Distinction messages propres/autres
- Scrollbar personnalisée
- Animation d'apparition

### 5. Zone Saisie
- Input message
- Boutons : Envoyer, Effacer
- Touche Entrée pour envoyer
- Placeholder contextuel

### 6. Gestion Pseudo
- Affichage avec icône utilisateur
- Bouton "Changer pseudo"
- Sauvegarde localStorage

## Intégration avec ChatManager

Le widget intègre complètement le `ChatManager` existant :

```javascript
// ChatWidgetManager instancie ChatManager
this.chatManager = new ChatManager({
    pseudoWrapperId: 'chat-widget-pseudo-area',
    pseudoDisplayId: 'chat-widget-pseudo-display',
    pseudoInputId: 'chat-widget-pseudo-input',
    pseudoConfirmId: 'chat-widget-pseudo-confirm',
    pseudoErrorId: 'chat-widget-pseudo-error',
    messagesContainerId: 'chat-widget-messages',
    inputId: 'chat-widget-input',
    sendButtonId: 'chat-widget-send',
    clearChatBtnId: 'chat-widget-clear'
});
```

## Architecture de Classe

### ChatWidgetManager

**Responsabilités:**
- Gérer l'ouverture/fermeture du panel
- Afficher le modal de pseudo si nécessaire
- Intégrer ChatManager
- Gérer les notifications
- Coordonner les animations

**Méthodes publiques:**
```javascript
// Gestion du panel
togglePanel()          // Ouvrir/fermer
openPanel()            // Ouvrir
closePanel()           // Fermer

// Gestion du pseudo
showPseudoModal()      // Afficher modal
hidePseudoModal()      // Masquer modal
checkAndShowPseudoModal() // Vérifier et afficher si nécessaire

// Notifications
updateNotificationBadge()  // Mettre à jour le badge
clearNotifications()       // Effacer les notifications

// Accès
getChatManager()       // Obtenir l'instance ChatManager
```

**Événements gérés:**
- Clic bouton flottant → toggle panel
- Clic bouton fermeture → close panel
- Touche Entrée input message → sendMessage (via ChatManager)
- Touche Échap → close panel
- Touche Entrée input pseudo → confirmPseudo (via ChatManager)

## Règles respectées

### 📋 Design et Architecture (`rules/prompts/design.mdc`)
- ✅ SOLID principles appliqués
- ✅ Architecture modulaire et découplée
- ✅ ChatManager et ChatWidgetManager séparés
- ✅ Nommage explicite et cohérent
- ✅ Gestion centralisée des erreurs
- ✅ Facilite l'extensibilité

### 🎨 Ergonomie et UX (`rules/prompts/ergonomie.mdc`)
- ✅ Interface claire et accessible
- ✅ Gestion des états explicite (modal, panel ouvert/fermé)
- ✅ Labels et placeholders explicites
- ✅ Feedbacks utilisateur (animations, validation)
- ✅ Cohérence visuelle (thème couleurs application)

### 🔐 Accessibilité (`rules/prompts/accessibility.mdc`)
- ✅ Navigation au clavier complète (Entrée, Échap)
- ✅ Attributs title sur tous les boutons
- ✅ Contraste suffisant (WCAG AA)
- ✅ Structure sémantique

### 🔒 Sécurité Chat (`rules/chat-security.mdc`)
- ✅ Utilisation de ChatSecurityManager
- ✅ Validation des liens
- ✅ XSS Prevention via ChatManager
- ✅ Gestion sécurisée des messages

### 📱 Performance (`rules/prompts/perf.mdc`)
- ✅ CSS optimisé (variables CSS)
- ✅ Animations GPU (transform, opacity)
- ✅ Lazy loading du widget
- ✅ Pas de dépendances externes

## Utilisation

### Initialisation automatique

Le widget est initialisé automatiquement dans `global.js` au chargement du DOM :

```javascript
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

### Accès depuis le code

```javascript
// Accéder au widget
const widget = window.chatWidgetManager;

// Ouvrir/fermer
widget.openPanel();
widget.closePanel();
widget.togglePanel();

// Accéder à ChatManager
const chatManager = widget.getChatManager();

// Afficher une notification
widget.showNotification('Message reçu', 'info');
```

## Responsive Design

### Desktop (>1024px)
- Bouton : 60x60px
- Panel : 380x600px
- Position : bottom: 32px, right: 32px

### Tablet (768px-1024px)
- Bouton : 60x60px
- Panel : 360x550px
- Position : bottom: 24px, right: 24px

### Mobile (<480px)
- Bouton : 50x50px
- Panel : 100vw x 100vh (fullscreen)
- Position : bottom: 8px, right: 8px (hors écran)
- Border-radius : 0

## Animations

### Panel Ouverture
- Durée : 0.3s
- Timing : cubic-bezier(0.34, 1.56, 0.64, 1) (spring effect)
- Transformations : translateY(20px) → translateY(0), scale(0.95) → scale(1)

### Modal Pseudo
- Durée : 0.3s
- Timing : ease
- Animation : slideUp (translateY(20px) → 0)

### Messages
- Durée : 0.2s
- Timing : ease
- Animation : fadeIn (opacity 0→1, translateY(10px)→0)

### Bouton Hover
- Scale : 1.1
- Box-shadow : augmentation
- Durée : var(--transition)

## Testage

### Fichier de test
`test-widget.html` - Page HTML de démonstration du widget

### Comment tester
1. Ouvrir `test-widget.html` dans un navigateur
2. Voir le bouton flottant en bas à droite
3. Cliquer pour ouvrir le chat
4. Entrer un pseudo et confirmer
5. Envoyer des messages
6. Changer le pseudo
7. Tester les animations

## Amélioration Future

### Possibles évolutions
- [ ] Indicateur "utilisateurs en ligne"
- [ ] Typing indicator
- [ ] Réactions aux messages (emojis)
- [ ] Historique persistant (base de données)
- [ ] Support multilingue
- [ ] Thème sombre
- [ ] Son de notification
- [ ] Intégration webhooks (externes)

## Dépannage

### Le widget n'apparaît pas
- Vérifier que `chat-widget.css` est importé dans `global.css`
- Vérifier que `ChatWidgetManager.js` est importé dans `global.js`
- Vérifier que le HTML du widget est présent dans `index.html`
- Vérifier la console pour les erreurs

### Le modal pseudo n'apparaît pas
- Vérifier que localStorage n'a pas de pseudo sauvegardé
- Effacer les données localStorage : `localStorage.removeItem('chatPseudo')`
- Vérifier la console pour les erreurs

### Les messages ne s'affichent pas
- Vérifier que `ChatManager` est correctement initialisé
- Vérifier que les IDs sont corrects
- Vérifier localStorage pour `chat_messages`

## Fichiers de configuration

Voir le dossier `rules/` pour les directives complètes :
- `rules/prompts/design.mdc` - Architecture
- `rules/prompts/ergonomie.mdc` - UX
- `rules/prompts/accessibility.mdc` - Accessibilité
- `rules/chat-security.mdc` - Sécurité du chat
- `rules/prompts/perf.mdc` - Performance
