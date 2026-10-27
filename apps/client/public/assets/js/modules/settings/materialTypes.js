/**
 * Types de matériel de l'atelier (Paramètres > Types), définis par l'administrateur sur le serveur.
 * Même interface que la portable : la valeur enregistrée sur un article est le libellé lui-même ;
 * les anciens codes (portable, fixe, ecran) restent affichés avec leur libellé, et un type retiré
 * de la liste reste affiché tel quel (champ « Précisez »).
 */
import api from '../../config/api.js';
import { escapeHtml } from '../../utils/html.js';

/** Valeur de « Autre (préciser) », toujours proposée : un lot s'enregistre même sans type. */
export const OTHER_TYPE = 'autres';

// Liste de départ du serveur, reprise si la liste est illisible (serveur d'avant la 3.8.0, réseau).
const TYPES_DEPART = ['Portable', 'Fixe', 'Écran'];

const LEGACY_LABELS = {
    portable: 'Portable',
    'pc portable': 'Portable',
    fixe: 'Fixe',
    'pc fixe': 'Fixe',
    ecran: 'Écran',
    'écran': 'Écran',
    autres: 'Autres'
};

let cache = null;

/** Liste, usage par valeur enregistrée et indicateur « liste par défaut » (mis en cache). */
export function getMaterialTypesInfo() {
    if (!cache) {
        cache = api.get('/api/material-types', { useCache: false })
            .then(async (res) => {
                if (!res.ok) {
                    throw Object.assign(new Error(`HTTP ${res.status}`), { statut: res.status });
                }
                const body = await res.json();
                return {
                    types: Array.isArray(body.types) ? body.types : [],
                    usage: Array.isArray(body.usage) ? body.usage : [],
                    parDefaut: body.par_defaut === true
                };
            })
            .catch((err) => {
                cache = null;
                // statut : code HTTP du serveur ; null si aucune réponse (réseau, serveur arrêté)
                const statut = err?.statut ?? null;
                return {
                    types: [...TYPES_DEPART], usage: [], parDefaut: true, indisponible: true, statut
                };
            });
    }
    return cache;
}

/** Liste des types (mise en cache ; invalidée quand les réglages de l'atelier changent). */
export function getMaterialTypes() {
    return getMaterialTypesInfo().then((info) => info.types);
}

export function invalidateMaterialTypes() {
    cache = null;
}

/** Libellé affiché pour une valeur enregistrée (ancien code ou libellé). */
export function typeLabel(value) {
    const s = String(value ?? '').trim();
    return LEGACY_LABELS[s.toLowerCase()] || s;
}

/** Type de la liste correspondant à une valeur enregistrée (insensible à la casse), sinon null. */
export function matchType(types, value) {
    const label = typeLabel(value).toLowerCase();
    return label ? types.find((t) => t.toLowerCase() === label) || null : null;
}

/**
 * Usage regroupé par libellé : { label, count, dansLaListe }, du plus utilisé au moins utilisé.
 * Les valeurs hors liste (type retiré, saisie libre) restent comptées sous leur propre libellé.
 */
export function usageParType(types, usage) {
    const parLibelle = new Map();
    for (const u of usage || []) {
        const label = matchType(types, u.type) || typeLabel(u.type);
        if (!label) {
            continue;
        }
        const cle = label.toLowerCase();
        const dansLaListe = Boolean(matchType(types, label));
        const prev = parLibelle.get(cle) || { label, count: 0, dansLaListe };
        prev.count += Number(u.count) || 0;
        parLibelle.set(cle, prev);
    }
    return [...parLibelle.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'fr'));
}

/**
 * Options d'un <select> de type : placeholder, types définis, puis « Autre (préciser) ».
 * selected : valeur enregistrée ; si elle n'est pas dans la liste, « Autre » est sélectionné
 * (le libellé va alors dans le champ « Précisez »).
 */
export function typeOptionsHtml(types, { selected = '', placeholder = 'Type', otherValue = OTHER_TYPE, otherLabel = 'Autre (préciser)' } = {}) {
    const match = matchType(types, selected);
    const isOther = Boolean(String(selected ?? '').trim()) && !match;
    return [
        `<option value="">${escapeHtml(placeholder)}</option>`,
        ...types.map((t) => `<option value="${escapeHtml(t)}"${match === t ? ' selected' : ''}>${escapeHtml(t)}</option>`),
        `<option value="${escapeHtml(otherValue)}"${isOther ? ' selected' : ''}>${escapeHtml(otherLabel)}</option>`
    ].join('');
}

/** Valeur « Précisez » à afficher quand le type enregistré n'est pas dans la liste. */
export function otherTypeText(types, value) {
    const s = String(value ?? '').trim();
    return s && !matchType(types, s) ? typeLabel(s) : '';
}

window.addEventListener('tracebay:settings-saved', invalidateMaterialTypes);
