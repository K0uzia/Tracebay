# Chat Widget - Troubleshooting & Optimizations

## 🐛 Troubleshooting

### Problème 1: Widget n'apparaît pas

**Symptôme:** Pas de bouton en bas à droite de l'écran

**Causes possibles:**
1. CSS non importé
2. HTML non présent
3. JavaScript erreur

**Solutions:**

```bash
# Vérifier que le CSS est importé
grep "chat-widget.css" public/assets/css/global.css

# Vérifier que le HTML est présent dans index.html
grep "chat-widget-wrapper" index.html

# Vérifier la console du navigateur pour les erreurs
# F12 → Console
```

**Checklist:**
- [ ] `@import url(./modules/chat-widget.css);` existe dans `global.css`
- [ ] `<div class="chat-widget-wrapper" id="chat-widget-wrapper">` existe dans `index.html`
- [ ] Pas d'erreurs JavaScript dans la console
- [ ] Z-index 9999 n'est pas bloqué par d'autres éléments

### Problème 2: Click sur le bouton ne fonctionne pas

**Symptôme:** Le panel ne s'ouvre pas au clic

**Causes possibles:**
1. ChatWidgetManager pas initialisé
2. Événement preventDefault bloquant
3. CSS pointer-events: none

**Solutions:**

```javascript
// Vérifier l'initialisation dans la console
console.log(window.chatWidgetManager);
// Doit afficher l'instance ChatWidgetManager

// Tester manuelle le toggle
window.chatWidgetManager.togglePanel();

// Vérifier le style computed
getComputedStyle(document.getElementById('chat-widget-btn'))
// pointer-events doit être "auto"
```

### Problème 3: Modal pseudo n'apparaît pas

**Symptôme:** Au premier accès, pas de modal pour choisir le pseudo

**Causes possibles:**
1. Pseudo déjà sauvegardé dans localStorage
2. Modal masqué par z-index
3. CSS display: none

**Solutions:**

```javascript
// Réinitialiser localStorage
localStorage.removeItem('chatPseudo');
localStorage.removeItem('chat_messages');

// Recharger
location.reload();

// Ou forcer l'affichage du modal
window.chatWidgetManager.showPseudoModal();
```

### Problème 4: Messages ne s'affichent pas

**Symptôme:** Envoyer un message mais rien n'apparaît

**Causes possibles:**
1. ChatManager pas initialisé
2. localStorage plein ou bloqué
3. Conteneur messages vide

**Solutions:**

```javascript
// Vérifier ChatManager
const cm = window.chatWidgetManager.getChatManager();
console.log(cm.messages);

// Vérifier localStorage
console.log(localStorage.getItem('chat_messages'));

// Vérifier l'ID du conteneur
console.log(document.getElementById('chat-widget-messages'));

// Forcer l'affichage
cm.displayMessages();
```

### Problème 5: Animations saccadées

**Symptôme:** Le panel s'ouvre/ferme avec des saccades

**Causes possibles:**
1. Trop de messages (100+)
2. Animations GPU non activées
3. Performance navigateur

**Solutions:**

```css
/* Forcer GPU acceleration */
.chat-widget-panel {
    transform: translateZ(0);
    will-change: transform, opacity;
}

.chat-message {
    transform: translateZ(0);
}

/* Limiter les messages */
MAX_MESSAGES = 50; // Au lieu de 100
```

### Problème 6: Widget plein écran sur mobile

**Symptôme:** Le panel recouvre tout l'écran sur mobile

**C'est normal!** C'est le design responsif intentionnel.

**Pour modifier:**

```css
/* Dans chat-widget.css, mobile section */
@media (max-width: 480px) {
    .chat-widget-panel {
        /* Passer de 100vw x 100vh à size fixe */
        width: 90vw;    /* Au lieu de 100vw */
        height: 80vh;   /* Au lieu de 100vh */
        bottom: auto;   /* Position différente */
        right: auto;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
    }
}
```

## 🔧 Optimisations

### Optimisation 1: Lazy Loading du Widget

**Problème:** Widget se charge même si pas utilisé

**Solution:**

```javascript
// Dans global.js, au lieu de créer tout de suite
let chatWidgetManager = null;

// Créer seulement au premier clic
document.addEventListener('click', function initWidget(e) {
    if (e.target.closest('#chat-widget-btn') && !chatWidgetManager) {
        import('./modules/ChatWidgetManager.js').then(module => {
            chatWidgetManager = new module.default();
            window.chatWidgetManager = chatWidgetManager;
        });
        document.removeEventListener('click', initWidget);
    }
});
```

### Optimisation 2: Service Worker pour Sync Messages

**Problème:** localStorage n'est pas idéal pour multi-onglets

**Solution:** Ajouter Service Worker avec sync

```javascript
// public/assets/js/service-worker.js
self.addEventListener('sync', event => {
    if (event.tag === 'sync-messages') {
        event.waitUntil(syncMessages());
    }
});

async function syncMessages() {
    const messages = await fetch('/api/messages').then(r => r.json());
    await clients.matchAll().then(clients => {
        clients.forEach(client => {
            client.postMessage({
                type: 'NEW_MESSAGES',
                messages: messages
            });
        });
    });
}

// Dans global.js
navigator.serviceWorker?.ready.then(reg => {
    reg.sync.register('sync-messages');
});
```

### Optimisation 3: Compression Messages

**Problème:** localStorage peut être rempli rapidement

**Solution:** Archiver les anciens messages

```javascript
// Dans ChatManager
archiveOldMessages() {
    if (this.messages.length > this.MAX_MESSAGES) {
        const archived = this.messages.slice(0, -this.MAX_MESSAGES);
        // Sauvegarder en IndexedDB ou serveur
        this.archiveToIndexedDB(archived);
        // Garder seulement les derniers
        this.messages = this.messages.slice(-this.MAX_MESSAGES);
    }
}
```

