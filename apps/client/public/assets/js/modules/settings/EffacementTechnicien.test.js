/**
 * Effacement du nom d'un technicien (module identique dans l'édition serveur et la portable).
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
beforeEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '<div id="modal"><div id="bloc"></div></div>';
    parent = document.getElementById('modal');
    container = document.getElementById('bloc');
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
        api.post.mockReturnValueOnce(new Promise((r) => {
            terminer = r;
        }));
        liste([{ name: 'Li', count: 1 }]);
        $('[data-action="demander"]').click();
        $('[data-action="confirmer"]').click();
        expect($('[data-action="confirmer"]').textContent).toBe('Effacement…');
        expect($('[data-action="confirmer"]').disabled).toBe(true);
        expect($('[data-action="annuler"]').disabled).toBe(true);
        terminer(reponse(200, { anonymises: 3 }));
        await new Promise((r) => setTimeout(r, 0));
        await new Promise((r) => setTimeout(r, 0));
        expect(container.querySelectorAll('option')).toHaveLength(1);
        expect(document.activeElement).toBe($('select'));
    });

    test('échec : message clair, Annuler masque l\'erreur', async () => {
        liste([{ name: 'Élodie', count: 3 }]);
        await afficherEffacementTechnicien(container);
        const pasDuJson = async () => {
            throw new Error('pas du JSON');
        };
        api.post.mockResolvedValueOnce({ ok: false, status: 500, json: pasDuJson });
        $('[data-action="demander"]').click();
        $('[data-action="confirmer"]').click();
        await new Promise((r) => setTimeout(r, 0));
        const erreur = $('.settings-error');
        expect(erreur.classList.contains('hidden')).toBe(false);
        expect(erreur.textContent).toMatch(/Effacement impossible\u00a0: Tracebay n'a pas pu traiter la demande \(code 500\)/);
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
