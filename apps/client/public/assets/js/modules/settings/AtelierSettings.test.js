/**
 * Paramètres > Branding et Types (édition serveur) : lecture seule pour tous, modification après
 * connexion d'un compte administrateur ; le renderer ne manipule jamais de jeton.
 */
jest.mock('../../config/api.js', () => ({ __esModule: true, default: { get: jest.fn() } }));

const api = require('../../config/api.js').default;
const AtelierSettings = require('./AtelierSettings.js').default;
const { invalidateMaterialTypes } = require('./materialTypes.js');

const reponse = (body) => ({ ok: true, status: 200, json: async () => body });
const BRANDING = { success: true, company_name: 'LA CAPSULE', logo: null, pdf_color: null, nom_impose: false };
const TYPES = { success: true, types: ['Portable', 'Fixe'], par_defaut: false, usage: [{ type: 'portable', count: 12 }, { type: 'Tablette', count: 2 }] };

let brandingEl;
let typesEl;
let invoke;

function serveur(branding = BRANDING, types = TYPES) {
    api.get.mockImplementation(async (url) => reponse(url === '/api/branding' ? branding : types));
}

async function ecran(etat = { success: true, connecte: false }) {
    invoke = jest.fn(async (canal) => (canal === 'atelier:etat' ? etat : { success: true }));
    window.electron = { invoke };
    const vue = new AtelierSettings({ brandingEl, typesEl, notifier: jest.fn() });
    await vue.render();
    return vue;
}

beforeEach(() => {
    jest.clearAllMocks();
    invalidateMaterialTypes();
    document.body.innerHTML = '<div id="settingsBrandingSettings"></div><div id="settingsTypesSettings"></div>';
    brandingEl = document.getElementById('settingsBrandingSettings');
    typesEl = document.getElementById('settingsTypesSettings');
    serveur();
    const proto = HTMLDialogElement.prototype;
    proto.showModal = proto.showModal || function showModal() {
        this.open = true;
    };
    HTMLDialogElement.prototype.close = HTMLDialogElement.prototype.close || function close() {
        this.open = false;
        this.dispatchEvent(new Event('close'));
    };
});

test('lecture seule : réglages affichés, champs désactivés, mention et bouton administrateur', async () => {
    await ecran();
    expect(brandingEl.querySelector('#atelierNom').value).toBe('LA CAPSULE');
    expect(brandingEl.querySelector('fieldset').disabled).toBe(true);
    expect(brandingEl.textContent).toContain('Seul un administrateur peut modifier le branding');
    expect(brandingEl.textContent).toContain('tous les postes');
    expect(typesEl.textContent).toContain('Défini par l\'administrateur de l\'atelier');
    expect(brandingEl.querySelector('[data-action="modifier"]')).not.toBeNull();
    expect(brandingEl.querySelector('.post-settings__footer').hidden).toBe(true);
    expect(brandingEl.querySelector('[name="pdf_color_hex"]').value).toBe('#2D3073');
});

test('types : usage par type et types hors liste encore utilisés', async () => {
    await ecran();
    const libelles = [...typesEl.querySelectorAll('.post-settings__type')].map((li) => li.textContent.replace(/\s+/g, ' ').trim());
    expect(libelles).toEqual(['Portable utilisé par 12 machines', 'Fixe aucune machine']);
    expect(typesEl.textContent).toContain('Types hors liste encore utilisés');
    expect(typesEl.textContent).toMatch(/Tablette.: utilisé par 2 machines/);
    expect(typesEl.querySelector('[data-action="type-remove"]')).toBeNull();
});

test('connexion refusée : message dans le dialogue, mot de passe effacé, rien n\'est débloqué', async () => {
    const vue = await ecran();
    invoke.mockImplementation(async (canal) => (canal === 'atelier:connexion'
        ? { success: false, error: 'Ce compte n\'est pas administrateur.' }
        : { success: true, connecte: false }));
    brandingEl.querySelector('[data-action="modifier"]').click();
    const dialog = document.querySelector('dialog.atelier-dialog');
    dialog.querySelector('[name="username"]').value = 'marie';
    dialog.querySelector('[name="password"]').value = 'secret';
    dialog.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(invoke).toHaveBeenCalledWith('atelier:connexion', { username: 'marie', password: 'secret' });
    expect(dialog.querySelector('.settings-error').textContent).toBe('Ce compte n\'est pas administrateur.');
    expect(dialog.querySelector('[name="password"]').value).toBe('');
    expect(vue.edition).toBe(false);
});

