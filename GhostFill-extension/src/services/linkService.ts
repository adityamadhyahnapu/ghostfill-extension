// Link Activation Service - AI ONLY (No Regex)

import { createLogger } from '../utils/logger';
import { Email } from '../types';
import { notifySuccess, notifyError } from '../background/notifications';

const log = createLogger('LinkService');

export interface ActivationLink {
    url: string;
    confidence: number;
}

// Cache of processed email IDs
const processedEmailIds = new Set<string>();
const MAX_PROCESSED_CACHE = 100;

class LinkService {
    /**
     * Handle a new email by checking for activation links
     */
    async handleNewEmail(email: Email): Promise<void> {
        console.log('========================================');
        console.log('📧 HANDLE NEW EMAIL CALLED');
        console.log('📧 Email ID:', email.id);
        console.log('📧 Subject:', email.subject);
        console.log('========================================');

        const emailIdStr = String(email.id);

        // Deduplication
        if (processedEmailIds.has(emailIdStr)) {
            console.log('📧 SKIPPED: Email already processed');
            log.debug('Email already processed, skipping', { emailId: emailIdStr });
            return;
        }

        // Add to cache
        if (processedEmailIds.size >= MAX_PROCESSED_CACHE) {
            const firstId = processedEmailIds.values().next().value;
            if (firstId) processedEmailIds.delete(firstId);
        }
        processedEmailIds.add(emailIdStr);

        log.info('Processing email for activation links', { emailId: emailIdStr });

        // Use AI to find activation link
        try {
            const { llmService } = await import('./llmService');
            // Use plain text body first (has the actual link visible)
            const emailContent = email.body || email.htmlBody || '';
            const result = await llmService.parseEmail(emailContent, email.subject);

            if (result.link && result.confidence >= 0.3) {
                log.info('AI found activation link', { link: result.link });
                console.log('📧 Best link:', result.link, 'confidence:', result.confidence);
                
                // Check auto-confirm setting
                const { storageService } = await import('./storageService');
                const settings = await storageService.get('settings');
                const autoConfirm = settings?.autoConfirmLinks ?? true;

                if (autoConfirm) {
                    console.log('📧 ACTIVATING LINK');
                    await this.activateLink(result.link);
                    
                    // STOP email polling - activation link was opened
                    const { stopEmailPolling } = await import('../background/alarms');
                    stopEmailPolling();
                } else {
                    log.info('Auto-confirm disabled, not opening link');
                }
            } else {
                console.log('📧 No activation links found');
                log.debug('No activation links found in email');
            }
        } catch (error) {
            log.error('Link extraction failed', error);
        }
    }

    /**
     * Activate a link by opening in a new tab
     */
    private async activateLink(url: string): Promise<void> {
        console.log('========================================');
        console.log('🔗 ACTIVATION LINK FUNCTION CALLED');
        console.log('🔗 URL:', url);
        console.log('========================================');

        try {
            log.info('Activating verification link', { url });

            const tab = await chrome.tabs.create({
                url: url,
                active: true
            });

            console.log('🔗 Tab created:', tab);

            if (!tab.id) {
                throw new Error('Failed to create verification tab');
            }

            log.info('Verification tab opened', { tabId: tab.id });

            // Wait for tab to load
            await this.waitForTabCompletion(tab.id, url);

            log.info('Verification complete - tab kept open');
            notifySuccess('GhostFill: Link Activated!', 'Verification link opened. Check the tab.');

        } catch (error) {
            console.error('🔗 ACTIVATION LINK ERROR:', error);
            log.error('Link activation failed', error);
            notifyError('GhostFill: Verification Failed', 'Please click the link manually.');
        }
    }

    /**
     * Wait for tab to finish loading
     */
    private waitForTabCompletion(tabId: number, startUrl: string): Promise<void> {
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
            }, 5000);

            const listener = (tid: number, changeInfo: chrome.tabs.TabChangeInfo) => {
                if (tid === tabId && changeInfo.status === 'complete') {
                    log.debug('Tab loaded', { tabId });
                    clearTimeout(timeout);
                    chrome.tabs.onUpdated.removeListener(listener);
                    resolve();
                }
            };

            chrome.tabs.onUpdated.addListener(listener);
        });
    }
}

export const linkService = new LinkService();
