import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { CLE_PUBLIQUE_LICENCE } from '../lib/licence-cle-publique';
import { EtatLicence, RaisonLicence, jourParis, verifierLicence } from '../lib/licence';

/**
 * Licence de l'atelier, saisie une fois sur le serveur (docs/LICENCE.md, version serveur).
 * Clés app_settings : licence.cle, licence.derniere_date_vue, licence.exemption.
 */
export const LICENCE_KEYS = {
  cle: 'licence.cle',
  derniereDateVue: 'licence.derniere_date_vue',
  exemption: 'licence.exemption',
} as const;

export type EtatServeur = EtatLicence | 'non_activee';

export interface EtatLicenceServeur {
  etat: EtatServeur;
  ecriture: boolean;
  /** Nom signé, renvoyé dès que la signature est bonne (affichage, y compris en grâce). */
  entreprise: string | null;
  /** Nom imposé sur les PDF : seulement avec une licence valide. */
  nomImpose: string | null;
  expire: string | null;
  finGrace: string | null;
  joursRestants: number | null;
  raison: RaisonLicence;
  cle: string | null;
}

export interface LicenceStore {
  get(keys: string[]): Promise<Record<string, string | null>>;
  set(key: string, value: string): Promise<void>;
  /** L'installation contient-elle déjà des données métier ? */
  hasData(): Promise<boolean>;
}

type QueryFn = (sql: string, params?: any[]) => Promise<{ rows: any[] }>;

export function pgLicenceStore(query: QueryFn): LicenceStore {
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
    async hasData() {
      const tables = ['lots', 'dons', 'prets_materiel', 'commandes', 'disques_sessions', 'events'];
      const sql = `SELECT ${tables.map((t) => `EXISTS (SELECT 1 FROM ${t})`).join(' OR ')} AS present`;
      const result = await query(sql);
      return result.rows[0]?.present === true;
    },
  };
}

export class LicenceError extends Error {
  constructor(message: string, public raison: RaisonLicence) {
    super(message);
  }
}

function jourFr(jour: string | null): string {
  return jour ? `${jour.slice(8, 10)}/${jour.slice(5, 7)}/${jour.slice(0, 4)}` : '';
}

const MESSAGE_REFUS: Record<string, (expire: string | null) => string> = {
  absente: () => 'Collez la clé de licence.',
  format: () => "Clé invalide : le texte collé n'est pas une clé Tracebay complète (TB1.…).",
  signature: () => "Clé invalide : elle n'a pas été émise par Kouzia, ou elle a été modifiée.",
  expiree: (expire) => `Cette clé a expiré le ${jourFr(expire)}. Demandez une nouvelle clé à Kouzia (https://kouzia.com).`,
  horloge: () => "La date du serveur est antérieure à la dernière date connue. Corrigez l'horloge du serveur.",
};

export function messageLectureSeule(etat: EtatLicenceServeur): string {
  const suite = "L'administrateur peut saisir une clé sur la page de monitoring, onglet Licence.";
  switch (etat.etat) {
    case 'expiree': return `Licence expirée le ${jourFr(etat.expire)} : Tracebay est en lecture seule. ${suite}`;
    case 'horloge': return `La date du serveur a reculé : Tracebay est en lecture seule. ${suite}`;
    case 'invalide': return `Licence invalide : Tracebay est en lecture seule. ${suite}`;
    default: return `Aucune licence activée : Tracebay est en lecture seule. ${suite}`;
  }
}

export class LicenceService {
  private cache: { jour: string; etat: EtatLicenceServeur } | null = null;

  constructor(
    private store: LicenceStore,
    private clePublique: string = CLE_PUBLIQUE_LICENCE,
    private aujourdhui: () => string = () => jourParis()
  ) {}

  /**
   * Au premier démarrage d'une version licenciée, fige l'exemption : une installation qui a déjà
   * des données et n'a jamais eu de licence continue sans limite tant qu'aucune clé n'est saisie.
   */
  async init(): Promise<void> {
    const rows = await this.store.get([LICENCE_KEYS.cle, LICENCE_KEYS.exemption]);
    if (rows[LICENCE_KEYS.exemption]) return;
    const exempte = !rows[LICENCE_KEYS.cle] && (await this.store.hasData());
    await this.store.set(LICENCE_KEYS.exemption, exempte ? 'oui' : 'non');
  }

  invalider(): void {
    this.cache = null;
  }

  async etat(): Promise<EtatLicenceServeur> {
    const jour = this.aujourdhui();
    if (this.cache && this.cache.jour === jour) return this.cache.etat;
    const etat = await this.calculer(jour);
    this.cache = { jour, etat };
    return etat;
  }

  /** Nom imposé sur les PDF (licence valide), sinon null : le nom du réglage d'atelier s'applique. */
  async nomImpose(): Promise<string | null> {
    return (await this.etat()).nomImpose;
  }

  async enregistrer(cle: string): Promise<EtatLicenceServeur> {
    const jour = this.aujourdhui();
    const rows = await this.store.get([LICENCE_KEYS.derniereDateVue]);
    const v = verifierLicence({ cle, clePublique: this.clePublique, aujourdhui: jour, derniereDateVue: rows[LICENCE_KEYS.derniereDateVue] || null });
    if (!v.valide) {
      const raison = v.raison || 'format';
      throw new LicenceError((MESSAGE_REFUS[raison] || MESSAGE_REFUS.format)(v.expire), raison);
    }
    await this.store.set(LICENCE_KEYS.cle, String(cle).trim());
    this.invalider();
    return this.etat();
  }

