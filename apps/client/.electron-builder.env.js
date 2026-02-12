/**
 * Configuration dynamique pour electron-builder selon l'environnement
 * Ce fichier permet de différencier les builds dev/prod
 */

const isProduction = process.env.NODE_ENV === 'production';

module.exports = {
    /**
     * Configuration pour les builds de développement (portables)
     */
    dev: {
        publish: null, // Pas de publication en dev
        win: {
            target: ['portable']
        },
        mac: {
            target: ['dir'] // Dossier au lieu de DMG
        },
        linux: {
            target: ['dir'] // Dossier au lieu d'AppImage/Deb
        }
    },
    
    /**
     * Configuration pour les builds de production (installateurs + publication)
     */
    prod: {
        publish: {
            provider: 'github',
            owner: 'SandersonnDev',
            repo: 'Workspace',
            releaseType: 'release'
        },
        win: {
            target: [
                {
                    target: 'nsis',
                    arch: ['x64']
                },
                {
                    target: 'portable',
                    arch: ['x64']
                }
            ]
        },
        mac: {
            target: [
                {
                    target: 'dmg',
                    arch: ['x64', 'arm64']
                }
            ]
        },
        linux: {
            target: [
                {
                    target: 'AppImage',
                    arch: ['x64']
                },
                {
                    target: 'deb',
                    arch: ['x64']
                }
            ]
        }
    }
};
