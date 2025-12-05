# 🪟 Modales (Dialogs)

## Vue d'ensemble

Le système de modales fournit une interface cohérente pour les dialogues, confirmations et formulaires modaux à travers l'application.

## Fichiers clés

```
public/
├── components/
│   └── (modal HTML templates)
├── assets/
│   ├── css/modules/
│   │   └── modals.css           # Modal styles
│   └── js/modules/
│       └── modal/
│           └── universalModal.js # Modal manager
```

## Architecture

Le module `universalModal.js` gère:
- Création et affichage de modales
- Gestion du cycle de vie (open → close)
- Événements utilisateur
- Overlay (backdrop)
- Animation d'entrée/sortie

## Usage Basic

### Ouvrir une modal simple

```javascript
// Importer le gestionnaire
const modal = new UniversalModal();

// Ouvrir une modal
modal.open({
  title: 'Welcome',
  content: '<p>This is a modal!</p>',
  buttons: [
    { text: 'OK', action: () => modal.close() }
  ]
});
```

### Modal avec formulaire

```javascript
const formContent = `
  <form id="eventForm">
    <div class="form-group">
      <label for="title">Title</label>
      <input type="text" id="title" name="title" required>
    </div>
    <div class="form-group">
      <label for="date">Date</label>
      <input type="date" id="date" name="date" required>
    </div>
  </form>
`;

modal.open({
  title: 'Create Event',
  content: formContent,
  buttons: [
    {
      text: 'Save',
      action: () => {
        const form = document.getElementById('eventForm');
        const data = new FormData(form);
        // Handle submission
        modal.close();
      },
      class: 'btn--primary'
    },
    {
      text: 'Cancel',
      action: () => modal.close(),
      class: 'btn--secondary'
    }
  ]
});
```

### Modal avec confirmation

```javascript
modal.open({
  title: 'Confirm Delete',
  content: '<p>Are you sure? This cannot be undone.</p>',
  type: 'warning',
  buttons: [
    {
      text: 'Delete',
      action: () => {
        deleteEvent();
        modal.close();
      },
      class: 'btn--danger'
    },
    {
      text: 'Cancel',
      action: () => modal.close(),
      class: 'btn--secondary'
    }
  ]
});
```

## Configuration Options

```javascript
modal.open({
  // Content
  title: 'Modal Title',
  content: '<p>Modal content (HTML or text)</p>',
  
  // Type (affects styling)
  type: 'default',     // 'default', 'success', 'warning', 'error', 'info'
  
  // Behavior
  closable: true,      // Show X button
  backdrop: true,      // Show overlay
  onClose: () => {},   // Callback when closed
  
  // Buttons
  buttons: [
    {
      text: 'Button Text',
      action: () => {},     // Callback
      class: 'btn--primary' // CSS class
    }
  ],
  
  // Size
  size: 'medium'       // 'small', 'medium', 'large'
});
```

## Modal Types

### Success

```javascript
modal.open({
  type: 'success',
  title: 'Success',
  content: 'Operation completed successfully!',
  buttons: [{ text: 'OK', action: () => modal.close() }]
});
```

### Error

```javascript
modal.open({
  type: 'error',
  title: 'Error',
  content: 'Something went wrong. Please try again.',
  buttons: [{ text: 'OK', action: () => modal.close() }]
});
```

### Warning

```javascript
modal.open({
  type: 'warning',
  title: 'Warning',
  content: 'This action may have consequences.',
  buttons: [
    { text: 'Proceed', action: () => { /* handle */ } },
    { text: 'Cancel', action: () => modal.close() }
  ]
});
```

### Info

```javascript
modal.open({
  type: 'info',
  title: 'Information',
  content: 'Please note this important information.',
  buttons: [{ text: 'OK', action: () => modal.close() }]
});
```

## HTML Structure

### Modal template

```html
<div class="modal-overlay" id="modalOverlay">
  <div class="modal" id="modal">
    <div class="modal__header">
      <h2 class="modal__title" id="modalTitle"></h2>
      <button class="modal__close" id="modalCloseBtn" aria-label="Close">
        &times;
      </button>
    </div>
    
    <div class="modal__body" id="modalContent">
      <!-- Content inserted here -->
    </div>
    
    <div class="modal__footer" id="modalFooter">
      <!-- Buttons inserted here -->
    </div>
  </div>
</div>
```

## CSS Classes

