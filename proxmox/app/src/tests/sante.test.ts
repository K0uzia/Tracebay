import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { corpsSante, versionServeur } from '../lib/sante';

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'));

describe('/api/health', () => {
  test('tracebay_version : la version du serveur, lue dans package.json', () => {
    assert.equal(versionServeur(), pkg.version);
    assert.match(pkg.version, /^3\.\d+\.\d+$/);
  });

  test('corps de la réponse : tracebay_version, plus de champ « version » figé', () => {
    const corps = corpsSante({ environment: 'production', cache: { size: 1, maxSize: 10 } });
    assert.equal(corps.status, 'ok');
    assert.equal(corps.tracebay_version, pkg.version);
    assert.equal(corps.environment, 'production');
    assert.deepEqual(corps.cache, { size: 1, maxSize: 10 });
    assert.equal('version' in corps, false);
  });
});
