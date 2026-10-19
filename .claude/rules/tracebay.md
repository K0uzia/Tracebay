# Tracebay (propre à ce dépôt)

Les rules `desk-*` s'appliquent en plus ; ici seulement ce qui est propre à Tracebay. Reprend aussi `.cursor/rules/ui.md`.

## Produit et branches

- Tracebay : traçabilité de matériel (lots et items, sessions de disques, commandes, dons, prêts de matériel, inventaire, historique) et agenda. Client Electron dans `apps/client`.
- `main` : client qui dépend du serveur (API REST Fastify + PostgreSQL). Il reste la version de référence et doit continuer à fonctionner.
- `proxmox` : le backend (`proxmox/app`, Fastify 4, TypeScript, PostgreSQL 16, Docker). Ne pas le modifier depuis une autre branche.
- `standalone` : version autonome, sans serveur, sur un seul poste (skill `desk-dual-mode`). Décisions du 19/10/2026 : SQLite via `node:sqlite` (pas de module natif), aucun profil ni authentification, pas de reprise des données du serveur (base neuve). Elle ne se fusionne jamais dans `main` ; ce sont les correctifs communs qui partent de `main` vers elle (skill `desk-git`).

## Architecture actuelle (client)

- `main.js` : fenêtres, IPC, génération des PDF (gabarits `public/pdf-templates/*.html` rendus par `printToPDF`, pdfkit en repli), mises à jour (`electron-updater`, GitHub Releases).
- `preload.js` : `window.electron`, `window.electronAPI`, avec une liste blanche de canaux.
- Renderer `public/` : `app.js` (routeur de pages) et `assets/js/modules/<domaine>/`. Accès réseau : `assets/js/config/api.js` (clés d'endpoints dans `public/config/connection.json`), mais plusieurs modules font encore des `fetch` directs. Les ramener vers `api.js` avant tout changement de transport.
- Packaging : electron-builder (bloc `build` de `apps/client/package.json`), c'est lui qu'utilise la CI. Forge est un doublon hérité.
- Données serveur : schéma `proxmox/app/src/db/schema.sql`. Le schéma SQLite de `standalone` en reprend les noms de tables et de colonnes.

## Conventions

- Nom du produit : « Tracebay ». « workspace » et « tracebaie » sont d'anciens noms. On ne les réintroduit pas, et on ne renomme pas les clés persistées (`localStorage`, nom d'exécutable, dossier `userData`) sans prévoir de migration.
- Version : `apps/client/package.json`, que le `package.json` racine doit suivre. L'interface lit la version via `app.getVersion()`.
- Chemins de partage réseau (`/mnt/team/#TEAM/...`) : ce sont des valeurs de configuration, jamais du code. En `standalone`, ils sont remplacés par un dossier choisi par l'utilisateur.
- IP du serveur : uniquement dans la configuration, jamais en dur dans un module JS.
- Échapper toute donnée issue de la base avant un `innerHTML` (`escapeHtml` existant), ou utiliser `textContent`.
- UI (repris de `.cursor/rules/ui.md`) : aucune bordure colorée décorative (par exemple `border-left` en couleur de marque sur une carte), échelle de `z-index` 10 / 20 / 30 / 40 (dropdown, modale, toast, overlay), palette limitée (neutres + un accent), focus sur `:focus-visible` uniquement.

## Terminé = vérifié

- `npm run lint:check` et `npm test` à la racine, puis `node .claude/skills/desk-audit/scripts/check-desktop.mjs` sans nouvelle erreur par rapport à l'état de départ.
- Lancer l'application (`npm start`) et faire le parcours touché, en regardant la console du renderer et le terminal du processus principal.
- En `standalone` : le même parcours, réseau coupé.
