# Audit complet de l'application Workspace (client Electron)

**Date :** 2026-03-13  
**Périmètre :** Client Electron `apps/client` (Workspace v3.1.5)  
**Objectifs :** Sécurité, performance, maintenabilité, conformité (mix).

---

## 1. Préparation et périmètre

### 1.1 Objectifs de l'audit
- **Sécurité** : Configuration Electron, IPC, exposition d’API, secrets, XSS, dépendances.
- **Performance** : Démarrage, mémoire, structure du main process.
- **Maintenabilité** : Structure du code, séparation main/renderer/preload.
- **Conformité** : Bonnes pratiques Electron, pipeline CI/CD, build et mise à jour.

### 1.2 Cibles identifiées
| Élément | Détail |
|--------|--------|
| **OS supportés** | Windows (x64), macOS (x64, arm64), Linux (x64 – AppImage, deb) |
| **Electron** | ^39.2.4 (package.json) |
| **Node.js** | ≥18 (engines root), CI utilise Node 20 |
| **Modules Node (main)** | `fs`, `path`, `http`, `child_process` (exec, execSync, spawn), `os`, `url` ; `pdfkit`, `electron-updater`, `electron-squirrel-startup` |
| **Services externes** | API REST (config : localhost:8060, 192.168.1.62:4000, production) ; WebSocket (chat, même hôte) ; GitHub (releases pour auto-update) |
| **SSO / Cloud** | Aucun SSO ; pas de stockage cloud côté client (JWT + données en localStorage) |

### 1.3 Éléments récupérés
- **Dépôt** : Git, monorepo (workspace root + `apps/client`).
- **Scripts** : `npm start`, `electron .`, `electron-forge start`, `electron-builder` (build:prod:linux/win/mac).
- **Documentation** : `docs/backend-shortcuts-api.md` ; pas de schéma d’architecture central.
- **CI/CD** : `.github/workflows/build-client.yml` – build Linux/Windows/macOS sur push `main` (paths: `apps/client/**`), publication GitHub Release (GH_TOKEN / GITHUB_TOKEN).

---

## 2. Architecture et configuration Electron

### 2.1 Versions Electron et Node
- **Electron** : 39.2.4 – version récente, à maintenir à jour pour correctifs de sécurité.
- **Node** : aligné sur celle fournie par Electron ; racine du projet exige `>=18`.

**Recommandation** : Suivre les releases Electron (et les advisory) et mettre à jour régulièrement.

### 2.2 Création des BrowserWindow

| Fenêtre | nodeIntegration | contextIsolation | enableRemoteModule | preload | Autre |
|---------|-----------------|-----------------|--------------------|---------|--------|
| **Splash** | `false` | `true` | (non défini) | non | loadURL data: HTML statique |
| **Main** | `false` | `true` | `false` | `preload.js` | OK |
| **PDF viewer** | `false` | `true` | (non défini) | `preload.js` | loadURL file:// (chemin contrôlé) |
| **Offscreen (PDF génération)** | (défaut) | (défaut) | - | non | `webPreferences: { offscreen: true }` uniquement |

**Constat :**
- **Conformité** : Pour les fenêtres de rendu standard (main, splash, PDF), `nodeIntegration: false` et `contextIsolation: true` sont bien définis ; `enableRemoteModule: false` sur la main.
- **Non explicite** : `sandbox`, `webSecurity`, `allowRunningInsecureContent`, `webviewTag` ne sont pas définis (donc valeurs par défaut Electron). Les fenêtres offscreen n’ont que `offscreen: true` ; dans les versions récentes d’Electron, les défauts restent généralement sûrs (contextIsolation true, nodeIntegration false), mais les expliciter renforcerait la clarté et la résilience aux changements de défauts.

**Recommandations :**
- Pour **toutes** les BrowserWindow (y compris offscreen), définir explicitement `nodeIntegration: false`, `contextIsolation: true`, et désactiver `webviewTag` si non utilisé.
- Ne pas activer `allowRunningInsecureContent` ; garder `webSecurity: true` (défaut).

### 2.3 BrowserView / webview
- Aucun `BrowserView` ni balise `<webview>` utilisé dans le code.
- Pas de risque associé dans le périmètre actuel.

