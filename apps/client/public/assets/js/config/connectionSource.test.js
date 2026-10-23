/**
 * Source de la configuration de connexion : le processus principal (config/connection.json et
 * SERVER_MODE) d'abord, le fichier servi à côté de la page seulement hors Electron.
 */

const cfg = (mode) => ({
    mode,
    environments: {
        local: { url: 'http://localhost:8060', ws: 'ws://localhost:8060' },
        proxmox: { url: 'http://192.0.2.62:4000', ws: 'ws://192.0.2.62:4000' }
    },
    endpoints: { health: '/api/health' }
});

const ok = (body) => ({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => body,
    clone() {
        return this;
    }
});

function apiNeuve() {
    let api;
    jest.isolateModules(() => {
        const m = require('./api.js');
        api = m.default || m;
    });
    return api;
}

beforeEach(() => {
    fetch.mockReset();
    delete window.SERVER_CONFIG;
    delete window.APP_CONFIG;
    delete window.electron;
});

test('Electron : mode du processus principal (SERVER_MODE compris), fichier non lu', async () => {
    window.electron = { invoke: jest.fn(async (canal) => (canal === 'get-connection-config' ? cfg('local') : {})) };
    fetch.mockResolvedValue(ok({ status: 'ok' }));
    await apiNeuve().get('health');
    expect(window.electron.invoke).toHaveBeenCalledWith('get-connection-config');
    expect(window.SERVER_CONFIG.serverUrl).toBe('http://localhost:8060');
    expect(fetch.mock.calls.map((c) => String(c[0]))).not.toContain('./config/connection.json');
});

test('hors Electron : fichier connection.json servi à côté de la page', async () => {
    fetch.mockResolvedValueOnce(ok(cfg('proxmox'))).mockResolvedValue(ok({ status: 'ok' }));
    await apiNeuve().get('health');
    expect(String(fetch.mock.calls[0][0])).toBe('./config/connection.json');
    expect(window.SERVER_CONFIG.serverUrl).toBe('http://192.0.2.62:4000');
});
