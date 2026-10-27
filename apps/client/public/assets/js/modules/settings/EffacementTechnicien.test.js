/**
 * Effacement du nom d'un technicien (édition serveur) : réservé à un administrateur, envoyé par le
 * processus principal avec le jeton « atelier » (le renderer ne voit jamais de jeton).
 */
jest.mock('../../config/api.js', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));

const { afficherEffacementTechnicien, elements, nomAffiche, messageErreur } = require('./EffacementTechnicien.js');
const api = require('../../config/api.js').default;

const reponse = (status, body) => ({
    ok: status >= 200 && status < 300, status, json: async () => body
});
const liste = (technicians) => api.get.mockResolvedValueOnce(reponse(200, { technicians }));

let parent;
let container;
let invoke;
let effacer;
const SESSION = { success: true, connecte: true, username: 'admin', expiresAt: Date.now() + 3600000 };
function poste({ session = SESSION } = {}) {
    effacer = jest.fn(async () => ({ success: true, data: { success: true, anonymises: 3 } }));
    invoke = jest.fn(async (canal, payload) => {
        if (canal === 'atelier:etat') {
            return session;
        }
        if (canal === 'atelier:anonymiser-technicien') {
            return effacer(payload);
        }
        return { success: true };
    });
    window.electron = { invoke };
}
beforeEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '<div id="modal"><div id="bloc"></div></div>';
    parent = document.getElementById('modal');
    container = document.getElementById('bloc');
    poste();
});

const $ = (sel) => container.querySelector(sel);

describe('fonctions pures', () => {
    test('elements : singulier, pluriel, milliers en français', () => {
        expect(elements(1)).toBe('1 élément');
        expect(elements(2)).toBe('2 éléments');
        expect(elements(1234)).toBe(`${(1234).toLocaleString('fr-FR')} éléments`);
        expect(elements(1234)).not.toBe('1234 éléments');
    });

    test('nomAffiche : espaces en trop rendus visibles, nom propre inchangé', () => {
        expect(nomAffiche('Paul Martin')).toBe('Paul Martin');
        expect(nomAffiche(' Paul Martin ')).toBe('\u2423Paul\u2423Martin\u2423 (espaces en trop)');
        expect(nomAffiche('Ngozi   Adichie')).toContain('(espaces en trop)');
        expect(nomAffiche(' Paul Martin ')).not.toBe(nomAffiche('Paul Martin'));
    });

    test('messageErreur : message du serveur, code sans explication, réseau', () => {
        expect(messageErreur(new Error('Nom introuvable.'), 404)).toBe('Nom introuvable.');
        expect(messageErreur(new Error('HTTP 500'), 500)).toMatch(/code 500\).*administre Tracebay/);
        expect(messageErreur(new TypeError('Failed to fetch'), 0)).toBe('Tracebay ne répond pas. Réessayez dans un instant.');
        expect(messageErreur(new Error('HTTP 500'), 500)).not.toMatch(/^HTTP/);
    });
});

