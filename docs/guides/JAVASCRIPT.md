# 📝 Standards JavaScript

## Module System

### ⚠️ Important

Ce projet utilise **CommonJS** pour le backend (Node.js):

```javascript
// ✅ CORRECT - Backend (main.js, server.js, routes/, models/)
const express = require('express');
const { dbPromise } = require('../database');

module.exports = myFunction;

// ❌ WRONG - Don't use ES6 imports in backend
import express from 'express';
export default myFunction;
```

Le frontend (`public/`) peut utiliser ES6 imports via bundler.

## Async/Await

```javascript
// ✅ Préféré - Async/await
async function getEvents() {
  try {
    const db = await dbPromise;
    const events = await db.all('SELECT * FROM events');
    return events;
  } catch (error) {
    console.error('Failed to fetch events:', error);
    throw error;
  }
}

// ⚠️ Acceptable - Promises
function getEvents() {
  return dbPromise
    .then(db => db.all('SELECT * FROM events'))
    .catch(error => console.error('Failed:', error));
}

// ❌ À éviter - Callbacks
function getEvents(callback) {
  db.all('SELECT * FROM events', (err, rows) => {
    if (err) callback(err);
    else callback(null, rows);
  });
}
```

## Null/Undefined Checks

```javascript
// ✅ Moderne - Optional chaining
const title = event?.title;
const creator = event?.user?.name;

// ✅ Nullish coalescing
const name = user?.name ?? 'Anonymous';
const count = items?.length ?? 0;

// ⚠️ Ancien - Guard clauses
if (event && event.title) {
  const title = event.title;
}

// ❌ À éviter - Loose checks
if (event) { } // Peut être false, 0, '', null, undefined
```

## Closures et Scopes

```javascript
// ✅ CORRECT - Block scope
{
  const MAX_RETRIES = 3; // Only available in this block
  for (let i = 0; i < MAX_RETRIES; i++) {
    // i is block-scoped
  }
}

// ❌ Problème - Function scope
{
  var MAX_RETRIES = 3; // Available everywhere
  for (var i = 0; i < MAX_RETRIES; i++) {
    // i is function-scoped
  }
  console.log(i); // 3 (leaks out!)
}
```

## Template Strings

```javascript
// ✅ Préféré - Template literals
const message = `Event "${title}" scheduled for ${date}`;
const query = `SELECT * FROM events WHERE id = ${id}`;

// ⚠️ Accepté - Concaténation
const message = 'Event "' + title + '" scheduled for ' + date;
```

## Error Handling

```javascript
// ✅ Spécifique
async function createEvent(data) {
  if (!data.title) {
    const error = new Error('Title is required');
    error.code = 'VALIDATION_ERROR';
    throw error;
  }
  
  try {
    // Database operation
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT') {
      throw new Error(`Event already exists: ${error.message}`);
    }
    throw error;
  }
}

// ❌ Trop générique
function createEvent(data) {
  try {
    // Database operation
  } catch (e) {
    console.log('Error');
    return null;
  }
}
```

## Arrow Functions

```javascript
// ✅ Correct pour les callbacks
const events = data.map(item => ({
  id: item.id,
  title: item.title
}));

// ✅ Correct pour les simple predicates
const active = events.filter(e => e.status === 'active');

// ⚠️ À éviter - Don't use `this`
class EventManager {
  constructor() {
    this.count = 0;
  }
  
  // ❌ WRONG - Arrow loses 'this'
  incrementArrow = () => {
    this.count++; // Would work but poor pattern
  }
  
  // ✅ CORRECT - Regular function preserves 'this'
  increment() {
    this.count++;
  }
}
```

## Object/Array Operations

```javascript
// ✅ Spread operator
const newEvent = { ...event, title: 'Updated' };
const allEvents = [...existingEvents, newEvent];

// ✅ Destructuring
const { id, title, date } = event;
const [first, ...rest] = events;

// ✅ Default values
const { limit = 50, offset = 0 } = params;

// ❌ Mutation - avoid
events[0].title = 'Mutated'; // Modifies original
events.push(newEvent);       // Direct mutation
```

## Array Methods

