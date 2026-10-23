import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Instrumentation de débogage laissée par un outil : envoyait chemins et contenus vers un port local
// (y compris depuis le navigateur de l'administrateur, via la page de monitoring). Ne doit pas revenir.
const INTERDIT = /https?:\/\/(127\.0\.0\.1|localhost):\d+\/ingest\//;

function fichiers(dossier: string): string[] {
  return fs.readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dossier, e.name);
    if (e.isDirectory()) return e.name === 'tests' ? [] : fichiers(p);
    return /\.(ts|js|html)$/.test(e.name) ? [p] : [];
  });
}

test('aucun appel de débogage vers un collecteur local (/ingest/)', () => {
  const src = path.join(__dirname, '..');
  const coupables = fichiers(src).filter((f) => INTERDIT.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(coupables.map((f) => path.relative(src, f)), []);
});
