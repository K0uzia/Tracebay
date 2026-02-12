-- Migration: Création de la table client_errors pour le système de monitoring
-- Date: 2026-02-12
-- Description: Stocke les erreurs envoyées par les clients Electron pour monitoring local

CREATE TABLE IF NOT EXISTS client_errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved BOOLEAN DEFAULT 0,
    resolved_at DATETIME,
    resolved_by TEXT,
    notes TEXT
);

-- Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_client_errors_timestamp ON client_errors(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_client_errors_client_id ON client_errors(client_id);
CREATE INDEX IF NOT EXISTS idx_client_errors_error_type ON client_errors(error_type);
CREATE INDEX IF NOT EXISTS idx_client_errors_resolved ON client_errors(resolved);

-- Index composite pour les statistiques
CREATE INDEX IF NOT EXISTS idx_client_errors_type_timestamp ON client_errors(error_type, timestamp DESC);
