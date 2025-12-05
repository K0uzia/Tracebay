# 💬 Chat Widget

## Vue d'ensemble

Le chat widget est un composant intégré permettant la communication en temps réel. Il peut être intégré dans n'importe quelle page.

## Fichiers clés

```
public/
├── components/
│   └── chat-widget.html         # Widget HTML
├── assets/
│   ├── css/modules/
│   │   └── chat-widget.css      # Widget styles
│   └── js/modules/
│       └── chat/
│           ├── ChatManager.js           # Manager principal
│           ├── ChatWidgetManager.js     # DOM management
│           ├── ChatSecurityManager.js   # Security & validation
│           └── config/
│               └── ChatSecurityConfig.js # Configuration

docs/
├── CHAT-WIDGET-EVENTS.md        # Events reference
└── GUIDE-DEV-CHAT-WIDGET.md     # Developer guide
```

## Architecture

```
┌──────────────────────────────┐
│    Chat Widget UI            │
│  (chat-widget.html)          │
│  - Message list              │
│  - Input field               │
│  - Send button               │
└─────────────┬────────────────┘
              │
┌─────────────▼────────────────┐
│  ChatWidgetManager.js        │
│  - DOM manipulation          │
│  - Event listeners           │
│  - UI updates                │
└─────────────┬────────────────┘
              │
┌─────────────▼────────────────┐
│  ChatManager.js              │
│  - Message handling          │
│  - State management          │
│  - API communication         │
└─────────────┬────────────────┘
              │
┌─────────────▼────────────────┐
│  ChatSecurityManager.js      │
│  - Input validation          │
│  - XSS prevention            │
│  - Sanitization              │
└─────────────┬────────────────┘
              │
         HTTP REST API
         (Backend)
```

## Basic Usage

### Initialiser le widget

```javascript
// Inclure le script
<script src="/assets/js/modules/chat/ChatManager.js"></script>
<script src="/assets/js/modules/chat/ChatWidgetManager.js"></script>

// Initialiser
const chatManager = new ChatManager();
const chatWidget = new ChatWidgetManager(chatManager);

// Optionnel: charger les anciens messages
chatManager.loadHistory();
```

### Inclure dans une page

```html
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="/assets/css/modules/chat-widget.css">
</head>
<body>
  <!-- Votre contenu -->
  
  <!-- Widget chat -->
  <div id="chatWidget"></div>
  
  <script src="/assets/js/modules/chat/ChatManager.js"></script>
  <script src="/assets/js/modules/chat/ChatWidgetManager.js"></script>
  <script>
    const chatManager = new ChatManager();
    new ChatWidgetManager(chatManager);
  </script>
</body>
</html>
```

## HTML Structure

### Widget template

```html
<div class="chat-widget">
  <!-- Header -->
  <div class="chat-widget__header">
    <h3 class="chat-widget__title">Chat</h3>
    <button class="chat-widget__minimize" aria-label="Minimize">−</button>
    <button class="chat-widget__close" aria-label="Close">×</button>
  </div>
  
  <!-- Messages area -->
  <div class="chat-widget__messages" id="messagesContainer">
    <!-- Messages inserted here -->
  </div>
  
  <!-- Input area -->
  <div class="chat-widget__input-area">
    <textarea
      id="messageInput"
      placeholder="Type a message..."
      class="chat-widget__input"
      rows="2"
    ></textarea>
    <button id="sendBtn" class="chat-widget__send">
      Send
    </button>
  </div>
</div>
```

### Message structure

```html
<!-- User message -->
<div class="chat-widget__message chat-widget__message--user">
  <div class="chat-widget__message-content">
    <p>User message content</p>
  </div>
  <span class="chat-widget__timestamp">10:30 AM</span>
</div>

<!-- Bot/System message -->
<div class="chat-widget__message chat-widget__message--bot">
  <div class="chat-widget__message-content">
    <p>Bot response</p>
  </div>
  <span class="chat-widget__timestamp">10:31 AM</span>
</div>
```

## CSS Classes

```css
/* Container */
.chat-widget { }
.chat-widget--open { }
.chat-widget--minimized { }
.chat-widget--dark { }      /* Dark theme */

/* Header */
.chat-widget__header { }
.chat-widget__title { }
.chat-widget__minimize { }
.chat-widget__close { }

/* Messages */
.chat-widget__messages { }
.chat-widget__message { }
.chat-widget__message--user { }     /* Right-aligned */
.chat-widget__message--bot { }      /* Left-aligned */
.chat-widget__message--system { }   /* Centered, subtle */
.chat-widget__message-content { }
.chat-widget__timestamp { }

/* Input */
.chat-widget__input-area { }
.chat-widget__input { }
.chat-widget__send { }
.chat-widget__send--disabled { }

/* Indicators */
.chat-widget__typing { }            /* "..." animation */
.chat-widget__status { }            /* Online/offline */
.chat-widget__unread-badge { }      /* Unread count */
```

## API Integration

### Configuration

```javascript
// public/assets/js/config/ChatSecurityConfig.js
const ChatSecurityConfig = {
  // API endpoint
  apiEndpoint: '/api/chat',
  
  // Max message length
  maxMessageLength: 1000,
  
  // Rate limiting
  rateLimit: {
    maxMessages: 10,      // Max messages per
    timePeriod: 60000     // 60 seconds
  },
  
  // Validation rules
  validation: {
    allowHtml: false,     // Don't allow HTML
    allowUrls: true,      // Allow URLs
    sanitizeInput: true   // Clean user input
  }
};
```

