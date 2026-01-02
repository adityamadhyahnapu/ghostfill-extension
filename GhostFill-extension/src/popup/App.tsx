import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence, Transition } from 'framer-motion';
import { ChevronLeft, Settings, Sparkles } from 'lucide-react';
import Hub from './components/Hub';
import Header from './components/Header';
import EmailGenerator from './components/EmailGenerator';
import PasswordGenerator from './components/PasswordGenerator';
import OTPDisplay from './components/OTPDisplay';
import { EmailAccount } from '../types';
import { safeSendMessage } from '../utils/messaging';

const App: React.FC = () => {
    const [view, setView] = useState<'hub' | 'email' | 'password' | 'otp'>('hub');
    const [loading, setLoading] = useState(false);
    const [emailAccount, setEmailAccount] = useState<EmailAccount | null>(null);
    const [toast, setToast] = useState<string | null>(null);
    const [showHelp, setShowHelp] = useState(false);
    const [needsApiKey, setNeedsApiKey] = useState(false);

    // Core layout container - Inherits dimensions from .app in CSS
    const containerStyle: React.CSSProperties = {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: 'transparent',
        position: 'relative',
        overflow: 'hidden',
        minHeight: 0 // Crucial for flex box handling of child scrolling
    };

    const showToast = useCallback((message: string) => {
        setToast(message);
        setTimeout(() => setToast(null), 2500);
    }, []);

    // Initial load
    const fetchIdentity = useCallback(async () => {
        try {
            const res = await safeSendMessage({ action: 'GET_CURRENT_EMAIL' });
            if (res && 'email' in res && res.email && typeof res.email === 'object' && 'fullEmail' in res.email) {
                setEmailAccount(res.email as EmailAccount);
            }
        } catch (e) {
            console.error('Failed to fetch identity:', e);
        }
    }, []);

    const generateIdentity = async () => {
        setLoading(true);
        setEmailAccount(null); // Force clear to show "Generating..." and trigger re-render
        try {
            const res = await safeSendMessage({ action: 'GENERATE_EMAIL' });
            if (res && 'email' in res && res.email && typeof res.email === 'object' && 'fullEmail' in res.email) {
                setEmailAccount(res.email as EmailAccount);
                showToast('New identity generated!');
            }
        } catch (e) {
            showToast('Generation failed');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchIdentity();

        // Check if API key is configured
        const checkApiKey = async () => {
            try {
                const result = await chrome.storage.local.get('settings');
                const hasApiKey = result.settings?.llmApiKey && result.settings.llmApiKey.length > 10;
                setNeedsApiKey(!hasApiKey);
            } catch (e) {
                setNeedsApiKey(true);
            }
        };
        checkApiKey();

        const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
            if (areaName === 'local' && changes.currentEmail) {
                setEmailAccount(changes.currentEmail.newValue || null);
            }
            // Update API key status when settings change
            if (areaName === 'local' && changes.settings) {
                const hasApiKey = changes.settings.newValue?.llmApiKey && changes.settings.newValue.llmApiKey.length > 10;
                setNeedsApiKey(!hasApiKey);
            }
        };

        chrome.storage.onChanged.addListener(handleStorageChange);
        return () => chrome.storage.onChanged.removeListener(handleStorageChange);
    }, [fetchIdentity]);

    const handleCopyEmail = async () => {
        if (!emailAccount) return;
        try {
            await navigator.clipboard.writeText(emailAccount.fullEmail);
            showToast('Email copied!');
        } catch (error) {
            showToast('Copy failed');
        }
    };

    const handleOpenSettings = useCallback(() => {
        if (chrome.runtime.openOptionsPage) {
            chrome.runtime.openOptionsPage();
        } else {
            window.open(chrome.runtime.getURL('options.html'));
        }
    }, []);

    // iOS Spring Transition Config
    const springTransition: Transition = {
        type: "spring",
        stiffness: 260,
        damping: 26,
        mass: 1
    };

    return (
        <div className="app">
            <div style={containerStyle}>
                {/* World-Class Background System */}
                <div className="aurora-background" />
                <div className="noise-overlay" />

                {/* Premium Toasts */}
                <AnimatePresence>
                    {toast && (
                        <motion.div
                            className="ios-toast"
                            initial={{ opacity: 0, y: 50 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20, scale: 0.9 }}
                            transition={springTransition}
                        >
                            {toast}
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* MANDATORY API Key Setup Overlay - Step 1 */}
                <AnimatePresence>
                    {needsApiKey && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.3 }}
                            style={{
                                position: 'absolute',
                                inset: 0,
                                zIndex: 1000,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '24px',
                                background: 'linear-gradient(135deg, rgba(248, 250, 252, 0.98) 0%, rgba(241, 245, 249, 0.98) 100%)',
                                backdropFilter: 'blur(20px)',
                            }}
                        >
                            {/* Logo & Title */}
                            <motion.div
                                initial={{ scale: 0.8, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
                                style={{
                                    width: 72,
                                    height: 72,
                                    borderRadius: '20px',
                                    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    marginBottom: 20,
                                    boxShadow: '0 8px 32px rgba(99, 102, 241, 0.3)',
                                }}
                            >
                                <Sparkles size={36} color="white" />
                            </motion.div>

                            <motion.h1
                                initial={{ y: 20, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                transition={{ delay: 0.2 }}
                                style={{
                                    fontSize: 22,
                                    fontWeight: 700,
                                    color: 'var(--text-primary)',
                                    marginBottom: 8,
                                    textAlign: 'center',
                                }}
                            >
                                Welcome to GhostFill
                            </motion.h1>

                            <motion.p
                                initial={{ y: 20, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                transition={{ delay: 0.3 }}
                                style={{
                                    fontSize: 14,
                                    color: 'var(--text-secondary)',
                                    textAlign: 'center',
                                    marginBottom: 24,
                                    lineHeight: 1.5,
                                }}
                            >
                                One quick step to unlock AI-powered<br />
                                OTP extraction & smart autofill
                            </motion.p>

                            {/* Steps */}
                            <motion.div
                                initial={{ y: 20, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                transition={{ delay: 0.4 }}
                                style={{
                                    width: '100%',
                                    maxWidth: 280,
                                    background: 'rgba(255, 255, 255, 0.8)',
                                    borderRadius: '16px',
                                    padding: '16px',
                                    marginBottom: 20,
                                    border: '1px solid rgba(0, 0, 0, 0.06)',
                                }}
                            >
                                <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                                    <div style={{
                                        width: 24,
                                        height: 24,
                                        borderRadius: '50%',
                                        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                                        color: 'white',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: 12,
                                        fontWeight: 700,
                                        flexShrink: 0,
                                    }}>1</div>
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                                            Get Free API Key
                                        </div>
                                        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                                            Visit <b>console.groq.com</b>
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                                    <div style={{
                                        width: 24,
                                        height: 24,
                                        borderRadius: '50%',
                                        background: 'rgba(99, 102, 241, 0.15)',
                                        color: '#6366f1',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: 12,
                                        fontWeight: 700,
                                        flexShrink: 0,
                                    }}>2</div>
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                                            Create Account & Copy Key
                                        </div>
                                        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                                            100% free, no credit card
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: 12 }}>
                                    <div style={{
                                        width: 24,
                                        height: 24,
                                        borderRadius: '50%',
                                        background: 'rgba(99, 102, 241, 0.15)',
                                        color: '#6366f1',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: 12,
                                        fontWeight: 700,
                                        flexShrink: 0,
                                    }}>3</div>
                                    <div>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                                            Paste in Settings
                                        </div>
                                        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                                            AI → Groq API Key field
                                        </div>
                                    </div>
                                </div>
                            </motion.div>

                            {/* CTA Button */}
                            <motion.button
                                initial={{ y: 20, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                transition={{ delay: 0.5 }}
                                onClick={handleOpenSettings}
                                style={{
                                    width: '100%',
                                    maxWidth: 280,
                                    padding: '14px 24px',
                                    borderRadius: '12px',
                                    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                                    color: 'white',
                                    fontWeight: 600,
                                    fontSize: 15,
                                    border: 'none',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 8,
                                    boxShadow: '0 4px 20px rgba(99, 102, 241, 0.35)',
                                    transition: 'transform 0.2s, box-shadow 0.2s',
                                }}
                                whileHover={{ scale: 1.02, boxShadow: '0 6px 28px rgba(99, 102, 241, 0.45)' }}
                                whileTap={{ scale: 0.98 }}
                            >
                                <Settings size={18} />
                                Open Settings
                            </motion.button>

                            <motion.p
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.6 }}
                                style={{
                                    fontSize: 11,
                                    color: 'var(--text-tertiary)',
                                    marginTop: 16,
                                    textAlign: 'center',
                                }}
                            >
                                Uses Llama 3.1 8B • 560 tokens/sec • Free forever
                            </motion.p>
                        </motion.div>
                    )}
                </AnimatePresence>

                <AnimatePresence mode="popLayout">
                    {view === 'hub' && (
                        <motion.div
                            key="hub-view"
                            layout
                            initial={{ opacity: 0, scale: 0.98, x: -10 }}
                            animate={{ opacity: 1, scale: 1, x: 0 }}
                            exit={{ opacity: 0, scale: 1.02, x: 10 }}
                            transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                flex: 1,
                                minHeight: 0
                            }}
                        >
                            <Header
                                onOpenSettings={handleOpenSettings}
                                onOpenHelp={() => setShowHelp(true)}
                            />
                            <Hub
                                onNavigate={(v) => setView(v)}
                                emailAccount={emailAccount}
                                onGenerate={generateIdentity}
                                syncing={loading}
                                onToast={showToast}
                            />
                        </motion.div>
                    )}
                    {view === 'email' && (
                        <motion.div
                            key="email-view"
                            layout
                            initial={{ opacity: 0, scale: 0.98, x: 10 }}
                            animate={{ opacity: 1, scale: 1, x: 0 }}
                            exit={{ opacity: 0, scale: 1.02, x: -10 }}
                            transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                flex: 1,
                                minHeight: 0
                            }}
                        >
                            <Header
                                onOpenSettings={handleOpenSettings}
                                onOpenHelp={() => setShowHelp(true)}
                            />
                            <div className="ghost-dashboard" style={{ paddingTop: 0 }}>
                                <EmailGenerator
                                    emailAccount={emailAccount}
                                    onGenerate={generateIdentity}
                                    syncing={loading}
                                    onToast={showToast}
                                    variant="inbox"
                                    onBack={() => setView('hub')}
                                />
                            </div>
                        </motion.div>
                    )}
                    {(view === 'password' || view === 'otp') && (
                        <motion.div
                            key="detail-view"
                            layout
                            className="detail-view"
                            initial={{ opacity: 0, scale: 1.02, x: 10 }}
                            animate={{ opacity: 1, scale: 1, x: 0 }}
                            exit={{ opacity: 0, scale: 0.98, x: -10 }}
                            transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                flex: 1,
                                minHeight: 0
                            }}
                        >
                            <div className="header" style={{ padding: '24px 0 12px 0' }}>
                                <div className="header-left" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                    <button className="back-button" onClick={() => setView('hub')} style={{ width: 32, height: 32 }} aria-label="Go back to hub">
                                        <ChevronLeft size={20} className="sf-icon" />
                                    </button>
                                    <span className="header-title" style={{ fontSize: 20 }}>
                                        {view === 'otp' ? 'Passcode Sync' : 'Vault Settings'}
                                    </span>
                                </div>
                            </div>

                            <div className="detail-content-scroll" style={{
                                flex: 1,
                                overflowY: 'auto',
                                minHeight: 0
                            }}>
                                {view === 'password' && <PasswordGenerator onToast={showToast} currentPassword={emailAccount?.password || ''} />}
                                {view === 'otp' && <OTPDisplay onToast={showToast} />}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Help Overlay */}
                {showHelp && (
                    <div className="modal-overlay" onClick={() => setShowHelp(false)} style={{ zIndex: 2000 }}>
                        <motion.div
                            className="glass-card"
                            onClick={(e) => e.stopPropagation()}
                            initial={{ opacity: 0, y: 100 }}
                            animate={{ opacity: 1, y: 0 }}
                            style={{ padding: 30, maxWidth: 320, textAlign: 'center' }}
                        >
                            <h2 style={{ fontSize: 22, marginBottom: 15 }}>GhostFill Help Center</h2>
                            <p style={{ color: 'var(--text-secondary)', marginBottom: 20, lineHeight: 1.5 }}>
                                Redefining privacy with GhostFill's liquid-glass security. Generate identities, secure passwords, and track OTPs in real-time.
                            </p>
                            <button className="ios-button button-primary" style={{ width: '100%' }} onClick={() => setShowHelp(false)}>
                                Dismiss
                            </button>
                        </motion.div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default App;
