# Audit de l'application Tracebay

Dernier audit : 19 octobre 2026, version 3.4.0, branche `main` (client Electron). Le backend (branche `proxmox`) a été lu sans être modifié. Outils : `.claude/skills/desk-audit/scripts/check-desktop.mjs`, `check-repo.mjs`, ESLint, Jest, lancement réel de l'application.

## Résultat des contrôles

| Contrôle | Avant | Après |
|----------|-------|-------|
| `check-desktop.mjs` (sécurité Electron) | 26 erreurs | 0 erreur, avertissements justifiés ci-dessous |
| `check-repo.mjs` (secrets, fichiers sensibles) | 0 erreur | 0 erreur |
| ESLint | 19 882 erreurs (configuration à 2 espaces, code à 4) | 0 erreur, 213 avertissements (`console.log` surtout) |
| Jest | 20 tests verts | 20 tests verts |
| CI | build seul | lint, tests et audits avant chaque build |

## Corrigé le 19 octobre 2026

### Sécurité

- Processus principal : `open-path` passait par une commande shell interpolée (injection possible avec un nom de dossier). Remplacé par `shell.openPath`.
- Handlers `launch-app` et `get-app-icon` supprimés : ils exécutaient des commandes reçues du renderer et ne servaient qu'à un module mort.
- `read-file-as-base64` pouvait lire tout le dossier personnel (`~/.ssh` compris). Il est limité aux fichiers PDF des dossiers autorisés.
- `generate-*-pdf` : le dossier de sortie envoyé par le renderer est validé.
- Raccourcis Ctrl+R, F11 et F12 limités à la fenêtre (avant : `globalShortcut`, capté dans tout le système).
- Permissions web (caméra, micro, géolocalisation, notifications) refusées par défaut.
- Clé Giphy en dur supprimée avec le chat.
- XSS stocké dans le renderer : titres et lieux d'agenda, lignes d'inventaire et d'historique, marques et modèles, dossiers, éléments récents. Les fonctions d'échappement locales n'échappaient pas les guillemets, d'où une sortie d'attribut possible. Lien de commande `javascript:` cliquable dans l'historique.
- CSP de `index.html` : placée avant tout script, sans CDN, script de thème externalisé, `object-src`, `base-uri` et `form-action` verrouillés. Gabarits PDF et écran de démarrage : aucun script autorisé.

### Rangement

- Supprimés :
  - le chat (modules, widget, CSS, notifications) ;
  - la découverte réseau (beacons UDP que le serveur n'émet pas, scan de sous-réseau) ;
  - `lib/update.js` ;
  - `AppManager`, `ShortcutManager`, `PDFManager` et autres modules non référencés ;
  - l'ancien `apps/client/index.html` ;
  - les journaux de debug toujours actifs (`.cursor/debug*.log`, envoi vers un endpoint local).
- Electron Forge retiré (doublon d'electron-builder, seul utilisé par la CI), ainsi que `electron-squirrel-startup`, TypeScript et `concurrently`.
- `build-production.js` et `start-dev.sh` racine supprimés (ils visaient des dossiers qui n'existent plus).
- Documentation : captures et documents des fonctions retirées supprimés ; `ELECTRON-CHECKLIST.md` remplacé par le skill `desk-security`.
- Typographie : plus aucun tiret cadratin ni demi-cadratin.

## Dette restante

| Priorité | Sujet | Détail |
|----------|-------|--------|
| P0 (serveur) | Routes métier sans authentification | Sur `proxmox`, seules les routes raccourcis vérifient le JWT. `JWT_SECRET` vaut `changeme` par défaut, et `proxmox/app/.env.production` est versionné. À traiter sur la branche du serveur. |
| P1 | Fuses Electron et signature | Fuses non configurés, paquets Windows et macOS non signés (skill `desk-release`). |
| P1 | JWT dans `localStorage` | Clé `workspace_jwt`. À déplacer vers `safeStorage` si l'authentification est réellement utilisée (aucune interface de connexion branchée aujourd'hui). |
| P1 | CSP `connect-src` large | `http: https: ws: wss:` est nécessaire tant que l'adresse du serveur est configurable. `style-src 'unsafe-inline'` est lié aux attributs `style` existants. |
| P2 | Tests | 4 fichiers de tests, rien sur `main.js` (environ 3 200 lignes : PDF, IPC, mises à jour). |
| P2 | `main.js` monolithique | À découper en modules (fenêtres, IPC, PDF, mises à jour). |
| P2 | Chemins de partage en dur | `/mnt/team/#TEAM/...` dans `main.js` et dans le renderer (`tracabilite.js`, `historique.js`, `FolderConfig.js`). À passer en configuration. |
| P2 | IP du serveur en dur | `192.168.1.62` dans `api.js` et `connection.json`. |
| P2 | Ancien nom « workspace » | Clés `localStorage`, nom d'exécutable, paquet deb. Le renommage exige une migration des données. |
| P2 | `demo/` | CSS dupliquées depuis le client. |
| P2 | Avertissements ESLint | 213, surtout des `console.log` à remplacer par le `Logger` existant. |
