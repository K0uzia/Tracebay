/**
 * Adresse du serveur propre au poste (module pur server-address.js) : saisie, lecture,
 * migration au premier lancement.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    normaliserAdresse, lireAdressePoste, ecrireAdressePoste, migrerAdressePoste
} = require('../server-address');

describe('normaliserAdresse', () => {
    test('hôte et port, avec ou sans http://, ws déduit', () => {
        expect(normaliserAdresse(' 192.0.2.10:4000 ')).toEqual({
            ok: true, serverUrl: 'http://192.0.2.10:4000', serverWsUrl: 'ws://192.0.2.10:4000'
        });
        expect(normaliserAdresse('http://serveur:4000/')).toMatchObject({ ok: true, serverUrl: 'http://serveur:4000' });
        expect(normaliserAdresse('https://tracebay.example.org')).toEqual({
            ok: true, serverUrl: 'https://tracebay.example.org', serverWsUrl: 'wss://tracebay.example.org'
        });
    });

    test('refus lisibles : vide, autre protocole, chemin, identifiants', () => {
        expect(normaliserAdresse('')).toEqual({ ok: false, error: 'Adresse vide.' });
        expect(normaliserAdresse(undefined).ok).toBe(false);
        expect(normaliserAdresse('ftp://serveur').error).toMatch(/http:\/\/ ou https:\/\//);
        expect(normaliserAdresse('http://serveur:4000/api').error).toMatch(/sans chemin/);
        expect(normaliserAdresse('http://a:b@serveur:4000').ok).toBe(false);
        expect(normaliserAdresse('http://serveur:4000?x=1').ok).toBe(false);
        expect(normaliserAdresse('http://').ok).toBe(false);
    });
});

describe('fichier du poste', () => {
    let dossier;
    let fichier;
    beforeEach(() => {
        dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'tracebay-adresse-'));
        fichier = path.join(dossier, 'connection.json');
    });
    afterEach(() => fs.rmSync(dossier, { recursive: true, force: true }));

    test('écriture puis lecture ; absent ou illisible : null', () => {
        expect(lireAdressePoste(fichier)).toBeNull();
        ecrireAdressePoste(fichier, { serverUrl: 'http://192.0.2.10:4000', serverWsUrl: 'ws://192.0.2.10:4000' });
        expect(lireAdressePoste(fichier)).toEqual({ serverUrl: 'http://192.0.2.10:4000', serverWsUrl: 'ws://192.0.2.10:4000' });
        expect(fs.readdirSync(dossier)).toEqual(['connection.json']);
        fs.writeFileSync(fichier, '{ pas du json');
        expect(lireAdressePoste(fichier)).toBeNull();
    });

    test('migration sans fichier : l\'adresse en place est recopiée', () => {
        const r = migrerAdressePoste({ fichier, adresseEnPlace: { url: 'http://192.0.2.62:4000', ws: 'ws://192.0.2.62:4000' } });
        expect(r).toEqual({ adresse: { serverUrl: 'http://192.0.2.62:4000', serverWsUrl: 'ws://192.0.2.62:4000' }, migre: true });
        expect(JSON.parse(fs.readFileSync(fichier, 'utf8'))).toEqual(r.adresse);
    });

    test('migration avec un fichier existant : rien n\'est écrasé', () => {
        ecrireAdressePoste(fichier, { serverUrl: 'http://192.0.2.20:4000', serverWsUrl: 'ws://192.0.2.20:4000' });
        const avant = fs.readFileSync(fichier, 'utf8');
        const r = migrerAdressePoste({ fichier, adresseEnPlace: { url: 'http://192.0.2.62:4000' } });
        expect(r).toEqual({ adresse: { serverUrl: 'http://192.0.2.20:4000', serverWsUrl: 'ws://192.0.2.20:4000' }, migre: false });
        expect(fs.readFileSync(fichier, 'utf8')).toBe(avant);
    });

    test('migration avec un fichier illisible : gardé tel quel, pas d\'adresse', () => {
        fs.writeFileSync(fichier, 'corrompu');
        expect(migrerAdressePoste({ fichier, adresseEnPlace: { url: 'http://192.0.2.62:4000' } }))
            .toEqual({ adresse: null, migre: false });
        expect(fs.readFileSync(fichier, 'utf8')).toBe('corrompu');
    });

    test('migration sans adresse en place valide : aucun fichier créé', () => {
        expect(migrerAdressePoste({ fichier, adresseEnPlace: { url: '' } })).toEqual({ adresse: null, migre: false });
        expect(migrerAdressePoste({ fichier, adresseEnPlace: null }))
            .toEqual({ adresse: null, migre: false });
        expect(fs.existsSync(fichier)).toBe(false);
    });
});
