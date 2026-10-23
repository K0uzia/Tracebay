/**
 * Génère THIRD_PARTY_LICENSES.txt : licences des composants tiers livrés avec l'application
 * (dépendances npm de production et leurs dépendances, Electron, Font Awesome Free).
 * Appelé par electron-builder (hook beforePack) avant chaque paquet, ou à la main :
 *   node apps/client/scripts/third-party-licenses.js
 * Écrit sans dépendance : la liste vient des package.json installés (node_modules), pas du réseau.
 */
const fs = require('fs');
const path = require('path');

const CLIENT_DIR = path.join(__dirname, '..');
const OUT_FILE = path.join(CLIENT_DIR, 'THIRD_PARTY_LICENSES.txt');
const LICENSE_FILE = /^(licen[cs]e|copying|notice)(\.|-|$)/i;
// Licences incompatibles avec une distribution propriétaire sans examen
const COPYLEFT = /\b(A?GPL|LGPL|SSPL|EUPL|CDDL|MPL)\b/i;

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Dossier d'un paquet installé, en remontant les node_modules depuis fromDir (résolution Node). */
function findPackageDir(name, fromDir) {
    let dir = fromDir;
    for (;;) {
        const candidate = path.join(dir, 'node_modules', name);
        if (fs.existsSync(path.join(candidate, 'package.json'))) {
            return candidate;
        }
        const parent = path.dirname(dir);
        if (parent === dir) {
            return null;
        }
        dir = parent;
    }
}

function licenseOf(pkg) {
    if (typeof pkg.license === 'string') {
        return pkg.license;
    }
    if (pkg.license && pkg.license.type) {
        return pkg.license.type;
    }
    if (Array.isArray(pkg.licenses)) {
        return pkg.licenses.map((l) => l.type || l).join(' OR ');
    }
    return 'Non déclarée';
}

function licenseTexts(dir) {
    return fs.readdirSync(dir)
        .filter((f) => LICENSE_FILE.test(f) && fs.statSync(path.join(dir, f)).isFile())
        .sort()
        .map((f) => fs.readFileSync(path.join(dir, f), 'utf8').trim());
}

function repoOf(pkg) {
    const r = pkg.repository;
    const url = typeof r === 'string' ? r : (r && r.url) || pkg.homepage || '';
    return url.replace(/^git\+/, '').replace(/\.git$/, '');
}

/** Dépendances de production, transitives, dédoublonnées par nom et version. */
function collectProductionPackages() {
    const root = readJson(path.join(CLIENT_DIR, 'package.json'));
    const seen = new Map();
    const queue = Object.keys({ ...root.dependencies, ...root.optionalDependencies }).map((name) => ({ name, from: CLIENT_DIR }));
    const missing = [];
    while (queue.length) {
        const { name, from } = queue.shift();
        const dir = findPackageDir(name, from);
        if (!dir) {
            missing.push(name);
            continue;
        }
        const pkg = readJson(path.join(dir, 'package.json'));
        const key = `${pkg.name}@${pkg.version}`;
        if (seen.has(key)) {
            continue;
        }
        seen.set(key, { pkg, dir });
        for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies })) {
            queue.push({ name: dep, from: dir });
        }
    }
    return { packages: [...seen.values()].sort((a, b) => a.pkg.name.localeCompare(b.pkg.name)), missing };
}

function section(title, license, source, texts) {
    const lines = ['='.repeat(78), title, `Licence : ${license}`];
    if (source) {
        lines.push(`Source : ${source}`);
    }
    lines.push('-'.repeat(78), texts.length ? texts.join('\n\n') : '(aucun fichier de licence fourni par le paquet ; voir la licence déclarée ci-dessus)', '');
    return lines.join('\n');
}

function generate() {
    const { packages, missing } = collectProductionPackages();
    const parts = [
        'Tracebay : licences des composants tiers',
        '',
        'Tracebay intègre les composants ci-dessous, chacun régi par sa propre licence.',
        'Les licences de Chromium et de ses composants sont dans le fichier',
        'LICENSES.chromium.html livré à côté de l\'exécutable de Tracebay.',
        ''
    ];

    const electronDir = findPackageDir('electron', CLIENT_DIR);
    if (electronDir) {
        const pkg = readJson(path.join(electronDir, 'package.json'));
        const distLicense = path.join(electronDir, 'dist', 'LICENSE');
        const texts = fs.existsSync(distLicense) ? [fs.readFileSync(distLicense, 'utf8').trim()] : licenseTexts(electronDir);
        parts.push(section(`Electron ${pkg.version}`, licenseOf(pkg), 'https://github.com/electron/electron', texts));
    }

    const faCss = path.join(CLIENT_DIR, 'public', 'lib', 'fontawesome', 'all.min.css');
    if (fs.existsSync(faCss)) {
        const version = (/Font Awesome Free ([\d.]+)/.exec(fs.readFileSync(faCss, 'utf8').slice(0, 400)) || [])[1] || '';
        parts.push(section(`Font Awesome Free ${version}`.trim(), 'Icônes : CC BY 4.0 ; polices : SIL OFL 1.1 ; code : MIT', 'https://fontawesome.com/license/free',
            ['Copyright 2024 Fonticons, Inc.\nIcônes : Creative Commons Attribution 4.0 International (https://creativecommons.org/licenses/by/4.0/)\nPolices : SIL Open Font License 1.1 (https://openfontlicense.org)\nCode : MIT License (https://opensource.org/licenses/MIT)']));
    }

    for (const { pkg, dir } of packages) {
        parts.push(section(`${pkg.name} ${pkg.version}`, licenseOf(pkg), repoOf(pkg), licenseTexts(dir)));
    }

    fs.writeFileSync(OUT_FILE, `${parts.join('\n')}\n`, 'utf8');
    const copyleft = packages.filter(({ pkg }) => COPYLEFT.test(licenseOf(pkg))).map(({ pkg }) => `${pkg.name} (${licenseOf(pkg)})`);
    return { file: OUT_FILE, count: packages.length, missing, copyleft };
}

module.exports = async function beforePack() {
    const res = generate();
    if (res.missing.length) {
        throw new Error(`Licences tierces : paquets introuvables dans node_modules : ${res.missing.join(', ')}`);
    }
    if (res.copyleft.length) {
        console.warn(`[licences] à examiner (copyleft) : ${res.copyleft.join(', ')}`);
    }
    console.log(`[licences] ${res.count} paquets npm de production -> ${path.basename(res.file)}`);
};
module.exports.generate = generate;

if (require.main === module) {
    const res = generate();
    console.log(JSON.stringify({ ...res, file: path.relative(process.cwd(), res.file) }, null, 2));
    if (res.missing.length) {
        process.exitCode = 1;
    }
}
