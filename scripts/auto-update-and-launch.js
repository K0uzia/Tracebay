#!/usr/bin/env node
/**
 * Lance le client après mise à jour automatique depuis origin/main.
 * Compare les fichiers du client (apps/client) avec origin/main ;
 * s'il y a des différences, fait un pull puis lance l'application.
 */
const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const REPO_ROOT = findRepoRoot(process.cwd());
const CLIENT_PATH = path.join(REPO_ROOT, 'apps', 'client');

function findRepoRoot(dir) {
  let current = path.resolve(dir);
  for (;;) {
    if (fs.existsSync(path.join(current, '.git'))) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return path.resolve(dir);
}

function run(cmd, options = {}) {
  const opts = { encoding: 'utf8', cwd: REPO_ROOT, ...options };
  try {
    return execSync(cmd, opts);
  } catch (e) {
    if (options.ignoreError) return null;
    throw e;
  }
}

function hasClientChanges() {
  try {
    run('git fetch origin main', { stdio: 'pipe', ignoreError: false });
  } catch (e) {
    console.warn('⚠️  git fetch a échoué (réseau ?), lancement sans mise à jour.');
    return false;
  }
  try {
    const out = run(
      'git diff --name-only HEAD origin/main -- apps/client/',
      { stdio: 'pipe' }
    );
    return (out && out.trim().length) > 0;
  } catch (_e) {
    return false;
  }
}

function pullMain() {
  console.log('📥 Mise à jour depuis origin/main...');
  run('git pull origin main', { stdio: 'inherit' });
  console.log('✅ Mise à jour terminée.');
}

function launchClient() {
  console.log('🚀 Lancement du client...');
  const child = spawn('npm', ['start'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    shell: true,
  });
  child.on('close', (code) => process.exit(code != null ? code : 0));
}

// ---
if (hasClientChanges()) {
  pullMain();
} else {
  console.log('✅ Aucune mise à jour nécessaire (client à jour avec main).');
}
launchClient();
