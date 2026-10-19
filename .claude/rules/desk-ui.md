# Interface, accessibilité et finition (bureau)

Accessibilité WCAG 2.2 AA appliquée à une fenêtre d'application. Procédures : skills `desk-design-system`, `desk-ui-states`, `desk-a11y-audit`.

## Tokens (N0, N1, N2)

- N0 : couleurs, typo, espaces, rayons, durées, courbes. Seul endroit des valeurs brutes (`#hex`, `hsl()`, `px`).
- N1 : composants (bouton, champ, tableau, carte, onglet, barre d'outils) en `var(--*)` uniquement, tous les états : repos, survol, focus clavier, actif, sélectionné, désactivé, chargement, vide, erreur.
- N2 : vues, assemblent des N1. Avant toute classe nouvelle : étendre un token ou un composant existant.
- Toute `var(--x)` utilisée est définie. Une seule source par token.

## Fenêtre d'application

- La fenêtre a une taille minimale (`minWidth`/`minHeight`) sous laquelle l'interface reste entière ; au-dessus, mise en page fluide (grilles `minmax`, pas de largeurs figées).
- Fenêtre agrandie jusqu'à 2560 × 1440 : conteneur centré (`margin-inline: auto`), largeur maximale fluide qui grandit avec l'écran au lieu de figer une colonne étroite. Le texte courant garde sa mesure de lecture ; listes, tableaux et tableaux de bord occupent la largeur utile. Contrôle visuel à la taille minimale, 1280, 1920 et 2560 px.
- Thème : suivre l'OS (`prefers-color-scheme`, `nativeTheme`) par défaut, contraste ≥ 4,5:1 (texte) et ≥ 3:1 (composants) dans chaque thème livré.
- Curseurs : `pointer` sur ce qui est cliquable, `text` sur la saisie, `not-allowed` sur le désactivé, `grab`/`grabbing` pour le glisser-déposer.
- Pas de sélection de texte accidentelle sur les contrôles (`user-select: none` sur boutons et barres), mais toujours possible sur les données (tableaux, détails).
- Interdit : la bordure gauche épaisse et colorée comme accent d'une carte, d'un encadré, d'un bandeau ou d'une tuile, à l'écran comme dans les PDF générés. La hiérarchie passe par la taille, la graisse, l'espace, un fond ou un contour complet de 1 px. Seule exception : le filet d'une citation.
- Icônes SVG locales en `currentColor`. Interdit : CDN, police d'icônes distante, emoji comme icône d'interface.
- Aucune ressource distante dans l'interface (police, script, image) : l'application doit s'afficher hors ligne.

## Clavier et focus

- Tout est faisable au clavier, ordre logique, `:focus-visible` toujours visible.
- Raccourcis standards respectés : `CmdOrCtrl+N/O/S/F/Z/Y/W/Q`, `Échap` ferme un panneau et rend le focus au déclencheur, `Entrée` valide un dialogue, `F2` renomme si pertinent. Raccourcis listés dans le menu applicatif (accélérateurs) ou une aide.
- Tableaux de données : navigation aux flèches si la sélection de ligne existe, en-têtes `th scope`, tri annoncé (`aria-sort`).
- Fenêtre modale : focus piégé dans le dialogue, rendu au déclencheur à la fermeture.

## Mouvement et retour

- Le mouvement confirme une action, il ne décore pas. Animer `opacity` et `transform` uniquement, ~150 ms en retour, ~300 ms en entrée.
- `prefers-reduced-motion: reduce` : animations coupées.
- Toute action de plus de 300 ms affiche un état de chargement ; toute action terminée a un retour visible (toast `aria-live="polite"`, ligne mise à jour).
- Action destructive : confirmation explicite qui nomme l'objet (« Supprimer le lot L-2024-031 ? »), ou annulation possible.

## Contenu

- Chaque vue prévoit les états chargement, vide, erreur et succès. Action destructive : dialogue de confirmation de l'application, jamais `confirm()` natif.
- Aucun texte de démo en production : donnée manquante = état vide explicite (« Aucun lot. Créer un lot »).
- Messages d'erreur : ce qui s'est passé, pourquoi si connu, quoi faire. Jamais une pile d'appels brute.
