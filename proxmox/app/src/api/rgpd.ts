import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

type QueryFn = (sql: string, params?: any[]) => Promise<{ rows: any[]; rowCount?: number | null }>;

/**
 * Effacement de données personnelles (droit à l'effacement), ouvert même en lecture seule.
 * Liste commune avec la version portable : docs/LICENCE.md.
 */
export async function registerRgpdRoutes(fastify: FastifyInstance, query: QueryFn): Promise<void> {
  // Noms de techniciens enregistrés sur le matériel (éléments supprimés compris), pour l'effacement RGPD.
  fastify.get('/api/lots/technicians', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const result = await query(
        `SELECT technician AS name, COUNT(*)::int AS count FROM lot_items
         WHERE technician IS NOT NULL AND technician <> '' GROUP BY technician ORDER BY technician`
      );
      return { success: true, technicians: result.rows };
    } catch (err: any) {
      fastify.log.error({ code: err?.code }, 'GET /api/lots/technicians');
      reply.statusCode = 500;
      return { error: 'Liste des techniciens illisible.' };
    }
  });

  // Retire un nom de technicien de tout le matériel : seulement ce champ, seulement en cas d'égalité exacte.
  fastify.post('/api/lots/technicians/anonymize', async (request: FastifyRequest, reply: FastifyReply) => {
    const name = (request.body as any)?.name;
    if (typeof name !== 'string' || !name.trim() || name.length > 255) {
      reply.statusCode = 400;
      return { error: 'Nom du technicien attendu (255 caractères au plus).' };
    }
    try {
      const result = await query('UPDATE lot_items SET technician = NULL, updated_at = NOW() WHERE technician = $1', [name]);
      return { success: true, anonymises: result.rowCount ?? 0 };
    } catch (err: any) {
      fastify.log.error({ code: err?.code }, 'POST /api/lots/technicians/anonymize');
      reply.statusCode = 500;
      return { error: 'Anonymisation impossible.' };
    }
  });

  // Remontée d'erreur d'un poste (peut contenir un message libre) : protégée par le garde admin.
  fastify.delete('/api/admin/monitoring/errors/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    if (!/^\d+$/.test(String(id))) {
      reply.statusCode = 400;
      return { error: 'Identifiant invalide' };
    }
    try {
      const result = await query('DELETE FROM client_errors WHERE id = $1', [id]);
      if (!result.rowCount) {
        reply.statusCode = 404;
        return { error: 'Remontée introuvable' };
      }
      return { success: true };
    } catch (err: any) {
      fastify.log.error({ code: err?.code }, 'DELETE /api/admin/monitoring/errors/:id');
      reply.statusCode = 500;
      return { error: 'Suppression impossible.' };
    }
  });
}
