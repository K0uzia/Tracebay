import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import Fastify from 'fastify';
import { verifierLicence } from '../lib/licence';
import { CLE_PUBLIQUE_LICENCE } from '../lib/licence-cle-publique';
import {
  LICENCE_KEYS, LicenceError, LicenceService, LicenceStore,
  ecriturePermiseEnLectureSeule, registerLicenceGuard, registerLicenceRoutes,
} from '../api/licence';
import { registerRgpdRoutes } from '../api/rgpd';
import { registerBrandingRoutes } from '../api/branding';
import { registerAdminGuard } from '../middleware/admin-guard';

const ADMIN = 'e'.repeat(48);
const vecteurs = JSON.parse(fs.readFileSync(path.join(__dirname, 'licence-vecteurs.json'), 'utf8'));
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const PUB = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');

function cle(entreprise: string, emise: string, expire: string, id = 'test'): string {
  const json = JSON.stringify({ v: 1, id, entreprise, emise, expire });
  const sig = crypto.sign(null, Buffer.from(json, 'utf8'), privateKey);
  return `TB1.${Buffer.from(json, 'utf8').toString('base64url')}.${sig.toString('base64url')}`;
}

function memoire(donnees = false): LicenceStore & { data: Map<string, string>; donnees: boolean } {
  const data = new Map<string, string>();
  return {
    data,
    donnees,
    async get(keys) { return Object.fromEntries(keys.filter((k) => data.has(k)).map((k) => [k, data.get(k)!])); },
    async set(k, v) { data.set(k, v); },
    async hasData() { return this.donnees; },
  };
}

function service(store: LicenceStore, jour = '2026-11-01') {
  let j = jour;
  const s = new LicenceService(store, PUB, () => j);
  return { s, setJour: (x: string) => { j = x; s.invalider(); } };
}

before(() => {
  Object.assign(process.env, { JWT_SECRET: 'a'.repeat(64), ADMIN_TOKEN: ADMIN, DB_PASSWORD: 'c'.repeat(48) });
});

describe('vecteurs communs client et serveur', () => {
  for (const v of vecteurs.vecteurs) {
    test(v.nom, () => {
      const r = verifierLicence({ cle: v.cle, clePublique: vecteurs.clePubliqueTest, aujourdhui: v.aujourdhui, derniereDateVue: v.derniereDateVue || null });
      for (const [k, attendu] of Object.entries(v.attendu)) assert.equal((r as any)[k], attendu, `${v.nom} : ${k}`);
    });
  }

  test('clé publique de production : Ed25519, 44 octets', () => {
    const k = crypto.createPublicKey({ key: Buffer.from(CLE_PUBLIQUE_LICENCE, 'base64'), format: 'der', type: 'spki' });
    assert.equal(k.asymmetricKeyType, 'ed25519');
    assert.equal(Buffer.from(CLE_PUBLIQUE_LICENCE, 'base64').length, 44);
  });
});

