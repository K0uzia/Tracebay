import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PoolClient } from 'pg';
import { query, transaction } from '../db';
import { getServerLogs } from '../utils/server-log-buffer';
import { generateDisquesPdf } from '../utils/disques-pdf';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as child_process from 'child_process';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';

const SERVICE_NAME = process.env.SERVICE_NAME || 'proxmox-backend';
const PROXMOX_CLI = process.env.PROXMOX_CLI || '/usr/local/bin/proxmox';

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

/**
 * Extrait un objet JS (notation littérale) depuis un fichier de config JS.
 * Utilise require() après avoir converti les exports ES6 en CommonJS,
 * avec fallback regex JSON si require() échoue.
 */
/**
 * Extrait un champ objet depuis un fichier de config JS en utilisant
 * une approche par comptage de parenthèses — robuste face aux méthodes ES6.
 */
function parseConfigField(content: string, field: string): any {
  // Trouver "field: {" puis extraire l'objet en comptant les accolades
  const start = content.indexOf(field + ':');
  if (start === -1) return null;
  const braceStart = content.indexOf('{', start);
  if (braceStart === -1) return null;
  let depth = 0;
  let i = braceStart;
  for (; i < content.length; i++) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  const raw = content.slice(braceStart, i + 1);
  // Convertir JS object literal → JSON valide
  try {
    // Supprimer les méthodes shorthand (ex: resolvePreset(name) { ... })
    const noMethods = raw.replace(/,?\s*\w+\s*\([^)]*\)\s*\{[^}]*(?:\{[^}]*\}[^}]*)?\}/g, '');
    // Convertir clés non-quotées en clés JSON
    const jsonLike = noMethods
      .replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":')
      .replace(/'/g, '"')
      .replace(/,\s*([}\]])/g, '$1'); // trailing commas
    return JSON.parse(jsonLike);
  } catch {
    return null;
  }
}

/**
 * Extrait un tableau JS simple depuis un fichier de config.
 */
function parseConfigArray(content: string, field: string): any[] {
  const start = content.indexOf(field + ':');
  if (start === -1) return [];
  const arrStart = content.indexOf('[', start);
  if (arrStart === -1) return [];
  let depth = 0;
  let i = arrStart;
  for (; i < content.length; i++) {
    if (content[i] === '[') depth++;
    else if (content[i] === ']') { depth--; if (depth === 0) break; }
  }
  const raw = content.slice(arrStart, i + 1);
  try {
    const jsonLike = raw
      .replace(/'/g, '"')
      .replace(/,\s*([}\]])/g, '$1');
    return JSON.parse(jsonLike);
  } catch { return []; }
}

function resolveClientConfigPath(filename: string): string {
  // En dev : proxmox/app/src/api -> proxmox/app/src/config
  // En prod Docker : /app/dist/api -> /app/src/config (copié par le Dockerfile)
  const srcConfig = path.resolve(__dirname, '..', 'config', filename);
  if (fs.existsSync(srcConfig)) return srcConfig;
  // Fallback dist (si le fichier est copié dans dist/config)
  return path.resolve(__dirname, 'config', filename);
}

