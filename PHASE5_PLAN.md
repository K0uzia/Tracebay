# Phase 5: Testing & Validation - Implementation Plan

**Status:** NOT STARTED  
**Planned Date:** Phase 4 → Phase 5  
**Estimated Duration:** 4-5 hours  

---

## Overview

Phase 5 is the final validation phase ensuring all deliverables from Phases 1-4 meet quality standards, security requirements from `rules/`, and user acceptance criteria.

**Core Objectives:**
1. ✅ Unit tests for all critical modules
2. ✅ Integration tests for HTTP/WebSocket flows
3. ✅ Manual testing checklist (20+ points)
4. ✅ Security audit (CSP, CORS, JWT, SQL injection)
5. ✅ Final documentation (README, API, Architecture, Security)

---

## Part 1: Unit Tests

### 1.1 Test Structure
```
tests/
  unit/
    auth.test.js           # AuthManager & password hashing
    chat-security.test.js  # ChatSecurityManager
    server-monitor.test.js # ServerMonitor polling
    terminal-logger.test.js # TerminalLogger storage
    logs-renderer.test.js  # LogsRenderer formatting
  integration/
    http-flow.test.js      # POST /api/auth, requests
    websocket-flow.test.js # Chat, updates, broadcast
    database.test.js       # CRUD operations
  fixtures/
    mock-data.js           # Shared test data
```

### 1.2 Unit Tests to Create

**File: `apps/server/tests/unit/auth.test.js`**
```javascript
describe('AuthManager', () => {
  describe('hashPassword()', () => {
    test('should hash password with bcrypt', async () => {
      const password = 'TestPass123!';
      const hash = await authManager.hashPassword(password);
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(20);
    });

    test('should match correct password', async () => {
      const password = 'TestPass123!';
      const hash = await authManager.hashPassword(password);
      const match = await authManager.verifyPassword(password, hash);
      expect(match).toBe(true);
    });

    test('should reject incorrect password', async () => {
      const hash = await authManager.hashPassword('Pass1');
      const match = await authManager.verifyPassword('Pass2', hash);
      expect(match).toBe(false);
    });
  });

  describe('generateJWT()', () => {
    test('should generate valid JWT token', () => {
      const token = authManager.generateJWT({ userId: 1 });
      expect(token).toBeDefined();
      expect(token.split('.')).toHaveLength(3); // JWT structure
    });

    test('should decode JWT with correct payload', () => {
      const payload = { userId: 1, role: 'admin' };
      const token = authManager.generateJWT(payload);
      const decoded = authManager.verifyJWT(token);
      expect(decoded.userId).toBe(1);
      expect(decoded.role).toBe('admin');
    });

    test('should reject expired token', () => {
      const expiredToken = authManager.generateJWT({ userId: 1 }, '1ms');
      setTimeout(() => {
        expect(() => authManager.verifyJWT(expiredToken)).toThrow();
      }, 10);
    });
  });
});
```

**File: `apps/server/tests/unit/chat-security.test.js`**
```javascript
describe('ChatSecurityManager', () => {
  describe('validateMessage()', () => {
    test('should accept valid messages', () => {
      const msg = 'Hello, how are you?';
      const result = chatSecurity.validateMessage(msg);
      expect(result.valid).toBe(true);
    });

    test('should reject messages > 500 chars', () => {
      const msg = 'A'.repeat(501);
      const result = chatSecurity.validateMessage(msg);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/too long/i);
    });

    test('should reject SQL injection attempts', () => {
      const msg = "'; DROP TABLE users; --";
      const result = chatSecurity.validateMessage(msg);
      expect(result.valid).toBe(false);
    });

    test('should detect XSS patterns', () => {
      const msg = '<script>alert("xss")</script>';
      const result = chatSecurity.validateMessage(msg);
      expect(result.valid).toBe(false);
    });
  });

  describe('sanitizeMessage()', () => {
    test('should remove dangerous HTML', () => {
      const msg = '<b>Hello</b> <script>alert(1)</script>';
      const clean = chatSecurity.sanitizeMessage(msg);
      expect(clean).not.toContain('<script>');
      expect(clean).toContain('Hello');
    });
  });

  describe('rateLimit()', () => {
    test('should allow messages within limit', async () => {
      const result = await chatSecurity.checkRateLimit('user1');
      expect(result).toBe(true);
    });

    test('should reject excessive messages', async () => {
      for (let i = 0; i < 6; i++) {
        await chatSecurity.checkRateLimit('user2');
      }
      const result = await chatSecurity.checkRateLimit('user2');
      expect(result).toBe(false);
    });
  });
});
```

