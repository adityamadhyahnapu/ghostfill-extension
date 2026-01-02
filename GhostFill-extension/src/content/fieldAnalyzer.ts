// Field Analyzer - Analyze input field types


import { FieldType, DetectedField, FIELD_HEURISTICS } from '../types';
import { getUniqueSelector, getElementLabel } from '../utils/helpers';
import { createLogger } from '../utils/logger';

const log = createLogger('FieldAnalyzer');

export class FieldAnalyzer {
    // Static cache shared across all instances
    private static aiCache = new Map<string, { response: any; timestamp: number }>();

    /**
     * Analyze a single input field
     */
    analyzeField(element: HTMLInputElement | HTMLTextAreaElement): DetectedField {
        const type = element.type?.toLowerCase() || 'text';
        const name = element.name?.toLowerCase() || '';
        const id = element.id?.toLowerCase() || '';
        const placeholder = element.placeholder?.toLowerCase() || '';
        const autocomplete = element.autocomplete?.toLowerCase() || '';
        const ariaLabel = element.getAttribute('aria-label')?.toLowerCase() || '';
        const ariaLabelledBy = element.getAttribute('aria-labelledby')?.toLowerCase() || '';
        const label = getElementLabel(element).toLowerCase();

        let fieldType: FieldType = 'unknown';
        let maxConfidence = 0;

        // Check each field type
        for (const [fType, heuristics] of Object.entries(FIELD_HEURISTICS)) {
            if (fType === 'unknown') continue;

            const isIdentityField = ['name', 'first-name', 'last-name', 'username'].includes(fType);
            const textToCheckAll = [name, id, placeholder, label, ariaLabel, ariaLabelledBy].join(' ');

            // NEGATION RULE: If an identity field's label contains "code", "otp", or "#", it is NOT an identity field
            if (isIdentityField && (/code/i.test(textToCheckAll) || /otp/i.test(textToCheckAll) || /#/i.test(textToCheckAll))) {
                continue;
            }

            let confidence = 0;
            let matches = 0;
            // Check type attribute
            if (heuristics.types.includes(type)) {
                confidence += 0.4;
                matches++;
            }

            // Check autocomplete attribute
            if (heuristics.autocomplete.includes(autocomplete)) {
                confidence += 0.3;
                matches++;
            }

            // Check patterns against name, id, placeholder, label, and ARIA
            const patternMatch = heuristics.patterns.some((p) => p.test(textToCheckAll));
            if (patternMatch) {
                confidence += 0.2;
                matches++;
            }

            // Check keywords
            const keywordMatch = heuristics.keywords.some((k) => textToCheckAll.includes(k));
            if (keywordMatch) {
                confidence += 0.1;
                matches++;
            }

            // Update if this is the best match
            if (confidence > maxConfidence && matches >= 1) {
                maxConfidence = confidence;
                fieldType = fType as FieldType;
            }
        }

        // FALLBACK: If no type detected, try aggressive email detection
        if (fieldType === 'unknown' || maxConfidence < 0.3) {
            // Type email is ALWAYS an email field
            if (type === 'email') {
                fieldType = 'email';
                maxConfidence = 0.9;
            }
            // Placeholder with @ symbol is likely email
            else if (placeholder.includes('@') || placeholder.includes('example.com')) {
                fieldType = 'email';
                maxConfidence = 0.7;
            }
            // First visible text input in a form is often email/username
            else if (type === 'text' && this.isFirstVisibleInput(element)) {
                fieldType = 'email';
                maxConfidence = 0.4;
            }
        }

        // Special handling for OTP fields
        const isOTP = this.isLikelyOTPField(element);
        const otpConfidence = this.calculateOTPConfidence(element);

        // Debug log only if confidence is high or detected as OTP (to reduce noise)
        if (maxConfidence > 0.8 || isOTP || fieldType !== 'unknown') {
            // log.debug('Field analysis', { type: fieldType, confidence: maxConfidence, isOTP }); 
        }

        if (isOTP && otpConfidence > maxConfidence) {
            fieldType = 'otp';
            maxConfidence = otpConfidence;
        }

        // Special handling for confirm password
        if (fieldType === 'password') {
            const textToConfirm = [name, id, placeholder, label].join(' ');
            if (/confirm|repeat|retype|verify/i.test(textToConfirm)) {
                fieldType = 'confirm-password';
            }
        }

        return {
            element,
            selector: getUniqueSelector(element),

            fieldType,
            confidence: Math.min(1, maxConfidence),
            label: getElementLabel(element) || undefined,
            placeholder: element.placeholder || undefined,
            name: element.name || undefined,
            id: element.id || undefined,
            autocomplete: element.autocomplete || undefined,
            rect: element.getBoundingClientRect(),
        };
    }

    /**
     * Check if field is likely an OTP input
     */
    isLikelyOTPField(element: HTMLInputElement | HTMLTextAreaElement): boolean {
        const maxLength = element.maxLength;
        const inputMode = element.getAttribute('inputmode');
        const autocomplete = element.autocomplete;

        // Single digit OTP field
        if (maxLength === 1) return true;

        // Full OTP field (4-8 digits)
        if (maxLength >= 4 && maxLength <= 8 && inputMode === 'numeric') return true;

        // One-time-code autocomplete
        if (autocomplete === 'one-time-code') return true;

        // Pattern for digits only (only HTMLInputElement has pattern)
        if (element instanceof HTMLInputElement && element.pattern && /^\^?\\?d/.test(element.pattern)) return true;

        // Check name/id/placeholder
        const textToCheck = [
            element.name,
            element.id,
            element.placeholder,
        ].join(' ').toLowerCase();

        return /otp|code|verify|token|pin|2fa|mfa/i.test(textToCheck);
    }

    /**
     * Calculate OTP field confidence
     */
    calculateOTPConfidence(element: HTMLInputElement | HTMLTextAreaElement): number {
        let confidence = 0;

        // Single-character fields are ALMOST ALWAYS OTP (highest priority)
        if (element.maxLength === 1) confidence += 0.95;
        if (element.maxLength >= 4 && element.maxLength <= 8) confidence += 0.2;
        if (element.getAttribute('inputmode') === 'numeric') confidence += 0.2;
        if (element.autocomplete === 'one-time-code') confidence += 0.4;
        if (element.type === 'tel' || element.type === 'number') confidence += 0.1;

        const textToCheck = [element.name, element.id, element.placeholder].join(' ').toLowerCase();
        if (/otp/i.test(textToCheck)) confidence += 0.3;
        if (/code/i.test(textToCheck)) confidence += 0.2;
        if (/verify/i.test(textToCheck)) confidence += 0.1;

        return Math.min(1, confidence);
    }

    /**
     * Find all OTP-related fields on page
     */
    findOTPFields(): DetectedField[] {
        const inputs = document.querySelectorAll<HTMLInputElement>(
            'input[type="text"], input[type="number"], input[type="tel"], input:not([type])'
        );

        const otpFields: DetectedField[] = [];

        inputs.forEach((input) => {
            if (this.isLikelyOTPField(input)) {
                otpFields.push(this.analyzeField(input));
            }
        });

        // Sort by confidence
        otpFields.sort((a, b) => b.confidence - a.confidence);

        return otpFields;
    }

    /**
     * Find a group of single-digit OTP inputs
     */
    findOTPInputGroup(startElement: HTMLInputElement): HTMLInputElement[] {
        const group: HTMLInputElement[] = [startElement];
        const parent = startElement.parentElement;

        if (!parent) return group;

        // Find sibling inputs that look like OTP digits
        const siblings = parent.querySelectorAll<HTMLInputElement>('input');

        siblings.forEach((input) => {
            if (
                input !== startElement &&
                input.maxLength === 1 &&
                this.isLikelyOTPField(input)
            ) {
                group.push(input);
            }
        });

        // Sort by position
        group.sort((a, b) => {
            const rectA = a.getBoundingClientRect();
            const rectB = b.getBoundingClientRect();
            return rectA.left - rectB.left;
        });

        return group;
    }

    /**
     * Get all fillable fields on the page
     */
    getAllFields(): DetectedField[] {
        const selector = 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]):not([type="file"]), textarea';
        const elements = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(selector);

