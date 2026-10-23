import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { BrandingStore, BrandingError, contrastWithWhite, validateColor } from '../lib/branding';
import { DEFAULT_TYPES, MaterialTypesError, validateTypes, TYPES_KEY } from '../lib/material-types';
import { registerBrandingRoutes } from '../api/branding';
import { registerMaterialTypesRoutes } from '../api/material-types';
import { registerAdminGuard, registrationAllowed } from '../middleware/admin-guard';
import { signAdminJwt, ATELIER_ROUTES } from '../lib/admin-auth';

const ADMIN = 'd'.repeat(48);

before(() => {
  Object.assign(process.env, { JWT_SECRET: 'a'.repeat(64), ADMIN_TOKEN: ADMIN, DB_PASSWORD: 'c'.repeat(48) });
});

function memoryStore(): BrandingStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    async get(keys) { return Object.fromEntries(keys.filter((k) => data.has(k)).map((k) => [k, data.get(k)!])); },
    async set(k, v) { data.set(k, v); },
    async remove(k) { data.delete(k); },
  };
}

// Usage simulé : valeurs telles qu'en base (anciens codes, libellés, type retiré de la liste).
const USAGE = [{ type: 'portable', count: 12 }, { type: 'Fixe', count: 3 }, { type: 'Tablette', count: 2 }];
const fauxQuery = async () => ({ rows: USAGE });

async function app(store = memoryStore()) {
  const f = Fastify();
  registerAdminGuard(f);
  await registerBrandingRoutes(f, store);
  await registerMaterialTypesRoutes(f, store, fauxQuery);
  f.get('/api/admin/users', async () => ({ ok: true }));
  f.delete('/api/admin/users/:id', async () => ({ ok: true }));
  f.get('/api/monitoring/stats', async () => ({ ok: true }));
  await f.ready();
  return { f, store };
}

const atelier = () => signAdminJwt({ id: 1, username: 'admin', admin: true, scope: 'atelier' }, 3600);
const complet = () => signAdminJwt({ id: 1, username: 'admin', admin: true });

describe('couleur des PDF', () => {
  test('format strict, contraste ≥ 3:1 avec le blanc, majuscules', () => {
    assert.equal(validateColor('#2d3073'), '#2D3073');
    assert.ok(contrastWithWhite('#2D3073') > 10);
    for (const mauvais of ['2D3073', '#2D307', '#2D30733', 'bleu', '', null, '#GGGGGG']) {
      assert.throws(() => validateColor(mauvais), BrandingError);
    }
    assert.throws(() => validateColor('#FFFF00'), /trop claire/);
    assert.doesNotThrow(() => validateColor('#767676'));
  });

  test('PUT /api/admin/branding : couleur enregistrée, null revient au bleu d\'origine', async () => {
    const { f, store } = await app();
    let r = await f.inject({ method: 'PUT', url: '/api/admin/branding', headers: { 'x-admin-token': ADMIN }, payload: { pdf_color: '#8a1c1c' } });
    assert.equal(r.statusCode, 200);
    assert.equal(r.json().pdf_color, '#8A1C1C');
    assert.equal(store.data.get('branding.pdf_color'), '#8A1C1C');
    r = await f.inject({ method: 'PUT', url: '/api/admin/branding', headers: { 'x-admin-token': ADMIN }, payload: { pdf_color: '#ffee88' } });
    assert.equal(r.statusCode, 400);
    assert.match(r.json().error, /trop claire/);
    r = await f.inject({ method: 'PUT', url: '/api/admin/branding', headers: { 'x-admin-token': ADMIN }, payload: { pdf_color: null } });
    assert.equal(r.json().pdf_color, null);
    assert.equal((await f.inject({ url: '/api/branding' })).json().pdf_color, null);
    await f.close();
  });
});

