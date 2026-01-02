/**
 * Safe Messaging Utility
 * Handles "Extension context invalidated" errors gracefully
 */

import { createLogger } from './logger';

import { ExtensionMessage, ExtensionResponse } from '../types';

const log = createLogger('Messaging');

/**
 * Send message to background script safely
 */
export async function safeSendMessage(message: ExtensionMessage): Promise<ExtensionResponse | null> {
    try {
        if (!chrome?.runtime?.id) {
            return null;
        }
        return await chrome.runtime.sendMessage(message);
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (
            errorMsg.includes('Extension context invalidated') ||
            errorMsg.includes('Could not establish connection') ||
            errorMsg.includes('Receiving end does not exist')
        ) {
            log.warn(`Background connection lost or not ready (action: ${message.action})`);
            return null;
        }
        throw error;
    }
}

/**
 * Check if a tab URL is a restricted page where content scripts can't run
 */
function isRestrictedUrl(url?: string): boolean {
    if (!url) return true;
    return (
        url.startsWith('chrome://') ||
        url.startsWith('chrome-extension://') ||
        url.startsWith('edge://') ||
        url.startsWith('about:') ||
        url.startsWith('file://') ||
        url.includes('chrome.google.com/webstore') ||
        url.includes('microsoftedge.microsoft.com/addons')
    );
}

/**
 * Send message to a tab safely
 */
export async function safeSendTabMessage(tabId: number, message: ExtensionMessage): Promise<ExtensionResponse | null> {
    try {
        if (!chrome?.runtime?.id) return null;
        return await chrome.tabs.sendMessage(tabId, message);
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (
            errorMsg.includes('Receiving end does not exist') ||
            errorMsg.includes('Could not establish connection') ||
            errorMsg.includes('Internal error: collectSample') ||
            errorMsg.includes('The message port closed before a response was received')
        ) {
            // Only log debug for expected cases on restricted pages
            log.debug(`Content script not available on tab ${tabId} (action: ${message.action})`);
            return null;
        }
        throw error;
    }
}

