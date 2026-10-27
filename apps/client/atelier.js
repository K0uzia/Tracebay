/**
 * Réglages d'atelier modifiés depuis un poste (nom, logo et couleur des PDF, types de matériel,
 * effacement d'un nom de technicien).
 * Module du processus principal, sans import Electron : testé avec Jest.
 *
 * Le jeton à portée « atelier » (1 h, quatre routes seulement côté serveur) reste dans ce module :
 * jamais transmis au renderer, jamais écrit sur disque. Le renderer n'envoie que des données
 * validées ici avec zod.
 */
const { z } = require('zod');

const Connexion = z.object({
    username: z.string().trim().min(1).max(50),
    password: z.string().min(1).max(200)
}).strict();

const LOGO_DATA_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const LOGO = z.string().max(800000).regex(LOGO_DATA_URL);

const Branding = z.object({
    company_name: z.string().trim().min(1).max(120).optional(),
    logo: z.union([LOGO, z.null()]).optional(),
    pdf_color: z.union([z.string().regex(/^#[0-9a-fA-F]{6}$/), z.null()]).optional()
}).strict().refine((b) => Object.keys(b).length > 0, { message: 'Rien à enregistrer.' });

const Types = z.object({
    types: z.array(z.string().max(40)).max(50)
}).strict();

const Technicien = z.object({
    name: z.string().min(1).max(255).refine((n) => n.trim().length > 0, { message: 'Nom du technicien attendu.' })
}).strict();

const ERREUR_RESEAU = 'Le serveur ne répond pas. Vérifiez la connexion du poste puis réessayez.';

/**
 * @param {{ serverUrl: string, fetchImpl: typeof fetch, now?: () => number, timeoutMs?: number }} o
 */
function createAtelierSession(o) {
    const { serverUrl, fetchImpl, now = Date.now, timeoutMs = 8000 } = o;
    let session = null;

    const actif = () => Boolean(session && session.expiresAt > now());
    const etat = () => (actif()
        ? { connecte: true, username: session.username, expiresAt: session.expiresAt }
        : { connecte: false });

    async function appeler(methode, chemin, corps, jeton) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetchImpl(`${serverUrl}${chemin}`, {
                method: methode,
                headers: {
                    'Content-Type': 'application/json',
                    ...(jeton ? { Authorization: `Bearer ${jeton}` } : {})
                },
                body: corps === undefined ? undefined : JSON.stringify(corps),
                signal: controller.signal
            });
            const body = await res.json().catch(() => ({}));
            return { status: res.status, body };
        } finally {
            clearTimeout(timer);
        }
    }

    function invalide(erreur) {
        return { success: false, error: erreur.issues?.[0]?.message || 'Données invalides.' };
    }

    /** Écriture avec le jeton ; 401 ou 403 : session terminée, nouvelle connexion demandée. */
    async function ecrire(methode, chemin, corps) {
        if (!actif()) {
            session = null;
            return { success: false, code: 'reconnexion', error: 'Session administrateur terminée : reconnectez-vous.' };
        }
        let rep;
        try {
            rep = await appeler(methode, chemin, corps, session.token);
        } catch (_) {
            return { success: false, error: ERREUR_RESEAU };
        }
        if (rep.status === 401 || rep.status === 403) {
            session = null;
            return { success: false, code: 'reconnexion', error: 'Session administrateur terminée : reconnectez-vous.' };
        }
        if (rep.status !== 200) {
            return { success: false, error: rep.body?.error || `Enregistrement refusé (code ${rep.status}).` };
        }
        return { success: true, data: rep.body };
    }

    return {
        etat,

        async connexion(payload) {
            const parsed = Connexion.safeParse(payload);
            if (!parsed.success) {
                return invalide(parsed.error);
            }
            let rep;
            try {
                rep = await appeler('POST', '/api/admin/auth/login', { ...parsed.data, scope: 'atelier' });
            } catch (_) {
                return { success: false, error: ERREUR_RESEAU };
            }
            if (rep.status !== 200 || !rep.body?.token || rep.body?.scope !== 'atelier') {
                const message = rep.status === 403
                    ? 'Ce compte n\'est pas administrateur.'
                    : rep.status === 429
                        ? 'Trop de tentatives : réessayez dans quelques minutes.'
                        : rep.body?.error || rep.body?.message || 'Connexion refusée.';
                return { success: false, error: message };
            }
            const duree = Number(rep.body.expires_in) > 0 ? Number(rep.body.expires_in) : 3600;
            // Marge d'une minute : le poste considère la session finie avant le serveur.
            session = {
                token: rep.body.token,
                username: rep.body.username,
                expiresAt: now() + (duree - 60) * 1000
            };
            return { success: true, ...etat() };
        },

        deconnexion() {
            session = null;
            return { success: true, connecte: false };
        },

        async enregistrerBranding(payload) {
            const parsed = Branding.safeParse(payload);
            if (!parsed.success) {
                return invalide(parsed.error);
            }
            return ecrire('PUT', '/api/admin/branding', parsed.data);
        },

        async enregistrerTypes(payload) {
            const parsed = Types.safeParse(payload);
            if (!parsed.success) {
                return invalide(parsed.error);
            }
            return ecrire('PUT', '/api/admin/material-types', parsed.data);
        },

        /** Effacement d'un nom de technicien dans toute la base (droit à l'effacement), admin. */
        async anonymiserTechnicien(payload) {
            const parsed = Technicien.safeParse(payload);
            if (!parsed.success) {
                return invalide(parsed.error);
            }
            return ecrire('POST', '/api/lots/technicians/anonymize', parsed.data);
        }
    };
}

module.exports = { createAtelierSession };