describe('types de matériel', () => {
  test('validation : espaces normalisés, vides ignorés, doublons, longueur, nombre', () => {
    assert.deepEqual(validateTypes(['  Portable ', 'Écran   tactile', '', 'Fixe']), ['Portable', 'Écran tactile', 'Fixe']);
    assert.deepEqual(validateTypes([]), []);
    assert.throws(() => validateTypes(['Portable', 'portable']), /en double/);
    assert.throws(() => validateTypes(['x'.repeat(41)]), /40 caractères/);
    assert.throws(() => validateTypes(Array.from({ length: 51 }, (_, i) => `T${i}`)), /50 types/);
    assert.throws(() => validateTypes('Portable'), MaterialTypesError);
  });

  test('GET public : liste de départ et usage tel qu\'en base (types hors liste compris)', async () => {
    const { f } = await app();
    const r = await f.inject({ url: '/api/material-types' });
    assert.equal(r.statusCode, 200);
    assert.deepEqual(r.json().types, DEFAULT_TYPES);
    assert.equal(r.json().par_defaut, true);
    assert.deepEqual(r.json().usage, USAGE);
    await f.close();
  });

  test('PUT admin : liste enregistrée, refus 400 lisible, 401 sans jeton', async () => {
    const { f, store } = await app();
    let r = await f.inject({ method: 'PUT', url: '/api/admin/material-types', headers: { 'x-admin-token': ADMIN }, payload: { types: ['Portable', 'Serveur'] } });
    assert.equal(r.statusCode, 200);
    assert.deepEqual(r.json().types, ['Portable', 'Serveur']);
    assert.equal(r.json().par_defaut, false);
    assert.equal(store.data.get(TYPES_KEY), '["Portable","Serveur"]');
    r = await f.inject({ method: 'PUT', url: '/api/admin/material-types', headers: { 'x-admin-token': ADMIN }, payload: { types: ['A', 'a'] } });
    assert.equal(r.statusCode, 400);
    r = await f.inject({ method: 'PUT', url: '/api/admin/material-types', payload: { types: ['A'] } });
    assert.equal(r.statusCode, 401);
    await f.close();
  });

  test('valeur stockée illisible : liste de départ, rien ne casse', async () => {
    const store = memoryStore();
    store.data.set(TYPES_KEY, '{pas du json');
    const { f } = await app(store);
    assert.deepEqual((await f.inject({ url: '/api/material-types' })).json().types, DEFAULT_TYPES);
    await f.close();
  });
});

describe('jeton à portée « atelier »', () => {
  test('ouvre seulement les trois routes de l\'atelier', async () => {
    assert.deepEqual([...ATELIER_ROUTES].sort(), ['DELETE /api/admin/branding/logo', 'PUT /api/admin/branding', 'PUT /api/admin/material-types']);
    const { f } = await app();
    const h = { authorization: `Bearer ${atelier()}` };
    assert.equal((await f.inject({ method: 'PUT', url: '/api/admin/branding', headers: h, payload: { company_name: 'Atelier' } })).statusCode, 200);
    assert.equal((await f.inject({ method: 'DELETE', url: '/api/admin/branding/logo', headers: h })).statusCode, 200);
    assert.equal((await f.inject({ method: 'PUT', url: '/api/admin/material-types', headers: h, payload: { types: ['Portable'] } })).statusCode, 200);
    for (const [method, url] of [['GET', '/api/admin/users'], ['DELETE', '/api/admin/users/3'], ['GET', '/api/monitoring/stats']] as const) {
      const r = await f.inject({ method, url, headers: h });
      assert.equal(r.statusCode, 403, `${method} ${url}`);
      assert.match(r.json().error, /réglages d'atelier/);
    }
    await f.close();
  });

  test('jeton complet et ADMIN_TOKEN gardent tous les droits ; jeton atelier expiré refusé', async () => {
    const { f } = await app();
    assert.equal((await f.inject({ url: '/api/admin/users', headers: { authorization: `Bearer ${complet()}` } })).statusCode, 200);
    assert.equal((await f.inject({ url: '/api/admin/users', headers: { 'x-admin-token': ADMIN } })).statusCode, 200);
    const expire = signAdminJwt({ id: 1, username: 'admin', admin: true, scope: 'atelier' }, -10);
    const r = await f.inject({ method: 'PUT', url: '/api/admin/material-types', headers: { authorization: `Bearer ${expire}` }, payload: { types: ['A'] } });
    assert.equal(r.statusCode, 401);
    await f.close();
  });

  test('le jeton atelier n\'ouvre pas l\'inscription fermée', async () => {
    const f = Fastify();
    let permis: boolean | null = null;
    f.post('/api/auth/register', async (request) => {
      permis = registrationAllowed(request, {});
      return { ok: true };
    });
    await f.ready();
    await f.inject({ method: 'POST', url: '/api/auth/register', headers: { authorization: `Bearer ${atelier()}` }, payload: {} });
    assert.equal(permis, false);
    await f.close();
  });
});
