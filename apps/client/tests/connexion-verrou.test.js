/**
 * Verrou de l'adresse du serveur sur le poste (module pur connexion-verrou.js) : code
 * administrateur vérifié hors ligne contre l'empreinte scrypt du serveur, attente progressive,
 * journal local.
 */
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    verrouValide, verifierCode, attenteMs, apresEchec, decisionVerrou, ajouterJournal, OUVERTURE_MS,
    lireJson, ecrireJson
} = require('../connexion-verrou');

const CODE = 'Capsule-Huelgoat-29';
// Empreinte faite comme le serveur (lib/code-poste.ts) : scrypt N=32768, r=8, p=1, 32 octets
function empreinte(code, N = 32768) {
    const sel = crypto.randomBytes(16);
    const cle = crypto.scryptSync(code, sel, 32, { N, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    return { algo: 'scrypt', N, r: 8, p: 1, sel: sel.toString('base64'), empreinte: cle.toString('base64') };
}

describe('empreinte du serveur', () => {
    test('bon code accepté, autre code refusé', async () => {
        const v = empreinte(CODE);
        await expect(verifierCode(CODE, v)).resolves.toBe(true);
        await expect(verifierCode('Capsule-Huelgoat-30', v)).resolves.toBe(false);
        await expect(verifierCode('', v)).resolves.toBe(false);
    });

    test('paramètres hors bornes refusés (empreinte forgée qui épuiserait la mémoire)', () => {
        const v = empreinte(CODE);
        expect(verrouValide(v)).toBe(true);
        expect(verrouValide({ ...v, N: 2 ** 22 })).toBe(false);
        expect(verrouValide({ ...v, N: 30000 })).toBe(false);
        expect(verrouValide({ ...v, r: 64 })).toBe(false);
        expect(verrouValide({ ...v, algo: 'md5' })).toBe(false);
        expect(verrouValide(null)).toBe(false);
    });
});

describe('attente progressive', () => {
    test('4 échecs : pas d\'attente ; 5e : 1 minute, puis 2, 4… jusqu\'à 1 heure', () => {
        let essais = { echecs: 0 };
        const t = 1_000_000;
        for (let i = 0; i < 4; i++) {
            essais = apresEchec(essais, t);
        }
        expect(attenteMs(essais, t)).toBe(0);
        essais = apresEchec(essais, t);
        expect(attenteMs(essais, t)).toBe(60_000);
        essais = apresEchec(essais, t);
        expect(attenteMs(essais, t)).toBe(120_000);
        for (let i = 0; i < 10; i++) {
            essais = apresEchec(essais, t);
        }
        expect(attenteMs(essais, t)).toBe(3_600_000);
        expect(attenteMs(essais, t + 3_600_000)).toBe(0);
    });

    test('ouverture de 10 minutes après le bon code', () => {
        expect(OUVERTURE_MS).toBe(10 * 60_000);
    });
});

describe('décision à la connexion', () => {
    const v = empreinte(CODE);
    test('serveur 3.8.3 avec code : empreinte enregistrée, adresse verrouillée', () => {
        expect(decisionVerrou(200, { success: true, verrou: v })).toEqual({ action: 'enregistrer', verrou: v });
    });

    test('serveur sans code défini : rien ne change, ligne de journal', () => {
        const d = decisionVerrou(200, { success: true, verrou: null });
        expect(d.action).toBe('garder');
        expect(d.journal).toMatch(/aucun code administrateur/);
    });

    test('serveur 3.8.2 ou plus ancien (404) : pas de verrou, ligne de journal', () => {
        const d = decisionVerrou(404, {});
        expect(d.action).toBe('garder');
        expect(d.journal).toMatch(/antérieur à la 3\.8\.3/);
    });

    test('empreinte invalide ou erreur : rien ne change', () => {
        expect(decisionVerrou(200, { verrou: { ...v, N: 2 ** 22 } }).action).toBe('garder');
        expect(decisionVerrou(500, {}).action).toBe('garder');
        expect(decisionVerrou(0, null).action).toBe('garder');
    });
});

describe('journal et fichiers', () => {
    test('journal local plafonné à 50 entrées, les plus récentes gardées', () => {
        let j = [];
        for (let i = 0; i < 60; i++) {
            j = ajouterJournal(j, { ancienne: 'a', nouvelle: `n${i}`, date: 'd', poste: 'p' });
        }
        expect(j).toHaveLength(50);
        expect(j[49].nouvelle).toBe('n59');
    });

    test('lecture et écriture atomiques ; fichier absent ou illisible : null', () => {
        const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'tracebay-verrou-'));
        const f = path.join(dossier, 'connexion-verrou.json');
        expect(lireJson(f)).toBeNull();
        ecrireJson(f, { a: 1 });
        expect(lireJson(f)).toEqual({ a: 1 });
        expect(fs.readdirSync(dossier)).toEqual(['connexion-verrou.json']);
        fs.writeFileSync(f, 'abîmé');
        expect(lireJson(f)).toBeNull();
        fs.rmSync(dossier, { recursive: true, force: true });
    });
});
