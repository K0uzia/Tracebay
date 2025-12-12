const sqlite3 = require('sqlite3');
const path = require('path');
const fs = require('fs');
const logger = require('./logger.js');
require('dotenv').config();

function validateDBPath(dbPath) {
    const dir = path.dirname(dbPath);
    
    if (!path.isAbsolute(dbPath)) {
        throw new Error(`Le chemin DB doit être absolu: ${dbPath}`);
    }
    
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        logger.info(`📁 Répertoire DB créé: ${dir}`);
    }
    
    return dbPath;
}

const dbPath = validateDBPath(
    process.env.DB_PATH 
        ? path.resolve(process.env.DB_PATH)
        : path.join(__dirname, 'data', 'database.sqlite')
);

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        logger.error('❌ Erreur connexion BDD:', err);
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
    `;

    db.exec(sql, (err) => {
        if (err) {
            logger.error('❌ Erreur initialisation tables:', err);
            throw err;
        }
        logger.info('✅ Tables BDD initialisées');
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
