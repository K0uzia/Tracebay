/**
 * Géométrie de la fenêtre principale et plateforme d'affichage Linux (Wayland natif ou XWayland).
 * Taille d'ouverture proportionnelle à l'écran, jamais plus grande que lui, sans position imposée
 * (sous Wayland, la fenêtre ne choisit pas sa position). Sans import Electron : testé avec Jest.
 */

const entier = (n) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

/**
 * Taille d'ouverture adaptée à l'écran : une part (proportion) de la zone de travail { width,
 * height }, bornée entre le minimum et le maximum. Zone plus petite que le minimum : minimum
 * ramené à la zone et fenêtre maximisée. Zone illisible (0, NaN) : taille de repli.
 * Jamais de position (x, y) : le gestionnaire de fenêtres la choisit.
 */
function tailleFenetre({ zone, minimum, maximum, proportion, repli }) {
    const zw = entier(zone?.width);
    const zh = entier(zone?.height);
    if (!zw || !zh) {
        return { ...repli, minWidth: minimum.width, minHeight: minimum.height, maximiser: false };
    }
    const maximiser = zw < minimum.width || zh < minimum.height;
    const minWidth = Math.min(minimum.width, zw);
    const minHeight = Math.min(minimum.height, zh);
    const borne = (part, min, max, dispo) => {
        return Math.min(dispo, Math.max(min, Math.min(max, Math.floor(part))));
    };
    return {
        width: borne(zw * proportion, minWidth, maximum.width, zw),
        height: borne(zh * proportion, minHeight, maximum.height, zh),
        minWidth,
        minHeight,
        maximiser
    };
}

/** Session graphique Wayland (variables posées par GNOME, KDE…). */
function sessionWayland(env) {
    return env?.XDG_SESSION_TYPE === 'wayland' || Boolean(env?.WAYLAND_DISPLAY);
}

/**
 * Plateforme Ozone à demander (par relance avec --ozone-platform), ou null pour garder celle
 * d'Electron : --ozone-platform déjà passé : respecté ; TRACEBAY_OZONE_PLATFORM=x11|wayland :
 * appliqué ; forcerXWayland, session Wayland, XWayland installé (xwayland) et actif (DISPLAY) :
 * x11. Rien hors Linux, rien sous X11.
 */
function choisirPlateformeOzone({ platform, env, switchActuel, forcerXWayland, xwayland = true }) {
    if (platform !== 'linux' || switchActuel) {
        return null;
    }
    const demande = String(env?.TRACEBAY_OZONE_PLATFORM || '').trim().toLowerCase();
    if (demande === 'x11' || demande === 'wayland') {
        return demande;
    }
    const repli = forcerXWayland && xwayland && sessionWayland(env) && env?.XDG_SESSION_TYPE !== 'x11';
    return repli && env?.DISPLAY ? 'x11' : null;
}

module.exports = { tailleFenetre, sessionWayland, choisirPlateformeOzone };
