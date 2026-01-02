/* eslint-disable no-console */
// Debug Logger

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
    level: LogLevel;
    message: string;
    data?: unknown;
    timestamp: number;
    source?: string;
}

class Logger {
    private enabled: boolean = true;
    private prefix: string = '[GhostFill]';
    private history: LogEntry[] = [];
    private maxHistory: number = 100;

    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
    }

    setPrefix(prefix: string): void {
        this.prefix = prefix;
    }

    private log(level: LogLevel, message: string, data?: unknown, source?: string): void {
        const entry: LogEntry = {
            level,
            message,
            data,
            timestamp: Date.now(),
            source,
        };

        // Store in history
        this.history.push(entry);
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }

        if (!this.enabled && level !== 'error') return;

        const timestamp = new Date().toISOString();
        const formattedMessage = `${this.prefix} [${timestamp}] [${level.toUpperCase()}]${source ? ` [${source}]` : ''} ${message}`;

        switch (level) {
            case 'debug':
                if (data !== undefined) {
                    console.debug(formattedMessage, data);
                } else {
                    console.debug(formattedMessage);
                }
                break;
            case 'info':
                if (data !== undefined) {
                    console.info(formattedMessage, data);
                } else {
                    console.info(formattedMessage);
                }
                break;
            case 'warn':
                if (data !== undefined) {
                    console.warn(formattedMessage, data);
                } else {
                    console.warn(formattedMessage);
                }
                break;
            case 'error':
                if (data !== undefined) {
                    console.error(formattedMessage, data);
                } else {
                    console.error(formattedMessage);
                }
                break;
        }
    }

    debug(message: string, data?: unknown, source?: string): void {
        this.log('debug', message, data, source);
    }

    info(message: string, data?: unknown, source?: string): void {
        this.log('info', message, data, source);
    }

    warn(message: string, data?: unknown, source?: string): void {
        this.log('warn', message, data, source);
    }

    error(message: string, data?: unknown, source?: string): void {
        this.log('error', message, data, source);
    }

    getHistory(): LogEntry[] {
        return [...this.history];
    }

    clearHistory(): void {
        this.history = [];
    }

    // Create a child logger with a specific source
    child(source: string): ChildLogger {
        return new ChildLogger(this, source);
    }
}

class ChildLogger {
    constructor(
        private parent: Logger,
        private source: string
    ) { }

    debug(message: string, data?: unknown): void {
        this.parent.debug(message, data, this.source);
    }

    info(message: string, data?: unknown): void {
        this.parent.info(message, data, this.source);
    }

    warn(message: string, data?: unknown): void {
        this.parent.warn(message, data, this.source);
    }

    error(message: string, data?: unknown): void {
        this.parent.error(message, data, this.source);
    }
}

// Export singleton instance
export const logger = new Logger();

// Export for creating child loggers
export function createLogger(source: string): ChildLogger {
    return logger.child(source);
}
