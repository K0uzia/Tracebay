module.exports = {
    packagerConfig: {
        asar: true,
        icon: './assets/icon',
    },
    makers: [
        {
            name: '@electron-forge/maker-squirrel',
            config: {
                name: 'workspace_client'
            }
        },
        {
            name: '@electron-forge/maker-zip',
            platforms: ['darwin', 'linux']
        },
        {
            name: '@electron-forge/maker-deb',
            platforms: ['linux'],
            config: {    
                maintainer: 'K0uzia <k0uzia@users.noreply.github.com>',
                homepage: 'https://github.com/K0uzia/workspace',
                categories: ['Utility', 'Network'],
                section: 'utils',
                priority: 'optional',
                icon: './assets/icon.png',
                productName: 'Workspace',
                productDescription: 'Workspace - Interface utilisateur collaborative',
                depends: ['libgtk-3-0', 'libnotify4', 'libnss3', 'xdg-utils'],
                recommends: [],
                suggests: []
            }
        }
    ],
    publishers: [
        {
            name: '@electron-forge/publisher-github',
            config: {
                repository: {
                    owner: 'K0uzia',
                    name: 'Workspace'
                },
                prerelease: false,
                draft: true,
                authToken: process.env.GITHUB_TOKEN
            }
        }
    ],
    // No webpack plugin: pure Electron (requested)
}
