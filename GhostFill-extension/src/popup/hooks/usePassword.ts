import { useState, useCallback } from 'react';
import { PasswordOptions, GeneratedPassword, DEFAULT_PASSWORD_OPTIONS } from '../../types';

export function usePassword() {
    const [password, setPassword] = useState<GeneratedPassword | null>(null);
    const [options, setOptions] = useState<PasswordOptions>(DEFAULT_PASSWORD_OPTIONS);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const generate = useCallback(async (customOptions?: Partial<PasswordOptions>) => {
        setLoading(true);
        setError(null);
        try {
            const opts = { ...options, ...customOptions };
            const response = await chrome.runtime.sendMessage({
                action: 'GENERATE_PASSWORD',
                payload: opts,
            });
            if (response?.result) {
                setPassword(response.result);
                return response.result;
            }
            throw new Error(response?.error || 'Failed to generate password');
        } catch (err) {
            setError((err as Error).message);
            return null;
        } finally {
            setLoading(false);
        }
    }, [options]);

    const updateOptions = useCallback((updates: Partial<PasswordOptions>) => {
        setOptions((prev) => ({ ...prev, ...updates }));
    }, []);

    const copyPassword = useCallback(async () => {
        if (!password) return false;
        try {
            await navigator.clipboard.writeText(password.password);
            return true;
        } catch {
            return false;
        }
    }, [password]);

    const saveToHistory = useCallback(async (website: string) => {
        if (!password) return false;
        try {
            await chrome.runtime.sendMessage({
                action: 'SAVE_PASSWORD',
                payload: { password: password.password, website },
            });
            return true;
        } catch {
            return false;
        }
    }, [password]);

    return {
        password,
        options,
        loading,
        error,
        generate,
        updateOptions,
        copyPassword,
        saveToHistory,
    };
}