  private async calculer(jour: string): Promise<EtatLicenceServeur> {
    const rows = await this.store.get([LICENCE_KEYS.cle, LICENCE_KEYS.derniereDateVue, LICENCE_KEYS.exemption]);
    const cle = rows[LICENCE_KEYS.cle] || null;
    const derniere = rows[LICENCE_KEYS.derniereDateVue] || null;
    if (cle) {
      const v = verifierLicence({ cle, clePublique: this.clePublique, aujourdhui: jour, derniereDateVue: derniere });
      if (v.etat !== 'horloge' && (!derniere || jour > derniere)) {
        await this.store.set(LICENCE_KEYS.derniereDateVue, jour);
      }
      return {
        etat: v.etat, ecriture: v.ecriture, entreprise: v.entreprise, nomImpose: v.valide ? v.entreprise : null,
        expire: v.expire, finGrace: v.finGrace, joursRestants: v.joursRestants, raison: v.raison, cle,
      };
    }
    const exempte = rows[LICENCE_KEYS.exemption] === 'oui';
    return {
      etat: exempte ? 'non_activee' : 'absente', ecriture: exempte, entreprise: null, nomImpose: null,
      expire: null, finGrace: null, joursRestants: null, raison: exempte ? null : 'absente', cle: null,
    };
  }
}

/**
 * Écritures toujours permises en lecture seule : connexion, licence, réglage d'atelier, remontée
 * d'erreurs, et tout ce qui efface ou anonymise une personne (droit à l'effacement, RGPD).
 */
const ECRITURES_TOUJOURS_PERMISES = new Set([
  'POST /api/auth/login',
  'POST /api/auth/logout',
  'POST /api/auth/verify',
  'POST /api/admin/auth/login',
  'POST /api/monitoring/errors',
  'PUT /api/admin/licence',
  'PUT /api/admin/branding',
  'DELETE /api/admin/branding/logo',
  'PUT /api/admin/material-types',
  'PUT /api/admin/poste/code',
  'POST /api/poste/journal',
  'DELETE /api/dons/:id',
  'DELETE /api/admin/dons/:id',
  'DELETE /api/prets-materiel/:id',
  'DELETE /api/agenda/events/:id',
  'DELETE /api/admin/agenda/:id',
  'POST /api/lots/technicians/anonymize',
  'DELETE /api/admin/users/:id',
  'DELETE /api/admin/messages/:id',
  'DELETE /api/admin/messages',
  'DELETE /api/admin/monitoring/errors/:id',
  'POST /api/lots/:id/pdf',
  'POST /api/disques/sessions/:id/pdf',
]);

/** Mises à jour permises si le corps ne contient que pdf_path (chemin du PDF d'un enregistrement existant). */
const PDF_PATH_SEUL = new Set([
  'PUT /api/lots/:id',
  'PUT /api/disques/sessions/:id',
  'PUT /api/dons/:id',
  'PUT /api/prets-materiel/:id',
  'PUT /api/commandes/:id',
]);

export function ecriturePermiseEnLectureSeule(method: string, route: string, body: unknown): boolean {
  const cle = `${method} ${route}`;
  if (ECRITURES_TOUJOURS_PERMISES.has(cle)) return true;
  if (PDF_PATH_SEUL.has(cle)) {
    const keys = body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body) : [];
    return keys.length > 0 && keys.every((k) => k === 'pdf_path');
  }
  return false;
}

/** Lecture seule : refuse les écritures (423) quand la licence ne les permet plus. */
export function registerLicenceGuard(fastify: FastifyInstance, service: LicenceService): void {
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return;
    const route = (request as any).routeOptions?.url ?? (request as any).routerPath;
    if (!route) return;
    const etat = await service.etat();
    if (etat.ecriture || ecriturePermiseEnLectureSeule(request.method, route, request.body)) return;
    return reply.code(423).send({ error: messageLectureSeule(etat), code: 'licence_lecture_seule' });
  });
}

export async function registerLicenceRoutes(fastify: FastifyInstance, service: LicenceService): Promise<void> {
  fastify.get('/api/licence', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const e = await service.etat();
      return {
        success: true, etat: e.etat, ecriture: e.ecriture, entreprise: e.entreprise, expire: e.expire,
        fin_grace: e.finGrace, jours_restants: e.joursRestants, raison: e.raison, cle: e.cle,
      };
    } catch (err: any) {
      fastify.log.error({ code: err?.code }, 'GET /api/licence');
      reply.statusCode = 500;
      return { error: 'État de la licence illisible.' };
    }
  });

  fastify.put('/api/admin/licence', async (request: FastifyRequest, reply: FastifyReply) => {
    const cle = String((request.body as any)?.cle ?? '').trim();
    if (cle.length > 4000) {
      reply.statusCode = 400;
      return { error: MESSAGE_REFUS.format(null), raison: 'format' };
    }
    try {
      const e = await service.enregistrer(cle);
      return { success: true, etat: e.etat, ecriture: e.ecriture, entreprise: e.entreprise, expire: e.expire, fin_grace: e.finGrace };
    } catch (err: any) {
      if (err instanceof LicenceError) {
        reply.statusCode = 400;
        return { error: err.message, raison: err.raison };
      }
      fastify.log.error({ code: err?.code }, 'PUT /api/admin/licence');
      reply.statusCode = 500;
      return { error: 'Enregistrement de la licence impossible.' };
    }
  });
}
