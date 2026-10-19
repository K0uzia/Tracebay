---
name: desk-ui-states
description: Spécifie et vérifie les états et transitions d'un composant ou d'une vue d'application de bureau (dialogue, tableau, formulaire, onglets, liste filtrée, panneau latéral, fenêtre secondaire) - matrice état/action/état, cohérence entre l'état et l'affichage, chargement, hors ligne, rafraîchissements parasites, preuves avant/après. À utiliser pour créer, déboguer ou tester une interaction.
---

# États d'interface

Adapté de `web-ui-states` (CapsuleOS).

## 1. Le principe

- **M** : l'état (données chargées, sélection, filtre, vue active, erreurs, connexion).
- **V** : ce qui est affiché (DOM, ARIA, titre de fenêtre, badge, menu).
- Correct : après chaque action terminée, `V = projection(M)`. Incorrect : V périmée après une action, ou V qui change alors que M n'a pas changé.

## 2. Matrice avant de coder

| État de départ | Action (souris, clavier, système) | État d'arrivée | Ce qui change à l'écran | ARIA et focus |
|----------------|-----------------------------------|----------------|-------------------------|---------------|
| liste chargée | `CmdOrCtrl+N` ou bouton « Nouveau » | dialogue ouvert | dialogue modal | focus sur le 1er champ |
| dialogue ouvert | Échap | liste | dialogue fermé, rien créé | focus rendu au déclencheur |
| formulaire prêt | Enregistrer, invalide | erreur | messages sous les champs | `aria-invalid`, focus 1er champ en erreur |
| formulaire prêt | Enregistrer, valide | enregistrement | bouton désactivé, indicateur | `aria-busy` |
| enregistrement | réponse OK | liste | ligne ajoutée et sélectionnée, toast | annonce `aria-live` |
| enregistrement | réponse erreur | formulaire prêt | message d'erreur, saisie conservée | focus sur le message |
| toute vue | perte du serveur (mode serveur) | dégradé | bandeau « Hors connexion », actions d'écriture désactivées | annonce |

Couvrir aussi : vide, chargement initial, liste très longue, texte très long, fenêtre à sa taille minimale, double clic rapide (pas de double création).

## 3. Rafraîchissements admis

Une mise à jour de V est légitime seulement si :

1. l'utilisateur vient d'agir ;
2. M a changé ailleurs (autre fenêtre via IPC, événement serveur, fichier modifié) ;
3. la navigation (vue active) a changé.

Interdit : re-rendre toute la vue au `focus` de la fenêtre sans changement de M ; mettre à jour une seule des surfaces qui affichent la même donnée (compteur de l'en-tête resté faux) ; perdre la sélection ou le défilement après une sauvegarde ; dialogues bloquants `alert()`/`confirm()`.

## 4. Mise en œuvre

- Une fonction `render(state)` par vue, appelée après chaque mutation ; pas de modification DOM éparpillée.
- Délégation d'événements, initialisation une seule fois (`data-ready`), écouteurs IPC retirés quand la vue est détruite (fonction de désabonnement renvoyée par `api.on`).
- L'état d'ouverture vit dans l'attribut (`aria-expanded`, `hidden`, `open` du `dialog`) ; le CSS le lit.
- Actions asynchrones : bouton désactivé pendant l'action, résultat appliqué seulement si la vue est toujours celle qui l'a demandé.

## 5. Preuve

Pour chaque transition prioritaire : capture avant/après, ou test Playwright (skill `desk-testing`) :

```js
await win.keyboard.press('Control+N');
await expect(win.getByRole('dialog')).toBeVisible();
await win.keyboard.press('Escape');
await expect(win.getByRole('button', { name: 'Nouveau' })).toBeFocused();
```

Écarts classés P0 (état faux, perte de saisie, double création), P1 (glitch sans état final faux), P2 (finition).
