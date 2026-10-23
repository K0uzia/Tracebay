/**
 * Licence côté poste (version serveur) : combinaison serveur et revérification, bandeaux,
 * écritures encore permises en lecture seule.
 */
jest.mock('../../config/api.js', () => ({ __esModule: true, default: { get: jest.fn() } }));

const { combinerEtat, bandeauPour, libelleEtat, lireLicence } = require('./LicenceStatus.js');
const { ecriturePermiseEnLectureSeule } = require('../../config/licenceEcriture.js');
const api = require('../../config/api.js').default;

const serveur = (etat, extra = {}) => ({
    success: true, etat, ecriture: ['active', 'expire_bientot', 'grace', 'non_activee'].includes(etat),
    entreprise: 'Atelier Nord', expire: '2026-12-01', fin_grace: '2026-12-16', jours_restants: 30, raison: null, cle: 'TB1.a.b', ...extra
});

describe('combinerEtat', () => {
    test('serveur et poste d\'accord', () => {
        expect(combinerEtat(serveur('active'), { ecriture: true, etat: 'active' })).toMatchObject({ etat: 'active', ecriture: true, entreprise: 'Atelier Nord' });
    });

    test('serveur modifié qui permet l\'écriture avec une clé que le poste juge expirée : contredit', () => {
        expect(combinerEtat(serveur('active'), { ecriture: false, etat: 'expiree' })).toMatchObject({ etat: 'expiree', ecriture: false });
    });

    test('exemption (aucune clé) : le serveur fait foi', () => {
        expect(combinerEtat(serveur('non_activee', { cle: null, entreprise: null }), null)).toMatchObject({ etat: 'non_activee', ecriture: true });
    });

    test('lecture seule annoncée par le serveur : jamais rétablie par le poste', () => {
        expect(combinerEtat(serveur('expiree'), { ecriture: true, etat: 'active' })).toMatchObject({ ecriture: false });
    });
});

describe('bandeaux', () => {
    test('rien pour une licence active ou non activée (mention discrète dans À propos seulement)', () => {
        expect(bandeauPour(combinerEtat(serveur('active'), null))).toBeNull();
        expect(bandeauPour(combinerEtat(serveur('non_activee', { cle: null }), null))).toBeNull();
        expect(libelleEtat(combinerEtat(serveur('non_activee', { cle: null }), null))).toBe('Licence non activée');
    });

    test('avertissement à 30 jours, avec la date', () => {
        const b = bandeauPour(combinerEtat(serveur('expire_bientot'), null));
        expect(b.niveau).toBe('info');
        expect(b.texte).toContain('01/12/2026');
        expect(b.texte).toContain('30 jours');
    });

    test('grâce : bandeau rouge avec la date de passage en lecture seule', () => {
        const b = bandeauPour(combinerEtat(serveur('grace'), null));
        expect(b.niveau).toBe('alerte');
        expect(b.texte).toContain('16/12/2026');
    });

    test('lecture seule : bandeau rouge qui rappelle ce qui reste possible', () => {
        for (const etat of ['expiree', 'absente', 'invalide', 'horloge']) {
            const b = bandeauPour(combinerEtat(serveur(etat), null));
            expect(b.niveau).toBe('alerte');
            expect(b.texte).toContain('lecture seule');
        }
    });

    test('aucun tiret cadratin ni demi-cadratin dans les textes', () => {
        for (const etat of ['expire_bientot', 'grace', 'expiree', 'absente', 'invalide', 'horloge']) {
            expect(bandeauPour(combinerEtat(serveur(etat), null)).texte).not.toMatch(/[\u2013\u2014]/);
        }
    });
});

describe('lireLicence', () => {
    afterEach(() => {
        delete window.electron;
        delete window.TRACEBAY_LICENCE;
    });

    test('revérifie la clé par le processus principal et publie l\'état', async () => {
        api.get.mockResolvedValue({ ok: true, json: async () => serveur('active') });
        window.electron = { invoke: jest.fn().mockResolvedValue({ ecriture: false, etat: 'invalide' }) };
        const etat = await lireLicence();
        expect(window.electron.invoke).toHaveBeenCalledWith('verify-licence', { cle: 'TB1.a.b' });
        expect(etat).toMatchObject({ etat: 'invalide', ecriture: false });
        expect(window.TRACEBAY_LICENCE).toBe(etat);
    });
});

describe('écritures permises en lecture seule', () => {
    const S = 'http://192.0.2.10:4000';
    test.each([
        ['GET', `${S}/api/lots`, null, true],
        ['DELETE', `${S}/api/dons/4`, null, true],
        ['DELETE', `${S}/api/prets-materiel/9`, null, true],
        ['DELETE', `${S}/api/agenda/events/abc`, null, true],
        ['POST', `${S}/api/lots/technicians/anonymize`, { name: 'X' }, true],
        ['POST', `${S}/api/auth/login`, {}, true],
        ['PUT', `${S}/api/dons/4`, { pdf_path: '/a.pdf' }, true],
        ['PUT', `${S}/api/dons/4`, { pdf_path: '/a.pdf', lot_name: 'x' }, false],
        ['POST', `${S}/api/lots`, {}, false],
        ['DELETE', `${S}/api/lots/3`, null, false],
        ['POST', `${S}/api/dons`, {}, false]
    ])('%s %s', (method, url, body, attendu) => {
        expect(ecriturePermiseEnLectureSeule(method, url, body)).toBe(attendu);
    });
});