describe('service de licence', () => {
  test('installation existante sans licence : exemptée, écriture sans limite', async () => {
    const store = memoire(true);
    const { s, setJour } = service(store);
    await s.init();
    assert.equal(store.data.get(LICENCE_KEYS.exemption), 'oui');
    assert.deepEqual(await s.etat().then((e) => [e.etat, e.ecriture, e.nomImpose]), ['non_activee', true, null]);
    setJour('2036-01-01');
    assert.equal((await s.etat()).ecriture, true);
  });

  test('installation neuve : lecture seule jusqu\'à l\'activation, exemption figée', async () => {
    const store = memoire(false);
    const { s } = service(store);
    await s.init();
    assert.deepEqual(await s.etat().then((e) => [e.etat, e.ecriture]), ['absente', false]);
    store.donnees = true;
    await s.init();
    s.invalider();
    assert.equal((await s.etat()).etat, 'absente');
  });

  test('saisie d\'une clé : règles normales, nom imposé, fin de l\'exemption', async () => {
    const store = memoire(true);
    const { s, setJour } = service(store);
    await s.init();
    const e = await s.enregistrer(cle('Atelier Nord', '2026-10-22', '2026-12-31'));
    assert.deepEqual([e.etat, e.ecriture, e.nomImpose], ['active', true, 'Atelier Nord']);
    setJour('2027-01-05');
    assert.deepEqual(await s.etat().then((x) => [x.etat, x.ecriture, x.nomImpose, x.finGrace]), ['grace', true, null, '2027-01-15']);
    setJour('2027-01-16');
    assert.deepEqual(await s.etat().then((x) => [x.etat, x.ecriture]), ['expiree', false]);
  });

  test('clé refusée à la saisie : motif lisible, rien d\'enregistré', async () => {
    const store = memoire(true);
    const { s } = service(store);
    await s.init();
    await assert.rejects(s.enregistrer('TB1.abc.def'), (err: any) => err instanceof LicenceError && err.raison === 'format');
    const autre = crypto.generateKeyPairSync('ed25519');
    const json = JSON.stringify({ v: 1, id: 'x', entreprise: 'Pirate', emise: '2026-10-01', expire: '2027-10-01' });
    const fausse = `TB1.${Buffer.from(json).toString('base64url')}.${crypto.sign(null, Buffer.from(json), autre.privateKey).toString('base64url')}`;
    await assert.rejects(s.enregistrer(fausse), (err: any) => err.raison === 'signature');
    await assert.rejects(s.enregistrer(cle('Atelier', '2025-01-01', '2026-01-01')), (err: any) => err.raison === 'expiree' && /01\/01\/2026/.test(err.message));
    assert.equal(store.data.has(LICENCE_KEYS.cle), false);
  });

  test('horloge reculée : lecture seule, dernière date jamais reculée', async () => {
    const store = memoire(true);
    const { s, setJour } = service(store, '2026-11-10');
    await s.init();
    await s.enregistrer(cle('Atelier', '2026-10-01', '2027-10-01'));
    assert.equal(store.data.get(LICENCE_KEYS.derniereDateVue), '2026-11-10');
    setJour('2026-11-03');
    assert.deepEqual(await s.etat().then((e) => [e.etat, e.ecriture]), ['horloge', false]);
    assert.equal(store.data.get(LICENCE_KEYS.derniereDateVue), '2026-11-10');
    setJour('2026-11-12');
    assert.equal((await s.etat()).etat, 'active');
    assert.equal(store.data.get(LICENCE_KEYS.derniereDateVue), '2026-11-12');
  });
});

