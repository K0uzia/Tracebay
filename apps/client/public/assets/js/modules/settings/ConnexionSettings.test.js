/**
 * Paramètres > Connexion (édition serveur) : adresse verrouillée après la première connexion,
 * code administrateur des postes vérifié par le processus principal, premier lancement sans
 * adresse.
 */
const { afficherConnexion, ouvrirPremierLancement } = require('./ConnexionSettings.js');

const NB = String.fromCharCode(160);
const BASE = {
    success: true, serverUrl: 'http://192.0.2.10:4000', source: 'poste', fichier: 'C:\\Users\\x\\connection.json',
    verrouille: false, ouvertJusqua: 0, attenteMs: 0, poste: 'poste-3f9a2c'
};
let el;
let invoke;
function poste(etat, reponses = {}) {
    let courant = { ...BASE, ...etat };
    invoke = jest.fn(async (canal, payload) => {
        if (canal === 'connexion:adresse') {
            return courant;
        }
        if (canal === 'connexion:deverrouiller') {
            const r = reponses.deverrouiller ? reponses.deverrouiller(payload) : { success: false, error: 'Code incorrect.' };
            if (r.success) {
                courant = { ...courant, ouvertJusqua: r.ouvertJusqua };
            }
            return r;
        }
        return { success: true };
    });
    window.electron = { invoke };
}
const attendre = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
    document.body.innerHTML = '<div id="panneau"></div>';
    el = document.getElementById('panneau');
    const proto = HTMLDialogElement.prototype;
    proto.showModal = proto.showModal || function showModal() {
        this.open = true;
    };
    proto.close = proto.close || function close() {
        this.open = false;
        this.dispatchEvent(new Event('close'));
    };
});

test('adresse verrouillée : lecture seule, explication, identifiant du poste, bouton code administrateur', async () => {
    poste({ verrouille: true });
    await afficherConnexion(el);
    const champ = el.querySelector('#connexionAdresse');
    expect(champ.value).toBe('http://192.0.2.10:4000');
    expect(champ.readOnly).toBe(true);
    expect(el.querySelector('button[type="submit"]').hidden).toBe(true);
    expect(el.textContent).toContain('code administrateur');
    expect(el.textContent).toContain('poste-3f9a2c');
    expect(el.querySelector('[data-action="deverrouiller"]')).not.toBeNull();
});

test('bon code : modification ouverte, heure de fin affichée, champ modifiable', async () => {
    const fin = Date.now() + 600000;
    poste({ verrouille: true }, { deverrouiller: (p) => (p.code === 'Capsule-Huelgoat-29' ? { success: true, ouvertJusqua: fin } : { success: false }) });
    await afficherConnexion(el);
    el.querySelector('[data-action="deverrouiller"]').click();
    const dialog = document.querySelector('dialog.atelier-dialog');
    dialog.querySelector('[name="code"]').value = 'Capsule-Huelgoat-29';
    dialog.querySelector('form').requestSubmit();
    await attendre();
    await attendre();
    expect(invoke).toHaveBeenCalledWith('connexion:deverrouiller', { code: 'Capsule-Huelgoat-29' });
    expect(document.querySelector('dialog.atelier-dialog')).toBeNull();
    expect(el.querySelector('#connexionAdresse').readOnly).toBe(false);
    expect(el.textContent).toMatch(/Modification ouverte jusqu'à/);
});

test('code faux : message dans le dialogue, champ du code vidé ; attente : bouton désactivé', async () => {
    let n = 0;
    poste({ verrouille: true }, {
        deverrouiller: () => (++n < 2 ? { success: false, error: 'Code incorrect.' } : { success: false, attenteMs: 60000, error: `Trop d'essais${NB}: nouvel essai dans 1 min.` })
    });
    await afficherConnexion(el);
    el.querySelector('[data-action="deverrouiller"]').click();
    const dialog = document.querySelector('dialog.atelier-dialog');
    const code = dialog.querySelector('[name="code"]');
    code.value = 'mauvais-code-123';
    dialog.querySelector('form').requestSubmit();
    await attendre();
    expect(dialog.querySelector('[role="alert"]').textContent).toBe('Code incorrect.');
    expect(code.value).toBe('');
    code.value = 'encore-mauvais-1';
    dialog.querySelector('form').requestSubmit();
    await attendre();
    expect(dialog.querySelector('[role="alert"]').textContent).toMatch(/Trop d'essais/);
    expect(dialog.querySelector('button[type="submit"]').disabled).toBe(true);
});

test('serveur sans code (pas de verrou) : adresse modifiable comme avant', async () => {
    poste({ verrouille: false });
    await afficherConnexion(el);
    expect(el.querySelector('#connexionAdresse').readOnly).toBe(false);
    expect(el.querySelector('button[type="submit"]').hidden).toBe(false);
    expect(el.querySelector('[data-action="deverrouiller"]')).toBeNull();
});

test('premier lancement : aucune adresse, saisie demandée', async () => {
    poste({ source: 'aucune', serverUrl: '' });
    await afficherConnexion(el);
    expect(el.textContent).toContain('Aucune adresse enregistrée');
    expect(el.querySelector('#connexionAdresse').value).toBe('');
    expect(el.querySelector('#connexionAdresse').readOnly).toBe(false);
});

test('dialogue de premier lancement : modal, ne se ferme pas avec Échap', async () => {
    poste({ source: 'aucune', serverUrl: '' });
    const dialog = await ouvrirPremierLancement();
    expect(dialog.open).toBe(true);
    expect(dialog.textContent).toContain('Adresse du serveur');
    const annulation = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(annulation);
    expect(annulation.defaultPrevented).toBe(true);
    expect(dialog.open).toBe(true);
});
