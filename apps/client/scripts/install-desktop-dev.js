#!/usr/bin/env node
/**
 * Installe le fichier .desktop pour le mode dev Linux (icône dans la barre des tâches).
 * À lancer depuis apps/client : npm run install-desktop-dev
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const clientDir = path.resolve(__dirname, '..');
const desktopSrc = path.join(clientDir, 'workspace-client-dev.desktop');
const desktopDir = path.join(os.homedir(), '.local', 'share', 'applications');
const desktopDest = path.join(desktopDir, 'workspace-client-dev.desktop');

const placeholder = 'REMPLACER_PAR_CHEMIN_ABSOLU_APPS_CLIENT';
const content = fs.readFileSync(desktopSrc, 'utf8').split(placeholder).join(clientDir);

if (!fs.existsSync(desktopDir)) {
    fs.mkdirSync(desktopDir, { recursive: true });
}
fs.writeFileSync(desktopDest, content);
fs.chmodSync(desktopDest, 0o644);
const startScript = path.join(clientDir, 'start-dev.sh');
if (fs.existsSync(startScript)) fs.chmodSync(startScript, 0o755);
console.log('✅ Fichier .desktop installé :', desktopDest);
console.log('   L’icône devrait s’afficher si tu lances l’app depuis le menu (Workspace Client Dev),');
console.log('   ou après redémarrage de la session si le WM matche déjà au WM_CLASS.');
