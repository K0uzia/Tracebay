import config from './env.js';

/**
 * Logger levels
 */
enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

/**
 * Simple logger utility
 */
class Logger {
  private level: LogLevel;

  constructor(level: string = 'info') {
    this.level = this.parseLevel(level);
  }

  private parseLevel(level: string): LogLevel {
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

  private log(level: LogLevel, message: string, meta?: unknown): void {
    if (level <= this.level) {
      const timestamp = new Date().toISOString();
      const levelName = LogLevel[level];
      const logMessage = meta
        ? `[${timestamp}] ${levelName}: ${message} ${JSON.stringify(meta)}`
        : `[${timestamp}] ${levelName}: ${message}`;
      console.log(logMessage);
    }
  }

  error(message: string, meta?: unknown): void {
    this.log(LogLevel.ERROR, message, meta);
  }

  warn(message: string, meta?: unknown): void {
    this.log(LogLevel.WARN, message, meta);
  }

  info(message: string, meta?: unknown): void {
    this.log(LogLevel.INFO, message, meta);
  }

  debug(message: string, meta?: unknown): void {
    this.log(LogLevel.DEBUG, message, meta);
  }
}

const logger = new Logger(config.logging.level);

export default logger;
