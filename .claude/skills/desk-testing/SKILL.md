---
name: desk-testing
description: Écrit et lance les tests d'une application de bureau - unitaires sur la logique métier et les handlers IPC (Jest/Vitest, cargo test), base SQLite en mémoire, tests de bout en bout avec Playwright pour Electron ou WebDriver pour Tauri, captures avant/après. À utiliser pour couvrir une fonctionnalité, reproduire un bug ou vérifier une interaction.
---

# Tests

## 1. Pyramide

| Niveau | Cible | Outil | Vitesse |
|--------|-------|-------|---------|
| Unitaire | services métier, validation, formatage, migrations | Jest / Vitest, `cargo test` | ms |
| Intégration | handlers IPC + base SQLite `:memory:` | Jest sans Electron (on appelle le handler directement) | ms |
| Bout en bout | parcours réels dans la fenêtre | Playwright `_electron`, `tauri-driver` + WebdriverIO | s |

Un bug corrigé = un test qui échouait avant le correctif.

## 2. Handler IPC sans Electron

```js
// Le module enregistre ses handlers sur l'objet passé : on lui donne un faux ipcMain.
const handlers = {};
const fakeIpc = { handle: (ch, fn) => { handlers[ch] = fn; } };
const db = openDatabase(':memory:'); migrate(db, MIGRATIONS_DIR);
register(fakeIpc, { repo: makeRepo(db), isTrustedSender: () => true });

test('lots:create refuse une référence vide', async () => {
  const res = await handlers['lots:create']({ senderFrame: {} }, { reference: '', dateEntree: '2026-10-19' });
  expect(res).toEqual({ ok: false, error: expect.objectContaining({ code: 'INVALID' }) });
});
```

Module natif (`better-sqlite3`) compilé pour Electron : il ne se charge pas sous Node de Jest. Soit `npm rebuild` avant les tests, soit `node:sqlite`, soit lancer Jest via `ELECTRON_RUN_AS_NODE=1 electron node_modules/.bin/jest`.

## 3. Bout en bout Electron (Playwright)

```js
const { _electron: electron } = require('playwright');
const { test, expect } = require('@playwright/test');

test('créer un lot', async () => {
  const app = await electron.launch({ args: ['apps/client'], env: { ...process.env, TRACEBAY_DATA_DIR: tmpDir } });
  const win = await app.firstWindow();
  await win.getByRole('button', { name: 'Nouveau lot' }).click();
  await win.getByLabel('Référence').fill('L-TEST-001');
  await win.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(win.getByRole('row', { name: /L-TEST-001/ })).toBeVisible();
  await app.close();
});
```

- Dossier de données temporaire par test (variable d'environnement lue par `main` pour surcharger `userData`), jamais la base réelle du développeur.
- `app.evaluate(({ app }) => app.getVersion())` pour inspecter le processus principal.

## 4. Tauri

`tauri-driver` + WebdriverIO (Linux et Windows ; pas macOS). Logique Rust en `cargo test`, commandes testées comme des fonctions.

## 5. Lancer

```bash
npm test                    # unitaires + intégration
npx playwright test         # bout en bout, si configuré
```

Compte rendu : nombre de tests, échecs avec la sortie, ce qui n'est pas couvert.
