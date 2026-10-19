---
name: desk-security
description: Durcit ou audite une application Electron ou Tauri - options de BrowserWindow, preload et contextBridge, CSP, navigation et liens externes, permissions, protocole personnalisé, fuses, capacités Tauri 2, stockage des jetons, chemins de fichiers. À utiliser pour créer une fenêtre, toucher au preload, à une commande Tauri, à la CSP, ou avant une release.
---

# Sécurité Electron / Tauri

Contraintes : rule `desk-security`. Contrôle automatique : `node .claude/skills/desk-audit/scripts/check-desktop.mjs`.

## 1. Fenêtre Electron de référence

```js
const win = new BrowserWindow({
  width: 1280, height: 800, minWidth: 960, minHeight: 600,
  show: false,
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    spellcheck: false,
  },
});
win.once('ready-to-show', () => win.show());
win.loadFile(path.join(__dirname, 'public', 'index.html'));

// Navigation : rien ne sort de l'application
win.webContents.on('will-navigate', (e, url) => {
  if (!url.startsWith('file://')) e.preventDefault();
});
win.webContents.setWindowOpenHandler(({ url }) => {
  openExternalSafe(url);
  return { action: 'deny' };
});

const EXTERNAL_HOSTS = new Set(['github.com']);
function openExternalSafe(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol === 'https:' && EXTERNAL_HOSTS.has(u.hostname)) shell.openExternal(u.toString());
  } catch { /* URL invalide : ignorée */ }
}

// Permissions : refus par défaut
session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'clipboard-sanitized-write'));
```

Avec `sandbox: true`, le preload ne peut `require` que `electron` (contextBridge, ipcRenderer) : la logique Node part dans `main`.

## 2. Preload : liste blanche

```js
const { contextBridge, ipcRenderer } = require('electron');

const INVOKE = new Set(['lots:list', 'lots:create', 'pdf:export', 'app:version']);
const EVENTS = new Set(['update:available', 'sync:status']);

contextBridge.exposeInMainWorld('api', {
  invoke: (channel, payload) => {
    if (!INVOKE.has(channel)) return Promise.reject(new Error(`canal refusé : ${channel}`));
    return ipcRenderer.invoke(channel, payload);
  },
  on: (channel, cb) => {
    if (!EVENTS.has(channel)) return () => {};
    const listener = (_e, data) => cb(data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
});
```

Mieux encore : une fonction nommée par action (`api.lots.list()`), générée depuis le contrat du skill `desk-ipc`.

## 3. CSP

Dans chaque document HTML de premier niveau (pas les fragments injectés) :

```html
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://serveur.example; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'">
```

- Mode sans serveur : `connect-src 'self'` seul.
- Polices, scripts (Font Awesome, bibliothèques) : copiés dans le paquet, jamais depuis un CDN.
- `style-src 'unsafe-inline'` toléré pour les attributs `style` existants, noté comme dette.

## 4. Protocole personnalisé (optionnel, recommandé)

`file://` donne à toutes les pages la même origine large. Un protocole `app://` limite ce qui est servi :

```js
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
app.whenReady().then(() => {
  protocol.handle('app', (req) => {
    const { pathname } = new URL(req.url);
    const file = path.normalize(path.join(PUBLIC_DIR, decodeURIComponent(pathname)));
    if (!file.startsWith(PUBLIC_DIR + path.sep)) return new Response('Interdit', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
});
```

## 5. Fuses (build de production)

```js
// forge.config.js > plugins, ou afterPack d'electron-builder via @electron/fuses
new FusesPlugin({
  version: FuseVersion.V1,
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableCookieEncryption]: true,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
});
```

## 6. Tauri 2

`src-tauri/capabilities/main.json` :

```json
{
  "identifier": "main",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "dialog:allow-open",
    "dialog:allow-save",
    { "identifier": "fs:allow-read-text-file", "allow": [{ "path": "$APPDATA/**" }] },
    { "identifier": "fs:allow-write-text-file", "allow": [{ "path": "$APPDATA/**" }] },
    "sql:default"
  ]
}
```

- Une capacité par fenêtre, jamais `"windows": ["*"]` sans raison.
- `tauri.conf.json > app.security.csp` renseignée (jamais `null`).
- Commandes : arguments typés (`serde`), validation, `Result<T, String>`.

## 7. Données sensibles

| Donnée | Stockage |
|--------|----------|
| Jeton de session, mot de passe mémorisé | `safeStorage.encryptString` (Electron) dans un fichier du dossier de données, ou trousseau OS (`keytar` abandonné : préférer `safeStorage`) ; Tauri : plugin `stronghold` ou crate `keyring` |
| Préférences d'interface | `localStorage` ou fichier JSON |
| Données métier | base locale (skill `desk-local-data`) |

## 8. Chemins reçus du renderer

```js
function resolveInside(baseDir, userPath) {
  const p = path.resolve(baseDir, userPath);
  if (p !== baseDir && !p.startsWith(baseDir + path.sep)) throw new Error('Chemin refusé');
  return p;
}
```

Fichier choisi par l'utilisateur : passer par `dialog.showOpenDialog` / `showSaveDialog` côté `main`, ne jamais accepter un chemin libre du renderer.

## 9. Checklist de revue

- [ ] `check-desktop.mjs` : 0 erreur.
- [ ] Aucune URL distante chargée dans une fenêtre avec preload.
- [ ] Chaque canal IPC validé, liste blanche dans le preload.
- [ ] CSP présente dans chaque document de premier niveau, testée (console sans violation).
- [ ] Liens externes filtrés, navigation verrouillée, permissions refusées par défaut.
- [ ] Jetons hors `localStorage`.
- [ ] Fuses actifs sur le paquet (`npx @electron/fuses read --app <chemin>`).
- [ ] Mises à jour signées et vérifiées.