### 2.4 Navigation et ouverture de fenêtres
- **setWindowOpenHandler** : Présent sur la fenêtre principale et la fenêtre PDF. Comportement : ouverture des liens http(s) via `shell.openExternal`, puis `return { action: 'deny' }` pour ne pas ouvrir de nouvelle fenêtre Electron. **Conforme.**
- **will-navigate** : Aucun handler. Le contenu principal est chargé en `file://` ; une navigation ne peut être déclenchée que par un lien ou du script. **Recommandation** : ajouter un handler `will-navigate` sur la fenêtre principale pour n’autoriser que la navigation vers des URLs prévues (ex. même origine `file://` ou liste blanche) et bloquer le reste.

---

## 3. Surface d’attaque (sécurité applicative)

### 3.1 Communication main / renderer

**Preload (`preload.js`) :**
- **contextBridge** : Utilisé pour exposer une API limitée (`electron`, `ipcRenderer`, `electronAPI`).
- **Canaux IPC** : Liste blanche stricte (`ALLOWED_CHANNELS`) pour `send`, `invoke`, `on`. Toute tentative d’utilisation d’un canal non listé lève une erreur. **Conforme.**
- **openExternal** : Vérification `url.startsWith('http')` ; pas d’ouverture de protocoles locaux (file:, etc.) depuis ce chemin. **Conforme.**

**IPC côté main :**
- Handlers utilisés : `ipcMain.handle` pour les canaux exposés ; `ipcMain.on` pour `chat-new-message`, `open-pdf`.
- Aucune exposition directe de `require('fs')`, `require('child_process')`, etc. au renderer ; l’accès au système passe par des handlers dédiés. **Conforme.**

