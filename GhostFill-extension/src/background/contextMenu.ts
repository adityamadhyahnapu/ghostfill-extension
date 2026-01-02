// Context Menu Management

import { createLogger } from '../utils/logger';
import { CONTEXT_MENU_IDS } from '../utils/constants';
import { emailService } from '../services/emailServices';
import { passwordService } from '../services/passwordService';
import { clipboardService } from '../services/clipboardService';
import { otpService } from '../services/otpService';
import { safeSendTabMessage } from '../utils/messaging';

const log = createLogger('ContextMenu');

/**
 * Setup context menu items - FLAT STRUCTURE for fast access
 */
export async function setupContextMenu(): Promise<void> {
    // Remove existing menus first
    await chrome.contextMenus.removeAll();

    // Parent menu
    chrome.contextMenus.create({
        id: CONTEXT_MENU_IDS.PARENT,
        title: '👻 GhostFill',
        contexts: ['all'],
    });

    // ⚡ QUICK ACTIONS (Top-level, no submenus)
    chrome.contextMenus.create({
        id: CONTEXT_MENU_IDS.SMART_AUTOFILL,
        parentId: CONTEXT_MENU_IDS.PARENT,
        title: '✨ Magic Fill (All Fields)',
        contexts: ['editable'],
    });

    chrome.contextMenus.create({
        id: CONTEXT_MENU_IDS.GENERATE_EMAIL_QUICK,
        parentId: CONTEXT_MENU_IDS.PARENT,
        title: '📧 Generate & Fill Email',
        contexts: ['all'],
    });

    chrome.contextMenus.create({
        id: CONTEXT_MENU_IDS.GENERATE_PASSWORD_STANDARD,
        parentId: CONTEXT_MENU_IDS.PARENT,
        title: '🔐 Generate & Fill Password',
        contexts: ['all'],
    });

    // Last OTP (shows when available)
    chrome.contextMenus.create({
        id: CONTEXT_MENU_IDS.LAST_OTP,
        parentId: CONTEXT_MENU_IDS.PARENT,
        title: '🔢 No OTP available',
        contexts: ['all'],
        enabled: false,
    });

    // Separator
    chrome.contextMenus.create({
        id: CONTEXT_MENU_IDS.SEPARATOR_1,
        parentId: CONTEXT_MENU_IDS.PARENT,
        type: 'separator',
        contexts: ['all'],
    });

    // Check inbox
    chrome.contextMenus.create({
        id: CONTEXT_MENU_IDS.CHECK_INBOX,
        parentId: CONTEXT_MENU_IDS.PARENT,
        title: '📥 Refresh Inbox',
        contexts: ['all'],
    });

    // Settings
    chrome.contextMenus.create({
        id: CONTEXT_MENU_IDS.SETTINGS,
        parentId: CONTEXT_MENU_IDS.PARENT,
        title: '⚙️ Settings',
        contexts: ['all'],
    });

    log.debug('Flat context menu setup complete');
}

/**
 * Update OTP menu item
 */
export async function updateOTPMenuItem(): Promise<void> {
    const lastOTP = await otpService.getLastOTP();

    if (lastOTP) {
        chrome.contextMenus.update(CONTEXT_MENU_IDS.LAST_OTP, {
            title: `🔢 Last OTP: ${lastOTP.code} (copy)`,
            enabled: true,
        });
    } else {
        chrome.contextMenus.update(CONTEXT_MENU_IDS.LAST_OTP, {
            title: '🔢 No OTP available',
            enabled: false,
        });
    }
}