**File: `apps/server/tests/unit/server-monitor.test.js`**
```javascript
describe('ServerMonitor', () => {
  describe('getCPUUsage()', () => {
    test('should return CPU percentage 0-100', () => {
      const cpu = monitor.getCPUUsage();
      expect(cpu).toBeGreaterThanOrEqual(0);
      expect(cpu).toBeLessThanOrEqual(100);
      expect(typeof cpu).toBe('number');
    });
  });

  describe('getMemoryUsage()', () => {
    test('should return memory stats', () => {
      const mem = monitor.getMemoryUsage();
      expect(mem).toHaveProperty('used');
      expect(mem).toHaveProperty('total');
      expect(mem).toHaveProperty('percentage');
      expect(mem.used).toBeLessThanOrEqual(mem.total);
    });
  });

  describe('polling', () => {
    test('should update metrics every 2 seconds', async () => {
      const metrics1 = monitor.getMetrics();
      await sleep(2100);
      const metrics2 = monitor.getMetrics();
      expect(metrics2.timestamp).toBeGreaterThan(metrics1.timestamp);
    });
  });
});
```

**File: `apps/server/tests/unit/terminal-logger.test.js`**
```javascript
describe('TerminalLogger', () => {
  describe('addLog()', () => {
    test('should store log entry', () => {
      logger.addLog({ type: 'chat', message: 'Hello' });
      const logs = logger.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].message).toBe('Hello');
    });

    test('should limit storage to 100 entries', () => {
      for (let i = 0; i < 110; i++) {
        logger.addLog({ type: 'chat', message: `Msg ${i}` });
      }
      const logs = logger.getLogs();
      expect(logs.length).toBeLessThanOrEqual(100);
    });

    test('should add timestamp automatically', () => {
      logger.addLog({ type: 'chat', message: 'Test' });
      const logs = logger.getLogs();
      expect(logs[0]).toHaveProperty('timestamp');
    });
  });

  describe('clear()', () => {
    test('should remove all logs', () => {
      logger.addLog({ type: 'chat', message: 'Test' });
      logger.clear();
      expect(logger.getLogs()).toHaveLength(0);
    });
  });
});
```

### 1.3 Test Execution
```bash
# Run all unit tests
npm test

# Run specific test file
npm test -- auth.test.js

# Watch mode for development
npm test -- --watch

# Coverage report
npm test -- --coverage
```

**Expected Coverage:**
- Statements: 80%+
- Branches: 75%+
- Functions: 80%+
- Lines: 80%+

---

## Part 2: Integration Tests

### 2.1 HTTP Flow Tests

