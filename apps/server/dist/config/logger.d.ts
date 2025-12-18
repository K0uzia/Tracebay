/**
 * Simple logger utility
 */
declare class Logger {
    private level;
    constructor(level?: string);
    private parseLevel;
    private log;
    error(message: string, meta?: unknown): void;
    warn(message: string, meta?: unknown): void;
    info(message: string, meta?: unknown): void;
    debug(message: string, meta?: unknown): void;
}
declare const logger: Logger;
export default logger;
