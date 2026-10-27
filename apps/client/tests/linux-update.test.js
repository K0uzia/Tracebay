/**
 * Mise à jour par paquet Linux (module pur linux-update.js) : type d'installation, empreintes
 * publiées, contrôle d'intégrité, scripts du helper.
 */
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const {
    detecterTypeInstallation, lireTypePaquet, sha512Fichier, empreintesYml,
    scriptInstallationRoot, scriptHelper, publicationIncomplete, MESSAGE_PUBLICATION
} = require('../linux-update');

const YML = `version: 3.8.1
files:
  - url: workspace.AppImage
    sha512: QUFB+/==
    size: 120
  - url: workspace.deb
    sha512: REVC
    size: 80
path: workspace.AppImage
sha512: QUFB+/==
`;

describe('detecterTypeInstallation', () => {
    test('Linux : AppImage avant tout, puis le type écrit par le paquet, sinon archive', () => {
        expect(detecterTypeInstallation({ platform: 'linux', appImagePath: '/home/a/workspace.AppImage', packageTypeFile: 'deb' })).toBe('AppImage');
        expect(detecterTypeInstallation({ platform: 'linux', packageTypeFile: 'deb\n' })).toBe('deb');
        expect(detecterTypeInstallation({ platform: 'linux', packageTypeFile: 'rpm' })).toBe('rpm');
        expect(detecterTypeInstallation({ platform: 'linux', packageTypeFile: null })).toBe('archive');
        expect(detecterTypeInstallation({ platform: 'linux', packageTypeFile: 'pacman' })).toBe('archive');
    });

    test('Windows : portable si electron-builder a défini son dossier, sinon NSIS ; macOS : dmg', () => {
        expect(detecterTypeInstallation({ platform: 'win32', portableDir: 'D:\\Outils' })).toBe('portable');
        expect(detecterTypeInstallation({ platform: 'win32' })).toBe('nsis');
        expect(detecterTypeInstallation({ platform: 'darwin' })).toBe('dmg');
        expect(detecterTypeInstallation({ platform: 'freebsd' })).toBe('unknown');
    });
});

describe('fichiers', () => {
    let dossier;
    beforeAll(() => {
        dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'tracebay-maj-'));
    });
    afterAll(() => fs.rmSync(dossier, { recursive: true, force: true }));

    test('lireTypePaquet : contenu sans blanc, null si absent', () => {
        const f = path.join(dossier, 'package-type');
        fs.writeFileSync(f, 'rpm\n');
        expect(lireTypePaquet(f)).toBe('rpm');
        expect(lireTypePaquet(path.join(dossier, 'absent'))).toBeNull();
    });

    test('sha512Fichier : base64, comme latest-*.yml', async () => {
        const f = path.join(dossier, 'paquet.deb');
        fs.writeFileSync(f, 'contenu');
        const attendu = crypto.createHash('sha512').update('contenu').digest('base64');
        await expect(sha512Fichier(f)).resolves.toBe(attendu);
        await expect(sha512Fichier(path.join(dossier, 'absent'))).rejects.toThrow();
    });
});

describe('empreintesYml', () => {
    test('une empreinte par fichier listé, fins de ligne Windows comprises', () => {
        const attendu = { 'workspace.AppImage': 'QUFB+/==', 'workspace.deb': 'REVC' };
        expect(empreintesYml(YML)).toEqual(attendu);
        expect(empreintesYml(YML.replace(/\n/g, '\r\n'))).toEqual(attendu);
    });

    test('rien à lire : objet vide', () => {
        expect(empreintesYml('')).toEqual({});
        expect(empreintesYml(null)).toEqual({});
        expect(empreintesYml('files:\n  - url: workspace.rpm\n    size: 3\n')).toEqual({});
    });
});

describe('scripts du helper', () => {
    test('installation root : deb et rpm, type inconnu refusé', () => {
        expect(scriptInstallationRoot('deb')).toContain('dpkg -i "$PKG"');
        const rpm = scriptInstallationRoot('rpm');
        expect(rpm).toContain('dnf install -y "$PKG"');
        expect(rpm).toContain('rpm -U --replacepkgs "$PKG"');
        expect(() => scriptInstallationRoot('AppImage')).toThrow(/non pris en charge/);
    });

    test('helper : met fin à une ancienne instance, une seule élévation, relance vérifiée, POSIX', () => {
        const helper = scriptHelper();
        expect(helper).toContain('kill -TERM "$WS_PID"');
        expect(helper.match(/pkexec env/g)).toHaveLength(1);
        expect(helper).toContain('relaunch ok');
        expect(helper).not.toMatch(/\bdisown\b/);
    });

    const sh = (() => {
        try {
            execFileSync('sh', ['-c', 'true']);
            return true;
        } catch (_) {
            return false;
        }
    })();
    (sh ? test : test.skip)('syntaxe sh valide (sh -n)', () => {
        for (const script of [scriptHelper(), scriptInstallationRoot('deb'), scriptInstallationRoot('rpm')]) {
            expect(() => execFileSync('sh', ['-n'], { input: script })).not.toThrow();
        }
    });
});

describe('publication en cours', () => {
    test('paquet Linux sans empreinte publiée : publication incomplète', () => {
        for (const packageType of ['AppImage', 'deb', 'rpm']) {
            expect(publicationIncomplete({ packageType, sha512: null })).toBe(true);
            expect(publicationIncomplete({ packageType, sha512: 'QUFB' })).toBe(false);
        }
    });

    test('Windows, macOS, archive : non concernés (electron-updater ou mise à jour à la main)', () => {
        for (const packageType of ['nsis', 'dmg', 'archive', 'portable']) {
            expect(publicationIncomplete({ packageType, sha512: null })).toBe(false);
        }
        expect(publicationIncomplete(null)).toBe(false);
    });

    test('message : nouvel essai annoncé, pas de refus sec', () => {
        expect(MESSAGE_PUBLICATION).toMatch(/en cours de publication/);
        expect(MESSAGE_PUBLICATION).toMatch(/nouvel essai dans quelques minutes/);
        expect(MESSAGE_PUBLICATION).not.toMatch(/refusée/);
    });
});