**File: `apps/server/tests/integration/http-flow.test.js`**
```javascript
describe('HTTP Flows', () => {
  let server;
  let agent;

  beforeAll(async () => {
    server = await startTestServer();
    agent = request.agent(server);
  });

  describe('Authentication Flow', () => {
    test('POST /api/auth - should authenticate user', async () => {
      const response = await agent.post('/api/auth').send({
        username: 'admin',
        password: 'SECRET_RETIRE'
      });
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(response.body.token).toMatch(/^[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]*$/);
    });

    test('POST /api/auth - should reject invalid credentials', async () => {
      const response = await agent.post('/api/auth').send({
        username: 'admin',
        password: 'wrongpass'
      });
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Monitoring Routes', () => {
    test('GET /api/monitoring/system - should return metrics', async () => {
      const response = await agent.get('/api/monitoring/system');
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('cpu');
      expect(response.body).toHaveProperty('memory');
      expect(response.body).toHaveProperty('uptime');
    });

    test('GET /api/monitoring/chat-logs - should return recent messages', async () => {
      const response = await agent.get('/api/monitoring/chat-logs?limit=10');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    test('GET /api/monitoring/request-logs - should return HTTP logs', async () => {
      const response = await agent.get('/api/monitoring/request-logs?limit=20');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      if (response.body.length > 0) {
        expect(response.body[0]).toHaveProperty('method');
        expect(response.body[0]).toHaveProperty('status');
        expect(response.body[0]).toHaveProperty('duration');
      }
    });
  });

  describe('Chat Routes', () => {
    test('POST /api/chat - should accept new message', async () => {
      const response = await agent.post('/api/chat').send({
        message: 'Test message'
      });
      expect(response.status).toBe(200) || expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
    });

    test('GET /api/chat - should return message history', async () => {
      const response = await agent.get('/api/chat?limit=50');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  afterAll(async () => {
    await server.close();
  });
});
```

### 2.2 WebSocket Flow Tests

**File: `apps/server/tests/integration/websocket-flow.test.js`**
```javascript
describe('WebSocket Flows', () => {
  let server;
  let io;

  beforeAll(async () => {
    server = await startTestServer();
    io = require('socket.io-client');
  });

  test('should connect and receive initial state', (done) => {
    const socket = io('http://localhost:8060');
    socket.on('connect', () => {
      expect(socket.connected).toBe(true);
      socket.disconnect();
      done();
    });
  });

  test('should broadcast chat message to all clients', (done) => {
    const socket1 = io('http://localhost:8060');
    const socket2 = io('http://localhost:8060');

    let received = 0;
    const checkDone = () => {
      received++;
      if (received === 2) {
        socket1.disconnect();
        socket2.disconnect();
        done();
      }
    };

    socket1.on('connect', () => {
      socket2.on('connect', () => {
        socket1.on('chat:message', (msg) => {
          expect(msg.text).toBe('Test broadcast');
          checkDone();
        });
        socket2.on('chat:message', (msg) => {
          expect(msg.text).toBe('Test broadcast');
          checkDone();
        });
        socket1.emit('chat:send', { text: 'Test broadcast' });
      });
    });
  });

  test('should send heartbeat pings', (done) => {
    const socket = io('http://localhost:8060');
    socket.on('ping', () => {
      expect(true).toBe(true);
      socket.disconnect();
      done();
    });
  }, 35000);

  afterAll(async () => {
    await server.close();
  });
});
```

### 2.3 Database Tests

**File: `apps/server/tests/integration/database.test.js`**
```javascript
describe('Database Operations', () => {
  let db;

  beforeAll(async () => {
    db = await initTestDatabase();
  });

  describe('Users Table', () => {
    test('should create user', async () => {
      const user = await db.users.create({
        username: 'testuser',
        email: 'test@example.com',
        password: 'hashed_password'
      });
      expect(user.id).toBeDefined();
      expect(user.username).toBe('testuser');
    });

    test('should read user by ID', async () => {
      const user = await db.users.findById(1);
      expect(user).toBeDefined();
      expect(user.id).toBe(1);
    });

    test('should update user', async () => {
      await db.users.update(1, { email: 'newemail@example.com' });
      const user = await db.users.findById(1);
      expect(user.email).toBe('newemail@example.com');
    });

    test('should delete user', async () => {
      const id = (await db.users.create({ username: 'temp' })).id;
      await db.users.delete(id);
      const user = await db.users.findById(id);
      expect(user).toBeUndefined();
    });
  });

  describe('Messages Table', () => {
    test('should store and retrieve chat message', async () => {
      const msg = await db.messages.create({
        userId: 1,
        text: 'Hello world',
        timestamp: new Date()
      });
      const retrieved = await db.messages.findById(msg.id);
      expect(retrieved.text).toBe('Hello world');
    });
  });

  afterAll(async () => {
    await db.close();
  });
});
```

