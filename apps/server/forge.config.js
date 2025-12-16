module.exports = {
    packagerConfig: {
        asar: true
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
            platforms: ['darwin']
        },
        {
            name: '@electron-forge/maker-deb',
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
                        }
                    ]
                }
            }
        }
    ]
}
