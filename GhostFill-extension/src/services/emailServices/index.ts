// Email Service Aggregator

import { createLogger } from '../../utils/logger';
import { EmailAccount, Email, EmailService } from '../../types';
import { tempMailService } from './tempMailService';
import { mailTmService } from './mailTmService';
import { mailGwService } from './mailGwService';
import { dropMailService } from './dropMailService';
import { guerrillaMailService } from './guerrillaMailService';
import { tempMailLolService } from './tempMailLolService';
import { tmailorService } from './tmailorService';
import { maildropService } from './maildropService';
import { CustomDomainService } from './customDomainService';
import { storageService } from '../storageService';
import { providerHealth } from './providerHealthManager';

const log = createLogger('EmailServiceAggregator');
const customDomainService = new CustomDomainService();

class EmailServiceAggregator {
    private availableServices: EmailService[] = ['maildrop', 'mailgw', 'mailtm', 'tmailor', 'guerrilla', 'tempmail', 'custom'];
    private healthCheckTimestamp: number = 0;

    /**
     * Get the best available provider using health scoring
     * Uses ProviderHealthManager for intelligent selection
     */
    private getBestProvider(exclude?: EmailService): EmailService | null {
        return providerHealth.getBestProvider(exclude ? [exclude] : []);
    }

    /**
     * Perform health check to identify working services
     * Runs once every hour
     */
    async performHealthCheck(): Promise<void> {
        // Debounce checks (1 hour)
        if (Date.now() - this.healthCheckTimestamp < 60 * 60 * 1000) return;

        log.info('Performing email service health check...');
        const healthy: EmailService[] = [];

        // Parallel checks
        const checks = this.availableServices.map(async (service) => {
            if (service === 'custom') return 'custom'; // Always assume custom is "healthy" if configured (checked later)
            if (!providerHealth.isAvailable(service)) return null; // Skip unavailable providers

            try {
                // Try to get domains as a lightweight "ping"
                const domains = await this.getDomains(service);
                if (domains && domains.length > 0) {
                    return service;
                }
            } catch (e) {
                log.warn(`Health check failed for ${service}`, e);
            }
            return null;
        });

        const results = await Promise.all(checks);
        this.availableServices = results.filter((s): s is EmailService => s !== null);

        // Always ensure we have at least one fallback
        if (this.availableServices.length === 0) {
            this.availableServices = ['maildrop', 'tmailor', 'guerrilla'];
            log.warn('All health checks failed, resetting to defaults');
        }

        this.healthCheckTimestamp = Date.now();
        log.info('Health check complete', { available: this.availableServices });
    }

