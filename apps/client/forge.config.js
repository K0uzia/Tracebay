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
                maintainer: 'Sandersonn <sandersonn@users.noreply.github.com>',
                homepage: 'https://github.com/SandersonnDev/workspace',
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
                    owner: 'SandersonnDev',
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
