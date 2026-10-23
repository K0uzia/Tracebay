import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  BRANDING_KEYS,
  BrandingError,
  BrandingStore,
  readBranding,
  validateLogo,
  validateName,
} from '../lib/branding';

type QueryFn = (sql: string, params?: any[]) => Promise<{ rows: any[] }>;

/** Stockage du réglage d'atelier dans la table app_settings (aucune migration : table existante). */
export function pgBrandingStore(query: QueryFn): BrandingStore {
  return {
    async get(keys) {
      const result = await query('SELECT key, value FROM app_settings WHERE key = ANY($1)', [keys]);
      return Object.fromEntries(result.rows.map((r: any) => [r.key, r.value]));
    },
    async set(key, value) {
      await query(
        'INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, now()) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()',
        [key, value]
      );
    },
    async remove(key) {
      await query('DELETE FROM app_settings WHERE key = $1', [key]);
    },
  };
}

/**
 * GET /api/branding : public (les postes en ont besoin pour imprimer).
 * PUT /api/admin/branding et DELETE /api/admin/branding/logo : protégés par le garde admin global.
 */
export async function registerBrandingRoutes(
  fastify: FastifyInstance,
  store: BrandingStore,
  nomImpose: () => Promise<string | null> = async () => null
): Promise<void> {
  // Avec une licence valide, le nom signé remplace celui du réglage (dissuade le prêt de clé).
  const lire = async () => {
    const branding = await readBranding(store);
    const impose = await nomImpose();
    return impose ? { ...branding, company_name: impose, nom_impose: true } : { ...branding, nom_impose: false };
  };

  fastify.get('/api/branding', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      return { success: true, ...(await lire()) };
    } catch (err: any) {
      fastify.log.error({ code: err?.code }, 'GET /api/branding');
      reply.statusCode = 500;
      return { error: "Réglage de l'atelier illisible." };
    }
  });

  fastify.put('/api/admin/branding', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = (request.body as any) || {};
    try {
      if (body.company_name === undefined && body.logo === undefined) {
        throw new BrandingError('Rien à enregistrer : company_name ou logo attendu.');
      }
      const name = body.company_name !== undefined ? validateName(body.company_name) : undefined;
      const logo = body.logo !== undefined && body.logo !== null ? validateLogo(body.logo) : undefined;
      if (name !== undefined) await store.set(BRANDING_KEYS.name, name);
      if (logo !== undefined) await store.set(BRANDING_KEYS.logo, logo);
      if (body.logo === null) await store.remove(BRANDING_KEYS.logo);
      return { success: true, ...(await lire()) };
    } catch (err: any) {
      if (err instanceof BrandingError) {
        reply.statusCode = 400;
        return { error: err.message };
      }
      fastify.log.error({ code: err?.code }, 'PUT /api/admin/branding');
      reply.statusCode = 500;
      return { error: 'Enregistrement impossible.' };
    }
  });

  fastify.delete('/api/admin/branding/logo', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      await store.remove(BRANDING_KEYS.logo);
      return { success: true, ...(await lire()) };
    } catch (err: any) {
      fastify.log.error({ code: err?.code }, 'DELETE /api/admin/branding/logo');
      reply.statusCode = 500;
      return { error: 'Suppression impossible.' };
    }
  });
}