describe('bloc', () => {
    test('liste : noms échappés, espaces visibles, libellé relié', async () => {
        liste([{ name: '<b>Élodie</b>', count: 3 }, { name: ' Paul Martin ', count: 1 }]);
        await afficherEffacementTechnicien(container);
        const options = [...container.querySelectorAll('option')].map((o) => o.textContent);
        expect(options[0]).toBe('<b>Élodie</b> (3 éléments)');
        expect(container.querySelector('b')).toBeNull();
        expect(options[1]).toContain('(espaces en trop)');
        expect($('label').htmlFor).toBe('settingsTechnicienNom');
        expect($('[data-action="confirmer"]').getAttribute('aria-describedby')).toBe('settingsTechnicienQuestion');
        expect(container.hasAttribute('aria-busy')).toBe(false);
    });

    test('Échap annule la confirmation sans remonter à la fenêtre des Paramètres', async () => {
        liste([{ name: 'Élodie', count: 3 }]);
        await afficherEffacementTechnicien(container);
        const fermeture = jest.fn();
        parent.addEventListener('keydown', fermeture);
        $('[data-action="demander"]').click();
        expect($('[data-action="confirmer"]').hidden).toBe(false);
        expect(document.activeElement).toBe($('[data-action="confirmer"]'));
        $('[data-action="confirmer"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(fermeture).not.toHaveBeenCalled();
        expect($('[data-action="confirmer"]').hidden).toBe(true);
        expect(document.activeElement).toBe($('[data-action="demander"]'));
        // Hors confirmation, Échap remonte normalement (fermeture de la fenêtre).
        $('select').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        expect(fermeture).toHaveBeenCalledTimes(1);
    });

    test('pendant l\'envoi : « Effacement… », boutons désactivés ; succès : nouvelle liste et focus rendu', async () => {
        liste([{ name: 'Élodie', count: 3 }, { name: 'Li', count: 1 }]);
        await afficherEffacementTechnicien(container, { notifier: jest.fn() });
        let terminer;
        effacer.mockReturnValueOnce(new Promise((r) => {
            terminer = r;
        }));
        liste([{ name: 'Li', count: 1 }]);
        $('[data-action="demander"]').click();
        $('[data-action="confirmer"]').click();
        expect($('[data-action="confirmer"]').textContent).toBe('Effacement…');
        expect($('[data-action="confirmer"]').disabled).toBe(true);
        expect($('[data-action="annuler"]').disabled).toBe(true);
        terminer({ success: true, data: { success: true, anonymises: 3 } });
        await new Promise((r) => setTimeout(r, 0));
        await new Promise((r) => setTimeout(r, 0));
        expect(container.querySelectorAll('option')).toHaveLength(1);
        expect(document.activeElement).toBe($('select'));
    });

    test('échec : message clair, Annuler masque l\'erreur', async () => {
        liste([{ name: 'Élodie', count: 3 }]);
        await afficherEffacementTechnicien(container);
        effacer.mockResolvedValueOnce({ success: false, error: 'Enregistrement refusé (code 500).' });
        $('[data-action="demander"]').click();
        $('[data-action="confirmer"]').click();
        await new Promise((r) => setTimeout(r, 0));
        const erreur = $('.settings-error');
        expect(erreur.classList.contains('hidden')).toBe(false);
        expect(erreur.textContent).toContain(`Effacement impossible${String.fromCharCode(160)}: ` + 'Enregistrement refusé (code 500).');
        expect($('[data-action="confirmer"]').textContent).toBe('Effacer le nom');
        expect($('[data-action="annuler"]').disabled).toBe(false);
        $('[data-action="annuler"]').click();
        expect(erreur.classList.contains('hidden')).toBe(true);
    });

    test('liste indisponible : bouton Réessayer qui recharge et garde le focus', async () => {
        api.get.mockResolvedValueOnce(reponse(500, {}));
        await afficherEffacementTechnicien(container);
        expect($('[role="alert"]').textContent).toMatch(/indisponible\u00a0: Tracebay ne répond pas/);
        liste([{ name: 'Élodie', count: 3 }]);
        $('[data-action="reessayer"]').click();
        await new Promise((r) => setTimeout(r, 0));
        await new Promise((r) => setTimeout(r, 0));
        expect(container.querySelectorAll('option')).toHaveLength(1);
        expect(document.activeElement).toBe($('select'));
    });

    test('liste vide : message, focus possible après le dernier effacement', async () => {
        liste([]);
        await afficherEffacementTechnicien(container, { focus: true });
        expect(container.textContent).toMatch(/Aucun nom de technicien/);
        expect(document.activeElement).toBe($('p'));
    });
});

describe('réservé aux administrateurs', () => {
    test('sans session administrateur : phrase claire, effacement désactivé, connexion proposée', async () => {
        poste({ session: { success: true, connecte: false } });
        liste([{ name: 'Élodie', count: 3 }]);
        await afficherEffacementTechnicien(container);
        expect(container.textContent).toContain('Seul un administrateur peut effacer un nom de technicien');
        expect($('[data-action="demander"]').disabled).toBe(true);
        expect($('[data-action="connexion-admin"]')).not.toBeNull();
        expect(container.querySelectorAll('option')).toHaveLength(1);
    });

    test('avec session : effacement envoyé par le processus principal, jamais par l\'API du renderer', async () => {
        liste([{ name: 'Élodie', count: 3 }]);
        await afficherEffacementTechnicien(container, { notifier: jest.fn() });
        expect($('[data-action="demander"]').disabled).toBe(false);
        liste([]);
        $('[data-action="demander"]').click();
        $('[data-action="confirmer"]').click();
        await new Promise((r) => setTimeout(r, 0));
        await new Promise((r) => setTimeout(r, 0));
        expect(invoke).toHaveBeenCalledWith('atelier:anonymiser-technicien', { name: 'Élodie' });
        expect(api.post).not.toHaveBeenCalled();
    });

    test('session expirée pendant l\'effacement : message, puis retour à l\'état verrouillé', async () => {
        liste([{ name: 'Élodie', count: 3 }]);
        await afficherEffacementTechnicien(container);
        effacer.mockResolvedValueOnce({ success: false, code: 'reconnexion', error: 'Session administrateur terminée : reconnectez-vous.' });
        invoke.mockImplementation(async (canal, payload) => (canal === 'atelier:etat'
            ? { success: true, connecte: false }
            : effacer(payload)));
        liste([{ name: 'Élodie', count: 3 }]);
        const notifier = jest.fn();
        await afficherEffacementTechnicien(container, { notifier });
        expect($('[data-action="demander"]').disabled).toBe(true);
    });
});
