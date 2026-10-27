import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { BrandingStore } from '../lib/branding';
import { CODE_KEY, JOURNAL_KEY, empreinteCode, empreinteValide, validerCode } from '../lib/code-poste';

const JOURNAL_MAX = 200;
const LOT_MAX = 50;
const CHAMP_MAX = 255;
const CHAMPS = ['ancienne', 'nouvelle', 'date', 'poste'] as const;

async function lireJson(store: BrandingStore, key: string): Promise<any> {
  const valeur = (await store.get([key]))[key];
  if (!valeur) return null;
  try {
    return JSON.parse(valeur);
  } catch {
    return null;
  }
}

/**
 * GET /api/poste/verrou : public (le poste le lit à chaque connexion et le garde pour vérifier le
 * code hors ligne) ; empreinte scrypt seulement, jamais le code.
 * PUT /api/admin/poste/code : garde admin global (/api/admin) ; { code, confirmation }.
 * POST /api/poste/journal : changements d'adresse faits sur les postes, remontés à la reconnexion.
 * GET /api/admin/poste/journal : lecture par l'administrateur (page de monitoring).
 */
export async function registerCodePosteRoutes(fastify: FastifyInstance, store: BrandingStore): Promise<void> {
  fastify.get('/api/poste/verrou', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const e = await lireJson(store, CODE_KEY);
      return { success: true, verrou: empreinteValide(e) ? e : null };
    } catch (err: any) {
      fastify.log.error({ code: err?.code }, 'GET /api/poste/verrou');
      reply.statusCode = 500;
      return { error: 'Verrou des postes illisible.' };
    }
  });

  fastify.put('/api/admin/poste/code', async (request: FastifyRequest, reply: FastifyReply) => {
    const { code, confirmation } = (request.body as any) || {};
    const verdict = validerCode(code);
    if (!verdict.ok) {
      reply.statusCode = 400;
      return { error: verdict.raison };
    }
    if (confirmation !== code) {
      reply.statusCode = 400;
      return { error: 'La confirmation ne correspond pas au code.' };
    }
    try {
      const e = { ...(await empreinteCode(code)), defini_le: new Date().toISOString() };
      await store.set(CODE_KEY, JSON.stringify(e));
      return { success: true, defini_le: e.defini_le };
    } catch (err: any) {
      fastify.log.error({ code: err?.code }, 'PUT /api/admin/poste/code');
      reply.statusCode = 500;
      return { error: 'Enregistrement du code impossible.' };
    }
  });

  fastify.post('/api/poste/journal', async (request: FastifyRequest, reply: FastifyReply) => {
    const entrees = ((request.body as any) || {}).entrees;
    const valides = Array.isArray(entrees) && entrees.length <= LOT_MAX && entrees.every((e: any) => e
      && CHAMPS.every((c) => typeof e[c] === 'string' && e[c].length <= CHAMP_MAX));
    if (!valides) {
      reply.statusCode = 400;
      return { error: `Entrées attendues : ${LOT_MAX} au plus, champs ${CHAMPS.join(', ')} (texte).` };
    }
    try {
      const recu = new Date().toISOString();
      const journal = (await lireJson(store, JOURNAL_KEY)) || [];
      const ajout = entrees.map((e: any) => ({ ...Object.fromEntries(CHAMPS.map((c) => [c, e[c]])), recu }));
      const garde = [...(Array.isArray(journal) ? journal : []), ...ajout].slice(-JOURNAL_MAX);
      await store.set(JOURNAL_KEY, JSON.stringify(garde));
      return { success: true, recus: ajout.length };
    } catch (err: any) {
      fastify.log.error({ code: err?.code }, 'POST /api/poste/journal');
      reply.statusCode = 500;
      return { error: 'Journal des postes indisponible.' };
    }
  });

  fastify.get('/api/admin/poste/journal', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const journal = (await lireJson(store, JOURNAL_KEY)) || [];
      return { success: true, entrees: Array.isArray(journal) ? [...journal].reverse() : [] };
    } catch (err: any) {
      fastify.log.error({ code: err?.code }, 'GET /api/admin/poste/journal');
      reply.statusCode = 500;
      return { error: 'Journal des postes illisible.' };
    }
  });
}
