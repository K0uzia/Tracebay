# 🎨 Conventions CSS

## Architecture générale

```
public/assets/css/
├── global.css              # Imports de tous les modules
├── default/
│   ├── normalize.css       # Reset browser styles
│   ├── variables.css       # CSS custom properties
│   └── section.css         # Styles HTML base
└── modules/
    ├── home.css            # Page home
    ├── agenda.css          # Calendar
    ├── chat-widget.css     # Chat
    ├── modal.css           # Dialogs
    └── ...
```

## Variables CSS (default/variables.css)

```css
:root {
  /* Colors */
  --color-primary: #3788d8;
  --color-secondary: #2c3e50;
  --color-success: #27ae60;
  --color-warning: #f39c12;
  --color-error: #e74c3c;
  
  --color-bg: #ffffff;
  --color-text: #333333;
  --color-border: #e0e0e0;
  
  /* Typography */
  --font-family: 'Segoe UI', Tahoma, Geneva, sans-serif;
  --font-size-base: 14px;
  --font-size-lg: 18px;
  --font-size-sm: 12px;
  --font-size-h1: 32px;
  --font-size-h2: 24px;
  
  --line-height-base: 1.5;
  --font-weight-normal: 400;
  --font-weight-bold: 600;
  
  /* Spacing */
  --spacing-unit: 8px;
  --spacing-xs: calc(var(--spacing-unit) * 0.5);
  --spacing-sm: var(--spacing-unit);
  --spacing-md: calc(var(--spacing-unit) * 2);
  --spacing-lg: calc(var(--spacing-unit) * 3);
  --spacing-xl: calc(var(--spacing-unit) * 4);
  
  /* Shadows */
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.1);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.15);
  --shadow-lg: 0 10px 20px rgba(0, 0, 0, 0.2);
  
  /* Borders */
  --border-radius: 4px;
  --border-radius-lg: 8px;
  
  /* Transitions */
  --transition-fast: 150ms ease-in-out;
  --transition-normal: 250ms ease-in-out;
  --transition-slow: 350ms ease-in-out;
}
```

## BEM Naming Convention

**B**lock - **E**lement - **M**odifier

```css
/* Block - Main component */
.event-card {
  padding: var(--spacing-md);
  background: var(--color-bg);
  border-radius: var(--border-radius);
}

/* Element - Part of block */
.event-card__title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-bold);
  margin-bottom: var(--spacing-sm);
}

.event-card__date {
  font-size: var(--font-size-sm);
  color: #666;
}

/* Modifier - Variant of block */
.event-card--active {
  border-color: var(--color-primary);
  background: rgba(55, 136, 216, 0.05);
}

.event-card--error {
  border-color: var(--color-error);
}

/* Usage */
<div class="event-card event-card--active">
  <h3 class="event-card__title">Meeting</h3>
  <p class="event-card__date">2024-01-15</p>
</div>
```

## Responsive Design

```css
/* Mobile-first approach */
.container {
  width: 100%;
  padding: var(--spacing-md);
}

/* Tablet and above */
@media (min-width: 768px) {
  .container {
    max-width: 750px;
    margin: 0 auto;
  }
}

/* Desktop */
@media (min-width: 1024px) {
  .container {
    max-width: 960px;
  }
}

/* Large desktop */
@media (min-width: 1216px) {
  .container {
    max-width: 1152px;
  }
}
```

### Breakpoints

```css
--bs-mobile: 0px;      /* Default */
--bs-tablet: 768px;    /* min-width: 768px */
--bs-desktop: 1024px;  /* min-width: 1024px */
--bs-large: 1216px;    /* min-width: 1216px */
```

## Flexbox Layout

```css
/* Flex container */
.flex {
  display: flex;
  gap: var(--spacing-md);
}

/* Row direction (default) */
.flex--row {
  flex-direction: row;
}

/* Column direction */
.flex--column {
  flex-direction: column;
}

/* Center content */
.flex--center {
  justify-content: center;
  align-items: center;
}

/* Space between */
.flex--space-between {
  justify-content: space-between;
  align-items: center;
}

/* Wrap items */
.flex--wrap {
  flex-wrap: wrap;
}

/* Gap variations */
.flex--gap-sm { gap: var(--spacing-sm); }
.flex--gap-md { gap: var(--spacing-md); }
.flex--gap-lg { gap: var(--spacing-lg); }
```

## Grid Layout

```css
/* Simple grid */
.grid {
  display: grid;
  gap: var(--spacing-md);
}

/* 2-column */
.grid--2col {
  grid-template-columns: repeat(2, 1fr);
}

/* 3-column */
.grid--3col {
  grid-template-columns: repeat(3, 1fr);
}

/* Responsive */
.grid--auto {
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
}

/* Gap variations */
.grid--tight { gap: var(--spacing-sm); }
.grid--loose { gap: var(--spacing-lg); }
```

## Typography

