# 🗄️ Database Schema

SQLite3 database in `data/database.sqlite`

## Tables

### events

Main table for calendar events.

```sql
CREATE TABLE events (
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

CREATE INDEX idx_events_user_id ON events(user_id);
CREATE INDEX idx_events_dates ON events(start_time, end_time);
```

**Fields:**
- `id` - Unique identifier
- `user_id` - Owner (null for shared events)
- `title` - Event name (required)
- `description` - Detailed description
- `start_time` - Start datetime (ISO format)
- `end_time` - End datetime (ISO format)
- `color` - Hex color code
- `all_day` - Boolean flag
- `category` - Classification (work, personal, etc)
- `created_at` - Creation timestamp
- `updated_at` - Last modification
- `deleted_at` - Soft delete timestamp (NULL = active)

### users

User accounts.

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### event_shares

Event sharing permissions between users.

```sql
CREATE TABLE event_shares (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  shared_with_user_id INTEGER NOT NULL,
  permission TEXT DEFAULT 'view',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY(shared_with_user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### notifications

Event notifications and reminders.

```sql
CREATE TABLE notifications (
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
```

### event_recurrences

Recurring event patterns.

```sql
CREATE TABLE event_recurrences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  frequency TEXT DEFAULT 'daily',
  interval INTEGER DEFAULT 1,
  end_date TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE CASCADE
);
```

## Data Types

| Type | Description |
|------|-------------|
| `INTEGER` | Whole numbers |
| `TEXT` | Strings |
| `DATETIME` | Date and time (ISO 8601) |
| `BOOLEAN` | 0 or 1 |

## Relationships

```
users
  ├── events (one-to-many)
  ├── event_shares (one-to-many)
  └── notifications (one-to-many)

events
  ├── event_shares (one-to-many)
  ├── notifications (one-to-many)
  └── event_recurrences (one-to-one)
```

## Indexes

For performance optimization:

```
idx_events_user_id      - User lookups
idx_events_dates        - Date range queries
```

## Date Format

All dates use ISO 8601 format in UTC:

```
2024-01-15T10:00:00.000Z
```

## SQL Examples

### Get events for a user in date range

```sql
SELECT * FROM events
WHERE user_id = 1
  AND start_time >= '2024-01-01'
  AND start_time <= '2024-01-31'
  AND deleted_at IS NULL
ORDER BY start_time;
```

### Search events

```sql
SELECT * FROM events
WHERE (title LIKE '%meeting%' OR description LIKE '%meeting%')
  AND user_id = 1
  AND deleted_at IS NULL;
```

### Get event statistics

```sql
SELECT 
  COUNT(*) as total,
  category,
  COUNT(CASE WHEN DATE(start_time) = DATE('now') THEN 1 END) as today
FROM events
WHERE user_id = 1 AND deleted_at IS NULL
GROUP BY category;
```

### Soft delete

```sql
UPDATE events
SET deleted_at = CURRENT_TIMESTAMP
WHERE id = 1;
```

### Hard delete (use with caution)

```sql
DELETE FROM events WHERE id = 1;
```

## Accessing Database

### Via CLI

```bash
# Open interactive shell
sqlite3 data/database.sqlite

# Common commands inside shell
.tables                # List tables
.schema events         # Show table structure
.quit                  # Exit
```

### Via Node.js

```javascript
const db = require('./database.js');
const { dbPromise } = require('./database.js');

// Query
const events = await dbPromise.all(
  'SELECT * FROM events WHERE user_id = ?',
  [userId]
);

// Insert
const result = await dbPromise.run(
  'INSERT INTO events (title, user_id, start_time, end_time) VALUES (?, ?, ?, ?)',
  [title, userId, startTime, endTime]
);

// Update
await dbPromise.run(
  'UPDATE events SET title = ? WHERE id = ?',
  [newTitle, eventId]
);

// Delete (soft)
await dbPromise.run(
  'UPDATE events SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?',
  [eventId]
);
```

## Backup

```bash
# Manual backup
cp data/database.sqlite data/database_backup_$(date +%s).sqlite

# Automated backup
make db.backup
```

## Reset Database

```bash
# Reset to clean state (⚠️ deletes all data)
make db.reset
```

---

**See** [API.md](API.md) for REST endpoints to interact with the database.
