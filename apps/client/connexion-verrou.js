/**
 * Verrou de l'adresse du serveur sur un poste (édition serveur, à partir de la 3.8.3). Après la
 * première connexion, Paramètres > Connexion est en lecture seule ; le code administrateur des
 * postes (défini sur le serveur) ouvre la modification pour 10 minutes. Le serveur envoie
 * l'empreinte scrypt du code à chaque connexion : le poste la garde et vérifie le code même
 * serveur injoignable. Protection contre l'erreur, pas contre qui a les droits du poste.
 * Module du processus principal sans import Electron : testé avec Jest.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const OUVERTURE_MS = 10 * 60 * 1000;
const ESSAIS_LIBRES = 5;
const ATTENTE_MAX_MS = 60 * 60 * 1000;
const JOURNAL_MAX = 50;
const MEMOIRE_MAX = 64 * 1024 * 1024;

/** Empreinte du serveur, paramètres bornés : une empreinte forgée n'épuise pas la mémoire. */
function verrouValide(v) {
    return Boolean(v) && v.algo === 'scrypt' && Number.isInteger(v.N) && v.N >= 16384 && v.N <= 1048576
        && (v.N & (v.N - 1)) === 0 && Number.isInteger(v.r) && v.r >= 1 && v.r <= 16
        && Number.isInteger(v.p) && v.p >= 1 && v.p <= 4
        && typeof v.sel === 'string' && typeof v.empreinte === 'string';
}

/** Code saisi sur le poste contre l'empreinte gardée (même calcul que le serveur). */
function verifierCode(code, v) {
    return new Promise((resolve) => {
        if (typeof code !== 'string' || !code || code.length > 128 || !verrouValide(v)) {
            resolve(false);
            return;
        }
        const attendu = Buffer.from(v.empreinte, 'base64');
        crypto.scrypt(code.normalize('NFC'), Buffer.from(v.sel, 'base64'), attendu.length || 32,
            { N: v.N, r: v.r, p: v.p, maxmem: MEMOIRE_MAX }, (err, cle) => {
                const egal = !err && attendu.length === cle.length;
                resolve(egal && crypto.timingSafeEqual(attendu, cle));
            });
    });
}

/** Attente restante avant un nouvel essai (0 : essai permis). */
function attenteMs(essais, maintenant) {
    return Math.max(0, Number(essais?.bloqueJusqua || 0) - maintenant);
}

/** Après un code faux : 5 essais libres, puis 1, 2, 4… minutes, 1 heure au plus. */
function apresEchec(essais, maintenant) {
    const echecs = Number(essais?.echecs || 0) + 1;
    const attente = echecs < ESSAIS_LIBRES
        ? 0
        : Math.min(ATTENTE_MAX_MS, 60_000 * 2 ** (echecs - ESSAIS_LIBRES));
    return { echecs, bloqueJusqua: attente ? maintenant + attente : 0 };
}

/**
 * Réponse de GET /api/poste/verrou : empreinte à enregistrer (adresse verrouillée), ou rien à
 * changer (serveur sans code, serveur d'avant la 3.8.3, erreur), avec une ligne de journal.
 */
function decisionVerrou(statut, corps) {
    if (statut === 200 && verrouValide(corps?.verrou)) {
        return { action: 'enregistrer', verrou: corps.verrou };
    }
    if (statut === 200 && corps?.verrou === null) {
        return { action: 'garder', journal: 'Serveur sans code administrateur : aucun code administrateur défini, adresse modifiable.' };
    }
    if (statut === 404) {
        return { action: 'garder', journal: 'Serveur antérieur à la 3.8.3 : pas de verrou de l\'adresse.' };
    }
    return { action: 'garder', journal: `Verrou de l'adresse non vérifié (réponse ${statut || 'absente'}).` };
}

function ajouterJournal(journal, entree) {
    return [...(Array.isArray(journal) ? journal : []), entree].slice(-JOURNAL_MAX);
}

function lireJson(fichier) {
    try {
        return JSON.parse(fs.readFileSync(fichier, 'utf8'));
    } catch (_) {
        return null;
    }
}

/** Écriture atomique (fichier temporaire puis renommage). */
function ecrireJson(fichier, valeur) {
    fs.mkdirSync(path.dirname(fichier), { recursive: true });
    const temporaire = `${fichier}.${process.pid}.tmp`;
    fs.writeFileSync(temporaire, `${JSON.stringify(valeur, null, 2)}\n`, 'utf8');
    fs.renameSync(temporaire, fichier);
}

module.exports = {
    OUVERTURE_MS, verrouValide, verifierCode, attenteMs, apresEchec, decisionVerrou, ajouterJournal,
    lireJson, ecrireJson
};
