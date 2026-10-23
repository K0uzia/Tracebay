/**
 * Réglages d'atelier depuis un poste (atelier.js) : jeton « atelier » gardé dans le processus
 * principal, données validées avec zod, session terminée sur 401 ou 403.
 */
const { createAtelierSession } = require('../atelier');

const reponse = (status, body) => ({ status, ok: status === 200, json: async () => body });
const PNG = `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]).toString('base64')}`;

function session({ login = reponse(200, { success: true, token: 'jeton-secret', username: 'admin', scope: 'atelier', expires_in: 3600 }), ecriture = reponse(200, { success: true }) } = {}) {
    let t = 1_000_000;
    const fetchImpl = jest.fn(async (url) => (url.endsWith('/api/admin/auth/login') ? login : ecriture));
    const s = createAtelierSession({ serverUrl: 'http://serveur:4000', fetchImpl, now: () => t });
    const avancer = (ms) => {
        t += ms;
    };
    return { s, fetchImpl, avancer };
}

describe('connexion', () => {
    test('portée « atelier » demandée, jeton jamais renvoyé au renderer', async () => {
        const { s, fetchImpl } = session();
        const res = await s.connexion({ username: 'admin', password: 'mot de passe' });
        expect(res).toMatchObject({ success: true, connecte: true, username: 'admin' });
        expect(JSON.stringify(res)).not.toContain('jeton-secret');
        expect(JSON.stringify(s.etat())).not.toContain('jeton-secret');
        const [url, options] = fetchImpl.mock.calls[0];
        expect(url).toBe('http://serveur:4000/api/admin/auth/login');
        expect(JSON.parse(options.body)).toEqual({ username: 'admin', password: 'mot de passe', scope: 'atelier' });
    });

    test('compte non administrateur, trop de tentatives, réponse sans portée : refus lisible', async () => {
        expect((await session({ login: reponse(403, { error: 'x' }) }).s.connexion({ username: 'u', password: 'p' })).error)
            .toBe('Ce compte n\'est pas administrateur.');
        expect((await session({ login: reponse(429, {}) }).s.connexion({ username: 'u', password: 'p' })).error)
            .toMatch(/Trop de tentatives/);
        // Un jeton complet (sans scope) n'est pas accepté par le poste
        const r = await session({ login: reponse(200, { token: 'complet', username: 'admin' }) }).s.connexion({ username: 'u', password: 'p' });
        expect(r.success).toBe(false);
    });

    test('champs invalides ou en trop refusés avant tout appel', async () => {
        const { s, fetchImpl } = session();
        expect((await s.connexion({ username: '', password: 'p' })).success).toBe(false);
        expect((await s.connexion({ username: 'a', password: 'p', scope: 'complet' })).success).toBe(false);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    test('serveur injoignable : message clair', async () => {
        const fetchImpl = async () => {
            throw new TypeError('Failed to fetch');
        };
        const s = createAtelierSession({ serverUrl: 'http://x', fetchImpl });
        expect((await s.connexion({ username: 'a', password: 'p' })).error).toMatch(/ne répond pas/);
    });
});

describe('écritures', () => {
    test('branding envoyé avec le jeton, seulement les champs validés', async () => {
        const { s, fetchImpl } = session();
        await s.connexion({ username: 'admin', password: 'p' });
        const res = await s.enregistrerBranding({ company_name: 'Atelier', logo: PNG, pdf_color: '#8A1C1C' });
        expect(res.success).toBe(true);
        const [url, options] = fetchImpl.mock.calls[1];
        expect(url).toBe('http://serveur:4000/api/admin/branding');
        expect(options.method).toBe('PUT');
        expect(options.headers.Authorization).toBe('Bearer jeton-secret');
        expect(JSON.parse(options.body)).toEqual({ company_name: 'Atelier', logo: PNG, pdf_color: '#8A1C1C' });
    });

    test('logo SVG, couleur mal formée, champ inconnu, types trop longs : refusés par zod', async () => {
        const { s, fetchImpl } = session();
        await s.connexion({ username: 'admin', password: 'p' });
        expect((await s.enregistrerBranding({ logo: 'data:image/svg+xml;base64,PHN2Zz4=' })).success).toBe(false);
        expect((await s.enregistrerBranding({ pdf_color: 'rouge' })).success).toBe(false);
        expect((await s.enregistrerBranding({ admin: true })).success).toBe(false);
        expect((await s.enregistrerBranding({})).success).toBe(false);
        expect((await s.enregistrerTypes({ types: ['x'.repeat(41)] })).success).toBe(false);
        expect((await s.enregistrerTypes({ types: Array.from({ length: 51 }, (_, i) => `T${i}`) })).success).toBe(false);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    test('sans session, session expirée, ou 401 et 403 du serveur : reconnexion demandée', async () => {
        const { s, avancer } = session();
        expect((await s.enregistrerTypes({ types: ['Portable'] })).code).toBe('reconnexion');
        await s.connexion({ username: 'admin', password: 'p' });
        avancer(3600 * 1000);
        expect((await s.enregistrerTypes({ types: ['Portable'] })).code).toBe('reconnexion');
        expect(s.etat().connecte).toBe(false);

        const refus = session({ ecriture: reponse(403, { error: 'Jeton limité' }) });
        await refus.s.connexion({ username: 'admin', password: 'p' });
        expect((await refus.s.enregistrerTypes({ types: ['Portable'] })).code).toBe('reconnexion');
        expect(refus.s.etat().connecte).toBe(false);
    });

    test('refus du serveur (400) : message du serveur, session gardée', async () => {
        const { s } = session({ ecriture: reponse(400, { error: 'Le type « A » est en double.' }) });
        await s.connexion({ username: 'admin', password: 'p' });
        const res = await s.enregistrerTypes({ types: ['A', 'a'] });
        expect(res).toEqual({ success: false, error: 'Le type « A » est en double.' });
        expect(s.etat().connecte).toBe(true);
    });

    test('déconnexion : plus aucune écriture possible', async () => {
        const { s } = session();
        await s.connexion({ username: 'admin', password: 'p' });
        s.deconnexion();
        expect((await s.enregistrerTypes({ types: ['Portable'] })).code).toBe('reconnexion');
    });
});
