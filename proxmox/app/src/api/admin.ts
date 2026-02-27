import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { query } from '../db';
import { getServerLogs } from '../utils/server-log-buffer';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'SECRET_RETIRE';
const JWT_SECRET = process.env.JWT_SECRET || 'SECRET_RETIRE';

// ─────────────────────────────────────────────
// JWT admin (HMAC-SHA256, payload base64)
// ─────────────────────────────────────────────

function signAdminJwt(payload: Record<string, any>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8, // 8h
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

function verifyAdminJwt(token: string): Record<string, any> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
    if (sig !== expected) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (!payload.admin) return null;
    return payload;
  } catch {
    return null;
  }
}

function checkAdminAuth(request: FastifyRequest, reply: FastifyReply): boolean {
  const raw =
    (request.query as any).token ||
    (request.headers['x-admin-token'] as string) ||
    (request.headers.authorization?.replace(/Bearer\s+/i, '') ?? '');

  if (!raw) {
    reply.statusCode = 401;
    reply.send({ error: 'Non autorisé' });
    return false;
  }

  // Token statique (rétrocompatibilité)
  if (raw === ADMIN_TOKEN) return true;

  // JWT admin signé
  const payload = verifyAdminJwt(raw);
  if (payload) return true;

  reply.statusCode = 401;
  reply.send({ error: 'Non autorisé' });
  return false;
}

// ─────────────────────────────────────────────
// Chemin vers les configs client
// ─────────────────────────────────────────────

function resolveClientConfigPath(filename: string): string {
  // proxmox/app/src/api -> proxmox/app -> proxmox -> workspace root
  const root = path.resolve(__dirname, '..', '..', '..', '..');
  return path.join(root, 'apps', 'client', 'public', 'assets', 'js', 'config', filename);
}

