module.exports = {
    packagerConfig: {
        asar: true,
        asarUnpack: [
            '**/node_modules/sqlite3/**',
            '**/node_modules/bcrypt/**'
        ],
        ignore: [
            /^\/\.git/,
            /^\/\.vscode/,
            /^\/node_modules\/\.cache/,
            /^\/out/,
            /^\/dist/
        ]
    },
    makers: [
        {
            name: '@electron-forge/maker-squirrel',
            config: {
                name: 'workspace_server'
            }
        },
        {
            name: '@electron-forge/maker-zip',
            platforms: ['darwin', 'linux']
        },
        {
            name: '@electron-forge/maker-deb',
            platforms: ['linux'],
            config: {}
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
    ]
};
