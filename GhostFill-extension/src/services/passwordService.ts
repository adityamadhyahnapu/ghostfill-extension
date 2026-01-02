// Password Generation Service

import { createLogger } from '../utils/logger';
import { cryptoService } from './cryptoService';
import {
    PasswordOptions,
    PasswordStrength,
    GeneratedPassword,
    PasswordHistoryItem,
    DEFAULT_PASSWORD_OPTIONS,
    CHARACTER_SETS,
} from '../types';
import { storageService } from './storageService';
import { generateId } from '../utils/core';

const log = createLogger('PasswordService');

class PasswordService {
    /**
     * Generate a cryptographically secure password
     */
    generate(options: Partial<PasswordOptions> = {}): GeneratedPassword {
        const opts: PasswordOptions = { ...DEFAULT_PASSWORD_OPTIONS, ...options };

        // Build character set
        let charset = '';
        const requiredChars: string[] = [];

        if (opts.uppercase) {
            let chars = CHARACTER_SETS.uppercase;
            if (opts.excludeAmbiguous) {
                chars = chars.replace(/[OI]/g, '');
            }
            charset += chars;
            if (opts.minUppercase) {
                for (let i = 0; i < opts.minUppercase; i++) {
                    requiredChars.push(this.getRandomChar(chars));
                }
            }
        }

        if (opts.lowercase) {
            let chars = CHARACTER_SETS.lowercase;
            if (opts.excludeAmbiguous) {
                chars = chars.replace(/[ol]/g, '');
            }
            charset += chars;
            if (opts.minLowercase) {
                for (let i = 0; i < opts.minLowercase; i++) {
                    requiredChars.push(this.getRandomChar(chars));
                }
            }
        }

        if (opts.numbers) {
            let chars = CHARACTER_SETS.numbers;
            if (opts.excludeAmbiguous) {
                chars = chars.replace(/[01]/g, '');
            }
            charset += chars;
            if (opts.minNumbers) {
                for (let i = 0; i < opts.minNumbers; i++) {
                    requiredChars.push(this.getRandomChar(chars));
                }
            }
        }

        if (opts.symbols) {
            let chars = CHARACTER_SETS.symbols;
            if (opts.excludeSimilar) {
                chars = chars.replace(/[{}[\]()]/g, '');
            }
            charset += chars;
            if (opts.minSymbols) {
                for (let i = 0; i < opts.minSymbols; i++) {
                    requiredChars.push(this.getRandomChar(chars));
                }
            }
        }

        if (opts.customCharset) {
            charset = opts.customCharset;
        }

        if (!charset) {
            charset = CHARACTER_SETS.lowercase + CHARACTER_SETS.numbers;
        }

        // Generate password
        const remainingLength = opts.length - requiredChars.length;
        let password = '';

        // Add required characters
        password += requiredChars.join('');

        // Fill remaining with random characters
        for (let i = 0; i < remainingLength; i++) {
            password += this.getRandomChar(charset);
        }

        // Shuffle the password to mix required chars
        password = this.shuffleString(password);

        const strength = this.calculateStrength(password);

        log.debug('Generated password', { length: password.length, strength: strength.level });

        return {
            password,
            strength,
            options: opts,
            generatedAt: Date.now(),
        };
    }

    /**
     * Generate a passphrase (word-based password)
     */
    generatePassphrase(wordCount: number = 4, separator: string = '-'): string {
        const words = [
            'apple', 'brave', 'coral', 'delta', 'eagle', 'flame', 'grace', 'heart',
            'ivory', 'jewel', 'karma', 'lemon', 'magic', 'noble', 'ocean', 'pearl',
            'queen', 'river', 'storm', 'tiger', 'ultra', 'vivid', 'water', 'xenon',
            'yacht', 'zebra', 'amber', 'blaze', 'crisp', 'dream', 'ember', 'frost',
            'glow', 'haze', 'iris', 'jazz', 'kiwi', 'lunar', 'maple', 'neon',
            'opal', 'prism', 'quest', 'ruby', 'solar', 'topaz', 'unity', 'vibe',
            'wave', 'xray', 'yoga', 'zest', 'bloom', 'cloud', 'dusk', 'echo',
        ];

        const selectedWords: string[] = [];
        for (let i = 0; i < wordCount; i++) {
            const index = cryptoService.getRandomInt(0, words.length - 1);
            // Capitalize first letter randomly
            let word = words[index];
            if (cryptoService.getRandomInt(0, 1) === 1) {
                word = word.charAt(0).toUpperCase() + word.slice(1);
            }
            selectedWords.push(word);
        }

        // Add a random number at the end
        selectedWords.push(cryptoService.getRandomInt(10, 99).toString());

        return selectedWords.join(separator);
    }

