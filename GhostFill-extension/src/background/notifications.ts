// Notifications Handler

import { createLogger } from '../utils/logger';

const log = createLogger('Notifications');

export interface NotificationOptions {
    title: string;
    message: string;
    type?: 'basic' | 'image' | 'list' | 'progress';
    iconUrl?: string;
    priority?: 0 | 1 | 2;
    requireInteraction?: boolean;
    buttons?: Array<{ title: string; iconUrl?: string }>;
    silent?: boolean;
}

/**
 * Show a notification
 */
export function showNotification(
    id: string,
    options: NotificationOptions
): Promise<string> {
    return new Promise((resolve, reject) => {
        try {
            // Chrome notifications require full chrome-extension:// URLs for icons
            const iconUrl = options.iconUrl
                ? chrome.runtime.getURL(options.iconUrl)
                : chrome.runtime.getURL('assets/icons/icon.png');

            chrome.notifications.create(
                id,
                {
                    type: options.type || 'basic',
                    iconUrl: iconUrl,
                    title: options.title,
                    message: options.message,
                    priority: options.priority,
                    requireInteraction: options.requireInteraction,
                    buttons: options.buttons,
                    silent: options.silent,
                },
                (notificationId) => {
                    if (chrome.runtime.lastError) {
                        const errorMsg = chrome.runtime.lastError.message || JSON.stringify(chrome.runtime.lastError);
                        log.error('Failed to show notification', errorMsg);
                        reject(new Error(errorMsg));
                    } else {
                        log.debug('Notification shown', { id: notificationId });
                        resolve(notificationId);
                    }
                }
            );
        } catch (error) {
            log.error('Notification creation threw', error instanceof Error ? error.message : String(error));
            reject(error);
        }
    });
}

/**
 * Clear a notification
 */
export function clearNotification(id: string): Promise<boolean> {
    return new Promise((resolve) => {
        chrome.notifications.clear(id, (wasCleared) => {
            resolve(wasCleared);
        });
    });
}

const recentNotifications = new Map<string, number>();
const DEBOUNCE_WINDOW_MS = 5000;

function isDuplicate(title: string, message: string): boolean {
    const key = `${title}:${message}`;
    const now = Date.now();
    const lastTime = recentNotifications.get(key);

    if (lastTime && (now - lastTime < DEBOUNCE_WINDOW_MS)) {
        return true;
    }

    recentNotifications.set(key, now);
    // Cleanup old entries periodically (could be optimized, but map size is small)
    if (recentNotifications.size > 50) {
        for (const [k, t] of recentNotifications) {
            if (now - t > DEBOUNCE_WINDOW_MS) {
                recentNotifications.delete(k);
            }
        }
    }
    return false;
}

/**
 * Show email received notification
 */
export function notifyNewEmail(from: string, subject: string, hasOTP?: string): Promise<string> {
    const title = hasOTP ? `OTP Received: ${hasOTP}` : 'New Email';
    const message = `From: ${from}\n${subject}`;

    if (isDuplicate(title, message)) {
        log.debug('Suppressing duplicate email notification', { title });
        return Promise.resolve('');
    }

    return showNotification(`email-${Date.now()}`, {
        title,
        message,
        priority: hasOTP ? 2 : 1,
        requireInteraction: !!hasOTP,
        buttons: hasOTP
            ? [{ title: 'Copy OTP' }, { title: 'Dismiss' }]
            : [{ title: 'Open Inbox' }],
    });
}

/**
 * Show success notification
 */
export function notifySuccess(title: string, message: string): Promise<string> {
    if (isDuplicate(title, message)) {
        return Promise.resolve('');
    }
    // Use fixed ID to replace any existing success notification
    return showNotification('ghostfill-success', {
        title,
        message,
        priority: 0,
    });
}

/**
 * Show error notification
 */
export function notifyError(title: string, message: string): Promise<string> {
    // Longer debounce for errors to prevent flood
    if (isDuplicate(title, message)) {
        return Promise.resolve('');
    }
    // Use fixed ID to replace any existing error notification
    return showNotification('ghostfill-error', {
        title,
        message,
        priority: 2,
    });
}

// Handle notification button clicks
chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
    log.debug('Notification button clicked', { notificationId, buttonIndex });

    if (notificationId.startsWith('email-')) {
        if (buttonIndex === 0) {
            // Copy OTP or Open Inbox
            const { otpService } = await import('../services/otpService');
            const lastOTP = await otpService.getLastOTP();

            if (lastOTP) {
                const { clipboardService } = await import('../services/clipboardService');
                await clipboardService.copyOTP(lastOTP.code);
                notifySuccess('Copied', `OTP ${lastOTP.code} copied to clipboard`);
            }
        }
    }

    // Clear notification after action
    clearNotification(notificationId);
});

// Handle notification clicks
chrome.notifications.onClicked.addListener((notificationId) => {
    log.debug('Notification clicked', { notificationId });

    // Open popup
    chrome.action.openPopup();

    // Clear notification
    clearNotification(notificationId);
});
