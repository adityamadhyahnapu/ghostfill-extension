import { createLogger } from '../utils/logger';

const log = createLogger('OffscreenManager');

const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';

// Define types for newer/SW-specific Chrome APIs
type ExtendedChromeRuntime = typeof chrome.runtime & {
    getContexts(details: { contextTypes: string[]; documentUrls: string[] }): Promise<any[]>;
};

// Service Worker 'clients' API
interface LocalServiceWorkerGlobalScope {
    clients: {
        matchAll(options?: { includeUncontrolled?: boolean; type?: string }): Promise<Array<{ url: string }>>;
    };
}

class OffscreenManager {
    private creating: Promise<void> | null = null;
    private requestId = 0;

    /**
     * Check if an offscreen document already exists
     */
    private async hasOffscreenDocument(): Promise<boolean> {
        // Method 1: usage of chrome.runtime.getContexts (Chrome 116+)
        const runtime = chrome.runtime as unknown as ExtendedChromeRuntime;
        if ('getContexts' in runtime) {
            const contexts = await runtime.getContexts({
                contextTypes: ['OFFSCREEN_DOCUMENT'],
                documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)]
            });
            return contexts.length > 0;
        }

        // Method 2: Fallback to clients (Service Worker API)
        // Check if 'clients' exists in global scope (Service Worker context)
        if (typeof self !== 'undefined' && 'clients' in self) {
            const sw = self as unknown as LocalServiceWorkerGlobalScope;
            const clients = await sw.clients.matchAll();
            return clients.some(c => c.url === chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH));
        }

        return false;
    }

    /**
     * Ensure the offscreen document exists
     */
    async setupOffscreenDocument(): Promise<void> {
        if (await this.hasOffscreenDocument()) {
            return;
        }

        // In MV3, we can't easily check for existing offscreen docs without creating one 
        // or keeping state. We'll use a robust creation pattern.

        if (this.creating) {
            await this.creating;
        } else {
            this.creating = chrome.offscreen.createDocument({
                url: OFFSCREEN_DOCUMENT_PATH,
                reasons: [chrome.offscreen.Reason.DOM_SCRAPING],
                justification: 'Telepathic verification of magic links',
            });

            try {
                await this.creating;
            } catch (error) {
                // If it already exists (race condition), that's fine.
                const errorMsg = (error as Error).message;
                if (!errorMsg.includes('Only a single offscreen') && !errorMsg.includes('already exists')) {
                    log.error('Offscreen doc creation failed', { message: errorMsg });
                    throw error;
                }
            } finally {
                this.creating = null;
            }
        }
    }

    /**
     * Verify a magic link using the offscreen document
     */
    async verifyLink(url: string): Promise<{ success: boolean; error?: string }> {
        try {
            await this.setupOffscreenDocument();

            log.info('Sending link to offscreen document for verification', { url });

            // Send message to offscreen document
            const response = await chrome.runtime.sendMessage({
                action: 'VERIFY_LINK',
                payload: { url }
            });

            if (response && response.success) {
                log.info('Offscreen verification successful');
                return { success: true };
            } else {
                return { success: false, error: response?.error || 'Unknown error' };
            }
        } catch (error) {
            log.error('Offscreen verification failed', error);
            // Close the document on error to reset state if needed? 
            // Better to keep it open for performance, but if it captures bad state...
            return { success: false, error: (error as Error).message };
        }
    }

    /**
     * Close the offscreen document (cleanup)
     */
    async closeOffscreenDocument(): Promise<void> {
        try {
            await chrome.offscreen.closeDocument();
            log.info('Offscreen document closed');
        } catch (error) {
            // Ignore error if no document exists
        }
    }
}

export const offscreenManager = new OffscreenManager();