    /**
     * Generate a new email using the specified or default service
     * TMailor is now the primary service (500+ rotating domains, avoid blocklisting)
     */
    async generateEmail(
        options: {
            service?: EmailService;
            prefix?: string;
            domain?: string;
        } = {}
    ): Promise<EmailAccount> {
        // Ensure we have a list of healthy services
        if (this.healthCheckTimestamp === 0) {
            // Run in background, don't block first call
            this.performHealthCheck().catch(err => log.error('Background health check failed', err));
        }

        const settings = await storageService.getSettings();
        // Use preferred if valid/healthy, otherwise pick best healthy
        let service = options.service || settings.preferredEmailService || 'maildrop';

        // Custom precedence
        if (settings.preferredEmailService === 'custom' && !options.service) {
            service = 'custom';
        }

        // If preferred service is not in healthy list (and not explicitly requested by user via options), pick first healthy
        if (!options.service && service !== 'custom' && !this.availableServices.includes(service) && this.availableServices.length > 0) {
            service = this.availableServices[0];
            log.info(`Preferred service unavailable, switching to ${service}`);
        }

        let account: EmailAccount;
        const startTime = performance.now(); // Track response time for health scoring

        try {
            switch (service) {
                case 'custom':
                    account = await customDomainService.createAccount();
                    break;
                case 'maildrop':
                    // Maildrop - Free GraphQL API, 24h retention, no auth required
                    account = await maildropService.createAccount(options.prefix);
                    break;
                case 'tmailor':
                    // TMailor - 500+ rotating domains, Google-hosted, avoid blocklisting
                    account = await tmailorService.createAccount(options.prefix);
                    break;
                case 'templol':
                    // TempMailLol is currently returning 403 errors, try tmailor instead
                    log.warn('TempMailLol is currently unavailable (403), using TMailor instead');
                    account = await tmailorService.createAccount(options.prefix);
                    break;
                case 'mailgw':
                    account = await mailGwService.createAccount(options.prefix);
                    break;
                case 'mailtm':
                    // Mail.tm sometimes requires activation, try but fall back if it fails
                    try {
                        account = await mailTmService.createAccount(options.prefix);
                    } catch (mtError) {
                        log.warn('Mail.tm account creation failed, falling back to TMailor', mtError);
                        account = await tmailorService.createAccount(options.prefix);
                    }
                    break;
                case 'guerrilla':
                    account = await guerrillaMailService.createAccount();
                    break;
                case 'dropmail':
                    // DropMail is currently blocked (403), try TMailor
                    log.warn('DropMail is currently unavailable, using TMailor instead');
                    account = await tmailorService.createAccount(options.prefix);
                    break;
                case '1secmail':
                case 'tempmail':
                    // 1secmail.com - reliable, no CORS issues
                    account = await tempMailService.generateEmail(options.prefix, options.domain);
                    break;
                default:
                    // Default to Maildrop (free, reliable, no auth)
                    account = await maildropService.createAccount(options.prefix);
                    break;
            }

            // Same storage logic
            await storageService.set('currentEmail', account);
            await storageService.pushToArray('emailHistory', {
                email: account.fullEmail,
                service: account.service,
                usedOn: [],
                createdAt: account.createdAt,
                emailsReceived: 0,
            }, 50);

            log.info('Email generated', { email: account.fullEmail, service: account.service });

            // Record success for health tracking
            const responseTime = performance.now() - startTime;
            providerHealth.recordSuccess(service, responseTime);

            return account;
        } catch (error) {
            // Record failure for health tracking
            providerHealth.recordFailure(service, error as Error);
            log.error(`Failed to generate email with ${service}`, error);

            // Smart fallback with health-aware provider selection
            const triedProviders: EmailService[] = [service];
            const maxRetries = 3;

            for (let attempt = 0; attempt < maxRetries; attempt++) {
                // Get best available provider, excluding already tried ones
                const nextProvider = providerHealth.getBestProvider(triedProviders);

                if (!nextProvider) {
                    log.error('No more providers available to try');
                    break;
                }

                triedProviders.push(nextProvider);

                // Apply exponential backoff delay before retry
                const delay = providerHealth.getRetryDelay(attempt);
                log.info(`Retry ${attempt + 1}/${maxRetries}: Waiting ${Math.round(delay)}ms before trying ${nextProvider}`);
                await new Promise(resolve => setTimeout(resolve, delay));

                try {
                    return await this.generateEmail({ ...options, service: nextProvider });
                } catch (fallbackError) {
                    log.warn(`Fallback to ${nextProvider} also failed`, fallbackError);
                    // ProviderHealth will record this failure in the recursive call
                }
            }

            throw new Error('All email services are currently unavailable. Please try again later.');
        }
    }


    /**
     * Get current active email
     */
    async getCurrentEmail(): Promise<EmailAccount | null> {
        const email = await storageService.get('currentEmail');

        // Check if expired
        if (email && email.expiresAt < Date.now()) {
            log.info('Current email expired, generating new one');
            return this.generateEmail({ service: email.service });
        }

        return email || null;
    }

    /**
     * Check inbox for the specified account
     */
    async checkInbox(account: EmailAccount): Promise<Email[]> {
        try {
            let emails: Email[];

            switch (account.service) {
                case 'custom':
                    emails = await customDomainService.getMessages(account);
                    break;
                case 'maildrop':
                    // Maildrop - GraphQL API, no auth required
                    emails = await maildropService.getMessages(account);
                    break;
                case 'mailgw':
                    if (account.token) {
                        mailGwService.setToken(account.token);
                    } else if (account.password) {
                        await mailGwService.authenticate(account.fullEmail, account.password);
                    }
                    emails = await mailGwService.getMessages();
                    break;
                case 'mailtm':
                    if (account.token) {
                        mailTmService.setToken(account.token);
                    } else if (account.password) {
                        await mailTmService.authenticate(account.fullEmail, account.password);
                    }
                    emails = await mailTmService.getMessages();
                    break;
                case 'dropmail':
                    if (account.token) {
                        dropMailService.setSession(account.token);
                    }
                    emails = await dropMailService.getMessages(account.token);
                    break;
                case 'guerrilla':
                    if (account.token) {
                        guerrillaMailService.setSession(account.token, account.fullEmail);
                    }
                    emails = await guerrillaMailService.getMessages(account.token);
                    break;
                case 'templol':
                    if (account.token) {
                        tempMailLolService.setToken(account.token);
                    }
                    emails = await tempMailLolService.getMessages(account.token);
                    break;
                case 'tmailor':
                    // TMailor - 500+ rotating domains
                    emails = await tmailorService.getEmails(account);
                    break;
                case 'tempmail':
                default:
                    emails = await tempMailService.checkInbox(account.login || account.username || '', account.domain);
                    break;
            }

            // Cache emails
            await storageService.set('inbox', emails);

            // Only log if we have new emails (reduces spam)
            // log.debug('Inbox checked', { count: emails.length });
            return emails;
        } catch (error) {
            const errorMsg = (error as Error).message || String(error);

            // Detect rate limit errors (429 or "Max retries" or "rate limit")
            const isRateLimited = errorMsg.includes('429') ||
                errorMsg.includes('Max retries') ||
                errorMsg.includes('rate limit') ||
                errorMsg.includes('Too Many Requests');

            if (isRateLimited) {
                log.warn(`Provider ${account.service} is rate-limited, switching to another provider...`);
                providerHealth.recordFailure(account.service, error as Error);

                // Try to get a new provider
                const nextProvider = this.getBestProvider(account.service);
                if (nextProvider) {
                    log.info(`Switching from ${account.service} to ${nextProvider}`);

                    // Generate new email with the new provider
                    try {
                        const newAccount = await this.generateEmail({ service: nextProvider });
                        log.info(`New email generated with ${nextProvider}: ${newAccount.fullEmail}`);

                        // Return empty array for now, next check will use new account
                        return [];
                    } catch (switchError) {
                        log.error('Failed to switch provider', switchError);
                    }
                }
            }

            // Don't spam error logs for network glitches
            log.warn('Failed to check inbox (will retry)', errorMsg);
            throw error;
        }
    }

