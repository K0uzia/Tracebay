# Chat Widget - Référence Événements et Interactions

## 🎯 Événements Utilisateur

### Bouton Flottant

| Événement | Action | Résultat |
|-----------|--------|----------|
| Click | `togglePanel()` | Ouvre ou ferme le panel |
| Hover | Animation scale 1.1 | Feedback visuel |
| Active (press) | Animation scale 0.98 | Feedback clique |

### Panel Chat

| Événement | Action | Résultat |
|-----------|--------|----------|
| Click bouton X | `closePanel()` | Ferme le panel |
| Key Escape | `closePanel()` | Ferme le panel |
| Click en dehors (optionnel) | - | Pas de fermeture (design Facebook) |

### Input Message

| Événement | Action | Résultat |
|-----------|--------|----------|
| Key Enter | `chatManager.sendMessage()` | Envoie le message |
| Key Shift+Enter | - | Nouvelle ligne (non implémenté) |
| Text Input | - | Affiche le texte |
| Maxlength 500 | - | Limite le texte |

### Input Pseudo

| Événement | Action | Résultat |
|-----------|--------|----------|
| Key Enter | `chatManager.confirmPseudo()` | Confirme le pseudo |
| Click "Confirmer" | `chatManager.confirmPseudo()` | Confirme le pseudo |
| Focus | Auto focus au chargement | Prêt à saisir |
| Blur | - | Perte de focus |

### Bouton Changer Pseudo

| Événement | Action | Résultat |
|-----------|--------|----------|
| Click | `showPseudoModal()` | Affiche le modal pseudo |
| Hover | Color change | Feedback visuel |

## 📋 États du Widget

### État 1: Bouton Seul (Panel Fermé)
```
[💬] Button visible en bas à droite
├─ isOpen = false
├─ panel.classList: []
└─ notificationBadge visible si messages
```

### État 2: Panel Ouvert (Pseudo Confirmé)
```
[Panel Ouvert]
├─ isOpen = true
├─ panel.classList: ['open']
├─ pseudoModal.classList: []
├─ Pseudo affiché
├─ Messages visibles
└─ Input message prêt
```

### État 3: Panel Ouvert (Modal Pseudo)
```
[Panel Ouvert avec Modal]
├─ isOpen = true
├─ panel.classList: ['open']
├─ pseudoModal.classList: ['show']
├─ Overlay sombre sur le chat
├─ Input pseudo en focus
└─ Autres éléments inaccessibles
```

## 🔄 Cycle de Vie

```mermaid
[Page Chargée]
    ↓
[DOM Ready]
    ↓
[ChatWidgetManager créé]
    ├─ new ChatManager()
    └─ attachEventListeners()
    ↓
[checkAndShowPseudoModal()]
    ├─ localStorage.getItem('chatPseudo')
    ├─ Si null → showPseudoModal()
    │   └─ openPanel()
    └─ Si trouvé → showPseudoChangeButton()
    ↓
[Widget Initialisé et Prêt]
    ↓
[En attente d'interaction utilisateur]
```

## 📊 Flux Données

### Envoi Message

```
User tape message
    ↓
Key Enter ou Click "Envoyer"
    ↓
chatManager.sendMessage()
    ├─ Valide le message (max 500 chars)
    ├─ Crée un objet message
    │  {
    │    id: timestamp,
    │    pseudo: localStorage.getItem('chatPseudo'),
    │    message: text,
    │    timestamp: Date.now(),
    │    own: true
    │  }
    ├─ localStorage.setItem('chat_messages', JSON.stringify([...]))
    ├─ Appelle displayMessages()
    └─ Efface l'input
    ↓
Panel affiche le nouveau message
```

### Réception Message (Polling localStorage)

```
setInterval (500ms)
    ↓
localStorage.getItem('chat_messages')
    ↓
Compare avec this.messages
    ↓
Si nouveaux messages détectés
    ├─ this.messages = [...messages, newMessage]
    ├─ displayMessages()
    ├─ Scroll to bottom
    ├─ updateNotificationBadge() (si panel fermé)
    └─ Animation fadeIn du message
```

## 🎨 Animations

### Panel Ouverture
```
État Initial:
├─ opacity: 0
├─ transform: translateY(20px) scale(0.95)
└─ pointer-events: none

État Final:
├─ opacity: 1
├─ transform: translateY(0) scale(1)
└─ pointer-events: auto

Timing: 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)
```

### Message Apparition
```
keyframes fadeIn {
    from {
        opacity: 0;
        transform: translateY(10px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

Timing: 0.2s ease
```

