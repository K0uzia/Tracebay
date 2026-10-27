import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import jwt from 'jsonwebtoken';
import { findSecretProblems } from '../config/secrets';
import { signAdminJwt, verifyAdminJwt } from '../lib/admin-auth';
import { isAdminProtected, registerAdminGuard, registrationAllowed } from '../middleware/admin-guard';
import { registerAuthRateLimit, registerRateLimit } from '../middleware/rate-limit';
import { registerCompression } from '../middleware/compression';
import { performanceConfig } from '../config/performance.config';
import { brotliCompressSync, gzipSync } from 'node:zlib';

const STRONG = {
  JWT_SECRET: 'a'.repeat(64),
  ADMIN_TOKEN: 'b'.repeat(48),
  DB_PASSWORD: 'c'.repeat(48),
};

before(() => {
  Object.assign(process.env, STRONG);
});

describe('secrets', () => {
  test('secrets forts acceptés', () => {
    assert.deepEqual(findSecretProblems(STRONG), []);
  });

  test('secrets absents, connus ou courts refusés', () => {
    const problems = findSecretProblems({
      JWT_SECRET: 'changeme',
      ADMIN_TOKEN: 'Password',
      DB_PASSWORD: 'workspace',
    });
    assert.equal(problems.length, 3);
    assert.match(problems[0], /valeur par défaut connue/);
    assert.match(findSecretProblems({})[0], /absent/);
    assert.match(findSecretProblems({ ...STRONG, DB_PASSWORD: 'court' })[0], /trop court/);
    assert.match(findSecretProblems({ ...STRONG, JWT_SECRET: 'change-me-1700000000-' + 'x'.repeat(20) })[0], /connue/);
  });
});

describe('JWT admin', () => {
  test('signé puis vérifié', () => {
    const token = signAdminJwt({ id: 1, username: 'admin', admin: true });
    assert.equal(verifyAdminJwt(token)?.username, 'admin');
  });

  test('signature altérée ou sans droit admin refusés', () => {
    const token = signAdminJwt({ id: 1, admin: true });
    assert.equal(verifyAdminJwt(token.slice(0, -2) + 'xx'), null);
    assert.equal(verifyAdminJwt(signAdminJwt({ id: 2 })), null);
    assert.equal(verifyAdminJwt('jwt_' + Buffer.from('{"username":"x"}').toString('base64')), null);
  });
});

describe('garde admin', () => {
  test('routes protégées et exceptions', () => {
    assert.equal(isAdminProtected('DELETE', '/api/admin/dons/:id'), true);
    assert.equal(isAdminProtected('GET', '/api/monitoring/users'), true);
    assert.equal(isAdminProtected('GET', '/api/metrics'), true);
    assert.equal(isAdminProtected('POST', '/api/admin/auth/login'), false);
    assert.equal(isAdminProtected('GET', '/api/admin/config/folders'), false);
    assert.equal(isAdminProtected('PUT', '/api/admin/config/folders'), true);
    assert.equal(isAdminProtected('POST', '/api/monitoring/errors'), false);
    assert.equal(isAdminProtected('GET', '/api/monitoring/errors'), true);
    assert.equal(isAdminProtected('GET', '/api/lots'), false);
    // Effacement d'un nom de technicien dans toute la base : réservé aux administrateurs
    assert.equal(isAdminProtected('POST', '/api/lots/technicians/anonymize'), true);
    assert.equal(isAdminProtected('GET', '/api/lots/technicians'), false);
    assert.equal(isAdminProtected('GET', '/monitoring'), false);
    assert.equal(isAdminProtected('OPTIONS', '/api/admin/lots'), false);
    assert.equal(isAdminProtected('GET', undefined), false);
  });

  test('requêtes réelles : 401 sans jeton, 200 avec ADMIN_TOKEN, JWT admin ou route publique', async () => {
    const app = Fastify();
    registerAdminGuard(app);
    app.delete('/api/admin/dons/:id', async () => ({ ok: true }));
    app.get('/api/admin/config/folders', async () => ({ ok: true }));
    app.get('/api/lots', async () => ({ ok: true }));
    await app.ready();

    const denied = await app.inject({ method: 'DELETE', url: '/api/admin/dons/3' });
    assert.equal(denied.statusCode, 401);
    const encoded = await app.inject({ method: 'DELETE', url: '/api/%61dmin/dons/3' });
    assert.notEqual(encoded.statusCode, 200);
    const oldBackdoor = await app.inject({ method: 'DELETE', url: '/api/admin/dons/3', headers: { authorization: 'Bearer ' + ['admin', '123'].join('') } });
    assert.equal(oldBackdoor.statusCode, 401);
    const inUrl = await app.inject({ method: 'DELETE', url: `/api/admin/dons/3?token=${STRONG.ADMIN_TOKEN}` });
    assert.equal(inUrl.statusCode, 401);
    const withToken = await app.inject({ method: 'DELETE', url: '/api/admin/dons/3', headers: { 'x-admin-token': STRONG.ADMIN_TOKEN } });
    assert.equal(withToken.statusCode, 200);
    const withJwt = await app.inject({ method: 'DELETE', url: '/api/admin/dons/3', headers: { authorization: `Bearer ${signAdminJwt({ admin: true })}` } });
    assert.equal(withJwt.statusCode, 200);
    assert.equal((await app.inject({ method: 'GET', url: '/api/admin/config/folders' })).statusCode, 200);
    assert.equal((await app.inject({ method: 'GET', url: '/api/lots' })).statusCode, 200);
    await app.close();
  });
});