---

## Part 3: Manual Testing Checklist

### 3.1 Frontend Functionality (Dashboard)

**Navigation & Layout**
- [ ] Header displays "Workspace Server Dashboard"
- [ ] Navigation buttons: Monitoring | Logs | Requests | Chat & Connexions | Stats
- [ ] Active page button highlights correctly
- [ ] Page content transitions smoothly
- [ ] No visual glitches or layout shifts

**Monitoring Page**
- [ ] CPU usage chart updates in real-time
- [ ] Memory usage chart updates in real-time
- [ ] Database stats card displays correct counts
- [ ] Active connections counter increments
- [ ] All metrics refresh every 2 seconds
- [ ] Cards maintain min-height 380px / max-height 600px
- [ ] Responsive on mobile (stack vertically)

**Logs Page**
- [ ] Chat logs terminal displays messages
- [ ] Terminal auto-scrolls to bottom on new message
- [ ] "Clear" button removes all logs
- [ ] Logs are color-coded by type
- [ ] Scroll works on overflow (max-height 520px)

**Requests Page**
- [ ] HTTP requests table displays requests
- [ ] Table shows: Method, Path, Status, Duration
- [ ] Status codes color-coded (200=green, 404=orange, 500=red)
- [ ] Table is scrollable with sticky header
- [ ] Methods color-coded (GET=blue, POST=green, etc.)

**Chat & Connexions Page**
- [ ] Two-column layout: Chat on left, Connections on right
- [ ] Chat terminal displays messages
- [ ] Connection table lists active connections
- [ ] Table shows: ID, IP, Connected Time, User Agent
- [ ] Responsive: Stack on mobile

**Stats Page**
- [ ] Shows overall statistics
- [ ] Displays performance metrics
- [ ] Data updates in real-time
- [ ] No errors in console

### 3.2 Server Functionality

**Authentication**
- [ ] POST /api/auth accepts username + password
- [ ] Returns JWT token on success
- [ ] Rejects invalid credentials (401)
- [ ] Token can be decoded by client
- [ ] JWT expires correctly

**Monitoring API**
- [ ] GET /api/monitoring/system returns CPU, memory, uptime
- [ ] GET /api/monitoring/chat-logs returns recent messages
- [ ] GET /api/monitoring/request-logs returns HTTP logs
- [ ] All endpoints require valid JWT or CORS origin

**Chat API**
- [ ] POST /api/chat accepts message text
- [ ] Message is stored in database
- [ ] GET /api/chat returns message history (limit-able)
- [ ] WebSocket broadcasts new messages to all clients

**WebSocket**
- [ ] Client connects successfully to ws://localhost:8060
- [ ] Receives heartbeat pings every 25 seconds
- [ ] Can emit chat:send events
- [ ] Receives chat:message broadcasts
- [ ] Graceful disconnect on close

### 3.3 Security Checks

**CORS**
- [ ] Requests from file:// accepted
- [ ] Requests from other origins rejected (if not in CORS_ORIGIN)
- [ ] Credentials included in responses

**Content Security Policy**
- [ ] CSP headers present in responses
- [ ] Inline scripts blocked
- [ ] External scripts from trusted sources only
- [ ] No "Refused to execute" errors in console

**SQL Injection**
- [ ] Message with `'; DROP TABLE messages; --` stored safely
- [ ] Character encoding prevents injection
- [ ] Special characters escaped properly

