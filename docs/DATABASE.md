# Database Schema - PostgreSQL

Complete database schema for Workspace Proxmox Backend.

## Tables

### users
Store user accounts and authentication data.

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP,
  CONSTRAINT username_length CHECK (LENGTH(username) >= 3),
  CONSTRAINT email_format CHECK (email IS NULL OR email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$')
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_created ON users(created_at DESC);
```

### messages
Store chat messages and conversations.

```sql
CREATE TABLE messages (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id VARCHAR(255),
  text TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP,
  CONSTRAINT text_length CHECK (LENGTH(text) > 0)
);

CREATE INDEX idx_messages_user ON messages(user_id);
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_created ON messages(created_at DESC);
CREATE INDEX idx_messages_is_read ON messages(is_read) WHERE NOT is_read;
```

### events
Store calendar events and agenda items.

```sql
CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  location VARCHAR(255),
  attendees TEXT[],
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP,
  CONSTRAINT title_length CHECK (LENGTH(title) > 0),
  CONSTRAINT end_after_start CHECK (end_time > start_time)
);

CREATE INDEX idx_events_user ON events(user_id);
CREATE INDEX idx_events_start_time ON events(start_time);
CREATE INDEX idx_events_date_range ON events(start_time, end_time);
CREATE INDEX idx_events_deleted ON events(deleted_at) WHERE deleted_at IS NULL;
```

### activity_logs
Store audit trail and system activities.

```sql
CREATE TABLE activity_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(255) NOT NULL,
  metadata JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT action_length CHECK (LENGTH(action) > 0)
);

CREATE INDEX idx_activity_logs_user ON activity_logs(user_id);
CREATE INDEX idx_activity_logs_action ON activity_logs(action);
CREATE INDEX idx_activity_logs_created ON activity_logs(created_at DESC);
CREATE INDEX idx_activity_logs_metadata ON activity_logs USING gin(metadata);
```

### lots
Store receiving/réception lot information.

```sql
CREATE TABLE lots (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  status VARCHAR(50) NOT NULL,
  item_count INTEGER NOT NULL,
  description TEXT,
  received_at TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT item_count_positive CHECK (item_count > 0),
  CONSTRAINT status_valid CHECK (status IN ('received', 'processing', 'completed', 'rejected'))
);

CREATE INDEX idx_lots_user ON lots(user_id);
CREATE INDEX idx_lots_status ON lots(status);
CREATE INDEX idx_lots_received ON lots(received_at DESC);
```

### shortcuts
Store user shortcuts and quick actions.

```sql
CREATE TABLE shortcuts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  icon VARCHAR(100),
  action_type VARCHAR(100),
  action_data JSONB,
  order_index INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT name_length CHECK (LENGTH(name) > 0)
);

CREATE INDEX idx_shortcuts_user ON shortcuts(user_id);
CREATE INDEX idx_shortcuts_order ON shortcuts(user_id, order_index);
```

## Relationships

```
users (1) ──── (N) messages
      ├─ (1) ──── (N) events
      ├─ (1) ──── (N) activity_logs
      ├─ (1) ──── (N) lots
      └─ (1) ──── (N) shortcuts
```

## Performance Considerations

### Indexes
- All foreign key columns are indexed for JOINs
- Frequently searched columns (username, status) are indexed
- Date columns are indexed for range queries
- Boolean/status columns with WHERE clauses are indexed

### Partitioning (Future)
Consider partitioning on `created_at` for large tables:
```sql
CREATE TABLE messages_2026_01 PARTITION OF messages
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
```

### Views (Optional)
```sql
-- Active users
CREATE VIEW active_users AS
  SELECT * FROM users WHERE last_login > NOW() - INTERVAL '7 days';

-- Recent messages
CREATE VIEW recent_messages AS
  SELECT * FROM messages WHERE created_at > NOW() - INTERVAL '24 hours';

-- Pending events
CREATE VIEW pending_events AS
  SELECT * FROM events WHERE start_time > NOW() AND deleted_at IS NULL;
```

## Migration Path: SQLite → PostgreSQL

### Step 1: Backup
```bash
sqlite3 workspace.db ".dump" > workspace_backup.sql
```

### Step 2: Export data
```sql
-- SQLite
.mode csv
.output users.csv
SELECT * FROM users;
```

### Step 3: Import to PostgreSQL
```sql
COPY users FROM 'users.csv' WITH (FORMAT csv, HEADER);
```

### Step 4: Reset sequences
```sql
SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));
SELECT setval('messages_id_seq', (SELECT MAX(id) FROM messages));
```

## Security Notes

- All user input should be parameterized (use prepared statements)
- Passwords must be hashed before storage (bcryptjs with salt rounds >= 10)
- Sensitive data in metadata should be encrypted
- Activity logs should not contain passwords or tokens
- Database user should have minimal required permissions
- Enable SSL connections to database

## Monitoring Queries

```sql
-- Active connections
SELECT datname, count(*) FROM pg_stat_activity GROUP BY datname;

-- Largest tables
SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC;

-- Slow queries
SELECT query, calls, mean_exec_time FROM pg_stat_statements 
ORDER BY mean_exec_time DESC LIMIT 10;

-- Index usage
SELECT schemaname, tablename, indexname, idx_scan 
FROM pg_stat_user_indexes ORDER BY idx_scan ASC;
```
