import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { BrandingStore } from '../lib/branding';
import { CODE_KEY, JOURNAL_KEY, PARAMS_SCRYPT, empreinteCode, validerCode, verifierCode } from '../lib/code-poste';
import { registerCodePosteRoutes } from '../api/code-poste';
import { isAdminProtected, registerAdminGuard } from '../middleware/admin-guard';

const ADMIN = 'd'.repeat(48);
const CODE = 'Capsule-Huelgoat-29';

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
  await registerCodePosteRoutes(f, store);
  await f.ready();
  return { f, store };
}

describe('code administrateur des postes : robustesse', () => {
  test('12 caractères au moins', () => {
    assert.equal(validerCode('Court-29').ok, false);
    assert.match(validerCode('Court-29').raison!, /12 caractères/);
    assert.equal(validerCode(CODE).ok, true);
  });

  test('répétitions, suites et mots de passe courants refusés', () => {
    for (const code of ['aaaaaaaaaaaaaa', 'abcabcabcabcabc', '121212121212', 'abcdefghijklm', '123456789012',
      'azertyuiopqsd', 'qwertyuiopasd', 'motdepasse1234', 'Password1234!', 'tracebay12345', 'admin1234567']) {
      assert.equal(validerCode(code).ok, false, code);
    }
  });

  test('pas de chaîne, ou trop long : refusé', () => {
    assert.equal(validerCode(undefined).ok, false);
    assert.equal(validerCode(42 as unknown).ok, false);
    assert.equal(validerCode('x'.repeat(30) + 'Y'.repeat(100)).ok, false);
  });
});

describe('code administrateur des postes : empreinte scrypt', () => {
  test('paramètres forts, sel aléatoire, le code n\'apparaît pas', async () => {
    const a = await empreinteCode(CODE);
    const b = await empreinteCode(CODE);
    assert.equal(a.algo, 'scrypt');
    assert.ok(a.N >= 32768);
    assert.deepEqual({ N: a.N, r: a.r, p: a.p }, PARAMS_SCRYPT);
    assert.equal(Buffer.from(a.sel, 'base64').length, 16);
    assert.notEqual(a.sel, b.sel);
    assert.notEqual(a.empreinte, b.empreinte);
    assert.equal(JSON.stringify(a).includes(CODE), false);
  });

  test('vérification : bon code accepté, autre code refusé', async () => {
    const e = await empreinteCode(CODE);
    assert.equal(await verifierCode(CODE, e), true);
    assert.equal(await verifierCode('Capsule-Huelgoat-30', e), false);
  });
});

describe('routes', () => {
  test('GET /api/poste/verrou : null tant qu\'aucun code n\'est défini', async () => {
    const { f } = await app();
    const r = await f.inject({ url: '/api/poste/verrou' });
    assert.equal(r.statusCode, 200);
    assert.deepEqual(r.json(), { success: true, verrou: null });
    await f.close();
  });

  test('PUT /api/admin/poste/code : réservé à l\'admin, puis empreinte publiée sans le code', async () => {
    const { f, store } = await app();
    const payload = { code: CODE, confirmation: CODE };
    assert.equal((await f.inject({ method: 'PUT', url: '/api/admin/poste/code', payload })).statusCode, 401);
    const ok = await f.inject({ method: 'PUT', url: '/api/admin/poste/code', payload, headers: { 'x-admin-token': ADMIN } });
    assert.equal(ok.statusCode, 200);
    assert.equal([...store.data.values()].some((v) => v.includes(CODE)), false);
    const verrou = (await f.inject({ url: '/api/poste/verrou' })).json().verrou;
    assert.equal(verrou.algo, 'scrypt');
    assert.equal(await verifierCode(CODE, verrou), true);
    assert.equal(JSON.stringify(verrou).includes(CODE), false);
    assert.ok(store.data.has(CODE_KEY));
    await f.close();
  });

  test('PUT : code faible ou confirmation différente refusés en 400, message lisible', async () => {
    const { f } = await app();
    const h = { 'x-admin-token': ADMIN };
    const faible = await f.inject({ method: 'PUT', url: '/api/admin/poste/code', headers: h, payload: { code: 'motdepasse1234', confirmation: 'motdepasse1234' } });
    assert.equal(faible.statusCode, 400);
    assert.match(faible.json().error, /trop simple|courant/);
    const diff = await f.inject({ method: 'PUT', url: '/api/admin/poste/code', headers: h, payload: { code: CODE, confirmation: CODE + 'x' } });
    assert.equal(diff.statusCode, 400);
    assert.match(diff.json().error, /confirmation/);
    await f.close();
  });

  test('journal : un poste signale un changement d\'adresse, l\'admin le lit, 200 entrées au plus', async () => {
    const { f, store } = await app();
    const entree = { ancienne: 'http://192.0.2.10:4000', nouvelle: 'http://192.0.2.11:4000', date: '2026-10-27T15:00:00.000Z', poste: 'poste-1' };
    const r = await f.inject({ method: 'POST', url: '/api/poste/journal', payload: { entrees: [entree] } });
    assert.equal(r.statusCode, 200);
    assert.equal((await f.inject({ url: '/api/admin/poste/journal' })).statusCode, 401);
    const lu = await f.inject({ url: '/api/admin/poste/journal', headers: { 'x-admin-token': ADMIN } });
    assert.equal(lu.json().entrees[0].nouvelle, entree.nouvelle);
    assert.ok(lu.json().entrees[0].recu);
    const beaucoup = Array.from({ length: 250 }, (_, i) => ({ ...entree, poste: `p${i}` }));
    for (let i = 0; i < 250; i += 50) {
      await f.inject({ method: 'POST', url: '/api/poste/journal', payload: { entrees: beaucoup.slice(i, i + 50) } });
    }
    assert.equal(JSON.parse(store.data.get(JOURNAL_KEY)!).length, 200);
    await f.close();
  });

  test('journal : entrée invalide ou lot trop grand refusés', async () => {
    const { f } = await app();
    assert.equal((await f.inject({ method: 'POST', url: '/api/poste/journal', payload: { entrees: 'x' } })).statusCode, 400);
    const trop = Array.from({ length: 51 }, () => ({ ancienne: 'a', nouvelle: 'b', date: 'c', poste: 'd' }));
    assert.equal((await f.inject({ method: 'POST', url: '/api/poste/journal', payload: { entrees: trop } })).statusCode, 400);
    const long = [{ ancienne: 'a'.repeat(300), nouvelle: 'b', date: 'c', poste: 'd' }];
    assert.equal((await f.inject({ method: 'POST', url: '/api/poste/journal', payload: { entrees: long } })).statusCode, 400);
    await f.close();
  });

  test('garde : écriture du code et lecture du journal sous /api/admin', () => {
    assert.equal(isAdminProtected('PUT', '/api/admin/poste/code'), true);
    assert.equal(isAdminProtected('GET', '/api/admin/poste/journal'), true);
    assert.equal(isAdminProtected('GET', '/api/poste/verrou'), false);
    assert.equal(isAdminProtected('POST', '/api/poste/journal'), false);
  });
});
