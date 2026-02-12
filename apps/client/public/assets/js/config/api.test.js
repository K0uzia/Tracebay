/**
 * Tests pour le module api.js
 */

const apiModule = require('./api.js');
const api = apiModule.default || apiModule;

describe('API Module', () => {
    beforeEach(() => {
        // Reset mocks
        fetch.mockClear();
        localStorage.clear();
        
        // Réinitialiser l'état de l'API en forçant la réinitialisation
        // En supprimant les configs globales
        delete window.SERVER_CONFIG;
        delete window.APP_CONFIG;
        
        // Mock SERVER_CONFIG
        window.SERVER_CONFIG = {
            serverUrl: 'http://test-server:4000',
            serverWsUrl: 'ws://test-server:4000',
            getEndpoint: jest.fn((path) => {
                const endpoints = {
                    'health': '/api/health',
                    'auth.login': '/api/auth/login',
                    'lots.list': '/api/lots'
                };
                return endpoints[path] || '';
            })
        };
        
        window.APP_CONFIG = {
            serverUrl: 'http://test-server:4000',
            serverWsUrl: 'ws://test-server:4000'
        };
    });

    describe('getServerUrl', () => {
        it('devrait retourner l\'URL du serveur depuis SERVER_CONFIG', () => {
            const url = api.getServerUrl();
            expect(url).toBe('http://test-server:4000');
        });

        it('devrait retourner localhost par défaut si SERVER_CONFIG n\'existe pas', () => {
            delete window.SERVER_CONFIG;
            delete window.APP_CONFIG;
            const url = api.getServerUrl();
            expect(url).toBe('http://localhost:8060');
        });
    });

    describe('getWsUrl', () => {
        it('devrait retourner l\'URL WebSocket depuis SERVER_CONFIG', () => {
            const url = api.getWsUrl();
            expect(url).toBe('ws://test-server:4000');
        });
    });

    describe('get', () => {
        it('devrait faire une requête GET vers l\'endpoint correct', async () => {
            // Supprimer SERVER_CONFIG pour forcer l'initialisation
            delete window.SERVER_CONFIG;
            delete window.APP_CONFIG;
            
            // Mock l'initialisation (premier appel fetch pour connection.json)
            fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    mode: 'local',
                    environments: {
                        local: { url: 'http://test-server:4000', ws: 'ws://test-server:4000' }
                    }
                })
            });
            
            // Mock la réponse de l'endpoint
            const mockResponse = {
                ok: true,
                json: async () => ({ success: true })
            };
            fetch.mockResolvedValueOnce(mockResponse);

            const result = await api.get('health');

            expect(fetch).toHaveBeenCalledTimes(2);
            const endpointCall = fetch.mock.calls[1];
            expect(endpointCall[0]).toMatch(/\/health/);
            expect(endpointCall[1]).toMatchObject({
                method: 'GET',
                headers: expect.objectContaining({
                    'Content-Type': 'application/json'
                })
            });
            expect(result).toBeDefined();
            expect(result.ok).toBe(true);
        });

        it('devrait inclure le token d\'authentification si présent', async () => {
            localStorage.setItem('workspace_jwt', 'test-token');
            
            // Mock la réponse de l'endpoint (pas besoin d'init car SERVER_CONFIG existe déjà)
            const mockResponse = {
                ok: true,
                json: async () => ({ success: true })
            };
            fetch.mockResolvedValueOnce(mockResponse);

            await api.get('health');

            expect(fetch).toHaveBeenCalledTimes(1);
            const headers = fetch.mock.calls[0][1].headers;
            expect(headers['Authorization']).toBe('Bearer test-token');
        });
    });

    describe('post', () => {
        it('devrait faire une requête POST avec les données', async () => {
            // Mock la réponse de l'endpoint (pas besoin d'init car SERVER_CONFIG existe déjà)
            const mockResponse = {
                ok: true,
                json: async () => ({ success: true })
            };
            fetch.mockResolvedValueOnce(mockResponse);

            const result = await api.post('auth.login', { username: 'test', password: 'pass' });

            expect(fetch).toHaveBeenCalledTimes(1);
            const url = fetch.mock.calls[0][0];
            expect(url).toMatch(/auth\.login|auth\/login/);
            expect(fetch.mock.calls[0][1]).toMatchObject({
                method: 'POST',
                body: JSON.stringify({ username: 'test', password: 'pass' })
            });
            expect(result).toBeDefined();
            expect(result.ok).toBe(true);
        });
    });
});