**XSS Prevention**
- [ ] HTML tags in messages are escaped
- [ ] `<script>` tags not executed
- [ ] Messages display as text only

**JWT**
- [ ] Token structure: 3 parts separated by dots
- [ ] Contains user info in payload
- [ ] Signature validates correctly
- [ ] Expired tokens rejected

**Password Storage**
- [ ] Passwords hashed with bcrypt
- [ ] Plain text not visible in database
- [ ] Same password produces different hashes
- [ ] Hash verification works correctly

### 3.4 Performance Checks

**Load Times**
- [ ] Dashboard loads in < 2 seconds
- [ ] Monitoring data updates smoothly
- [ ] No lag when clicking pages
- [ ] Responsive to user input

**Memory Usage**
- [ ] Server memory doesn't grow unbounded
- [ ] Chat logs auto-cleanup (max 100)
- [ ] Request logs auto-cleanup
- [ ] No memory leaks after 1 hour runtime

**Network**
- [ ] WebSocket messages < 100ms latency
- [ ] HTTP responses < 500ms
- [ ] No unnecessary requests
- [ ] Payload sizes reasonable

### 3.5 Responsive Design

**Desktop (1025px+)**
- [ ] Full layout with 4-column grid
- [ ] Cards: 380-600px height
- [ ] Navigation buttons full width
- [ ] Terminal: 340-520px height

**Tablet (768-1024px)**
- [ ] 2-column grid layout
- [ ] Cards: 320-480px height
- [ ] Navigation buttons wrap
- [ ] Scrollable terminal

**Mobile (< 768px)**
- [ ] Single column layout
- [ ] Buttons stack vertically
- [ ] Cards: 280-400px height
- [ ] Terminal: 200-300px height
- [ ] Touch-friendly tap targets (> 44px)

### 3.6 Browser Compatibility

**Browsers Tested**
- [ ] Chrome/Chromium (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)

**Features Tested**
- [ ] CSS Grid support
- [ ] Flexbox layout
- [ ] CSS Variables
- [ ] WebSocket support
- [ ] Fetch API
- [ ] LocalStorage

### 3.7 Error Handling

**Server Errors**
- [ ] 400 Bad Request shows error message
- [ ] 401 Unauthorized shows login prompt
- [ ] 404 Not Found shows friendly message
- [ ] 500 Server Error logs and displays message

**Network Errors**
- [ ] Connection lost shows warning
- [ ] Auto-reconnect attempts (max 3 times)
- [ ] User notified when offline
- [ ] Works after reconnection

**Client Errors**
- [ ] No JavaScript errors in console
- [ ] Graceful degradation without JavaScript
- [ ] Form validation before submit
- [ ] User-friendly error messages

---

## Part 4: Security Audit

### 4.1 Code Security

**Lines of Defense:**
- [ ] Input validation on all routes
- [ ] Output encoding in templates
- [ ] SQL parameter binding (no string concatenation)
- [ ] JWT validation on protected routes
- [ ] Rate limiting on auth endpoints
- [ ] CORS properly configured
- [ ] HTTPS in production

**Dependencies:**
- [ ] Run `npm audit` - zero critical issues
- [ ] Check for known vulnerabilities
- [ ] Update all dependencies
- [ ] Document any pinned versions

### 4.2 Configuration Security

**Environment Variables:**
- [ ] .env file in .gitignore
- [ ] .env.example doesn't contain secrets
- [ ] All secrets in .env (not in code)
- [ ] NODE_ENV set correctly (dev/prod)

**Secrets Management:**
- [ ] JWT_SECRET is long and random (32+ chars)
- [ ] SESSION_SECRET unique per deployment
- [ ] No hardcoded passwords
- [ ] Credentials never logged

### 4.3 Rules Compliance