export async function registerAdminRoutes(fastify: FastifyInstance): Promise<void> {

  // ─────────────────────────────────────────────
  // AUTH ADMIN
  // ─────────────────────────────────────────────

  fastify.post('/api/admin/auth/login', async (request, reply) => {
    const { username, password } = request.body as any;
    if (!username || !password) {
      reply.statusCode = 400;
      return { error: 'username et password requis' };
    }
    try {
      const result = await query(
        `SELECT id, username, password_hash, role FROM users
         WHERE username = $1 AND deleted_at IS NULL`,
        [String(username).trim().toLowerCase()]
      );
      if (result.rowCount === 0) {
        reply.statusCode = 401;
        return { error: 'Identifiants incorrects' };
      }
      const user = result.rows[0];
      if (user.role !== 'admin') {
        reply.statusCode = 403;
        return { error: 'Accès refusé : compte non administrateur' };
      }
      const hash = crypto.createHash('sha256').update(password).digest('hex');
      if (hash !== user.password_hash) {
        reply.statusCode = 401;
        return { error: 'Identifiants incorrects' };
      }
      const token = signAdminJwt({ id: user.id, username: user.username, admin: true });
      return { success: true, token, username: user.username };
    } catch (err: any) {
      fastify.log.error({ err }, 'admin POST /auth/login');
      reply.statusCode = 500;
      return { error: 'Database error' };
    }
  });

  // ─────────────────────────────────────────────
  // COMPTES UTILISATEURS
  // ─────────────────────────────────────────────

  fastify.get('/api/admin/users', async (request, reply) => {
    if (!checkAdminAuth(request, reply)) return;
    try {
      const result = await query(
        `SELECT id, username, email, role, created_at, deleted_at FROM users ORDER BY created_at DESC`
      );
      return { success: true, users: result.rows };
    } catch (err: any) {
      fastify.log.error({ err }, 'admin GET /users');
      reply.statusCode = 500;
      return { error: 'Database error' };
    }
  });

  fastify.post('/api/admin/users', async (request, reply) => {
    if (!checkAdminAuth(request, reply)) return;
    const { username, password, role } = request.body as any;
    if (!username?.trim() || !password) {
      reply.statusCode = 400;
      return { error: 'username et password requis' };
    }
    if (username.length < 3 || username.length > 50) {
      reply.statusCode = 400;
      return { error: 'username doit faire entre 3 et 50 caractères' };
    }
    if (password.length < 6) {
      reply.statusCode = 400;
      return { error: 'password doit faire au moins 6 caractères' };
    }
    const userRole = role === 'admin' ? 'admin' : 'user';
    try {
      const hash = crypto.createHash('sha256').update(password).digest('hex');
      const result = await query(
        `INSERT INTO users (username, password_hash, role, created_at) VALUES ($1, $2, $3, NOW())
         RETURNING id, username, role, created_at`,
        [username.trim().toLowerCase(), hash, userRole]
      );
      return { success: true, user: result.rows[0] };
    } catch (err: any) {
      if (err.code === '23505') {
        reply.statusCode = 409;
        return { error: 'Ce nom d\'utilisateur existe déjà' };
      }
      fastify.log.error({ err }, 'admin POST /users');
      reply.statusCode = 500;
      return { error: 'Database error' };
    }
  });

  fastify.put('/api/admin/users/:id', async (request, reply) => {
    if (!checkAdminAuth(request, reply)) return;
    const { id } = request.params as { id: string };
    const { username, password, email, role } = request.body as any;
    const updates: string[] = [];
    const params: any[] = [];
    let i = 1;
    if (username !== undefined) { updates.push(`username = $${i++}`); params.push(String(username).trim().toLowerCase()); }
    if (email !== undefined) { updates.push(`email = $${i++}`); params.push(email || null); }
    if (password) {
      const hash = crypto.createHash('sha256').update(password).digest('hex');
      updates.push(`password_hash = $${i++}`);
      params.push(hash);
    }
    if (role !== undefined && ['user', 'admin'].includes(role)) {
      updates.push(`role = $${i++}`);
      params.push(role);
    }
    if (updates.length === 0) {
      reply.statusCode = 400;
      return { error: 'Aucun champ à mettre à jour' };
    }
    params.push(id);
    try {
      const result = await query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${i} RETURNING id, username, email, role, created_at`,
        params
      );
      if (result.rowCount === 0) { reply.statusCode = 404; return { error: 'Utilisateur introuvable' }; }
      return { success: true, user: result.rows[0] };
    } catch (err: any) {
      if (err.code === '23505') { reply.statusCode = 409; return { error: 'Nom d\'utilisateur déjà pris' }; }
      fastify.log.error({ err }, 'admin PUT /users/:id');
      reply.statusCode = 500;
      return { error: 'Database error' };
    }
  });

  fastify.delete('/api/admin/users/:id', async (request, reply) => {
    if (!checkAdminAuth(request, reply)) return;
    const { id } = request.params as { id: string };
    try {
      const result = await query('DELETE FROM users WHERE id = $1', [id]);
      if (result.rowCount === 0) { reply.statusCode = 404; return { error: 'Utilisateur introuvable' }; }
      return { success: true };
    } catch (err: any) {
      fastify.log.error({ err }, 'admin DELETE /users/:id');
      reply.statusCode = 500;
      return { error: 'Database error' };
    }
  });

  // ─────────────────────────────────────────────
  // AGENDA
  // ─────────────────────────────────────────────

  fastify.get('/api/admin/agenda', async (request, reply) => {
    if (!checkAdminAuth(request, reply)) return;
    const { search, from, to } = request.query as any;
    let sql = `SELECT id, user_id, username, title, start, "end", description, location, color, created_at FROM events WHERE 1=1`;
    const params: any[] = [];
    let i = 1;
    if (search) { sql += ` AND (title ILIKE $${i} OR description ILIKE $${i})`; params.push(`%${search}%`); i++; }
    if (from) { sql += ` AND "end" >= $${i++}`; params.push(from); }
    if (to) { sql += ` AND start <= $${i++}`; params.push(to); }
    sql += ' ORDER BY start DESC LIMIT 200';
    try {
      const result = await query(sql, params);
      return { success: true, events: result.rows };
    } catch (err: any) {
      fastify.log.error({ err }, 'admin GET /agenda');
      reply.statusCode = 500;
      return { error: 'Database error' };
    }
  });

  fastify.post('/api/admin/agenda', async (request, reply) => {
    if (!checkAdminAuth(request, reply)) return;
    const { title, start, end, description, location, color, username } = request.body as any;
    if (!title || !start || !end) {
      reply.statusCode = 400;
      return { error: 'title, start et end sont requis' };
    }
    try {
      const result = await query(
        `INSERT INTO events (username, title, start, "end", description, location, color, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         RETURNING id, username, title, start, "end", description, location, color, created_at`,
        [username || 'admin', title, start, end, description || null, location || null, color || null]
      );
      return { success: true, event: result.rows[0] };
    } catch (err: any) {
      fastify.log.error({ err }, 'admin POST /agenda');
      reply.statusCode = 500;
      return { error: 'Database error' };
    }
  });

  fastify.put('/api/admin/agenda/:id', async (request, reply) => {
    if (!checkAdminAuth(request, reply)) return;
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const fields: Record<string, string> = { title: 'title', start: 'start', end: '"end"', description: 'description', location: 'location', color: 'color' };
    const updates: string[] = [];
    const params: any[] = [];
    let i = 1;
    for (const [key, col] of Object.entries(fields)) {
      if (body[key] !== undefined) { updates.push(`${col} = $${i++}`); params.push(body[key]); }
    }
    if (updates.length === 0) { reply.statusCode = 400; return { error: 'Aucun champ à mettre à jour' }; }
    params.push(id);
    try {
      const result = await query(
        `UPDATE events SET ${updates.join(', ')} WHERE id = $${i} RETURNING id, title, start, "end", description, location, color`,
        params
      );
      if (result.rowCount === 0) { reply.statusCode = 404; return { error: 'Événement introuvable' }; }
      return { success: true, event: result.rows[0] };
    } catch (err: any) {
      fastify.log.error({ err }, 'admin PUT /agenda/:id');
      reply.statusCode = 500;
      return { error: 'Database error' };
    }
  });

  fastify.delete('/api/admin/agenda/:id', async (request, reply) => {
    if (!checkAdminAuth(request, reply)) return;
    const { id } = request.params as { id: string };
    try {
      const result = await query('DELETE FROM events WHERE id = $1', [id]);
      if (result.rowCount === 0) { reply.statusCode = 404; return { error: 'Événement introuvable' }; }
      return { success: true };
    } catch (err: any) {
      fastify.log.error({ err }, 'admin DELETE /agenda/:id');
      reply.statusCode = 500;
      return { error: 'Database error' };
    }
  });

  // ─────────────────────────────────────────────
  // MESSAGES CHAT
  // ─────────────────────────────────────────────

  fastify.get('/api/admin/messages', async (request, reply) => {
    if (!checkAdminAuth(request, reply)) return;
    const { search, user, limit = 100 } = request.query as any;
    let sql = `SELECT id, user_id, username, text, created_at FROM messages WHERE deleted_at IS NULL`;
    const params: any[] = [];
    let i = 1;
    if (search) { sql += ` AND text ILIKE $${i++}`; params.push(`%${search}%`); }
    if (user) { sql += ` AND username ILIKE $${i++}`; params.push(`%${user}%`); }
    sql += ` ORDER BY created_at DESC LIMIT $${i}`; params.push(Math.min(Number(limit), 500));
    try {
      const result = await query(sql, params);
      return { success: true, messages: result.rows };
    } catch (err: any) {
      fastify.log.error({ err }, 'admin GET /messages');
      reply.statusCode = 500;
      return { error: 'Database error' };
    }
  });

  fastify.delete('/api/admin/messages/:id', async (request, reply) => {
    if (!checkAdminAuth(request, reply)) return;
    const { id } = request.params as { id: string };
    try {
      const result = await query('DELETE FROM messages WHERE id = $1', [id]);
      if (result.rowCount === 0) { reply.statusCode = 404; return { error: 'Message introuvable' }; }
      return { success: true };
    } catch (err: any) {
      fastify.log.error({ err }, 'admin DELETE /messages/:id');
      reply.statusCode = 500;
      return { error: 'Database error' };
    }
  });

  fastify.delete('/api/admin/messages', async (request, reply) => {
    if (!checkAdminAuth(request, reply)) return;
    try {
      const result = await query('DELETE FROM messages');
      return { success: true, deleted: result.rowCount };
    } catch (err: any) {
      fastify.log.error({ err }, 'admin DELETE /messages (all)');
      reply.statusCode = 500;
      return { error: 'Database error' };
    }
  });

  // ─────────────────────────────────────────────
  // RÉCEPTION : MARQUES & MODÈLES
  // ─────────────────────────────────────────────

  fastify.get('/api/admin/marques', async (request, reply) => {
    if (!checkAdminAuth(request, reply)) return;
    try {
      const result = await query(
        `SELECT m.id, m.name,
           (SELECT COUNT(*) FROM modeles mo WHERE mo.marque_id = m.id) AS modele_count
         FROM marques m WHERE m.deleted_at IS NULL ORDER BY m.name`
      );
      return { success: true, marques: result.rows };
    } catch (err: any) {
      fastify.log.error({ err }, 'admin GET /marques');
      reply.statusCode = 500;
      return { error: 'Database error' };
    }
  });

  fastify.post('/api/admin/marques', async (request, reply) => {
    if (!checkAdminAuth(request, reply)) return;
    const { name } = request.body as any;
    if (!name?.trim()) { reply.statusCode = 400; return { error: 'name requis' }; }
    try {
      const result = await query('INSERT INTO marques (name) VALUES ($1) RETURNING id, name', [name.trim()]);
      return { success: true, marque: result.rows[0] };
    } catch (err: any) {
      if (err.code === '23505') { reply.statusCode = 409; return { error: 'Marque déjà existante' }; }
      fastify.log.error({ err }, 'admin POST /marques');
      reply.statusCode = 500;
      return { error: 'Database error' };
    }
  });

  fastify.put('/api/admin/marques/:id', async (request, reply) => {
    if (!checkAdminAuth(request, reply)) return;
    const { id } = request.params as { id: string };
    const { name } = request.body as any;
    if (!name?.trim()) { reply.statusCode = 400; return { error: 'name requis' }; }
    try {
      const result = await query('UPDATE marques SET name = $1 WHERE id = $2 RETURNING id, name', [name.trim(), id]);
      if (result.rowCount === 0) { reply.statusCode = 404; return { error: 'Marque introuvable' }; }
      return { success: true, marque: result.rows[0] };
    } catch (err: any) {
      fastify.log.error({ err }, 'admin PUT /marques/:id');
      reply.statusCode = 500;
      return { error: 'Database error' };
    }
  });

  fastify.delete('/api/admin/marques/:id', async (request, reply) => {
    if (!checkAdminAuth(request, reply)) return;
    const { id } = request.params as { id: string };
    try {
      const result = await query('DELETE FROM marques WHERE id = $1', [id]);
      if (result.rowCount === 0) { reply.statusCode = 404; return { error: 'Marque introuvable' }; }
      return { success: true };
    } catch (err: any) {
      fastify.log.error({ err }, 'admin DELETE /marques/:id');
      reply.statusCode = 500;
      return { error: 'Database error' };
    }
  });

  fastify.get('/api/admin/marques/:id/modeles', async (request, reply) => {
    if (!checkAdminAuth(request, reply)) return;
    const { id } = request.params as { id: string };
    try {
      const result = await query('SELECT id, name, marque_id FROM modeles WHERE marque_id = $1 AND deleted_at IS NULL ORDER BY name', [id]);
      return { success: true, modeles: result.rows };
    } catch (err: any) {
      fastify.log.error({ err }, 'admin GET /marques/:id/modeles');
      reply.statusCode = 500;
      return { error: 'Database error' };
    }
  });

  fastify.post('/api/admin/marques/:id/modeles', async (request, reply) => {
    if (!checkAdminAuth(request, reply)) return;
    const { id } = request.params as { id: string };
    const { name } = request.body as any;
    if (!name?.trim()) { reply.statusCode = 400; return { error: 'name requis' }; }
    try {
      const result = await query('INSERT INTO modeles (marque_id, name) VALUES ($1, $2) RETURNING id, name, marque_id', [id, name.trim()]);
      return { success: true, modele: result.rows[0] };
    } catch (err: any) {
      fastify.log.error({ err }, 'admin POST /marques/:id/modeles');
      reply.statusCode = 500;
      return { error: 'Database error' };
    }
  });

  fastify.delete('/api/admin/modeles/:id', async (request, reply) => {
    if (!checkAdminAuth(request, reply)) return;
    const { id } = request.params as { id: string };
    try {
      const result = await query('DELETE FROM modeles WHERE id = $1', [id]);
      if (result.rowCount === 0) { reply.statusCode = 404; return { error: 'Modèle introuvable' }; }
      return { success: true };
    } catch (err: any) {
      fastify.log.error({ err }, 'admin DELETE /modeles/:id');
      reply.statusCode = 500;
      return { error: 'Database error' };
    }
  });

  // ─────────────────────────────────────────────
  // RÉCEPTION : LOTS
  // ─────────────────────────────────────────────

  fastify.get('/api/admin/lots', async (request, reply) => {
    if (!checkAdminAuth(request, reply)) return;
    const { status, search } = request.query as any;
    let sql = `SELECT l.id, l.name, l.status, l.item_count, l.description, l.received_at, l.created_at, l.updated_at
               FROM lots l WHERE l.deleted_at IS NULL`;
    const params: any[] = [];
    let i = 1;
    if (status && status !== 'all') { sql += ` AND l.status = $${i++}`; params.push(status); }
    if (search) { sql += ` AND (l.name ILIKE $${i} OR l.description ILIKE $${i})`; params.push(`%${search}%`); i++; }
    sql += ' ORDER BY l.received_at DESC LIMIT 200';
    try {
      const result = await query(sql, params);
      return { success: true, lots: result.rows };
    } catch (err: any) {
      fastify.log.error({ err }, 'admin GET /lots');
      reply.statusCode = 500;
      return { error: 'Database error' };
    }
  });

  fastify.delete('/api/admin/lots/:id', async (request, reply) => {
    if (!checkAdminAuth(request, reply)) return;
    const { id } = request.params as { id: string };
    try {
      await query('DELETE FROM lot_items WHERE lot_id = $1', [id]);
      const result = await query('DELETE FROM lots WHERE id = $1', [id]);
      if (result.rowCount === 0) { reply.statusCode = 404; return { error: 'Lot introuvable' }; }
      return { success: true };
    } catch (err: any) {
      fastify.log.error({ err }, 'admin DELETE /lots/:id');
      reply.statusCode = 500;
      return { error: 'Database error' };
    }
  });

  // ─────────────────────────────────────────────
  // RACCOURCIS WEB
  // ─────────────────────────────────────────────

  fastify.get('/api/admin/shortcuts', async (request, reply) => {
    if (!checkAdminAuth(request, reply)) return;
    try {
      const result = await query(
        `SELECT s.id, s.user_id, u.username, s.title, s.description, s.url, s.category_id,
                sc.name as category_name, s.order_index, s.created_at
         FROM shortcuts s
         LEFT JOIN users u ON s.user_id = u.id
         LEFT JOIN shortcut_categories sc ON s.category_id = sc.id
         WHERE s.deleted_at IS NULL
         ORDER BY u.username ASC, sc.name ASC, s.order_index ASC`
      );
      return { success: true, shortcuts: result.rows };
    } catch (err: any) {
      fastify.log.error({ err }, 'admin GET /shortcuts');
      reply.statusCode = 500;
      return { error: 'Database error' };
    }
  });

  fastify.post('/api/admin/shortcuts', async (request, reply) => {
    if (!checkAdminAuth(request, reply)) return;
    const { user_id, title, url, description, category_id } = request.body as any;
    if (!title?.trim() || !url?.trim() || !user_id) {
      reply.statusCode = 400;
      return { error: 'user_id, title et url sont requis' };
    }
    try {
      const result = await query(
        `INSERT INTO shortcuts (user_id, title, url, description, category_id, order_index, created_at)
         VALUES ($1, $2, $3, $4, $5,
           (SELECT COALESCE(MAX(order_index)+1, 0) FROM shortcuts WHERE user_id = $1),
           NOW())
         RETURNING id, user_id, title, url, description, category_id, order_index`,
        [user_id, title.trim(), url.trim(), description || null, category_id || null]
      );
      return { success: true, shortcut: result.rows[0] };
    } catch (err: any) {
      fastify.log.error({ err }, 'admin POST /shortcuts');
      reply.statusCode = 500;
      return { error: 'Database error' };
    }
  });

  fastify.put('/api/admin/shortcuts/:id', async (request, reply) => {
    if (!checkAdminAuth(request, reply)) return;
    const { id } = request.params as { id: string };
    const { title, url, description, category_id } = request.body as any;
    const updates: string[] = [];
    const params: any[] = [];
    let i = 1;
    if (title !== undefined) { updates.push(`title = $${i++}`); params.push(title); }
    if (url !== undefined) { updates.push(`url = $${i++}`); params.push(url); }
    if (description !== undefined) { updates.push(`description = $${i++}`); params.push(description); }
    if (category_id !== undefined) { updates.push(`category_id = $${i++}`); params.push(category_id || null); }
    if (updates.length === 0) { reply.statusCode = 400; return { error: 'Aucun champ' }; }
    params.push(id);
    try {
      const result = await query(
        `UPDATE shortcuts SET ${updates.join(', ')} WHERE id = $${i} RETURNING id, title, url, description, category_id`,
        params
      );
      if (result.rowCount === 0) { reply.statusCode = 404; return { error: 'Raccourci introuvable' }; }
      return { success: true, shortcut: result.rows[0] };
    } catch (err: any) {
      fastify.log.error({ err }, 'admin PUT /shortcuts/:id');
      reply.statusCode = 500;
      return { error: 'Database error' };
    }
  });

  fastify.delete('/api/admin/shortcuts/:id', async (request, reply) => {
    if (!checkAdminAuth(request, reply)) return;
    const { id } = request.params as { id: string };
    try {
      const result = await query('DELETE FROM shortcuts WHERE id = $1', [id]);
      if (result.rowCount === 0) { reply.statusCode = 404; return { error: 'Raccourci introuvable' }; }
      return { success: true };
    } catch (err: any) {
      fastify.log.error({ err }, 'admin DELETE /shortcuts/:id');
      reply.statusCode = 500;
      return { error: 'Database error' };
    }
  });

  fastify.get('/api/admin/shortcut-categories', async (request, reply) => {
    if (!checkAdminAuth(request, reply)) return;
    try {
      const result = await query(
        `SELECT sc.id, sc.user_id, u.username, sc.name, sc.order_index,
                (SELECT COUNT(*) FROM shortcuts s WHERE s.category_id = sc.id AND s.deleted_at IS NULL) AS shortcut_count
         FROM shortcut_categories sc
         LEFT JOIN users u ON sc.user_id = u.id
         WHERE sc.deleted_at IS NULL
         ORDER BY u.username ASC, sc.order_index ASC`
      );
      return { success: true, categories: result.rows };
    } catch (err: any) {
      fastify.log.error({ err }, 'admin GET /shortcut-categories');
      reply.statusCode = 500;
      return { error: 'Database error' };
    }
  });

  fastify.post('/api/admin/shortcut-categories', async (request, reply) => {
    if (!checkAdminAuth(request, reply)) return;
    const { user_id, name } = request.body as any;
    if (!name?.trim() || !user_id) {
      reply.statusCode = 400;
      return { error: 'user_id et name sont requis' };
    }
    try {
      const result = await query(
        `INSERT INTO shortcut_categories (user_id, name, order_index, created_at)
         VALUES ($1, $2, (SELECT COALESCE(MAX(order_index)+1, 0) FROM shortcut_categories WHERE user_id = $1), NOW())
         RETURNING id, user_id, name, order_index`,
        [user_id, name.trim()]
      );
      return { success: true, category: result.rows[0] };
    } catch (err: any) {
      fastify.log.error({ err }, 'admin POST /shortcut-categories');
      reply.statusCode = 500;
      return { error: 'Database error' };
    }
  });

  fastify.delete('/api/admin/shortcut-categories/:id', async (request, reply) => {
    if (!checkAdminAuth(request, reply)) return;
    const { id } = request.params as { id: string };
    try {
      await query('UPDATE shortcuts SET category_id = NULL WHERE category_id = $1', [id]);
      const result = await query('DELETE FROM shortcut_categories WHERE id = $1', [id]);
      if (result.rowCount === 0) { reply.statusCode = 404; return { error: 'Catégorie introuvable' }; }
      return { success: true };
    } catch (err: any) {
      fastify.log.error({ err }, 'admin DELETE /shortcut-categories/:id');
      reply.statusCode = 500;
      return { error: 'Database error' };
    }
  });

  // ─────────────────────────────────────────────
  // CONFIG CLIENT : APPLICATIONS
  // ─────────────────────────────────────────────

  fastify.get('/api/admin/config/apps', async (request, reply) => {
    if (!checkAdminAuth(request, reply)) return;
    try {
      const filePath = resolveClientConfigPath('AppConfig.js');
      const content = fs.readFileSync(filePath, 'utf-8');
      // Extraire la config JSON depuis le fichier JS
      const match = content.match(/appManagers\s*:\s*(\{[\s\S]*?\})\s*\}/);
      if (!match) return { success: true, raw: content, parsed: null };
      // Retourner le contenu brut + la structure parsée via eval sécurisé
      return { success: true, raw: content };
    } catch (err: any) {
      fastify.log.error({ err }, 'admin GET /config/apps');
      reply.statusCode = 500;
      return { error: 'Impossible de lire AppConfig.js' };
    }
  });

  fastify.put('/api/admin/config/apps', async (request, reply) => {
    if (!checkAdminAuth(request, reply)) return;
    const { content } = request.body as any;
    if (!content || typeof content !== 'string') {
      reply.statusCode = 400;
      return { error: 'content (string) requis' };
    }
    try {
      const filePath = resolveClientConfigPath('AppConfig.js');
      fs.writeFileSync(filePath, content, 'utf-8');
      return { success: true };
    } catch (err: any) {
      fastify.log.error({ err }, 'admin PUT /config/apps');
      reply.statusCode = 500;
      return { error: 'Impossible d\'écrire AppConfig.js' };
    }
  });

  // ─────────────────────────────────────────────
  // CONFIG CLIENT : DOSSIERS
  // ─────────────────────────────────────────────

  fastify.get('/api/admin/config/folders', async (request, reply) => {
    if (!checkAdminAuth(request, reply)) return;
    try {
      const filePath = resolveClientConfigPath('FolderConfig.js');
      const content = fs.readFileSync(filePath, 'utf-8');
      return { success: true, raw: content };
    } catch (err: any) {
      fastify.log.error({ err }, 'admin GET /config/folders');
      reply.statusCode = 500;
      return { error: 'Impossible de lire FolderConfig.js' };
    }
  });

  fastify.put('/api/admin/config/folders', async (request, reply) => {
    if (!checkAdminAuth(request, reply)) return;
    const { content } = request.body as any;
    if (!content || typeof content !== 'string') {
      reply.statusCode = 400;
      return { error: 'content (string) requis' };
    }
    try {
      const filePath = resolveClientConfigPath('FolderConfig.js');
      fs.writeFileSync(filePath, content, 'utf-8');
      return { success: true };
    } catch (err: any) {
      fastify.log.error({ err }, 'admin PUT /config/folders');
      reply.statusCode = 500;
      return { error: 'Impossible d\'écrire FolderConfig.js' };
    }
  });

  // ─────────────────────────────────────────────
  // LOGS SÉPARÉS
  // ─────────────────────────────────────────────

  fastify.get('/api/admin/logs/chat', async (request, reply) => {
    if (!checkAdminAuth(request, reply)) return;
    const { limit = 100 } = request.query as any;
    try {
      const result = await query(
        `SELECT id, username, text, created_at FROM messages
         WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT $1`,
        [Math.min(Number(limit), 500)]
      );
      return { success: true, logs: result.rows };
    } catch (err: any) {
      fastify.log.error({ err }, 'admin GET /logs/chat');
      reply.statusCode = 500;
      return { error: 'Database error' };
    }
  });

  fastify.get('/api/admin/logs/db', async (request, reply) => {
    if (!checkAdminAuth(request, reply)) return;
    try {
      const [users, messages, events, lots, shortcuts, lot_items, marques, modeles] = await Promise.all([
        query('SELECT COUNT(*) FROM users WHERE deleted_at IS NULL'),
        query('SELECT COUNT(*) FROM messages WHERE deleted_at IS NULL'),
        query('SELECT COUNT(*) FROM events WHERE deleted_at IS NULL'),
        query('SELECT COUNT(*) FROM lots WHERE deleted_at IS NULL'),
        query('SELECT COUNT(*) FROM shortcuts WHERE deleted_at IS NULL'),
        query('SELECT COUNT(*) FROM lot_items WHERE deleted_at IS NULL'),
        query('SELECT COUNT(*) FROM marques WHERE deleted_at IS NULL'),
        query('SELECT COUNT(*) FROM modeles WHERE deleted_at IS NULL'),
      ]);
      return {
        success: true,
        stats: {
          users: parseInt(users.rows[0].count),
          messages: parseInt(messages.rows[0].count),
          events: parseInt(events.rows[0].count),
          lots: parseInt(lots.rows[0].count),
          lot_items: parseInt(lot_items.rows[0].count),
          shortcuts: parseInt(shortcuts.rows[0].count),
          marques: parseInt(marques.rows[0].count),
          modeles: parseInt(modeles.rows[0].count),
        }
      };
    } catch (err: any) {
      fastify.log.error({ err }, 'admin GET /logs/db');
      reply.statusCode = 500;
      return { error: 'Database error' };
    }
  });

  fastify.get('/api/admin/logs/auth', async (request, reply) => {
    if (!checkAdminAuth(request, reply)) return;
    const { limit = 100 } = request.query as any;
    try {
      const result = await query(
        `SELECT id, username, created_at, 'login' as event_type FROM users
         WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT $1`,
        [Math.min(Number(limit), 500)]
      );
      const logs = getServerLogs()
        .filter(l => /auth|login|logout|jwt|token|ws.*auth/i.test(l.text))
        .slice(-200)
        .map(l => `[${l.time}] ${l.text}`);
      return { success: true, db_users: result.rows, server_logs: logs };
    } catch (err: any) {
      fastify.log.error({ err }, 'admin GET /logs/auth');
      reply.statusCode = 500;
      return { error: 'Database error' };
    }
  });

  fastify.get('/api/admin/logs/api', async (request, reply) => {
    if (!checkAdminAuth(request, reply)) return;
    const logs = getServerLogs()
      .filter(l => /GET|POST|PUT|DELETE|PATCH|incoming request|request completed|\d{3}/i.test(l.text))
      .slice(-300)
      .map(l => `[${l.time}] ${l.text}`);
    return { success: true, logs };
  });

  fastify.get('/api/admin/logs/reception', async (request, reply) => {
    if (!checkAdminAuth(request, reply)) return;
    const { limit = 100 } = request.query as any;
    try {
      const [lots, items] = await Promise.all([
        query(
          `SELECT l.id, l.name, l.status, l.item_count, l.received_at, l.updated_at,
                  u.username as created_by
           FROM lots l LEFT JOIN users u ON l.user_id = u.id
           WHERE l.deleted_at IS NULL ORDER BY l.updated_at DESC LIMIT $1`,
          [Math.min(Number(limit), 200)]
        ),
        query(
          `SELECT li.id, li.lot_id, li.serial_number, li.type, li.state,
                  li.technician, li.state_changed_at, li.updated_at
           FROM lot_items li
           WHERE li.deleted_at IS NULL ORDER BY li.updated_at DESC LIMIT $1`,
          [Math.min(Number(limit), 200)]
        ),
      ]);
      return { success: true, lots: lots.rows, items: items.rows };
    } catch (err: any) {
      fastify.log.error({ err }, 'admin GET /logs/reception');
      reply.statusCode = 500;
      return { error: 'Database error' };
    }
  });

  fastify.get('/api/admin/logs/raw', async (request, reply) => {
    if (!checkAdminAuth(request, reply)) return;
    const logs = getServerLogs().map(l => `[${l.time}] ${l.text}`).join('\n');
    return { success: true, logs };
  });

  fastify.log.info('✅ Admin routes registered (v2 — auth admin JWT)');
}
