---
name: desk-a11y-audit
description: Audite l'accessibilité d'une application de bureau Electron ou Tauri (WCAG 2.2 AA) - scan axe-core dans la fenêtre, passe clavier complète, lecteurs d'écran de l'OS, contraste des thèmes, mise à l'échelle. À utiliser pour une vue, un dialogue, un tableau, un formulaire ou avant une release.
---

# Audit d'accessibilité (bureau)

Adapté de `web-a11y-audit` (CapsuleOS).

## 1. Scan automatisé

Option A, à la main dans les DevTools de la fenêtre (mode dev) : coller le contenu de `node_modules/axe-core/axe.min.js` dans la console (la CSP de dev doit le permettre), puis :

```js
axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag22aa'] }).then((r) => console.table(r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length }))));
```

Option B, automatisée avec Playwright (skill `desk-testing`) et `@axe-core/playwright` :

```js
const { AxeBuilder } = require('@axe-core/playwright');
const results = await new AxeBuilder({ page: win }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
expect(results.violations.filter((v) => ['serious', 'critical'].includes(v.impact))).toEqual([]);
```

- `critical` et `serious` : bloquants.
- Scanner chaque vue principale et chaque état (dialogue ouvert, liste vide, erreur, thème sombre).
- Un scan couvre environ un tiers des critères : la passe manuelle est obligatoire.

## 2. Passe manuelle

1. Tabulation sur toute la vue : ordre logique, focus toujours visible, aucun piège, rien d'invisible mais focusable.
2. Raccourcis clavier : ceux du menu fonctionnent, aucun ne vole une touche nécessaire à la saisie.
3. Dialogues : focus initial, Échap, retour du focus au déclencheur.
4. Tableaux : en-têtes annoncés, tri annoncé, sélection de ligne au clavier.
5. Formulaire soumis vide : erreurs en texte, reliées par `aria-describedby`, focus sur le premier champ en erreur.
6. Contraste de chaque thème (texte, filets de champs, focus, état désactivé lisible).
7. Mise à l'échelle de l'OS 150 % et zoom de la webview 200 % : rien de coupé à la taille de fenêtre par défaut.
8. `prefers-reduced-motion` : plus d'animation.
9. Lecteur d'écran de l'OS sur le parcours principal : NVDA (Windows), VoiceOver (macOS), Orca (Linux). Electron expose l'arbre Chromium ; Tauri dépend de la webview système, tester chaque OS ciblé.

## 3. Compte rendu

Tableau vue / critère / impact / correctif proposé, classé P0 à P2. Déclaration d'accessibilité si le logiciel est concerné (rule `desk-legal`).
