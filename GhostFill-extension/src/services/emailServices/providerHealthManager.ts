// Provider Health Manager - Circuit Breaker + Exponential Backoff
// Tracks provider health and intelligently routes email generation requests

import { createLogger } from '../../utils/logger';
import { EmailService } from '../../types';

const log = createLogger('ProviderHealth');

export interface ProviderHealth {
    name: EmailService;
    successRate: number;          // 0-1 rolling success rate
    consecutiveFailures: number;  // Count of failures in a row
    lastSuccess: number;          // Timestamp of last success
    lastFailure: number;          // Timestamp of last failure
    lastError: string | null;     // Last error message
    avgResponseTime: number;      // Rolling average response time (ms)
    circuitOpen: boolean;         // True = provider is "broken", skip it
    cooldownUntil: number;        // Skip until this timestamp
    totalRequests: number;        // Total requests made
    totalSuccesses: number;       // Total successful requests
}

interface HealthConfig {
    circuitBreakerThreshold: number;    // Failures before opening circuit
    circuitResetTimeout: number;        // Ms before attempting circuit close
    maxCooldown: number;                // Max cooldown duration (ms)
    baseCooldown: number;               // Initial cooldown duration (ms)
    successRateDecay: number;           // How fast success rate decays (0-1)
    responseTimeDecay: number;          // How fast avg response time decays (0-1)
}

const DEFAULT_CONFIG: HealthConfig = {
    circuitBreakerThreshold: 3,         // 3 consecutive failures = circuit open
    circuitResetTimeout: 5 * 60 * 1000, // 5 minutes before trying again
    maxCooldown: 30 * 60 * 1000,        // Max 30 minutes cooldown
    baseCooldown: 30 * 1000,            // Start with 30 second cooldown
    successRateDecay: 0.9,               // Weight factor for rolling average
    responseTimeDecay: 0.8,              // Weight factor for response time avg
};

class ProviderHealthManager {
    private health: Map<EmailService, ProviderHealth> = new Map();
    private config: HealthConfig = DEFAULT_CONFIG;

    // Priority order for providers (best first)
    private readonly providerPriority: EmailService[] = [
        'maildrop',   // Free GraphQL, reliable
        'tmailor',    // 500+ domains
        'guerrilla',  // Long-standing service
        'mailgw',     // Good fallback
        'mailtm',     // Sometimes slow
        'tempmail',   // 1secmail.com
    ];

    constructor() {
        this.initializeProviders();
    }

    private initializeProviders(): void {
        for (const provider of this.providerPriority) {
            this.health.set(provider, this.createDefaultHealth(provider));
        }
    }

    private createDefaultHealth(name: EmailService): ProviderHealth {
        return {
            name,
            successRate: 1.0,           // Assume healthy initially
            consecutiveFailures: 0,
            lastSuccess: Date.now(),
            lastFailure: 0,
            lastError: null,
            avgResponseTime: 500,       // Assume 500ms initially
            circuitOpen: false,
            cooldownUntil: 0,
            totalRequests: 0,
            totalSuccesses: 0,
        };
    }

    /**
     * Record a successful request
     */
    recordSuccess(provider: EmailService, responseTimeMs: number): void {
        const health = this.getOrCreate(provider);

        health.totalRequests++;
        health.totalSuccesses++;
        health.consecutiveFailures = 0;
        health.lastSuccess = Date.now();
        health.circuitOpen = false;
        health.cooldownUntil = 0;
        health.lastError = null;

        // Rolling average success rate
        health.successRate = health.successRate * this.config.successRateDecay +
            (1 - this.config.successRateDecay);

        // Rolling average response time
        health.avgResponseTime = health.avgResponseTime * this.config.responseTimeDecay +
            responseTimeMs * (1 - this.config.responseTimeDecay);

        log.debug(`✅ ${provider} success`, {
            successRate: health.successRate.toFixed(2),
            responseTime: responseTimeMs
        });
    }

    /**
     * Record a failed request
     */
    recordFailure(provider: EmailService, error: Error): void {
        const health = this.getOrCreate(provider);

        health.totalRequests++;
        health.consecutiveFailures++;
        health.lastFailure = Date.now();
        health.lastError = error.message;

        // Decay success rate
        health.successRate = health.successRate * this.config.successRateDecay;

        // Check if we should open the circuit
        if (health.consecutiveFailures >= this.config.circuitBreakerThreshold) {
            this.openCircuit(provider, health);
        }

        log.warn(`❌ ${provider} failure`, {
            consecutiveFailures: health.consecutiveFailures,
            successRate: health.successRate.toFixed(2),
            error: error.message.slice(0, 100)
        });
    }

