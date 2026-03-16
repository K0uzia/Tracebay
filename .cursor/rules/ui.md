# Règles CSS / UI pour Cursor

Guide pour l’IA : appliquer ces règles systématiquement. Priorité : lisibilité et accessibilité > esthétique. Cible Lighthouse : perf >90, access >95.

---

## 1. Curseur (cursor)

- **Toujours** `cursor: pointer` sur les liens `<a>`, boutons et éléments cliquables.
- `cursor: text` pour `input` / `textarea`.
- `cursor: default` sur `body` et éléments non interactifs.
- `cursor: not-allowed` pour états désactivés (ex. `button[disabled]`).
- `cursor: move` ou `grab` / `grabbing` pour drag & drop.
- Limiter les types de curseurs : 4–5 max par page pour une UX cohérente.
- Curseur personnalisé : `cursor: url('icon.png') 16 16, auto;` (icône <32px, WebP/PNG optimisé).
- Sur mobile/tactile : ne pas se reposer uniquement sur le hover pour le feedback.

---

## 2. Design UI – Principes généraux

- **Mobile-first** : commencer par `@media (max-width: 480px)` puis élargir.
- **Espacement** : multiples de 4px (4, 8, 12, 16, 24, 32, 40, 48, 64). Utiliser des variables (ex. `--unit`, `--unit-2`).
- **Bordures** : 1px solid pour séparation discrète ; 2px pour focus/état actif. **Interdit** : bordure colorée décorative (ex. `border-left: 4px solid var(--bleu1)` sur un panneau/carte). Ne pas utiliser de bordure en couleur de marque pour délimiter des blocs.
- **Ombres** : progresser du léger au marqué (ex. `0 1px 3px rgba(0,0,0,0.1)` → `0 10px 25px rgba(0,0,0,0.15)`).
- **Coins** : `border-radius` 8px (small), 12px (default), 24px (large).
- **Interlignes** : `line-height: 1.5` (texte), `1.7` (corps long).

---

## 3. Lisibilité et bonnes pratiques

- **Police** : `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` (natif, performant).
- **Tailles de texte** : 12px (small), 14px (body), 16px (h3), 20px (h2), 32px (h1). **Jamais <12px.**
- **Contraste** : minimum 4.5:1 (WCAG AA). Vérifier avec webaim.org/contrastchecker.
- **Couleurs** : préférer HSL pour cohérence (ex. `hsl(210 20% 50%)`). Éviter les noms de couleurs hex génériques.
- **Focus visible** : `outline: 2px solid [accent]; outline-offset: 2px` (ou équivalent avec `:focus-visible`).
- **Hover** : transitions courtes (ex. `0.15s ease`), effets discrets (scale 1.02, opacity 0.95).

---

## 4. Optimisation performance

- **Reset** : minimal (modern-normalize ou `@layer base`).
- **`!important`** : à éviter sauf urgence ; si utilisé, commenter la raison.
- **Images** : `width`/`height` explicites, `loading="lazy"`, `sizes="(max-width:480px) 100vw, 50vw"` selon le layout.
- **Animations** : privilégier `transform` et `opacity` (GPU). Éviter le layout thrashing (animations sur width/height).
- **Critical CSS** : inline <1KB si besoin ; le reste en async (ex. `rel="preload"`).
- **Build** : minification + PurgeCSS (ou équivalent) pour retirer les styles inutilisés.

---

## 5. Tailles et grille

- **Conteneurs** : `max-width: 1200px`, `padding: 0 clamp(1.5rem, 5vw, 6rem)`.
- **Cartes** : `min-height: 200px`, `padding: 1.5rem`.
- **Boutons** : `min-height: 44px` (cible tactile iOS), `padding: 0 1.5rem`.
- **Inputs** : `height: 48px`, `padding: 0 1rem`.
- **Grille** : CSS Grid ou Flexbox. `gap`: 1rem (small), 1.5rem (default), 2rem (large).
- **Icônes** : 20×20px (small), 24×24 (default), 32×32 (large).

---

## 6. Accessibilité et UX

- **ARIA** : `role="button"` sur les `div` cliquables ; états `aria-expanded` / `aria-pressed` si pertinent.
- **Clavier** : styles de focus sur `:focus-visible` uniquement (pas sur `:focus` au clic souris).
- **Réduction de mouvement** : `@media (prefers-reduced-motion: reduce) { animation: none; transition: none; }`.
- **Z-index** : échelle cohérente (ex. 10 dropdown, 20 modal, 30 toast, 40 overlay).

---

## 7. Structure CSS recommandée

Utiliser des couches pour base / composants / utilitaires :

```css
@layer base, components, utilities;

@layer base {
  :root {
    --bg: hsl(0 0% 100%);
    --text: hsl(210 20% 20%);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: hsl(0 0% 10%);
      --text: hsl(0 0% 95%);
    }
  }
}

@layer components {
  .btn {
    cursor: pointer;
    transition: transform 0.15s ease;
  }
  .btn:hover {
    transform: scale(1.02);
  }
}
```

---

## 8. Vision produit 2026 (contexte)

- UI professionnelle : minimaliste, claire, cohérente.
- Micro-interactions : feedback immédiat, animations légères, charge cognitive faible.
- Responsive mobile-first, grilles flexibles, cibles tactiles suffisantes.
- Accessibilité WCAG 2.2+ : contraste, clavier, alternatives, messages d’erreur explicites.
- Palette limitée : 3 couleurs max (neutres + accent) ; variables d’espacement et typo.
- Structure : fil d’Ariane, CTA visibles, formulaires progressifs.
- Code propre, modulaire, testable. Priorité à l’UX éthique (transparence, privacy-first).
