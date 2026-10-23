/**
 * Secrets du serveur : aucune valeur par défaut. Le serveur refuse de démarrer si l'un
 * d'eux manque, est trop court ou vaut une valeur publiée (anciens défauts du dépôt public).
 */

import { createHash } from 'crypto';

export type SecretName = 'JWT_SECRET' | 'ADMIN_TOKEN' | 'DB_PASSWORD';

const MIN_LENGTH: Record<SecretName, number> = {
  JWT_SECRET: 32,
  ADMIN_TOKEN: 32,
  DB_PASSWORD: 16,
};

// Empreintes SHA-256 (valeur en minuscules) des anciens défauts publiés et de mots trop courants :
// la liste refuse ces valeurs sans les republier en clair.
const KNOWN_VALUE_SHA256 = new Set([
  '057ba03d6c44104863dc7361fe4578965d1887360f90a0895882e58a6248fc86',
  'e2186dbdb1bb4193608605e84f33208765b5693b55edd4f730a719a100eeea6f',
  '92809ab604c9377285fbbcf82c4f30db65f107ecfd7217c7e62c17a2b3be7633',
  '2cf82d6772e3014af9d2e3b0763c3ffee59e1f4df88ab1eda72ba8b81666c06e',
  '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9',
  '0537dfd229ccd644e29c82f0c27a1b3b075a1589fa75a186ed40abc25bfcd248',
  '19e0c9cda72695f03a7560f35476f610057b88398b7fb9331db056971a29536b',
  'fee39c23856e3d9dd500861a30903548b8878994291b2fef7fff2f53b3073c0c',
  '2bb80d537b1da3e38bd30361aa855686bde0eacd7162fef6a25fe97bf527a25b',
  '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8',
  '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918',
  '21a3230e03772a58aff1b3709a9e232850916337e1fba95c434076b6668c6e08',
]);

// Replis de l'ancien generate_env quand openssl manquait : prévisibles.
const KNOWN_PREFIXES = ['change-me-', 'admin-'];

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function findSecretProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  const problems: string[] = [];
  for (const name of Object.keys(MIN_LENGTH) as SecretName[]) {
    const value = String(env[name] ?? '').trim();
    if (!value) {
      problems.push(`${name} est absent.`);
    } else if (KNOWN_VALUE_SHA256.has(sha256(value.toLowerCase())) || KNOWN_PREFIXES.some((p) => value.toLowerCase().startsWith(p))) {
      problems.push(`${name} vaut une valeur par défaut connue (publiée dans le dépôt).`);
    } else if (value.length < MIN_LENGTH[name]) {
      problems.push(`${name} est trop court (${value.length} caractères, minimum ${MIN_LENGTH[name]}).`);
    }
  }
  return problems;
}

export function secretsErrorMessage(problems: string[]): string {
  return [
    'Démarrage refusé : secrets du serveur absents ou faibles.',
    ...problems.map((p) => `  - ${p}`),
    'Que faire : sur le serveur, lancer « sudo bash proxmox/scripts/proxmox.sh rotate-secrets »,',
    'qui génère de nouveaux secrets dans proxmox/docker/.env, change le mot de passe PostgreSQL',
    'et redémarre les conteneurs. Valeur manuelle possible : openssl rand -hex 32.',
  ].join('\n');
}

/** À appeler une fois, avant toute connexion ou route. */
export function assertSecretsOrExit(env: NodeJS.ProcessEnv = process.env): void {
  const problems = findSecretProblems(env);
  if (problems.length > 0) {
    console.error(secretsErrorMessage(problems));
    process.exit(1);
  }
}

/** Valeur d'un secret déjà validé au démarrage par assertSecretsOrExit. */
export function getSecret(name: SecretName): string {
  return String(process.env[name] ?? '').trim();
}
