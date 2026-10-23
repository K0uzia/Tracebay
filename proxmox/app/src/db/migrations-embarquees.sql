-- Migrations embarquées (reprises de proxmox.sh), appliquées après schema.sql à chaque mise à jour.
-- Idempotentes : CREATE ... IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, blocs DO conditionnels.

-- 1. Création standard
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255),
  deleted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  username VARCHAR(50),
  title VARCHAR(255) NOT NULL,
  start TIMESTAMP NOT NULL,       -- Colonne principale (pour GET)
  "end" TIMESTAMP NOT NULL,       -- Colonne principale
  start_time TIMESTAMP GENERATED ALWAYS AS (start) STORED,    -- Alias pour Init
  end_time TIMESTAMP GENERATED ALWAYS AS ("end") STORED,    -- Alias pour Init
  description TEXT,
  location VARCHAR(255),
  deleted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  username VARCHAR(50),
  text TEXT NOT NULL,
  conversation_id INTEGER,
  is_read BOOLEAN DEFAULT FALSE,
  deleted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lots (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255),
  item_count INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'received',
  received_at TIMESTAMP DEFAULT NOW(),
  finished_at TIMESTAMP,
  recovered_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lot_items (
  id SERIAL PRIMARY KEY,
  lot_id INTEGER REFERENCES lots(id) ON DELETE CASCADE,
  serial_number VARCHAR(255),
  type VARCHAR(50),
  marque_id INTEGER,
  modele_id INTEGER,
  entry_type VARCHAR(50),
  entry_date DATE,
  entry_time TIME,
  state VARCHAR(50),
  technician VARCHAR(255),
  state_changed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS marques (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) UNIQUE NOT NULL,
  deleted_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS modeles (
  id SERIAL PRIMARY KEY,
  marque_id INTEGER REFERENCES marques(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  deleted_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shortcut_categories (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  order_index INTEGER,
  deleted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS shortcuts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  url VARCHAR(255) NOT NULL,
  category_id INTEGER REFERENCES shortcut_categories(id) ON DELETE SET NULL,
  order_index INTEGER,
  deleted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 2. Migrations Unifiées
-- Fix Users password
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='password') THEN
        ALTER TABLE users RENAME COLUMN "password" TO password_hash;
    END IF;
END $$;

-- Fix Events (Support des deux noms)
DO $$ BEGIN
    -- Si on a V9 (start_time existe) mais pas start -> Renommer en start
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='start_time') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='start') THEN
        ALTER TABLE events RENAME COLUMN start_time TO start;
        ALTER TABLE events RENAME COLUMN end_time TO "end";
    END IF;

    -- Ajouter les colonnes générées si manquantes (Compatible V9 & V10)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='start_time') THEN
        ALTER TABLE events ADD COLUMN start_time TIMESTAMP GENERATED ALWAYS AS (start) STORED;
        ALTER TABLE events ADD COLUMN end_time TIMESTAMP GENERATED ALWAYS AS ("end") STORED;
    END IF;
END $$;

-- Ajout Colonnes manquantes standard
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user';
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE events ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE shortcuts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE shortcut_categories ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE lots ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE lot_items ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE lot_items ADD COLUMN IF NOT EXISTS state VARCHAR(50);
ALTER TABLE lot_items ADD COLUMN IF NOT EXISTS technician VARCHAR(255);
ALTER TABLE lot_items ADD COLUMN IF NOT EXISTS state_changed_at TIMESTAMP;
ALTER TABLE lot_items ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
ALTER TABLE marques ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE modeles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

-- Rôles utilisateurs
UPDATE users SET role = 'admin' WHERE username = 'sandersonn' AND (role IS NULL OR role = 'user');

-- Migration hash : les anciens hashes SHA256 (64 chars hex) sont incompatibles avec bcrypt.
-- On les invalide pour forcer la réinitialisation du mot de passe via le panel admin.
UPDATE users SET password_hash = NULL
  WHERE password_hash IS NOT NULL
    AND LENGTH(password_hash) = 64
    AND password_hash ~ '^[0-9a-f]+$';

-- Fix is_read, Lots, Shortcuts
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE;
ALTER TABLE lots ADD COLUMN IF NOT EXISTS name VARCHAR(255);
ALTER TABLE lots ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'received';
ALTER TABLE lots ADD COLUMN IF NOT EXISTS item_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE lots ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE lots ADD COLUMN IF NOT EXISTS received_at TIMESTAMP DEFAULT NOW();
ALTER TABLE lots ADD COLUMN IF NOT EXISTS finished_at TIMESTAMP;
ALTER TABLE lots ADD COLUMN IF NOT EXISTS recovered_at TIMESTAMP;
ALTER TABLE lots ADD COLUMN IF NOT EXISTS pdf_path VARCHAR(1024);
ALTER TABLE lots ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
ALTER TABLE lots ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE shortcuts ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES shortcut_categories(id) ON DELETE CASCADE;

-- 3. Index
CREATE INDEX IF NOT EXISTS idx_events_user_id ON events(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_shortcuts_user_id ON shortcuts(user_id);
CREATE INDEX IF NOT EXISTS idx_shortcuts_category_id ON shortcuts(category_id);
CREATE INDEX IF NOT EXISTS idx_lots_user_id ON lots(user_id);
CREATE INDEX IF NOT EXISTS idx_lot_items_lot_id ON lot_items(lot_id);

-- 4. Table pour le monitoring des erreurs clients Electron
CREATE TABLE IF NOT EXISTS client_errors (
    id SERIAL PRIMARY KEY,
    client_id TEXT NOT NULL,
    client_version TEXT,
    platform TEXT,
    error_type TEXT NOT NULL,
    error_message TEXT NOT NULL,
    error_stack TEXT,
    context TEXT,
    user_message TEXT,
    url TEXT,
    user_agent TEXT,
    timestamp TIMESTAMP DEFAULT NOW(),
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP,
    resolved_by TEXT,
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_client_errors_timestamp ON client_errors(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_client_errors_client_id ON client_errors(client_id);
CREATE INDEX IF NOT EXISTS idx_client_errors_error_type ON client_errors(error_type);
CREATE INDEX IF NOT EXISTS idx_client_errors_resolved ON client_errors(resolved);
CREATE INDEX IF NOT EXISTS idx_client_errors_type_timestamp ON client_errors(error_type, timestamp DESC);

-- Config Applications et Dossiers (persistant pour le client)
CREATE TABLE IF NOT EXISTS app_presets (
  id SERIAL PRIMARY KEY,
  preset_key VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_presets_key ON app_presets(preset_key);

CREATE TABLE IF NOT EXISTS app_preset_apps (
  id SERIAL PRIMARY KEY,
  app_preset_id INTEGER NOT NULL REFERENCES app_presets(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  command VARCHAR(500) NOT NULL,
  icon VARCHAR(100) DEFAULT 'fa-rocket',
  args TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_app_preset_apps_preset ON app_preset_apps(app_preset_id);

CREATE TABLE IF NOT EXISTS folder_globals (
  id SERIAL PRIMARY KEY,
  blacklist TEXT,
  ignore_suffixes TEXT,
  ignore_extensions TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS folder_presets (
  id SERIAL PRIMARY KEY,
  preset_key VARCHAR(100) NOT NULL UNIQUE,
  base_path VARCHAR(1024) NOT NULL DEFAULT '',
  blacklist TEXT,
  ignore_suffixes TEXT,
  ignore_extensions TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_folder_presets_key ON folder_presets(preset_key);
