/**
 * Vérification hors ligne des clés de licence TB1 (contrat : docs/LICENCE.md).
 * Portage du module client apps/client/licence.js : même logique, mêmes vecteurs de test
 * (src/tests/licence-vecteurs.json, identique des deux côtés).
 */
import * as crypto from 'crypto';

/** Jours d'écriture encore permis après la date d'expiration (bandeau rouge), puis lecture seule. */
export const JOURS_GRACE_APRES_EXPIRATION = 15;
/** Avertissement avant l'expiration, aligné sur le statut « bientôt expirée » du hub. */
export const JOURS_AVERTISSEMENT = 30;

export type EtatLicence = 'absente' | 'invalide' | 'active' | 'expire_bientot' | 'grace' | 'expiree' | 'horloge';
export type RaisonLicence = 'absente' | 'format' | 'signature' | 'expiree' | 'horloge' | null;

export interface VerificationLicence {
  valide: boolean;
  ecriture: boolean;
  etat: EtatLicence;
  raison: RaisonLicence;
  entreprise: string | null;
  expire: string | null;
  finGrace: string | null;
  joursRestants: number | null;
}

const CLES_JSON = ['v', 'id', 'entreprise', 'emise', 'expire'];
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Jour calendaire AAAA-MM-JJ en heure de Paris. */
export function jourParis(instant: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(instant);
}

function dateValide(s: unknown): s is string {
  const m = DATE.exec(String(s));
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

export function ajouterJours(jour: string, n: number): string {
  const [a, m, j] = jour.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, j + n)).toISOString().slice(0, 10);
}

function ecartJours(de: string, a: string): number {
  const t = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.round((t(a) - t(de)) / 86400000);
}

/** Même quantième dix ans plus tard, ou dernier jour du mois (29 février). */
function plusDixAns(jour: string): string {
  const [a, m, j] = jour.split('-').map(Number);
  const dernier = new Date(Date.UTC(a + 10, m, 0)).getUTCDate();
  return new Date(Date.UTC(a + 10, m - 1, Math.min(j, dernier))).toISOString().slice(0, 10);
}

function decoderSegment(s: string): Buffer | null {
  if (!BASE64URL.test(s)) return null;
  const octets = Buffer.from(s, 'base64url');
  return octets.toString('base64url') === s ? octets : null;
}

function entrepriseValide(e: unknown): e is string {
  return typeof e === 'string' && e.length >= 1 && e.length <= 120 && e === e.trim()
    && e === e.normalize('NFC') && !/\p{Cc}/u.test(e);
}

function decoder(cle: string): { octets: Buffer; signature: Buffer; donnees: any } | null {
  const parties = String(cle).trim().split('.');
  if (parties.length !== 3 || parties[0] !== 'TB1') return null;
  const octets = decoderSegment(parties[1]);
  const signature = decoderSegment(parties[2]);
  if (!octets || !signature) return null;
  let donnees: any;
  try {
    donnees = JSON.parse(octets.toString('utf8'));
  } catch {
    return null;
  }
  if (!donnees || typeof donnees !== 'object' || Array.isArray(donnees)) return null;
  // JSON canonique : clés exactes, dans l'ordre, sans espace ; octets identiques à JSON.stringify
  if (Object.keys(donnees).join(',') !== CLES_JSON.join(',')
    || Buffer.compare(Buffer.from(JSON.stringify(donnees), 'utf8'), octets) !== 0) return null;
  const { v, id, entreprise, emise, expire } = donnees;
  if (v !== 1 || typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(id) || !entrepriseValide(entreprise)
    || !dateValide(emise) || !dateValide(expire) || expire < emise || expire > plusDixAns(emise)) return null;
  return { octets, signature, donnees };
}

function clePubliqueObjet(clePublique: string | crypto.KeyObject): crypto.KeyObject {
  if (clePublique instanceof crypto.KeyObject) return clePublique;
  return crypto.createPublicKey({ key: Buffer.from(String(clePublique), 'base64'), format: 'der', type: 'spki' });
}

export function verifierLicence(params: {
  cle: string | null | undefined;
  clePublique: string | crypto.KeyObject;
  aujourdhui?: string;
  derniereDateVue?: string | null;
}): VerificationLicence {
  const { cle, clePublique, aujourdhui = jourParis(), derniereDateVue = null } = params;
  const vide = { valide: false, ecriture: false, entreprise: null, expire: null, finGrace: null, joursRestants: null };
  if (!cle || !String(cle).trim()) return { ...vide, etat: 'absente', raison: 'absente' };
  const d = decoder(cle);
  if (!d) return { ...vide, etat: 'invalide', raison: 'format' };
  let signatureOk = false;
  try {
    signatureOk = crypto.verify(null, d.octets, clePubliqueObjet(clePublique), d.signature);
  } catch {
    signatureOk = false;
  }
  if (!signatureOk) return { ...vide, etat: 'invalide', raison: 'signature' };
  const { entreprise, expire } = d.donnees as { entreprise: string; expire: string };
  const finGrace = ajouterJours(expire, JOURS_GRACE_APRES_EXPIRATION);
  const base = { entreprise, expire, finGrace, joursRestants: ecartJours(aujourdhui, expire) };
  if (derniereDateVue && aujourdhui < derniereDateVue) {
    return { ...base, valide: false, ecriture: false, etat: 'horloge', raison: 'horloge' };
  }
  if (aujourdhui <= expire) {
    const etat: EtatLicence = ecartJours(aujourdhui, expire) <= JOURS_AVERTISSEMENT ? 'expire_bientot' : 'active';
    return { ...base, valide: true, ecriture: true, etat, raison: null };
  }
  if (aujourdhui <= finGrace) return { ...base, valide: false, ecriture: true, etat: 'grace', raison: 'expiree' };
  return { ...base, valide: false, ecriture: false, etat: 'expiree', raison: 'expiree' };
}
