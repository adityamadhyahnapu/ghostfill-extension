import { useState, useEffect, useCallback } from 'react';
import { UserSettings, DEFAULT_SETTINGS } from '../../types';

export function useStorage() {
    const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const response = await chrome.runtime.sendMessage({ action: 'GET_SETTINGS' });
            if (response?.settings) {
                setSettings(response.settings);
            }
        } catch {
            // Use defaults
        } finally {
            setLoading(false);
        }
    };

    const updateSettings = useCallback(async (updates: Partial<UserSettings>) => {
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'UPDATE_SETTINGS',
                payload: updates,
            });
            if (response?.settings) {
                setSettings(response.settings);
                return true;
            }
            return false;
        } catch {
            return false;
        }
    }, []);

    const clearAllData = useCallback(async () => {
        try {
            await chrome.storage.local.clear();
            setSettings(DEFAULT_SETTINGS);
            return true;
        } catch {
            return false;
        }
    }, []);

    return {
        settings,
        loading,
        updateSettings,
        clearAllData,
        refresh: loadSettings,
    };
}
