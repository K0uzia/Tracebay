---
name: desk-local-data
description: Met en place ou modifie le stockage local d'une application de bureau - choix SQLite (better-sqlite3, node:sqlite, tauri-plugin-sql, rusqlite), emplacement du fichier, schéma, migrations versionnées, sauvegarde et restauration, export/import, fichiers produits (PDF). À utiliser pour une nouvelle table, une migration, un mode hors ligne ou une perte de données.
---

# Données locales

## 1. Choix du moteur

| Contexte | Choix par défaut | Remarque |
|----------|------------------|----------|
| Electron, Node ≥ 22.5 embarqué (Electron ≥ 33) | `node:sqlite` (`DatabaseSync`) | aucun module natif à recompiler ; API encore marquée expérimentale, vérifier la version d'Electron |
| Electron, besoin éprouvé | `better-sqlite3` | module natif : `electron-rebuild` / `npmRebuild: true`, `asarUnpack` du `.node`, build par OS |
| Tauri | `tauri-plugin-sql` (sqlite) ou `rusqlite` dans les commandes | migrations déclarées côté Rust |
| Très peu de données, pas de requêtes | fichier JSON écrit atomiquement | au-delà de ~1 000 enregistrements ou de relations : SQLite |

Jamais `sqlite3` (asynchrone, binaire capricieux) pour un nouveau projet. Jamais d'IndexedDB comme source de vérité métier : invisible pour l'utilisateur, non sauvegardable simplement.

## 2. Emplacement et ouverture

```js
const dbPath = path.join(app.getPath('userData'), 'data', 'tracebay.sqlite');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
```

- Instance unique de l'application (`app.requestSingleInstanceLock()`) : deux processus sur la même base = corruption possible.
- Ouvrir la base dans `main` uniquement, jamais dans le renderer.
- Fermer proprement sur `before-quit` (`db.close()`).

## 3. Migrations

```
main/db/migrations/
  001_init.sql
  002_add_prets.sql
```

```js
function migrate(db, dir) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  const done = new Set(db.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version));
  const pending = fs.readdirSync(dir).filter((f) => /^\d+_.+\.sql$/.test(f)).sort()
    .filter((f) => !done.has(Number(f.split('_')[0])));
  if (!pending.length) return;
  backup(db, 'avant-migration');
  for (const f of pending) {
    db.transaction(() => {
      db.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
      db.prepare('INSERT INTO schema_migrations VALUES (?, ?)').run(Number(f.split('_')[0]), new Date().toISOString());
    })();
  }
}
```

- Une migration publiée ne se modifie jamais : on en ajoute une nouvelle.
- Migration destructive (suppression de colonne, de table) : validation humaine + sauvegarde vérifiée.
- Le schéma local reprend celui du serveur quand il existe (mêmes noms de tables et colonnes) pour garder les deux modes compatibles et permettre un import/export.

## 4. Sauvegarde et restauration

- Sauvegarde automatique avant migration et au premier lancement du jour : `db.backup(dest)` (better-sqlite3) ou `VACUUM INTO 'dest'`. Garder les N dernières (ex. 7).
- Commandes utilisateur : « Sauvegarder la base… » (boîte de dialogue d'enregistrement) et « Restaurer… » (fermeture de la base, copie, réouverture, migration).
- Restauration testée à chaque changement de schéma : une sauvegarde jamais restaurée n'est pas une sauvegarde.

## 5. Export / import

- Export JSON ou CSV par domaine, horodaté, avec la version du schéma.
- Import : validation complète avant écriture, dans une transaction, rapport des lignes refusées.
- C'est aussi le pont entre le mode local et le mode serveur (skill `desk-dual-mode`).

## 6. Requêtes

- Requêtes préparées uniquement, jamais de concaténation de valeurs dans le SQL.
- Index sur les colonnes filtrées et triées des listes ; `EXPLAIN QUERY PLAN` sur les listes principales.
- Dates en ISO 8601 (`TEXT`), identifiants stables (UUID ou entier + référence métier unique).
- Écritures multiples dans une transaction.

## 7. Fichiers produits

- PDF, exports : générés dans `main`, enregistrés via `dialog.showSaveDialog` ou dans `userData/exports/`. Nom de fichier assaini.
- Pièces jointes : copiées dans `userData/files/<id>`, référencées par chemin relatif en base.

## 8. Vérifications

- [ ] Premier lancement sans base : création + migrations.
- [ ] Lancement avec une base d'une version précédente : migration + sauvegarde créée.
- [ ] Sauvegarde puis restauration : données identiques.
- [ ] Coupure pendant une écriture (kill du processus) : base intègre (`PRAGMA integrity_check`).
- [ ] Paquet installé : le module natif se charge sur chaque OS.
