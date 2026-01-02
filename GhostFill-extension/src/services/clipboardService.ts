// Clipboard Service

import { createLogger } from '../utils/logger';
import { TIMING } from '../utils/constants';

const log = createLogger('ClipboardService');

class ClipboardService {
    private clearTimer: ReturnType<typeof setTimeout> | null = null;

    /**
     * Copy text to clipboard
     */
    async copy(text: string, autoClear: boolean = true): Promise<boolean> {
        try {
            // Check if we are in a Service Worker (no document)
            if (typeof document === 'undefined') {
                return this.copyOffscreen(text, autoClear);
            }

            // Standard context (popup, content script)
            await navigator.clipboard.writeText(text);
            log.debug('Copied to clipboard', { length: text.length });

            if (autoClear) {
                this.scheduleClear();
            }

            return true;
        } catch (error) {
            // Fallback for content scripts or older browsers
            return this.copyFallback(text, autoClear);
        }
    }

    /**
     * Copy using Offscreen API (for Service Worker)
     */
    private async copyOffscreen(text: string, autoClear: boolean): Promise<boolean> {
        try {
            await this.setupOffscreenDocument();

            // Send message to offscreen document
            await chrome.runtime.sendMessage({
                target: 'offscreen-doc',
                type: 'COPY_TO_CLIPBOARD',
                data: text
            });

            log.debug('Copied to clipboard (offscreen)');

            if (autoClear) {
                this.scheduleClear();
            }

            return true;
        } catch (error) {
            log.error('Offscreen copy failed', error);
            return false;
        }
    }

    /**
     * Setup offscreen document
     */
    private async setupOffscreenDocument(): Promise<void> {
        try {
            // Check if offscreen API is available
            if (!chrome.offscreen) {
                log.error('Offscreen API not available');
                return;
            }

            // Create offscreen document
            // If it already exists, this will throw an error which we can ignore
            await chrome.offscreen.createDocument({
                url: 'offscreen.html',
                reasons: [chrome.offscreen.Reason.CLIPBOARD],
                justification: 'To copy text to clipboard from background script'
            });
        } catch (error) {
            // Ignore error if document already exists
            const msg = (error as Error).message;
            if (!msg.includes('Only a single offscreen') && !msg.includes('already exists')) {
                log.warn('Failed to create offscreen document (might already exist)', error);
            }
        }
    }

    /**
     * Fallback copy method using execCommand
     */
    private copyFallback(text: string, autoClear: boolean): boolean {
        try {
            if (typeof document === 'undefined') return false;

            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;';
            document.body.appendChild(textArea);
            textArea.select();

            const success = document.execCommand('copy');
            document.body.removeChild(textArea);

            if (success) {
                log.debug('Copied to clipboard (fallback)');
                if (autoClear) {
                    this.scheduleClear();
                }
            }

            return success;
        } catch (error) {
            log.error('Clipboard copy failed', error);
            return false;
        }
    }

    /**
     * Read from clipboard
     */
    async read(): Promise<string | null> {
        try {
            const text = await navigator.clipboard.readText();
            return text;
        } catch (error) {
            log.warn('Clipboard read failed', error);
            return null;
        }
    }

    /**
     * Schedule clipboard clear after timeout
     */
    private scheduleClear(): void {
        // Clear any existing timer
        if (this.clearTimer) {
            clearTimeout(this.clearTimer);
        }

        this.clearTimer = setTimeout(() => {
            this.clear();
        }, TIMING.CLIPBOARD_CLEAR_SECONDS * 1000);
    }

    /**
     * Clear clipboard
     */
    async clear(): Promise<void> {
        try {
            await navigator.clipboard.writeText('');
            log.debug('Clipboard cleared');
        } catch {
            // Ignore errors when clearing
        }
    }

    /**
     * Cancel scheduled clear
     */
    cancelClear(): void {
        if (this.clearTimer) {
            clearTimeout(this.clearTimer);
            this.clearTimer = null;
        }
    }

    /**
     * Copy email and show notification
     */
    async copyEmail(email: string): Promise<boolean> {
        const success = await this.copy(email);
        return success;
    }

    /**
     * Copy password with auto-clear
     */
    async copyPassword(password: string): Promise<boolean> {
        const success = await this.copy(password, true);
        return success;
    }

    /**
     * Copy OTP and mark as copied
     */
    async copyOTP(otp: string): Promise<boolean> {
        const success = await this.copy(otp, false); // Don't auto-clear OTPs
        return success;
    }
}

// Export singleton instance
export const clipboardService = new ClipboardService();
