# Chat Widget - Feuille de Triche Développeur

## 🚀 Quick Start

```javascript
// Accéder au widget
const widget = window.chatWidgetManager;

// Ouvrir/fermer
widget.openPanel();           // Ouvrir
widget.closePanel();          // Fermer
widget.togglePanel();         // Toggle

// Pseudo
widget.showPseudoModal();     // Afficher le modal
widget.checkAndShowPseudoModal(); // Vérifier et afficher si nécessaire

// Notifications
widget.updateNotificationBadge();
widget.clearNotifications();

// ChatManager
const cm = widget.getChatManager();
console.log(cm.pseudo);       // Pseudo actuel
console.log(cm.messages);     // Array de messages
```

## 💾 localStorage

```javascript
// Accéder aux données sauvegardées
const pseudo = localStorage.getItem('chatPseudo');
const messages = JSON.parse(localStorage.getItem('chat_messages') || '[]');

// Vider les données
localStorage.removeItem('chatPseudo');
localStorage.removeItem('chat_messages');
localStorage.clear();

// Debug
console.log('Pseudo:', localStorage.getItem('chatPseudo'));
console.log('Messages:', localStorage.getItem('chat_messages'));
```

## 🎨 CSS Variables

```css
/* Utiliser les variables du thème */
--bleu1         /* Couleur primaire #3e3b8c */
--bleu2         /* Couleur secondaire #6c68b9 */
--blanc         /* #ffffff */
--text          /* Font properties */
--text2         /* #5d5d5d */
--text3         /* #999999 */
--unit-1        /* 4px */
--unit-2        /* 8px */
--unit-3        /* 12px */
--unit-4        /* 16px */
--transition    /* 0.2s ease-in-out */
--radius-small  /* 4px */
--radius-medium /* 8px */
```

## 🔧 Modificateurs CSS

```css
/* Panel ouvert */
.chat-widget-panel.open {}

/* Modal pseudo affiche */
.chat-widget-pseudo-modal.show {}

/* Notification badge visible */
.notification-badge.show {}

/* Message propre utilisateur */
.chat-message.own {}

/* Message d'un autre utilisateur */
.chat-message.other {}

/* Container messages vide */
.chat-widget-empty {}
```

## 🎯 Sélecteurs DOM Courants

```javascript
// Widget
document.getElementById('chat-widget-wrapper')
document.getElementById('chat-widget-btn')
document.getElementById('chat-widget-panel')
document.getElementById('chat-widget-close')

// Modal pseudo
document.getElementById('chat-widget-pseudo-modal')
document.getElementById('chat-widget-pseudo-input')
document.getElementById('chat-widget-pseudo-confirm')
document.getElementById('chat-widget-pseudo-error')

// Messages
document.getElementById('chat-widget-messages')
document.querySelectorAll('.chat-message')

// Input message
document.getElementById('chat-widget-input')
document.getElementById('chat-widget-send')
document.getElementById('chat-widget-clear')

// Pseudo affiche
document.getElementById('chat-widget-pseudo-display')
document.getElementById('chat-widget-pseudo-change')
```

## 📊 Flux de Données

```
User Input
    ↓
Event Listener (click/keypress)
    ↓
ChatWidgetManager Method
    ↓
ChatManager Method
    ↓
localStorage Update
    ↓
DOM Update (displayMessages)
    ↓
View Render
```

## 🔐 Validations Clé

```javascript
// Pseudo
const pseudo = 'MonPseudo';
if (pseudo.length < 2) console.error('Min 2 chars');
if (pseudo.length > 20) console.error('Max 20 chars');
if (!/^[a-zA-Z0-9_\-éèêëàâäùûüôöîïœæçÉÈÊËÀÂÄÙÛÜÔÖÎÏŒÆÇ ]+$/.test(pseudo)) {
    console.error('Caractères invalides');
}

// Message
const message = 'Bonjour';
if (message.length > 500) console.error('Max 500 chars');
if (message.trim().length === 0) console.error('Vide');
```

## 📱 Breakpoints

```javascript
// Desktop
if (window.innerWidth > 1024) { /* 380x600 panel */ }

// Tablet
if (window.innerWidth > 768 && window.innerWidth <= 1024) { /* 360x550 panel */ }

// Mobile
if (window.innerWidth <= 480) { /* 100vw x 100vh panel */ }
```

## 🐛 Debug Rapide

```javascript
// Vérifier l'initialisation
console.log(window.chatWidgetManager); // Doit exister
console.log(window.chatWidgetManager.chatManager); // Doit exister

// Vérifier l'état
console.log('Is Open:', window.chatWidgetManager.isOpen);
console.log('Pseudo:', window.chatWidgetManager.chatManager.pseudo);
console.log('Messages:', window.chatWidgetManager.chatManager.messages);

// Vérifier le DOM
console.log('Button:', document.getElementById('chat-widget-btn'));
console.log('Panel:', document.getElementById('chat-widget-panel'));
console.log('Messages Container:', document.getElementById('chat-widget-messages'));

// Forcer le state
window.chatWidgetManager.openPanel();
window.chatWidgetManager.chatManager.sendMessage();
```

## ⌨️ Keyboard Shortcuts

