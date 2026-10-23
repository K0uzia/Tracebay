/**
 * Écritures permises quand la licence met Tracebay en lecture seule.
 * Miroir de la liste du serveur (proxmox/app/src/api/licence.ts) : le serveur décide, le poste
 * évite seulement d'envoyer une requête qui serait refusée.
 */

const TOUJOURS = [
    ['POST', /^\/api\/auth\/(login|logout|verify)$/],
    ['POST', /^\/api\/admin\/auth\/login$/],
    ['POST', /^\/api\/monitoring\/errors$/],
    ['DELETE', /^\/api\/dons\/[^/]+$/],
    ['DELETE', /^\/api\/prets-materiel\/[^/]+$/],
    ['DELETE', /^\/api\/agenda\/events\/[^/]+$/],
    ['POST', /^\/api\/lots\/technicians\/anonymize$/],
    ['POST', /^\/api\/lots\/[^/]+\/pdf$/],
    ['POST', /^\/api\/disques\/sessions\/[^/]+\/pdf$/]
];

/** Mises à jour permises si le corps ne contient que pdf_path. */
const PDF_PATH_SEUL = [
    /^\/api\/lots\/[^/]+$/,
    /^\/api\/disques\/sessions\/[^/]+$/,
    /^\/api\/dons\/[^/]+$/,
    /^\/api\/prets-materiel\/[^/]+$/
];

function cheminDe(url) {
    try {
        return new URL(String(url), 'http://poste.local').pathname;
    } catch (_) {
        return String(url);
    }
}

export function ecriturePermiseEnLectureSeule(method, url, body) {
    const m = String(method || 'GET').toUpperCase();
    if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') {
        return true;
    }
    const chemin = cheminDe(url);
    if (TOUJOURS.some(([verbe, motif]) => verbe === m && motif.test(chemin))) {
        return true;
    }
    if (m === 'PUT' && PDF_PATH_SEUL.some((motif) => motif.test(chemin))) {
        const cles = body && typeof body === 'object' && !Array.isArray(body) ? Object.keys(body) : [];
        return cles.length > 0 && cles.every((k) => k === 'pdf_path');
    }
    return false;
}
