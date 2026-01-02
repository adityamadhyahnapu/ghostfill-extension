import React from 'react';
import { GHOST_LOGO_BASE64 } from '../assets/logoBase64';

interface GhostLogoProps {
    size?: number;
    className?: string;
}

const GhostLogo: React.FC<GhostLogoProps> = ({ size = 24, className = '' }) => {
    // 3. NUCLEAR OPTION: Base64 Data URI
    // This bypasses all path resolution, build, and public folder issues.
    // The image is embedded directly in the JavaScript bundle.

    return (
        <div
            className={`ghost-logo-container ${className}`}
            style={{
                width: size,
                height: size,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative'
            }}
        >
            <img
                src={GHOST_LOGO_BASE64}
                alt="GhostFill Logo"
                style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    filter: 'drop-shadow(0 8px 20px rgba(99, 102, 241, 0.3)) drop-shadow(0 4px 10px rgba(0, 0, 0, 0.2)) drop-shadow(0 12px 32px rgba(99, 102, 241, 0.2))',
                    borderRadius: '6px'
                }}
            />
        </div>
    );
};

export default GhostLogo;