describe('branding verrouillé côté serveur', () => {
  test('écritures du branding : 401 sans jeton, 403 pour un compte non admin, admin accepté', async () => {
    const app = Fastify();
    registerAdminGuard(app);
    app.put('/api/admin/branding', async () => ({ ok: true }));
    app.delete('/api/admin/branding/logo', async () => ({ ok: true }));
    app.delete('/api/admin/dons/:id', async () => ({ ok: true }));
    await app.ready();
    const bearer = (t: string) => ({ authorization: `Bearer ${t}` });
    // Jeton d'un compte ordinaire (connexion /api/auth/login), même s'il porte le rôle admin
    const technicien = jwt.sign({ id: 7, username: 'tech', role: 'technicien' }, STRONG.JWT_SECRET, { expiresIn: '7d' });
    const adminOrdinaire = jwt.sign({ id: 1, username: 'admin', role: 'admin' }, STRONG.JWT_SECRET, { expiresIn: '7d' });
    const atelier = signAdminJwt({ id: 1, admin: true, scope: 'atelier' });

    for (const [method, url] of [['PUT', '/api/admin/branding'], ['DELETE', '/api/admin/branding/logo']] as const) {
      assert.equal((await app.inject({ method, url, payload: method === 'PUT' ? { company_name: 'X' } : undefined })).statusCode, 401);
      const refus = await app.inject({ method, url, headers: bearer(technicien), payload: method === 'PUT' ? { company_name: 'X' } : undefined });
      assert.equal(refus.statusCode, 403);
      assert.match(refus.json().error, /administrateur/);
      assert.equal((await app.inject({ method, url, headers: bearer(adminOrdinaire) })).statusCode, 403);
      assert.equal((await app.inject({ method, url, headers: bearer(atelier) })).statusCode, 200);
      assert.equal((await app.inject({ method, url, headers: bearer(signAdminJwt({ admin: true })) })).statusCode, 200);
      assert.equal((await app.inject({ method, url, headers: { 'x-admin-token': STRONG.ADMIN_TOKEN } })).statusCode, 200);
    }
    // Jeton altéré ou expiré : pas un compte reconnu, donc 401
    assert.equal((await app.inject({ method: 'PUT', url: '/api/admin/branding', headers: bearer(technicien.slice(0, -2) + 'xx') })).statusCode, 401);
    const expire = jwt.sign({ id: 7, role: 'technicien' }, STRONG.JWT_SECRET, { expiresIn: -10 });
    assert.equal((await app.inject({ method: 'PUT', url: '/api/admin/branding', headers: bearer(expire) })).statusCode, 401);
    // Le jeton « atelier » ne vaut que pour le branding et les types
    assert.equal((await app.inject({ method: 'DELETE', url: '/api/admin/dons/3', headers: bearer(atelier) })).statusCode, 403);
    await app.close();
  });
});

