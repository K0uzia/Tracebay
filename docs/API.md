# API Reference - Proxmox Backend

Complete API documentation for Workspace Proxmox Backend (Fastify).

## Base URL

- **Development:** `http://localhost:4000`
- **Production:** `https://api.workspace.local:4000`

## Authentication

All endpoints except `/api/health` require authentication via JWT token in Authorization header:

```bash
Authorization: Bearer <token>
```

---

## Health & Monitoring

### Health Check
Get server health status.

**Request:**
```http
GET /api/health
```

**Response (200):**
```json
{
  "status": "ok",
  "timestamp": "2026-01-16T10:00:00.000Z",
  "uptime": 3600,
  "environment": "development",
  "version": "2.0.0"
}
```

### Monitoring Stats
Get real-time statistics.

**Request:**
```http
GET /api/monitoring/stats
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "stats": {
    "connectedUsers": 5,
    "messagesPerMinute": 2.5,
    "memoryUsage": {
      "rss": "45.23 MB",
      "heapUsed": "23.45 MB",
      "heapTotal": "56.78 MB"
    },
    "uptime": "120.50 minutes"
  }
}
```

---

## Authentication

### Login
Authenticate user and get JWT token.

**Request:**
```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "john_doe",
  "password": "secure_password_123"
}
```

**Response (200):**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user_1704993600000",
    "username": "john_doe",
    "createdAt": "2026-01-16T10:00:00.000Z"
  }
}
```

**Response (400):**
```json
{
  "error": "Username and password required"
}
```

### Logout
Invalidate current session.

**Request:**
```http
POST /api/auth/logout
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

### Verify Token
Verify JWT token validity.

**Request:**
```http
POST /api/auth/verify
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "valid": true,
  "userId": "user_1704993600000",
  "expiresAt": "2026-01-23T10:00:00.000Z"
}
```

**Response (401):**
```json
{
  "error": "Invalid token"
}
```

---

## Events (Agenda)

### List Events
Get all events for user.

**Request:**
```http
GET /api/events
Authorization: Bearer <token>
```

**Query Parameters:**
- `from` (optional): ISO date string (e.g., `2026-01-01`)
- `to` (optional): ISO date string (e.g., `2026-01-31`)
- `limit` (optional): Maximum results (default: 50)

**Response (200):**
```json
{
  "success": true,
  "events": [
    {
      "id": "evt_1704993600000",
      "title": "Team Meeting",
      "start": "2026-01-16T14:00:00.000Z",
      "end": "2026-01-16T15:00:00.000Z",
      "location": "Conference Room A",
      "attendees": ["user_2", "user_3"],
      "createdAt": "2026-01-16T10:00:00.000Z"
    }
  ]
}
```

### Create Event
Create new calendar event.

**Request:**
```http
POST /api/events
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "New Meeting",
  "start": "2026-01-17T14:00:00Z",
  "end": "2026-01-17T15:00:00Z",
  "location": "Conference Room B",
  "description": "Quarterly planning meeting"
}
```

**Response (201):**
```json
{
  "success": true,
  "event": {
    "id": "evt_1704993600001",
    "title": "New Meeting",
    "start": "2026-01-17T14:00:00.000Z",
    "end": "2026-01-17T15:00:00.000Z",
    "location": "Conference Room B",
    "createdAt": "2026-01-16T10:00:00.000Z"
  }
}
```

---

## Messages (Chat)

### List Messages
Get chat messages.

**Request:**
```http
GET /api/messages
Authorization: Bearer <token>
```

**Query Parameters:**
- `limit` (optional): Maximum results (default: 50)
- `conversation` (optional): Filter by conversation

**Response (200):**
```json
{
  "success": true,
  "messages": [
    {
      "id": "msg_1704993600000",
      "userId": "user_1",
      "username": "john_doe",
      "text": "Hello everyone!",
      "createdAt": "2026-01-16T10:00:00.000Z"
    }
  ],
  "total": 1
}
```

### Send Message
Post new message to chat.

**Request:**
```http
POST /api/messages
Authorization: Bearer <token>
Content-Type: application/json

{
  "text": "Hello everyone!",
  "userId": "user_1"
}
```

**Response (201):**
```json
{
  "success": true,
  "message": {
    "id": "msg_1704993600001",
    "userId": "user_1",
    "text": "Hello everyone!",
    "createdAt": "2026-01-16T10:00:00.000Z"
  }
}
```

---

## Shortcuts

### List Shortcuts
Get user shortcuts.

**Request:**
```http
GET /api/shortcuts
Authorization: Bearer <token>
```

**Response (200):**
```json
{
  "success": true,
  "shortcuts": [
    {
      "id": "sc_1",
      "name": "Meeting",
      "description": "Schedule a meeting",
      "icon": "calendar"
    }
  ]
}
```

### Create Shortcut
Create new shortcut.

**Request:**
```http
POST /api/shortcuts
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Quick Report",
  "description": "Generate weekly report",
  "icon": "file-chart"
}
```

**Response (201):**
```json
{
  "success": true,
  "shortcut": {
    "id": "sc_2",
    "name": "Quick Report",
    "description": "Generate weekly report",
    "icon": "file-chart",
    "createdAt": "2026-01-16T10:00:00.000Z"
  }
}
```

---

## Lots (Réception)

### List Lots
Get all receiving lots.

**Request:**
```http
GET /api/lots
Authorization: Bearer <token>
```

**Query Parameters:**
- `status` (optional): Filter by status (received, processing, completed, rejected)
- `limit` (optional): Maximum results (default: 50)

**Response (200):**
```json
{
  "success": true,
  "lots": [
    {
      "id": "lot_1704993600000",
      "status": "received",
      "itemCount": 5,
      "receivedAt": "2026-01-16T10:00:00.000Z"
    }
  ]
}
```

### Create Lot
Create new receiving lot.

**Request:**
```http
POST /api/lots
Authorization: Bearer <token>
Content-Type: application/json

{
  "itemCount": 10,
  "description": "Electronics shipment"
}
```

**Response (201):**
```json
{
  "success": true,
  "lot": {
    "id": "lot_1704993600001",
    "itemCount": 10,
    "description": "Electronics shipment",
    "status": "received",
    "receivedAt": "2026-01-16T10:00:00.000Z"
  }
}
```

---

## Error Responses

All error responses follow this format:

```json
{
  "error": "Error message",
  "statusCode": 400,
  "timestamp": "2026-01-16T10:00:00.000Z"
}
```

### Common Status Codes

| Code | Meaning |
|------|---------|
| 200 | OK |
| 201 | Created |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 500 | Internal Server Error |

---

## Rate Limiting

API rate limits:
- **Default:** 100 requests per 15 minutes per IP
- **Auth:** 10 login attempts per 5 minutes

---

## Pagination

For list endpoints, use query parameters:

```http
GET /api/messages?limit=25&offset=50
```

Response includes:
```json
{
  "data": [...],
  "total": 500,
  "limit": 25,
  "offset": 50,
  "pages": 20
}
```
