/**
 * Vérification des clés TB1 : vecteurs communs avec le serveur, puis cas propres au client.
 */
const crypto = require('crypto');
const { verifierLicence, jourParis, JOURS_GRACE_APRES_EXPIRATION } = require('../licence');
const CLE_PUBLIQUE_PRODUCTION = require('../licence-cle-publique');
const vecteurs = require('./licence-vecteurs.json');

describe('vecteurs communs client et serveur', () => {
    test.each(vecteurs.vecteurs.map((v) => [v.nom, v]))('%s', (_nom, v) => {
        const r = verifierLicence({
            cle: v.cle,
            clePublique: vecteurs.clePubliqueTest,
            aujourdhui: v.aujourdhui,
            derniereDateVue: v.derniereDateVue || null
        });
        expect(r).toMatchObject(v.attendu);
    });
});

describe('clé publique de production', () => {
    test('Ed25519, SPKI de 44 octets', () => {
        const k = crypto.createPublicKey({ key: Buffer.from(CLE_PUBLIQUE_PRODUCTION, 'base64'), format: 'der', type: 'spki' });
        expect(k.asymmetricKeyType).toBe('ed25519');
        expect(Buffer.from(CLE_PUBLIQUE_PRODUCTION, 'base64')).toHaveLength(44);
    });

    test('une clé signée par la paire de test est refusée par la clé de production', () => {
        const v = vecteurs.vecteurs[0];
        const r = verifierLicence({
            cle: v.cle, clePublique: CLE_PUBLIQUE_PRODUCTION, aujourdhui: v.aujourdhui
        });
        expect(r).toMatchObject({ valide: false, ecriture: false, raison: 'signature' });
    });
});

describe('outils de date', () => {
    test('jour de Paris, y compris autour de minuit UTC', () => {
        expect(jourParis(new Date('2026-07-01T22:30:00Z'))).toBe('2026-07-02');
        expect(jourParis(new Date('2026-12-31T22:59:59Z'))).toBe('2026-12-31');
        expect(jourParis(new Date('2026-12-31T23:00:00Z'))).toBe('2027-01-01');
    });

    test('la grâce après expiration est un paramètre (15 jours)', () => {
        expect(JOURS_GRACE_APRES_EXPIRATION).toBe(15);
    });

    test('une clé publique illisible ne fait pas planter la vérification', () => {
        const v = vecteurs.vecteurs[0];
        expect(verifierLicence({ cle: v.cle, clePublique: 'pas une clé', aujourdhui: v.aujourdhui }).raison).toBe('signature');
    });
});