### Envoyer un message

```javascript
async function sendMessage(text) {
  // Validate
  const errors = validateMessage(text);
  if (errors.length > 0) {
    showError(errors[0]);
    return;
  }
  
  // Send
  try {
    const response = await fetch('/api/chat/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: text,
        timestamp: new Date().toISOString()
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      addMessageToUI(result.data);
    } else {
      showError(result.message);
    }
  } catch (error) {
    showError('Failed to send message');
  }
}
```

### Récupérer l'historique

```javascript
async function loadHistory(limit = 50) {
  const response = await fetch(`/api/chat/messages?limit=${limit}`);
  const result = await response.json();
  
  if (result.success) {
    result.data.forEach(msg => addMessageToUI(msg));
    scrollToBottom();
  }
}
```

## Events

Le widget émet des événements pour intégration externe:

```javascript
// Message sent
document.addEventListener('chat:messageSent', (event) => {
  console.log('Message sent:', event.detail.message);
});

// Message received
document.addEventListener('chat:messageReceived', (event) => {
  console.log('Message received:', event.detail.message);
});

// Widget opened
document.addEventListener('chat:opened', () => {
  console.log('Chat widget opened');
});

// Widget closed
document.addEventListener('chat:closed', () => {
  console.log('Chat widget closed');
});

// Error occurred
document.addEventListener('chat:error', (event) => {
  console.error('Chat error:', event.detail.error);
});
```

## Security

### Input Validation

```javascript
function validateMessage(text) {
  const errors = [];
  
  if (!text || text.trim() === '') {
    errors.push('Message cannot be empty');
  }
  
  if (text.length > ChatSecurityConfig.maxMessageLength) {
    errors.push(`Message too long (max ${ChatSecurityConfig.maxMessageLength} chars)`);
  }
  
  if (isSpam(text)) {
    errors.push('Message looks like spam');
  }
  
  return errors;
}
```

### XSS Prevention

```javascript
// Sanitize HTML
function sanitizeHTML(text) {
  const element = document.createElement('div');
  element.textContent = text;  // Using textContent prevents script execution
  return element.innerHTML;
}

// Escape special characters
function escapeHTML(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}
```

## Styling Example

```css
.chat-widget {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 350px;
  max-height: 500px;
  display: flex;
  flex-direction: column;
  background: white;
  border-radius: var(--border-radius-lg);
  box-shadow: var(--shadow-lg);
  font-family: var(--font-family);
  z-index: 999;
}

.chat-widget__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-md);
  background: var(--color-primary);
  color: white;
  border-radius: var(--border-radius-lg) var(--border-radius-lg) 0 0;
}

.chat-widget__messages {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-md);
  background: #f9f9f9;
}

.chat-widget__message {
  margin-bottom: var(--spacing-md);
  display: flex;
  align-items: flex-end;
  gap: var(--spacing-sm);
}

.chat-widget__message--user {
  justify-content: flex-end;
}

.chat-widget__message-content {
  background: var(--color-primary);
  color: white;
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--border-radius);
  max-width: 70%;
  word-wrap: break-word;
}

.chat-widget__message--bot .chat-widget__message-content {
  background: #e0e0e0;
  color: #333;
}

.chat-widget__input-area {
  display: flex;
  gap: var(--spacing-sm);
  padding: var(--spacing-md);
  border-top: 1px solid var(--color-border);
}

.chat-widget__input {
  flex: 1;
  padding: var(--spacing-sm);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  font-family: var(--font-family);
  resize: vertical;
}

.chat-widget__send {
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: var(--border-radius);
  cursor: pointer;
  font-weight: var(--font-weight-bold);
}

.chat-widget__send:hover {
  opacity: 0.9;
}

.chat-widget__send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Minimized state */
.chat-widget--minimized .chat-widget__messages,
.chat-widget--minimized .chat-widget__input-area {
  display: none;
}
```

## Features

- ✅ Real-time message display
- ✅ Message history
- ✅ Auto-scroll to latest
- ✅ Typing indicators
- ✅ Online/offline status
- ✅ Unread count badge
- ✅ Minimize/expand
- ✅ Dark theme support
- ✅ Mobile responsive
- ✅ XSS protection
- ✅ Input validation
- ✅ Rate limiting
- ✅ Emoji support
- ✅ Link preview

## Performance Tips

- Limit message history loaded (pagination)
- Virtual scrolling for large message lists
- Debounce typing indicators
- Cache user avatars
- Compress images
- Minimize DOM updates

## Testing

### Manual checklist

- [ ] Widget opens/closes
- [ ] Messages send successfully
- [ ] Messages display in correct order
- [ ] Timestamps are correct
- [ ] Auto-scroll works
- [ ] Minimized state toggles
- [ ] HTML is escaped (no XSS)
- [ ] Rate limiting works
- [ ] Error messages display
- [ ] Responsive on mobile
- [ ] No console errors

---

**See also:** [CHAT-WIDGET-EVENTS.md](../../CHAT-WIDGET-EVENTS.md) | [GUIDE-DEV-CHAT-WIDGET.md](../../GUIDE-DEV-CHAT-WIDGET.md) | [ChatSecurityConfig.js](../../assets/js/config/ChatSecurityConfig.js)