/**
 * Handle context menu clicks
 */
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    log.debug('Context menu clicked', { menuItemId: info.menuItemId });

    try {
        switch (info.menuItemId) {
            // Email generation
            case CONTEXT_MENU_IDS.GENERATE_EMAIL_QUICK:
            case CONTEXT_MENU_IDS.GENERATE_EMAIL_1SECMAIL: {
                const email = await emailService.generateEmail({ service: 'tempmail' });
                await clipboardService.copyEmail(email.fullEmail);
                const { notifySuccess } = await import('./notifications');
                notifySuccess('GhostFill: Email Generated', `${email.fullEmail} copied to clipboard!`);

                // Fill field if in editable context
                if (tab?.id && info.editable) {
                    await safeSendTabMessage(tab.id, {
                        action: 'FILL_FIELD',
                        payload: { value: email.fullEmail },
                    });
                }
                break;
            }

            case CONTEXT_MENU_IDS.GENERATE_EMAIL_MAILTM: {
                const mailTmEmail = await emailService.generateEmail({ service: 'mailtm' });
                await clipboardService.copyEmail(mailTmEmail.fullEmail);
                const { notifySuccess } = await import('./notifications');
                notifySuccess('GhostFill: Email Generated', `${mailTmEmail.fullEmail} copied to clipboard!`);
                break;
            }

            // Password generation
            case CONTEXT_MENU_IDS.GENERATE_PASSWORD_STANDARD: {
                const stdPwd = passwordService.generate({ length: 16 });
                await clipboardService.copyPassword(stdPwd.password);
                const { notifySuccess } = await import('./notifications');
                notifySuccess('GhostFill: Password Generated', 'Standard password copied to clipboard!');

                if (tab?.id && info.editable) {
                    await safeSendTabMessage(tab.id, {
                        action: 'FILL_FIELD',
                        payload: { value: stdPwd.password },
                    });
                }
                break;
            }

            case CONTEXT_MENU_IDS.GENERATE_PASSWORD_STRONG: {
                const strongPwd = passwordService.generate({ length: 24 });
                await clipboardService.copyPassword(strongPwd.password);
                const { notifySuccess } = await import('./notifications');
                notifySuccess('GhostFill: Password Generated', 'Strong password copied to clipboard!');
                break;
            }

            case CONTEXT_MENU_IDS.GENERATE_PASSWORD_PIN: {
                const pin = passwordService.generate({
                    length: 6,
                    uppercase: false,
                    lowercase: false,
                    numbers: true,
                    symbols: false,
                });
                await clipboardService.copyPassword(pin.password);
                const { notifySuccess } = await import('./notifications');
                notifySuccess('GhostFill: PIN Generated', 'PIN copied to clipboard!');
                break;
            }

            case CONTEXT_MENU_IDS.GENERATE_PASSWORD_PASSPHRASE: {
                const passphrase = passwordService.generatePassphrase(4);
                await clipboardService.copyPassword(passphrase);
                const { notifySuccess } = await import('./notifications');
                notifySuccess('GhostFill: Passphrase Generated', 'Passphrase copied to clipboard!');
                break;
            }

            // Check inbox
            case CONTEXT_MENU_IDS.CHECK_INBOX: {
                const currentEmail = await emailService.getCurrentEmail();
                const { notifySuccess, notifyError } = await import('./notifications');
                if (currentEmail) {
                    const emails = await emailService.checkInbox(currentEmail);
                    notifySuccess('GhostFill: Inbox Checked', `${emails.length} email(s) found`);
                } else {
                    notifyError('GhostFill: No Email', 'Generate an email first');
                }
                break;
            }

            // Copy last OTP
            case CONTEXT_MENU_IDS.LAST_OTP: {
                const lastOTP = await otpService.getLastOTP();
                if (lastOTP) {
                    await clipboardService.copyOTP(lastOTP.code);
                    const { notifySuccess } = await import('./notifications');
                    notifySuccess('GhostFill: OTP Copied', `${lastOTP.code} copied to clipboard!`);

                    if (tab?.id && info.editable) {
                        await safeSendTabMessage(tab.id, {
                            action: 'FILL_FIELD',
                            payload: { value: lastOTP.code },
                        });
                    }
                }
                break;
            }

            // Auto-fill actions
            case CONTEXT_MENU_IDS.SMART_AUTOFILL:
                if (tab?.id) {
                    await safeSendTabMessage(tab.id, { action: 'SMART_AUTOFILL' });
                }
                break;

            case CONTEXT_MENU_IDS.FILL_EMAIL: {
                const emailToFill = await emailService.getCurrentEmail();
                if (emailToFill && tab?.id) {
                    await safeSendTabMessage(tab.id, {
                        action: 'FILL_FIELD',
                        payload: { value: emailToFill.fullEmail, fieldType: 'email' },
                    });
                }
                break;
            }

            case CONTEXT_MENU_IDS.FILL_PASSWORD: {
                const pwdResult = passwordService.generate();
                if (tab?.id) {
                    await safeSendTabMessage(tab.id, {
                        action: 'FILL_FIELD',
                        payload: { value: pwdResult.password, fieldType: 'password' },
                    });
                }
                break;
            }

            // Navigation
            case CONTEXT_MENU_IDS.HISTORY:
                chrome.tabs.create({ url: chrome.runtime.getURL('options.html?tab=history') });
                break;

            case CONTEXT_MENU_IDS.SETTINGS:
                chrome.runtime.openOptionsPage();
                break;
        }
    } catch (error) {
        log.error('Context menu action failed', error);
        const { notifyError } = await import('./notifications');
        notifyError('Error', 'Action failed. Please try again.');
    }
});
