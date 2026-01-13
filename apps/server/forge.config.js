const path = require('path');

module.exports = {
    packagerConfig: {
        asar: false,
        ignore: [
            /^\/\.git/,
            /^\/\.vscode/,
            /^\/node_modules\/\.cache/,
            /^\/out/,
            /^\/dist/,
            /^\/\.env/,
            /^\/\.gitignore/
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
