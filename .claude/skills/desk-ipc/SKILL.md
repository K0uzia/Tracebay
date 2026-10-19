---
name: desk-ipc
description: Conçoit, ajoute ou revoit un canal IPC Electron (ipcMain.handle / preload) ou une commande Tauri - nommage, contrat unique, validation des arguments, erreurs, événements main vers renderer, tests. À utiliser dès qu'une vue a besoin d'une donnée ou d'une action du processus principal.
---

# Contrat IPC

## 1. Règles

- Une seule source du contrat : un fichier (`ipc-contract.js` ou `src-tauri/src/commands/mod.rs`) liste chaque canal, ses arguments, son résultat. Preload, handlers et tests en dérivent.
- Nommage `domaine:action` (`lots:list`, `lots:create`, `pdf:export`, `app:version`). Événements poussés : `domaine:evenement` (`sync:status`, `update:available`).
- Requête/réponse : `ipcMain.handle` + `ipcRenderer.invoke`. `ipcMain.on`/`send` seulement pour des événements sans réponse.
- Arguments : un seul objet sérialisable (pas de fonction, pas de classe, pas de `Buffer` géant ; fichiers lourds par chemin choisi côté `main`).
- Validation dans le handler, jamais seulement dans le renderer.
- Réponse : `{ ok: true, data }` ou `{ ok: false, error: { code, message } }`. `message` lisible par l'utilisateur, aucun détail interne (pile, SQL, chemin).

## 2. Gabarit Electron

```js
// main/ipc/lots.js
const { z } = require('zod'); // ou validation manuelle si on refuse la dépendance

const CreateLot = z.object({
  reference: z.string().trim().min(1).max(64),
  dateEntree: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(2000).optional(),
});

function register(ipcMain, { repo, isTrustedSender }) {
  ipcMain.handle('lots:create', async (event, payload) => {
    if (!isTrustedSender(event.senderFrame)) return fail('FORBIDDEN', 'Action refusée.');
    const parsed = CreateLot.safeParse(payload);
    if (!parsed.success) return fail('INVALID', 'Données du lot invalides.');
    try {
      return { ok: true, data: await repo.lots.create(parsed.data) };
    } catch (e) {
      log.error('lots:create', e);
      return fail('INTERNAL', 'Le lot n\'a pas pu être enregistré.');
    }
  });
}
const fail = (code, message) => ({ ok: false, error: { code, message } });
```

`isTrustedSender` : vérifier que `senderFrame.url` est bien une page de l'application (`file://…/public/` ou `app://`).

## 3. Côté renderer

```js
const res = await window.api.lots.create({ reference, dateEntree });
if (!res.ok) return showError(res.error.message);
render(res.data);
```

Le renderer appelle toujours la même interface, quel que soit le mode (serveur ou local) : skill `desk-dual-mode`.

## 4. Tauri

```rust
#[derive(serde::Deserialize)]
pub struct CreateLot { reference: String, date_entree: String, notes: Option<String> }

#[tauri::command]
pub async fn lots_create(state: tauri::State<'_, Db>, input: CreateLot) -> Result<Lot, String> {
    if input.reference.trim().is_empty() || input.reference.len() > 64 {
        return Err("Référence invalide.".into());
    }
    state.create_lot(input).await.map_err(|e| { log::error!("lots_create: {e}"); "Le lot n'a pas pu être enregistré.".into() })
}
```

Côté JS : `invoke('lots_create', { input })`. Enregistrer la commande dans `generate_handler!` et l'autoriser dans la capacité.

## 5. Checklist d'ajout d'un canal

1. Ajouter l'entrée au contrat.
2. Handler avec validation + gestion d'erreur.
3. Exposer dans le preload (liste blanche) ou la capacité Tauri.
4. Test du handler sans fenêtre (skill `desk-testing`) : entrée valide, invalide, erreur interne.
5. `check-desktop.mjs` vert.
6. Retirer les canaux qui ne sont plus appelés (grep du nom dans le renderer).
