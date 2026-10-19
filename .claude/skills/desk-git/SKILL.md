---
name: desk-git
description: Organise le travail Git d'une application de bureau - branches courtes, branches de variante longue durée (version autonome, version serveur), report des correctifs entre variantes, worktrees pour plusieurs agents, tags de version, fichiers à ne jamais versionner. À utiliser pour créer une branche, préparer un commit, fusionner, ou maintenir plusieurs variantes.
---

# Git

Adapté de `web-git` (CapsuleOS). Commit, push, tag et fusion restent des actions validées par l'humain.

## 1. Branches

| Branche | Usage | Durée |
|---------|-------|-------|
| `main` | version de référence, toujours publiable | permanente |
| variante (ex. `proxmox` pour le serveur, `standalone` pour la version autonome) | produit distinct, publié séparément | permanente |
| `feat/<zone>-<slug>` | fonctionnalité, partie d'une branche de base | jours |
| `fix/<zone>-<slug>` | correction | heures à jours |
| `chore/<slug>`, `docs/<slug>` | outillage, rangement, doc | courte |
| `claude/<slug>` | session d'agent | une session |

Une branche courte part de sa base (`main` ou la variante) et y revient. Limite : 14 jours.

## 2. Flux

1. `git switch <base> && git pull --ff-only`, puis `git switch -c feat/<zone>-<slug>`.
2. Patch + contrôle minimal (skill `desk-audit`).
3. Commit : message à l'impératif, une intention par commit. Préfixe de zone utile (`ipc:`, `db:`, `ui:`, `build:`).
4. Avant fusion : contrôles verts, relecture du diff `<base>...HEAD`.
5. Fusion par l'humain, `--ff-only` si possible. Jamais de force-push sur une branche partagée.

## 3. Variantes longue durée

- Les correctifs communs se font sur `main`, puis sont reportés vers la variante : `git merge main` régulier (recommandé, historique lisible) ou `git cherry-pick <sha>` pour un correctif isolé.
- Le code propre à la variante est concentré (adaptateur de données, configuration, packaging) pour limiter les conflits.
- Une correction faite d'abord sur la variante et utile à `main` : branche `fix/` depuis `main`, cherry-pick, pas de fusion de la variante dans `main`.
- Tags distincts par variante si elles sont publiées séparément (`v3.5.0`, `standalone-v1.0.0`).

## 4. Plusieurs agents en parallèle

Un dossier par agent :

```bash
git worktree add ../tracebay-standalone standalone
git worktree list
git worktree remove ../tracebay-standalone
```

- Une instance de l'application par worktree avec un dossier de données distinct.
- `index.lock` présent : un autre processus écrit. Attendre, ne jamais supprimer le verrou pendant qu'il travaille.

## 5. Jamais versionnés

`node_modules/`, `dist/`, `out/`, `src-tauri/target/`, installeurs (`.exe`, `.dmg`, `.AppImage`, `.deb`), `.asar`, `.env*` (sauf `.env.example`), bases locales (`*.sqlite`, `*.db`), certificats et clés de signature, journaux. Contrôle : `node .claude/skills/desk-audit/scripts/check-repo.mjs`.
