# Architecture d'une application de bureau

## Processus et responsabilités

| Couche | Electron | Tauri | Contient |
|--------|----------|-------|----------|
| Cœur | `main` (Node) | `src-tauri` (Rust) | fenêtres, menus, fichiers, base de données, réseau sensible, mises à jour, trousseau |
| Pont | `preload` + `contextBridge` | `invoke` + capacités | contrat IPC typé, rien d'autre |
| Interface | renderer (HTML/CSS/JS) | webview | affichage, saisie, état d'interface |

- La logique métier (règles, calculs, validation) vit dans des modules purs, sans import Electron/Tauri ni DOM, testables avec Jest/Vitest ou `cargo test`.
- Le renderer ne sait pas d'où viennent les données : il appelle une interface (`api.lots.list()`), pas `fetch('http://…')` ni `sqlite` directement. C'est ce qui permet plusieurs modes (serveur, local) : skill `desk-dual-mode`.
- Un seul point d'entrée par fenêtre, un seul module de configuration lu au démarrage.

## Données locales

- Dossier de données : `app.getPath('userData')` (Electron) ou `appDataDir()` (Tauri). Jamais à côté de l'exécutable ni dans le dossier d'installation (en lecture seule sur Windows/macOS, écrasé à la mise à jour).
- Base locale : SQLite avec migrations versionnées, sauvegarde avant migration. Procédure : skill `desk-local-data`.
- Fichiers produits (PDF, exports) : dossier choisi par l'utilisateur via la boîte de dialogue native, ou sous-dossier documenté du dossier de données.
- Journaux : fichier tournant dans le dossier de données, niveau réglable, aucune donnée personnelle ni jeton dedans.

## Configuration

- Valeurs par défaut dans le code, surcharge par fichier de configuration utilisateur puis variables d'environnement en dev. `.env` réservé au build et au dev, jamais lu en production chez l'utilisateur.
- Version et identifiant d'application : une seule source (`package.json` ou `tauri.conf.json`), lue à l'exécution, jamais recopiée dans l'interface à la main.

## Multi-OS

- Chemins via `path.join` / `PathBuf`, jamais de séparateur en dur. Noms de fichiers sans `:` `*` `?` `"` `<` `>` `|`.
- Comportements à vérifier par OS : fermeture de fenêtre (macOS garde l'app ouverte), menu applicatif, raccourcis (`CmdOrCtrl`), icône de barre des tâches, instance unique (`requestSingleInstanceLock`).
- Écran haute densité : icônes SVG ou PNG @2x, aucune dimension figée en pixels physiques.
