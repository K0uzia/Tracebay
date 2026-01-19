"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConfig = exports.NETWORK_CONFIG = void 0;
exports.NETWORK_CONFIG = {
    environments: {
        development: {
            client: {
                port: 3000,
                apiUrl: 'http://localhost:4000',
                wsUrl: 'ws://localhost:4000/ws'
            },
            server: {
                port: 5000,
                apiUrl: 'http://localhost:4000',
                wsUrl: 'ws://localhost:4000/ws'
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
};
const getConfig = (env) => {
    return exports.NETWORK_CONFIG.environments[env];
};
exports.getConfig = getConfig;