export async function registerAdminRoutes(fastify: FastifyInstance): Promise<void> {

  // ─────────────────────────────────────────────
  // AUTH ADMIN
  // ─────────────────────────────────────────────

  fastify.post('/api/admin/auth/login', async (request: FastifyRequest, reply: FastifyReply) => {
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
      if (!user.password_hash) {
        reply.statusCode = 401;
        return { error: 'Mot de passe non défini, contactez un administrateur' };
      }
      const passwordValid = await bcrypt.compare(String(password), user.password_hash);
      if (!passwordValid) {
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

  fastify.get('/api/admin/users', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkAdminAuth(request, reply)) return;
    try {
      const result = await query(
        `SELECT id, username, email, role, created_at, deleted_at, (password_hash IS NOT NULL) AS has_password FROM users ORDER BY created_at DESC`
      );
      return { success: true, users: result.rows };
    } catch (err: any) {
      fastify.log.error({ err }, 'admin GET /users');
      reply.statusCode = 500;
      return { error: 'Database error' };
    }
  });

  fastify.post('/api/admin/users', async (request: FastifyRequest, reply: FastifyReply) => {
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
      const hash = await bcrypt.hash(String(password), 12);
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

  fastify.put('/api/admin/users/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkAdminAuth(request, reply)) return;
    const { id } = request.params as { id: string };
    const { username, password, email, role } = request.body as any;
    const updates: string[] = [];
    const params: any[] = [];
    let i = 1;
    if (username !== undefined) { updates.push(`username = $${i++}`); params.push(String(username).trim().toLowerCase()); }
    if (email !== undefined) { updates.push(`email = $${i++}`); params.push(email || null); }
    if (password) {
      const hash = await bcrypt.hash(String(password), 12);
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

  fastify.delete('/api/admin/users/:id', async (request: FastifyRequest, reply: FastifyReply) => {
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

  fastify.get('/api/admin/agenda', async (request: FastifyRequest, reply: FastifyReply) => {
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

  fastify.post('/api/admin/agenda', async (request: FastifyRequest, reply: FastifyReply) => {
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

  fastify.put('/api/admin/agenda/:id', async (request: FastifyRequest, reply: FastifyReply) => {
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

  fastify.delete('/api/admin/agenda/:id', async (request: FastifyRequest, reply: FastifyReply) => {
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

  fastify.get('/api/admin/messages', async (request: FastifyRequest, reply: FastifyReply) => {
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

  fastify.delete('/api/admin/messages/:id', async (request: FastifyRequest, reply: FastifyReply) => {
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

  fastify.delete('/api/admin/messages', async (request: FastifyRequest, reply: FastifyReply) => {
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

  fastify.post('/api/admin/messages/bulk-delete', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkAdminAuth(request, reply)) return;
    const { ids } = request.body as { ids?: number[] };
    if (!Array.isArray(ids) || ids.length === 0) {
      reply.statusCode = 400;
      return { error: 'ids array requis' };
    }
    try {
      const placeholders = ids.map((_: any, i: number) => `$${i + 1}`).join(',');
      const result = await query(`DELETE FROM messages WHERE id IN (${placeholders})`, ids);
      return { success: true, deleted: result.rowCount };
    } catch (err: any) {
      fastify.log.error({ err }, 'admin POST /messages/bulk-delete');
      reply.statusCode = 500;
      return { error: 'Database error' };
    }
  });

  // ─────────────────────────────────────────────
  // RÉCEPTION : MARQUES & MODÈLES
  // ─────────────────────────────────────────────

  fastify.get('/api/admin/marques', async (request: FastifyRequest, reply: FastifyReply) => {
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

  fastify.post('/api/admin/marques', async (request: FastifyRequest, reply: FastifyReply) => {
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

  fastify.put('/api/admin/marques/:id', async (request: FastifyRequest, reply: FastifyReply) => {
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

  fastify.delete('/api/admin/marques/:id', async (request: FastifyRequest, reply: FastifyReply) => {
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

  fastify.get('/api/admin/marques/:id/modeles', async (request: FastifyRequest, reply: FastifyReply) => {
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

  fastify.post('/api/admin/marques/:id/modeles', async (request: FastifyRequest, reply: FastifyReply) => {
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

  fastify.delete('/api/admin/modeles/:id', async (request: FastifyRequest, reply: FastifyReply) => {
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

  fastify.get('/api/admin/lots', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkAdminAuth(request, reply)) return;
    const { status, search } = request.query as any;
    let sql = `SELECT l.id, l.name, l.status, l.item_count, l.description, l.received_at, l.created_at, l.updated_at, l.pdf_path
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

  fastify.put('/api/admin/lots/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkAdminAuth(request, reply)) return;
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const updates: string[] = [];
    const values: any[] = [];
    let i = 1;
    if (body.name !== undefined) { updates.push(`name = $${i++}`); values.push(body.name); }
    if (body.status !== undefined) { updates.push(`status = $${i++}`); values.push(body.status); }
    if (body.description !== undefined) { updates.push(`description = $${i++}`); values.push(body.description); }
    if (body.pdf_path !== undefined) { updates.push(`pdf_path = $${i++}`); values.push(body.pdf_path || null); }
    if (!updates.length) {
      reply.statusCode = 400;
      return { error: 'Aucun champ à mettre à jour' };
    }
    updates.push('updated_at = NOW()');
    values.push(id);
    try {
      const result = await query(
        `UPDATE lots SET ${updates.join(', ')} WHERE id = $${i} RETURNING id, name, status, item_count, description, received_at, updated_at, pdf_path`,
        values
      );
      if (result.rowCount === 0) { reply.statusCode = 404; return { error: 'Lot introuvable' }; }
      return { success: true, lot: result.rows[0] };
    } catch (err: any) {
      fastify.log.error({ err }, 'admin PUT /lots/:id');
      reply.statusCode = 500;
      return { error: 'Database error' };
    }
  });

  fastify.delete('/api/admin/lots/:id', async (request: FastifyRequest, reply: FastifyReply) => {
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

  fastify.get('/api/admin/lots/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkAdminAuth(request, reply)) return;
    const { id } = request.params as { id: string };
    try {
      const lotResult = await query(
        `SELECT l.id, l.name, l.status, l.item_count, l.received_at, l.pdf_path
         FROM lots l WHERE l.id = $1 AND l.deleted_at IS NULL`,
        [id]
      );
      if (lotResult.rowCount === 0) { reply.statusCode = 404; return { error: 'Lot introuvable' }; }
      const lot = lotResult.rows[0];
      const itemsResult = await query(
        `SELECT li.id, li.serial_number, li.type, li.state, li.technician, li.state_changed_at,
                m.name as marque_name, mo.name as modele_name
         FROM lot_items li
         LEFT JOIN marques m ON li.marque_id = m.id
         LEFT JOIN modeles mo ON li.modele_id = mo.id
         WHERE li.lot_id = $1 AND (li.deleted_at IS NULL)
         ORDER BY li.id ASC`,
        [id]
      );
      return { success: true, lot: { ...lot, items: itemsResult.rows } };
    } catch (err: any) {
      fastify.log.error({ err }, 'admin GET /lots/:id');
      reply.statusCode = 500;
      return { error: 'Database error' };
    }
  });

  fastify.put('/api/admin/lots/items/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkAdminAuth(request, reply)) return;
    const { id } = request.params as { id: string };
    const { state, technician } = request.body as { state?: string | null; technician?: string | null };
    const updates: string[] = [];
    const values: any[] = [];
    let i = 1;
    if (state !== undefined) {
      updates.push(`state = $${i++}`, `state_changed_at = NOW()`);
      values.push(state === null || (typeof state === 'string' && state.trim() === '') ? null : state);
    }
    if (technician !== undefined) {
      updates.push(`technician = $${i++}`);
      values.push(technician === null || (typeof technician === 'string' && technician.trim() === '') ? null : technician);
    }
    if (updates.length === 0) { reply.statusCode = 400; return { error: 'state ou technician requis' }; }
    updates.push('updated_at = NOW()');
    values.push(id);
    try {
      const result = await query(
        `UPDATE lot_items SET ${updates.join(', ')} WHERE id = $${i} RETURNING id, lot_id, state, technician, state_changed_at`,
        values
      );
      if (result.rowCount === 0) { reply.statusCode = 404; return { error: 'Article introuvable' }; }
      return { success: true, item: result.rows[0] };
    } catch (err: any) {
      fastify.log.error({ err }, 'admin PUT /lots/items/:id');
      reply.statusCode = 500;
      return { error: 'Database error' };
    }
  });

  // ─────────────────────────────────────────────
  // LOTS DISQUES (sessions shred)
  // ─────────────────────────────────────────────

  fastify.get('/api/admin/disques/sessions', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkAdminAuth(request, reply)) return;
    const { year, month } = request.query as { year?: string; month?: string };
    let sql = `SELECT id, date, name, pdf_path, created_at FROM disques_sessions`;
    const params: any[] = [];
    if (year && /^\d{4}$/.test(year)) { sql += ' WHERE EXTRACT(YEAR FROM date) = $1'; params.push(year); }
    if (month && /^(0?[1-9]|1[0-2])$/.test(month)) {
      sql += params.length ? ' AND ' : ' WHERE ';
      sql += ` EXTRACT(MONTH FROM date) = $${params.length + 1}`;
      params.push(parseInt(month, 10));
    }
    sql += ' ORDER BY date DESC, created_at DESC LIMIT 500';
    try {
      const result = await query(sql, params);
      const sessions = result.rows as any[];
      if (sessions.length === 0) return { success: true, sessions: [] };
      const sessionIds = sessions.map((s: any) => s.id);
      const placeholders = sessionIds.map((_: any, i: number) => `$${i + 1}`).join(',');
      const disksResult = await query(
        `SELECT session_id, COUNT(*) as disk_count FROM disques_session_disks WHERE session_id IN (${placeholders}) GROUP BY session_id`,
        sessionIds
      );
      const countBySession: Record<number, number> = {};
      for (const r of disksResult.rows as any[]) countBySession[r.session_id] = parseInt(r.disk_count, 10) || 0;
      sessions.forEach((s: any) => { s.disk_count = countBySession[s.id] || 0; });
      return { success: true, sessions };
    } catch (err: any) {
      fastify.log.error({ err }, 'admin GET /disques/sessions');
      reply.statusCode = 500;
      return { error: 'Database error' };
    }
  });

  fastify.get('/api/admin/disques/sessions/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkAdminAuth(request, reply)) return;
    const { id } = request.params as { id: string };
    try {
      const sessionResult = await query(
        'SELECT id, date, name, pdf_path, created_at FROM disques_sessions WHERE id = $1',
        [id]
      );
      if (sessionResult.rowCount === 0) { reply.statusCode = 404; return { error: 'Session introuvable' }; }
      const session = sessionResult.rows[0] as any;
      const disksResult = await query(
        'SELECT id, serial, marque, modele, size, disk_type, interface, shred FROM disques_session_disks WHERE session_id = $1 ORDER BY id',
        [id]
      );
      return { success: true, session: { ...session, disks: disksResult.rows } };
    } catch (err: any) {
      fastify.log.error({ err }, 'admin GET /disques/sessions/:id');
      reply.statusCode = 500;
      return { error: 'Database error' };
    }
  });

  fastify.put('/api/admin/disques/sessions/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkAdminAuth(request, reply)) return;
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const updates: string[] = [];
    const values: any[] = [];
    let i = 1;
    if (body.name !== undefined) { updates.push(`name = $${i++}`); values.push(body.name === null || body.name === '' ? null : String(body.name).trim() || null); }
    if (!updates.length && !Array.isArray(body.disks)) {
      reply.statusCode = 400;
      return { error: 'Aucun champ à mettre à jour (name ou disks)' };
    }
    if (updates.length) {
      values.push(id);
      await query(`UPDATE disques_sessions SET ${updates.join(', ')} WHERE id = $${i}`, values);
    }
    if (Array.isArray(body.disks)) {
      await query('DELETE FROM disques_session_disks WHERE session_id = $1', [id]);
      for (const d of body.disks) {
        await query(
          `INSERT INTO disques_session_disks (session_id, serial, marque, modele, size, disk_type, interface, shred)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            id,
            (d.serial != null ? String(d.serial) : '').trim() || null,
            (d.marque != null ? String(d.marque) : '').trim() || null,
            (d.modele != null ? String(d.modele) : '').trim() || null,
            (d.size != null ? String(d.size) : '').trim() || null,
            (d.disk_type != null ? String(d.disk_type) : '').trim() || null,
            (d.interface != null ? String(d.interface) : '').trim() || null,
            (d.shred != null ? String(d.shred) : '').trim() || null
          ]
        );
      }
      const sessionRow = await query('SELECT date FROM disques_sessions WHERE id = $1', [id]);
      const sessionDate = sessionRow.rows[0] as any;
      const dateStr = sessionDate?.date && (typeof sessionDate.date === 'string' ? sessionDate.date : (sessionDate.date as Date).toISOString?.()?.slice(0, 10)) || new Date().toISOString().slice(0, 10);
      const disksForPdf = await query(
        'SELECT serial, marque, modele, size, disk_type, interface, shred FROM disques_session_disks WHERE session_id = $1 ORDER BY id',
        [id]
      );
      const rows = (disksForPdf.rows as any[]).map((r: any) => ({
        serial: r.serial,
        marque: r.marque,
        modele: r.modele,
        size: r.size,
        disk_type: r.disk_type,
        interface: r.interface,
        shred: r.shred
      }));
      const pdfBuffer = await generateDisquesPdf(dateStr, rows);
      const pdfStorageDir = process.env.PDF_STORAGE_PATH || path.join(process.cwd(), 'data', 'pdfs');
      const year = dateStr.slice(0, 4);
      const month = dateStr.slice(5, 7);
      const dirPath = path.join(pdfStorageDir, 'Disques', year, month);
      fs.mkdirSync(dirPath, { recursive: true });
      const fileName = `Disques_Shred_${dateStr}_${id}.pdf`;
      const serverFilePath = path.join(dirPath, fileName);
      fs.writeFileSync(serverFilePath, pdfBuffer);
      await query('UPDATE disques_sessions SET pdf_path = $1 WHERE id = $2', [path.resolve(serverFilePath), id]);
    }
    try {
      const sessionResult = await query('SELECT id, date, name, pdf_path, created_at FROM disques_sessions WHERE id = $1', [id]);
      if (sessionResult.rowCount === 0) { reply.statusCode = 404; return { error: 'Session introuvable' }; }
      const session = sessionResult.rows[0] as any;
      const disksResult = await query(
        'SELECT id, serial, marque, modele, size, disk_type, interface, shred FROM disques_session_disks WHERE session_id = $1 ORDER BY id',
        [id]
      );
      return { success: true, session: { ...session, disks: disksResult.rows } };
    } catch (err: any) {
      fastify.log.error({ err }, 'admin PUT /disques/sessions/:id');
      reply.statusCode = 500;
      return { error: 'Database error' };
    }
  });

  fastify.delete('/api/admin/disques/sessions/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkAdminAuth(request, reply)) return;
    const { id } = request.params as { id: string };
    try {
      await query('DELETE FROM disques_session_disks WHERE session_id = $1', [id]);
      const result = await query('DELETE FROM disques_sessions WHERE id = $1', [id]);
      if (result.rowCount === 0) { reply.statusCode = 404; return { error: 'Session introuvable' }; }
      return { success: true };
    } catch (err: any) {
      fastify.log.error({ err }, 'admin DELETE /disques/sessions/:id');
      reply.statusCode = 500;
      return { error: 'Database error' };
    }
  });

  // ─────────────────────────────────────────────
  // RACCOURCIS WEB
  // ─────────────────────────────────────────────

  fastify.get('/api/admin/shortcuts', async (request: FastifyRequest, reply: FastifyReply) => {
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

  fastify.post('/api/admin/shortcuts', async (request: FastifyRequest, reply: FastifyReply) => {
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

  fastify.put('/api/admin/shortcuts/:id', async (request: FastifyRequest, reply: FastifyReply) => {
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

  fastify.delete('/api/admin/shortcuts/:id', async (request: FastifyRequest, reply: FastifyReply) => {
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

  fastify.get('/api/admin/shortcut-categories', async (request: FastifyRequest, reply: FastifyReply) => {
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

  fastify.post('/api/admin/shortcut-categories', async (request: FastifyRequest, reply: FastifyReply) => {
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

  fastify.delete('/api/admin/shortcut-categories/:id', async (request: FastifyRequest, reply: FastifyReply) => {
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
  // CONFIG CLIENT : APPLICATIONS (persistant en base)
  // ─────────────────────────────────────────────

  async function persistAppManagers(
    client: PoolClient,
    appManagers: Record<string, { apps: Array<{ name: string; command: string; icon?: string; args?: string[] }> }>
  ): Promise<void> {
    await client.query('DELETE FROM app_preset_apps');
    await client.query('DELETE FROM app_presets');
    for (const [presetKey, data] of Object.entries(appManagers)) {
      if (!data?.apps || !Array.isArray(data.apps)) continue;
      const pres = await client.query<{ id: number }>('INSERT INTO app_presets (preset_key, updated_at) VALUES ($1, NOW()) RETURNING id', [presetKey]);
      const presetId = pres.rows[0].id;
      let order = 0;
      for (const app of data.apps) {
        await client.query(
          'INSERT INTO app_preset_apps (app_preset_id, name, command, icon, args, sort_order) VALUES ($1, $2, $3, $4, $5, $6)',
          [presetId, app.name || '', app.command || '', app.icon || 'fa-rocket', JSON.stringify(app.args || []), order++]
        );
      }
    }
  }

  fastify.get('/api/admin/config/apps', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const presetsResult = await query<{ id: number; preset_key: string }>('SELECT id, preset_key FROM app_presets ORDER BY preset_key');
      if (presetsResult.rows.length === 0) {
        const filePath = resolveClientConfigPath('AppConfig.js');
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8');
          const appManagers = parseConfigField(content, 'appManagers') as Record<string, { apps: Array<{ name: string; command: string; icon?: string; args?: string[] }> }> | null;
          const out = { success: true as const, appManagers: appManagers || {}, raw: content };
          if (appManagers && typeof appManagers === 'object') {
            transaction((client) => persistAppManagers(client, appManagers)).catch((err) => fastify.log.error({ err }, 'seed apps from file'));
          }
          return out;
        }
        return { success: true, appManagers: {}, raw: '' };
      }
      const appManagers: Record<string, { apps: Array<{ name: string; command: string; icon?: string; args?: string[] }> }> = {};
      for (const row of presetsResult.rows) {
        const appsResult = await query<{ name: string; command: string; icon: string; args: string | null }>(
          'SELECT name, command, icon, args FROM app_preset_apps WHERE app_preset_id = $1 ORDER BY sort_order, id',
          [row.id]
        );
        appManagers[row.preset_key] = {
          apps: appsResult.rows.map(a => ({
            name: a.name,
            command: a.command,
            icon: a.icon || 'fa-rocket',
            args: a.args ? (JSON.parse(a.args) as string[]) : []
          }))
        };
      }
      return { success: true, appManagers };
    } catch (err: any) {
      fastify.log.error({ err }, 'admin GET /config/apps');
      reply.statusCode = 500;
      return { error: 'Impossible de lire la config applications' };
    }
  });

  fastify.put('/api/admin/config/apps', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkAdminAuth(request, reply)) return;
    const { content } = request.body as any;
    if (!content || typeof content !== 'string') {
      reply.statusCode = 400;
      return { error: 'content (string) requis' };
    }
    try {
      const appManagers = parseConfigField(content, 'appManagers') as Record<string, { apps: Array<{ name: string; command: string; icon?: string; args?: string[] }> }> | null;
      if (!appManagers || typeof appManagers !== 'object') {
        reply.statusCode = 400;
        return { error: 'Contenu invalide : appManagers attendu' };
      }
      await transaction((client) => persistAppManagers(client, appManagers));
      return { success: true };
    } catch (err: any) {
      fastify.log.error({ err }, 'admin PUT /config/apps');
      reply.statusCode = 500;
      return { error: 'Impossible d\'enregistrer la config applications' };
    }
  });

  // ─────────────────────────────────────────────
  // CONFIG CLIENT : DOSSIERS (persistant en base)
  // ─────────────────────────────────────────────

  async function persistFolderConfig(
    client: PoolClient,
    fileManagers: Record<string, { basePath?: string; blacklist?: string[]; ignoreSuffixes?: string[]; ignoreExtensions?: string[] }>,
    blacklist: string[],
    ignoreSuffixes: string[],
    ignoreExtensions: string[]
  ): Promise<void> {
    await client.query('DELETE FROM folder_presets');
    for (const [presetKey, data] of Object.entries(fileManagers || {})) {
      const basePath = (data?.basePath ?? '').toString();
      await client.query(
        `INSERT INTO folder_presets (preset_key, base_path, blacklist, ignore_suffixes, ignore_extensions, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [presetKey, basePath, JSON.stringify(data?.blacklist ?? []), JSON.stringify(data?.ignoreSuffixes ?? []), JSON.stringify(data?.ignoreExtensions ?? [])]
      );
    }
    await client.query('DELETE FROM folder_globals');
    await client.query(
      `INSERT INTO folder_globals (blacklist, ignore_suffixes, ignore_extensions, updated_at) VALUES ($1, $2, $3, NOW())`,
      [JSON.stringify(blacklist || []), JSON.stringify(ignoreSuffixes || []), JSON.stringify(ignoreExtensions || [])]
    );
  }

  function parseJsonArray(val: string | null): string[] {
    if (val == null || val === '') return [];
    try {
      const a = JSON.parse(val);
      return Array.isArray(a) ? a : [];
    } catch { return []; }
  }

  fastify.get('/api/admin/config/folders', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const presetsResult = await query<{ id: number; preset_key: string; base_path: string; blacklist: string | null; ignore_suffixes: string | null; ignore_extensions: string | null }>(
        'SELECT id, preset_key, base_path, blacklist, ignore_suffixes, ignore_extensions FROM folder_presets ORDER BY preset_key'
      );
      if (presetsResult.rows.length === 0) {
        const filePath = resolveClientConfigPath('FolderConfig.js');
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8');
          const fileManagers = parseConfigField(content, 'fileManagers') as Record<string, { basePath?: string; blacklist?: string[]; ignoreSuffixes?: string[]; ignoreExtensions?: string[] }> | null;
          const blacklist = parseConfigArray(content, 'blacklist');
          const ignoreSuffixes = parseConfigArray(content, 'ignoreSuffixes');
          const ignoreExtensions = parseConfigArray(content, 'ignoreExtensions');
          const out = { success: true as const, fileManagers: fileManagers || {}, blacklist, ignoreSuffixes, ignoreExtensions, raw: content };
          if (fileManagers && typeof fileManagers === 'object') {
            transaction((client) => persistFolderConfig(client, fileManagers, blacklist, ignoreSuffixes, ignoreExtensions)).catch((err) => fastify.log.error({ err }, 'seed folders from file'));
          }
          return out;
        }
        return { success: true, fileManagers: {}, blacklist: [], ignoreSuffixes: [], ignoreExtensions: [], raw: '' };
      }
      const fileManagers: Record<string, { basePath: string; blacklist?: string[]; ignoreSuffixes?: string[]; ignoreExtensions?: string[] }> = {};
      for (const row of presetsResult.rows) {
        fileManagers[row.preset_key] = {
          basePath: row.base_path,
          blacklist: parseJsonArray(row.blacklist),
          ignoreSuffixes: parseJsonArray(row.ignore_suffixes),
          ignoreExtensions: parseJsonArray(row.ignore_extensions)
        };
      }
      const globalsResult = await query<{ blacklist: string | null; ignore_suffixes: string | null; ignore_extensions: string | null }>('SELECT blacklist, ignore_suffixes, ignore_extensions FROM folder_globals LIMIT 1');
      const g = globalsResult.rows[0];
      const blacklist = g ? parseJsonArray(g.blacklist) : [];
      const ignoreSuffixes = g ? parseJsonArray(g.ignore_suffixes) : [];
      const ignoreExtensions = g ? parseJsonArray(g.ignore_extensions) : [];
      return { success: true, fileManagers, blacklist, ignoreSuffixes, ignoreExtensions };
    } catch (err: any) {
      fastify.log.error({ err }, 'admin GET /config/folders');
      reply.statusCode = 500;
      return { error: 'Impossible de lire la config dossiers' };
    }
  });

  fastify.put('/api/admin/config/folders', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkAdminAuth(request, reply)) return;
    const { content } = request.body as any;
    if (!content || typeof content !== 'string') {
      reply.statusCode = 400;
      return { error: 'content (string) requis' };
    }
    try {
      const fileManagers = parseConfigField(content, 'fileManagers') as Record<string, { basePath?: string; blacklist?: string[]; ignoreSuffixes?: string[]; ignoreExtensions?: string[] }> | null;
      const blacklist = parseConfigArray(content, 'blacklist');
      const ignoreSuffixes = parseConfigArray(content, 'ignoreSuffixes');
      const ignoreExtensions = parseConfigArray(content, 'ignoreExtensions');
      await transaction((client) => persistFolderConfig(client, fileManagers && typeof fileManagers === 'object' ? fileManagers : {}, blacklist || [], ignoreSuffixes || [], ignoreExtensions || []));
      return { success: true };
    } catch (err: any) {
      fastify.log.error({ err }, 'admin PUT /config/folders');
      reply.statusCode = 500;
      return { error: 'Impossible d\'enregistrer la config dossiers' };
    }
  });

  // ─────────────────────────────────────────────
  // CONFIG SMTP (stockée en base, fallback .env)
  // ─────────────────────────────────────────────

  const SMTP_KEYS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM'];

  async function getSmtpConfig(): Promise<Record<string, string>> {
    const defaults: Record<string, string> = {
      SMTP_HOST: process.env.SMTP_HOST || '',
      SMTP_PORT: process.env.SMTP_PORT || '587',
      SMTP_SECURE: process.env.SMTP_SECURE || 'false',
      SMTP_USER: process.env.SMTP_USER || '',
      SMTP_PASS: process.env.SMTP_PASS || '',
      MAIL_FROM: process.env.MAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER || '',
    };
    try {
      const result = await query('SELECT key, value FROM app_settings WHERE key = ANY($1)', [SMTP_KEYS]);
      for (const row of result.rows) {
        defaults[row.key] = row.value ?? '';
      }
    } catch (_) {}
    return defaults;
  }

  fastify.get('/api/admin/config/smtp', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkAdminAuth(request, reply)) return;
    try {
      const config = await getSmtpConfig();
      return { success: true, config: { ...config, SMTP_PASS: config.SMTP_PASS ? '***' : '' } };
    } catch (err: any) {
      fastify.log.error({ err }, 'admin GET /config/smtp');
      reply.statusCode = 500;
      return { error: 'Erreur lecture config SMTP' };
    }
  });

  fastify.put('/api/admin/config/smtp', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkAdminAuth(request, reply)) return;
    const body = request.body as Record<string, string>;
    try {
      for (const key of SMTP_KEYS) {
        if (key in body) {
          const value = body[key];
          if (key === 'SMTP_PASS' && value === '***') continue;
          await query(
            'INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, now()) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()',
            [key, value]
          );
        }
      }
      return { success: true };
    } catch (err: any) {
      fastify.log.error({ err }, 'admin PUT /config/smtp');
      reply.statusCode = 500;
      return { error: 'Erreur sauvegarde config SMTP' };
    }
  });

  fastify.post('/api/admin/config/smtp/test', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkAdminAuth(request, reply)) return;
    const { to } = request.body as { to?: string };
    if (!to) { reply.statusCode = 400; return { error: 'Adresse destinataire requise' }; }
    try {
      const config = await getSmtpConfig();
      if (!config.SMTP_HOST) { reply.statusCode = 400; return { error: 'SMTP_HOST non configuré' }; }
      const transporter = nodemailer.createTransport({
        host: config.SMTP_HOST,
        port: parseInt(config.SMTP_PORT || '587', 10),
        secure: config.SMTP_SECURE === 'true',
        auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS || '' } : undefined,
      });
      await transporter.sendMail({
        from: config.MAIL_FROM || config.SMTP_USER || 'noreply@localhost',
        to,
        subject: 'Test SMTP — Workspace Admin',
        text: 'Ceci est un email de test envoyé depuis le panel admin Workspace.',
        html: '<p>Ceci est un email de test envoyé depuis le <strong>panel admin Workspace</strong>.</p>',
      });
      return { success: true, message: `Email de test envoyé à ${to}` };
    } catch (err: any) {
      fastify.log.error({ err }, 'admin POST /config/smtp/test');
      reply.statusCode = 500;
      return { error: `Erreur envoi: ${err.message}` };
    }
  });

  // ─────────────────────────────────────────────
  // LOGS SÉPARÉS
  // ─────────────────────────────────────────────

  fastify.get('/api/admin/logs/chat', async (request: FastifyRequest, reply: FastifyReply) => {
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

  fastify.get('/api/admin/logs/db', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkAdminAuth(request, reply)) return;
    try {
      const [users, messages, events, lots, shortcuts, lot_items, marques, modeles] = await Promise.all([
        query('SELECT COUNT(*) FROM users'),
        query('SELECT COUNT(*) FROM messages'),
        query('SELECT COUNT(*) FROM events WHERE deleted_at IS NULL'),
        query('SELECT COUNT(*) FROM lots WHERE deleted_at IS NULL'),
        query('SELECT COUNT(*) FROM shortcuts WHERE deleted_at IS NULL'),
        query('SELECT COUNT(*) FROM lot_items WHERE deleted_at IS NULL'),
        query('SELECT COUNT(*) FROM marques'),
        query('SELECT COUNT(*) FROM modeles'),
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

  // ─────────────────────────────────────────────
  // BASE DE DONNÉES : tables (lecture / édition)
  // ─────────────────────────────────────────────

  const DB_TABLES_WHITELIST = [
    'users', 'marques', 'modeles', 'messages', 'events', 'activity_logs',
    'shortcut_categories', 'shortcuts', 'lots', 'lot_items', 'client_errors', 'app_settings',
  ];

  fastify.get('/api/admin/db/tables', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkAdminAuth(request, reply)) return;
    try {
      const result = await query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
         AND table_name = ANY($1::text[]) ORDER BY table_name`,
        [DB_TABLES_WHITELIST]
      );
      return { success: true, tables: result.rows.map((r: any) => r.table_name) };
    } catch (err: any) {
      fastify.log.error({ err }, 'admin GET /db/tables');
      reply.statusCode = 500;
      return { error: 'Database error' };
    }
  });

  fastify.get<{ Params: { table: string }; Querystring: { limit?: string; offset?: string } }>(
    '/api/admin/db/tables/:table',
    async (request, reply) => {
      if (!checkAdminAuth(request, reply)) return;
      const { table } = request.params;
      const limit = Math.min(Number(request.query.limit) || 50, 200);
      const offset = Math.max(0, Number(request.query.offset) || 0);
      if (!DB_TABLES_WHITELIST.includes(table)) {
        reply.statusCode = 400;
        return { error: 'Table non autorisée' };
      }
      try {
        const safeTable = table.replace(/[^a-z0-9_]/gi, '');
        const countResult = await query(`SELECT COUNT(*) FROM ${safeTable}`);
        const total = parseInt((countResult.rows[0] as any).count, 10);
        const result = await query(
          `SELECT * FROM ${safeTable} LIMIT $1 OFFSET $2`,
          [limit, offset]
        );
        const columns = result.rows.length ? Object.keys(result.rows[0] as object) : [];
        return { success: true, columns, rows: result.rows, total };
      } catch (err: any) {
        fastify.log.error({ err, table }, 'admin GET /db/tables/:table');
        reply.statusCode = 500;
        return { error: 'Database error' };
      }
    }
  );

  fastify.put<{ Params: { table: string; id: string }; Body: Record<string, unknown> }>(
    '/api/admin/db/tables/:table/rows/:id',
    async (request, reply) => {
      if (!checkAdminAuth(request, reply)) return;
      const { table, id } = request.params;
      const body = request.body as Record<string, unknown>;
      if (!DB_TABLES_WHITELIST.includes(table)) {
        reply.statusCode = 400;
        return { error: 'Table non autorisée' };
      }
      const safeTable = table.replace(/[^a-z0-9_]/gi, '');
      if (!body || typeof body !== 'object') {
        reply.statusCode = 400;
        return { error: 'Body attendu' };
      }
      try {
        const colResult = await query(
          `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
          [safeTable]
        );
        const allowedCols = (colResult.rows as { column_name: string }[]).map(r => r.column_name);
        const forbidden = ['id', 'password_hash'];
        const updates: string[] = [];
        const values: unknown[] = [];
        let i = 1;
        for (const [key, value] of Object.entries(body)) {
          if (!allowedCols.includes(key) || forbidden.includes(key)) continue;
          updates.push(`"${key}" = $${i++}`);
          values.push(value);
        }
        if (!updates.length) {
          reply.statusCode = 400;
          return { error: 'Aucun champ à mettre à jour' };
        }
        values.push(id);
        const result = await query(
          `UPDATE ${safeTable} SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`,
          values
        );
        if (result.rowCount === 0) {
          reply.statusCode = 404;
          return { error: 'Ligne introuvable' };
        }
        return { success: true, row: result.rows[0] };
      } catch (err: any) {
        fastify.log.error({ err, table, id }, 'admin PUT /db/tables/:table/rows/:id');
        reply.statusCode = 500;
        return { error: 'Database error' };
      }
    }
  );

  fastify.get('/api/admin/logs/auth', async (request: FastifyRequest, reply: FastifyReply) => {
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

  fastify.get('/api/admin/logs/api', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkAdminAuth(request, reply)) return;
    const logs = getServerLogs()
      .filter(l => /GET|POST|PUT|DELETE|PATCH|incoming request|request completed|\d{3}/i.test(l.text))
      .slice(-300)
      .map(l => `[${l.time}] ${l.text}`);
    return { success: true, logs };
  });

  fastify.get('/api/admin/logs/reception', async (request: FastifyRequest, reply: FastifyReply) => {
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

  fastify.get('/api/admin/logs/raw', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkAdminAuth(request, reply)) return;
    const logs = getServerLogs().map(l => `[${l.time}] ${l.text}`).join('\n');
    return { success: true, logs };
  });

  // ─────────────────────────────────────────────
  // CONTRÔLE SERVEUR (équivalent proxmox status / start / stop / restart)
  // ─────────────────────────────────────────────

  function getServerStatus(): {
    systemd: string;
    containerApi: string;
    containerDb: string;
    apiHttp: string;
    websocket: string;
    accessUrl: string;
  } {
    let systemd = 'unknown';
    let containerApi = 'stopped';
    let containerDb = 'stopped';
    const apiHttp = 'online'; // si on répond, l'API est up
    const websocket = 'online';
    const apiPort = process.env.API_PORT || '4000';
    const accessUrl = `http://localhost:${apiPort}`;

    try {
      const out = child_process.execSync(`systemctl is-active ${SERVICE_NAME} 2>/dev/null || echo unknown`, {
        encoding: 'utf8',
        timeout: 3000,
      });
      systemd = (out || '').trim().toLowerCase() || 'unknown';
    } catch {
      // non-Linux ou pas de droits
    }

    try {
      const psOut = child_process.execSync('docker ps -a --format "{{.Names}}\t{{.Status}}" 2>/dev/null || true', {
        encoding: 'utf8',
        timeout: 5000,
      });
      const lines = (psOut || '').trim().split('\n').filter(Boolean);
      for (const line of lines) {
        const [name = '', status = ''] = line.split('\t');
        if (/workspace-proxmox|proxmox.*api/i.test(name)) {
          containerApi = /up|running/i.test(status) ? 'running' : 'stopped';
        }
        if (/workspace-db|proxmox.*db/i.test(name)) {
          containerDb = /up|running/i.test(status) ? 'running' : 'stopped';
        }
      }
    } catch {
      // docker non dispo ou pas de droits
    }

    return {
      systemd: systemd === 'active' ? 'active' : systemd,
      containerApi,
      containerDb,
      apiHttp,
      websocket,
      accessUrl,
    };
  }

  fastify.get('/api/admin/server/status', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkAdminAuth(request, reply)) return;
    try {
      const status = getServerStatus();
      return { success: true, status };
    } catch (err: any) {
      fastify.log.error({ err }, 'admin GET /server/status');
      reply.statusCode = 500;
      return { error: 'Erreur lors de la récupération du statut' };
    }
  });

  fastify.post('/api/admin/server/start', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkAdminAuth(request, reply)) return;
    try {
      reply.send({ success: true, message: 'Démarrage en cours.' });
      setImmediate(() => {
        try {
          child_process.spawn(PROXMOX_CLI, ['start'], {
            stdio: 'ignore',
            detached: true,
            env: process.env,
          }).unref();
        } catch {
          try {
            child_process.spawn('systemctl', ['start', SERVICE_NAME], { stdio: 'ignore', detached: true }).unref();
          } catch {
            // ignore
          }
        }
      });
    } catch (err: any) {
      fastify.log.error({ err }, 'admin POST /server/start');
      reply.statusCode = 500;
      return { error: err?.message || 'Échec du démarrage' };
    }
  });

  fastify.post('/api/admin/server/stop', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkAdminAuth(request, reply)) return;
    try {
      // Répondre avant d'arrêter (sinon la réponse ne part pas)
      reply.send({ success: true, message: 'Arrêt en cours.' });
      setImmediate(() => {
        try {
          child_process.spawnSync('systemctl', ['stop', SERVICE_NAME], {
            stdio: 'ignore',
            timeout: 10000,
          });
        } catch {
          try {
            child_process.spawnSync(PROXMOX_CLI, ['stop'], { stdio: 'ignore', timeout: 10000 });
          } catch {
            // ignore
          }
        }
      });
    } catch (err: any) {
      fastify.log.error({ err }, 'admin POST /server/stop');
      reply.statusCode = 500;
      return { error: err?.message || 'Échec de l\'arrêt' };
    }
  });

  fastify.post('/api/admin/server/restart', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!checkAdminAuth(request, reply)) return;
    try {
      reply.send({ success: true, message: 'Redémarrage en cours…' });
      setTimeout(() => {
        try {
          child_process.spawnSync('systemctl', ['restart', SERVICE_NAME], {
            stdio: 'ignore',
            timeout: 15000,
          });
        } catch {
          try {
            child_process.spawnSync(PROXMOX_CLI, ['restart'], { stdio: 'ignore', timeout: 15000 });
          } catch {
            // ignore
          }
        }
      }, 1500);
    } catch (err: any) {
      fastify.log.error({ err }, 'admin POST /server/restart');
      reply.statusCode = 500;
      return { error: err?.message || 'Échec du redémarrage' };
    }
  });

  fastify.log.info('✅ Admin routes registered (v2 — auth admin JWT)');
}
