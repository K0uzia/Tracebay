/**
 * Secrets du serveur : aucune valeur par défaut. Le serveur refuse de démarrer si l'un
 * d'eux manque, est trop court ou vaut une valeur publiée (anciens défauts du dépôt public).
 */

export type SecretName = 'JWT_SECRET' | 'ADMIN_TOKEN' | 'DB_PASSWORD';

const MIN_LENGTH: Record<SecretName, number> = {
  JWT_SECRET: 32,
  ADMIN_TOKEN: 32,
  DB_PASSWORD: 16,
};

// Valeurs déjà publiées dans le dépôt ou ses anciennes versions : jamais acceptées.
const KNOWN_VALUES = new Set([
  'changeme',
  'change-me',
  'SECRET_RETIRE',
  'SECRET_RETIRE',
  'SECRET_RETIRE',
  'SECRET_RETIRE',
  'SECRET_RETIRE',
  'SECRET_RETIRE',
  'secret',
  'password',
  'admin',
  'workspace',
]);

// Replis de l'ancien generate_env quand openssl manquait : prévisibles.
const KNOWN_PREFIXES = ['change-me-', 'admin-'];

export function findSecretProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  const problems: string[] = [];
  for (const name of Object.keys(MIN_LENGTH) as SecretName[]) {
    const value = String(env[name] ?? '').trim();
    if (!value) {
      problems.push(`${name} est absent.`);
    } else if (KNOWN_VALUES.has(value.toLowerCase()) || KNOWN_PREFIXES.some((p) => value.toLowerCase().startsWith(p))) {
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
