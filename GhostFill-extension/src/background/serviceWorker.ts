// Service Worker Initialization

import { createLogger } from '../utils/logger';
import { storageService } from '../services/storageService';

const log = createLogger('ServiceWorker');

/**
 * Initialize the service worker
 */
export async function initServiceWorker(): Promise<void> {
    try {
        log.debug('Initializing service worker...');

        // Initialize storage with defensive error handling
        log.debug('Initializing storage...');
        try {
            await storageService.init();
        } catch (storageError) {
            log.warn('Storage init had issues, continuing anyway', storageError);
        }

        // Initialize LLM Service (AI) - delay slightly to ensure SW is fully ready
        setTimeout(async () => {
            try {
                log.debug('Importing LLM Service...');
                const { llmService } = await import('../services/llmService');

                log.debug('Initializing LLM Service...');
                await llmService.init();
            } catch (error) {
                log.warn('LLM Service failed to initialize (AI features disabled)', error);
            }
        }, 100);

        // Log storage usage
        log.debug('Getting storage usage...');
        const usage = await storageService.getUsage();
        log.debug('Storage usage', {
            used: `${(usage.used / 1024).toFixed(2)} KB`,
            percentage: `${usage.percentage.toFixed(2)}%`,
        });

        log.debug('Service worker initialized');
    } catch (error) {
        // Properly serialize DOMException and other error objects
        const errorDetails = error instanceof DOMException
            ? { name: error.name, message: error.message, code: error.code }
            : error instanceof Error
                ? { name: error.name, message: error.message }
                : error;
        log.error('Failed to initialize service worker', errorDetails);
    }
}

/**
 * Keep service worker alive (removed - utilizing Alarms instead for reliability)
 */
export function keepAlive(): void {
    // Deprecated: setInterval is unreliable in MV3 service workers.
    // We now rely on chrome.alarms for periodic tasks.
}

/**
 * Handle unhandled errors
 */
self.addEventListener('error', (event) => {
    log.error('Unhandled error', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
    });
});

self.addEventListener('unhandledrejection', (event) => {
    log.error('Unhandled promise rejection', { reason: event.reason });
});
