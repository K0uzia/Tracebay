/**
 * Mode d'affichage Linux réparé automatiquement (module pur display-mode.js).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    echelle, modeDepart, modeSuivant, modeCourant, argumentsPour, lireEtat, ecrireEtat
} = require('../display-mode');

const TOUS = ['natif', 'sans-gpu', 'xwayland', 'xwayland-sans-gpu'];

describe('échelle des modes', () => {
    test('XWayland seulement sur une session Wayland où il est installé', () => {
        expect(echelle({ wayland: true, xwayland: true })).toEqual(TOUS);
        expect(echelle({ wayland: true, xwayland: false })).toEqual(['natif', 'sans-gpu']);
        expect(echelle({ wayland: false, xwayland: true })).toEqual(['natif', 'sans-gpu']);
    });

    test('cran suivant, puis fin de l\'échelle', () => {
        expect(modeSuivant('natif', TOUS)).toBe('sans-gpu');
        expect(modeSuivant('sans-gpu', TOUS)).toBe('xwayland');
        expect(modeSuivant('xwayland-sans-gpu', TOUS)).toBeNull();
        expect(modeSuivant('sans-gpu', ['natif', 'sans-gpu'])).toBeNull();
        expect(modeSuivant('inconnu', TOUS)).toBeNull();
    });
});

describe('modeDepart', () => {
    test('mode gardé pour la même version', () => {
        expect(modeDepart({ etat: { version: '3.8.1', mode: 'xwayland' }, version: '3.8.1', modes: TOUS }))
            .toBe('xwayland');
    });

    test('nouvelle version, état absent ou mode devenu impossible : natif', () => {
        expect(modeDepart({ etat: { version: '3.8.0', mode: 'sans-gpu' }, version: '3.8.1', modes: TOUS }))
            .toBe('natif');
        expect(modeDepart({ etat: null, version: '3.8.1', modes: TOUS })).toBe('natif');
        const sansXWayland = ['natif', 'sans-gpu'];
        const etat = { version: '3.8.1', mode: 'xwayland' };
        expect(modeDepart({ etat, version: '3.8.1', modes: sansXWayland }))
            .toBe('natif');
    });
});

describe('ligne de commande', () => {
    test('modeCourant : marqueur, natif sans option, choix manuel', () => {
        expect(modeCourant(['/opt/Tracebay/workspace', '--tracebay-affichage=sans-gpu', '--disable-gpu']))
            .toBe('sans-gpu');
        expect(modeCourant(['/opt/Tracebay/workspace'])).toBe('natif');
        expect(modeCourant(['/opt/Tracebay/workspace', '--disable-gpu'])).toBeNull();
        expect(modeCourant(['/opt/workspace', '--ozone-platform=x11'])).toBeNull();
        expect(modeCourant(['/opt/Tracebay/workspace', '--tracebay-affichage=bidon'])).toBeNull();
    });

    test('argumentsPour : options précédentes remplacées, autres arguments gardés', () => {
        const argv = ['--ozone-platform=x11', '--disable-gpu', '--tracebay-affichage=xwayland-sans-gpu', '--x'];
        expect(argumentsPour('natif', argv)).toEqual(['--x', '--tracebay-affichage=natif']);
        expect(argumentsPour('sans-gpu', ['--x'])).toEqual(['--x', '--disable-gpu', '--tracebay-affichage=sans-gpu']);
        expect(argumentsPour('xwayland-sans-gpu', []))
            .toEqual(['--ozone-platform=x11', '--disable-gpu', '--tracebay-affichage=xwayland-sans-gpu']);
    });

    test('une relance dans un mode est reconnue au lancement suivant (pas de boucle)', () => {
        for (const mode of TOUS) {
            expect(modeCourant(['/opt/Tracebay/workspace', ...argumentsPour(mode, [])])).toBe(mode);
        }
    });
});

describe('fichier d\'état', () => {
    let dossier;
    beforeEach(() => {
        dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'tracebay-affichage-'));
    });
    afterEach(() => fs.rmSync(dossier, { recursive: true, force: true }));

    test('écriture puis lecture ; absent ou illisible : null', () => {
        const f = path.join(dossier, 'sous', 'affichage.json');
        expect(lireEtat(f)).toBeNull();
        expect(ecrireEtat(f, { version: '3.8.1', mode: 'sans-gpu' })).toBe(true);
        expect(lireEtat(f)).toEqual({ version: '3.8.1', mode: 'sans-gpu' });
        expect(fs.readdirSync(path.dirname(f))).toEqual(['affichage.json']);
        fs.writeFileSync(f, 'abîmé');
        expect(lireEtat(f)).toBeNull();
    });
});
