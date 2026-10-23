/**
 * État de la licence de l'atelier, côté poste (version serveur).
 * La licence se saisit sur le serveur ; le poste la lit (GET /api/licence), revérifie la signature
 * avec sa propre clé publique (IPC verify-licence) et affiche un bandeau si besoin.
 */
import api from '../../config/api.js';

const NB = '\u00a0';

function jourFr(jour) {
    return jour ? `${jour.slice(8, 10)}/${jour.slice(5, 7)}/${jour.slice(0, 4)}` : '';
}

/**
 * Combine la réponse du serveur et la revérification locale. Un serveur modifié qui annoncerait
 * « écriture permise » avec une clé que le poste juge invalide ou expirée est contredit.
 */
export function combinerEtat(serveur, local) {
    if (!serveur) {
        return null;
    }
    const contredit = Boolean(serveur.cle && local && serveur.ecriture && !local.ecriture);
    return {
        etat: contredit ? local.etat : serveur.etat,
        ecriture: contredit ? false : Boolean(serveur.ecriture),
        entreprise: serveur.entreprise || null,
        expire: serveur.expire || null,
        finGrace: serveur.fin_grace || null,
        joursRestants: typeof serveur.jours_restants === 'number' ? serveur.jours_restants : null
    };
}

const SUITE = 'Votre administrateur peut saisir une clé sur le serveur (page de monitoring, onglet Licence).';
const POSSIBLE = 'Consultation, PDF et suppression de données personnelles restent possibles.';

/** Bandeau à afficher, ou null. niveau : info (avertissement) ou alerte (rouge). */
export function bandeauPour(etat) {
    if (!etat) {
        return null;
    }
    const jours = etat.joursRestants === 1 ? '1 jour' : `${etat.joursRestants} jours`;
    switch (etat.etat) {
        case 'expire_bientot':
            return { niveau: 'info', texte: `Licence Tracebay${NB}: elle expire le ${jourFr(etat.expire)} (dans ${jours}). Pensez à la renouveler auprès de Kouzia.` };
        case 'grace':
            return { niveau: 'alerte', texte: `Licence expirée le ${jourFr(etat.expire)}${NB}: Tracebay passera en lecture seule après le ${jourFr(etat.finGrace)}. ${SUITE}` };
        case 'expiree':
            return { niveau: 'alerte', texte: `Licence expirée le ${jourFr(etat.expire)}${NB}: Tracebay est en lecture seule. ${POSSIBLE} ${SUITE}` };
        case 'horloge':
            return { niveau: 'alerte', texte: `La date du serveur a reculé${NB}: Tracebay est en lecture seule. ${POSSIBLE}` };
        case 'invalide':
            return { niveau: 'alerte', texte: `Licence invalide${NB}: Tracebay est en lecture seule. ${POSSIBLE} ${SUITE}` };
        case 'absente':
            return { niveau: 'alerte', texte: `Aucune licence activée${NB}: Tracebay est en lecture seule. ${POSSIBLE} ${SUITE}` };
        default:
            return null;
    }
}

/** Libellé court pour Paramètres > À propos. */
export function libelleEtat(etat) {
    if (!etat) {
        return 'Serveur injoignable';
    }
    return {
        active: 'Active',
        expire_bientot: 'Active, expire bientôt',
        grace: 'Expirée, écriture encore possible',
        expiree: 'Expirée (lecture seule)',
        horloge: 'Horloge du serveur reculée (lecture seule)',
        invalide: 'Clé invalide (lecture seule)',
        absente: 'Aucune licence (lecture seule)',
        non_activee: 'Licence non activée'
    }[etat.etat] || etat.etat;
}

export async function lireLicence() {
    const res = await api.get('/api/licence', { useCache: false });
    if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
    }
    const serveur = await res.json();
    let local = null;
    if (serveur.cle && window.electron?.invoke) {
        try {
            local = await window.electron.invoke('verify-licence', { cle: serveur.cle });
        } catch (_) {
            local = null;
        }
    }
    const etat = combinerEtat(serveur, local);
    window.TRACEBAY_LICENCE = etat;
    return etat;
}

function afficherBandeau(etat) {
    let el = document.getElementById('licenceBanner');
    if (!el) {
        el = document.createElement('div');
        el.id = 'licenceBanner';
        el.className = 'licence-banner';
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'polite');
        const header = document.getElementById('header');
        if (header?.parentNode) {
            header.parentNode.insertBefore(el, header.nextSibling);
        } else {
            document.body.prepend(el);
        }
    }
    const b = bandeauPour(etat);
    el.hidden = !b;
    el.textContent = b ? b.texte : '';
    el.classList.toggle('licence-banner--alerte', b?.niveau === 'alerte');
}

/** Au démarrage, puis après chaque refus 423 du serveur. Aucune interrogation périodique. */
export async function demarrerLicence() {
    const rafraichir = async () => {
        try {
            afficherBandeau(await lireLicence());
        } catch (_) {
            // Serveur injoignable : pas de bandeau, le serveur reste seul juge des écritures
        }
    };
    window.addEventListener('licence-lecture-seule', (e) => {
        window.app?.showNotification?.(e.detail?.message || 'Tracebay est en lecture seule.', 'error');
        rafraichir();
    });
    await rafraichir();
}
