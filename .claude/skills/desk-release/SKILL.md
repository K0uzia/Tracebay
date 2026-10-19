---
name: desk-release
description: Prépare, construit, signe et publie une version d'application de bureau (electron-builder, Electron Forge, Tauri bundler) - version unique, build depuis un commit propre, contenu du paquet, signature Windows/macOS, notarisation, mise à jour automatique, notes de version, retour arrière. À utiliser avant tout build de production ou publication de release.
---

# Release d'une application de bureau

Principe : automatiser la vérification, pas la publication. Publier une release ou une mise à jour automatique touche chaque poste installé : validation humaine explicite à chaque fois.

## 1. Règles

- Version : une seule source (`package.json` de l'app, ou `tauri.conf.json`), SemVer. Les autres fichiers (package racine, écran « À propos ») la lisent ou sont mis à jour par un script, jamais à la main un par un.
- Build depuis un commit propre de la branche de release (`main`, ou la branche de la variante), arbre sans modification, contrôles verts.
- Un seul outil de packaging par application (electron-builder **ou** Forge), pas les deux en parallèle.
- Publication `--publish=never` par défaut ; `--publish=always` uniquement à l'étape de publication validée.
- Secrets de signature (`CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `TAURI_SIGNING_PRIVATE_KEY`, `GH_TOKEN`) dans l'environnement ou les secrets de CI, jamais dans le dépôt.

## 2. Construire

```bash
git switch <branche> && git pull --ff-only
git status --porcelain            # doit être vide
npm ci
npm run lint:check && npm test
node .claude/skills/desk-audit/scripts/check-desktop.mjs
npm run build:prod:linux:local    # ou équivalent sans publication
```

Tauri : `npm run tauri build` (bundles dans `src-tauri/target/release/bundle/`).

## 3. Contrôler le paquet

- Contenu de l'archive : `npx @electron/asar list <app>/resources/app.asar | head -100`. Ni tests, ni `.env`, ni sources maps, ni `docs/`, ni `devDependencies`.
- Modules natifs présents et chargés (`asarUnpack`) sur chaque OS.
- Fuses : `npx @electron/fuses read --app <chemin>`.
- Taille de l'installeur dans le budget du rule `desk-perf`.

## 4. Signer

| OS | Sans signature | Signature |
|----|----------------|-----------|
| Windows | avertissement SmartScreen | certificat de signature de code (OV/EV ou Azure Trusted Signing) |
| macOS | bloqué par Gatekeeper | Developer ID + notarisation (`notarize` dans electron-builder, `APPLE_*`) |
| Linux | accepté | AppImage : optionnel ; dépôts : clé GPG |

Mise à jour automatique : `electron-updater` vérifie la signature sur Windows/macOS ; Tauri exige `pubkey` dans la config et des artefacts signés.

## 5. Publier (après accord)

1. Notes de version : ce qui change pour l'utilisateur, migrations de données, actions requises. Aucune fiction.
2. Tag `vX.Y.Z` sur le commit construit.
3. Publication (GitHub Releases ou autre) des artefacts + `latest*.yml` / `latest.json` de l'updater.
4. Installation de la release publiée sur un poste, mise à jour depuis la version précédente vérifiée.

## 6. Retour arrière

- Garder la version précédente publiée. Régression : republier la précédente avec un numéro supérieur (l'updater ne redescend pas), puis corriger sur une branche.
- Migration de base non réversible : la sauvegarde automatique avant migration (skill `desk-local-data`) est le seul retour possible ; documenter la restauration dans les notes.

## 7. Variantes d'une même application

Deux versions installables côte à côte (ex. client serveur et version autonome) : `appId`, `productName`, nom d'exécutable, canal de mise à jour et dossier `userData` distincts. Sinon l'une écrase ou met à jour l'autre.
