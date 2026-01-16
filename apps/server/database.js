const sqlite3 = require('sqlite3');
const path = require('path');
const fs = require('fs');
try { require('dotenv').config(); } catch (_) {}

// Simple logger if logger.js not available
const logger = {
  info: (msg) => console.log(`ℹ️  ${msg}`),
  error: (msg) => console.error(`❌ ${msg}`),
  warn: (msg) => console.warn(`⚠️  ${msg}`)
};

function validateDBPath(dbPath) {
  const dir = path.dirname(dbPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    logger.info(`📁 Répertoire DB créé: ${dir}`);
  }

  return dbPath;
}

const dbPath = validateDBPath(
  path.resolve(
    process.env.DATABASE_PATH ||
        path.join(__dirname, 'data', 'workspace.db')
  )
);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    logger.error(`Connexion BDD échouée: ${err.message}`);
    throw err;
  }
  logger.info(`✅ Connexion BDD: ${dbPath}`);
  initializeTables();
});

function initializeTables() {
  const sql = `
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS shortcuts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            category_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            url TEXT NOT NULL,
            position INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS shortcut_categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            position INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_shortcuts_user_id ON shortcuts(user_id);
        CREATE INDEX IF NOT EXISTS idx_shortcut_categories_user_id ON shortcut_categories(user_id);

        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            title TEXT NOT NULL,
            description TEXT,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            color TEXT DEFAULT '#3788d8',
            all_day BOOLEAN DEFAULT 0,
            category TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at DATETIME DEFAULT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_events_user_id ON events(user_id);
        CREATE INDEX IF NOT EXISTS idx_events_dates ON events(start_time, end_time);

        CREATE TABLE IF NOT EXISTS event_shares (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id INTEGER NOT NULL,
            shared_with_user_id INTEGER NOT NULL,
            permission TEXT DEFAULT 'view',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE CASCADE,
            FOREIGN KEY(shared_with_user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            event_id INTEGER NOT NULL,
            type TEXT DEFAULT 'event_reminder',
            message TEXT,
            read_at DATETIME DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS event_recurrences (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_id INTEGER NOT NULL,
            frequency TEXT DEFAULT 'daily',
            interval INTEGER DEFAULT 1,
            end_date TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            pseudo TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);
        CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON chat_messages(user_id);

        -- Marques (Brands)
        CREATE TABLE IF NOT EXISTS marques (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        -- Modeles (Models) 
        CREATE TABLE IF NOT EXISTS modeles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            marque_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(marque_id) REFERENCES marques(id) ON DELETE CASCADE,
            UNIQUE(marque_id, name)
        );

        CREATE INDEX IF NOT EXISTS idx_modeles_marque_id ON modeles(marque_id);

        -- Lots (batches) table
        CREATE TABLE IF NOT EXISTS lots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            finished_at DATETIME DEFAULT NULL,
            recovered_at DATETIME DEFAULT NULL,
            pdf_path TEXT DEFAULT NULL,
            lot_name TEXT DEFAULT NULL,
            lot_details TEXT DEFAULT NULL
        );

        -- Items (PCs) within a lot
        CREATE TABLE IF NOT EXISTS lot_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lot_id INTEGER NOT NULL,
            serial_number TEXT,
            type TEXT,
            marque_id INTEGER,
            modele_id INTEGER,
            entry_type TEXT,
            date TEXT,
            time TEXT,
            state TEXT DEFAULT 'À faire',
            technician TEXT DEFAULT NULL,
            state_changed_at DATETIME DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(lot_id) REFERENCES lots(id) ON DELETE CASCADE,
            FOREIGN KEY(marque_id) REFERENCES marques(id) ON DELETE SET NULL,
            FOREIGN KEY(modele_id) REFERENCES modeles(id) ON DELETE SET NULL
        );

        CREATE INDEX IF NOT EXISTS idx_lot_items_lot_id ON lot_items(lot_id);
        CREATE INDEX IF NOT EXISTS idx_lot_items_state ON lot_items(state);
    `;

  db.exec(sql, (err) => {
    if (err) {
      logger.error(`Initialisation tables échouée: ${err.message}`);
    } else {
      logger.info('✅ Tables BDD initialisées');

      // Migration: Ajouter recovered_at si nécessaire
      db.all('PRAGMA table_info(lots)', (pragmaErr, columns) => {
        if (pragmaErr) {
          logger.error(`Erreur vérification colonne: ${pragmaErr.message}`);
          return;
        }
        const hasRecoveredAt = columns.some(col => col.name === 'recovered_at');
        if (!hasRecoveredAt) {
          db.run('ALTER TABLE lots ADD COLUMN recovered_at DATETIME DEFAULT NULL', (alterErr) => {
            if (alterErr) logger.error(`Erreur ajout recovered_at: ${alterErr.message}`);
            else logger.info('✅ Colonne recovered_at ajoutée à la table lots');
          });
        }
      });

      // Migration: Remplir les positions manquantes dans shortcuts
      db.all('PRAGMA table_info(shortcuts)', (pragmaErr, columns) => {
        if (pragmaErr) {
          logger.error(`Erreur vérification colonne shortcuts: ${pragmaErr.message}`);
          return;
        }
        const hasPosition = columns.some(col => col.name === 'position');
        if (!hasPosition) {
          // Ajouter la colonne position si elle n'existe pas
          db.run('ALTER TABLE shortcuts ADD COLUMN position INTEGER DEFAULT 0', (alterErr) => {
            if (alterErr) logger.error(`Erreur ajout colonne position: ${alterErr.message}`);
            else {
              logger.info('✅ Colonne position ajoutée à la table shortcuts');
              // Maintenant remplir les positions
              db.run(`
                                UPDATE shortcuts 
                                SET position = ROWID - 1
                            `, (updateErr) => {
                if (updateErr) logger.error(`Erreur migration positions: ${updateErr.message}`);
                else logger.info('✅ Migration positions raccourcis complétée');
              });
            }
          });
        } else {
          // La colonne existe, remplir les positions NULL
          db.run(`
                        UPDATE shortcuts 
                        SET position = ROWID - 1
                        WHERE position IS NULL OR position < 0
                    `, (updateErr) => {
            if (updateErr) logger.error(`Erreur migration positions: ${updateErr.message}`);
            else logger.info('✅ Migration positions raccourcis complétée');
          });
        }
      });
    }
  });
}

const dbPromise = {
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  },

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  },

  transaction(fn) {
    return new Promise((resolve, reject) => {
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) return reject(err);

        fn().then(result => {
          db.run('COMMIT', (err) => {
            if (err) reject(err);
            else resolve(result);
          });
        }).catch(error => {
          db.run('ROLLBACK', () => reject(error));
        });
      });
    });
  }
};

function closeDatabase() {
  return new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) {
        logger.error('❌ Erreur fermeture BDD:', err);
        reject(err);
      } else {
        logger.info('✅ BDD fermée');
        resolve();
      }
    });
  });
}

module.exports = db;
module.exports.dbPromise = dbPromise;
module.exports.closeDatabase = closeDatabase;
