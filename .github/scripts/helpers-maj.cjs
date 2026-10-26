// Écrit helper.sh et install-root.sh (mise à jour .deb) pour le job test-maj-deb.
// nouveau : scripts de apps/client/linux-update.js ; ancien : extraits du main.js d'une version publiée.
// Usage : node helpers-maj.cjs nouveau <dossier>  |  node helpers-maj.cjs ancien <dossier> <main.js>
const fs = require('fs');
const path = require('path');

const [mode, dossier, ancienMain] = process.argv.slice(2);
let helper;
let root;
if (mode === 'nouveau') {
    const m = require(path.resolve(__dirname, '../../apps/client/linux-update.js'));
    helper = m.scriptHelper();
    root = m.scriptInstallationRoot('deb');
} else if (mode === 'ancien' && ancienMain) {
    // Le helper AppImage, plus haut dans le fichier, a lui aussi un scriptBody
    const complet = fs.readFileSync(ancienMain, 'utf8');
    const source = complet.slice(complet.indexOf('function tryLinuxDebUpdateHelper'));
    const extraire = (nom) => {
        const m = source.match(new RegExp(`const ${nom} = \`([\\s\\S]*?)\`;`));
        if (!m || m[1].includes('${') || m[1].includes('\\')) {
            throw new Error(`Script ${nom} introuvable ou non littéral dans ${ancienMain}`);
        }
        return m[1];
    };
    helper = extraire('scriptBody');
    root = extraire('installRootBody');
} else {
    throw new Error('Usage : helpers-maj.cjs nouveau|ancien <dossier> [main.js]');
}
fs.mkdirSync(dossier, { recursive: true });
fs.writeFileSync(path.join(dossier, 'helper.sh'), helper, { mode: 0o755 });
fs.writeFileSync(path.join(dossier, 'install-root.sh'), root, { mode: 0o755 });
console.log(`${mode} : scripts écrits dans ${dossier}`);
