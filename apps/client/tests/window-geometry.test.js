/**
 * Géométrie de la fenêtre principale et plateforme Linux (module pur window-geometry.js).
 */
const { tailleFenetre, sessionWayland, choisirPlateformeOzone } = require('../window-geometry');

const MINIMUM = { width: 960, height: 600 };
const taille = (zone) => tailleFenetre({
    zone,
    minimum: MINIMUM,
    maximum: { width: 1600, height: 1000 },
    proportion: 0.85,
    repli: { width: 1280, height: 800 }
});
const ozone = (options) => choisirPlateformeOzone({ platform: 'linux', ...options });
const WAYLAND = { XDG_SESSION_TYPE: 'wayland', WAYLAND_DISPLAY: 'wayland-0', DISPLAY: ':0' };
const fenetre = (width, height, minWidth, minHeight, maximiser = false) => ({
    width, height, minWidth, minHeight, maximiser
});

describe('tailleFenetre', () => {
    test('85 % de la zone de travail (1440 x 900 sous GNOME : zone 1440 x 868)', () => {
        expect(taille({ width: 1440, height: 868 })).toEqual(fenetre(1224, 737, 960, 600));
        expect(taille({ width: 1366, height: 736 })).toEqual(fenetre(1161, 625, 960, 600));
    });

    test('grand écran : plafonnée à 1600 x 1000', () => {
        expect(taille({ width: 2560, height: 1400 })).toEqual(fenetre(1600, 1000, 960, 600));
    });

    test('85 % sous le minimum : relevée au minimum, sans dépasser la zone', () => {
        expect(taille({ width: 1280, height: 688 })).toEqual(fenetre(1088, 600, 960, 600));
        expect(taille({ width: 1024, height: 736 })).toEqual(fenetre(960, 625, 960, 600));
    });

    test('zone plus petite que le minimum : minimum ramené à la zone, fenêtre maximisée', () => {
        expect(taille({ width: 800, height: 568 })).toEqual(fenetre(800, 568, 800, 568, true));
        expect(taille({ width: 1280, height: 560 })).toEqual(fenetre(1088, 560, 960, 560, true));
    });

    test('zone illisible (0, NaN, négative, absente) : taille de repli', () => {
        const zones = [{ width: 0, height: 0 }, { width: NaN, height: 700 }];
        zones.push({ width: -5, height: 900 });
        for (const zone of [...zones, null, undefined]) {
            expect(taille(zone)).toEqual(fenetre(1280, 800, 960, 600));
        }
    });

    test('dimensions entières, jamais sous le minimum ni au-delà de la zone', () => {
        for (const [w, h] of [[1100.7, 650.4], [1920, 1048], [3840, 2120], [961, 601]]) {
            const t = taille({ width: w, height: h });
            expect(Number.isInteger(t.width) && Number.isInteger(t.height)).toBe(true);
            expect(t.width).toBeGreaterThanOrEqual(t.minWidth);
            expect(t.height).toBeGreaterThanOrEqual(t.minHeight);
            expect(t.width).toBeLessThanOrEqual(w);
            expect(t.height).toBeLessThanOrEqual(h);
        }
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
        expect(ozone({ env: { XDG_SESSION_TYPE: 'x11', DISPLAY: ':0' }, forcerXWayland: true })).toBeNull();
        const x11AvecSocket = { XDG_SESSION_TYPE: 'x11', DISPLAY: ':0', WAYLAND_DISPLAY: 'wayland-0' };
        expect(ozone({ env: x11AvecSocket, forcerXWayland: true })).toBeNull();
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

    test('repli XWayland seulement si XWayland est là (DISPLAY)', () => {
        const sansXWayland = { XDG_SESSION_TYPE: 'wayland', WAYLAND_DISPLAY: 'wayland-0' };
        expect(ozone({ env: sansXWayland, forcerXWayland: true })).toBeNull();
        // Rocky Linux 10 minimal : paquet xorg-x11-server-Xwayland absent
        expect(ozone({ env: WAYLAND, forcerXWayland: true, xwayland: false })).toBeNull();
        expect(ozone({ env: WAYLAND, forcerXWayland: true, xwayland: true })).toBe('x11');
    });

    test('--ozone-platform passé à la main toujours respecté', () => {
        const env = { ...WAYLAND, TRACEBAY_OZONE_PLATFORM: 'x11' };
        expect(ozone({ env, switchActuel: 'wayland', forcerXWayland: true })).toBeNull();
    });
});
