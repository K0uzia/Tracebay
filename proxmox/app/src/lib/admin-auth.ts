import * as crypto from 'crypto';
import { FastifyReply, FastifyRequest } from 'fastify';
import { getSecret } from '../config/secrets';

const ADMIN_JWT_TTL_SECONDS = 60 * 60 * 8;
export const ATELIER_JWT_TTL_SECONDS = 60 * 60;

/** Seules routes ouvertes au jeton à portée « atelier » (réglages d'atelier modifiés depuis un poste). */
export const ATELIER_ROUTES = new Set([
  'PUT /api/admin/branding',
  'DELETE /api/admin/branding/logo',
  'PUT /api/admin/material-types',
]);

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function hmac(data: string): string {
  return crypto.createHmac('sha256', getSecret('JWT_SECRET')).update(data).digest('base64url');
}

/** JWT admin maison (HS256), émis par POST /api/admin/auth/login. */
export function signAdminJwt(payload: Record<string, any>, ttlSeconds: number = ADMIN_JWT_TTL_SECONDS): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...payload, iat: now, exp: now + ttlSeconds })).toString('base64url');
  return `${header}.${body}.${hmac(`${header}.${body}`)}`;
}

/** JWT HS256 signé par ce serveur et non expiré (compte ordinaire ou admin), sinon null. */
function verifyJwt(token: string): Record<string, any> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    if (!safeEqual(sig, hmac(`${header}.${body}`))) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function verifyAdminJwt(token: string): Record<string, any> | null {
  const payload = verifyJwt(token);
  return payload?.admin === true ? payload : null;
}

/** Jeton admin présenté en en-tête (x-admin-token ou Authorization: Bearer), jamais en URL. */
function presentedToken(request: FastifyRequest): string {
  const header = request.headers['x-admin-token'];
  if (typeof header === 'string' && header.trim()) return header.trim();
  return String(request.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
}

/** Droit présenté : complet (ADMIN_TOKEN, JWT admin), « atelier » (JWT à portée réduite) ou aucun. */
export function adminScope(request: FastifyRequest): 'complet' | 'atelier' | null {
  const token = presentedToken(request);
  if (!token) return null;
  if (safeEqual(token, getSecret('ADMIN_TOKEN'))) return 'complet';
  const payload = verifyAdminJwt(token);
  if (!payload) return null;
  return payload.scope === 'atelier' ? 'atelier' : 'complet';
}

/**
 * Vrai si la requête présente le jeton valide d'un compte connecté sans droit admin
 * (connexion ordinaire /api/auth/login, même pour un compte au rôle admin) : 403, pas 401.
 */
export function compteSansDroitAdmin(request: FastifyRequest): boolean {
  const token = presentedToken(request);
  if (!token || adminScope(request)) return false;
  return verifyJwt(token) !== null;
}

/** Clé « MÉTHODE /motif » de la route trouvée (ex. PUT /api/admin/branding). */
export function routeKey(request: FastifyRequest): string {
  const url = (request as any).routeOptions?.url ?? (request as any).routerPath ?? '';
  return `${request.method === 'HEAD' ? 'GET' : request.method} ${url}`;
}

/** Vrai si la requête a le droit admin pour CETTE route (le jeton « atelier » ne vaut que sur ATELIER_ROUTES). */
export function hasAdminCredentials(request: FastifyRequest): boolean {
  const scope = adminScope(request);
  if (scope === 'complet') return true;
  return scope === 'atelier' && ATELIER_ROUTES.has(routeKey(request));
}

/** Envoie 401 et renvoie false si la requête n'a pas de droit admin. */
export function checkAdminAuth(request: FastifyRequest, reply: FastifyReply): boolean {
  if (hasAdminCredentials(request)) return true;
  reply.code(401).send({ error: 'Non autorisé : jeton administrateur requis.' });
  return false;
}
