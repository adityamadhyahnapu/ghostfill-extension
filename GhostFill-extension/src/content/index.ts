// Content Script Entry Point

import { FormDetector } from './formDetector';
import { FieldAnalyzer } from './fieldAnalyzer';
import { AutoFiller } from './autoFiller';
import { FloatingButton } from './floatingButton';
import { DOMObserver } from './domObserver';
import { OTPPageDetector } from './otpPageDetector';
import { pageStatus } from './pageStatus';
import './ui/GhostLabel'; // Register web component
import { createLogger } from '../utils/logger';
import './styles/content.css';

const log = createLogger('ContentScript');

// MONKEY PATCH: Kill intrusive alerts and use Toast instead
try {
    const originalAlert = window.alert;
    (window as any).alert = function (message: any) {
        // Log it for debugging
        log.debug('Suppressed alert:', message);

        // Show our non-blocking toast
        try {
            // Wait for module load if needed, or just access global
            pageStatus.error(String(message));
        } catch (e) {
            console.error('Failed to show toast for alert', e);
        }
    };
    log.info('🛡️ Alert suppression active');
} catch (e) {
    log.warn('Failed to patch window.alert', e);
}

log.info('GhostFill content script loaded');

// Initialize components (wrapped in try-catch for hostile page environments)
let fieldAnalyzer: FieldAnalyzer;
let formDetector: FormDetector;
let autoFiller: AutoFiller;
let floatingButton: FloatingButton;
let domObserver: DOMObserver;
let otpPageDetector: OTPPageDetector;

try {
    fieldAnalyzer = new FieldAnalyzer();
    formDetector = new FormDetector(fieldAnalyzer);
    autoFiller = new AutoFiller();
    floatingButton = new FloatingButton(autoFiller); // Inject autoFiller
    domObserver = new DOMObserver(formDetector, autoFiller);
    otpPageDetector = new OTPPageDetector(autoFiller, formDetector);
    // Note: Initial scan is handled by init() function which is called on DOMContentLoaded
} catch (e) {
    log.error('Failed to initialize content script components', e);
    // Create dummy objects to prevent further crashes
    fieldAnalyzer = {} as FieldAnalyzer;
    formDetector = {} as FormDetector;
    autoFiller = {} as AutoFiller;
    floatingButton = {} as FloatingButton;
    domObserver = {} as DOMObserver;
    otpPageDetector = {} as OTPPageDetector;
}


/**
 * Initialize content script
 */
function init(): void {
    // Skip if not an HTML document
    if (!(document instanceof HTMLDocument)) return;

    // Skip tiny frames (likely tracking pixels)
    if (window.innerWidth < 10 && window.innerHeight < 10) return;

    log.debug('Content script initializing...');

    try {
        // Detect forms on page load
        formDetector.detectForms();
        autoFiller.injectIcons();

        // Setup floating button
        floatingButton.init();

        // Start observing DOM changes
        domObserver.start();

        // Initialize OTP page detection for auto-fill
        otpPageDetector.init();

        // Listen for messages from background
        if (chrome?.runtime?.onMessage) {
            chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
                log.debug('Message received', { action: message.action });

                handleMessage(message)
                    .then(sendResponse)
                    .catch((error) => {
                        log.error('Message handling failed', error);
                        sendResponse({ success: false, error: error.message });
                    });

                return true;
            });
        } else {
            log.warn('chrome.runtime.onMessage not available, content script limited');
        }

        log.debug('Content script initialized');
    } catch (error) {
        log.error('Failed to initialize content script', error);
    }
}


/**
 * Handle messages from background/popup
 */
async function handleMessage(message: { action: string; payload?: Record<string, unknown> }): Promise<{ success: boolean; error?: string;[key: string]: unknown }> {
    switch (message.action) {
        case 'DETECT_FORMS': {
            const analysis = formDetector.detectForms();
            return { success: true, ...analysis };
        }

        case 'FILL_FIELD': {
            if (message.payload) {
                const { value, fieldType, selector } = message.payload as { value: string; fieldType?: string; selector?: string };

                if (selector) {
                    autoFiller.fillField(selector, value);
                } else {
                    autoFiller.fillCurrentField(value, fieldType);
                }
            }
            return { success: true };
        }

        case 'FILL_FORM': {
            if (message.payload) {
                const { formSelector, data } = message.payload as { formSelector?: string; data?: Record<string, string> };
                await autoFiller.fillForm(formSelector, data);
            }
            return { success: true };
        }

        case 'FILL_OTP': {
            if (message.payload) {
                const { otp, fieldSelectors } = message.payload as { otp: string; fieldSelectors?: string[] };
                autoFiller.fillOTP(otp, fieldSelectors);
            }
            return { success: true };
        }

        case 'AUTO_FILL_OTP': {
            // Handle automatic OTP fill from background script
            if (message.payload) {
                const { otp } = message.payload as { otp: string; source?: string; confidence?: number };

                const filled = autoFiller.fillOTP(otp);
                if (filled) {
                    // Single subtle success - not spam
                    pageStatus.success(`OTP filled: ${otp}`, 2500);
                    log.info('OTP auto-filled:', otp);
                }
                // Silent on fail - don't embarrass the user or tool
                return { success: filled, filled };
            }
            return { success: false, error: 'No OTP provided' };
        }

        case 'SMART_AUTOFILL':
            pageStatus.show('Filling form...', 'loading');
            await autoFiller.smartFill();
            pageStatus.success('Form filled!', 2500);
            return { success: true };

        case 'HIGHLIGHT_FIELDS': {
            if (message.payload) {
                const { fieldType } = message.payload as { fieldType: string };
                formDetector.highlightFields(fieldType);
            }
            return { success: true };
        }

        case 'SHOW_FLOATING_BUTTON':
            floatingButton.show();
            return { success: true };

        case 'HIDE_FLOATING_BUTTON':
            floatingButton.hide();
            return { success: true };

        default:
            return { success: false, error: 'Unknown action' };
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Export for testing
export { formDetector, fieldAnalyzer, autoFiller, floatingButton, domObserver, otpPageDetector };
