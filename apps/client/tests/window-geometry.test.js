/**
 * Géométrie de la fenêtre principale et plateforme Linux (module pur window-geometry.js).
 */
const { tailleFenetre, sessionWayland, choisirPlateformeOzone } = require('../window-geometry');

const VOULUE = { width: 1280, height: 800 };
const MINIMUM = { width: 960, height: 600 };
const taille = (zone) => tailleFenetre({ zone, voulue: VOULUE, minimum: MINIMUM });
const ozone = (options) => choisirPlateformeOzone({ platform: 'linux', ...options });
const WAYLAND = { XDG_SESSION_TYPE: 'wayland' };

describe('tailleFenetre', () => {
    test('grand écran : taille et minimum demandés', () => {
        expect(taille({ width: 2560, height: 1400 }))
            .toEqual({ width: 1280, height: 800, minWidth: 960, minHeight: 600 });
    });

    test('1920 x 1080 à 150 % (zone 1280 x 688) : hauteur ramenée dans la zone', () => {
        expect(taille({ width: 1280, height: 688 }))
            .toEqual({ width: 1280, height: 688, minWidth: 960, minHeight: 600 });
    });

    test('zone plus petite que le minimum : minimum abaissé, jamais au-delà de la zone', () => {
        expect(taille({ width: 960, height: 508 }))
            .toEqual({ width: 960, height: 508, minWidth: 960, minHeight: 508 });
        expect(taille({ width: 800, height: 500 }))
            .toEqual({ width: 800, height: 500, minWidth: 800, minHeight: 500 });
    });

    test('zone illisible (0, NaN, négative, absente) : valeurs demandées', () => {
        const attendu = { width: 1280, height: 800, minWidth: 960, minHeight: 600 };
        const zones = [{ width: 0, height: 0 }, { width: NaN, height: 700 }];
        zones.push({ width: -5, height: 900 });
        for (const zone of [...zones, null, undefined]) {
            expect(taille(zone)).toEqual(attendu);
        }
    });

    test('dimensions entières et taille jamais sous le minimum', () => {
        const t = taille({ width: 1100.7, height: 650.4 });
        expect(t).toEqual({ width: 1100, height: 650, minWidth: 960, minHeight: 600 });
        expect(t.width).toBeGreaterThanOrEqual(t.minWidth);
        expect(t.height).toBeGreaterThanOrEqual(t.minHeight);
    });
});

describe('plateforme Linux', () => {
    test('sessionWayland', () => {
        expect(sessionWayland(WAYLAND)).toBe(true);
        expect(sessionWayland({ WAYLAND_DISPLAY: 'wayland-0' })).toBe(true);
        expect(sessionWayland({ XDG_SESSION_TYPE: 'x11', DISPLAY: ':0' })).toBe(false);
        expect(sessionWayland(undefined)).toBe(false);
    });

    test('X11 et autres systèmes inchangés', () => {
        expect(ozone({ env: { XDG_SESSION_TYPE: 'x11' }, forcerXWayland: true })).toBeNull();
        expect(choisirPlateformeOzone({ platform: 'win32', env: { TRACEBAY_OZONE_PLATFORM: 'x11' } }))
            .toBeNull();
    });

    test('variable TRACEBAY_OZONE_PLATFORM, puis repli XWayland', () => {
        expect(ozone({ env: { ...WAYLAND, TRACEBAY_OZONE_PLATFORM: 'X11' } })).toBe('x11');
        expect(ozone({ env: { ...WAYLAND, TRACEBAY_OZONE_PLATFORM: 'wayland' }, forcerXWayland: true }))
            .toBe('wayland');
        expect(ozone({ env: { ...WAYLAND, TRACEBAY_OZONE_PLATFORM: 'autre' } })).toBeNull();
        expect(ozone({ env: WAYLAND, forcerXWayland: true })).toBe('x11');
        expect(ozone({ env: WAYLAND, forcerXWayland: false })).toBeNull();
    });

    test('--ozone-platform passé à la main toujours respecté', () => {
        const env = { ...WAYLAND, TRACEBAY_OZONE_PLATFORM: 'x11' };
        expect(ozone({ env, switchActuel: 'wayland', forcerXWayland: true })).toBeNull();
    });
});
