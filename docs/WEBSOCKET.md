# WebSocket Protocol

Real-time communication protocol for Workspace Proxmox Backend.

## Connection

### Establishing Connection
```javascript
const ws = new WebSocket('ws://localhost:4000/ws?username=john_doe');

ws.onopen = () => {
  console.log('Connected');
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Received:', message);
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

ws.onclose = () => {
  console.log('Disconnected');
};
```

---

## Message Types

### Client → Server

#### message:send
Send a chat message.

**Format:**
```json
{
  "type": "message:send",
  "text": "Hello everyone!"
}
```

**Server Response:**
Broadcasted to all connected users as `message:new` event.

---

#### presence:update
Update user presence status.

**Format:**
```json
{
  "type": "presence:update",
  "status": "online" | "away" | "busy" | "offline"
}
```

**Valid Statuses:**
- `online` - Active and available
- `away` - Inactive but available
- `busy` - Do not disturb
- `offline` - Offline

**Server Response:**
Broadcasted to all other users.

---

#### typing:indicator
Send typing indicator.

**Format:**
```json
{
  "type": "typing:indicator",
  "isTyping": true | false
}
```

**Server Response:**
Broadcasted to all other users when typing starts/stops.

---

### Server → Client

#### connected
Sent immediately after connection.

**Format:**
```json
{
  "type": "connected",
  "userId": "ws_user_1704993600000",
  "username": "john_doe",
  "timestamp": "2026-01-16T10:00:00.000Z",
  "connectedUsers": 5
}
```

---

#### message:new
New message received (from any user).

**Format:**
```json
{
  "type": "message:new",
  "data": {
    "id": "msg_1704993600001",
    "userId": "user_1",
    "username": "john_doe",
    "text": "Hello everyone!",
    "createdAt": "2026-01-16T10:00:00.000Z"
  }
}
```

---

#### presence:update
User presence status changed.

**Format:**
```json
{
  "type": "presence:update",
  "data": {
    "userId": "user_1",
    "username": "john_doe",
    "status": "online" | "away" | "busy" | "offline"
  }
}
```

---

#### typing:indicator
User typing status changed.

**Format:**
```json
{
  "type": "typing:indicator",
  "data": {
    "userId": "user_1",
    "username": "john_doe",
    "isTyping": true | false
  }
}
```

---

## Example Client Implementation

```javascript
class WorkspaceWebSocket {
  constructor(url, username) {
    this.url = url;
    this.username = username;
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 3000;
  }

  connect() {
    this.ws = new WebSocket(`${this.url}?username=${this.username}`);

    this.ws.onopen = () => {
      console.log('✅ Connected to Workspace');
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      this.handleMessage(message);
    };

    this.ws.onerror = (error) => {
      console.error('❌ WebSocket error:', error);
    };

    this.ws.onclose = () => {
      console.log('❌ Disconnected from Workspace');
      this.attemptReconnect();
    };
  }

  handleMessage(message) {
    switch (message.type) {
      case 'connected':
        console.log(`Connected as ${message.username} (${message.connectedUsers} users online)`);
        break;

      case 'message:new':
        console.log(`📨 ${message.data.username}: ${message.data.text}`);
        this.onMessageReceived?.(message.data);
        break;

      case 'presence:update':
        console.log(`👤 ${message.data.username} is ${message.data.status}`);
        this.onPresenceUpdate?.(message.data);
        break;

      case 'typing:indicator':
        if (message.data.isTyping) {
          console.log(`⌨️  ${message.data.username} is typing...`);
        }
        this.onTypingUpdate?.(message.data);
        break;

      default:
        console.warn(`Unknown message type: ${message.type}`);
    }
  }

  sendMessage(text) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('WebSocket not connected');
      return;
    }

    this.ws.send(JSON.stringify({
      type: 'message:send',
      text
    }));
  }

  setPresence(status) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('WebSocket not connected');
      return;
    }

    this.ws.send(JSON.stringify({
      type: 'presence:update',
      status
    }));
  }

  setTyping(isTyping) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    this.ws.send(JSON.stringify({
      type: 'typing:indicator',
      isTyping
    }));
  }

  attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    console.log(`Reconnecting in ${this.reconnectDelay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connect();
    }, this.reconnectDelay);
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

// Usage
const ws = new WorkspaceWebSocket('ws://localhost:4000/ws', 'john_doe');
ws.onMessageReceived = (message) => {
  // Handle new message
};
ws.onPresenceUpdate = (presence) => {
  // Handle presence update
};
ws.onTypingUpdate = (typing) => {
  // Handle typing indicator
};

ws.connect();
ws.sendMessage('Hello everyone!');
ws.setPresence('online');
```

---

## Connection Best Practices

1. **Reconnection Logic:** Implement exponential backoff for reconnection attempts
2. **Message Queuing:** Queue messages while disconnected
3. **Heartbeat:** Send periodic ping messages to detect stale connections
4. **Error Handling:** Gracefully handle disconnections and errors
5. **Resource Cleanup:** Clean up event listeners when disconnecting

---

## Performance Considerations

- Maximum payload size: 1 MB
- Connection timeout: 30 seconds
- Message rate limit: 100 messages per minute per user
- Maximum concurrent connections per user: 3

---

## Security Notes

- WebSocket connections should use WSS (secure) in production
- Validate all incoming messages
- Sanitize message content before broadcasting
- Implement rate limiting to prevent spam
- Close idle connections after 5 minutes
