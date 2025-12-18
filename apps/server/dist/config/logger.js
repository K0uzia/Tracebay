import config from './env.js';
/**
 * Logger levels
 */
var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["ERROR"] = 0] = "ERROR";
    LogLevel[LogLevel["WARN"] = 1] = "WARN";
    LogLevel[LogLevel["INFO"] = 2] = "INFO";
    LogLevel[LogLevel["DEBUG"] = 3] = "DEBUG";
})(LogLevel || (LogLevel = {}));
/**
 * Simple logger utility
 */
class Logger {
    constructor(level = 'info') {
        this.level = this.parseLevel(level);
    }
    parseLevel(level) {
        switch (level.toLowerCase()) {
            case 'error':
                return LogLevel.ERROR;
            case 'warn':
                return LogLevel.WARN;
            case 'info':
                return LogLevel.INFO;
            case 'debug':
                return LogLevel.DEBUG;
            default:
                return LogLevel.INFO;
        }
    }
    log(level, message, meta) {
        if (level <= this.level) {
            const timestamp = new Date().toISOString();
            const levelName = LogLevel[level];
            const logMessage = meta
                ? `[${timestamp}] ${levelName}: ${message} ${JSON.stringify(meta)}`
                : `[${timestamp}] ${levelName}: ${message}`;
            console.log(logMessage);
        }
    }
    error(message, meta) {
        this.log(LogLevel.ERROR, message, meta);
    }
    warn(message, meta) {
        this.log(LogLevel.WARN, message, meta);
    }
    info(message, meta) {
        this.log(LogLevel.INFO, message, meta);
    }
    debug(message, meta) {
        this.log(LogLevel.DEBUG, message, meta);
    }
}
const logger = new Logger(config.logging.level);
export default logger;
//# sourceMappingURL=logger.js.map