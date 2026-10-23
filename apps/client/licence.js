/**
 * Vérification hors ligne des clés de licence TB1 (contrat : docs/LICENCE.md).
 * Module pur, node:crypto seul : aucune connexion, aucun import Electron.
 * Le serveur en a un portage TypeScript (proxmox/app/src/lib/licence.ts),
 * rejoué sur les mêmes vecteurs de test.
 */
const crypto = require('crypto');

/** Jours d'écriture encore permis après l'expiration (bandeau rouge), puis lecture seule. */
const JOURS_GRACE_APRES_EXPIRATION = 15;
/** Avertissement avant l'expiration, aligné sur le statut « bientôt expirée » du hub. */
const JOURS_AVERTISSEMENT = 30;

const CLES_JSON = ['v', 'id', 'entreprise', 'emise', 'expire'];
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Jour calendaire AAAA-MM-JJ en heure de Paris. */
function jourParis(instant = new Date()) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' })
        .format(instant);
}

function dateValide(s) {
    const m = DATE.exec(String(s));
    if (!m) {
        return false;
    }
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1
        && d.getUTCDate() === +m[3];
}

function ajouterJours(jour, n) {
    const [a, m, j] = jour.split('-').map(Number);
    return new Date(Date.UTC(a, m - 1, j + n)).toISOString().slice(0, 10);
}

function ecartJours(de, a) {
    const t = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
    return Math.round((t(a) - t(de)) / 86400000);
}

/** Même quantième dix ans plus tard, ou dernier jour du mois (29 février). */
function plusDixAns(jour) {
    const [a, m, j] = jour.split('-').map(Number);
    const dernier = new Date(Date.UTC(a + 10, m, 0)).getUTCDate();
    return new Date(Date.UTC(a + 10, m - 1, Math.min(j, dernier))).toISOString().slice(0, 10);
}

function decoderSegment(s) {
    if (!BASE64URL.test(s)) {
        return null;
    }
    const octets = Buffer.from(s, 'base64url');
    return octets.toString('base64url') === s ? octets : null;
}

function entrepriseValide(e) {
    return typeof e === 'string' && e.length >= 1 && e.length <= 120 && e === e.trim()
        && e === e.normalize('NFC') && !/\p{Cc}/u.test(e);
}

/** Décode et contrôle le format, sans la signature : { octets, signature, donnees } ou null. */
function decoder(cle) {
    const parties = String(cle).trim().split('.');
    if (parties.length !== 3 || parties[0] !== 'TB1') {
        return null;
    }
    const octets = decoderSegment(parties[1]);
    const signature = decoderSegment(parties[2]);
    if (!octets || !signature) {
        return null;
    }
    let donnees;
    try {
        donnees = JSON.parse(octets.toString('utf8'));
    } catch (_) {
        return null;
    }
    if (!donnees || typeof donnees !== 'object' || Array.isArray(donnees)) {
        return null;
    }
    // JSON canonique : clés exactes, dans l'ordre, sans espace ; octets identiques à JSON.stringify
    if (Object.keys(donnees).join(',') !== CLES_JSON.join(',')
        || Buffer.compare(Buffer.from(JSON.stringify(donnees), 'utf8'), octets) !== 0) {
        return null;
    }
    const { v, id, entreprise, emise, expire } = donnees;
    if (v !== 1 || typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(id) || !entrepriseValide(entreprise)
        || !dateValide(emise) || !dateValide(expire)
        || expire < emise || expire > plusDixAns(emise)) {
        return null;
    }
    return { octets, signature, donnees };
}

function clePubliqueObjet(clePublique) {
    if (clePublique instanceof crypto.KeyObject) {
        return clePublique;
    }
    return crypto.createPublicKey({ key: Buffer.from(String(clePublique), 'base64'), format: 'der', type: 'spki' });
}

/**
 * @returns {{ valide: boolean, ecriture: boolean, etat: string, raison: string|null,
 *   entreprise: string|null, expire: string|null, finGrace: string|null,
 *   joursRestants: number|null }}
 * etat : absente, invalide, active, expire_bientot, grace, expiree, horloge.
 * raison (contrat du hub) : absente, format, signature, expiree, horloge, ou null.
 */
function verifierLicence({ cle, clePublique, aujourdhui = jourParis(), derniereDateVue = null }) {
    const vide = {
        valide: false, ecriture: false, entreprise: null,
        expire: null, finGrace: null, joursRestants: null
    };
    if (!cle || !String(cle).trim()) {
        return { ...vide, etat: 'absente', raison: 'absente' };
    }
    const d = decoder(cle);
    if (!d) {
        return { ...vide, etat: 'invalide', raison: 'format' };
    }
    let signatureOk = false;
    try {
        signatureOk = crypto.verify(null, d.octets, clePubliqueObjet(clePublique), d.signature);
    } catch (_) {
        signatureOk = false;
    }
    if (!signatureOk) {
        return { ...vide, etat: 'invalide', raison: 'signature' };
    }
    const { entreprise, expire } = d.donnees;
    const finGrace = ajouterJours(expire, JOURS_GRACE_APRES_EXPIRATION);
    const base = { entreprise, expire, finGrace, joursRestants: ecartJours(aujourdhui, expire) };
    if (derniereDateVue && aujourdhui < derniereDateVue) {
        return { ...base, valide: false, ecriture: false, etat: 'horloge', raison: 'horloge' };
    }
    if (aujourdhui <= expire) {
        const etat = ecartJours(aujourdhui, expire) <= JOURS_AVERTISSEMENT ? 'expire_bientot' : 'active';
        return { ...base, valide: true, ecriture: true, etat, raison: null };
    }
    if (aujourdhui <= finGrace) {
        return { ...base, valide: false, ecriture: true, etat: 'grace', raison: 'expiree' };
    }
    return { ...base, valide: false, ecriture: false, etat: 'expiree', raison: 'expiree' };
}

module.exports = {
    verifierLicence,
    jourParis,
    ajouterJours,
    JOURS_GRACE_APRES_EXPIRATION,
    JOURS_AVERTISSEMENT
};