test('session administrateur : édition, enregistrement des types, rafraîchissement', async () => {
    const expiresAt = Date.now() + 3_000_000;
    await ecran({ success: true, connecte: true, username: 'admin', expiresAt });
    expect(typesEl.querySelector('fieldset').disabled).toBe(false);
    expect(typesEl.textContent).toContain('Modification ouverte pour admin');
    typesEl.querySelector('[name="type_new"]').value = '  Unité   centrale ';
    typesEl.querySelector('[data-action="add-type"]').click();
    expect([...typesEl.querySelectorAll('.post-settings__type-label')].map((s) => s.textContent)).toEqual(['Portable', 'Fixe', 'Unité centrale']);
    typesEl.querySelector('[data-action="type-remove"][data-index="1"]').click();
    invoke.mockImplementation(async (canal) => (canal === 'atelier:etat' ? { success: true, connecte: true, username: 'admin', expiresAt } : { success: true }));
    typesEl.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(invoke).toHaveBeenCalledWith('atelier:enregistrer-types', { types: ['Portable', 'Unité centrale'] });
});

test('branding : seuls les champs modifiés sont envoyés ; bleu d\'origine envoyé comme null', async () => {
    const expiresAt = Date.now() + 3_000_000;
    serveur({ ...BRANDING, pdf_color: '#8A1C1C' });
    await ecran({ success: true, connecte: true, username: 'admin', expiresAt });
    brandingEl.querySelector('[data-action="reset-color"]').click();
    brandingEl.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(invoke).toHaveBeenCalledWith('atelier:enregistrer-branding', { pdf_color: null });
});

test('couleur trop claire : refusée avant l\'envoi', async () => {
    await ecran({ success: true, connecte: true, username: 'admin', expiresAt: Date.now() + 3_000_000 });
    const hex = brandingEl.querySelector('[name="pdf_color_hex"]');
    hex.value = '#FFEE88';
    hex.dispatchEvent(new Event('input'));
    brandingEl.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(hex.getAttribute('aria-invalid')).toBe('true');
    expect(invoke).not.toHaveBeenCalledWith('atelier:enregistrer-branding', expect.anything());
});

test('serveur injoignable : erreur et bouton Réessayer dans les deux onglets', async () => {
    api.get.mockRejectedValue(new TypeError('Failed to fetch'));
    await ecran();
    expect(brandingEl.querySelector('[role="alert"]').textContent).toMatch(/Tracebay ne répond pas/);
    expect(typesEl.querySelector('[data-action="reessayer"]')).not.toBeNull();
});

describe('serveur plus ancien que le poste', () => {
    const statut = (status, body = {}) => ({ ok: status < 400, status, json: async () => body });
    const routes = (table) => api.get.mockImplementation(async (url) => {
        const r = table[url];
        if (r instanceof Error) {
            throw r;
        }
        return r || statut(404);
    });
    beforeEach(() => {
        window.APP_CONFIG = { appVersion: '3.8.2' };
    });

    test('types absents (404) : mettre le serveur à jour, pas « ne répond pas »', async () => {
        routes({ '/api/branding': reponse(BRANDING), '/api/health': statut(200, { status: 'ok', version: '2.0.0' }) });
        await ecran();
        for (const el of [brandingEl, typesEl]) {
            const alerte = el.querySelector('[role="alert"]').textContent;
            expect(alerte).toMatch(/mettez le serveur à jour/);
            expect(alerte).toContain('3.8.2');
            expect(alerte).toContain('3.8.0');
            expect(alerte).not.toMatch(/ne répond pas/);
            expect(alerte).not.toContain('2.0.0');
        }
    });

    test("branding absent aussi (serveur d'avant la 3.7.0) : même message", async () => {
        routes({});
        await ecran();
        expect(brandingEl.querySelector('[role="alert"]').textContent).toMatch(/mettez le serveur à jour/);
    });

    test('version annoncée par le serveur (tracebay_version) : affichée', async () => {
        routes({ '/api/branding': reponse(BRANDING), '/api/health': statut(200, { status: 'ok', tracebay_version: '3.7.2' }) });
        await ecran();
        expect(typesEl.querySelector('[role="alert"]').textContent)
            .toContain(`Le serveur Tracebay est en version 3.7.2, ce poste en version 3.8.2${String.fromCharCode(160)}: mettez le serveur à jour.`);
    });

    test('erreur du serveur (500) : signalée comme telle, avec Réessayer', async () => {
        routes({ '/api/branding': reponse(BRANDING), '/api/material-types': statut(500) });
        await ecran();
        const alerte = typesEl.querySelector('[role="alert"]').textContent;
        expect(alerte).toMatch(/erreur du serveur/i);
        expect(alerte).toContain('500');
        expect(alerte).not.toMatch(/ne répond pas|mettez le serveur à jour/);
        expect(typesEl.querySelector('[data-action="reessayer"]')).not.toBeNull();
    });
});
