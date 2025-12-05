/**
 * DATABASE.JS - Configuration SQLite3
 * Gestion centralisée de la base de données Workspace
 */

const sqlite3 = require('sqlite3');
const path = require('path');
require('dotenv').config();

// Chemin de la base de données (utilise .env ou défaut)
const dbPath = process.env.DB_PATH 
    ? path.resolve(process.env.DB_PATH)
    : path.join(__dirname, 'data', 'database.sqlite');

// Configuration SQLite3
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Erreur connexion BDD:', err.message);
    } else {
        initializeTables();
    }
});

/**
 * Initialiser les tables de la base de données (synchrone avec exec)
 */
function initializeTables() {
    const sql = `
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

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
            console.error('❌ Erreur initialisation tables:', err.message);
        }
    });
}

/**
 * Wrapper Promise pour les requêtes DB
 */
const dbPromise = {
    /**
     * Exécuter une requête (INSERT, UPDATE, DELETE)
     */
    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve({ id: this.lastID, changes: this.changes });
            });
        });
    },

    /**
     * Récupérer une ligne
     */
    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    },

    /**
     * Récupérer plusieurs lignes
     */
    all(sql, params = []) {
        return new Promise((resolve, reject) => {
            db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
    },

    /**
     * Exécuter une transaction
     */
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

/**
 * Fermer la connexion à la BDD
 */
function closeDatabase() {
    return new Promise((resolve, reject) => {
        db.close((err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

module.exports = db;
module.exports.dbPromise = dbPromise;
module.exports.closeDatabase = closeDatabase;
