import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { adminScope, hasAdminCredentials } from '../lib/admin-auth';

// Routes admin et monitoring restées publiques : connexion admin, configuration lue par le
// client Electron (FolderManager), remontée d'erreurs du client.
const PUBLIC_ROUTES = new Set([
  'POST /api/admin/auth/login',
  'GET /api/admin/config/folders',
  'GET /api/admin/config/apps',
  'POST /api/monitoring/errors',
]);

/** routeUrl : motif de la route trouvée (ex. /api/admin/lots/:id), jamais l'URL brute. */
export function isAdminProtected(method: string, routeUrl: string | undefined): boolean {
  if (!routeUrl || method === 'OPTIONS') return false;
  if (PUBLIC_ROUTES.has(`${method === 'HEAD' ? 'GET' : method} ${routeUrl}`)) return false;
  return (
    routeUrl === '/api/admin' ||
    routeUrl.startsWith('/api/admin/') ||
    routeUrl === '/api/monitoring' ||
    routeUrl.startsWith('/api/monitoring/') ||
    routeUrl === '/api/metrics'
  );
}

/** Exige ADMIN_TOKEN ou un JWT admin sur /api/admin/*, /api/monitoring/* et /api/metrics. */
export function registerAdminGuard(fastify: FastifyInstance): void {
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const routeUrl = (request as any).routeOptions?.url ?? (request as any).routerPath;
    if (!isAdminProtected(request.method, routeUrl)) return;
    if (hasAdminCredentials(request)) return;
    if (adminScope(request) === 'atelier') {
      return reply.code(403).send({ error: "Jeton limité aux réglages d'atelier (nom, logo, couleur, types)." });
    }
    return reply.code(401).send({ error: 'Non autorisé : jeton administrateur requis.' });
  });
}

/** Inscription : fermée par défaut, ouverte avec ALLOW_REGISTRATION=true, toujours permise à l'admin. */
export function registrationAllowed(request: FastifyRequest, env: NodeJS.ProcessEnv = process.env): boolean {
  if (String(env.ALLOW_REGISTRATION || '').trim().toLowerCase() === 'true') return true;
  return hasAdminCredentials(request);
}
