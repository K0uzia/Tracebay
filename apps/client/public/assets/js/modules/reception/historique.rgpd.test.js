/**
 * Historique : modification d'un prêt, suppression d'un prêt ou d'un don (droit à l'effacement).
 */

jest.mock('../../config/api.js', () => ({
    __esModule: true,
    default: {
        get: jest.fn(),
        post: jest.fn(),
        put: jest.fn(),
        delete: jest.fn(),
        getServerUrl: jest.fn(() => 'http://serveur.test')
    }
}));

jest.mock('../../config/Logger.js', () => {
    const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    return { __esModule: true, default: () => logger };
});

jest.mock('../../config/notifications.js', () => ({
    __esModule: true,
    showAppNotification: jest.fn()
}));

jest.mock('./lotsApi.js', () => ({ __esModule: true, loadLotsWithItems: jest.fn() }));
jest.mock('./disquesApi.js', () => ({ __esModule: true }));
jest.mock('./tracabilite.js', () => ({ __esModule: true, default: jest.fn() }));

const fs = require('fs');
const path = require('path');
const api = require('../../config/api.js').default;
const { showAppNotification } = require('../../config/notifications.js');
const HistoriqueManager = require('./historique.js').default;

const PAGE = fs.readFileSync(path.join(__dirname, '../../../../pages/reception-pages/historique.html'), 'utf8');

function makeManager() {
    const m = Object.create(HistoriqueManager.prototype);
    m.modalManager = { open: jest.fn(), close: jest.fn() };
    m.pdf = {
        regeneratePretPdf: jest.fn().mockResolvedValue(undefined),
        normalizeDateForPath: (d) => d
    };
    m.lots = [];
    m.sessionsDisques = [];
    m.commandes = [];
    m.dons = [{ id: 3, lot_name: 'Lot <b>mars</b>', date: '2026-03-02', pdf_path: '/mnt/team/#TEAM/don.pdf', lines: [] }];
    m.prets = [{
        id: 7,
        reference: 'PR-1',
        borrower_name: 'Jeanne Martin',
        borrower_type: 'personne',
        borrower_contact: 'jeanne@example.org',
        date: '2026-10-01',
        date_debut: '2026-10-01',
        date_fin: '2026-10-15',
        remuneration_gratuit: true,
        remuneration_montant: null,
        pdf_path: '/mnt/team/#TEAM/pret.pdf',
        lines: []
    }];
    m.loadData = jest.fn().mockResolvedValue(undefined);
    return m;
}

const lastNotification = () => showAppNotification.mock.calls.at(-1);

beforeEach(() => {
    document.body.innerHTML = PAGE;
    jest.clearAllMocks();
    delete window.electron;
});

describe('cartes', () => {
    test('le prêt a Modifier et Supprimer, le don a Supprimer, nom échappé', () => {
        const m = makeManager();
        const pret = m.createPretElement(m.prets[0]);
        expect(pret).toContain('class="btn-edit-pret-hist" data-pret-id="7"');
        expect(pret).toContain('data-kind="pret" data-record-id="7"');
        const don = m.createDonElement(m.dons[0]);
        expect(don).toContain('data-kind="don" data-record-id="3"');
        expect(don).not.toContain('<b>mars</b>');
    });
});