    /**
     * Open circuit breaker for a provider
     */
    private openCircuit(provider: EmailService, health: ProviderHealth): void {
        health.circuitOpen = true;

        // Exponential backoff: 30s, 60s, 120s, 240s, ... up to 30 min
        const backoffMultiplier = Math.pow(2, Math.min(health.consecutiveFailures - 1, 6));
        const cooldownDuration = Math.min(
            this.config.baseCooldown * backoffMultiplier,
            this.config.maxCooldown
        );

        // Add jitter (±20%) to prevent thundering herd
        const jitter = cooldownDuration * 0.2 * (Math.random() - 0.5);
        health.cooldownUntil = Date.now() + cooldownDuration + jitter;

        log.warn(`🔌 Circuit OPEN for ${provider}`, {
            cooldownSeconds: Math.round((cooldownDuration + jitter) / 1000),
            failures: health.consecutiveFailures
        });
    }

    /**
     * Check if a provider is available (circuit closed and not in cooldown)
     */
    isAvailable(provider: EmailService): boolean {
        const health = this.health.get(provider);
        if (!health) return true; // Unknown providers are assumed available

        // Check if cooldown has expired
        if (health.cooldownUntil > 0 && Date.now() > health.cooldownUntil) {
            // Cooldown expired, try half-open state
            health.circuitOpen = false;
            health.cooldownUntil = 0;
            log.info(`🔄 ${provider} cooldown expired, attempting recovery`);
        }

        return !health.circuitOpen && health.cooldownUntil <= Date.now();
    }

    /**
     * Calculate health score for a provider (higher = better)
     */
    calculateScore(provider: EmailService): number {
        const health = this.health.get(provider);
        if (!health) return 50; // Unknown providers get neutral score

        if (!this.isAvailable(provider)) return -100; // Not available

        let score = 0;

        // Success rate contribution (0-40 points)
        score += health.successRate * 40;

        // Recency bonus (0-20 points) - prefer recently successful
        const timeSinceSuccess = Date.now() - health.lastSuccess;
        const recencyBonus = Math.max(0, 20 - (timeSinceSuccess / (60 * 1000))); // -1 point per minute
        score += recencyBonus;

        // Response time penalty (0-20 points penalty)
        const responseTimePenalty = Math.min(20, health.avgResponseTime / 100);
        score -= responseTimePenalty;

        // Priority bonus based on predefined order (0-10 points)
        const priorityIndex = this.providerPriority.indexOf(provider);
        if (priorityIndex >= 0) {
            score += (this.providerPriority.length - priorityIndex) * 2;
        }

        // Failure penalty (exponential)
        score -= Math.pow(1.5, health.consecutiveFailures) * 5;

        return Math.max(-100, Math.min(100, score));
    }

    /**
     * Get the best available provider
     */
    getBestProvider(exclude?: EmailService[]): EmailService | null {
        const excludeSet = new Set(exclude || []);
        const candidates: Array<{ provider: EmailService; score: number }> = [];

        for (const provider of this.providerPriority) {
            if (excludeSet.has(provider)) continue;
            if (!this.isAvailable(provider)) continue;

            candidates.push({
                provider,
                score: this.calculateScore(provider)
            });
        }

        // Sort by score descending
        candidates.sort((a, b) => b.score - a.score);

        if (candidates.length === 0) {
            log.error('🚨 No providers available!');
            return null;
        }

        const best = candidates[0];
        log.debug(`📊 Best provider: ${best.provider} (score: ${best.score.toFixed(1)})`);

        return best.provider;
    }

    /**
     * Get all provider health statuses
     */
    getHealthReport(): ProviderHealth[] {
        return Array.from(this.health.values());
    }

    /**
     * Calculate exponential backoff delay for retries
     */
    getRetryDelay(attempt: number): number {
        const baseDelay = 500; // 500ms
        const maxDelay = 10000; // 10 seconds

        const delay = baseDelay * Math.pow(2, attempt);
        const jitter = delay * 0.3 * Math.random(); // 0-30% jitter

        return Math.min(delay + jitter, maxDelay);
    }

    /**
     * Force reset a provider (for manual recovery)
     */
    resetProvider(provider: EmailService): void {
        this.health.set(provider, this.createDefaultHealth(provider));
        log.info(`🔧 ${provider} manually reset`);
    }

    /**
     * Reset all providers
     */
    resetAll(): void {
        this.initializeProviders();
        log.info('🔧 All providers reset');
    }

    private getOrCreate(provider: EmailService): ProviderHealth {
        let health = this.health.get(provider);
        if (!health) {
            health = this.createDefaultHealth(provider);
            this.health.set(provider, health);
        }
        return health;
    }
}

// Export singleton instance
export const providerHealth = new ProviderHealthManager();
