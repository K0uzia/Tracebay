export const NETWORK_CONFIG = {
  environments: {
    development: {
      client: {
        port: 3000,
        apiUrl: 'http://192.168.1.62:4000',
        wsUrl: 'ws://192.168.1.62:4000/ws'
      },
      server: {
        port: 5000,
        apiUrl: 'http://192.168.1.62:4000',
        wsUrl: 'ws://192.168.1.62:4000/ws'
      },
      proxmox: {
        port: 4000,
        host: 'localhost',
        database: 'sqlite',
        dbPath: './data/dev.db'
      }
    },
    production: {
      client: {
        port: 3000,
        apiUrl: 'https://api.workspace.local:4000',
        wsUrl: 'wss://api.workspace.local:4000/ws'
      },
      server: {
        port: 5000,
        apiUrl: 'https://api.workspace.local:4000',
        wsUrl: 'wss://api.workspace.local:4000/ws'
      },
      proxmox: {
        port: 4000,
        host: 'api.workspace.local',
        database: 'postgresql',
        dbHost: 'db.workspace.local',
        dbPort: 5432,
        dbName: 'workspace'
      }
    }
  }
}

export const getConfig = (env: 'development' | 'production') => {
  return NETWORK_CONFIG.environments[env]
}