describe('lecture seule', () => {
  test('liste des écritures permises', () => {
    assert.equal(ecriturePermiseEnLectureSeule('DELETE', '/api/dons/:id', undefined), true);
    assert.equal(ecriturePermiseEnLectureSeule('DELETE', '/api/prets-materiel/:id', undefined), true);
    assert.equal(ecriturePermiseEnLectureSeule('DELETE', '/api/agenda/events/:id', undefined), true);
    assert.equal(ecriturePermiseEnLectureSeule('DELETE', '/api/admin/users/:id', undefined), true);
    assert.equal(ecriturePermiseEnLectureSeule('POST', '/api/lots/technicians/anonymize', { name: 'X' }), true);
    assert.equal(ecriturePermiseEnLectureSeule('PUT', '/api/admin/licence', {}), true);
    assert.equal(ecriturePermiseEnLectureSeule('PUT', '/api/dons/:id', { pdf_path: '/x.pdf' }), true);
    assert.equal(ecriturePermiseEnLectureSeule('PUT', '/api/dons/:id', { pdf_path: '/x.pdf', lot_name: 'Y' }), false);
    assert.equal(ecriturePermiseEnLectureSeule('PUT', '/api/dons/:id', {}), false);
    assert.equal(ecriturePermiseEnLectureSeule('POST', '/api/lots', {}), false);
    assert.equal(ecriturePermiseEnLectureSeule('DELETE', '/api/lots/:id', undefined), false);
  });

  async function appli(store: LicenceStore) {
    const { s } = service(store);
    await s.init();
    const f = Fastify();
    registerAdminGuard(f);
    registerLicenceGuard(f, s);
    f.post('/api/lots', async () => ({ ok: true }));
    f.get('/api/lots', async () => ({ ok: true }));
    f.delete('/api/dons/:id', async () => ({ ok: true }));
    f.put('/api/dons/:id', async () => ({ ok: true }));
    await registerLicenceRoutes(f, s);
    await f.ready();
    return { f, s };
  }

  test('sans licence : écriture refusée (423), lecture, effacement et pdf_path permis', async () => {
    const { f } = await appli(memoire(false));
    const refus = await f.inject({ method: 'POST', url: '/api/lots', payload: {} });
    assert.equal(refus.statusCode, 423);
    assert.equal(refus.json().code, 'licence_lecture_seule');
    assert.match(refus.json().error, /lecture seule/);
    assert.equal((await f.inject({ method: 'GET', url: '/api/lots' })).statusCode, 200);
    assert.equal((await f.inject({ method: 'DELETE', url: '/api/dons/4' })).statusCode, 200);
    assert.equal((await f.inject({ method: 'PUT', url: '/api/dons/4', payload: { pdf_path: '/a.pdf' } })).statusCode, 200);
    assert.equal((await f.inject({ method: 'PUT', url: '/api/dons/4', payload: { pdf_path: '/a.pdf', lot_name: 'x' } })).statusCode, 423);
    await f.close();
  });

  test('activation par l\'admin seulement, puis écriture rétablie', async () => {
    const { f } = await appli(memoire(false));
    const valide = cle('Atelier Nord', '2026-10-01', '2027-10-01');
    assert.equal((await f.inject({ method: 'PUT', url: '/api/admin/licence', payload: { cle: valide } })).statusCode, 401);
    const mauvaise = await f.inject({ method: 'PUT', url: '/api/admin/licence', headers: { 'x-admin-token': ADMIN }, payload: { cle: 'TB1.x.y' } });
    assert.equal(mauvaise.statusCode, 400);
    assert.equal(mauvaise.json().raison, 'format');
    const ok = await f.inject({ method: 'PUT', url: '/api/admin/licence', headers: { 'x-admin-token': ADMIN }, payload: { cle: valide } });
    assert.equal(ok.statusCode, 200);
    assert.equal(ok.json().entreprise, 'Atelier Nord');
    const lu = (await f.inject({ method: 'GET', url: '/api/licence' })).json();
    assert.deepEqual([lu.etat, lu.ecriture, lu.entreprise, lu.cle], ['active', true, 'Atelier Nord', valide]);
    assert.equal((await f.inject({ method: 'POST', url: '/api/lots', payload: {} })).statusCode, 200);
    await f.close();
  });
});

describe('nom imposé et effacement', () => {
  test('réglage d\'atelier : le nom signé remplace celui du réglage', async () => {
    const data = new Map<string, string>([['branding.company_name', 'Ancien nom']]);
    const store = {
      async get(keys: string[]) { return Object.fromEntries(keys.filter((k) => data.has(k)).map((k) => [k, data.get(k)!])); },
      async set(k: string, v: string) { data.set(k, v); },
      async remove(k: string) { data.delete(k); },
    };
    const f = Fastify();
    await registerBrandingRoutes(f, store, async () => 'Atelier Nord');
    const r = (await f.inject({ method: 'GET', url: '/api/branding' })).json();
    assert.deepEqual([r.company_name, r.nom_impose], ['Atelier Nord', true]);
    await f.close();
  });

  test('anonymisation d\'un technicien : égalité exacte, ce seul champ', async () => {
    const appels: any[] = [];
    const f = Fastify();
    await registerRgpdRoutes(f, async (sql, params) => { appels.push([sql, params]); return { rows: [], rowCount: 3 }; });
    const ok = await f.inject({ method: 'POST', url: '/api/lots/technicians/anonymize', payload: { name: 'Jean Dupont' } });
    assert.deepEqual(ok.json(), { success: true, anonymises: 3 });
    assert.match(appels[0][0], /^UPDATE lot_items SET technician = NULL, updated_at = NOW\(\) WHERE technician = \$1$/);
    assert.deepEqual(appels[0][1], ['Jean Dupont']);
    assert.equal((await f.inject({ method: 'POST', url: '/api/lots/technicians/anonymize', payload: { name: '  ' } })).statusCode, 400);
    await f.close();
  });
});
