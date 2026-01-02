// Chrome Storage Service

import { createLogger } from '../utils/logger';
import { StorageSchema, UserSettings, DEFAULT_SETTINGS, STORAGE_KEYS } from '../types';
import { deepMerge } from '../utils/core';

const log = createLogger('StorageService');

/**
 * Type-safe Chrome storage wrapper
 */
class StorageService {
    private cache: Partial<StorageSchema> = {};
    private initialized: boolean = false;

    /**
     * Initialize storage with defaults
     */
    async init(): Promise<void> {
        if (this.initialized) return;

        try {
            // Load all data from storage
            const data = await this.getAll();

            // Ensure settings exist with defaults
            if (!data.settings) {
                await this.set(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
            }

            // Set install date if not exists
            if (!data.installDate) {
                await this.set('installDate', Date.now());
            }

            // Set version
            await this.set('extensionVersion', chrome.runtime.getManifest().version);

            this.initialized = true;
            log.debug('Storage initialized');
        } catch (error) {
            log.error('Failed to initialize storage', error);
            throw error;
        }
    }

    /**
     * Get a value from storage
     */
    async get<K extends keyof StorageSchema>(key: K): Promise<StorageSchema[K] | undefined> {
        try {
            // Check cache first
            if (key in this.cache) {
                return this.cache[key] as StorageSchema[K];
            }

            if (!chrome?.storage?.local) {
                log.warn('Storage API unavailable', { key });
                return undefined;
            }

            const result = await chrome.storage.local.get(key);
            const value = result[key] as StorageSchema[K] | undefined;

            // Update cache
            if (value !== undefined) {
                this.cache[key] = value;
            }

            return value;
        } catch (error) {
            log.error(`Failed to get ${key}`, error);
            return undefined;
        }
    }

    /**
     * Set a value in storage
     */
    async set<K extends keyof StorageSchema>(key: K, value: StorageSchema[K]): Promise<void> {
        try {
            // QUOTA PROTECTION: Check usage before writing large objects
            if (this.isQuotaRisk(value)) {
                log.warn(`Large write detected for key ${key}`, { size: JSON.stringify(value).length });
            }

            await new Promise<void>((resolve, reject) => {
                chrome.storage.local.set({ [key]: value }, () => {
                    if (chrome.runtime.lastError) {
                        return reject(chrome.runtime.lastError);
                    }
                    resolve();
                });
            });

            this.cache[key] = value;
            log.debug(`Saved ${key}`);
        } catch (error) {
            log.error(`Failed to set ${key}`, error);
            throw error;
        }
    }

    /**
     * Check if a value implies a quota risk (simple heuristic)
     */
    private isQuotaRisk(value: any): boolean {
        if (!value) return false;
        // Approximation: 100KB warning threshold
        const size = JSON.stringify(value).length;
        return size > 100 * 1024;
    }

    /**
     * Remove a value from storage
     */
    async remove(key: keyof StorageSchema): Promise<void> {
        try {
            await chrome.storage.local.remove(key);
            delete this.cache[key];
            log.debug(`Removed ${key}`);
        } catch (error) {
            log.error(`Failed to remove ${key}`, error);
            throw error;
        }
    }

    /**
     * Get all storage data
     */
    async getAll(): Promise<Partial<StorageSchema>> {
        try {
            if (!chrome?.storage?.local) {
                log.warn('Storage API unavailable (getAll)');
                return {};
            }

            const result = await chrome.storage.local.get(null);
            this.cache = result as Partial<StorageSchema>;
            return this.cache;
        } catch (error) {
            log.error('Failed to get all storage data', error);
            return {};
        }
    }

    /**
     * Clear all storage data
     */
    async clear(): Promise<void> {
        try {
            await chrome.storage.local.clear();
            this.cache = {};
            log.info('Storage cleared');
        } catch (error) {
            log.error('Failed to clear storage', error);
            throw error;
        }
    }

    /**
     * Get settings with defaults
     */
    async getSettings(): Promise<UserSettings> {
        const settings = await this.get(STORAGE_KEYS.SETTINGS as keyof StorageSchema);
        return deepMerge(DEFAULT_SETTINGS, (settings || {}) as Partial<UserSettings>);
    }

    /**
     * Update settings
     */
    async updateSettings(updates: Partial<UserSettings>): Promise<UserSettings> {
        const current = await this.getSettings();
        const updated = deepMerge(current, updates);
        await this.set(STORAGE_KEYS.SETTINGS as keyof StorageSchema, updated);
        return updated;
    }

    /**
     * Add item to array in storage
     */
    async pushToArray<K extends keyof StorageSchema>(
        key: K,
        item: StorageSchema[K] extends Array<infer U> ? U : never,
        maxItems?: number
    ): Promise<void> {
        const current = (await this.get(key)) as unknown[] || [];
        current.unshift(item);

        if (maxItems && current.length > maxItems) {
            current.splice(maxItems);
        }

        await this.set(key, current as StorageSchema[K]);
    }

    /**
     * Remove item from array in storage
     */
    async removeFromArray<K extends keyof StorageSchema>(
        key: K,
        predicate: (item: StorageSchema[K] extends Array<infer U> ? U : never) => boolean
    ): Promise<void> {
        const current = (await this.get(key)) as unknown[] || [];
        const filtered = current.filter((item) => !predicate(item as StorageSchema[K] extends Array<infer U> ? U : never));
        await this.set(key, filtered as StorageSchema[K]);
    }

    /**
     * Update item in array in storage
     */
    async updateInArray<K extends keyof StorageSchema>(
        key: K,
        predicate: (item: StorageSchema[K] extends Array<infer U> ? U : never) => boolean,
        updates: Partial<StorageSchema[K] extends Array<infer U> ? U : never>
    ): Promise<void> {
        const current = (await this.get(key)) as unknown[] || [];
        const updated = current.map((item) =>
            predicate(item as StorageSchema[K] extends Array<infer U> ? U : never)
                ? Object.assign({}, item, updates)
                : item
        );
        await this.set(key, updated as StorageSchema[K]);
    }

    /**
     * Get storage usage info
     */
    async getUsage(): Promise<{ used: number; total: number; percentage: number }> {
        return new Promise((resolve) => {
            chrome.storage.local.getBytesInUse(null, (bytesInUse) => {
                const total = chrome.storage.local.QUOTA_BYTES || 10485760; // 10MB default
                resolve({
                    used: bytesInUse,
                    total,
                    percentage: (bytesInUse / total) * 100,
                });
            });
        });
    }

    /**
     * Listen to storage changes
     */
    onChanged(callback: (changes: { [key: string]: chrome.storage.StorageChange }) => void): void {
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName === 'local') {
                // Update cache
                for (const key in changes) {
                    if (changes[key].newValue !== undefined) {
                        this.cache[key as keyof StorageSchema] = changes[key].newValue;
                    } else {
                        delete this.cache[key as keyof StorageSchema];
                    }
                }
                callback(changes);
            }
        });
    }
}

// Export singleton instance
export const storageService = new StorageService();
