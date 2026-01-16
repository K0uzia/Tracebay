# 🔧 TROUBLESHOOTING GUIDE

**Last Updated:** January 16, 2026  
**Version:** 2.0.0

---

## Table of Contents

- [Connection Issues](#connection-issues)
- [WebSocket Problems](#websocket-problems)
- [Performance Issues](#performance-issues)
- [Docker Issues](#docker-issues)
- [Database Issues](#database-issues)
- [Client Issues](#client-issues)
- [Common Error Messages](#common-error-messages)
- [FAQ](#faq)

---

## Connection Issues

### Client Can't Connect to Proxmox

**Symptoms:** Client shows "Connection refused" or "Unable to reach server"

**Solutions:**

1. **Check if Proxmox is running:**
   ```bash
   curl http://localhost:4000/api/health
   ```
   Should return: `{"status":"ok","timestamp":"...","uptime":...}`

2. **Verify network configuration:**
   - Check `apps/client/public/config/connection-config.json`
   - Ensure `mode` is set to `"proxmox"`
   - Verify port is `4000` (not `8060`)

3. **Check firewall:**
   ```bash
   # Linux
   sudo ufw status
   sudo ufw allow 4000
   
   # macOS
   sudo lsof -i :4000
   ```

4. **Restart services:**
   ```bash
   cd /home/goupil/Développement/workspace
   npm run dev:proxmox
   npm run dev:client
   ```

### CORS Errors

**Symptoms:** Browser console shows `CORS policy blocked request`

**Solution:**

CORS is enabled in Proxmox for development. If still having issues:

```typescript
// In apps/proxmox/src/main.ts
await fastify.register(cors, {
  origin: true, // Allow all origins
  credentials: true
});
```

---

## WebSocket Problems

### WebSocket Connection Fails

**Symptoms:** WebSocket connection shows as "closed" or "failed"

**Solutions:**

1. **Check WebSocket endpoint:**
   - Correct: `ws://localhost:4000/ws`
   - Incorrect: `ws://localhost:8060/ws`

2. **Verify browser support:**
   - WebSocket requires modern browser (Chrome 16+, Firefox 11+, Safari 7+)

3. **Check network logs:**
   ```javascript
   // In browser console
   const ws = new WebSocket('ws://localhost:4000/ws');
   ws.onerror = (e) => console.error('WS Error:', e);
   ws.onopen = () => console.log('WS Connected');
   ```

4. **Check Proxmox logs:**
   ```bash
   # In Proxmox terminal
   npm run dev:proxmox
   # Look for: "✅ WebSocket connected"
   ```

### Messages Not Broadcasting

**Symptoms:** Send message but don't see it on other clients

**Solutions:**

1. **Verify all clients are connected:**
   - Check browser console for "connected" message
   - Visit monitoring endpoint: `http://localhost:4000/api/monitoring/users`

2. **Check message format:**
   ```javascript
   // Correct format
   ws.send(JSON.stringify({
     type: 'message:send',
     text: 'Hello'
   }));
   ```

3. **Verify handler is registered:**
   - Check `apps/proxmox/src/ws/handlers.ts`
   - Message type `'message:send'` should be mapped to `handleMessageSend`

---

## Performance Issues

### High Memory Usage

**Symptoms:** Proxmox process uses excessive memory

**Solutions:**

1. **Check system stats:**
   ```bash
   curl http://localhost:4000/api/monitoring/stats
   ```

2. **View memory breakdown:**
   ```bash
   # Node.js process memory
   node -e "console.log(process.memoryUsage())"
   ```

3. **Restart services:**
   ```bash
   pkill -f "proxmox"
   npm run dev:proxmox
   ```

4. **Increase Node.js heap:**
   ```bash
   NODE_OPTIONS=--max-old-space-size=4096 npm run dev:proxmox
   ```

### Slow Message Delivery

**Symptoms:** Messages take longer than 1-2 seconds to appear

**Solutions:**

1. **Check message rate:**
   ```bash
   curl http://localhost:4000/api/monitoring/stats
   # Look for "messagesPerMinute"
   ```

2. **Monitor connected users:**
   ```bash
   curl http://localhost:4000/api/monitoring/users
   ```

3. **Check network latency:**
   ```bash
   ping localhost
   ```

---

## Docker Issues

### Docker Build Fails

**Symptoms:** `docker build` returns error

**Solutions:**

1. **Clean Docker cache:**
   ```bash
   docker system prune -a
   ```

2. **Check Dockerfile syntax:**
   ```bash
   docker build --progress=plain ./docker/proxmox
   ```

3. **Verify Node version:**
   ```bash
   # Check Dockerfile
   cat ./docker/proxmox/Dockerfile | grep FROM
   # Should be: FROM node:18-alpine or similar
   ```

### Container Won't Start

**Symptoms:** `docker run` container exits immediately

**Solutions:**

1. **Check container logs:**
   ```bash
   docker logs <container_id>
   ```

2. **Run interactively:**
   ```bash
   docker run -it proxmox:latest /bin/sh
   npm run dev:proxmox
   ```

3. **Verify environment:**
   ```bash
   docker run -e NODE_ENV=development proxmox:latest
   ```

### Port Already in Use

**Symptoms:** `Error: listen EADDRINUSE :::4000`

**Solutions:**

1. **Find process using port:**
   ```bash
   lsof -i :4000
   # or
   netstat -tulpn | grep 4000
   ```

2. **Kill process:**
   ```bash
   kill -9 <PID>
   # or
   pkill -f "node"
   ```

3. **Use different port:**
   ```bash
   PORT=5000 npm run dev:proxmox
   ```

---

## Database Issues

### Database Connection Failed

**Symptoms:** "Error: connect ECONNREFUSED 127.0.0.1:3306"

**Solutions:**

1. **Check database service:**
   ```bash
   # MySQL
   sudo service mysql status
   sudo service mysql start
   
   # SQLite (file-based)
   ls -la data/
   ```

2. **Verify credentials in `.env`:**
   ```bash
   cat .env | grep DATABASE
   ```

3. **Test connection:**
   ```bash
   mysql -u user -p -h localhost
   ```

### Database Migrations Failed

**Symptoms:** Tables don't exist or schema is mismatched

**Solutions:**

1. **Run migrations:**
   ```bash
   npm run migrate
   ```

2. **Reset database (development only):**
   ```bash
   npm run reset-db
   ```

3. **Check migration logs:**
   ```bash
   cat logs/migrations.log
   ```

---

## Client Issues

### Client Not Starting

**Symptoms:** Electron app won't launch or shows blank window

**Solutions:**

1. **Check prerequisites:**
   ```bash
   node --version  # Should be 16+
   npm --version   # Should be 7+
   ```

2. **Rebuild Electron:**
   ```bash
   cd apps/client
   npm install
   npm run rebuild
   npm start
   ```

3. **Check logs:**
   ```bash
   # In user's home directory
   cat ~/.config/Workspace/logs/main.log
   ```

### Chat Widget Not Loading

**Symptoms:** Chat widget appears but is empty or broken

**Solutions:**

1. **Clear cache:**
   ```bash
   rm -rf ~/.config/Workspace/
   npm start
   ```

2. **Check WebSocket connection:**
   - Open DevTools (Ctrl+Shift+I)
   - Go to Console tab
   - Type: `ws.readyState` (should be 1 = OPEN)

3. **Verify API endpoints:**
   ```bash
   curl http://localhost:4000/api/messages
   ```

### Events/Agenda Not Syncing

**Symptoms:** Events don't appear in agenda or don't sync between clients

**Solutions:**

1. **Check event API:**
   ```bash
   curl http://localhost:4000/api/events
   ```

2. **Verify database:**
   ```bash
   curl http://localhost:4000/api/monitoring/events/upcoming
   ```

3. **Restart client:**
   - Close Electron app
   - Wait 2 seconds
   - Relaunch: `npm start`

---

## Common Error Messages

### "ERR_PARSE_FAILURE"

**Meaning:** Failed to parse JSON response

**Fix:**
```javascript
// Always check response is valid JSON
try {
  const data = JSON.parse(response);
} catch (e) {
  console.error('Invalid JSON:', response);
}
```

### "ENOTFOUND localhost"

**Meaning:** DNS resolution failed

**Fix:**
```bash
# Use 127.0.0.1 instead
curl http://127.0.0.1:4000/api/health
```

### "EACCES: permission denied"

**Meaning:** Insufficient permissions

**Fix:**
```bash
# Don't run as root unless necessary
# Instead, fix permissions
sudo chown -R $(whoami) ~/.npm
```

### "Error: Cannot find module"

**Meaning:** Missing dependency

**Fix:**
```bash
cd apps/proxmox
npm install
npm run build
```

---

## FAQ

### Q: How do I enable debug logging?

**A:**
```bash
LOG_LEVEL=debug npm run dev:proxmox
```

### Q: Can I use different port?

**A:**
```bash
PORT=5000 npm run dev:proxmox
```

### Q: How do I reset everything?

**A:**
```bash
npm run reset-db
npm run clean
npm install
npm run build
npm start
```

### Q: How often should I restart services?

**A:**
- Restart after code changes: automatic with `npm run dev`
- Restart after npm install: yes
- Restart after environment changes: yes

### Q: Where are logs stored?

**A:**
```
logs/
├── proxmox.log
├── server.log
├── client.log
└── database.log
```

### Q: How do I report bugs?

**A:**
1. Collect logs: `cat logs/*.log`
2. Record steps to reproduce
3. Create GitHub issue with details
4. Include environment: `node -v`, `npm -v`, OS

---

## Still Having Issues?

1. **Check documentation:**
   - `docs/API.md` - API endpoints
   - `docs/WEBSOCKET.md` - WebSocket format
   - `docs/DATABASE.md` - Database schema
   - `docs/DEPLOYMENT.md` - Production setup

2. **Check logs:**
   ```bash
   tail -f logs/proxmox.log
   ```

3. **Check GitHub issues:**
   - https://github.com/SandersonnDev/workspace/issues

4. **Ask for help:**
   - Include error message
   - Include steps to reproduce
   - Include environment details
