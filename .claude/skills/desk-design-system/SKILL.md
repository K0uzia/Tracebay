---
name: desk-design-system
description: Pose ou étend les tokens (couleurs, typo, espaces, rayons, durées) d'une application de bureau, range un style au bon niveau (token, composant, vue), gère les thèmes clair/sombre suivant l'OS, densité, icônes locales, tableaux de données et barres d'outils. À utiliser pour une couleur, un bouton, un tableau, une vue, une icône, une transition ou un problème de mise en page.
---

# Design system (bureau)

Contraintes : rule `desk-ui`. Adapté de `web-design-system` (CapsuleOS).

## 1. Fichier de tokens (N0)

```css
@layer tokens, base, components, views;

@layer tokens {
  :root {
    color-scheme: light dark;
    /* couleurs : rôle, pas teinte */
    --color-bg: hsl(220 20% 98%);
    --color-surface: hsl(0 0% 100%);
    --color-surface-2: hsl(220 16% 94%);
    --color-border: hsl(220 13% 85%);
    --color-text: hsl(220 25% 14%);
    --color-text-muted: hsl(220 10% 40%);   /* ≥ 4,5:1 sur --color-bg */
    --color-accent: hsl(212 80% 42%);
    --color-accent-contrast: hsl(0 0% 100%);
    --color-focus: var(--color-accent);
    --color-danger: hsl(0 70% 45%);
    --color-success: hsl(145 55% 32%);
    --color-selection: hsl(212 80% 42% / 0.12);

    --font-ui: system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif;
    --font-mono: ui-monospace, "Cascadia Code", "DejaVu Sans Mono", monospace;
    --text-xs: 0.75rem; --text-sm: 0.8125rem; --text-md: 0.875rem; --text-lg: 1rem; --text-xl: 1.25rem; --text-2xl: 1.5rem;

    --space-1: 0.25rem; --space-2: 0.5rem; --space-3: 0.75rem; --space-4: 1rem; --space-5: 1.5rem; --space-6: 2rem;
    --radius-sm: 0.25rem; --radius: 0.5rem; --radius-lg: 0.75rem;
    --control-height: 2rem;              /* densité bureau ; 2.5rem en mode tactile */
    --shadow-1: 0 1px 2px hsl(220 30% 10% / 0.08);
    --shadow-2: 0 8px 24px hsl(220 30% 10% / 0.16);
    --duration-fast: 150ms; --duration-base: 250ms; --ease: cubic-bezier(0.2, 0, 0, 1);
    --z-dropdown: 10; --z-dialog: 20; --z-toast: 30;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --color-bg: hsl(220 15% 10%);
      --color-surface: hsl(220 14% 14%);
      --color-surface-2: hsl(220 13% 18%);
      --color-border: hsl(220 10% 28%);
      --color-text: hsl(220 15% 92%);
      --color-text-muted: hsl(220 10% 68%);
      --color-accent: hsl(212 90% 64%);
      --color-accent-contrast: hsl(220 30% 10%);
    }
  }
}
```

Valeurs indicatives : partir de la charte réelle. En dark, ne redéfinir que les couleurs. Interface d'application : texte de base 13 à 14 px (`--text-md`), jamais sous 12 px.

Electron : `nativeTheme.themeSource = 'system'` pour que `prefers-color-scheme` suive l'OS ; une préférence utilisateur (clair, sombre, système) passe par `nativeTheme.themeSource`, pas par une classe CSS en double.

## 2. Ranger un style

| Niveau | Contient | Règle |
|--------|----------|-------|
| N0 tokens | valeurs brutes | seul endroit des couleurs et `px` |
| N1 composants | bouton, champ, select, tableau, onglets, barre d'outils, dialogue, toast, badge | `var(--*)` uniquement, tous les états |
| N2 vues | écrans (lots, agenda, inventaire) | assemblent des N1, aucun style de composant redéfini |

Avant d'écrire une classe : un token ou un composant existant peut-il s'étendre ? Si oui, l'étendre.

## 3. Composants propres au bureau

- **Tableau de données** : en-tête collant (`position: sticky`), lignes de hauteur `--control-height` + `--space-2`, survol et sélection distincts (`--color-selection`), colonnes numériques alignées à droite en `font-variant-numeric: tabular-nums`, tri annoncé (`aria-sort`).
- **Barre d'outils** : `role="toolbar"`, boutons d'icône avec nom accessible et infobulle, séparateurs visuels.
- **Dialogue** : élément `dialog` + `showModal()`, largeur max ~32rem pour un formulaire, actions en bas à droite (principale à droite sur Windows/Linux ; respecter l'ordre de l'OS si on cible macOS).
- **Toast** : `aria-live="polite"`, 4 à 6 s, action « Annuler » quand c'est possible.
- **Bordures** : 1 px pour séparer, 2 px pour le focus et l'état actif. Pas de bordure colorée décorative.

## 4. Icônes

1. Nommer le sens (« imprimer », « archive »), pas la forme.
2. Bibliothèque locale du projet (Font Awesome Free, Lucide) copiée dans le paquet, rendue en SVG `currentColor`.
3. Tailles : 16 px dans un tableau ou un champ, 20 px en barre d'outils, 24 px en navigation.
4. Aucune icône ne porte ce sens : petit SVG maison, même style.

Icônes de l'application (installeur, barre des tâches) : skill `desk-release`.

## 5. Mise en page et contrôle

1. Taille minimale de fenêtre (ex. 960×600) : tout reste accessible ; au-dessus, grilles `minmax`/`auto-fit`.
2. Tester à la taille minimale, en plein écran 1920×1080, à 125 % et 150 % de mise à l'échelle de l'OS, et zoom de la webview (`CmdOrCtrl+=`).
3. Panneaux redimensionnables : largeur mémorisée en préférence.
4. Mesurer les alignements (DevTools), ne pas deviner.