### Bouton Hover
```
Transition: all 0.2s ease-in-out
Changes:
├─ background-color: var(--bleu1) → var(--bleu2)
├─ box-shadow: 0 4px 12px → 0 6px 16px
└─ transform: scale(1) → scale(1.1)
```

## 🔧 Callbacks et Hooks

### ChatWidgetManager Callbacks

```javascript
// Pas de callbacks natifs, mais vous pouvez en ajouter :

// Exemple : Notifier quand le panel s'ouvre
const originalOpenPanel = widget.openPanel.bind(widget);
widget.openPanel = function() {
    console.log('Panel opened');
    originalOpenPanel();
};

// Exemple : Écouter les messages
const originalSendMessage = widget.chatManager.sendMessage.bind(widget.chatManager);
widget.chatManager.sendMessage = function() {
    console.log('Message sent');
    originalSendMessage();
};
```

## 🔐 Validations

### Pseudo
```javascript
// Validation
if (pseudo.length < 2) → "Minimum 2 caractères"
if (pseudo.length > 20) → "Maximum 20 caractères"
if (!regex.test(pseudo)) → "Caractères non autorisés"

// Caractères autorisés
a-zA-Z0-9_-éèêëàâäùûüôöîïœæçÉÈÊËÀÂÄÙÛÜÔÖÎÏŒÆÇ espace
```

### Message
```javascript
// Validation
if (message.length > 500) → Limité par maxlength
if (message.trim().length === 0) → Ignorer

// Sécurité
textContent utilisé (pas innerHTML)
Pas de script exécuté
Liens filtrés par ChatSecurityManager
```

## 💾 Stockage

### localStorage Keys

```javascript
// Pseudo utilisateur
localStorage.getItem('chatPseudo')
// Valeur: "MonPseudo"

// Messages
localStorage.getItem('chat_messages')
// Valeur: [
//   {
//     id: 1234567890,
//     pseudo: "Alice",
//     message: "Bonjour",
//     timestamp: 1234567890,
//     own: true
//   },
//   ...
// ]

// Max messages: 100 (oldest deleted)
```

## 🚨 Gestion des Erreurs

### Erreurs Possibles

```javascript
// Pseudo invalide
if (error) {
    errorDiv.textContent = error;
    errorDiv.classList.add('show');
    input.focus();
}

// Éléments introuvables
if (!wrapper || !display || !input) {
    console.error('❌ Éléments chat introuvables');
    return;
}

// ChatManager déjà initialisé
if (this.isInitialized) {
    console.warn('⚠️ ChatManager déjà initialisé');
    return;
}
```

## 📱 Breakpoints Responsives

```css
/* Desktop */
@media (width > 1024px)
├─ Button: 60x60px
├─ Panel: 380x600px
├─ Position: bottom 32px, right 32px
└─ Border-radius: normal

/* Tablet */
@media (768px <= width <= 1024px)
├─ Button: 60x60px
├─ Panel: 360x550px
├─ Position: bottom 24px, right 24px
└─ Border-radius: normal

/* Mobile */
@media (width < 480px)
├─ Button: 50x50px
├─ Panel: 100vw x 100vh
├─ Position: bottom 8px, right 8px (effectif)
├─ Border-radius: 0 (fullscreen)
└─ Panel recouvre tout l'écran
```

## 🎯 Focus Management

```javascript
// Focus au chargement du widget
setTimeout(() => {
    // Si pas de pseudo
    input.pseudo.focus();
    // Ou si pseudo existe
    input.message.focus();
}, 300); // Après l'animation

// Focus restauré après envoi de message
input.message.focus();
```

## 📊 Logging Console

```
🚀 ChatWidgetManager créé
🎯 Initialisation ChatWidgetManager
🔍 Vérification du pseudo...
❌ Pas de pseudo, affichage du modal
🔗 Attachement des écouteurs...
✅ Écouteurs attachés
✅ ChatWidgetManager initialisé

// Au clic du bouton
👁️ Ouverture du panel
// Ou
👁️ Fermeture du panel

// Au pseudo
🎯 Affichage modal pseudo
🔐 confirmPseudo()
📝 Pseudo saisi: MonPseudo
✅ Pseudo confirmé
✏️ modifyPseudo()

// Aux messages
🔵 Clic sendBtn
💬 sendMessage()
✅ Message envoyé
🔄 Syncing messages...
```

---

**Dernière mise à jour**: 4 décembre 2025
**Version**: 1.0
