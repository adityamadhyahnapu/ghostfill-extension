// OTP Page Detector - Detects OTP verification pages and coordinates auto-fill

import { createLogger } from '../utils/logger';
import { ExtensionMessage } from '../types';
import { safeSendMessage } from '../utils/messaging';
import { AutoFiller } from './autoFiller';
import { FormDetector } from './formDetector';

const log = createLogger('OTPPageDetector');

export class OTPPageDetector {
    private isOTPPage = false;
    private otpFieldSelectors: string[] = [];
    private autoFiller: AutoFiller;
    private formDetector: FormDetector;
    private checkInterval: ReturnType<typeof setInterval> | null = null;
    private _hasLoggedAIFallback = false;
    private _hasTriedAIFallback = false;
    private _hasLoggedSuccess = false;

    constructor(autoFiller: AutoFiller, formDetector: FormDetector) {
        this.autoFiller = autoFiller;
        this.formDetector = formDetector;
    }

    /**
     * Initialize OTP page detection
     */
    init(): void {
        // Check on init
        this.detectOTPPage();

        // Listen for auto-fill messages from background
        if (chrome?.runtime?.onMessage) {
            chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
                if (message.action === 'AUTO_FILL_OTP') {
                    this.handleAutoFill(message.payload);
                    sendResponse({ success: true });
                    return true;
                }
                return false;
            });
        }

        // Re-check periodically for dynamic pages
        this.checkInterval = setInterval(() => {
            this.detectOTPPage();
        }, 2000);

        log.debug('OTP Page Detector initialized');
    }

    /**
     * Detect if current page has OTP input fields
     */
    detectOTPPage(): boolean {
        const analysis = this.formDetector.detectForms();
        const otpFields: string[] = [];

        // Check forms for OTP fields
        for (const form of analysis.forms) {
            if (form.formType === 'two-factor') {
                form.fields
                    .filter(f => f.fieldType === 'otp')
                    .forEach(f => otpFields.push(f.selector));
            }
        }

        // Check standalone OTP fields
        analysis.standaloneFields
            .filter(f => f.fieldType === 'otp')
            .forEach(f => otpFields.push(f.selector));

        // Also check for common OTP input patterns not detected as forms
        const additionalOtpFields = this.findAdditionalOTPFields();
        additionalOtpFields.forEach(selector => {
            if (!otpFields.includes(selector)) {
                otpFields.push(selector);
            }
        });

        // =====================================================================
        // CONFIDENCE CALCULATION for AI fallback decision
        // =====================================================================
        let heuristicsConfidence = 0;

        if (otpFields.length > 0) {
            // Higher confidence if found by multiple methods
            const fromForm = analysis.forms.some(f => f.formType === 'two-factor');
            const fromStandalone = analysis.standaloneFields.some(f => f.fieldType === 'otp');
            const fromPattern = additionalOtpFields.length > 0;

            const methods = [fromForm, fromStandalone, fromPattern].filter(Boolean).length;
            heuristicsConfidence = 0.4 + (methods * 0.2); // 0.6 to 1.0
        } else if (this.pageHasOTPContext()) {
            heuristicsConfidence = 0.3; // Some context but no fields found
        }

        // =====================================================================
        // AI FALLBACK: If heuristics confidence < 70% but page has OTP context
        // =====================================================================
        if (heuristicsConfidence < 0.7 && this.pageHasOTPContext() && otpFields.length === 0) {
            // Only try AI once per page
            if (!this._hasTriedAIFallback) {
                this._hasTriedAIFallback = true;
                log.info('⚠️ Heuristics confidence < 70%, calling AI for OTP field detection', {
                    confidence: heuristicsConfidence.toFixed(2)
                });

                // Call background for AI analysis (async, fire-and-forget for this sync function)
                this.requestAIOTPDetection();
            }
        } else if (otpFields.length > 0) {
            if (!this._hasLoggedSuccess) {
                log.info('✅ Heuristics OTP detection succeeded (confidence >= 70%), skipping AI', {
                    confidence: heuristicsConfidence.toFixed(2),
                    fieldsFound: otpFields.length
                });
                this._hasLoggedSuccess = true;
            }
        }

        const wasOTPPage = this.isOTPPage;
        this.isOTPPage = otpFields.length > 0;
        this.otpFieldSelectors = otpFields;

        // Notify background of state change
        if (this.isOTPPage && !wasOTPPage) {
            this.notifyOTPPageDetected();
        } else if (!this.isOTPPage && wasOTPPage) {
            this.notifyOTPPageLeft();
        }

        return this.isOTPPage;
    }

    /**
     * Find OTP fields that might not be detected by form detector
     */
    private findAdditionalOTPFields(): string[] {
        const selectors: string[] = [];

        // Comprehensive OTP input patterns
        const otpSelectors = [
            'input[autocomplete="one-time-code"]',
            'input[name*="otp" i]',
            'input[name*="code" i]',
            'input[name*="verify" i]',
            'input[name*="verification" i]',
            'input[name*="token" i]',
            'input[name*="pin" i]',
            'input[name*="2fa" i]',
            'input[name*="mfa" i]',
            'input[id*="otp" i]',
            'input[id*="code" i]',
            'input[id*="verify" i]',
            'input[id*="verification" i]',
            'input[id*="token" i]',
            'input[id*="pin" i]',
            'input[placeholder*="code" i]',
            'input[placeholder*="OTP" i]',
            'input[placeholder*="verification" i]',
            'input[placeholder*="token" i]',
            'input[placeholder*="pin" i]',
            // Maxlength-based detection (common OTP lengths)
            'input[maxlength="4"]',
            'input[maxlength="5"]',
            'input[maxlength="6"]',
            'input[maxlength="7"]',
            'input[maxlength="8"]',
        ];

        // Single digit input groups (common OTP pattern)
        const singleDigitInputs = document.querySelectorAll<HTMLInputElement>(
            'input[maxlength="1"][type="text"], input[maxlength="1"][type="tel"], input[maxlength="1"][type="number"], input[maxlength="1"]'
        );

        if (singleDigitInputs.length >= 4 && singleDigitInputs.length <= 8) {
            // Likely an OTP input group
            singleDigitInputs.forEach((input, index) => {
                const selector = this.generateSelector(input) || `input[maxlength="1"]:nth-of-type(${index + 1})`;
                selectors.push(selector);
            });
        }

        // Look for any group of small, adjacent input fields (common OTP pattern)
        const allTextInputs = document.querySelectorAll<HTMLInputElement>('input[type="text"], input[type="tel"], input[type="number"], input:not([type])');
        const smallInputs = Array.from(allTextInputs).filter(input => {
            const rect = input.getBoundingClientRect();
            return this.isVisible(input as HTMLElement) && rect.width <= 60 && rect.width >= 20;
        });

        // If we have 4-8 small adjacent inputs, they're likely OTP boxes
        if (smallInputs.length >= 4 && smallInputs.length <= 8) {
            log.info('Found potential OTP boxes by size', { count: smallInputs.length });
            smallInputs.forEach(input => {
                const selector = this.generateSelector(input);
                if (selector && !selectors.includes(selector)) {
                    selectors.push(selector);
                }
            });
        }

        // Check explicit OTP selectors
        otpSelectors.forEach(selector => {
            const elements = document.querySelectorAll<HTMLInputElement>(selector);
            elements.forEach(el => {
                if (this.isVisible(el)) {
                    const elSelector = this.generateSelector(el);
                    if (elSelector && !selectors.includes(elSelector)) {
                        selectors.push(elSelector);
                    }
                }
            });
        });

        // AI FALLBACK: If page text suggests OTP but no fields found, look harder
        // OPTIMIZATION: Only do this if there are visible inputs on the page
        const visibleInputs = document.querySelectorAll('input:not([type="hidden"])');
        if (selectors.length === 0 && visibleInputs.length > 0 && this.pageHasOTPContext()) {
            // Only log once per page navigation
            if (!this._hasLoggedAIFallback) {
                log.info('🤖 Page has OTP context, using AI fallback detection');
                this._hasLoggedAIFallback = true;
            }
            const aiFields = this.detectOTPFieldsWithAI();
            selectors.push(...aiFields);
        }

        return selectors;
    }

    /**
     * Check if page content suggests this is an OTP verification page
     */
    private pageHasOTPContext(): boolean {
        const bodyText = document.body.innerText.toLowerCase();
        const otpKeywords = [
            'verification code', 'verify code', 'enter code', 'otp',
            'one-time password', 'one time password', 'authentication code',
            'security code', 'confirmation code', 'sms code', '2fa',
            'two-factor', 'two factor', 'verify your', 'verification'
        ];
        return otpKeywords.some(keyword => bodyText.includes(keyword));
    }

    /**
     * AI-powered OTP field detection - finds fields based on visual layout and context
     */
    private detectOTPFieldsWithAI(): string[] {
        const selectors: string[] = [];

        // Find all visible input fields
        const allInputs = document.querySelectorAll<HTMLInputElement>('input:not([type="hidden"]):not([type="submit"]):not([type="button"])');
        const visibleInputs = Array.from(allInputs).filter(input => this.isVisible(input as HTMLElement));

        // Group inputs by their parent container
        const containerGroups = new Map<Element | null, HTMLInputElement[]>();

        visibleInputs.forEach(input => {
            const parent = input.parentElement;
            if (parent) {
                const existing = containerGroups.get(parent) || [];
                existing.push(input);
                containerGroups.set(parent, existing);
            }
        });

        // Look for containers with 4-8 inputs (typical OTP pattern)
        containerGroups.forEach((inputs, container) => {
            if (inputs.length >= 4 && inputs.length <= 8) {
                // Check if inputs are similar sized (indicating OTP group)
                const sizes = inputs.map(i => i.getBoundingClientRect().width);
                const avgSize = sizes.reduce((a, b) => a + b, 0) / sizes.length;
                const allSimilarSize = sizes.every(s => Math.abs(s - avgSize) < 20);

                if (allSimilarSize) {
                    log.info('🤖 AI detected OTP group by container analysis', {
                        inputCount: inputs.length,
                        avgWidth: avgSize
                    });
                    inputs.forEach(input => {
                        const selector = this.generateSelector(input);
                        if (selector) selectors.push(selector);
                    });
                }
            }
        });

        return selectors;
    }

    /**
     * Request background to use AI for OTP field detection
     * Called when heuristics confidence < 70%
     */
    private async requestAIOTPDetection(): Promise<void> {
        try {
            // Simplify DOM for AI analysis
            const simplifiedDOM = this.getSimplifiedDOM();

            const response = await safeSendMessage({
                action: 'ANALYZE_DOM',
                payload: { simplifiedDOM }
            }) as { success: boolean; result?: { confidence?: number } };

            if (response?.success && response.result?.confidence && response.result.confidence >= 0.7) {
                log.info('✅ AI found OTP fields with high confidence', {
                    confidence: response.result.confidence
                });
                // AI found fields - next detection cycle will pick them up
            } else {
                log.debug('AI did not find high-confidence OTP fields');
            }
        } catch (error) {
            log.warn('AI OTP detection failed', error);
        }
    }

    /**
     * Get simplified DOM for AI analysis
     */
    private getSimplifiedDOM(): string {
        const inputs = document.querySelectorAll('input:not([type="hidden"])');
        const forms = document.querySelectorAll('form');

        let html = '';
        forms.forEach(form => {
            html += form.outerHTML.substring(0, 2000) + '\n';
        });
        inputs.forEach(input => {
            if (!input.closest('form')) {
                html += input.outerHTML + '\n';
            }
        });

        return html.substring(0, 5000); // Limit size
    }

    /**
     * Generate a unique selector for an element - ALWAYS returns something
     */
    private generateSelector(element: HTMLInputElement): string | null {
        if (element.id) {
            return `#${element.id}`;
        }
        if (element.name) {
            return `input[name="${element.name}"]`;
        }
        if (element.className && typeof element.className === 'string') {
            // Filter out classes that would create invalid selectors
            // Reject: classes with colons (pseudo-class conflicts), empty, or too short
            const validClasses = element.className
                .split(' ')
                .filter(c => c.trim() && c.length > 1 && !c.includes(':') && !c.includes('[') && !c.includes(']'))
                .slice(0, 2); // Only use first 2 classes to avoid super long selectors

            if (validClasses.length > 0) {
                return `input.${validClasses.join('.')}`;
            }
        }

        // FALLBACK: Use nth-child with parent context
        const parent = element.parentElement;
        if (parent) {
            const siblings = Array.from(parent.querySelectorAll('input')).filter(el => this.isVisible(el as HTMLElement));
            const index = siblings.indexOf(element);
            if (index >= 0) {
                // Create a unique enough selector
                return `input:nth-of-type(${index + 1})`;
            }
        }

        // Ultimate fallback - just use input type
        return `input[type="${element.type || 'text'}"]`;
    }

    /**
     * Check if element is visible
     */
    private isVisible(element: HTMLElement): boolean {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return (
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.opacity !== '0'
        );
    }

    /**
     * Notify background that OTP page was detected
     */
    private async notifyOTPPageDetected(): Promise<void> {
        log.info('OTP page detected', {
            fieldCount: this.otpFieldSelectors.length,
            url: window.location.href
        });

        try {
            await safeSendMessage({
                action: 'OTP_PAGE_DETECTED',
                payload: {
                    url: window.location.href,
                    fieldCount: this.otpFieldSelectors.length,
                    fieldSelectors: this.otpFieldSelectors,
                },
            } as ExtensionMessage);
        } catch (error) {
            log.warn('Failed to notify background of OTP page', error);
        }
    }

    /**
     * Notify background that user left OTP page
     */
    private async notifyOTPPageLeft(): Promise<void> {
        log.debug('Left OTP page');

        try {
            await safeSendMessage({
                action: 'OTP_PAGE_LEFT',
            });
        } catch (error) {
            log.warn('Failed to notify background of leaving OTP page', error);
        }
    }

    /**
     * Handle auto-fill OTP from background
     */
    private handleAutoFill(payload: { otp: string; source: string; confidence: number }): void {
        if (!this.isOTPPage) {
            log.debug('Received auto-fill but ignored (not an active OTP page)');
            return;
        }

        log.info('Auto-filling OTP', { otp: payload.otp, source: payload.source });

        // Use the autoFiller to fill OTP fields
        const success = this.autoFiller.fillOTP(payload.otp, this.otpFieldSelectors);

        if (success) {
            log.info('OTP auto-filled successfully');

            // Show visual feedback
            this.showAutoFillFeedback(payload.otp);
        } else {
            log.warn('Failed to auto-fill OTP');
        }
    }

    /**
     * Show visual feedback when OTP is auto-filled
     */
    private showAutoFillFeedback(otp: string): void {
        // Create a toast notification
        const toast = document.createElement('div');
        toast.id = 'ghostfill-otp-toast';
        toast.innerHTML = `
            <div style="
                position: fixed;
                top: 20px;
                right: 20px;
                background: linear-gradient(135deg, #6366F1, #8B5CF6);
                color: white;
                padding: 16px 24px;
                border-radius: 12px;
                box-shadow: 0 10px 40px rgba(99, 102, 241, 0.4);
                z-index: 999999;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 14px;
                display: flex;
                align-items: center;
                gap: 12px;
                animation: slideIn 0.3s ease-out;
            ">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 12l2 2 4-4"/>
                    <circle cx="12" cy="12" r="10"/>
                </svg>
                <div>
                    <div style="font-weight: 600;">OTP Auto-Filled</div>
                    <div style="opacity: 0.9; font-size: 12px;">Code: ${otp}</div>
                </div>
            </div>
            <style>
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            </style>
        `;

        document.body.appendChild(toast);

        // Remove after 3 seconds
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }

    /**
     * Get current OTP page status
     */
    getStatus(): { isOTPPage: boolean; fieldCount: number; selectors: string[] } {
        return {
            isOTPPage: this.isOTPPage,
            fieldCount: this.otpFieldSelectors.length,
            selectors: this.otpFieldSelectors,
        };
    }

    /**
     * Clean up
     */
    destroy(): void {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }

        if (this.isOTPPage) {
            this.notifyOTPPageLeft();
        }
    }
}
