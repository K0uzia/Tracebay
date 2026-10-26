/**
 * Adresse du serveur propre au poste : <userData>/connection.json, { serverUrl, serverWsUrl }.
 * Elle prime sur l'adresse livrée dans config/connection.json. Au premier lancement d'une version
 * qui connaît ce fichier, l'adresse que le poste utilisait déjà y est recopiée (aucune adresse
 * écrite dans le code). Sans import Electron : testé avec Jest.
 */
const fs = require('fs');
const path = require('path');
const { z } = require('zod');

const Saisie = z.string().trim().min(1, 'Adresse vide.').max(200, 'Adresse trop longue.');

/**
 * « 192.0.2.10:4000 », « http://serveur:4000 » ou « https://tracebay.exemple.fr » :
 * { ok, serverUrl, serverWsUrl } ou { ok: false, error } (message lisible).
 */
function normaliserAdresse(saisie) {
    const lu = Saisie.safeParse(saisie);
    if (!lu.success) {
        return { ok: false, error: lu.error.issues[0].message };
    }
    const texte = /^[a-z][a-z0-9+.-]*:\/\//i.test(lu.data) ? lu.data : `http://${lu.data}`;
    let url;
    try {
        url = new URL(texte);
    } catch (_) {
        return { ok: false, error: 'Adresse invalide. Exemple : http://192.0.2.10:4000' };
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return { ok: false, error: 'L\'adresse doit commencer par http:// ou https://.' };
    }
    if (!url.hostname || url.username || url.password || url.search || url.hash
        || (url.pathname && url.pathname !== '/')) {
        return { ok: false, error: 'Indiquez seulement l\'hôte et le port, sans chemin. Exemple : http://192.0.2.10:4000' };
    }
    const serverUrl = `${url.protocol}//${url.host}`;
    return { ok: true, serverUrl, serverWsUrl: serverUrl.replace(/^http/, 'ws') };
}

/** Adresse enregistrée sur le poste, ou null (fichier absent ou illisible). */
function lireAdressePoste(fichier) {
    try {
        const contenu = JSON.parse(fs.readFileSync(fichier, 'utf8'));
        const adresse = normaliserAdresse(contenu?.serverUrl);
        if (!adresse.ok) {
            return null;
        }
        return { serverUrl: adresse.serverUrl, serverWsUrl: adresse.serverWsUrl };
    } catch (_) {
        return null;
    }
}

/** Écriture atomique (fichier temporaire puis renommage) : jamais de fichier à moitié écrit. */
function ecrireAdressePoste(fichier, adresse) {
    fs.mkdirSync(path.dirname(fichier), { recursive: true });
    const temporaire = `${fichier}.${process.pid}.tmp`;
    const contenu = { serverUrl: adresse.serverUrl, serverWsUrl: adresse.serverWsUrl };
    fs.writeFileSync(temporaire, `${JSON.stringify(contenu, null, 2)}\n`, 'utf8');
    fs.renameSync(temporaire, fichier);
}

/**
 * Premier lancement : sans fichier, recopie l'adresse en place ({ url }) si elle est valide.
 * Un fichier existant n'est jamais réécrit, même illisible (l'utilisateur le corrige dans
 * Paramètres > Connexion). Retourne { adresse: { serverUrl, serverWsUrl } | null, migre }.
 */
function migrerAdressePoste({ fichier, adresseEnPlace }) {
    if (fs.existsSync(fichier)) {
        return { adresse: lireAdressePoste(fichier), migre: false };
    }
    const adresse = normaliserAdresse(adresseEnPlace?.url || '');
    if (!adresse.ok) {
        return { adresse: null, migre: false };
    }
    const enregistree = { serverUrl: adresse.serverUrl, serverWsUrl: adresse.serverWsUrl };
    ecrireAdressePoste(fichier, enregistree);
    return { adresse: enregistree, migre: true };
}

module.exports = { normaliserAdresse, lireAdressePoste, ecrireAdressePoste, migrerAdressePoste };
