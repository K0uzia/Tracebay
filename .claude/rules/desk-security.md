# Sécurité des applications de bureau

Le renderer (webview) est traité comme une page web hostile : il n'a accès qu'à ce que le processus principal (Electron `main`, cœur Rust Tauri) lui expose explicitement. Procédure et contrôles : skill `desk-security`.

## Electron (non négociable)

- `BrowserWindow` : `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`, `allowRunningInsecureContent: false`, pas de `enableRemoteModule`, pas de `<webview>` sauf besoin justifié.
- `preload` : `contextBridge.exposeInMainWorld` avec des fonctions nommées et étroites. Jamais `ipcRenderer` brut, jamais `require`, `fs`, `child_process`, `shell` exposés tels quels.
- IPC : `ipcMain.handle` + `ipcRenderer.invoke`. Chaque handler valide ses arguments (type, longueur, liste blanche) et vérifie `event.senderFrame` (origine attendue). Contrat : skill `desk-ipc`.
- Contenu chargé : uniquement local (`file://` du paquet ou protocole personnalisé `app://`). Jamais d'URL distante dans une fenêtre qui a un preload.
- Navigation verrouillée : `will-navigate` et `setWindowOpenHandler` refusent tout par défaut ; les liens externes passent par `shell.openExternal` après contrôle (`https:` uniquement, hôtes en liste blanche).
- Permissions : `session.setPermissionRequestHandler` refuse par défaut (caméra, micro, géolocalisation, notifications) sauf besoin réel.
- Fuses (`@electron/fuses`) en production : `RunAsNode` off, `EnableNodeCliInspectArguments` off, `EnableNodeOptionsEnvironmentVariable` off, `OnlyLoadAppFromAsar` on, `EnableEmbeddedAsarIntegrityValidation` on.
- Electron maintenu : une des 3 dernières versions majeures.

## Tauri

- Tauri 2 : capacités (`src-tauri/capabilities/*.json`) minimales, une par fenêtre. Aucune permission `*:default` large sans lecture de ce qu'elle ouvre. Portée `fs` limitée à `$APPDATA`/`$APPLOCALDATA` et aux dossiers choisis par l'utilisateur.
- Commandes `#[tauri::command]` : arguments typés, validés côté Rust ; erreurs renvoyées en `Result<T, String>` sans détail interne.
- `shell` et `opener` : pas d'exécution arbitraire, URL `https:` en liste blanche.
- `devtools` désactivés en build release. `dangerousDisableAssetCspModification` interdit.

## Commun

- CSP stricte dans le HTML (ou `tauri.conf.json > app.security.csp`) : `default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`. `connect-src` limité au serveur réel quand il existe.
- Interdit dans le renderer : `eval`, `new Function`, `innerHTML`/`insertAdjacentHTML` avec une donnée non échappée, `document.write`. Les données venant de la base ou du réseau sont des données externes.
- Secrets : jamais dans le paquet (tout ce qui est livré est lisible, `asar` compris). Jetons utilisateur dans le trousseau de l'OS (`safeStorage` Electron, plugin `stronghold` ou keyring Tauri), pas en clair dans `localStorage` ni dans un JSON.
- Chemins de fichiers reçus du renderer : normalisés, confinés au dossier autorisé (pas de `..`), jamais concaténés à une commande shell.
- Mise à jour automatique : HTTPS, artefacts signés, signature vérifiée par l'updater. Jamais de mise à jour non signée.
- Dépendances : minimum vital, `npm audit --omit=dev` (et `cargo audit` pour Tauri) avant chaque release, versions verrouillées.