    /**
     * Read a specific email
     */
    async readEmail(emailId: string | number, account: EmailAccount): Promise<Email> {
        try {
            let email: Email;

            switch (account.service) {
                case 'custom': {
                    // We can reuse getMessages for custom since logic is often simple, 
                    // but if there's a specific "read" endpoint, customDomainService handles it. 
                    // Actually customDomainService usually fetches full list. 
                    // Let's implement readEmail in customDomainService if needed (it wasn't in interface), 
                    // or just find it in inbox.
                    // For now, let's just re-fetch inbox and find it.
                    const msgs = await customDomainService.getMessages(account);
                    const found = msgs.find(m => m.id === emailId || m.id === String(emailId));
                    if (!found) throw new Error('Email not found');
                    email = found;
                    break;
                }
                case 'maildrop':
                    // Maildrop - GraphQL API for full message content
                    email = await maildropService.getMessage(emailId.toString(), account);
                    break;
                case 'mailgw':
                    if (account.token) {
                        mailGwService.setToken(account.token);
                    }
                    email = await mailGwService.getMessage(emailId.toString());
                    break;
                case 'mailtm':
                    if (account.token) {
                        mailTmService.setToken(account.token);
                    }
                    email = await mailTmService.getMessage(emailId.toString());
                    break;
                case 'dropmail':
                    email = await dropMailService.getMessage(emailId.toString(), account.token);
                    break;
                case 'guerrilla':
                    email = await guerrillaMailService.getMessage(emailId.toString(), account.token);
                    break;
                case 'templol':
                    email = await tempMailLolService.getMessage(emailId.toString(), account.token);
                    break;
                case 'tmailor':
                    // TMailor - 500+ rotating domains
                    email = await tmailorService.readEmail(emailId.toString(), account);
                    break;
                case 'tempmail':
                default:
                    email = await tempMailService.readEmail(
                        Number(emailId),
                        account.login || account.username || '',
                        account.domain
                    );
                    break;
            }

            // Update cached emails
            const inbox = (await storageService.get('inbox')) || [];
            const updatedInbox = inbox.map((e) =>
                e.id === emailId ? email : e
            );
            await storageService.set('inbox', updatedInbox);

            log.debug('Email read', { id: emailId });
            return email;
        } catch (error) {
            log.error('Failed to read email', error);
            throw error;
        }
    }

    /**
     * Get cached inbox
     */
    async getCachedInbox(): Promise<Email[]> {
        return (await storageService.get('inbox')) || [];
    }

    /**
     * Get available domains for a service
     */
    async getDomains(service: EmailService = 'tempmail'): Promise<string[]> {
        try {
            switch (service) {
                case 'maildrop':
                    // Maildrop only uses maildrop.cc domain
                    return ['maildrop.cc'];
                case 'mailgw':
                    return mailGwService.getDomains();
                case 'mailtm':
                    return mailTmService.getDomains();
                case 'tempmail':
                default:
                    return tempMailService.getDomains();
            }
        } catch (error) {
            log.error('Failed to get domains', error);
            return [];
        }
    }

    /**
     * Get email history
     */
    async getHistory() {
        return (await storageService.get('emailHistory')) || [];
    }

    /**
     * Clear email data
     */
    async clearData(): Promise<void> {
        await storageService.remove('currentEmail');
        await storageService.set('inbox', []);
        log.info('Email data cleared');
    }
}

// Export singleton instance
export const emailService = new EmailServiceAggregator();

// Re-export individual services
export { tempMailService } from './tempMailService';
export { mailTmService } from './mailTmService';
export { mailGwService } from './mailGwService';
export { dropMailService } from './dropMailService';
export { guerrillaMailService } from './guerrillaMailService';
export { maildropService } from './maildropService';
export { customDomainService };
export { providerHealth } from './providerHealthManager';
