import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { BrandingStore } from '../lib/branding';
import { MaterialTypesError, readTypes, TYPES_KEY, validateTypes } from '../lib/material-types';

type QueryFn = (sql: string, params?: any[]) => Promise<{ rows: any[] }>;

/** Nombre de machines (lignes de lot non supprimées) par valeur de type enregistrée, telle quelle. */
async function usage(query: QueryFn): Promise<{ type: string; count: number }[]> {
  const result = await query(
    `SELECT type, count(*)::int AS count FROM lot_items
     WHERE deleted_at IS NULL AND type IS NOT NULL AND btrim(type) <> ''
     GROUP BY type ORDER BY type`
  );
  return result.rows.map((r: any) => ({ type: String(r.type), count: Number(r.count) }));
}

/**
 * GET /api/material-types : public, comme /api/branding (listes des formulaires de tous les postes).
 * Renvoie aussi l'usage par valeur : un poste peut signaler les types retirés encore utilisés.
 * PUT /api/admin/material-types : garde admin (ADMIN_TOKEN, JWT admin ou jeton « atelier »).
 */
export async function registerMaterialTypesRoutes(fastify: FastifyInstance, store: BrandingStore, query: QueryFn): Promise<void> {
  const lire = async () => {
    const { types, parDefaut } = await readTypes(store);
    return { success: true, types, par_defaut: parDefaut, usage: await usage(query) };
  };

  fastify.get('/api/material-types', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      return await lire();
    } catch (err: any) {
      fastify.log.error({ code: err?.code }, 'GET /api/material-types');
      reply.statusCode = 500;
      return { error: 'Types de matériel illisibles.' };
    }
  });

  fastify.put('/api/admin/material-types', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const types = validateTypes(((request.body as any) || {}).types);
      await store.set(TYPES_KEY, JSON.stringify(types));
      return await lire();
    } catch (err: any) {
      if (err instanceof MaterialTypesError) {
        reply.statusCode = 400;
        return { error: err.message };
      }
      fastify.log.error({ code: err?.code }, 'PUT /api/admin/material-types');
      reply.statusCode = 500;
      return { error: 'Enregistrement impossible.' };
    }
  });
}