**From `rules/manifest.mdc`:**
- [ ] CSS variables used consistently (`--bleu1`, `--blanc`, etc.)
- [ ] Semantic naming convention followed (section, block, grid-item)
- [ ] SOLID principles applied (single responsibility)
- [ ] DRY principle followed (no code duplication)

**From `rules/security.mdc`:**
- [ ] CSP headers configured
- [ ] CORS origin validated
- [ ] SQL injection prevented
- [ ] XSS protection enabled
- [ ] CSRF token considered (if needed)

**From `rules/naming-convention.mdc`:**
- [ ] File names lowercase (chat-logger.js)
- [ ] Component names kebab-case (server-dashboard.css)
- [ ] Variable names camelCase (getUserData)
- [ ] Constants SCREAMING_SNAKE_CASE

---

## Part 5: Final Documentation

### 5.1 README.md Update

**Sections to Include:**
- Quick Start (5 minutes to running app)
- Installation Instructions
- Configuration Guide (.env setup)
- Development Workflow
- Available Commands (make targets)
- Troubleshooting FAQ

**Example Structure:**
```markdown
# Workspace Application

## Quick Start

```bash
git clone <repo>
./setup-local.sh init
make all
```

Server running at: http://localhost:8060
Client running at: (Electron window)

## Installation

[Prerequisites, step-by-step setup]

## Configuration

[.env setup, available options]

## Development

[make targets, VSCode setup, debugging]

## Architecture

[Link to ARCHITECTURE.md]

## Security

[Link to SECURITY.md]
```

### 5.2 ARCHITECTURE.md

**Contents:**
- System design diagram
- Component relationships
- Data flow (HTTP + WebSocket)
- Database schema
- Directory structure
- Module responsibilities
- Design patterns used

### 5.3 API.md

**Endpoints Documented:**
- POST /api/auth - Authentication
- GET /api/monitoring/system - Metrics
- GET /api/monitoring/chat-logs - Chat history
- GET /api/monitoring/request-logs - HTTP logs
- POST /api/chat - New message
- GET /api/chat - Message history
- WebSocket events (chat:send, chat:message, etc.)

**Each Endpoint:**
- Description
- Request format
- Response format
- Error codes
- Example curl command

### 5.4 SECURITY.md

**Topics:**
- Authentication (JWT)
- Authorization (CORS, protected routes)
- Input Validation
- Output Encoding
- SQL Injection Prevention
- XSS Prevention
- CSRF Considerations
- Password Hashing
- Dependency Audit
- Deployment Checklist

---

## Acceptance Criteria for Phase 5

### Must Have
- [ ] All unit tests pass (80%+ coverage)
- [ ] All integration tests pass
- [ ] Manual testing checklist 100% complete
- [ ] Security audit zero critical issues
- [ ] Zero ESLint warnings (`npm run lint`)
- [ ] README.md complete with quick start
- [ ] API.md documents all endpoints

### Should Have
- [ ] Architecture diagram in docs/
- [ ] Security.md with audit results
- [ ] Test coverage report generated
- [ ] Performance benchmarks documented
- [ ] Known issues documented

### Nice to Have
- [ ] Visual test results (screenshots)
- [ ] User guide for dashboard
- [ ] Developer guide for extending
- [ ] Video walkthrough

---

## Phase 5 Success Criteria

**All deliverables from Phases 1-4 must pass:**
1. ✅ Code quality (ESLint 0 errors)
2. ✅ Test coverage (80%+)
3. ✅ Security audit (0 critical)
4. ✅ Manual testing (all items)
5. ✅ Documentation (complete)

**When complete, the application is ready for:**
- Production deployment
- User onboarding
- Team collaboration
- Maintenance and updates

---

## Next Steps

1. **Before Phase 5:** Code review of Phases 1-4 deliverables
2. **During Phase 5:** Execute tests and documentation
3. **After Phase 5:** Deploy and monitor production

---

*This plan is subject to adjustment based on actual implementation. Document progress in PHASE5_COMPLETION.md.*
