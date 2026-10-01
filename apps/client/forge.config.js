module.exports = {
    packagerConfig: {
        asar: true,
        icon: './assets/linux/icons/512x512.png',
    },
    makers: [
        {
            name: '@electron-forge/maker-squirrel',
            config: {
                name: 'Tracebay_client'
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
                homepage: 'https://github.com/K0uzia/Tracebay',
                categories: ['Utility', 'Network'],
                section: 'utils',
                priority: 'optional',
                icon: './assets/linux/icons/512x512.png',
                productName: 'Tracebay',
                name: 'workspace',
                bin: 'workspace',
                productDescription: 'Tracebay — traçabilité de matériel informatique',
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
                    name: 'Tracebay'
                },
                prerelease: false,
                draft: true,
                authToken: process.env.GITHUB_TOKEN
            }
        }
    ],
    // No webpack plugin: pure Electron (requested)
}
