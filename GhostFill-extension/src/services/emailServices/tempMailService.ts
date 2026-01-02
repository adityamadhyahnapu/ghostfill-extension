// TempMail Service - 1secmail.com API integration

import { createLogger } from '../../utils/logger';
import {
    EmailAccount,
    Email,
    TempMailMessage,
    TempMailFullMessage,
} from '../../types';
import { API, TEMP_MAIL_DOMAINS } from '../../utils/constants';

const log = createLogger('TempMailService');

class TempMailService {
    private baseUrl = API.TEMP_MAIL.BASE_URL;

    /**
     * Get available domains
     */
    async getDomains(): Promise<string[]> {
        try {
            const response = await fetch(
                `${this.baseUrl}?action=${API.TEMP_MAIL.ENDPOINTS.GET_DOMAINS}`,
                {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Accept': 'application/json',
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status}`);
            }

            const domains = await response.json();
            return domains as string[];
        } catch (error) {
            // 1secmail often returns 403, this is expected - we have fallback domains
            // Don't log the full error object to avoid console noise
            log.debug('Domain fetch failed, using fallback domains');
            return TEMP_MAIL_DOMAINS;
        }
    }

    /**
     * Generate a random email address
     */
    async generateEmail(prefix?: string, domain?: string): Promise<EmailAccount> {
        try {
            let login: string = '';
            let emailDomain: string = '';

            if (prefix) {
                // Use custom prefix
                login = prefix.toLowerCase().replace(/[^a-z0-9]/g, '');
            } else {
                // Generate random email from API
                const response = await fetch(
                    `${this.baseUrl}?action=${API.TEMP_MAIL.ENDPOINTS.GEN_RANDOM}&count=1`,
                    {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                            'Accept': 'application/json',
                        }
                    }
                );

                if (!response.ok) {
                    throw new Error(`HTTP error: ${response.status}`);
                }

                const emails = await response.json();
                const [generatedEmail] = emails;
                const parts = generatedEmail.split('@');
                login = parts[0];
                emailDomain = parts[1];
            }

            // Use provided domain or get from generated email or default
            if (domain) {
                emailDomain = domain;
            } else if (!emailDomain) {
                const domains = await this.getDomains();
                emailDomain = domains[Math.floor(Math.random() * domains.length)];
            }

            const fullEmail = `${login}@${emailDomain}`;
            const now = Date.now();

            const account: EmailAccount = {
                login,
                domain: emailDomain,
                fullEmail,
                createdAt: now,
                expiresAt: now + 60 * 60 * 1000, // 1 hour expiry
                service: 'tempmail',
            };

            log.info('Generated email', { email: fullEmail });
            return account;
        } catch (error) {
            log.error('Failed to generate email', error);
            throw error;
        }
    }

    /**
     * Check inbox for messages
     */
    async checkInbox(login: string, domain: string): Promise<Email[]> {
        try {
            const response = await fetch(
                `${this.baseUrl}?action=${API.TEMP_MAIL.ENDPOINTS.GET_MESSAGES}&login=${login}&domain=${domain}`
            );

            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status}`);
            }

            const messages: TempMailMessage[] = await response.json();

            if (!Array.isArray(messages)) {
                return [];
            }

            return messages.map((msg) => this.convertMessage(msg, login, domain));
        } catch (error) {
            log.error('Failed to check inbox', error);
            throw error;
        }
    }

    /**
     * Read a specific email
     */
    async readEmail(id: number, login: string, domain: string): Promise<Email> {
        try {
            const response = await fetch(
                `${this.baseUrl}?action=${API.TEMP_MAIL.ENDPOINTS.READ_MESSAGE}&login=${login}&domain=${domain}&id=${id}`
            );

            if (!response.ok) {
                throw new Error(`HTTP error: ${response.status}`);
            }

            const message: TempMailFullMessage = await response.json();
            return this.convertFullMessage(message, login, domain);
        } catch (error) {
            log.error('Failed to read email', error);
            throw error;
        }
    }

    /**
     * Convert API message to our Email type
     */
    private convertMessage(msg: TempMailMessage, login: string, domain: string): Email {
        return {
            id: msg.id,
            from: msg.from,
            to: `${login}@${domain}`,
            subject: msg.subject,
            date: new Date(msg.date).getTime(),
            body: '',
            attachments: [],
            read: false,
        };
    }

    /**
     * Convert API full message to our Email type
     */
    private convertFullMessage(msg: TempMailFullMessage, login: string, domain: string): Email {
        return {
            id: msg.id,
            from: msg.from,
            to: `${login}@${domain}`,
            subject: msg.subject,
            date: new Date(msg.date).getTime(),
            body: msg.body || msg.textBody || '',
            htmlBody: msg.htmlBody,
            textBody: msg.textBody,
            attachments: msg.attachments?.map((att) => ({
                filename: att.filename,
                contentType: att.contentType,
                size: att.size,
            })) || [],
            read: true,
        };
    }
}

// Export singleton instance
export const tempMailService = new TempMailService();
