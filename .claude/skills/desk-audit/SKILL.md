---
name: desk-audit
description: Choisit et lance les contrôles adaptés à un changement d'application de bureau Electron ou Tauri (sécurité des fenêtres et de l'IPC, dépôt, dépendances, tests, paquet), puis la recette complète avant release. À utiliser avant de déclarer une tâche terminée, avant un build de production, ou pour auditer une application existante.
---

# Audit et recette d'une application de bureau

Principe : contrôle minimal du périmètre touché pendant le travail, recette complète avant release. Aucune tâche n'est terminée tant qu'un contrôle applicable est rouge ; ne jamais affaiblir un contrôle pour le faire passer.

## Scripts (sans dépendance, depuis la racine du dépôt)

| Script | Contrôle |
|--------|----------|
| `node .claude/skills/desk-audit/scripts/check-desktop.mjs [dossier]` | Electron : `webPreferences` dangereuses, preload qui expose `ipcRenderer`/Node, `ipcMain.on` sans validation apparente, `shell.openExternal` sans filtre, `loadURL` distant, absence de CSP, `eval`/`new Function`/`innerHTML` interpolé, `localStorage` de jetons. Tauri : CSP nulle, `devtools`, capacités larges (`*:default`, `fs` sans portée), `dangerous*` |
| `node .claude/skills/desk-audit/scripts/check-repo.mjs` | secrets et fichiers sensibles suivis par Git (certificats de signature compris), `.gitignore`, verrouillage des dépendances |

## Contrôle par type de changement

| Changement | Contrôle minimal |
|------------|------------------|
| Vue, composant, CSS | lancer l'app, parcours touché, console du renderer vide ; skill `desk-a11y-audit` §1 sur la vue |
| Composant interactif (dialogue, tableau, formulaire, filtre) | matrice du skill `desk-ui-states` au clavier et à la souris |
| Preload, IPC, commande Tauri | `check-desktop.mjs` + test du handler (skill `desk-testing`) + skill `desk-ipc` |
| `BrowserWindow`, CSP, navigation, protocole, capacités Tauri | `check-desktop.mjs` + skill `desk-security` |
| Schéma de base, migration, stockage | skill `desk-local-data` : migration sur une copie de base réelle + sauvegarde/restauration testée |
| Mode serveur / local | skill `desk-dual-mode` : la même suite de parcours dans chaque mode |
| Dépendance, `.env`, config de build | `check-repo.mjs` + `npm audit --omit=dev` (+ `cargo audit`) |
| Packaging, signature, mise à jour | skill `desk-release` |
| Documentation seule | aucun |

## Recette avant release

1. `npm ci` puis lint et tests (`npm run lint:check`, `npm test`) verts, sans nouvel avertissement. Tauri : `cargo clippy -- -D warnings` et `cargo test`.
2. `node .claude/skills/desk-audit/scripts/check-repo.mjs` et `npm audit --omit=dev` : aucune vulnérabilité `high`/`critical` non justifiée.
3. `node .claude/skills/desk-audit/scripts/check-desktop.mjs` : 0 erreur ; chaque avertissement corrigé ou justifié.
4. Build de production local (`--publish=never`), installation du paquet sur une machine (ou VM) propre de chaque OS ciblé.
5. Sur le paquet installé : premier lancement sans données, lancement avec une base existante (migration), parcours principaux, fermeture et réouverture, mise à jour depuis la version précédente.
6. Mesures du rule `desk-perf` : démarrage, mémoire au repos, taille de l'installeur.
7. Accessibilité : skill `desk-a11y-audit` (scan + passe manuelle) sur chaque vue principale.
8. Légal : licences tierces à jour, « À propos » correct (skill `desk-legal-fr`).

## Compte rendu

Terminer par un tableau contrôle / OS / statut / détail, et la liste des avertissements laissés volontairement avec leur raison.
