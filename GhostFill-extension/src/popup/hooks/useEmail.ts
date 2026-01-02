import { useState, useEffect, useCallback } from 'react';
import { EmailAccount, Email } from '../../types';

export function useEmail() {
    const [email, setEmail] = useState<EmailAccount | null>(null);
    const [inbox, setInbox] = useState<Email[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadCurrentEmail();
    }, []);

    const loadCurrentEmail = async () => {
        try {
            const response = await chrome.runtime.sendMessage({ action: 'GET_CURRENT_EMAIL' });
            if (response?.email) {
                setEmail(response.email);
            }
        } catch (err) {
            setError('Failed to load email');
        }
    };

    const generateEmail = useCallback(async (options?: { service?: string; prefix?: string }) => {
        setLoading(true);
        setError(null);
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'GENERATE_EMAIL',
                payload: options || {},
            });
            if (response?.email) {
                setEmail(response.email);
                setInbox([]);
                return response.email;
            }
            throw new Error(response?.error || 'Failed to generate email');
        } catch (err) {
            setError((err as Error).message);
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    const checkInbox = useCallback(async () => {
        if (!email) return [];
        setLoading(true);
        try {
            const response = await chrome.runtime.sendMessage({ action: 'CHECK_INBOX' });
            if (response?.emails) {
                setInbox(response.emails);
                return response.emails;
            }
            return [];
        } catch (err) {
            setError('Failed to check inbox');
            return [];
        } finally {
            setLoading(false);
        }
    }, [email]);

    const copyEmail = useCallback(async () => {
        if (!email) return false;
        try {
            await navigator.clipboard.writeText(email.fullEmail);
            return true;
        } catch {
            return false;
        }
    }, [email]);

    return {
        email,
        inbox,
        loading,
        error,
        generateEmail,
        checkInbox,
        copyEmail,
        refresh: loadCurrentEmail,
    };
}