```javascript
// ✅ Functional
const titles = events
  .filter(e => e.status === 'active')
  .map(e => e.title)
  .sort();

// ✅ Chain with early exit
const event = events.find(e => e.id === targetId);

// ✅ Check existence
if (events.some(e => e.date === targetDate)) { }

// ✅ Aggregate
const total = events.reduce((sum, e) => sum + e.duration, 0);

// ❌ Old-school
var titles = [];
for (var i = 0; i < events.length; i++) {
  if (events[i].status === 'active') {
    titles.push(events[i].title);
  }
}
```

## Promises & Error Handling

```javascript
// ✅ Explicit error handling
async function fetchAndSave(id) {
  try {
    const event = await getEvent(id);
    if (!event) throw new Error('Event not found');
    
    await saveEvent(event);
    return { success: true };
  } catch (error) {
    console.error('Operation failed:', error.message);
    return { success: false, error: error.message };
  }
}

// ✅ Promise.all for parallel ops
const [users, events] = await Promise.all([
  getUsers(),
  getEvents()
]);

// ⚠️ Promise.all fails if any rejects
const results = await Promise.allSettled([
  riskyOp1(),
  riskyOp2(),
  riskyOp3()
]);
```

## Naming Conventions

```javascript
// Constants - UPPER_SNAKE_CASE
const MAX_EVENTS_PER_DAY = 100;
const DEFAULT_TIMEOUT_MS = 5000;

// Variables/functions - camelCase
const eventTitle = 'Meeting';
function createEvent() { }

// Classes - PascalCase
class EventManager { }
class DatabaseConnection { }

// Private fields - Leading underscore (convention)
class Handler {
  _internalState = null;
  
  // Or use # for true private fields
  #privateData = null;
}

// Constants exported
const API_VERSION = '1.0.0';
module.exports = { API_VERSION };
```

## Type Hints (JSDoc)

```javascript
/**
 * Create a new calendar event
 * @param {Object} data - Event data
 * @param {string} data.title - Event title
 * @param {string} data.start_time - ISO datetime
 * @param {string} data.end_time - ISO datetime
 * @param {number} [data.user_id] - Optional user ID
 * @returns {Promise<Object>} Created event
 * @throws {Error} If validation fails
 */
async function createEvent(data) {
  // Implementation
}

/**
 * @typedef {Object} Event
 * @property {number} id
 * @property {string} title
 * @property {string} start_time
 * @property {string} end_time
 */

/**
 * @param {Event} event
 * @returns {string}
 */
function formatEvent(event) {
  // Implementation
}
```

## Validation

```javascript
// ✅ Validate inputs
function validateEvent(data) {
  const errors = [];
  
  if (!data.title || typeof data.title !== 'string') {
    errors.push('Title must be a non-empty string');
  }
  
  if (!data.start_time) {
    errors.push('Start time is required');
  }
  
  if (data.end_time && new Date(data.end_time) <= new Date(data.start_time)) {
    errors.push('End time must be after start time');
  }
  
  return errors;
}

// ✅ Use validation
const errors = validateEvent(req.body);
if (errors.length > 0) {
  return res.status(400).json({ success: false, errors });
}
```

## Comments Best Practices

```javascript
// ✅ Why, not what
// Pagination to prevent memory issues with large result sets
const limit = 50;

// ✅ Document complexity
// Using a Set for O(1) lookups instead of array O(n)
const eventIds = new Set(events.map(e => e.id));

// ❌ Obvious comments
const x = 5; // Set x to 5

// ❌ Outdated comments
// TODO: Fix this after v2
// HACK: Temporary workaround for database bug
// NOTE: This is broken
```

## Performance Notes

```javascript
// ❌ Creates regex every call
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ✅ Create once
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidEmail(email) {
  return EMAIL_REGEX.test(email);
}

// ❌ Unnecessary iteration
const count = events.filter(e => e.active).length;

// ✅ Direct count
const count = events.reduce((n, e) => e.active ? n + 1 : n, 0);
// Or even better
const count = events.filter(e => e.active).length; // If clarity matters
```

---

**Need more?** Check [DEVELOPMENT.md](./DEVELOPMENT.md) for workflow or [API.md](../api/API.md) for endpoint patterns.
