/**
 * En-tête des PDF : nom et logo de l'atelier (module pur branding.js).
 */
const fs = require('fs');
const path = require('path');
const { applyBranding, sanitizeBranding, createBrandingCache, LOGO_MAX_BYTES } = require('../branding');

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const dataUrl = (mime, b) => `data:${mime};base64,${b.toString('base64')}`;
const TEMPLATE = '<header>{{company_logo}}<h2>{{company_name}}</h2></header><h1>{{company_name}}</h1>';

describe('sanitizeBranding', () => {
    test('sans réglage : « Tracebay », sans logo', () => {
        expect(sanitizeBranding(null)).toEqual({ name: 'Tracebay', logo: null });
        expect(sanitizeBranding({ company_name: '   ' })).toEqual({ name: 'Tracebay', logo: null });
    });

    test('logo PNG ou JPEG gardé, type déduit des octets', () => {
        expect(sanitizeBranding({ company_name: 'A', logo: dataUrl('image/png', PNG) }).logo).toMatch(/^data:image\/png;base64,/);
        expect(sanitizeBranding({ company_name: 'A', logo: dataUrl('image/png', JPEG) }).logo).toMatch(/^data:image\/jpeg;base64,/);
    });

    test('SVG, image déguisée, trop lourde ou autre URL : logo retiré', () => {
        expect(sanitizeBranding({ logo: dataUrl('image/svg+xml', SVG) }).logo).toBeNull();
        expect(sanitizeBranding({ logo: dataUrl('image/png', SVG) }).logo).toBeNull();
        expect(sanitizeBranding({ logo: dataUrl('image/png', Buffer.concat([PNG, Buffer.alloc(LOGO_MAX_BYTES)])) }).logo).toBeNull();
        expect(sanitizeBranding({ logo: 'https://exemple.test/logo.png' }).logo).toBeNull();
        expect(sanitizeBranding({ logo: 'file:///etc/passwd' }).logo).toBeNull();
    });

    test('nom borné à 120 caractères, caractères de contrôle retirés', () => {
        expect(sanitizeBranding({ company_name: 'Atelier\u0007 X' }).name).toBe('Atelier X');
        expect(sanitizeBranding({ company_name: 'x'.repeat(200) }).name).toHaveLength(120);
    });
});

describe('applyBranding', () => {
    test('nom et logo insérés à chaque marqueur', () => {
        const html = applyBranding(TEMPLATE, { name: 'LA CAPSULE', logo: dataUrl('image/png', PNG) });
        expect(html).toContain('<img src="data:image/png;base64,');
        expect(html).toContain('alt="LA CAPSULE"');
        expect(html.match(/LA CAPSULE/g)).toHaveLength(3);
        expect(html).not.toContain('{{');
    });

    test('sans logo : emplacement retiré, nom par défaut', () => {
        expect(applyBranding(TEMPLATE, null)).toBe('<header><h2>Tracebay</h2></header><h1>Tracebay</h1>');
    });

    test('nom échappé : aucune balise injectée', () => {
        const html = applyBranding(TEMPLATE, { name: '<img src=x onerror=alert(1)>$&' });
        expect(html).not.toContain('<img src=x');
        expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;$&amp;');
    });

    test('les 5 gabarits livrés ne contiennent plus de logo ni de nom en dur', () => {
        const dir = path.join(__dirname, '..', 'public', 'pdf-templates');
        for (const f of ['lot.html', 'dons.html', 'prets-materiel.html', 'commande.html', 'disques.html']) {
            const tpl = fs.readFileSync(path.join(dir, f), 'utf8');
            expect(tpl).toContain('{{company_logo}}');
            expect(tpl).toContain('{{company_name}}');
            expect(tpl).not.toMatch(/capsule\.png|LA CAPSULE/i);
            expect(applyBranding(tpl, null)).not.toContain('{{company_');
        }
    });
});

describe('createBrandingCache', () => {
    const ok = (body) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

    test('un seul appel réseau pendant la durée du cache', async () => {
        const fetchImpl = jest.fn(() => ok({ company_name: 'LA CAPSULE', logo: null }));
        let t = 0;
        const cache = createBrandingCache({ url: 'http://serveur/api/branding', fetchImpl, ttlMs: 1000, now: () => t });
        expect((await cache.get()).name).toBe('LA CAPSULE');
        t = 500;
        await cache.get();
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        t = 2000;
        await cache.get();
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    test('serveur injoignable : dernier réglage connu, sinon valeur par défaut', async () => {
        let t = 0;
        const fetchImpl = jest.fn()
            .mockImplementationOnce(() => ok({ company_name: 'LA CAPSULE' }))
            .mockImplementation(() => Promise.reject(new Error('réseau coupé')));
        const cache = createBrandingCache({ url: 'u', fetchImpl, ttlMs: 10, now: () => t });
        await cache.get();
        t = 100;
        expect((await cache.get()).name).toBe('LA CAPSULE');

        const empty = createBrandingCache({ url: 'u', fetchImpl: () => Promise.resolve({ ok: false, status: 500 }) });
        expect(await empty.get()).toEqual({ name: 'Tracebay', logo: null });
    });
});