### Optimisation 4: Debounce du Polling

**Problème:** Polling localStorage trop fréquent (500ms)

**Solution:** Adapter selon l'activité

```javascript
// Dans ChatWidgetManager
let pollInterval = 500;
let lastMessageTime = Date.now();

syncMessages() {
    setInterval(() => {
        const now = Date.now();
        // Si panel fermé et pas d'activité, réduire la fréquence
        if (!this.isOpen && (now - lastMessageTime) > 30000) {
            pollInterval = 5000; // 5 secondes
        } else {
            pollInterval = 500; // 500ms
        }
        this.updateNotificationBadge();
    }, pollInterval);
}
```

### Optimisation 5: Virtual Scrolling pour Beaucoup de Messages

**Problème:** Performance dégradée avec 1000+ messages

**Solution:** Virtualiser le scrolling

```javascript
// Implémenter avec un framework ou custom
class VirtualChatList {
    constructor(container, items) {
        this.container = container;
        this.items = items;
        this.itemHeight = 60; // Approx height
        this.renderVisibleItems();
    }

    renderVisibleItems() {
        const scrollTop = this.container.scrollTop;
        const startIndex = Math.floor(scrollTop / this.itemHeight);
        const endIndex = startIndex + Math.ceil(this.container.clientHeight / this.itemHeight);
        
        // Rendre seulement les messages visibles
        // Les autres sont "virtuels"
    }
}
```

## 📈 Performance Metrics

### Current Performance

```
Initial Load:
├─ CSS: ~2KB (chat-widget.css)
├─ JS: ~8KB (ChatWidgetManager.js)
└─ HTML: ~1KB (widget HTML)

Total: ~11KB

First Paint: <100ms
First Contentful Paint: <200ms
Interaction Ready: <300ms
```

### Optimisation Target

```
CSS: ~1.5KB (-25% minified)
JS: ~6KB (-25% with tree-shaking)
HTML: ~0.8KB (-20% optimized)

Total: ~8KB
```

## 🔐 Sécurité Améliorée

### Content Security Policy (CSP) Header

```javascript
// À ajouter dans app.js ou serveur
const cspHeader = 
    "default-src 'self'; " +
    "script-src 'self'; " +
    "style-src 'self'; " +
    "img-src 'self' data:; " +
    "font-src 'self' https://cdnjs.cloudflare.com; " +
    "connect-src 'self' localhost:*; " +
    "frame-ancestors 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self';";
```

### Validation Avancée du Pseudo

```javascript
// Ajouter vérification de blacklist
const pseudoBlacklist = [
    'admin',
    'root',
    'moderator',
    'system',
    'javascript',
    'onclick',
    '<script>'
];

validatePseudo(pseudo) {
    // Validation existante...
    
    // Ajouter vérification blacklist
    if (pseudoBlacklist.includes(pseudo.toLowerCase())) {
        return 'Ce pseudo est réservé';
    }
    
    return null;
}
```

## 🧪 Tests Automatisés

### Unit Tests (Jest)

```javascript
// __tests__/ChatWidgetManager.test.js
import ChatWidgetManager from '../ChatWidgetManager';

describe('ChatWidgetManager', () => {
    let widget;
    
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="chat-widget-wrapper"></div>
            <button id="chat-widget-btn"></button>
            <!-- ... rest of HTML -->
        `;
        widget = new ChatWidgetManager();
    });

    test('should open panel on button click', () => {
        expect(widget.isOpen).toBe(false);
        widget.openPanel();
        expect(widget.isOpen).toBe(true);
    });

    test('should show pseudo modal if no pseudo', () => {
        localStorage.removeItem('chatPseudo');
        widget.checkAndShowPseudoModal();
        const modal = document.getElementById('chat-widget-pseudo-modal');
        expect(modal.classList.contains('show')).toBe(true);
    });

    test('should validate pseudo', () => {
        expect(widget.chatManager.validatePseudo('a')).toBeTruthy();
        expect(widget.chatManager.validatePseudo('validpseudo')).toBeFalsy();
        expect(widget.chatManager.validatePseudo('a'.repeat(25))).toBeTruthy();
    });
});
```

### E2E Tests (Cypress)

```javascript
// cypress/e2e/chat-widget.cy.js
describe('Chat Widget', () => {
    beforeEach(() => {
        cy.visit('/');
        localStorage.removeItem('chatPseudo');
        localStorage.removeItem('chat_messages');
    });

    it('should open chat on button click', () => {
        cy.get('#chat-widget-btn').click();
        cy.get('#chat-widget-panel').should('have.class', 'open');
    });

    it('should show pseudo modal', () => {
        cy.get('#chat-widget-btn').click();
        cy.get('#chat-widget-pseudo-modal').should('have.class', 'show');
    });

    it('should send message after pseudo confirmation', () => {
        cy.get('#chat-widget-btn').click();
        cy.get('#chat-widget-pseudo-input').type('TestUser');
        cy.get('#chat-widget-pseudo-confirm').click();
        cy.get('#chat-widget-input').type('Hello');
        cy.get('#chat-widget-send').click();
        cy.get('#chat-widget-messages').should('contain', 'Hello');
    });
});
```

## 🎯 Roadmap Future

- [ ] Multi-onglets synchronisation (IndexedDB)
- [ ] Message search et filtrage
- [ ] Upload fichiers (images)
- [ ] Mentions @user
- [ ] Réactions emoji aux messages
- [ ] Typing indicator
- [ ] Message d'erreur système
- [ ] Audio/vidéo chat
- [ ] Backend synchronisation
- [ ] Support webRTC

---

**Dernière mise à jour**: 4 décembre 2025
**Status**: Guide Complet