```css
/* Headings */
h1, .h1 {
  font-size: var(--font-size-h1);
  font-weight: var(--font-weight-bold);
  margin-bottom: var(--spacing-md);
  line-height: 1.2;
}

h2, .h2 {
  font-size: var(--font-size-h2);
  font-weight: var(--font-weight-bold);
  margin-bottom: var(--spacing-sm);
}

/* Body text */
body {
  font-family: var(--font-family);
  font-size: var(--font-size-base);
  line-height: var(--line-height-base);
  color: var(--color-text);
}

/* Emphasis */
strong, .bold {
  font-weight: var(--font-weight-bold);
}

em, .italic {
  font-style: italic;
}

/* Text utilities */
.text-center { text-align: center; }
.text-right { text-align: right; }
.text-muted { color: #666; }
.text-small { font-size: var(--font-size-sm); }
```

## Buttons

```css
/* Base button */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  
  padding: var(--spacing-sm) var(--spacing-md);
  border: 1px solid transparent;
  border-radius: var(--border-radius);
  
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-bold);
  text-decoration: none;
  cursor: pointer;
  
  transition: all var(--transition-fast);
}

/* Primary button */
.btn--primary {
  background: var(--color-primary);
  color: white;
}

.btn--primary:hover {
  opacity: 0.9;
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

/* Secondary button */
.btn--secondary {
  background: transparent;
  color: var(--color-primary);
  border-color: var(--color-primary);
}

.btn--secondary:hover {
  background: var(--color-primary);
  color: white;
}

/* Sizes */
.btn--sm {
  padding: var(--spacing-xs) var(--spacing-sm);
  font-size: var(--font-size-sm);
}

.btn--lg {
  padding: var(--spacing-md) var(--spacing-lg);
  font-size: var(--font-size-lg);
}

/* Full width */
.btn--full {
  width: 100%;
}
```

## Forms

```css
/* Input fields */
input[type="text"],
input[type="email"],
input[type="date"],
textarea,
select {
  width: 100%;
  padding: var(--spacing-sm);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  font-family: var(--font-family);
  font-size: var(--font-size-base);
  
  transition: border-color var(--transition-fast);
}

input:focus,
textarea:focus,
select:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px rgba(55, 136, 216, 0.1);
}

/* Form group */
.form-group {
  margin-bottom: var(--spacing-md);
}

.form-group label {
  display: block;
  margin-bottom: var(--spacing-xs);
  font-weight: var(--font-weight-bold);
  font-size: var(--font-size-sm);
}

/* Help text */
.form-text {
  font-size: var(--font-size-sm);
  color: #666;
  margin-top: var(--spacing-xs);
}

/* Error state */
input.error,
textarea.error {
  border-color: var(--color-error);
}

.form-error {
  color: var(--color-error);
  font-size: var(--font-size-sm);
  margin-top: var(--spacing-xs);
}
```

## Utilities

```css
/* Margin utilities */
.m-0 { margin: 0; }
.mt-sm { margin-top: var(--spacing-sm); }
.mt-md { margin-top: var(--spacing-md); }
.mb-sm { margin-bottom: var(--spacing-sm); }
.mb-md { margin-bottom: var(--spacing-md); }

/* Padding utilities */
.p-0 { padding: 0; }
.p-sm { padding: var(--spacing-sm); }
.p-md { padding: var(--spacing-md); }
.px-md { padding-left: var(--spacing-md); padding-right: var(--spacing-md); }
.py-md { padding-top: var(--spacing-md); padding-bottom: var(--spacing-md); }

/* Display utilities */
.hidden { display: none !important; }
.visible { display: block !important; }
.d-flex { display: flex; }
.d-grid { display: grid; }

/* Opacity */
.opacity-50 { opacity: 0.5; }
.opacity-75 { opacity: 0.75; }

/* Cursor */
.cursor-pointer { cursor: pointer; }
.cursor-disabled { cursor: not-allowed; opacity: 0.5; }
```

## Dark Mode Support

```css
/* Light mode (default) */
:root {
  --color-bg: #ffffff;
  --color-text: #333333;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: #1a1a1a;
    --color-text: #f0f0f0;
  }
}
```

## Animations

```css
/* Fade in */
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.fade-in {
  animation: fadeIn var(--transition-normal);
}

/* Slide in */
@keyframes slideInLeft {
  from {
    opacity: 0;
    transform: translateX(-20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

.slide-in {
  animation: slideInLeft var(--transition-normal);
}

/* Pulse */
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.pulse {
  animation: pulse 2s ease-in-out infinite;
}
```

## Performance Tips

```css
/* ✅ DO: Use CSS variables for consistency */
.button {
  color: var(--color-primary);
}

/* ❌ DON'T: Hardcode colors */
.button {
  color: #3788d8;
}

/* ✅ DO: Use shorthand */
.box {
  margin: 10px;
  padding: 10px;
}

/* ❌ DON'T: Use longhand when not needed */
.box {
  margin-top: 10px;
  margin-right: 10px;
  margin-bottom: 10px;
  margin-left: 10px;
}

/* ✅ DO: Group related properties */
.card {
  /* Layout */
  display: flex;
  flex-direction: column;
  
  /* Spacing */
  padding: var(--spacing-md);
  margin-bottom: var(--spacing-lg);
  
  /* Appearance */
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
}

/* ✅ DO: Minimize specificity */
.button { }        /* Good */
.menu .button { }  /* Better */
div.menu.active button.button { } /* Avoid */
```

---

**Questions?** Check [DEVELOPMENT.md](./DEVELOPMENT.md) or the CSS files in `public/assets/css/`
