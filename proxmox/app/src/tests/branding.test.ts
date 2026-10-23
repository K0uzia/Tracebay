import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { BrandingStore, LOGO_MAX_BYTES, validateLogo, validateName, BrandingError } from '../lib/branding';
import { registerBrandingRoutes } from '../api/branding';
import { registerAdminGuard } from '../middleware/admin-guard';

const ADMIN = 'd'.repeat(48);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const dataUrl = (mime: string, b: Buffer) => `data:${mime};base64,${b.toString('base64')}`;

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

async function app(store = memoryStore()) {
  const f = Fastify();
  registerAdminGuard(f);
  await registerBrandingRoutes(f, store);
  await f.ready();
  return { f, store };
}

describe('validation du logo', () => {
  test('PNG, JPEG et WebP acceptés, type déduit des octets', () => {
    assert.match(validateLogo(dataUrl('image/png', PNG)), /^data:image\/png;base64,/);
    assert.match(validateLogo(dataUrl('image/jpeg', JPEG)), /^data:image\/jpeg;base64,/);
    assert.match(validateLogo(dataUrl('image/webp', WEBP)), /^data:image\/webp;base64,/);
    assert.match(validateLogo(dataUrl('image/png', JPEG)), /^data:image\/jpeg;base64,/);
  });

  test('SVG, contenu déguisé, trop lourd ou mal formé refusés', () => {
    assert.throws(() => validateLogo(dataUrl('image/svg+xml', SVG)), BrandingError);
    assert.throws(() => validateLogo(dataUrl('image/png', SVG)), /PNG, JPEG ou WebP/);
    const big = Buffer.concat([PNG, Buffer.alloc(LOGO_MAX_BYTES)]);
    assert.throws(() => validateLogo(dataUrl('image/png', big)), /512 Ko/);
    assert.throws(() => validateLogo('javascript:alert(1)'), BrandingError);
    assert.throws(() => validateLogo(''), BrandingError);
  });

  test('nom obligatoire, borné, caractères de contrôle retirés', () => {
    assert.equal(validateName('  Atelier\u0007 Test  '), 'Atelier Test');
    assert.throws(() => validateName('   '), /obligatoire/);
    assert.throws(() => validateName('x'.repeat(121)), /120/);
  });
});

describe('routes', () => {
  test('GET public : nom par défaut « Tracebay », sans logo', async () => {
    const { f } = await app();
    const res = await f.inject({ method: 'GET', url: '/api/branding' });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json(), { success: true, company_name: 'Tracebay', logo: null });
    await f.close();
  });

  test('PUT et DELETE exigent le jeton admin', async () => {
    const { f, store } = await app();
    const put = await f.inject({ method: 'PUT', url: '/api/admin/branding', payload: { company_name: 'Pirate' } });
    assert.equal(put.statusCode, 401);
    const del = await f.inject({ method: 'DELETE', url: '/api/admin/branding/logo' });
    assert.equal(del.statusCode, 401);
    assert.equal(store.data.size, 0);
    await f.close();
  });

  test('l\'admin enregistre nom et logo, puis retire le logo', async () => {
    const { f } = await app();
    const headers = { 'x-admin-token': ADMIN };
    const put = await f.inject({ method: 'PUT', url: '/api/admin/branding', headers, payload: { company_name: 'LA CAPSULE', logo: dataUrl('image/png', PNG) } });
    assert.equal(put.statusCode, 200);
    assert.equal(put.json().company_name, 'LA CAPSULE');
    const read = (await f.inject({ method: 'GET', url: '/api/branding' })).json();
    assert.match(read.logo, /^data:image\/png;base64,/);
    const del = await f.inject({ method: 'DELETE', url: '/api/admin/branding/logo', headers });
    assert.equal(del.json().logo, null);
    assert.equal(del.json().company_name, 'LA CAPSULE');
    await f.close();
  });

  test('logo refusé : 400 avec message lisible, rien d\'enregistré', async () => {
    const { f, store } = await app();
    const res = await f.inject({ method: 'PUT', url: '/api/admin/branding', headers: { 'x-admin-token': ADMIN }, payload: { company_name: 'X', logo: dataUrl('image/svg+xml', SVG) } });
    assert.equal(res.statusCode, 400);
    assert.match(res.json().error, /PNG, JPEG ou WebP/);
    assert.equal(store.data.size, 0);
    await f.close();
  });
});
