#!/usr/bin/env node
/**
 * Charge les variables du fichier .env à la racine du workspace,
 * puis exécute la commande passée en arguments.
 * Utilisé pour que GH_TOKEN / GITHUB_TOKEN soit disponible lors du build avec publication.
 */
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
require('dotenv').config({ path: path.join(rootDir, '.env') });

// electron-builder utilise GH_TOKEN en priorité ; on aligne si seul GITHUB_TOKEN est défini
if (process.env.GITHUB_TOKEN && !process.env.GH_TOKEN) {
  process.env.GH_TOKEN = process.env.GITHUB_TOKEN;
}

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error('Usage: node scripts/run-with-env.js <command> [args...]');
  process.exit(1);
}

const result = spawnSync(cmd, args, {
  stdio: 'inherit',
  env: process.env,
  shell: true,
  cwd: rootDir,
});
process.exit(result.status ?? 1);