describe('effacement du nom d\'un technicien réservé aux administrateurs', () => {
  test('401 sans jeton, 403 pour un compte non admin, jeton « atelier » et admin acceptés', async () => {
    const app = Fastify();
    registerAdminGuard(app);
    app.post('/api/lots/technicians/anonymize', async () => ({ success: true, anonymises: 2 }));
    app.get('/api/lots/technicians', async () => ({ technicians: [] }));
    await app.ready();
    const url = '/api/lots/technicians/anonymize';
    const payload = { name: 'Jean' };
    const bearer = (t: string) => ({ authorization: `Bearer ${t}` });
    const technicien = jwt.sign({ id: 7, username: 'tech', role: 'technicien' }, STRONG.JWT_SECRET, { expiresIn: '7d' });

    assert.equal((await app.inject({ method: 'POST', url, payload })).statusCode, 401);
    const refus = await app.inject({ method: 'POST', url, payload, headers: bearer(technicien) });
    assert.equal(refus.statusCode, 403);
    assert.match(refus.json().error, /administrateur/);
    assert.equal((await app.inject({ method: 'POST', url, payload, headers: bearer(signAdminJwt({ admin: true, scope: 'atelier' })) })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url, payload, headers: bearer(signAdminJwt({ admin: true })) })).statusCode, 200);
    assert.equal((await app.inject({ method: 'POST', url, payload, headers: { 'x-admin-token': STRONG.ADMIN_TOKEN } })).statusCode, 200);
    // La liste des noms reste lisible par tous les postes
    assert.equal((await app.inject({ method: 'GET', url: '/api/lots/technicians' })).statusCode, 200);
    await app.close();
  });
});

describe('inscription', () => {
  const req = (headers: Record<string, string> = {}) => ({ headers } as any);
  test('fermée par défaut, ouverte par variable, permise à l\'admin', () => {
    assert.equal(registrationAllowed(req(), {}), false);
    assert.equal(registrationAllowed(req(), { ALLOW_REGISTRATION: 'true' }), true);
    assert.equal(registrationAllowed(req({ 'x-admin-token': STRONG.ADMIN_TOKEN }), {}), true);
  });
});

describe('limite de connexion', () => {
  test('429 après 10 tentatives de connexion depuis la même adresse, autres routes non concernées', async () => {
    const app = Fastify();
    registerAuthRateLimit(app);
    await registerRateLimit(app);
    app.post('/api/auth/login', async () => ({ ok: false }));
    app.get('/api/lots', async () => ({ ok: true }));
    await app.ready();

    const codes: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await app.inject({ method: 'POST', url: '/api/auth/login', remoteAddress: '10.0.0.5', payload: {} });
      codes.push(res.statusCode);
    }
    assert.deepEqual(codes.slice(0, 10), Array(10).fill(200));
    assert.equal(codes[10], 429);
    const other = await app.inject({ method: 'POST', url: '/api/auth/login', remoteAddress: '10.0.0.6', payload: {} });
    assert.equal(other.statusCode, 200);
    for (let i = 0; i < 15; i++) {
      assert.equal((await app.inject({ method: 'GET', url: '/api/lots', remoteAddress: '10.0.0.5' })).statusCode, 200);
    }
    await app.close();
  });
});

describe('corps de requête compressés', () => {
  test('Brotli refusé en 415, gzip accepté, même compression activée', async () => {
    const avant = performanceConfig.compression.enabled;
    performanceConfig.compression.enabled = true;
    const app = Fastify();
    try {
      await registerCompression(app);
      app.post('/api/echo', async (req) => req.body);
      await app.ready();
      const corps = JSON.stringify({ a: 1 });
      const entetes = (encodage: string) => ({ 'content-type': 'application/json', 'content-encoding': encodage });
      const br = await app.inject({
        method: 'POST', url: '/api/echo', headers: entetes('br'), payload: brotliCompressSync(corps),
      });
      assert.equal(br.statusCode, 415);
      const gz = await app.inject({ method: 'POST', url: '/api/echo', headers: entetes('gzip'), payload: gzipSync(corps) });
      assert.equal(gz.statusCode, 200);
      assert.deepEqual(gz.json(), { a: 1 });
    } finally {
      performanceConfig.compression.enabled = avant;
      await app.close();
    }
  });
});