    /**
     * Calculate password strength
     */
    calculateStrength(password: string): PasswordStrength {
        // Calculate entropy
        let charsetSize = 0;

        if (/[a-z]/.test(password)) charsetSize += 26;
        if (/[A-Z]/.test(password)) charsetSize += 26;
        if (/[0-9]/.test(password)) charsetSize += 10;
        if (/[^a-zA-Z0-9]/.test(password)) charsetSize += 32;

        const entropy = password.length * Math.log2(charsetSize || 1);

        // Calculate score (0-100)
        let score = Math.min(100, (entropy / 128) * 100);

        // Penalize repetitive patterns
        if (/(.)\1{2,}/.test(password)) score -= 10;

        // Penalize sequential characters
        if (/(?:abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz)/i.test(password)) {
            score -= 10;
        }
        if (/(?:012|123|234|345|456|567|678|789)/.test(password)) {
            score -= 10;
        }

        // Bonus for mixing character types
        const types = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((r) => r.test(password)).length;
        score += (types - 1) * 5;

        score = Math.max(0, Math.min(100, score));

        // Determine level
        let level: PasswordStrength['level'];
        if (score < 20) level = 'weak';
        else if (score < 40) level = 'fair';
        else if (score < 60) level = 'good';
        else if (score < 80) level = 'strong';
        else level = 'very-strong';

        // Estimate crack time (assuming 1 billion guesses/second)
        const combinations = Math.pow(charsetSize || 1, password.length);
        const secondsToCrack = combinations / 1e9 / 2; // Average case

        const crackTime = this.formatCrackTime(secondsToCrack);

        // Generate suggestions
        const suggestions: string[] = [];
        if (password.length < 12) suggestions.push('Use at least 12 characters');
        if (!/[A-Z]/.test(password)) suggestions.push('Add uppercase letters');
        if (!/[a-z]/.test(password)) suggestions.push('Add lowercase letters');
        if (!/[0-9]/.test(password)) suggestions.push('Add numbers');
        if (!/[^a-zA-Z0-9]/.test(password)) suggestions.push('Add special characters');

        return {
            score: Math.round(score),
            level,
            entropy: Math.round(entropy * 10) / 10,
            crackTime,
            suggestions,
        };
    }

    /**
     * Save password to history
     */
    async saveToHistory(password: string, website: string): Promise<void> {
        const strength = this.calculateStrength(password);

        const historyItem: PasswordHistoryItem = {
            id: generateId(),
            password, // Should be encrypted in production
            website,
            createdAt: Date.now(),
            strength: strength.score,
        };

        await storageService.pushToArray('passwordHistory', historyItem, 50);
        log.info('Password saved to history', { website });
    }

    /**
     * Get password history
     */
    async getHistory(): Promise<PasswordHistoryItem[]> {
        return (await storageService.get('passwordHistory')) || [];
    }

    /**
     * Delete password from history
     */
    async deleteFromHistory(id: string): Promise<void> {
        await storageService.removeFromArray('passwordHistory', (item) => item.id === id);
        log.info('Password deleted from history');
    }

    /**
     * Clear password history
     */
    async clearHistory(): Promise<void> {
        await storageService.set('passwordHistory', []);
        log.info('Password history cleared');
    }

    /**
     * Get a random character from charset
     */
    private getRandomChar(charset: string): string {
        const index = cryptoService.getRandomInt(0, charset.length - 1);
        return charset[index];
    }

    /**
     * Shuffle a string using Fisher-Yates
     */
    private shuffleString(str: string): string {
        const arr = str.split('');
        for (let i = arr.length - 1; i > 0; i--) {
            const j = cryptoService.getRandomInt(0, i);
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr.join('');
    }

    /**
     * Format crack time for display
     */
    private formatCrackTime(seconds: number): string {
        if (seconds < 1) return 'instantly';
        if (seconds < 60) return `${Math.floor(seconds)} seconds`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours`;
        if (seconds < 2592000) return `${Math.floor(seconds / 86400)} days`;
        if (seconds < 31536000) return `${Math.floor(seconds / 2592000)} months`;
        if (seconds < 3153600000) return `${Math.floor(seconds / 31536000)} years`;
        if (seconds < 3153600000000) return `${Math.floor(seconds / 3153600000)} centuries`;
        return 'millions of years';
    }
}

// Export singleton instance
export const passwordService = new PasswordService();
