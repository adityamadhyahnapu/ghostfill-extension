// Cryptography Service - Using Web Crypto API

import { createLogger } from '../utils/logger';

const log = createLogger('CryptoService');

/**
 * Cryptographically secure encryption and key derivation service
 */
class CryptoService {
    private encoder = new TextEncoder();
    private decoder = new TextDecoder();

    /**
     * Generate cryptographically secure random bytes
     */
    getRandomBytes(length: number): Uint8Array {
        const bytes = new Uint8Array(length);
        crypto.getRandomValues(bytes);
        return bytes;
    }

    /**
     * Generate a random string from a charset
     */
    getRandomString(length: number, charset: string): string {
        const randomValues = new Uint32Array(length);
        crypto.getRandomValues(randomValues);

        let result = '';
        for (let i = 0; i < length; i++) {
            result += charset[randomValues[i] % charset.length];
        }
        return result;
    }

    /**
     * Generate a secure random number in range [min, max]
     */
    getRandomInt(min: number, max: number): number {
        const range = max - min + 1;
        const bytesNeeded = Math.ceil(Math.log2(range) / 8);
        const randomBytes = this.getRandomBytes(bytesNeeded);

        let randomValue = 0;
        for (let i = 0; i < bytesNeeded; i++) {
            randomValue = (randomValue << 8) | randomBytes[i];
        }

        return min + (randomValue % range);
    }

    /**
     * Shuffle array using Fisher-Yates with secure random
     */
    secureShuffleArray<T>(array: T[]): T[] {
        const result = [...array];
        for (let i = result.length - 1; i > 0; i--) {
            const j = this.getRandomInt(0, i);
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }

    /**
     * Derive a key from password using PBKDF2
     */
    async deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
        const passwordKey = await crypto.subtle.importKey(
            'raw',
            this.encoder.encode(password),
            'PBKDF2',
            false,
            ['deriveKey']
        );

        return crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt.buffer as ArrayBuffer,
                iterations: 100000,
                hash: 'SHA-256',
            },
            passwordKey,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    /**
     * Generate a new encryption key
     */
    async generateKey(): Promise<CryptoKey> {
        return crypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 },
            true,
            ['encrypt', 'decrypt']
        );
    }

    /**
     * Export key to base64 string
     */
    async exportKey(key: CryptoKey): Promise<string> {
        const exported = await crypto.subtle.exportKey('raw', key);
        return this.arrayBufferToBase64(exported);
    }

    /**
     * Import key from base64 string
     */
    async importKey(keyString: string): Promise<CryptoKey> {
        const keyData = this.base64ToArrayBuffer(keyString);
        return crypto.subtle.importKey(
            'raw',
            keyData,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    /**
     * Encrypt data with AES-256-GCM
     */
    async encrypt(data: string, key: CryptoKey): Promise<string> {
        try {
            const iv = this.getRandomBytes(12);
            const encoded = this.encoder.encode(data);

            const encrypted = await crypto.subtle.encrypt(
                { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
                key,
                encoded
            );

            // Combine IV and encrypted data
            const combined = new Uint8Array(iv.length + encrypted.byteLength);
            combined.set(iv);
            combined.set(new Uint8Array(encrypted), iv.length);

            return this.arrayBufferToBase64(combined.buffer as ArrayBuffer);
        } catch (error) {
            log.error('Encryption failed', error);
            throw error;
        }
    }

    /**
     * Decrypt data with AES-256-GCM
     */
    async decrypt(encryptedData: string, key: CryptoKey): Promise<string> {
        try {
            const combined = this.base64ToArrayBuffer(encryptedData);
            const combinedArray = new Uint8Array(combined);

            // Extract IV and encrypted data
            const iv = combinedArray.slice(0, 12);
            const encrypted = combinedArray.slice(12);

            const decrypted = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
                key,
                encrypted
            );

            return this.decoder.decode(decrypted);
        } catch (error) {
            log.error('Decryption failed', error);
            throw error;
        }
    }

    /**
     * Encrypt with password (derives key internally)
     */
    async encryptWithPassword(data: string, password: string): Promise<string> {
        const salt = this.getRandomBytes(16);
        const key = await this.deriveKey(password, salt);
        const encrypted = await this.encrypt(data, key);

        // Combine salt and encrypted data
        const saltBase64 = this.arrayBufferToBase64(salt.buffer as ArrayBuffer);
        return `${saltBase64}:${encrypted}`;
    }

    /**
     * Decrypt with password
     */
    async decryptWithPassword(encryptedData: string, password: string): Promise<string> {
        const [saltBase64, encrypted] = encryptedData.split(':');
        const salt = new Uint8Array(this.base64ToArrayBuffer(saltBase64));
        const key = await this.deriveKey(password, salt);
        return this.decrypt(encrypted, key);
    }

    /**
     * Hash a string using SHA-256
     */
    async hash(data: string): Promise<string> {
        const encoded = this.encoder.encode(data);
        const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
        return this.arrayBufferToHex(hashBuffer);
    }

    /**
     * Generate a UUID v4
     */
    generateUUID(): string {
        const bytes = this.getRandomBytes(16);
        bytes[6] = (bytes[6] & 0x0f) | 0x40; // Version 4
        bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variant 1

        const hex = Array.from(bytes)
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');

        return [
            hex.slice(0, 8),
            hex.slice(8, 12),
            hex.slice(12, 16),
            hex.slice(16, 20),
            hex.slice(20),
        ].join('-');
    }

    /**
     * Convert ArrayBuffer to Base64
     */
    private arrayBufferToBase64(buffer: ArrayBuffer): string {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    /**
     * Convert Base64 to ArrayBuffer
     */
    private base64ToArrayBuffer(base64: string): ArrayBuffer {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }

    /**
     * Convert ArrayBuffer to Hex string
     */
    private arrayBufferToHex(buffer: ArrayBuffer): string {
        const bytes = new Uint8Array(buffer);
        return Array.from(bytes)
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
    }
}

// Export singleton instance
export const cryptoService = new CryptoService();