describe('suppression', () => {
    test('la confirmation nomme l\'objet et annonce le sort du PDF', () => {
        const m = makeManager();
        m.askDeleteRecord('pret', '7');
        expect(document.getElementById('modal-confirm-delete-hist-title').textContent).toBe('Supprimer le prêt');
        expect(document.getElementById('modal-confirm-delete-hist-text').textContent)
            .toContain('le prêt « PR-1 » (n° 7)');
        expect(document.getElementById('modal-confirm-delete-hist-pdf').textContent).toContain('PDF associé');
        expect(m.modalManager.open).toHaveBeenCalledWith('modal-confirm-delete-hist');
        expect(api.delete).not.toHaveBeenCalled();
    });

    test('un nom contenant du HTML reste du texte', () => {
        const m = makeManager();
        m.dons[0].lot_name = '<img src=x onerror=alert(1)>';
        m.askDeleteRecord('don', '3');
        const text = document.getElementById('modal-confirm-delete-hist-text');
        expect(text.querySelector('img')).toBeNull();
        expect(text.textContent).toContain('le don « <img src=x onerror=alert(1)> » (n° 3)');
    });

    test('PDF effacé par le serveur : succès', async () => {
        const m = makeManager();
        api.delete.mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, pdf_path: '/x.pdf', pdf_deleted: true }) });
        m.askDeleteRecord('don', '3');
        await m.confirmDeleteRecord();
        expect(api.delete).toHaveBeenCalledWith('/api/dons/3');
        expect(m.modalManager.close).toHaveBeenCalledWith('modal-confirm-delete-hist');
        expect(lastNotification()).toEqual(['Don et PDF supprimés', 'success', undefined]);
        expect(m.loadData).toHaveBeenCalled();
        expect(m.pendingDelete).toBeNull();
    });

    test('PDF hors de portée du serveur : son emplacement est indiqué', async () => {
        const m = makeManager();
        api.delete.mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, pdf_path: '/mnt/team/#TEAM/pret.pdf', pdf_deleted: false }) });
        m.askDeleteRecord('pret', '7');
        await m.confirmDeleteRecord();
        expect(api.delete).toHaveBeenCalledWith('/api/prets-materiel/7');
        const [message, type] = lastNotification();
        expect(type).toBe('warning');
        expect(message).toContain('/mnt/team/#TEAM/pret.pdf');
    });

    test('enregistrement déjà supprimé : erreur lisible, modale laissée ouverte', async () => {
        const m = makeManager();
        api.delete.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
        m.askDeleteRecord('pret', '7');
        await m.confirmDeleteRecord();
        expect(m.modalManager.close).not.toHaveBeenCalled();
        const [message, type] = lastNotification();
        expect(type).toBe('error');
        expect(message).toContain('n\'existe plus');
        expect(document.getElementById('btn-confirm-delete-hist').disabled).toBe(false);
    });
});

describe('modification d\'un prêt', () => {
    test('le formulaire est prérempli', () => {
        const m = makeManager();
        m.editPretFromHistorique('7');
        expect(document.getElementById('input-pret-borrower-name-hist').value).toBe('Jeanne Martin');
        expect(document.getElementById('input-pret-date-fin-hist').value).toBe('2026-10-15');
        expect(document.getElementById('input-pret-montant-hist').disabled).toBe(true);
        expect(m.modalManager.open).toHaveBeenCalledWith('modal-edit-pret-hist');
    });

    test('emprunteur vide : rien n\'est envoyé', async () => {
        const m = makeManager();
        m.editPretFromHistorique('7');
        document.getElementById('input-pret-borrower-name-hist').value = '  ';
        await m.savePretFromHistorique();
        expect(api.put).not.toHaveBeenCalled();
        expect(lastNotification()[1]).toBe('warning');
    });

    test('fin avant début : rien n\'est envoyé', async () => {
        const m = makeManager();
        m.editPretFromHistorique('7');
        document.getElementById('input-pret-date-fin-hist').value = '2026-09-01';
        await m.savePretFromHistorique();
        expect(api.put).not.toHaveBeenCalled();
    });

    test('enregistrement puis régénération du PDF dans l\'application de bureau', async () => {
        const m = makeManager();
        m.syncPdfBridge = jest.fn();
        window.electron = { invoke: jest.fn() };
        api.put.mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true }) });
        m.editPretFromHistorique('7');
        document.getElementById('input-pret-borrower-name-hist').value = 'J. Martin';
        document.getElementById('input-pret-payant-hist').checked = true;
        document.getElementById('input-pret-montant-hist').value = '12.5';
        await m.savePretFromHistorique();
        expect(api.put).toHaveBeenCalledWith('/api/prets-materiel/7', expect.objectContaining({
            borrower_name: 'J. Martin',
            remuneration_gratuit: false,
            remuneration_montant: 12.5,
            date_debut: '2026-10-01',
            date_fin: '2026-10-15'
        }));
        expect(m.prets[0].borrower_name).toBe('J. Martin');
        expect(m.pdf.regeneratePretPdf).toHaveBeenCalledWith('7');
        expect(m.loadData).toHaveBeenCalled();
    });
});
