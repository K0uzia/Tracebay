/**
 * Tests pour le module ErrorHandler.js
 */

const { ErrorHandler } = require('./ErrorHandler.js');

describe('ErrorHandler', () => {
    let errorHandler;
    let notificationCallback;

    beforeEach(() => {
        errorHandler = new ErrorHandler();
        notificationCallback = jest.fn();
        errorHandler.onNotification(notificationCallback);
    });

    describe('handleApiError', () => {
        it('devrait gérer une erreur 404 correctement', () => {
            const error = {
                response: {
                    status: 404,
                    data: { message: 'Not found' }
                }
            };

            const result = errorHandler.handleApiError(error, 'test');

            expect(result.userMessage).toBe('Ressource non trouvée');
            expect(notificationCallback).toHaveBeenCalledWith('Ressource non trouvée', 'error');
        });

        it('devrait gérer une erreur réseau correctement', () => {
            const error = {
                request: {}
            };

            const result = errorHandler.handleApiError(error);

            expect(result.userMessage).toBe('Impossible de contacter le serveur. Vérifiez votre connexion');
            expect(notificationCallback).toHaveBeenCalled();
        });
    });

    describe('Notifications', () => {
        it('devrait appeler les callbacks de notification', () => {
            errorHandler.showSuccess('Success message');
            expect(notificationCallback).toHaveBeenCalledWith('Success message', 'success');
        });

        it('devrait gérer plusieurs callbacks', () => {
            const callback2 = jest.fn();
            errorHandler.onNotification(callback2);

            errorHandler.showInfo('Info message');

            expect(notificationCallback).toHaveBeenCalled();
            expect(callback2).toHaveBeenCalled();
        });
    });
});