**Points à risque (handlers sensibles) :**
- **list-folders** : Prend un `path` du payload, fait `path.resolve(basePath)` puis `fs.promises.readdir`. Aucune restriction de répertoire (ex. sous-répertoire du home ou liste blanche). Un renderer compromis ou une injection de paramètres pourrait théoriquement demander la lecture d’un répertoire arbitraire. **Recommandation** : restreindre à un ensemble de bases autorisées (ex. répertoires de travail connus, ou sous `os.homedir()`) et rejeter si le chemin résolu est en dehors.
- **open-path** : Même logique avec `path.resolve(targetPath)` et `shell.openPath` / `exec(explorer|open|xdg-open ...)`. **Recommandation** : même restriction par liste blanche ou préfixes autorisés pour éviter l’ouverture de chemins sensibles.
- **launch-app** : Exécute `exec(fullCmd)` avec `command` et `args` venant du payload. Les `args` sont entourés de guillemets ; `command` n’est pas sanitisé. Si `command` ou la construction de `fullCmd` peut être influencée par une source non fiable (ex. config serveur ou utilisateur), risque de **command injection**. **Recommandation** : valider `command` (whitelist de binaires autorisés et chemins) et ne jamais construire une ligne de commande concaténée à partir d’entrées libres ; privilégier `execFile` avec un tableau d’arguments.
- **read-file-as-base64** : `path.resolve(filePath)` puis lecture du fichier. Permet de lire n’importe quel fichier accessible au process. **Recommandation** : restreindre aux répertoires autorisés (ex. dossiers de traçabilité, temporaires) et valider que le chemin résolu est bien sous ces bases.
- **open-pdf-window** : Validation correcte (pas de `..`, `/`, `\` dans le nom de fichier ; chemin construit côté main). **Conforme.**

### 3.2 Chargement de contenu
- **Fenêtre principale** : `loadURL('file://' + path.join(__dirname, 'public', 'index.html'))` – pas de loadURL dynamique basé sur des entrées utilisateur. **Conforme.**
- **Splash** : HTML en ligne (data URL) généré en dur. **Conforme.**
- **Fenêtre PDF** : `file://` avec chemin dérivé de `pdfFile` validé (nom simple, pas de traversal). **Conforme.**
- **DevTools** : Ouverts automatiquement en développement (`if (!isProduction) mainWindow.webContents.openDevTools()`), pas en production. **Conforme.** Les raccourcis F12 / Ctrl+Shift+I restent enregistrés même en prod – à considérer pour une build “fermée” (désactiver en prod si politique stricte).

### 3.3 Risque XSS (injection HTML/JS)
- **innerHTML** : Très utilisé dans le renderer (listes, modales, notifications, chat, etc.). Plusieurs modules utilisent une fonction **escapeHtml** (ShortcutManager, ChatManager, Historique, Disques, etc.) pour les données affichées ; `app.js` échappe les messages de notification avec `replace(/</g, '&lt;')`.
- **Risque résiduel** : Partout où du contenu utilisateur ou API (noms, messages, URLs) est inséré dans du HTML sans passage par `escapeHtml` (ou équivalent), un risque XSS existe. Audit de code ciblé recommandé sur les chemins où des données externes atteignent `innerHTML` / `insertAdjacentHTML` / `document.write`.
- **eval / new Function** : Aucune utilisation repérée dans le code applicatif. **Conforme.**

### 3.4 Dépendances (npm audit)
- **npm audit** (dans `apps/client`) : Plusieurs vulnérabilités **high** remontées, principalement dans la chaîne **@electron-forge** (cli, core, core-utils, maker-*, plugin-webpack, publisher-*, shared-types, etc.) et transitives (@inquirer/prompts, webpack-dev-server, @electron/rebuild).
- **Fix disponible** : Certains correctifs impliquent des mises à jour majeures (semver-major) ; d’autres packages n’ont pas de correctif indiqué.
- **Impact** : Les outils Forge sont surtout utilisés en **build** (pas en runtime utilisateur). Le risque opérationnel le plus critique reste les dépendances de **runtime** (electron, electron-updater, pdfkit). Vérifier les advisory CVE pour Electron et ces paquets.

**Recommandations :**
- Mettre à jour les dépendances Forge/Builder dans la mesure du possible et suivre les advisory.
- Exécuter `npm audit` et traiter les vulnérabilités de runtime en priorité.
- Intégrer `npm audit` (ou équivalent SCA) dans la CI pour bloquer ou alerter en cas de vulnérabilités critiques/high.

---

## 4. Données, secrets et permissions

### 4.1 Stockage local (renderer)
- **localStorage** : Utilisé pour le JWT (`workspace_jwt`), l’identifiant utilisateur (`workspace_user_id`), le nom d’utilisateur (`workspace_username`), un identifiant client (`workspace_client_id`), des préférences (page récente, couleurs agenda, éléments récents, etc.).
- **Tokens** : Le JWT est stocké **en clair** dans le localStorage. En cas d’accès à la machine (physique ou malware), ou d’XSS, le token peut être exfiltré. Pas d’utilisation de Keytar / keychain / credential manager côté client actuellement.

**Recommandations :**
- Documenter que le JWT est délibérément en localStorage (comportement courant pour des apps web-like) et que la durée de vie et la révocation sont gérées côté serveur.
- Pour un niveau de sécurité renforcé : étudier le stockage du token dans le keychain système (macOS Keychain, Windows Credential Manager, libsecret sous Linux) via un module adapté (ex. safe-storage Electron ou wrapper keytar), avec fallback localStorage.

### 4.2 Secrets et configuration
- **Clé API Giphy** : Une clé par défaut est **en dur** dans `ChatSecurityConfig.js` : `'mvekVgYYTsuZWKdfbyHDgUvtCEfUt4IR'`. Elle est utilisée comme fallback si `window.APP_CONFIG.giphyApiKey` n’est pas défini. **Non conforme** : secret versionné et exposé (risque d’abus de quota, révocation nécessaire).
- **Fichier d’exemple** : `app-config.local.example.js` indique de mettre sa clé dans `APP_CONFIG.giphyApiKey` – bonne pratique pour l’override, mais la valeur par défaut ne doit pas être une vraie clé.

**Recommandations :**
- Supprimer la clé en dur de `ChatSecurityConfig.js` et n’utiliser que `window.APP_CONFIG.giphyApiKey` (ou variable d’environnement en build). En absence de clé, la fonctionnalité GIF peut rester désactivée avec un message explicite (déjà partiellement en place).
- Vérifier que `.env` et tout fichier contenant des secrets réels sont dans `.gitignore` et jamais committés.

### 4.3 Permissions système
- **Fichiers** : Lecture/écriture via main process (IPC) pour PDF, traçabilité, dossiers utilisateur, list-folders, open-path, read-file-as-base64.
- **Réseau** : Connexions API et WebSocket vers le serveur configuré ; `shell.openExternal` pour des URLs ; téléchargement de PDF (open-pdf-with-system-app).
- **Lancement d’applications** : `launch-app` (exec), `open-path` (explorer/open/xdg-open).
- **Linux** : `run-lsblk` (execSync de `lsblk`) ; `get-app-icon` (execSync grep sur `/usr/share/applications`).
- Pas de demande explicite de caméra, micro ou notifications système dans le code audité.

**Recommandation** : Documenter les permissions nécessaires (fichiers, réseau, lancement d’apps) et s’assurer que les manifests (installer, store) les décrivent correctement.

---

## 5. Qualité de code et performance

### 5.1 Structure du projet
- **Séparation** : Main process dans `main.js` ; preload dans `preload.js` ; renderer dans `public/` (HTML, JS par page/module). Pas de mélange de code Node dans le renderer grâce à contextIsolation et preload.
- **main.js** : Fichier très volumineux (~2200 lignes) : fenêtres, splash, mise à jour, découverte serveur, nombreux IPC (PDF, fichiers, apps, config, lsblk, etc.). **Recommandation** : extraire les handlers IPC dans des modules dédiés (ex. `ipc/files.js`, `ipc/pdf.js`, `ipc/system.js`) pour améliorer la maintenabilité et les tests.

### 5.2 Performance
- **Démarrage** : Séquence avec splash, vérification de mise à jour (electron-updater), puis chargement de la fenêtre principale. Timeout de 15 s pour afficher la fenêtre même si la mise à jour ne répond pas. Pas de mesure formalisée du temps de lancement.
- **Mémoire** : Fenêtres PDF et fenêtres offscreen créées/fermées au besoin ; `pdfWindows` Map pour suivre les fenêtres PDF. Pas de détection de fuites dans le cadre de cet audit.
- **Lazy-loading** : Les pages (agenda, shortcut, reception, etc.) sont chargées dynamiquement via `import()` dans `app.js` (initializePageElements). **Conforme** pour différer le chargement des fonctionnalités.

**Recommandations :**
- Mesurer le temps de premier affichage et le temps jusqu’à “prêt” (ex. après premier rendu de la page par défaut).
- Limiter les opérations bloquantes dans le main au démarrage (ex. découverte réseau) ou les déporter dans un worker / délai après show.

### 5.3 Observabilité
- **Logs** : Logger centralisé (`Logger.js`) avec niveaux ; logs côté main via `console.log/error/warn`. Présence de logs de debug (fetch vers des URLs d’ingest de session) dans `main.js` (ex. open-pdf-with-system-app, update-downloaded, showMainAndCloseSplash) – à retirer ou conditionner à un mode debug pour ne pas exposer de données en production.
- **Crash reporting** : Aucune intégration Sentry / Electron crashReporter repérée. **Recommandation** : envisager l’envoi des crashs (avec consentement et sans PII) pour diagnostiquer les erreurs en production.

---

## 6. Build, signature et mise à jour

### 6.1 Build
- **Outils** : Electron Forge (config dans `forge.config.js`) et electron-builder (dans `package.json` “build”). Forge : asar activé, makers Squirrel/Zip/Deb, publication GitHub.
- **electron-builder** : Utilisé pour les scripts `build:prod:*` ; cible NSIS + portable (Windows), DMG (macOS), AppImage + deb (Linux). Fichiers inclus/exclus définis dans `build.files`.
- **Code sensible** : Le code source (HTML/JS) est livré dans l’application ; pas de minification/obfuscation systématique. ASAR limite l’accès direct aux fichiers mais le contenu reste lisible. **Recommandation** : pour une protection supplémentaire, envisager la minification (et éventuellement l’obfuscation) du code sensible, en gardant en tête que la sécurité ne doit pas reposer sur l’opacité du code.

### 6.2 Signature et intégrité
- **macOS** : `hardenedRuntime: true`, `gatekeeperAssess: false`, entitlements définis (`entitlements.mac.plist`). À vérifier que le certificat de signature est correctement configuré en CI (variables d’environnement / secrets).
- **Windows** : Pas de détail de certificat de signature dans les fichiers audités ; à configurer côté CI ou machine de build pour la signature des binaires.
- **ASAR** : Activé dans Forge (`asar: true`). Vérifier que les chemins utilisés (ex. `__dirname`, `path.join(__dirname, ...)`) restent compatibles avec l’unpack si des fichiers doivent être déballés.

### 6.3 Mises à jour
- **electron-updater** : Utilisé au démarrage (après splash) ; configuration de publication GitHub (provider, owner, repo) dans `package.json`. Vérification des mises à jour avec timeout 15 s ; en cas de mise à jour disponible, téléchargement puis `quitAndInstall(true, true)`.
- **Sécurité** : Les mises à jour sont téléchargées depuis GitHub (HTTPS). Pas de mécanisme de signature des paquets vérifié dans le code (electron-updater peut gérer la signature selon la config). **Recommandations** : s’assurer que la publication se fait bien sur le dépôt officiel (pas de redirection vers une autre URL) ; activer et vérifier la signature des artefacts d’update si l’outil le permet ; éviter toute possibilité de downgrade non contrôlé (politique de version minale si besoin).

---

## 7. Tests pratiques et scénarios d’attaque

- **Non réalisés** dans le cadre de cet audit (analyse statique et configuration uniquement). Les points suivants sont à valider en tests manuels ou automatisés :
  - **XSS** : Injection de contenu dans les champs (noms, messages, URLs) et vérification que le DOM ne contient pas de script exécuté.
  - **IPC forgés** : Depuis les DevTools du renderer, tenter d’appeler `window.electron.invoke` avec des canaux non autorisés (doit être rejeté par le preload) ; avec des canaux autorisés mais des paramètres extrêmes (chemins avec `..`, commandes avec `;`, etc.).
  - **Navigation** : Vérifier qu’un lien ou un script ne peut pas faire naviguer la fenêtre principale vers une URL arbitraire si aucun `will-navigate` n’est en place.
  - **Réseau** : Couper le serveur ou renvoyer des réponses mal formées et vérifier que l’app ne crash pas et gère les erreurs (ex. message “Erreur serveur” pour les raccourcis déjà en place).

---

## 8. Restitution et plan d’action

### 8.1 Synthèse des vulnérabilités et non-conformités

| Gravité | Élément | Preuve / emplacement | Impact |
|--------|---------|----------------------|--------|
| **Haute** | Clé API Giphy en dur | `ChatSecurityConfig.js` | Secret exposé. | **Corrigé** — clé lue uniquement depuis `GIPHY_API_KEY` (env) ou `userData/workspace-config.json` (Paramètres > Clé Giphy) ; plus aucune clé en dur dans le code. |
| **Haute** | Risque de command injection dans `launch-app` | `main.js` : `exec(fullCmd)` avec `command` du payload | Exécution de commandes arbitraires si la source du `command` est compromise |
| **Moyenne** | Pas de restriction de chemin pour `list-folders` / `open-path` / `read-file-as-base64` | `main.js` handlers IPC | Lecture/ouverture de chemins arbitraires si le renderer est compromis |
| **Moyenne** | JWT en clair dans localStorage | Plusieurs modules (api.js, AuthManager, etc.) | Vol de session en cas d’XSS ou accès physique |
| **Moyenne** | Vulnérabilités npm (Forge et transitives) | `npm audit` dans apps/client | Dépendances de build et runtime à mettre à jour |
| **Basse** | Logs de debug (fetch ingest) dans main.js | Plusieurs blocs #region agent log | Bruit, possible fuite d’infos en prod |
| **Basse** | Pas de `will-navigate` sur la fenêtre principale | main.js | Navigation non contrôlée théorique |
| **Basse** | webPreferences des fenêtres offscreen non explicites | main.js (BrowserWindow offscreen) | Dépendance aux défauts Electron |

### 8.2 Recommandations concrètes

**Configuration Electron :**
- Expliciter pour **toutes** les BrowserWindow : `nodeIntegration: false`, `contextIsolation: true` ; désactiver `webviewTag` si inutilisé.
- Ajouter un handler `will-navigate` sur la fenêtre principale pour n’accepter que les navigations prévues (file vers l’app) et refuser le reste.

**Patterns de code :**
- **launch-app** : Ne pas utiliser `exec(fullCmd)`. Utiliser `execFile` avec un binaire autorisé (whitelist) et des arguments en tableau ; ou refuser toute entrée non validée.
- **list-folders, open-path, read-file-as-base64** : Imposer une liste de répertoires de base autorisés (ou préfixes) et rejeter tout `path.resolve()` qui sort de ces bases.
- **Secrets** : Retirer la clé Giphy par défaut ; n’utiliser que configuration ou env ; ne jamais committer de clés.
- **Main process** : Découper `main.js` en modules (IPC, mise à jour, découverte, fenêtres) pour faciliter la revue et les tests.

**Dépendances :**
- Exécuter `npm audit` et `npm outdated` régulièrement ; corriger les vulnérabilités de runtime en priorité.
- Intégrer `npm audit` (et optionnellement SCA) dans la CI.

### 8.3 Feuille de route

**Priorité 1 (blocantes / sécurité forte)**
1. Supprimer la clé API Giphy en dur et n’utiliser que `APP_CONFIG` ou variable d’environnement.
2. Sécuriser `launch-app` : whitelist de commandes ou `execFile` avec arguments contrôlés.
3. Restreindre les chemins dans `list-folders`, `open-path`, `read-file-as-base64` (répertoires autorisés / préfixes).

**Priorité 2 (moyen terme)**
4. Restreindre l’affichage des DevTools en production (désactiver F12 / Ctrl+Shift+I si politique stricte). → **Non appliqué** : F12 / Ctrl+Shift+I laissés actifs à la demande.
5. Expliciter `webPreferences` pour les fenêtres offscreen et ajouter `will-navigate` sur la main. → **Fait** : offscreen avec `nodeIntegration: false`, `contextIsolation: true` ; `will-navigate` sur la fenêtre principale (navigation externe bloquée, ouverture dans le navigateur système).
6. Traiter les vulnérabilités npm (runtime puis build) et ajouter `npm audit` en CI. → **Fait** : scripts `npm run audit` / `audit:fix` (root + apps/client) ; étape `npm audit --audit-level=high` dans `.github/workflows/build-client.yml`.
7. Nettoyer les logs de debug (fetch ingest) du main process ou les conditionner à un flag debug. → **Fait** : envois ingest conditionnés par `WORKSPACE_DEBUG=1` (constante `DEBUG_INGEST` dans main.js).

**Priorité 3 (prévention et confort)**
8. Documenter l’usage de localStorage pour le JWT et, si besoin, étudier le stockage dans le keychain système. → **Fait** : `docs/JWT-ET-STOCKAGE.md`.
9. Refactoriser `main.js` en modules (IPC, update, discovery). → **Fait** : `lib/ClientDiscovery.js` (existant), `lib/update.js` (mise à jour auto) ; IPC reste dans main.js (extraction possible ultérieure).
10. Mettre en place une checklist Electron et une revue de code ciblée (IPC, chemins, innerHTML) à chaque évolution sensible. → **Fait** : `docs/ELECTRON-CHECKLIST.md`.
11. Envisager un crash reporting (Sentry / crashReporter) et une mesure de performance au démarrage. → **Fait** : `crashReporter.start` dans main (dumps locaux ; option `CRASH_REPORT_URL` pour Sentry), mesure ready→fenêtre + `userData/startup-metrics.json` ; voir `docs/CRASH-REPORTING.md`.

---

*Rapport généré dans le cadre d’un audit de l’application Workspace (client Electron). Pour toute question ou mise à jour des recommandations, se référer à ce document et aux bonnes pratiques Electron officielles.*
