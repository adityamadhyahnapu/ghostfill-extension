import React from 'react';
import { Settings, HelpCircle } from 'lucide-react';
import GhostLogo from './GhostLogo';

interface Props {
    onOpenSettings: () => void;
    onOpenHelp: () => void;
}

const Header: React.FC<Props> = ({ onOpenSettings, onOpenHelp }) => {
    return (
        <header className="header">
            <div className="header-left">
                <div className="logo-circle">
                    <GhostLogo size={48} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <span className="header-title">GhostFill</span>
                </div>
            </div>
            <div className="header-actions">
                <button className="icon-button" onClick={onOpenHelp} title="Help Center" aria-label="Open help center">
                    <HelpCircle size={20} strokeWidth={2} />
                </button>
                <button className="icon-button" onClick={onOpenSettings} title="Settings" aria-label="Open settings">
                    <Settings size={18} strokeWidth={2.5} />
                </button>
            </div>
        </header>
    );
};

export default Header;