| Touche | Action |
|--------|--------|
| Enter | Envoyer message / Confirmer pseudo |
| Escape | Fermer le panel |
| Shift+Enter | Nouvelle ligne (non implémenté) |
| Tab | Naviguer entre les éléments |

## 🎯 États du Widget

```javascript
// Vérifier les états
if (window.chatWidgetManager.isOpen) { /* Panel ouvert */ }
if (window.chatWidgetManager.chatManager.pseudo) { /* Pseudo défini */ }
if (window.chatWidgetManager.chatManager.messages.length > 0) { /* Messages */ }

// Déterminer l'action
const widget = window.chatWidgetManager;
const hasMessages = widget.chatManager.messages.length > 0;
const hasPseudo = !!widget.chatManager.pseudo;
const isOpen = widget.isOpen;

console.log(`Widget Open: ${isOpen}, Pseudo: ${hasPseudo}, Messages: ${hasMessages}`);
```

## 💬 Envoyer un Message Programmatiquement

```javascript
// Via le manager
const widget = window.chatWidgetManager;

// 1. Remplir l'input
document.getElementById('chat-widget-input').value = 'Mon message';

// 2. Envoyer
widget.getChatManager().sendMessage();

// Ou directement
widget.getChatManager().sendMessage();
```

## 🎨 Changer les Couleurs

```css
/* global.css ou custom.css */

/* Changer la couleur primaire */
:root {
    --bleu1: #ff6b6b;  /* Red */
    --bleu2: #ff4757;  /* Dark red */
}

/* Ou cibler directement */
.chat-widget-btn {
    background-color: #ff6b6b !important;
}

.chat-widget-header {
    background: linear-gradient(135deg, #ff6b6b 0%, #ff4757 100%) !important;
}
```

## 📐 Redimensionner le Panel

```css
/* Desktop */
.chat-widget-panel {
    width: 500px !important;   /* Au lieu de 380px */
    height: 700px !important;  /* Au lieu de 600px */
}

/* Mobile */
@media (max-width: 480px) {
    .chat-widget-panel {
        width: 95vw !important;   /* Au lieu de 100vw */
        height: 90vh !important;  /* Au lieu de 100vh */
    }
}
```

## 🔧 Redémarrer le Widget

```javascript
// Complètement réinitialiser
localStorage.clear();
location.reload();

// Ou seulement le widget
const oldWidget = window.chatWidgetManager;
// ... désactiver les event listeners ...
window.chatWidgetManager = new ChatWidgetManager();
```

## 📡 Intégrer avec une API Backend

```javascript
// Exemple: Envoyer les messages au serveur

// Monkey-patch sendMessage
const originalSendMessage = ChatManager.prototype.sendMessage;
ChatManager.prototype.sendMessage = function() {
    const result = originalSendMessage.call(this);
    
    // Envoyer au serveur
    const message = this.messages[this.messages.length - 1];
    fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message)
    }).catch(err => console.error('API Error:', err));
    
    return result;
};
```

## 🧹 Nettoyage localStorage

```javascript
// Fonction utile pour nettoyer les vieux messages
function cleanupOldMessages(maxDays = 7) {
    const messages = JSON.parse(localStorage.getItem('chat_messages') || '[]');
    const cutoff = Date.now() - (maxDays * 24 * 60 * 60 * 1000);
    
    const cleaned = messages.filter(msg => msg.timestamp > cutoff);
    localStorage.setItem('chat_messages', JSON.stringify(cleaned));
    
    console.log(`Nettoyé: ${messages.length - cleaned.length} messages`);
    return cleaned;
}

// Utiliser
cleanupOldMessages(7); // Garder 7 jours
```

## 📊 Exporter les Messages

```javascript
// Exporter en CSV
function exportMessagesAsCSV() {
    const messages = JSON.parse(localStorage.getItem('chat_messages') || '[]');
    let csv = 'Timestamp,Pseudo,Message\n';
    
    messages.forEach(msg => {
        const date = new Date(msg.timestamp).toLocaleString();
        csv += `"${date}","${msg.pseudo}","${msg.message}"\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'chat-export.csv';
    a.click();
}

// Utiliser
exportMessagesAsCSV();
```

## 🔐 Importer des Messages (Admin)

```javascript
// Charger des messages depuis un fichier JSON
async function importMessages(file) {
    const content = await file.text();
    const messages = JSON.parse(content);
    
    // Valider chaque message
    const valid = messages.filter(msg => 
        msg.id && msg.pseudo && msg.message && msg.timestamp
    );
    
    // Fusionner avec existing
    const existing = JSON.parse(localStorage.getItem('chat_messages') || '[]');
    const merged = [...existing, ...valid];
    
    // Sauvegarder
    localStorage.setItem('chat_messages', JSON.stringify(merged));
    
    // Rafraîchir
    window.chatWidgetManager.chatManager.displayMessages();
}

// Utiliser
document.getElementById('file-input').onchange = (e) => {
    importMessages(e.target.files[0]);
};
```

## 🎯 Shortcuts Utiles

```javascript
// Alias pratiques
const w = window.chatWidgetManager;
const c = w.getChatManager();

// Utilisation
w.togglePanel();
console.log(c.pseudo);
c.sendMessage();
```

---

**Imprimez ou signalez-vous cette feuille de triche !**

Dernière mise à jour: 4 décembre 2025
