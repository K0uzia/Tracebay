/**
 * Tests pour le module Logger.js
 */

const { Logger } = require('./Logger.js');

describe('Logger', () => {
    let logger;

    beforeEach(() => {
        logger = new Logger();
        console.debug = jest.fn();
        console.info = jest.fn();
        console.warn = jest.fn();
        console.error = jest.fn();
    });

    describe('Niveaux de log', () => {
        it('devrait logger les messages INFO par défaut', () => {
            logger.info('Test message');
            expect(console.info).toHaveBeenCalled();
        });

        it('ne devrait pas logger DEBUG si niveau INFO', () => {
            logger.setLevel('INFO');
            logger.debug('Debug message');
            expect(console.debug).not.toHaveBeenCalled();
        });

        it('devrait logger ERROR même si niveau INFO', () => {
            logger.setLevel('INFO');
            logger.error('Error message');
            expect(console.error).toHaveBeenCalled();
        });
    });

    describe('Désactivation', () => {
        it('ne devrait pas logger quand désactivé', () => {
            logger.disable();
            logger.info('Test');
            logger.error('Error');
            expect(console.info).not.toHaveBeenCalled();
            expect(console.error).not.toHaveBeenCalled();
        });
    });

    describe('Formatage', () => {
        it('devrait formater les messages avec timestamp et niveau', () => {
            logger.info('Test message');
            const call = console.info.mock.calls[0][0];
            expect(call).toContain('[INFO]');
            expect(call).toContain('Test message');
        });
    });
});
