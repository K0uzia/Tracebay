/**
 * Mode d'affichage Linux réparé automatiquement : échelle du plus natif au plus sûr
 * (natif, sans GPU, XWayland, XWayland sans GPU). Un échec au démarrage fait descendre d'un cran
 * par une relance unique ; le mode qui marche est gardé dans <userData>/affichage.json pour la
 * version en cours, et une nouvelle version de Tracebay repart du natif.
 * Sans import Electron : testé avec Jest.
 */
const fs = require('fs');
const path = require('path');

const MODES = {
    natif: { ozone: null, sansGpu: false },
    'sans-gpu': { ozone: null, sansGpu: true },
    xwayland: { ozone: 'x11', sansGpu: false },
    'xwayland-sans-gpu': { ozone: 'x11', sansGpu: true }
};
const MARQUEUR = '--tracebay-affichage';

/** Modes essayés dans l'ordre : XWayland seulement sur une session Wayland où il est installé. */
function echelle({ wayland, xwayland }) {
    const modes = ['natif', 'sans-gpu'];
    return wayland && xwayland ? [...modes, 'xwayland', 'xwayland-sans-gpu'] : modes;
}

/** Mode du lancement : celui gardé pour cette version s'il est encore possible, sinon natif. */
function modeDepart({ etat, version, modes }) {
    return etat?.version === version && modes.includes(etat?.mode) ? etat.mode : 'natif';
}

/** Cran suivant après un échec, ou null en bas de l'échelle. */
function modeSuivant(mode, modes) {
    const i = modes.indexOf(mode);
    return i >= 0 && i < modes.length - 1 ? modes[i + 1] : null;
}

/**
 * Mode du processus courant d'après sa ligne de commande : marqueur posé par une relance de
 * Tracebay, sinon natif sans option ; --ozone-platform ou --disable-gpu passés à la main : null
 * (choix de l'utilisateur, pas de réparation automatique).
 */
function modeCourant(argv) {
    const marque = argv.find((a) => a.startsWith(`${MARQUEUR}=`));
    if (marque) {
        const mode = marque.slice(MARQUEUR.length + 1);
        return MODES[mode] ? mode : null;
    }
    const manuel = argv.some((a) => a === '--disable-gpu' || a.startsWith('--ozone-platform'));
    return manuel ? null : 'natif';
}

/** Arguments de relance dans un mode : anciennes options d'affichage retirées, marqueur ajouté. */
function argumentsPour(mode, argv) {
    const reste = argv.filter((a) => a !== '--disable-gpu' && !a.startsWith('--ozone-platform')
        && !a.startsWith(`${MARQUEUR}=`));
    const { ozone, sansGpu } = MODES[mode];
    return [
        ...reste,
        ...(ozone ? [`--ozone-platform=${ozone}`] : []),
        ...(sansGpu ? ['--disable-gpu'] : []),
        `${MARQUEUR}=${mode}`
    ];
}

function lireEtat(fichier) {
    try {
        const etat = JSON.parse(fs.readFileSync(fichier, 'utf8'));
        return etat && typeof etat === 'object' ? etat : null;
    } catch (_) {
        return null;
    }
}

function ecrireEtat(fichier, etat) {
    try {
        fs.mkdirSync(path.dirname(fichier), { recursive: true });
        const temporaire = `${fichier}.${process.pid}.tmp`;
        fs.writeFileSync(temporaire, `${JSON.stringify(etat, null, 2)}\n`, 'utf8');
        fs.renameSync(temporaire, fichier);
        return true;
    } catch (_) {
        return false;
    }
}

module.exports = {
    MODES, echelle, modeDepart, modeSuivant, modeCourant, argumentsPour, lireEtat, ecrireEtat
};