        const fields: DetectedField[] = [];

        elements.forEach((element) => {
            // Skip invisible elements
            const rect = element.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;

            const style = window.getComputedStyle(element);
            if (style.display === 'none' || style.visibility === 'hidden') return;

            fields.push(this.analyzeField(element));
        });

        return fields;
    }

    /**
     * Check if element is the first visible text input in its form
     * First input is often email/username on signup/login forms
     */
    private isFirstVisibleInput(element: HTMLInputElement | HTMLTextAreaElement): boolean {
        // Find parent form or body
        const form = element.closest('form') || document.body;

        // Get all visible text inputs
        const inputs = Array.from(form.querySelectorAll<HTMLInputElement>(
            'input[type="text"], input[type="email"], input:not([type])'
        )).filter(input => {
            const rect = input.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return false;
            const style = window.getComputedStyle(input);
            return style.display !== 'none' && style.visibility !== 'hidden';
        });

        // Check if this element is the first one
        return inputs.length > 0 && inputs[0] === element;
    }

    /**
     * AI-AS-BACKUP: Get all fields with heuristics first, AI only when confidence < 70%
     * Fast path: Heuristics are instant and work 95% of the time
     * Slow path: AI only when heuristics can't confidently detect fields
     */
    async getAllFieldsWithAI(): Promise<{
        fields: DetectedField[];
        aiSelectors?: { email?: string; password?: string; submit?: string };
    }> {
        // STEP 1: Always try heuristics first (instant)
        const fields = this.getAllFields();

        // STEP 2: Calculate overall confidence
        const emailField = fields.find(f => f.fieldType === 'email');
        const passwordField = fields.find(f => f.fieldType === 'password');

        const emailConfidence = emailField?.confidence ?? 0;
        const passwordConfidence = passwordField?.confidence ?? 0;

        // If we have at least one field with good confidence, consider it successful
        const hasHighConfidenceField = emailConfidence >= 0.7 || passwordConfidence >= 0.7;

        // FAST PATH: If heuristics confidence >= 70%, skip AI entirely
        if (hasHighConfidenceField) {
            log.info('✅ Heuristics succeeded (confidence >= 70%), skipping AI', {
                emailConfidence: emailConfidence.toFixed(2),
                passwordConfidence: passwordConfidence.toFixed(2)
            });
            return { fields };
        }

        // SLOW PATH: Heuristics confidence < 70%, call AI as backup
        log.info('⚠️ Heuristics confidence < 70%, calling AI as backup...', {
            emailConfidence: emailConfidence.toFixed(2),
            passwordConfidence: passwordConfidence.toFixed(2)
        });

        try {
            const simplifiedDOM = this.extractSimplifiedDOM();
            if (!simplifiedDOM || simplifiedDOM.length < 20) {
                return { fields };
            }

            // CHECK CACHE
            let domHash = 0;
            for (let i = 0; i < simplifiedDOM.length; i++) {
                domHash = ((domHash << 5) - domHash) + simplifiedDOM.charCodeAt(i);
                domHash |= 0;
            }
            const cacheKey = domHash.toString();

            const cached = FieldAnalyzer.aiCache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < 60000) {
                log.debug('Returning cached AI analysis results');
                return this.processAIResponse(fields, cached.response);
            }

            log.info('🤖 Summoning AI Agent as backup for form analysis...');

            // Call background script for AI analysis with a timeout
            const response = await Promise.race([
                chrome.runtime.sendMessage({
                    action: 'ANALYZE_DOM',
                    payload: { simplifiedDOM }
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('AI Timeout')), 30000))
            ]);

            // Save to cache if successful
            if (response?.success) {
                FieldAnalyzer.aiCache.set(cacheKey, { response, timestamp: Date.now() });
                if (FieldAnalyzer.aiCache.size > 20) {
                    const first = FieldAnalyzer.aiCache.keys().next().value;
                    if (first) FieldAnalyzer.aiCache.delete(first);
                }
            }

            return this.processAIResponse(fields, response);

        } catch (error) {
            log.warn('AI backup failed. Using heuristics result.', error);
        }

        return { fields };
    }

    /**
     * Helper to process AI response and map to fields
     */
    private processAIResponse(fields: DetectedField[], response: any): { fields: DetectedField[], aiSelectors?: any } {
        if (response?.success && (response.email || response.password)) {

            log.info('AI Agent successfully identified fields', response);

            // Map AI selectors back to detected fields
            const aiSelectors = {
                email: response.email,
                password: response.password,
                submit: response.submit
            };

            // Update or add fields based on AI selectors
            const processAISelector = (selector: string, type: FieldType) => {
                try {
                    const el = document.querySelector<HTMLInputElement>(selector);
                    if (el) {
                        const existing = fields.find(f => f.element === el);
                        if (existing) {
                            existing.fieldType = type;
                            existing.confidence = 0.95; // AI is high confidence fallback
                        } else {
                            const newField = this.analyzeField(el);
                            newField.fieldType = type;
                            newField.confidence = 0.95;
                            fields.push(newField);
                        }
                    }
                } catch (e) {
                    log.warn(`AI suggested invalid selector: ${selector}`);
                }
            };

            if (aiSelectors.email) processAISelector(aiSelectors.email, 'email');
            if (aiSelectors.password) processAISelector(aiSelectors.password, 'password');

            return { fields, aiSelectors };
        }
        return { fields };
    }

    /**
     * Extract simplified DOM for AI analysis
     * Focuses on inputs, labels, and their relationships
     */
    private extractSimplifiedDOM(): string {
        try {
            // Find the most relevant container (likely a form)
            const root = document.querySelector('form') || document.body;

            // Get all interactive elements
            const elements = Array.from(root.querySelectorAll('input, button, label, [role="button"]'));

            let html = '<form_structure>\n';

            elements.forEach(el => {
                if (el instanceof HTMLInputElement) {
                    // Skip hidden/non-text inputs
                    if (['hidden', 'submit', 'button', 'reset', 'checkbox', 'radio'].includes(el.type)) return;

                    const id = el.id ? ` id="${el.id}"` : '';
                    const name = el.name ? ` name="${el.name}"` : '';
                    const type = el.type ? ` type="${el.type}"` : '';
                    const placeholder = el.placeholder ? ` placeholder="${el.placeholder}"` : '';
                    const ariaLabel = el.getAttribute('aria-label') ? ` aria-label="${el.getAttribute('aria-label')}"` : '';

                    // Find associated label text
                    let labelText = '';
                    if (el.id) {
                        const label = document.querySelector(`label[for="${el.id}"]`);
                        if (label) labelText = ` label="${label.textContent?.trim()}"`;
                    }
                    if (!labelText) {
                        const parentLabel = el.closest('label');
                        if (parentLabel) labelText = ` label="${parentLabel.textContent?.trim()}"`;
                    }

                    html += `  <input${type}${id}${name}${placeholder}${ariaLabel}${labelText}>\n`;
                } else if (el instanceof HTMLLabelElement) {
                    // Only include labels that aren't wrapping inputs (we handle those above)
                    if (!el.querySelector('input')) {
                        html += `  <label for="${el.getAttribute('for') || ''}">${el.textContent?.trim()}</label>\n`;
                    }
                } else if (el instanceof HTMLButtonElement || el.getAttribute('role') === 'button') {
                    const text = el.textContent?.trim() || el.getAttribute('aria-label') || 'button';
                    const type = el instanceof HTMLButtonElement ? ` type="${el.type}"` : '';
                    html += `  <button${type}>${text}</button>\n`;
                }
            });

            html += '</form_structure>';

            // Limit length for tokens
            return html.substring(0, 4000);
        } catch (e) {
            log.error('DOM simplification failed', e);
            return '';
        }
    }
}
