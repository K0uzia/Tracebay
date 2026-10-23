/**
 * Types de matériel de l'atelier : libellés, anciens codes, types hors liste.
 */
jest.mock('../../config/api.js', () => ({ __esModule: true, default: { get: jest.fn() } }));

const api = require('../../config/api.js').default;
const {
    typeLabel, matchType, usageParType, typeOptionsHtml, otherTypeText,
    getMaterialTypesInfo, invalidateMaterialTypes, OTHER_TYPE
} = require('./materialTypes.js');

const TYPES = ['Portable', 'Fixe', 'Écran'];

beforeEach(() => {
    jest.clearAllMocks();
    invalidateMaterialTypes();
});

test('anciens codes affichés avec leur libellé, libellés inchangés', () => {
    expect(typeLabel('portable')).toBe('Portable');
    expect(typeLabel('PC fixe')).toBe('Fixe');
    expect(typeLabel('ecran')).toBe('Écran');
    expect(typeLabel('Tablette')).toBe('Tablette');
    expect(matchType(TYPES, 'portable')).toBe('Portable');
    expect(matchType(TYPES, 'FIXE')).toBe('Fixe');
    expect(matchType(TYPES, 'Tablette')).toBeNull();
});

test('usage regroupé par libellé, types hors liste signalés', () => {
    const usage = [{ type: 'portable', count: 12 }, { type: 'Portable', count: 3 }, { type: 'Tablette', count: 2 }, { type: 'Fixe', count: 1 }];
    expect(usageParType(TYPES, usage)).toEqual([
        { label: 'Portable', count: 15, dansLaListe: true },
        { label: 'Tablette', count: 2, dansLaListe: false },
        { label: 'Fixe', count: 1, dansLaListe: true }
    ]);
});

test('options : type de la liste sélectionné ; type hors liste via « Autre (préciser) »', () => {
    const html = typeOptionsHtml(TYPES, { selected: 'portable' });
    expect(html).toContain('<option value="Portable" selected>Portable</option>');
    const hors = typeOptionsHtml(TYPES, { selected: 'Tablette' });
    expect(hors).toContain(`<option value="${OTHER_TYPE}" selected>`);
    expect(otherTypeText(TYPES, 'Tablette')).toBe('Tablette');
    expect(otherTypeText(TYPES, 'fixe')).toBe('');
    expect(typeOptionsHtml(['<b>'], {})).toContain('&lt;b&gt;');
});

test('lecture depuis le serveur, mise en cache, indisponibilité sans blocage', async () => {
    const corps = { types: TYPES, usage: [], par_defaut: true };
    api.get.mockResolvedValueOnce({ ok: true, json: async () => corps });
    expect(await getMaterialTypesInfo()).toEqual({ types: TYPES, usage: [], parDefaut: true });
    await getMaterialTypesInfo();
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith('/api/material-types', { useCache: false });
    invalidateMaterialTypes();
    api.get.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    // Serveur d'avant la 3.8.0 ou injoignable : liste de départ, jamais de liste vide
    expect(await getMaterialTypesInfo()).toMatchObject({ types: TYPES, indisponible: true });
});
