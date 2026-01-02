// OTP Extraction Service - AI ONLY (No Regex)

import { createLogger } from '../utils/logger';
import { PatternMatch, LastOTP } from '../types';
import { storageService } from './storageService';

const log = createLogger('OTPService');

class OTPService {
    /**
     * Extract OTP from email - Uses LLM AI only (no regex)
     */
    async extractFromEmail(body: string, htmlBody?: string, subject: string = ''): Promise<PatternMatch | null> {
        log.info('🤖 Extracting OTP using AI (no regex)');
        
        try {
            const { llmService } = await import('./llmService');
            
            // Use plain text body first (cleaner), fallback to HTML
            const emailContent = body || htmlBody || '';
            log.debug('Using email content length:', emailContent.length);
            const aiResult = await llmService.parseEmail(emailContent, subject);
            
            if (aiResult.code && aiResult.confidence > 0.3) {
                log.info('✅ AI extracted OTP', { code: aiResult.code, confidence: aiResult.confidence });
                return {
                    pattern: 'AI_GROQ',
                    confidence: aiResult.confidence,
                    extractedValue: aiResult.code,
                    startIndex: 0,
                    endIndex: aiResult.code.length
                };
            }
            
            log.debug('AI did not find OTP code');
            return null;
        } catch (error) {
            log.error('AI OTP extraction failed', error);
            return null;
        }
    }

    /**
     * Save last extracted OTP
     */
    async saveLastOTP(
        otp: string,
        source: 'email' | 'sms' | 'manual',
        emailFrom?: string,
        emailSubject?: string,
        confidence: number = 0.8
    ): Promise<void> {
        const lastOTP: LastOTP = {
            code: otp,
            source,
            emailFrom,
            emailSubject,
            extractedAt: Date.now(),
            confidence,
        };

        await storageService.set('lastOTP', lastOTP);
        log.info('Last OTP saved', { otp, source });
    }

    /**
     * Get last extracted OTP
     */
    async getLastOTP(): Promise<LastOTP | null> {
        const lastOTP = await storageService.get('lastOTP');

        // Check if expired (5 minutes)
        if (lastOTP && Date.now() - lastOTP.extractedAt > 5 * 60 * 1000) {
            log.debug('Last OTP expired');
            return null;
        }

        return lastOTP || null;
    }

    /**
     * Mark OTP as used
     */
    async markAsUsed(): Promise<void> {
        const lastOTP = await storageService.get('lastOTP');
        if (lastOTP) {
            lastOTP.usedAt = Date.now();
            await storageService.set('lastOTP', lastOTP);
            log.debug('OTP marked as used');
        }
    }

    /**
     * Clear last OTP
     */
    async clearLastOTP(): Promise<void> {
        await storageService.remove('lastOTP');
        log.debug('Last OTP cleared');
    }

    /**
     * Validate OTP format
     */
    validateOTP(otp: string): boolean {
        return /^[A-Z0-9]{4,10}$/i.test(otp);
    }
}

export const otpService = new OTPService();
