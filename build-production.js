#!/usr/bin/env node

/**
 * Build Production - Crée un exécutable unique avec serveur + client
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    blue: '\x1b[34m'
};

function log(type, message) {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = {
        info: `[${colors.blue}INFO${colors.reset}]`,
        success: `[${colors.green}✓${colors.reset}]`,
        warn: `[${colors.yellow}⚠${colors.reset}]`,
        error: `[${colors.red}✗${colors.reset}]`
    }[type] || `[${type}]`;
    
    console.log(`${colors.bright}${timestamp}${colors.reset} ${prefix} ${message}`);
}

function exec(command, cwd, silent = false) {
    try {
        const result = execSync(command, {
            cwd: cwd,
            stdio: silent ? 'pipe' : 'inherit',
            encoding: 'utf-8'
        });
        return result;
    } catch (error) {
        log('error', `Commande échouée: ${command}`);
        throw error;
    }
}

async function main() {
    log('info', `${colors.bright}=== Build Production Workspace ===${colors.reset}`);
    
    const rootDir = path.join(__dirname);
    const serverDir = path.join(rootDir, 'apps', 'server');
    const clientDir = path.join(rootDir, 'apps', 'client');
    const buildDir = path.join(rootDir, 'dist');
    
    try {
        // 1. Nettoyer le dossier dist
        log('info', 'Nettoyage du dossier dist...');
        if (fs.existsSync(buildDir)) {
            execSync(`rm -rf "${buildDir}"`);
        }
        fs.mkdirSync(buildDir, { recursive: true });
        
        // 2. Builder le serveur (API uniquement, pas Electron)
        log('info', 'Building du serveur...');
        exec('npm run build:api', serverDir);
        log('success', 'Serveur buildé');
        
        // 3. Builder le client
        log('info', 'Building du client...');
        exec('npm run build', clientDir);
        log('success', 'Client buildé');
        
        // 4. Copier les fichiers buildés vers dist
        log('info', 'Assemblage des fichiers...');
        
        // Créer les dossiers
        fs.mkdirSync(path.join(buildDir, 'server'), { recursive: true });
        fs.mkdirSync(path.join(buildDir, 'client'), { recursive: true });
        
        // Copier le serveur out
        const serverOut = path.join(serverDir, 'out');
        if (fs.existsSync(serverOut)) {
            exec(`cp -r "${serverOut}"/* "${path.join(buildDir, 'server')}/"`);
            log('success', 'Serveur copié');
        } else {
            log('warn', 'Dossier serveur out non trouvé');
        }
        
        // Copier le client
        // Chercher les exécutables dans out/make/
        const clientMakeDir = path.join(clientDir, 'out', 'make');
        if (fs.existsSync(clientMakeDir)) {
            // Copier tous les fichiers et dossiers (zip, deb, etc.)
            exec(`cp -r "${clientMakeDir}"/* "${path.join(buildDir, 'client')}/"`);
            log('success', 'Client exécutables copiés');
        } else {
            log('warn', 'Dossier client out/make non trouvé');
        }
        
        // 5. Créer un script launcher
        log('info', 'Création du script launcher...');
        const launcherContent = `#!/bin/bash
# Launcher de Workspace en Production

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Démarrer le serveur en arrière-plan
cd "$DIR/server"
node server.js &
SERVER_PID=$!

# Attendre que le serveur soit prêt
sleep 3

# Démarrer le client
cd "$DIR/client"
# Trouver l'exécutable Electron
CLIENT_EXE=$(find . -name "Workspace*" -o -name "workspace*" | grep -v ".app" | head -1)
if [ -n "$CLIENT_EXE" ]; then
    "$CLIENT_EXE"
else
    echo "❌ Pas trouvé d'exécutable client"
    kill $SERVER_PID 2>/dev/null || true
    exit 1
fi

# Arrêter le serveur à la fermeture du client
kill $SERVER_PID 2>/dev/null || true
`;
        
        const launcherPath = path.join(buildDir, 'start-workspace');
        fs.writeFileSync(launcherPath, launcherContent, { mode: 0o755 });
        log('success', 'Script launcher créé');
        
        log('success', `${colors.bright}BUILD TERMINÉ !${colors.reset}`);
        log('info', `📦 Fichiers dans: ${buildDir}`);
        log('info', '🚀 Pour lancer: ./dist/start-workspace');
        
    } catch (error) {
        log('error', `Erreur: ${error.message}`);
        process.exit(1);
    }
}

main();
