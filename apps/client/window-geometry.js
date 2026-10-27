/**
 * Géométrie de la fenêtre principale et plateforme d'affichage Linux (Wayland natif ou XWayland).
 * Sous Wayland, une fenêtre ne choisit pas sa position, et une taille ou un minimum plus grands que
 * la zone de travail (écran mis à l'échelle, 1920 x 1080 à 150 % = 1280 x 720) donnent une
 * géométrie refusée par le compositeur. Sans import Electron : testé avec Jest.
 */

const entier = (n) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

/**
 * Taille initiale et minimum ramenés dans la zone de travail { width, height } de l'écran.
 * Zone illisible (0, NaN) : valeurs demandées telles quelles. Jamais de position (x, y).
 */
function tailleFenetre({ zone, voulue, minimum }) {
    const zw = entier(zone?.width);
    const zh = entier(zone?.height);
    if (!zw || !zh) {
        const { width, height } = voulue;
        return { width, height, minWidth: minimum.width, minHeight: minimum.height };
    }
    const minWidth = Math.min(minimum.width, zw);
    const minHeight = Math.min(minimum.height, zh);
    return {
        width: Math.max(minWidth, Math.min(voulue.width, zw)),
        height: Math.max(minHeight, Math.min(voulue.height, zh)),
        minWidth,
        minHeight
    };
}

/** Session graphique Wayland (variables posées par GNOME, KDE…). */
function sessionWayland(env) {
    return env?.XDG_SESSION_TYPE === 'wayland' || Boolean(env?.WAYLAND_DISPLAY);
}

/**
 * Plateforme Ozone à imposer avant « ready », ou null pour laisser Electron choisir :
 * --ozone-platform déjà passé : respecté ; TRACEBAY_OZONE_PLATFORM=x11|wayland : appliqué ;
 * forcerXWayland et session Wayland : x11. Rien hors Linux, rien sous X11.
 */
function choisirPlateformeOzone({ platform, env, switchActuel, forcerXWayland }) {
    if (platform !== 'linux' || switchActuel) {
        return null;
    }
    const demande = String(env?.TRACEBAY_OZONE_PLATFORM || '').trim().toLowerCase();
    if (demande === 'x11' || demande === 'wayland') {
        return demande;
    }
    return forcerXWayland && sessionWayland(env) ? 'x11' : null;
}

module.exports = { tailleFenetre, sessionWayland, choisirPlateformeOzone };