```css
/* Container */
.modal-overlay { }        /* Transparent overlay */
.modal { }                /* Modal box */

/* Sections */
.modal__header { }
.modal__title { }
.modal__close { }         /* X button */
.modal__body { }          /* Content area */
.modal__footer { }        /* Buttons area */

/* Types */
.modal--success { }
.modal--error { }
.modal--warning { }
.modal--info { }

/* Sizes */
.modal--small { }         /* narrow */
.modal--medium { }        /* default */
.modal--large { }         /* wide */

/* States */
.modal--open { }
.modal--closed { }
.modal--loading { }       /* While processing */
```

## Styling

### CSS Example

```css
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  opacity: 0;
  visibility: hidden;
  transition: all var(--transition-normal);
}

.modal-overlay.open {
  opacity: 1;
  visibility: visible;
}

.modal {
  background: var(--color-bg);
  border-radius: var(--border-radius-lg);
  box-shadow: var(--shadow-lg);
  max-width: 600px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  animation: slideIn var(--transition-normal);
}

.modal__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-lg);
  border-bottom: 1px solid var(--color-border);
}

.modal__close {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #666;
}

.modal__close:hover {
  color: var(--color-error);
}

.modal__body {
  padding: var(--spacing-lg);
}

.modal__footer {
  display: flex;
  gap: var(--spacing-md);
  justify-content: flex-end;
  padding: var(--spacing-lg);
  border-top: 1px solid var(--color-border);
}

/* Size variants */
.modal--small { max-width: 400px; }
.modal--large { max-width: 800px; }

/* Type-specific styling */
.modal--success .modal__header {
  background: rgba(39, 174, 96, 0.1);
  border-left: 4px solid var(--color-success);
}

.modal--error .modal__header {
  background: rgba(231, 76, 60, 0.1);
  border-left: 4px solid var(--color-error);
}
```

## Advanced Usage

### Modal chain (sequential modals)

```javascript
function showEventFlow() {
  // Step 1: Choose event type
  modal.open({
    title: 'Create Event',
    content: '<button id="meetingBtn">Meeting</button>',
    buttons: [
      {
        text: 'Next',
        action: () => {
          modal.close();
          showEventDetails(); // Step 2
        }
      }
    ]
  });
}

function showEventDetails() {
  modal.open({
    title: 'Event Details',
    content: '<!-- form here -->',
    buttons: [
      {
        text: 'Create',
        action: () => {
          // Save and close
          modal.close();
        }
      }
    ]
  });
}

showEventFlow();
```

### Modal with loading state

```javascript
async function submitForm() {
  modal.setLoading(true);
  
  try {
    const response = await fetch('/api/agenda/events', {
      method: 'POST',
      body: JSON.stringify(formData)
    });
    
    if (response.ok) {
      modal.showSuccess('Event created!');
      setTimeout(() => modal.close(), 1500);
    }
  } catch (error) {
    modal.showError(error.message);
  } finally {
    modal.setLoading(false);
  }
}
```

### Custom modal styling

```javascript
// Add custom class for special styling
modal.open({
  title: 'Custom Modal',
  content: 'Content',
  className: 'modal--custom-theme',
  buttons: [{ text: 'OK', action: () => modal.close() }]
});
```

```css
/* In your CSS file */
.modal--custom-theme {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.modal--custom-theme .modal__header {
  border-color: rgba(255, 255, 255, 0.2);
}
```

## Accessibility

Modal implementation should include:
- ✅ ARIA labels on buttons and close
- ✅ Keyboard navigation (Tab, Escape to close)
- ✅ Focus management (trap focus within modal)
- ✅ Screen reader announcements
- ✅ Sufficient color contrast

```javascript
// Example with accessibility
<button
  class="modal__close"
  id="modalCloseBtn"
  aria-label="Close dialog"
  type="button"
>
  &times;
</button>
```

## Keyboard Shortcuts

- `Escape` - Close modal
- `Tab` - Navigate between buttons
- `Enter` - Activate focused button
- `Space` - Activate focused button

## Best Practices

- Keep modal content focused and concise
- Use appropriate type (success, error, warning)
- Always provide close button
- Confirm destructive actions
- Don't nest modals (chain instead)
- Disable background scrolling when modal open
- Use `onClose` callback for cleanup

## Testing

### Manual checklist

- [ ] Modal opens with correct content
- [ ] Modal displays correct type styling
- [ ] Buttons work and execute actions
- [ ] Close button works
- [ ] Overlay click closes modal (if enabled)
- [ ] Escape key closes modal
- [ ] Tab navigation works
- [ ] No z-index conflicts with other elements
- [ ] Responsive on mobile
- [ ] No console errors

---

**See also:** [DEVELOPMENT.md](../guides/DEVELOPMENT.md) | [STYLES.md](../guides/STYLES.md)
