/**
 * En-tête des PDF : nom et logo de l'atelier.
 * Module pur (aucun import Electron) : réutilisable par la version portable, testé avec Jest.
 * Version serveur : le réglage vient de GET /api/branding, partagé par tous les postes.
 */

const DEFAULT_COMPANY_NAME = 'Tracebay';
const LOGO_MAX_BYTES = 512 * 1024;
const NAME_MAX_LENGTH = 120;

const SIGNATURES = [
    { mime: 'image/png', test: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
    { mime: 'image/jpeg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
    { mime: 'image/webp', test: (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' }
];

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Data URL d'image PNG, JPEG ou WebP vérifiée par ses octets, ou null. Jamais de SVG. */
function safeLogo(dataUrl) {
    const m = /^data:image\/[a-z+.-]+;base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(dataUrl ?? '').trim());
    if (!m) {
        return null;
    }
    const bytes = Buffer.from(m[1], 'base64');
    if (bytes.length === 0 || bytes.length > LOGO_MAX_BYTES) {
        return null;
    }
    const sig = SIGNATURES.find((s) => s.test(bytes));
    return sig ? `data:${sig.mime};base64,${bytes.toString('base64')}` : null;
}

/** Réglage nettoyé : nom par défaut « Tracebay », logo retiré s'il est invalide. */
function sanitizeBranding(raw) {
    // eslint-disable-next-line no-control-regex -- retrait voulu des caractères de contrôle
    const name = String(raw?.company_name ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, NAME_MAX_LENGTH);
    return {
        name: name || DEFAULT_COMPANY_NAME,
        logo: safeLogo(raw?.logo)
    };
}

/**
 * Remplace {{company_name}} et {{company_logo}} dans un gabarit PDF.
 * Sans logo, l'emplacement du logo est retiré.
 */
function applyBranding(html, branding) {
    const { name, logo } = sanitizeBranding({ company_name: branding?.name, logo: branding?.logo });
    const logoHtml = logo ? `<img src="${logo}" alt="${escapeHtml(name)}"/>` : '';
    return String(html)
        .replace(/\{\{company_logo\}\}/g, () => logoHtml)
        .replace(/\{\{company_name\}\}/g, () => escapeHtml(name));
}

/**
 * Lecture du réglage avec cache : un appel réseau au plus toutes les ttlMs, dernier réglage
 * connu si le serveur ne répond pas, valeur par défaut si rien n'a jamais été lu.
 */
function createBrandingCache({ url, fetchImpl, ttlMs = 300000, timeoutMs = 3000, now = Date.now }) {
    let cached = null;
    let fetchedAt = 0;
    return {
        async get() {
            if (cached && now() - fetchedAt < ttlMs) {
                return cached;
            }
            try {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), timeoutMs);
                const res = await fetchImpl(url, { signal: controller.signal });
                clearTimeout(timer);
                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}`);
                }
                cached = sanitizeBranding(await res.json());
                fetchedAt = now();
            } catch (_) {
                // Serveur injoignable : on garde le dernier réglage connu
            }
            return cached || sanitizeBranding(null);
        },
        clear() {
            cached = null;
            fetchedAt = 0;
        }
    };
}

module.exports = {
    applyBranding,
    sanitizeBranding,
    createBrandingCache,
    DEFAULT_COMPANY_NAME,
    LOGO_MAX_BYTES
};
