# 🔌 API Reference

Base URL: `http://localhost:3000`

## Events API

### List Events

```http
GET /api/agenda/events?start=2024-01-01&end=2024-01-31&user_id=1
```

**Query Parameters:**
- `start` (required) - Start date (ISO format)
- `end` (required) - End date (ISO format)
- `user_id` (optional) - Filter by user

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "user_id": 1,
      "title": "Meeting",
      "description": "Team sync",
      "start_time": "2024-01-15T10:00:00",
      "end_time": "2024-01-15T11:00:00",
      "color": "#3788d8",
      "all_day": false,
      "category": "work",
      "created_at": "2024-01-01T09:00:00",
      "updated_at": "2024-01-01T09:00:00",
      "deleted_at": null
    }
  ]
}
```

### Get Single Event

```http
GET /api/agenda/events/1
```

**Response:**
```json
{
  "success": true,
  "data": { ...event object... }
}
```

### Create Event

```http
POST /api/agenda/events
Content-Type: application/json

{
  "user_id": 1,
  "title": "New Meeting",
  "description": "Optional description",
  "start_time": "2024-01-15T10:00:00",
  "end_time": "2024-01-15T11:00:00",
  "color": "#3788d8",
  "all_day": false,
  "category": "work"
}
```

**Required Fields:**
- `title`
- `start_time`
- `end_time`

**Response:** (201 Created)
```json
{
  "success": true,
  "message": "Event created successfully",
  "data": { ...created event... }
}
```

### Update Event

```http
PUT /api/agenda/events/1
Content-Type: application/json

{
  "title": "Updated Meeting",
  "description": "New description"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Event updated successfully",
  "data": { ...updated event... }
}
```

### Delete Event (Soft Delete)

```http
DELETE /api/agenda/events/1
```

**Response:**
```json
{
  "success": true,
  "message": "Event deleted successfully"
}
```

### Search Events

```http
GET /api/agenda/search?query=meeting&user_id=1
```

**Query Parameters:**
- `query` (required) - Search term
- `user_id` (optional) - Filter by user

**Response:**
```json
{
  "success": true,
  "data": [ ...matching events... ]
}
```

### Event Statistics

```http
GET /api/agenda/stats?user_id=1
```

**Response:**
```json
{
  "success": true,
  "data": {
    "total_events": 42,
    "events_today": 3,
    "events_this_month": 15,
    "categories": {
      "work": 25,
      "personal": 17
    }
  }
}
```

## Health Check

```http
GET /api/health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00Z",
  "version": "1.0.0"
}
```

## Error Responses

### 400 Bad Request

```json
{
  "success": false,
  "message": "Title and dates are required"
}
```

### 404 Not Found

```json
{
  "success": false,
  "message": "Event not found"
}
```

### 500 Server Error

```json
{
  "success": false,
  "message": "Internal server error"
}
```

## Examples

### Using curl

```bash
# Get all events in January
curl "http://localhost:3000/api/agenda/events?start=2024-01-01&end=2024-01-31"

# Create new event
curl -X POST http://localhost:3000/api/agenda/events \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Meeting",
    "start_time": "2024-01-15T10:00:00",
    "end_time": "2024-01-15T11:00:00"
  }'

# Update event
curl -X PUT http://localhost:3000/api/agenda/events/1 \
  -H "Content-Type: application/json" \
  -d '{"title": "Updated Meeting"}'

# Delete event
curl -X DELETE http://localhost:3000/api/agenda/events/1

# Search
curl "http://localhost:3000/api/agenda/search?query=team"
```

### Using JavaScript

```javascript
// Fetch events
const response = await fetch('/api/agenda/events?start=2024-01-01&end=2024-01-31');
const data = await response.json();

// Create event
const newEvent = await fetch('/api/agenda/events', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: 'New Event',
    start_time: '2024-01-15T10:00:00',
    end_time: '2024-01-15T11:00:00'
  })
});

// Update event
await fetch('/api/agenda/events/1', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: 'Updated' })
});

// Delete event
await fetch('/api/agenda/events/1', { method: 'DELETE' });
```

## Event Colors

Standard colors available:

```
#3788d8   - Blue (default)
#28a745   - Green
#dc3545   - Red
#ffc107   - Orange
#6f42c1   - Purple
```

---

**Note:** All timestamps are in ISO 8601 format (UTC).
