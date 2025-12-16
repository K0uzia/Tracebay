/**
 * Logger Module - Tracks HTTP requests and chat messages
 * Provides API endpoints for retrieving logs
 */

class ServerLogger {
    constructor() {
        this.requestLogs = [];
        this.chatLogs = [];
        this.maxLogs = 500;
    }

    /**
     * Log an HTTP request
     */
    logRequest(method, path, status, statusText, duration) {
        const log = {
            timestamp: new Date().toISOString(),
            method: method,
            path: path,
            status: status,
            statusText: statusText,
            duration: duration
        };

        this.requestLogs.push(log);

        // Keep array size limited
        if (this.requestLogs.length > this.maxLogs) {
            this.requestLogs.shift();
        }

        return log;
    }

    /**
     * Log a chat message
     */
    logChatMessage(user, message, timestamp = new Date()) {
        const log = {
            timestamp: timestamp.toISOString(),
            user: user,
            message: message
        };

        this.chatLogs.push(log);

        // Keep array size limited
        if (this.chatLogs.length > this.maxLogs) {
            this.chatLogs.shift();
        }

        return log;
    }

    /**
     * Get recent request logs
     */
    getRequestLogs(limit = 100) {
        return this.requestLogs.slice(-limit);
    }

    /**
     * Get recent chat logs
     */
    getChatLogs(limit = 100) {
        return this.chatLogs.slice(-limit);
    }

    /**
     * Clear request logs
     */
    clearRequestLogs() {
        this.requestLogs = [];
    }

    /**
     * Clear chat logs
     */
    clearChatLogs() {
        this.chatLogs = [];
    }
}

// Create global instance
const serverLogger = new ServerLogger();

module.exports = serverLogger;
