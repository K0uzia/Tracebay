import * as crypto from 'crypto';

/**
 * Code administrateur des postes : déverrouille Paramètres > Connexion sur un poste (changer
 * l'adresse du serveur). Choisi par un administrateur, jamais stocké ni transmis en clair :
 * le serveur garde une empreinte scrypt salée et l'envoie aux postes, qui vérifient le code
 * même serveur injoignable. Cette empreinte part sur les postes : d'où des paramètres forts et
 * le refus des codes trop simples (protection contre l'erreur, pas contre qui a les droits du poste).
 */

export const CODE_KEY = 'poste.code';
export const JOURNAL_KEY = 'poste.journal';
export const CODE_MIN = 12;
export const CODE_MAX = 128;
export const PARAMS_SCRYPT = { N: 32768, r: 8, p: 1 };
const LONGUEUR_EMPREINTE = 32;
const MEMOIRE_MAX = 64 * 1024 * 1024;

export interface EmpreinteCode {
  algo: 'scrypt';
  N: number;
  r: number;
  p: number;
  sel: string;
  empreinte: string;
  defini_le?: string;
}

// Suites de clavier et d'alphabet : 6 caractères consécutifs (dans un sens ou dans l'autre) suffisent à refuser.
const SUITES = ['abcdefghijklmnopqrstuvwxyz', '01234567890', 'azertyuiop', 'qsdfghjklm', 'wxcvbn', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
// Mots de passe courants : refusés quand le code n'est que l'un d'eux, avec chiffres ou symboles autour.
const COURANTS = new Set(['motdepasse', 'password', 'passw', 'azerty', 'qwerty', 'admin', 'administrateur', 'tracebay',
  'workspace', 'secret', 'bonjour', 'soleil', 'welcome', 'letmein', 'changeme', 'root', 'test', 'code']);

function contientSuite(code: string): boolean {
  const c = code.toLowerCase();
  for (const suite of SUITES) {
    for (const s of [suite, [...suite].reverse().join('')]) {
      for (let i = 0; i + 6 <= s.length; i++) {
        if (c.includes(s.slice(i, i + 6))) return true;
      }
    }
  }
  return false;
}

function repetitif(code: string): boolean {
  if (new Set(code).size < 5) return true;
  for (let l = 1; l <= 4; l++) {
    const bloc = code.slice(0, l);
    if (bloc.repeat(Math.ceil(code.length / l)).slice(0, code.length) === code) return true;
  }
  return false;
}

/** { ok } ou { ok: false, raison } : message lisible pour la page admin et tracebayctl. */
export function validerCode(code: unknown): { ok: boolean; raison?: string } {
  if (typeof code !== 'string') return { ok: false, raison: 'Code attendu.' };
  const longueur = [...code].length;
  if (longueur < CODE_MIN) return { ok: false, raison: `Code trop court : ${CODE_MIN} caractères au moins.` };
  if (longueur > CODE_MAX) return { ok: false, raison: `Code trop long : ${CODE_MAX} caractères au plus.` };
  if (repetitif(code)) return { ok: false, raison: 'Code trop simple : caractères répétés.' };
  if (contientSuite(code)) return { ok: false, raison: 'Code trop simple : suite de caractères (abcdef, 123456, azerty…).' };
  const lettres = code.toLowerCase().replace(/[^a-zàâäéèêëîïôöùûüç]/g, '');
  if (COURANTS.has(lettres)) return { ok: false, raison: 'Code trop simple : mot de passe courant.' };
  return { ok: true };
}

function scrypt(code: string, sel: Buffer, N: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(code.normalize('NFC'), sel, LONGUEUR_EMPREINTE, { N, r, p, maxmem: MEMOIRE_MAX }, (err, cle) => {
      if (err) reject(err);
      else resolve(cle);
    });
  });
}

export async function empreinteCode(code: string): Promise<EmpreinteCode> {
  const sel = crypto.randomBytes(16);
  const { N, r, p } = PARAMS_SCRYPT;
  const cle = await scrypt(code, sel, N, r, p);
  return { algo: 'scrypt', N, r, p, sel: sel.toString('base64'), empreinte: cle.toString('base64') };
}

/** Paramètres bornés : une empreinte forgée ne peut pas épuiser la mémoire ni la durée de calcul. */
export function empreinteValide(e: any): e is EmpreinteCode {
  return Boolean(e) && e.algo === 'scrypt' && Number.isInteger(e.N) && e.N >= 16384 && e.N <= 1048576
    && (e.N & (e.N - 1)) === 0 && Number.isInteger(e.r) && e.r >= 1 && e.r <= 16
    && Number.isInteger(e.p) && e.p >= 1 && e.p <= 4 && typeof e.sel === 'string' && typeof e.empreinte === 'string';
}

export async function verifierCode(code: string, e: EmpreinteCode): Promise<boolean> {
  if (typeof code !== 'string' || !empreinteValide(e)) return false;
  const attendu = Buffer.from(e.empreinte, 'base64');
  const cle = await scrypt(code, Buffer.from(e.sel, 'base64'), e.N, e.r, e.p);
  return attendu.length === cle.length && crypto.timingSafeEqual(attendu, cle);
}
