import * as fs from 'fs';
import * as path from 'path';

let version: string | undefined;

function lireVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'));
    return typeof pkg.version === 'string' ? pkg.version : 'inconnue';
  } catch {
    return 'inconnue';
  }
}

/** Version du serveur Tracebay, lue une fois dans package.json (src/lib ou dist/lib : ../../). */
export function versionServeur(): string {
  if (version === undefined) version = lireVersion();
  return version;
}

/** Corps de GET /api/health : tracebay_version permet au poste de dire si le serveur est trop ancien. */
export function corpsSante({ environment, cache }: { environment: string; cache: { size: number; maxSize: number } }) {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment,
    tracebay_version: versionServeur(),
    cache: { size: cache.size, maxSize: cache.maxSize },
    memory: {
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
    },
  };
}
